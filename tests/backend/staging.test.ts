import assert from "node:assert/strict";
import { mkdir, mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildApp } from "../../server/app.js";
import { runtimeConfig } from "../../server/config.js";
import { SupabaseProvider } from "../../server/modules/identity/provider.js";

const project = "abcdefghijklmnopqrst";
const origin = "https://wiseload-staging.onrender.com";
const staging = {
  WISELOAD_ENV: "staging",
  NODE_ENV: "production",
  PUBLIC_APP_ORIGIN: origin,
  RENDER_EXTERNAL_URL: origin,
  SUPABASE_URL: `https://${project}.supabase.co`,
  DATABASE_URL: `postgresql://cw_runtime.${project}:fixture@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`,
  IDENTITY_DATABASE_URL: `postgresql://cw_identity:fixture@db.${project}.supabase.co:5432/postgres?sslmode=verify-full`,
  STAGING_ALLOWED_EMAILS: " Tester@example.test ",
};

test("staging requires an HTTPS origin, the selected Supabase project, and separate roles", () => {
  const config = runtimeConfig(staging);
  assert.ok(config.mode === "staging");
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.oauthCallbackOrigin, origin);
  assert.deepEqual([...config.allowedEmails!], ["tester@example.test"]);
  assert.throws(
    () => runtimeConfig({ NODE_ENV: "production" }),
    /autorización/,
  );
  for (const env of [
    { PUBLIC_APP_ORIGIN: "http://wiseload-staging.onrender.com" },
    { OAUTH_CALLBACK_ORIGIN: "https://other.onrender.com" },
    { STAGING_ALLOWED_EMAILS: "" },
    { DATABASE_URL: staging.IDENTITY_DATABASE_URL },
    { DATABASE_URL: staging.DATABASE_URL.replace("verify-full", "require") },
    {
      DATABASE_URL: staging.DATABASE_URL.replace(
        project,
        "differentprojectxxxx",
      ),
    },
    { ESTIMATES_LOCAL_ENABLED: "true" },
  ])
    assert.throws(() => runtimeConfig({ ...staging, ...env }));
});

test("the connected web build and API use one origin without serving files outside assets", async (t) => {
  const webRoot = await mkdtemp(join(tmpdir(), "wiseload-staging-"));
  await mkdir(join(webRoot, "assets"));
  await writeFile(
    join(webRoot, "index.html"),
    '<script src="/assets/entry.js"></script>',
  );
  await writeFile(join(webRoot, "assets", "entry.js"), "export {};");
  await writeFile(join(webRoot, ".env"), "fake=fixture");
  const app = await buildApp({ webRoot, ready: async () => {} });
  t.after(async () => {
    await app.close();
    for (const file of ["index.html", ".env", "assets/entry.js"])
      await unlink(join(webRoot, file));
    await rmdir(join(webRoot, "assets"));
    await rmdir(webRoot);
  });
  const home = await app.inject("/");
  assert.equal(home.statusCode, 200);
  assert.match(home.body, /assets\/entry\.js/);
  assert.match(
    String(home.headers["content-security-policy"]),
    /frame-ancestors 'none'/,
  );
  assert.equal((await app.inject("/assets/entry.js")).statusCode, 200);
  assert.equal((await app.inject("/api/v1/health/ready")).json().status, "ok");
  for (const path of ["/.env", "/assets/%2e%2e/.env", "/api/v1/missing"])
    assert.equal((await app.inject(path)).statusCode, 404);
});

test("staging accepts only verified identities on the allowlist", async (t) => {
  const provider = new SupabaseProvider(
    staging.SUPABASE_URL,
    "fixture",
    new Set(["tester@example.test"]),
  );
  const user = {
    id: "adfd7d43-e11a-476c-84a2-9b6c7c50baea",
    email: "Tester@example.test",
    email_confirmed_at: "2026-11-08T00:00:00Z" as string | undefined,
  };
  t.mock.method(globalThis, "fetch", async () => Response.json(user));
  assert.equal(await provider.user("fixture"), user.id);
  user.email_confirmed_at = undefined;
  await assert.rejects(provider.user("fixture"), {
    code: "INVALID_AUTH_PROOF",
  });
  user.email_confirmed_at = "2026-11-08T00:00:00Z";
  user.email = "outside@example.test";
  await assert.rejects(provider.user("fixture"), {
    code: "INVALID_AUTH_PROOF",
  });
});
