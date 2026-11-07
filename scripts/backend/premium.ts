import pg from "pg";
import { assertRuntime, loopback } from "../../server/config.js";
import {
  runPremiumCommand,
  type PremiumCommand,
} from "../../server/modules/entitlements/operator.js";

assertRuntime();
const url = process.env.MIGRATION_DATABASE_URL;
if (!url || !loopback(url) || url === process.env.DATABASE_URL)
  throw new Error(
    "Se requiere el rol de operación local, separado del runtime.",
  );

const [action, id, ...args] = process.argv.slice(2);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const usage =
  "Uso: grant ID VENCIMIENTO_ISO OPERADOR MOTIVO | revoke ID OPERADOR MOTIVO | reconcile ID MICRODÓLARES OPERADOR MOTIVO";
if (!uuid.test(id ?? "")) throw new Error(usage);
let command: PremiumCommand;
if (
  action === "grant" &&
  args.length === 3 &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(args[0])
)
  command = {
    action,
    owner: id,
    expiresAt: new Date(args[0]),
    actor: args[1],
    reason: args[2],
  };
else if (action === "revoke" && args.length === 2)
  command = { action, owner: id, actor: args[0], reason: args[1] };
else if (action === "reconcile" && args.length === 3)
  command = {
    action,
    estimateId: id,
    micros: args[0],
    actor: args[1],
    reason: args[2],
  };
else throw new Error(usage);

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await runPremiumCommand(client, command);
  console.log("Operación local registrada.");
} catch {
  console.error(
    "Operación rechazada. Revisa el estado, los argumentos y el rol local.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
