import { execFileSync } from "node:child_process";
import { loopback, assertRuntime } from "../../server/config.js";
assertRuntime();
if (!process.env.SUPABASE_URL || !loopback(process.env.SUPABASE_URL))
  throw new Error("Solo bootstrap local, nunca proyectos remotos.");
execFileSync(
  "docker",
  [
    "exec",
    "supabase_db_cargawise-f0",
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "GRANT USAGE ON SCHEMA auth TO cw_migrator; GRANT REFERENCES ON auth.users TO cw_migrator;",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
console.log(
  "Permisos mínimos de FK Auth concedidos al migrador local; runtime sin acceso a auth.",
);
