import { randomUUID } from "node:crypto";
import type pg from "pg";
import { DomainError } from "../../errors.js";
import type { Academics } from "../academics/service.js";
import type { AuthProvider, IdentityProof } from "./provider.js";
import { Secrets, opaque, hash } from "./crypto.js";
export const SESSION_COOKIE = "__Host-cw_session";
export const OAUTH_COOKIE = "__Host-cw_oauth";
const denied = () =>
  new DomainError(
    401,
    "SESSION_REQUIRED",
    "Inicia sesión para acceder a tus datos.",
  );
export interface SessionContext {
  ownerId: string;
  csrfToken: string;
  id: string;
}
interface SessionRow {
  id: string;
  owner_id: string;
  auth_session_id: string | null;
  tokens_ciphertext: string;
  expires_at: Date;
  last_seen_at: Date;
  revoked_at: Date | null;
}
export class Identity {
  readonly secrets: Secrets;
  constructor(
    readonly pool: pg.Pool,
    readonly provider: AuthProvider,
    readonly academics: Academics,
    readonly config: {
      origin: string;
      encryptionKey: string;
      googleEnabled: boolean;
    },
    readonly now: () => Date = () => new Date(),
  ) {
    this.secrets = new Secrets(config.encryptionKey);
  }
  origin(value: string | undefined) {
    if (value !== this.config.origin)
      throw new DomainError(
        403,
        "ORIGIN_NOT_ALLOWED",
        "La solicitud no proviene de una interfaz permitida.",
      );
  }
  csrf(cookie: string | undefined, value: string | undefined) {
    if (!cookie || !this.secrets.validCsrf(cookie, value))
      throw new DomainError(
        403,
        "CSRF_REQUIRED",
        "Actualiza la sesión antes de guardar.",
      );
  }
  async challenge(email: string, intent: "register" | "login") {
    const normalized = email.trim().toLowerCase();
    const lookup = this.secrets.fingerprint(normalized);
    const client = await this.pool.connect();
    const now = this.now();
    let challengeId: string;
    try {
      await client.query("begin");
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1,1))",
        [lookup],
      );
      const previous = (
        await client.query<{ id: string; created_at: Date }>(
          "select id,created_at from app.auth_challenges where email_hash=$1 order by created_at desc limit 1",
          [lookup],
        )
      ).rows[0];
      if (
        previous &&
        now.getTime() - new Date(previous.created_at).getTime() < 60000
      )
        throw new DomainError(
          429,
          "RESEND_COOLDOWN",
          "Espera 60 segundos antes de pedir otro código.",
        );
      challengeId = randomUUID();
      await client.query(
        "insert into app.auth_challenges(id,email_hash,email_ciphertext,purpose,expires_at,created_at) values($1,$2,$3,$4,$5,$6)",
        [
          challengeId,
          lookup,
          this.secrets.encrypt(normalized),
          intent,
          new Date(now.getTime() + 600000),
          now,
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    try {
      await this.provider.sendCode(normalized, intent === "register");
    } catch (error) {
      await this.pool.query(
        "update app.auth_challenges set consumed_at=$2 where id=$1",
        [challengeId, now],
      );
      throw error;
    }
    return {
      challengeId,
      expiresAt: new Date(now.getTime() + 600000).toISOString(),
      message:
        "Si el correo permite esta solicitud, recibirás un código de acceso.",
    };
  }
  async verify(challengeId: string, code: string) {
    const client = await this.pool.connect();
    let proof: IdentityProof | undefined;
    let rejected: unknown;
    try {
      await client.query("begin");
      const row = (
        await client.query<{
          email_ciphertext: string;
          expires_at: Date;
          attempt_count: number;
          consumed_at: Date | null;
        }>(
          "select email_ciphertext,expires_at,attempt_count,consumed_at from app.auth_challenges where id=$1 for update",
          [challengeId],
        )
      ).rows[0];
      if (
        !row ||
        row.consumed_at ||
        new Date(row.expires_at) <= this.now() ||
        row.attempt_count >= 5
      )
        throw new DomainError(
          401,
          "INVALID_AUTH_PROOF",
          "El código no es válido o caducó. Solicita otro.",
        );
      await client.query(
        "update app.auth_challenges set attempt_count=attempt_count+1 where id=$1",
        [challengeId],
      );
      try {
        proof = await this.provider.verifyCode(
          this.secrets.decrypt<string>(row.email_ciphertext),
          code,
        );
      } catch (error) {
        rejected = error;
      }
      if (proof)
        await client.query(
          "update app.auth_challenges set consumed_at=$2 where id=$1",
          [challengeId, this.now()],
        );
      // A failed attempt is committed too, preventing unlimited retries through rollback.
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    if (rejected) throw rejected;
    if (!proof) throw denied();
    return this.issue(proof);
  }
  async issue(proof: IdentityProof) {
    if (
      !/^[0-9a-f-]{36}$/i.test(proof.userId) ||
      proof.expiresAt * 1000 <= this.now().getTime()
    )
      throw denied();
    if ((await this.provider.user(proof.accessToken)) !== proof.userId)
      throw denied();
    await this.academics.ensureUser(proof.userId, proof.displayName);
    const cookie = opaque(),
      id = randomUUID();
    const expires = new Date(this.now().getTime() + 7 * 86400000);
    await this.pool.query(
      "insert into app.client_sessions(id,owner_id,auth_session_id,opaque_hash,tokens_ciphertext,expires_at,last_seen_at,created_at) values($1,$2,$3,$4,$5,$6,$7,$7)",
      [
        id,
        proof.userId,
        proof.authSessionId,
        hash(cookie),
        this.secrets.encrypt(proof),
        expires,
        this.now(),
      ],
    );
    return {
      cookie,
      expiresAt: expires.toISOString(),
      csrfToken: this.secrets.csrf(cookie),
      user: await this.academics.profile(proof.userId),
    };
  }
  async authenticate(cookie: string | undefined): Promise<SessionContext> {
    if (!cookie || !/^[A-Za-z0-9_-]{43}$/.test(cookie)) throw denied();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const row = (
        await client.query<SessionRow>(
          "select * from app.client_sessions where opaque_hash=$1 for update",
          [hash(cookie)],
        )
      ).rows[0];
      if (
        !row ||
        row.revoked_at ||
        new Date(row.expires_at) <= this.now() ||
        this.now().getTime() - new Date(row.last_seen_at).getTime() >= 86400000
      )
        throw denied();
      let proof = this.secrets.decrypt<IdentityProof>(row.tokens_ciphertext);
      if (proof.expiresAt * 1000 <= this.now().getTime() + 30000)
        proof = await this.provider.refresh(proof.refreshToken);
      const owner = await this.provider.user(proof.accessToken);
      if (
        owner !== row.owner_id ||
        proof.userId !== row.owner_id ||
        (row.auth_session_id !== null &&
          proof.authSessionId !== row.auth_session_id)
      )
        throw denied();
      await client.query(
        "update app.client_sessions set tokens_ciphertext=$2,last_seen_at=$3 where id=$1",
        [row.id, this.secrets.encrypt(proof), this.now()],
      );
      await client.query("commit");
      return {
        ownerId: row.owner_id,
        id: row.id,
        csrfToken: this.secrets.csrf(cookie),
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async logout(cookie: string) {
    const row = (
      await this.pool.query<{ tokens_ciphertext: string }>(
        "update app.client_sessions set revoked_at=$2 where opaque_hash=$1 and revoked_at is null returning tokens_ciphertext",
        [hash(cookie), this.now()],
      )
    ).rows[0];
    if (row) {
      const proof = this.secrets.decrypt<IdentityProof>(row.tokens_ciphertext);
      try {
        await this.provider.revoke(proof.accessToken);
      } catch {
        /* Local revocation is already authoritative; do not resurrect this cookie. */
      }
    }
  }
  async googleStart(prompt?: "consent") {
    if (!this.config.googleEnabled)
      throw new DomainError(
        503,
        "GOOGLE_NOT_CONFIGURED",
        "Google Sign-In requiere configuración OAuth de pruebas; el correo sigue disponible.",
      );
    const { url, storage } = await this.provider.googleStart(
      `${this.config.origin}/api/v1/auth/google/callback`,
      prompt,
    );
    const state = opaque();
    await this.pool.query(
      "insert into app.oauth_transactions(id,state_hash,verifier_ciphertext,expires_at) values($1,$2,$3,$4)",
      [
        randomUUID(),
        hash(state),
        this.secrets.encrypt(storage),
        new Date(this.now().getTime() + 600000),
      ],
    );
    return { url, state };
  }
  async googleCallback(state: string | undefined, code: string | undefined) {
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) throw denied();
    const row = (
      await this.pool.query<{ verifier_ciphertext: string }>(
        "update app.oauth_transactions set consumed_at=$2 where state_hash=$1 and consumed_at is null and expires_at>$2 returning verifier_ciphertext",
        [hash(state), this.now()],
      )
    ).rows[0];
    // A provider denial consumes its transaction too, without issuing a session.
    if (!row || !code) throw denied();
    return this.issue(
      await this.provider.googleExchange(
        code,
        this.secrets.decrypt<Record<string, string>>(row.verifier_ciphertext),
      ),
    );
  }
}
