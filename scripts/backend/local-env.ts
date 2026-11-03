import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { assertRuntime, loopback } from "../../server/config.js";
assertRuntime();
if (existsSync(".env"))
  throw new Error(
    ".env ya existe; no se sobrescribe. Conserva tus valores y sigue README.",
  );
const output = execFileSync(
  process.execPath,
  ["node_modules/supabase/dist/supabase.js", "status", "--output", "json"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
const status = JSON.parse(output.slice(output.indexOf("{")));
if (
  !status.DB_URL ||
  !loopback(status.DB_URL) ||
  !status.API_URL ||
  !loopback(status.API_URL)
)
  throw new Error("Solo se permite configurar Supabase local en loopback.");
const admin = new pg.Client({ connectionString: status.DB_URL });
const roles = ["cw_migrator", "cw_runtime", "cw_identity"] as const;
const passwords = new Map(
  roles.map((role) => [role, randomBytes(24).toString("hex")]),
);
await admin.connect();
try {
  for (const role of roles) {
    const found = await admin.query("select 1 from pg_roles where rolname=$1", [
      role,
    ]);
    if (found.rowCount)
      throw new Error(
        "El rol local ya existe; no se reemplaza su contraseña. Restaura .env o revisa README.",
      );
  }
  await admin.query("begin");
  for (const role of roles)
    await admin.query(
      `create role ${role} login password '${passwords.get(role)}' nosuperuser nobypassrls nocreatedb nocreaterole`,
    );
  // PostgreSQL 16+ does not automatically grant SET on a role created with CREATEROLE.
  await admin.query("grant cw_migrator to current_user with set true");
  await admin.query("grant create on database postgres to cw_migrator");
  await admin.query(
    "create schema if not exists app authorization cw_migrator",
  );
  await admin.query(
    "revoke all on schema app from public, anon, authenticated",
  );
  await admin.query("grant usage on schema app to cw_runtime, cw_identity");
  await admin.query("grant usage on schema auth to cw_migrator");
  await admin.query("grant references on auth.users to cw_migrator");
  await admin.query("commit");
} catch (error) {
  await admin.query("rollback");
  throw error;
} finally {
  await admin.end();
}
const urlFor = (role: (typeof roles)[number]) => {
  const url = new URL(status.DB_URL);
  url.username = role;
  url.password = passwords.get(role)!;
  return url.toString();
};
const values = {
  PUBLIC_APP_ORIGIN: "http://127.0.0.1:3001",
  PORT: "3001",
  DATABASE_URL: urlFor("cw_runtime"),
  MIGRATION_DATABASE_URL: urlFor("cw_migrator"),
  IDENTITY_DATABASE_URL: urlFor("cw_identity"),
  SUPABASE_URL: status.API_URL,
  SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
};
writeFileSync(
  ".env",
  "# Generated for local CargaWise only; DO NOT COMMIT.\n" +
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") +
    "\n",
  { flag: "wx", mode: 0o600 },
);
console.log(
  "Roles locales separados y .env creado. Valores secretos omitidos.",
);
