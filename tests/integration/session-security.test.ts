import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { database } from "../../server/db/client.js";
import { Academics } from "../../server/modules/academics/service.js";
import {
  Identity,
  OAUTH_COOKIE,
  SESSION_COOKIE,
} from "../../server/modules/identity/service.js";
import type {
  AuthProvider,
  IdentityProof,
} from "../../server/modules/identity/provider.js";
import { SupabaseProvider } from "../../server/modules/identity/provider.js";
import { buildApp } from "../../server/app.js";

class ProviderFixture implements AuthProvider {
  refreshes = 0;
  verifications = 0;
  readonly providerSessionId = randomUUID();
  constructor(
    readonly id: string,
    readonly clock: () => Date,
  ) {}
  proof(): IdentityProof {
    return {
      userId: this.id,
      displayName: "Fixture",
      accessToken: "fixture-access-" + this.id,
      refreshToken: "fixture-refresh-" + this.id,
      expiresAt: Math.floor(this.clock().getTime() / 1000) + 3600,
      authSessionId: this.providerSessionId,
    };
  }
  async sendCode() {
    return;
  }
  async verifyCode() {
    this.verifications++;
    return this.proof();
  }
  async user(token: string) {
    if (token !== "fixture-access-" + this.id)
      throw new Error("Invalid fixture proof");
    return this.id;
  }
  async refresh() {
    this.refreshes++;
    return this.proof();
  }
  async revoke() {
    return;
  }
  async googleStart() {
    return {
      url: "https://provider.invalid/authorize",
      storage: { verifier: "fixture-verifier" },
    };
  }
  async googleExchange(code: string, storage: Record<string, string>) {
    if (code !== "fixture-code" || storage.verifier !== "fixture-verifier")
      throw new Error("Invalid fixture callback");
    return this.proof();
  }
}
test("refresh is serialized, sessions expire, encrypted tokens stay private and OAuth cannot replay", async () => {
  for (const key of [
    "DATABASE_URL",
    "IDENTITY_DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CREDENTIAL_ENCRYPTION_KEY",
  ])
    assert.ok(process.env[key], `Falta ${key}`);
  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await admin.auth.admin.createUser({
    email: `session-${randomUUID()}@fixture.test`,
    email_confirm: true,
  });
  assert.ok(!error && data.user);
  const db = database(process.env.DATABASE_URL!),
    ids = database(process.env.IDENTITY_DATABASE_URL!);
  let clock = new Date();
  const now = () => clock;
  const provider = new ProviderFixture(data.user.id, now);
  const academics = new Academics(db.pool, now);
  const identity = new Identity(
    ids.pool,
    provider,
    academics,
    {
      origin: "http://127.0.0.1:3001",
      encryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY!,
      googleEnabled: true,
    },
    now,
  );
  try {
    const proof = provider.proof();
    proof.expiresAt = Math.floor(now().getTime() / 1000) + 15;
    const issued = await identity.issue(proof);
    const simultaneous = await Promise.all([
      identity.authenticate(issued.cookie),
      identity.authenticate(issued.cookie),
    ]);
    assert.ok(simultaneous.every((x) => x.ownerId === data.user.id));
    assert.equal(provider.refreshes, 1);
    const stored = (
      await ids.pool.query(
        "select tokens_ciphertext from app.client_sessions where id=$1",
        [simultaneous[0].id],
      )
    ).rows[0].tokens_ciphertext as string;
    assert.ok(
      !stored.includes(proof.accessToken) &&
        !stored.includes(proof.refreshToken),
    );
    const start = await identity.googleStart();
    await assert.rejects(
      identity.googleCallback("forged-state", "fixture-code"),
      { status: 401 },
    );
    const google = await identity.googleCallback(start.state, "fixture-code");
    assert.equal(google.user.id, data.user.id);
    await assert.rejects(identity.googleCallback(start.state, "fixture-code"), {
      status: 401,
    });
    assert.equal(
      (await academics.listPeriods(data.user.id, {})).items.length,
      1,
      "second client retains same default period",
    );
    const waiting = await identity.challenge(
      `expiry-${randomUUID()}@fixture.test`,
      "register",
    );
    clock = new Date(clock.getTime() + 600001);
    await assert.rejects(identity.verify(waiting.challengeId, "123456"), {
      status: 401,
    });
    assert.equal(provider.verifications, 0);
    clock = new Date(clock.getTime() + 86400001);
    await assert.rejects(identity.authenticate(issued.cookie), { status: 401 });
    const fresh = await identity.issue(provider.proof());
    clock = new Date(clock.getTime() + 8 * 86400000);
    await assert.rejects(identity.authenticate(fresh.cookie), { status: 401 });
    const app = await buildApp({ identity });
    try {
      const httpStart = await app.inject("/api/v1/auth/google/start");
      assert.equal(httpStart.statusCode, 302);
      const oauthHeader = String(httpStart.headers["set-cookie"]);
      const oauthCookie = oauthHeader.split(";")[0];
      assert.ok(oauthCookie.startsWith(OAUTH_COOKIE + "="));
      const callbackUrl = "/api/v1/auth/google/callback?code=fixture-code";
      const callback = await app.inject({
        url: callbackUrl,
        headers: { cookie: oauthCookie },
      });
      assert.equal(
        callback.statusCode,
        200,
        "success must not redirect to an unserved dashboard",
      );
      assert.equal(callback.headers.location, undefined);
      assert.equal(callback.json().authenticated, true);
      assert.equal(callback.json().user.id, data.user.id);
      assert.ok(
        !callback.body.includes("accessToken") &&
          !callback.body.includes("refreshToken"),
      );
      assert.equal(callback.headers["cache-control"], "no-store");
      const responseCookies = callback.headers["set-cookie"];
      const sessionCookie = (
        Array.isArray(responseCookies)
          ? responseCookies
          : [String(responseCookies)]
      )
        .find((value) => value.startsWith(SESSION_COOKIE + "="))!
        .split(";")[0];
      assert.ok(sessionCookie);
      const session = await app.inject({
        url: "/api/v1/auth/session",
        headers: { cookie: sessionCookie },
      });
      assert.equal(session.statusCode, 200);
      assert.equal(session.json().user.id, data.user.id);
      assert.equal(
        (
          await app.inject({
            url: callbackUrl,
            headers: { cookie: oauthCookie },
          })
        ).statusCode,
        401,
      );
      assert.equal(
        (
          await app.inject({
            url: "/api/v1/auth/session",
            headers: { authorization: "Bearer forged" },
          })
        ).statusCode,
        401,
      );
    } finally {
      await app.close();
    }
  } finally {
    await db.pool.end();
    await ids.pool.end();
  }
});
test("Supabase Google URL requests identity scopes and produces server-side PKCE storage only", async () => {
  const provider = new SupabaseProvider(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );
  const start = await provider.googleStart(
    "http://127.0.0.1:3001/api/v1/auth/google/callback",
  );
  const url = new URL(start.url);
  assert.equal(url.searchParams.get("provider"), "google");
  assert.ok(url.searchParams.has("code_challenge"));
  assert.ok(
    Object.keys(start.storage).some((k) => k.endsWith("code-verifier")),
  );
  assert.ok(!start.url.includes("calendar"));
  assert.ok(!start.url.includes("refresh_token"));
});
