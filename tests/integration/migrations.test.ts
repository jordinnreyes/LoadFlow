import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loopback } from "../../server/config.js";
import journal from "../../server/db/migrations/meta/_journal.json" with { type: "json" };

test("reviewed Drizzle SQL migrates from empty PostgreSQL and is repeatable", async () => {
  assert.ok(
    process.env.MIGRATION_DATABASE_URL &&
      loopback(process.env.MIGRATION_DATABASE_URL),
  );
  const name = `cw_f1_migrations_${randomBytes(8).toString("hex")}`;
  assert.match(name, /^cw_f1_migrations_[0-9a-f]{16}$/);
  const admin = (database: string, sql: string) =>
    execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_cargawise-f0",
        "psql",
        "-U",
        "supabase_admin",
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  // Dedicated disposable database only. The auth table is a FK schema fixture;
  // real provider behavior is exercised separately against the running Auth API.
  admin("postgres", `CREATE DATABASE ${name} OWNER cw_migrator`);
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  url.pathname = "/" + name;
  const client = new pg.Client({ connectionString: url.toString() });
  try {
    admin(
      name,
      "CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); GRANT USAGE ON SCHEMA auth TO cw_migrator; GRANT REFERENCES ON auth.users TO cw_migrator;",
    );
    await client.connect();
    await migrate(drizzle(client), {
      migrationsFolder: "server/db/migrations",
    });
    assert.equal(
      (
        await client.query(
          "select count(*)::int as n from drizzle.__drizzle_migrations",
        )
      ).rows[0].n,
      journal.entries.length,
    );
    const tables = (
      await client.query(
        "select tablename, rowsecurity from pg_tables where schemaname='app' and tablename in ('activities','progress_revisions','users')",
      )
    ).rows;
    assert.equal(tables.length, 3);
    assert.ok(tables.every((t) => t.rowsecurity));
    await migrate(drizzle(client), {
      migrationsFolder: "server/db/migrations",
    });
    assert.equal(
      (
        await client.query(
          "select count(*)::int as n from drizzle.__drizzle_migrations",
        )
      ).rows[0].n,
      journal.entries.length,
    );
  } finally {
    await client.end();
    // Name is generated and validated above; never drop postgres or the project DB.
    admin("postgres", `DROP DATABASE ${name}`);
  }
});
