import { buildApp } from "./app.js";
import { runtimeConfig, loopback } from "./config.js";
import { database, assertApplicationRoles } from "./db/client.js";
import { SupabaseProvider } from "./modules/identity/provider.js";
import { Identity } from "./modules/identity/service.js";
import { Academics } from "./modules/academics/service.js";
import { CalendarService } from "./modules/calendar/service.js";
import { GoogleCalendarProvider } from "./modules/calendar/provider.js";
import { CalendarWorker } from "./modules/jobs/calendar-worker.js";
import { PlanningService } from "./modules/planning/service.js";
import { PlanningWorker } from "./modules/jobs/planning-worker.js";
import { localImports } from "./modules/imports/local.js";
import { localEstimates } from "./modules/estimates/local.js";
const config = runtimeConfig();
const staging = config.mode === "staging" ? config : undefined;
if (!config.databaseUrl)
  throw new Error("Falta DATABASE_URL. Consulta .env.example y README.");
const db = database(config.databaseUrl);
const required = [
  "IDENTITY_DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "CREDENTIAL_ENCRYPTION_KEY",
] as const;
for (const name of required)
  if (!process.env[name])
    throw new Error(`Falta ${name}; consulta configuración local.`);
if (
  !staging &&
  (!loopback(config.databaseUrl) ||
    !loopback(process.env.IDENTITY_DATABASE_URL!) ||
    !loopback(process.env.SUPABASE_URL!))
)
  throw new Error(
    "F0/F1 se ejecuta solo con la infraestructura local autorizada.",
  );
const identityDb = database(
  staging?.identityDatabaseUrl ?? process.env.IDENTITY_DATABASE_URL!,
);
await assertApplicationRoles(db.pool, identityDb.pool);
const academics = new Academics(db.pool);
const identity = new Identity(
  identityDb.pool,
  new SupabaseProvider(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    staging?.allowedEmails,
  ),
  academics,
  {
    origin: config.origin,
    googleCallbackOrigin: config.oauthCallbackOrigin,
    encryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY!,
    googleEnabled: process.env.GOOGLE_AUTH_ENABLED === "true",
    allowedEmails: staging?.allowedEmails,
  },
);
const calendar = new CalendarService(
  identity,
  process.env.CALENDAR_CLIENT_ID && process.env.CALENDAR_CLIENT_SECRET
    ? new GoogleCalendarProvider({
        clientId: process.env.CALENDAR_CLIENT_ID,
        clientSecret: process.env.CALENDAR_CLIENT_SECRET,
        callback: new URL(
          "/api/v1/calendar/callback",
          config.oauthCallbackOrigin,
        ).toString(),
      })
    : undefined,
);
const worker = new CalendarWorker(calendar);
const planning = new PlanningService(identity, calendar);
const planningWorker = new PlanningWorker(planning);
if (!staging && !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY para importación local.");
const imports = staging
  ? undefined
  : await localImports(
      identity,
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
const app = await buildApp({
  logger: true,
  identity,
  calendar,
  planning,
  imports: imports?.service,
  estimates: staging
    ? undefined
    : localEstimates(academics, process.env.CREDENTIAL_ENCRYPTION_KEY!),
  webRoot: staging ? "dist" : undefined,
  ready: async () => {
    await db.pool.query("select 1");
  },
});
let stopWorker: () => Promise<void> = async () => {};
let stopPlanning: () => Promise<void> = async () => {};
let stopImports: () => Promise<void> = async () => {};
app.addHook("onClose", async () => {
  await Promise.allSettled([stopWorker(), stopPlanning(), stopImports()]);
  await db.pool.end();
  await identityDb.pool.end();
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void app.close();
  });
await app.listen({ port: config.port, host: config.host });
stopWorker = worker.start(() =>
  app.log.error(
    { code: "CALENDAR_WORKER_FAILED" },
    "Calendar queue could not advance",
  ),
);
stopPlanning = planningWorker.start(() =>
  app.log.error(
    { code: "PLANNING_WORKER_FAILED" },
    "Planning queue could not advance",
  ),
);
if (imports)
  stopImports = imports.worker.start(() =>
    app.log.error(
      { code: "IMPORT_WORKER_FAILED" },
      "Import queue could not advance",
    ),
  );
