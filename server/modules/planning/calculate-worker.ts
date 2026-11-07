import { parentPort, workerData } from "node:worker_threads";
import type { Snapshot } from "../../../packages/planning-core/model.js";
import { plan } from "../../../packages/planning-core/plan.ts";

parentPort!.postMessage(plan(workerData as Snapshot));
