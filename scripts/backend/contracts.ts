import { writeFile } from "node:fs/promises";
import { buildApp } from "../../server/app.js";
const app = await buildApp();
await app.ready();
await writeFile(
  "packages/contracts/openapi.json",
  JSON.stringify(app.swagger(), null, 2) + "\n",
);
await app.close();
