import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database, ownerTransaction } from "../../server/db/client.js";
import { buildApp } from "../../server/app.js";
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL requerida: integración real no se omite silenciosamente.",
  );
test("real PostgreSQL uses restricted runtime and clears transaction-local owner", async () => {
  const db = database(process.env.DATABASE_URL!);
  try {
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
