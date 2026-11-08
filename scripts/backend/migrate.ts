import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  assertRuntime,
  loopback,
  stagingDatabaseUrl,
  stagingProject,
} from "../../server/config.js";
assertRuntime();
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("Falta MIGRATION_DATABASE_URL.");
if (url === process.env.DATABASE_URL)
  throw new Error("Migración y runtime requieren credenciales distintas.");
const staging = process.env.WISELOAD_ENV === "staging";
if (!staging && !loopback(url))
  throw new Error(
    "Selecciona staging explícitamente para migrar en Supabase gestionado.",
  );
const connectionString = staging
  ? stagingDatabaseUrl(
      url,
      stagingProject(process.env.SUPABASE_URL),
      "postgres",
    )
  : url;
const client = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 5000,
});
let locked = false;
try {
  await client.connect();
  await client.query("select pg_advisory_lock(204819, 1)");
  locked = true;
  await migrate(drizzle(client), { migrationsFolder: "server/db/migrations" });
  console.log("Migraciones aplicadas; sin credenciales en salida.");
} catch (error) {
  const cause = error as { cause?: { code?: string }; code?: string };
  console.error(
    `Migración fallida; SQLSTATE ${cause.cause?.code ?? cause.code ?? "unknown"}. Revisa permisos/SQL, sin volcar consultas o parámetros.`,
  );
  process.exitCode = 1;
} finally {
  if (locked) await client.query("select pg_advisory_unlock(204819, 1)");
  await client.end();
}
