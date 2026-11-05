import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { assertRuntime } from "../../server/config.js";
assertRuntime();
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("Falta MIGRATION_DATABASE_URL.");
if (url === process.env.DATABASE_URL)
  throw new Error("Migración y runtime requieren credenciales distintas.");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("select pg_advisory_lock(204819, 1)");
  await migrate(drizzle(client), { migrationsFolder: "server/db/migrations" });
  console.log("Migraciones aplicadas; sin credenciales en salida.");
} catch (error) {
  const cause = error as { cause?: { code?: string }; code?: string };
  console.error(
    `Migración fallida; SQLSTATE ${cause.cause?.code ?? cause.code ?? "unknown"}. Revisa permisos/SQL, sin volcar consultas o parámetros.`,
  );
  process.exitCode = 1;
} finally {
  await client.query("select pg_advisory_unlock(204819, 1)");
  await client.end();
}
