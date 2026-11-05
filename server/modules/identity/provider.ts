import { createClient, type Session } from "@supabase/supabase-js";
import { decodeJwt } from "jose";
import { DomainError } from "../../errors.js";

export interface IdentityProof {
  userId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  authSessionId: string | null;
}
export interface AuthProvider {
  sendCode(email: string, createUser: boolean): Promise<void>;
  verifyCode(email: string, code: string): Promise<IdentityProof>;
  user(accessToken: string): Promise<string>;
  refresh(refreshToken: string): Promise<IdentityProof>;
  revoke(accessToken: string): Promise<void>;
  googleStart(
    callback: string,
    prompt?: "consent",
  ): Promise<{ url: string; storage: Record<string, string> }>;
  googleExchange(
    code: string,
    storage: Record<string, string>,
  ): Promise<IdentityProof>;
}
const denied = () =>
  new DomainError(
    401,
    "INVALID_AUTH_PROOF",
    "No pudimos verificar el acceso. Solicita un código nuevo si hace falta.",
  );
const unavailable = () =>
  new DomainError(
    503,
    "AUTH_UNAVAILABLE",
    "El proveedor de acceso no está disponible. Tus datos se conservan.",
  );

export class SupabaseProvider implements AuthProvider {
  constructor(
    private url: string,
    private anonKey: string,
  ) {}
  private client(storage?: Record<string, string>) {
    const local = storage ?? {};
    return createClient(this.url, this.anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: !!storage,
        detectSessionInUrl: false,
        flowType: "pkce",
        storage: {
          getItem: (k) => local[k] ?? null,
          setItem: (k, v) => {
            local[k] = v;
          },
          removeItem: (k) => {
            delete local[k];
          },
        },
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    });
  }
  private async proof(session: Session | null): Promise<IdentityProof> {
    if (!session) throw denied();
    const id = await this.user(session.access_token);
    if (session.user.id !== id) throw denied();
    // Claims are read only AFTER provider verification, never used as identity alone.
    const claims = decodeJwt(session.access_token);
    const sessionId =
      typeof claims.session_id === "string" &&
      /^[0-9a-f-]{36}$/i.test(claims.session_id)
        ? claims.session_id
        : null;
    return {
      userId: id,
      displayName: "Estudiante",
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at ?? 0,
      authSessionId: sessionId,
    };
  }
  async sendCode(email: string, createUser: boolean) {
    try {
      const { error } = await this.client().auth.signInWithOtp({
        email,
        options: { shouldCreateUser: createUser },
      });
      if (error && !(error.code === "otp_disabled" && !createUser))
        throw unavailable();
      // Unknown login / existing registration intentionally have the same public result.
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw unavailable();
    }
  }
  async verifyCode(email: string, code: string) {
    try {
      const { data, error } = await this.client().auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (error) throw (error.status ?? 500) >= 500 ? unavailable() : denied();
      return await this.proof(data.session);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw unavailable();
    }
  }
  async user(accessToken: string) {
    try {
      const { data, error } = await this.client().auth.getUser(accessToken);
      if (error) throw (error.status ?? 500) >= 500 ? unavailable() : denied();
      if (!data.user) throw denied();
      return data.user.id;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw unavailable();
    }
  }
  async refresh(refreshToken: string) {
    try {
      const { data, error } = await this.client().auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (error) throw denied();
      return await this.proof(data.session);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw unavailable();
    }
  }
  async revoke(accessToken: string) {
    try {
      const { error } = await this.client().auth.admin.signOut(
        accessToken,
        "local",
      );
      if (error) throw unavailable();
    } catch {
      throw unavailable();
    }
  }
  async googleStart(callback: string, prompt?: "consent") {
    const storage: Record<string, string> = {};
    try {
      const { data, error } = await this.client(storage).auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callback,
          skipBrowserRedirect: true,
          scopes: "openid email profile",
          ...(prompt ? { queryParams: { prompt } } : {}),
        },
      });
      if (error || !data.url) throw unavailable();
      const expected = new URL(this.url);
      const actual = new URL(data.url);
      if (
        actual.origin !== expected.origin ||
        !actual.pathname.endsWith("/auth/v1/authorize")
      )
        throw unavailable();
      return { url: data.url, storage };
    } catch {
      throw unavailable();
    }
  }
  async googleExchange(code: string, storage: Record<string, string>) {
    try {
      const { data, error } = await this.client({
        ...storage,
      }).auth.exchangeCodeForSession(code);
      if (error) throw denied();
      return await this.proof(data.session);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw unavailable();
    }
  }
}
