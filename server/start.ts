import { buildApp } from "./app.js";
import { runtimeConfig } from "./config.js";
import { database } from "./db/client.js";
const config = runtimeConfig();
if (!config.databaseUrl)
  throw new Error("Falta DATABASE_URL. Consulta .env.example y README.");
const db = database(config.databaseUrl);
const app = await buildApp({
  logger: true,
  ready: async () => {
    await db.pool.query("select 1");
  },
});
app.addHook("onClose", async () => {
  await db.pool.end();
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void app.close();
  });
await app.listen({ port: config.port, host: config.host });
