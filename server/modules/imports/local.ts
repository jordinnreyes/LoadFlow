import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Identity } from "../identity/service.js";
import { ImportWorker } from "../jobs/import-worker.js";
import { isolatedExtract, parserImage } from "./runner.js";
import { ImportService } from "./service.js";
import { privateImportStorage } from "./storage.js";

export async function localImports(
  identity: Identity,
  url: string,
  key: string,
  queueName = "imports",
) {
  // Never pull an image or silently run an unisolated parser at startup.
  try {
    await promisify(execFile)("docker", ["image", "inspect", parserImage], {
      timeout: 8000,
      windowsHide: true,
    });
  } catch {
    throw new Error(
      "Importación local: falta Docker o la imagen aislada documentada en docs/F3-DEVELOPMENT.md.",
    );
  }
  const service = new ImportService(
    identity,
    await privateImportStorage(url, key),
    queueName,
  );
  return { service, worker: new ImportWorker(service, isolatedExtract) };
}
