import pg from "pg";
import {
  assertRuntime,
  managedDatabaseUrl,
  managedProject,
} from "../../server/config.js";

assertRuntime();
const mode = process.env.WISELOAD_ENV;
if (mode !== "staging" && mode !== "production")
  throw new Error("Selecciona el entorno explícitamente para crear sus roles.");
const project = managedProject(process.env, mode);
const connectionString = managedDatabaseUrl(
  process.env.MIGRATION_DATABASE_URL,
  project,
  "postgres",
);
const roles = [
  ["cw_runtime", process.env.DATABASE_URL],
  ["cw_identity", process.env.IDENTITY_DATABASE_URL],
] as const;
const passwords = roles.map(([role, url]) => {
  const password = new URL(managedDatabaseUrl(url, project, role)).password;
  if (!/^[a-f0-9]{48}$/.test(password))
    throw new Error(`Genera 24 bytes aleatorios en hexadecimal para ${role}.`);
  return password;
});
if (passwords[0] === passwords[1])
  throw new Error("Los roles necesitan contraseñas distintas.");

const admin = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 5000,
});
try {
  await admin.connect();
  await admin.query("begin");
  await admin.query("select pg_advisory_xact_lock(204819, 1)");
  const {
    rows: [access],
  } = await admin.query<{ can_reference: boolean }>(`
    select has_schema_privilege(current_user, 'auth', 'USAGE') and
           has_column_privilege(current_user, 'auth.users', 'id', 'REFERENCES') as can_reference
  `);
  if (!access?.can_reference) throw new Error("AUTH_FK_PRIVILEGE_MISSING");
  // Existing migrations name this role in forced-RLS policies for queue claims.
  await admin.query("create role cw_migrator nologin nosuperuser nobypassrls nocreatedb nocreaterole");
  await admin.query("grant cw_migrator to current_user with inherit true, set true");
  for (const [index, [role]] of roles.entries()) {
    await admin.query(
      `create role ${role} login password '${passwords[index]}' nosuperuser nobypassrls nocreatedb nocreaterole`,
    );
  }
  await admin.query("commit");
  console.log(
    "Roles restringidos creados. Continúa con la migración.",
  );
} catch (error) {
  const code =
    (error as { code?: string }).code ??
    (error instanceof Error && error.message === "AUTH_FK_PRIVILEGE_MISSING"
      ? "AUTH_FK_PRIVILEGE_MISSING"
      : "UNKNOWN");
  console.error(
    `Bootstrap fallido. Código ${code}. No se muestran credenciales.`,
  );
  process.exitCode = 1;
} finally {
  await admin.end();
}
