import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  assertRuntime,
  managedDatabaseUrl,
  managedProject,
} from "../../server/config.js";

// Children precede parents. Deleting all rows for one owner also handles self references.
const ownerTables = [
  "activity_sources",
  "effort_confirmations",
  "estimate_usage",
  "estimate_consents",
  "premium_grants",
  "progress_revisions",
  "progress_current",
  "academic_date_revisions",
  "date_change_proposals",
  "fixed_evaluations",
  "activity_dependencies",
  "group_equivalences",
  "group_reservation_settings",
  "sessions",
  "planning_jobs",
  "planning_proposals",
  "plan_versions",
  "external_busy_intervals",
  "busy_snapshots",
  "calendar_sources",
  "calendar_connections",
  "calendar_credentials",
  "calendar_oauth_transactions",
  "import_candidates",
  "imports",
  "documents",
  "jobs",
  "planning_input_changes",
  "planning_preferences",
  "availability_exceptions",
  "manual_coverage",
  "manual_commitments",
  "study_windows",
  "activities",
  "priority_rules",
  "courses",
  "academic_periods",
  "idempotency_records",
  "client_sessions",
  "users",
] as const;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function removeAccount(
  client: pg.Client,
  owner: string,
  apply: boolean,
) {
  if (!uuid.test(owner)) throw new Error("Identificador de cuenta inválido.");
  await client.query("begin");
  try {
    const {
      rows: [access],
    } = await client.query<{ allowed: boolean }>(
      "select current_user='postgres' and rolbypassrls as allowed from pg_roles where rolname=current_user",
    );
    if (!access?.allowed)
      throw new Error("Se requiere el administrador de la base aislada.");
    const { rows: tables } = await client.query<{ table_name: string }>(`
      select c.table_name from information_schema.columns c
      join information_schema.tables t using(table_schema,table_name)
      where c.table_schema='app' and c.column_name='owner_id' and t.table_type='BASE TABLE'
    `);
    const expected = new Set<string>(ownerTables);
    if (
      tables.length !== expected.size ||
      tables.some(({ table_name }) => !expected.has(table_name))
    )
      throw new Error(
        "Cambió el inventario de datos de cuenta. Revisa el procedimiento antes de borrar.",
      );
    const auth = await client.query(
      "select id from auth.users where id=$1 for update",
      [owner],
    );
    const {
      rows: [state],
    } = await client.query<{ calendar: boolean; documents: boolean }>(
      `
      select exists(select 1 from app.calendar_credentials where owner_id=$1) as calendar,
             exists(select 1 from app.documents where owner_id=$1) as documents
    `,
      [owner],
    );
    if (state.calendar || state.documents)
      throw new Error(
        "Verifica la revocación de Calendar y el tratamiento de documentos antes de borrar.",
      );
    if (apply) {
      for (const table of ownerTables)
        await client.query(`delete from app.${table} where owner_id=$1`, [
          owner,
        ]);
      await client.query("delete from auth.users where id=$1", [owner]);
    }
    await client.query(apply ? "commit" : "rollback");
    return { accountExisted: auth.rowCount === 1 };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main() {
  assertRuntime();
  const [owner, action, repeatedOwner, ...rest] = process.argv.slice(2);
  const apply =
    action === "--apply" && repeatedOwner === owner && rest.length === 0;
  if (!uuid.test(owner ?? "") || (action && !apply))
    throw new Error("Uso: account-removal.ts ID [--apply ID].");
  if (process.env.WISELOAD_ENV !== "production")
    throw new Error(
      "El operador debe seleccionar el proyecto de producción explícito.",
    );
  const project = managedProject(process.env, "production");
  const connectionString = managedDatabaseUrl(
    process.env.MIGRATION_DATABASE_URL,
    project,
    "postgres",
  );
  if (apply && process.env.ACCOUNT_REMOVAL_MAINTENANCE !== "true")
    throw new Error(
      "Suspende el servicio de producción y confirma ACCOUNT_REMOVAL_MAINTENANCE=true.",
    );
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const result = await removeAccount(client, owner, apply);
    console.log(apply ? "Borrado aplicado." : "Revisión sin cambios.", result);
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    await main();
  } catch (error) {
    const code = (error as { code?: string }).code;
    // PostgreSQL diagnostics can include details or statements. Only report a SQLSTATE.
    console.error(
      code
        ? `Borrado detenido. Código ${code}.`
        : error instanceof Error
          ? error.message
          : "Borrado detenido.",
    );
    process.exitCode = 1;
  }
}
