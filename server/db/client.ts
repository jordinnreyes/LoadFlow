import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const unavailableCodes = new Set([
  "57P01",
  "57P02",
  "57P03",
  "53300",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
]);

export function databaseUnavailable(error: unknown) {
  for (let depth = 0; depth < 5 && error instanceof Error; depth++) {
    const code = "code" in error ? error.code : undefined;
    if (
      typeof code === "string" &&
      (unavailableCodes.has(code) || /^08[0-9A-Z]{3}$/.test(code))
    )
      return true;
    error = error.cause;
  }
  return false;
}
export async function assertApplicationRoles(
  runtime: pg.Pool,
  identity: pg.Pool,
) {
  for (const pool of [runtime, identity]) {
    const role = (
      await pool.query<{
        rolsuper: boolean;
        rolbypassrls: boolean;
        can_create: boolean;
      }>(
        "select rolsuper,rolbypassrls,has_schema_privilege(current_user,'app','CREATE') as can_create from pg_roles where rolname=current_user",
      )
    ).rows[0];
    if (!role || role.rolsuper || role.rolbypassrls || role.can_create)
      throw new Error(
        "La API requiere roles restringidos, distintos del migrador/administrador.",
      );
  }
  const privateAccess = (
    await runtime.query<{ allowed: boolean }>(
      "select has_table_privilege(current_user,'app.client_sessions','SELECT') as allowed",
    )
  ).rows[0];
  if (privateAccess.allowed)
    throw new Error(
      "El rol de negocio no debe resolver sesiones ni credenciales.",
    );
  const businessAccess = (
    await identity.query<{ allowed: boolean }>(
      "select has_table_privilege(current_user,'app.activities','SELECT') as allowed",
    )
  ).rows[0];
  if (businessAccess.allowed)
    throw new Error("El resolver de identidad no debe leer las actividades.");
}
export function database(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  return { pool, orm: drizzle(pool) };
}
export async function ownerTransaction<T>(
  pool: pg.Pool,
  ownerId: string,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [ownerId]);
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
