import { Worker } from "node:worker_threads";
import { DomainError } from "../../errors.js";
import {
  CALCULATION_TIMEOUT_MS,
  type Result,
  type Snapshot,
} from "../../../packages/planning-core/model.js";

let running = 0;

export async function calculatePlan(
  snapshot: Snapshot,
  timeout = CALCULATION_TIMEOUT_MS,
): Promise<Result> {
  if (running >= 2)
    throw new DomainError(
      429,
      "PLANNING_BUSY",
      "Hay cálculos en curso. Reintenta en unos segundos.",
    );
  running++;
  try {
    const worker = new Worker(
      new URL(
        import.meta.url.endsWith(".ts")
          ? "./calculate-worker.ts"
          : "./calculate-worker.js",
        import.meta.url,
      ),
      {
        workerData: snapshot,
        execArgv: [],
        env: {},
        resourceLimits: { maxOldGenerationSizeMb: 192 },
      },
    );
    try {
      return await new Promise<Result>((resolve, reject) => {
        const failure = () =>
          new DomainError(
            503,
            "PLANNING_CALCULATION_FAILED",
            "No pudimos calcular la distribución. El plan vigente se conserva.",
          );
        const timer = setTimeout(
          () =>
            reject(
              new DomainError(
                503,
                "PLANNING_TIMEOUT",
                "El cálculo superó 20 segundos. El plan vigente se conserva.",
              ),
            ),
          timeout,
        );
        worker.once("message", (result: Result) => {
          clearTimeout(timer);
          resolve(result);
        });
        worker.once("error", () => {
          clearTimeout(timer);
          reject(failure());
        });
        worker.once("exit", () => {
          clearTimeout(timer);
          reject(failure());
        });
      });
    } finally {
      await worker.terminate();
    }
  } finally {
    running--;
  }
}
