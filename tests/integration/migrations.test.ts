import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
    // Exercise data adoption with forced RLS and a non-bypass migrator, rather
    // than accepting a no-op UPDATE on an empty database as sufficient evidence.
    const owner = randomUUID(),
      period = randomUUID(),
      document = randomUUID(),
      imported = randomUUID(),
      activity = randomUUID();
    admin(
      name,
      `INSERT INTO auth.users(id) VALUES('${owner}');
      INSERT INTO app.users(id,owner_id,display_name) VALUES('${owner}','${owner}','Synthetic migration');
      INSERT INTO app.academic_periods(id,owner_id,name) VALUES('${period}','${owner}','Synthetic period');
      INSERT INTO app.activities(id,owner_id,period_id,title,type,due_date,operating_minutes)
        VALUES('${activity}','${owner}','${period}','Preserved activity','Tarea','2030-03-21',60);
      INSERT INTO app.documents(id,owner_id,period_id,format,filename,size_bytes,sha256,object_state,created_at,object_expires_at)
        VALUES('${document}','${owner}','${period}','pdf','old.pdf',20,repeat('a',64),'stored','2030-01-01','2030-01-02');
      INSERT INTO app.imports(id,owner_id,period_id,document_id,queue_name,status,extractor_version,review_expires_at)
        VALUES('${imported}','${owner}','${period}','${document}','synthetic','review','structural-1','2030-01-08');`,
    );
    await client.query("begin");
    await client.query(
      readFileSync("server/db/migrations/0009_temporary_originals.sql", "utf8"),
    );
    await client.query("commit");
    const adopted = (
      await client.query(
        "select object_state,filename,object_expires_at-created_at as lifetime,sha256 from app.documents where id=$1",
        [document],
      )
    ).rows[0];
    assert.equal(adopted.object_state, "delete_pending");
    assert.equal(adopted.filename, null);
    assert.equal(adopted.lifetime.minutes, 2);
    assert.equal(adopted.sha256, "a".repeat(64));
    assert.equal(
      (
        await client.query(
          "select review_expires_at from app.imports where id=$1",
          [imported],
        )
      ).rows[0].review_expires_at,
      null,
    );
    assert.equal(
      (
        await client.query(
          "select count(*)::int as n from pg_policies where schemaname='app' and policyname='temporary_original_migration'",
        )
      ).rows[0].n,
      0,
    );
    await client.query("select set_config('app.user_id',$1,false)", [owner]);
    assert.equal(
      (
        await client.query(
          "select operating_minutes from app.activities where id=$1",
          [activity],
        )
      ).rows[0].operating_minutes,
      60,
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
