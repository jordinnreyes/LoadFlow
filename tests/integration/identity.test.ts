import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { database } from "../../server/db/client.js";
import { Academics } from "../../server/modules/academics/service.js";
import {
  Identity,
  SESSION_COOKIE,
} from "../../server/modules/identity/service.js";
import { SupabaseProvider } from "../../server/modules/identity/provider.js";
import { buildApp } from "../../server/app.js";
import { Secrets, hash } from "../../server/modules/identity/crypto.js";
import type { IdentityProof } from "../../server/modules/identity/provider.js";
import { mailCode } from "./mailpit.js";

const origin = "http://127.0.0.1:3001";
for (const key of [
  "DATABASE_URL",
  "IDENTITY_DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CREDENTIAL_ENCRYPTION_KEY",
])
  if (!process.env[key])
    throw new Error(`Falta ${key}: identidad requiere la pila local real.`);

test("existing account logs in through real OTP without repeating onboarding or losing courses", async () => {
  const db = database(process.env.DATABASE_URL!),
    ids = database(process.env.IDENTITY_DATABASE_URL!);
  const academics = new Academics(db.pool);
  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const email = `returning-${randomUUID()}@fixture.test`;
  const fixture = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  assert.ok(!fixture.error && fixture.data.user);
  const owner = fixture.data.user.id;
  const identity = new Identity(
    ids.pool,
    new SupabaseProvider(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    ),
    academics,
    {
      origin,
      encryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY!,
      googleEnabled: false,
    },
  );
  const app = await buildApp({ identity });
  try {
    await academics.ensureUser(owner);
    await academics.patchProfile(owner, "fixture-profile", '"profile-1"', {
      displayName: "Cuenta de pruebas",
      onboardingState: "seen",
      studyTimezone: "America/Lima",
    });
    const period = (await academics.listPeriods(owner, {})).items[0];
    await academics.saveCourse(
      owner,
      "fixture-course",
      { name: "Física ficticia" },
      period.id,
    );
    const challenge = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/challenges",
      headers: { origin },
      payload: { email, intent: "login" },
    });
    assert.equal(challenge.statusCode, 202);
    const verified = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      headers: { origin },
      payload: {
        challengeId: challenge.json().challengeId,
        code: await mailCode(email),
      },
    });
    assert.equal(verified.statusCode, 200);
    assert.equal(verified.json().user.id, owner);
    assert.equal(verified.json().user.onboardingState, "seen");
    assert.equal(verified.json().user.displayName, "Cuenta de pruebas");
    const cookie = String(verified.headers["set-cookie"]).split(";")[0];
    const courses = await app.inject({
      url: `/api/v1/periods/${period.id}/courses`,
      headers: { cookie },
    });
    assert.equal(courses.statusCode, 200);
    assert.equal(courses.json().items[0].name, "Física ficticia");
    assert.equal((await academics.listPeriods(owner, {})).items.length, 1);
  } finally {
    await app.close();
    await db.pool.end();
    await ids.pool.end();
  }
});
test("real Supabase OTP registers privately, rejects replay and logout revokes BFF", async () => {
  const db = database(process.env.DATABASE_URL!),
    ids = database(process.env.IDENTITY_DATABASE_URL!);
  const academics = new Academics(db.pool);
  const identity = new Identity(
    ids.pool,
    new SupabaseProvider(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    ),
    academics,
    {
      origin,
      encryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY!,
      googleEnabled: false,
    },
  );
  const app = await buildApp({ identity });
  try {
    const email = `otp-${randomUUID()}@fixture.test`;
    const challenge = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/challenges",
      headers: { origin },
      payload: { email, intent: "register" },
    });
    assert.equal(
      challenge.statusCode,
      202,
      "registro solicita código con respuesta genérica",
    );
    const code = await mailCode(email);
    const verify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      headers: { origin },
      payload: { challengeId: challenge.json().challengeId, code },
    });
    assert.equal(verify.statusCode, 200, "OTP real crea sesión y perfil");
    const cookieHeader = verify.headers["set-cookie"];
    assert.ok(typeof cookieHeader === "string");
    assert.ok(
      cookieHeader.includes("HttpOnly") &&
        cookieHeader.includes("Secure") &&
        cookieHeader.includes("SameSite=Lax"),
    );
    const cookie = cookieHeader.split(";")[0];
    assert.ok(cookie.startsWith(SESSION_COOKIE + "="));
    assert.ok(
      !verify.body.includes("accessToken") &&
        !verify.body.includes("refreshToken"),
    );
    assert.equal(
      verify.json().user.studyTimezone,
      null,
      "no inventa zona confirmada",
    );
    const account = verify.json().user.id;
    assert.equal((await academics.listPeriods(account, {})).items.length, 1);
    const current = await app.inject({
      url: "/api/v1/auth/session",
      headers: { cookie },
    });
    assert.equal(current.statusCode, 200);
    assert.equal(current.json().user.id, account);
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      headers: { origin },
      payload: { challengeId: challenge.json().challengeId, code },
    });
    assert.equal(replay.statusCode, 401);
    const resend = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/challenges",
      headers: { origin },
      payload: { email, intent: "register" },
    });
    assert.equal(resend.statusCode, 429);
    const badOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/challenges",
      headers: { origin: "https://foreign.invalid" },
      payload: { email, intent: "register" },
    });
    assert.equal(badOrigin.statusCode, 403);
    const withoutCsrf = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { origin, cookie },
      payload: {},
    });
    assert.equal(withoutCsrf.statusCode, 403);
    const privateRow = (
      await ids.pool.query<{ tokens_ciphertext: string }>(
        "select tokens_ciphertext from app.client_sessions where opaque_hash=$1",
        [hash(cookie.slice(cookie.indexOf("=") + 1))],
      )
    ).rows[0];
    const proof = new Secrets(
      process.env.CREDENTIAL_ENCRYPTION_KEY!,
    ).decrypt<IdentityProof>(privateRow.tokens_ciphertext);
    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { origin, cookie, "x-csrf-token": current.json().csrfToken },
      payload: {},
    });
    assert.equal(logout.statusCode, 204);
    await assert.rejects(
      new SupabaseProvider(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
      ).refresh(proof.refreshToken),
      { status: 401 },
    );
    assert.equal(
      (await app.inject({ url: "/api/v1/auth/session", headers: { cookie } }))
        .statusCode,
      401,
    );
    assert.equal((await app.inject("/api/v1/auth/session")).statusCode, 401);
    assert.equal(
      (await app.inject("/api/v1/auth/google/start")).statusCode,
      503,
      "Google real no se finge configurado",
    );
  } finally {
    await app.close();
    await db.pool.end();
    await ids.pool.end();
  }
});
test("login intent cannot create a missing account and five wrong attempts exhaust only that challenge", async () => {
  const db = database(process.env.DATABASE_URL!),
    ids = database(process.env.IDENTITY_DATABASE_URL!);
  const identity = new Identity(
    ids.pool,
    new SupabaseProvider(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    ),
    new Academics(db.pool),
    {
      origin,
      encryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY!,
      googleEnabled: false,
    },
  );
  const app = await buildApp({ identity });
  try {
    const unknown = `missing-${randomUUID()}@fixture.test`;
    const requested = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/challenges",
      headers: { origin },
      payload: { email: unknown, intent: "login" },
    });
    assert.equal(requested.statusCode, 202);
    const admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const accounts = await admin.auth.admin.listUsers({ perPage: 1000 });
    assert.ok(!accounts.error);
    assert.ok(
      !accounts.data.users.some((u) => u.email === unknown),
      "login no registra una identidad nueva",
    );
    const email = `attempts-${randomUUID()}@fixture.test`;
    const requested2 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/challenges",
      headers: { origin },
      payload: { email, intent: "register" },
    });
    assert.equal(requested2.statusCode, 202);
    const correct = await mailCode(email);
    const wrong = ((Number(correct[0]) + 1) % 10) + correct.slice(1);
    for (let i = 0; i < 5; i++) {
      const result = await app.inject({
        method: "POST",
        url: "/api/v1/auth/email/verify",
        headers: { origin },
        payload: { challengeId: requested2.json().challengeId, code: wrong },
      });
      assert.equal(result.statusCode, 401);
    }
    const exhausted = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      headers: { origin },
      payload: { challengeId: requested2.json().challengeId, code: correct },
    });
    assert.equal(
      exhausted.statusCode,
      401,
      "no acepta el sexto intento aunque el código sea correcto",
    );
  } finally {
    await app.close();
    await db.pool.end();
    await ids.pool.end();
  }
});
