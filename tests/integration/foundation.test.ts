import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  database,
  ownerTransaction,
  assertApplicationRoles,
} from "../../server/db/client.js";
import { buildApp } from "../../server/app.js";
import { loopback } from "../../server/config.js";
import { privateImportStorage } from "../../server/modules/imports/storage.js";
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL requerida: integración real no se omite silenciosamente.",
  );
test("real PostgreSQL uses restricted runtime and clears transaction-local owner", async () => {
  const db = database(process.env.DATABASE_URL!);
  const identity = database(process.env.IDENTITY_DATABASE_URL!);
  try {
    await assertApplicationRoles(db.pool, identity.pool);
    await assert.rejects(assertApplicationRoles(identity.pool, db.pool));
    const role = (
      await db.pool.query(
        "select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole from pg_roles where rolname=current_user",
      )
    ).rows[0];
    assert.deepEqual(role, {
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
    const owner = randomUUID();
    const value = await ownerTransaction(
      db.pool,
      owner,
      async (c) =>
        (await c.query("select current_setting('app.user_id',true) as owner"))
          .rows[0].owner,
    );
    assert.equal(value, owner);
    assert.ok(
      !(
        await db.pool.query(
          "select current_setting('app.user_id',true) as owner",
        )
      ).rows[0].owner,
    );
    await assert.rejects(
      db.pool.query("create table app.unauthorized (id int)"),
      { code: "42501" },
    );
    const app = await buildApp({
      ready: async () => {
        await db.pool.query("select 1");
      },
    });
    try {
      assert.equal((await app.inject("/api/v1/health/ready")).statusCode, 200);
    } finally {
      await app.close();
    }
  } finally {
    await db.pool.end();
    await identity.pool.end();
  }
});
test("local Supabase Auth and Storage endpoints are reachable without a cloud account", async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  assert.ok(
    url && key,
    "Configura Supabase local antes de ejecutar integración",
  );
  assert.ok(
    ["127.0.0.1", "localhost"].includes(new URL(url).hostname),
    "Este test no usa proveedores remotos",
  );
  const auth = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(auth.status, 200);
  const storage = await fetch(`${url}/storage/v1/bucket`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5000),
  });
  // No private objects/buckets are readable with this anonymous identity.
  assert.ok([200, 401, 403].includes(storage.status));
  if (storage.status === 200) assert.deepEqual(await storage.json(), []);
});

test("F7 prevents direct client access to private Storage objects and the academic schema", async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && loopback(url) && key && serviceKey);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, serviceKey, options);
  const anonymous = createClient(url, key, options);
  const authenticated = createClient(url, key, options);
  const storage = await privateImportStorage(url, serviceKey);
  const db = database(process.env.DATABASE_URL!);
  const object = randomUUID();
  const marker = Buffer.from("synthetic private document");
  let userId: string | undefined;
  try {
    const credentials = {
      email: `f7-storage-${randomUUID()}@fixture.test`,
      password: randomUUID(),
    };
    const created = await admin.auth.admin.createUser({
      ...credentials,
      email_confirm: true,
    });
    assert.ok(!created.error && created.data.user);
    userId = created.data.user.id;
    const login = await authenticated.auth.signInWithPassword(credentials);
    assert.ok(!login.error && login.data.session);
    await storage.put(object, marker);
    for (const [client, bearer] of [
      [anonymous, key],
      [authenticated, login.data.session.access_token],
    ] as const) {
      const bucket = client.storage.from("cargawise-imports-f3");
      assert.ok((await bucket.download(object)).error);
      assert.ok((await bucket.createSignedUrl(object, 60)).error);
      assert.ok(
        (
          await bucket.upload(object, "overwrite", {
            contentType: "application/octet-stream",
            upsert: true,
          })
        ).error,
      );
      const listed = await bucket.list("", { search: object });
      assert.ok(listed.error || listed.data?.length === 0);
      await bucket.remove([object]);
      assert.deepEqual(await storage.get(object), marker);
      const rest = await fetch(`${url}/rest/v1/activities?select=id&limit=1`, {
        headers: {
          apikey: key,
          authorization: `Bearer ${bearer}`,
          "accept-profile": "app",
        },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      assert.ok([401, 403, 404, 406].includes(rest.status));
    }
    const critical = [
      "activities",
      "calendar_credentials",
      "busy_snapshots",
      "documents",
      "imports",
      "import_candidates",
      "activity_sources",
      "sessions",
      "estimate_usage",
    ];
    const guards = await db.pool.query<{
      name: string;
      forced: boolean;
      direct: boolean;
    }>(
      `
      select c.relname as name, c.relrowsecurity and c.relforcerowsecurity as forced,
        exists (select from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role')
          and (has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE')
            or has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE'))) as direct
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='app' and c.relname=any($1::text[])
    `,
      [critical],
    );
    assert.equal(guards.rows.length, critical.length);
    for (const table of guards.rows) {
      assert.equal(table.forced, true, table.name);
      assert.equal(table.direct, false, table.name);
    }
  } finally {
    try {
      await storage.remove(object);
      if (userId)
        assert.equal((await admin.auth.admin.deleteUser(userId)).error, null);
    } finally {
      await db.pool.end();
    }
  }
});
