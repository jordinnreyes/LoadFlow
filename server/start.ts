import { buildApp } from "./app.js";
import { runtimeConfig, loopback } from "./config.js";
import { database, assertApplicationRoles } from "./db/client.js";
import { SupabaseProvider } from "./modules/identity/provider.js";
import { Identity } from "./modules/identity/service.js";
import { Academics } from "./modules/academics/service.js";
const config = runtimeConfig();
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
  !loopback(config.databaseUrl) ||
  !loopback(process.env.IDENTITY_DATABASE_URL!) ||
  !loopback(process.env.SUPABASE_URL!)
)
  throw new Error(
    "F0/F1 se ejecuta solo con la infraestructura local autorizada.",
  );
const identityDb = database(process.env.IDENTITY_DATABASE_URL!);
await assertApplicationRoles(db.pool, identityDb.pool);
const academics = new Academics(db.pool);
const identity = new Identity(
  identityDb.pool,
  new SupabaseProvider(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  ),
  academics,
  {
    origin: config.origin,
    encryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY!,
    googleEnabled: process.env.GOOGLE_AUTH_ENABLED === "true",
  },
);
const app = await buildApp({
  logger: true,
  identity,
  ready: async () => {
    await db.pool.query("select 1");
  },
});
app.addHook("onClose", async () => {
  await db.pool.end();
  await identityDb.pool.end();
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void app.close();
  });
await app.listen({ port: config.port, host: config.host });
