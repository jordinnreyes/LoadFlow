import { randomBytes } from "node:crypto";
import pg from "pg";
import { sql } from "drizzle-orm";
import { assertRuntime, loopback } from "../../server/config.js";
import { runPremiumCommand } from "../../server/modules/entitlements/operator.js";
import { consentVersion } from "../../server/modules/entitlements/service.js";
import { OpenAIResponses } from "../../server/modules/estimates/provider.js";
import {
  Estimates,
  type EstimatePolicy,
} from "../../server/modules/estimates/service.js";
import { estimateCorpus } from "../../tests/fixtures/estimates/corpus.js";
import { fixture } from "../../tests/integration/fixture.js";

assertRuntime();
const command = process.argv[2];
const capMicros = 1000000n;
const policy: EstimatePolicy = {
  environment: "development",
  model: "gpt-6-luna",
  tariffVersion: "openai-luna-standard-ceiling-2026-11-07",
  fingerprintKey: randomBytes(32),
  maxInputTokens: 1050000,
  maxOutputTokens: 768,
  maxMinutes: 1440,
  timeoutMs: 25000,
  concurrency: 1,
  inputMicrosPerMillion: 500000n,
  outputMicrosPerMillion: 1000000n,
  userBudgetMicros: capMicros,
  globalBudgetMicros: capMicros,
};

if (command === "--preview") {
  console.log(
    JSON.stringify({
      model: policy.model,
      corpus: estimateCorpus.map((c) => c.id),
      capUsd: "1.00",
      maximumReservationPerCallUsd: "0.525768",
    }),
  );
} else if (command === "--run-approved") {
  try {
    await run();
  } catch {
    console.error(
      "Evaluación interrumpida. Revisa el entorno local y el registro de consumo antes de decidir si corresponde otra solicitud.",
    );
    process.exitCode = 1;
  }
} else {
  console.error(
    "Usa --preview para revisar la prueba o --run-approved después de aprobarla.",
  );
  process.exitCode = 1;
}

async function run() {
  const key = process.env.OPENAI_API_KEY;
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  if (
    !key ||
    !migrationUrl ||
    process.env.DATABASE_URL === migrationUrl ||
    [
      migrationUrl,
      process.env.DATABASE_URL,
      process.env.IDENTITY_DATABASE_URL,
      process.env.SUPABASE_URL,
    ].some((url) => !url || !loopback(url))
  ) {
    throw new Error("Configuración inválida.");
  }
  const now = new Date();
  const f = await fixture(
    now,
    undefined,
    undefined,
    (academics) => new Estimates(academics, new OpenAIResponses(key), policy),
  );
  const operator = new pg.Client({ connectionString: migrationUrl });
  const audit = {
    actor: "evaluacion-sintetica-f5",
    reason: "F5-04 corpus sintético",
  };
  let grantedOwner: string | undefined;
  try {
    await operator.connect();
    const user = await f.client();
    await runPremiumCommand(
      operator,
      {
        action: "grant",
        owner: user.owner,
        expiresAt: new Date(now.getTime() + 3600000),
        ...audit,
      },
      now,
    );
    grantedOwner = user.owner;
    const consent = await f.request(
      user,
      "PUT",
      "/api/v1/me/estimate-consent",
      { policyVersion: consentVersion, granted: true },
      '"consent-0"',
    );
    const period = await f.request(user, "POST", "/api/v1/periods", {
      name: "Evaluación sintética F5",
    });
    if (consent.statusCode !== 200 || period.statusCode !== 201)
      throw new Error("Fixture no disponible.");
    for (const item of estimateCorpus) {
      const activity = await f.request(user, "POST", "/api/v1/activities", {
        periodId: period.json().id,
        type: item.activityType,
        title: "Caso sintético " + item.id,
        dueDate: now.toISOString().slice(0, 10),
      });
      if (activity.statusCode !== 201)
        throw new Error("Actividad sintética inválida.");
      const started = performance.now();
      const response = await f.request(
        user,
        "POST",
        "/api/v1/activities/" + activity.json().id + "/estimates",
        { excerpt: item.excerpt },
        activity.headers.etag as string,
      );
      const dto = response.json();
      if (response.statusCode !== 202) {
        console.log(
          JSON.stringify({
            case: item.id,
            state: "blocked",
            code: dto.error?.code,
          }),
        );
        throw new Error("Solicitud bloqueada.");
      }
      const ledger = await f.academics.read(user.owner, async (ctx) => {
        const { rows } = await ctx.db.execute(sql`
          select input_tokens,output_tokens,reserved_micros,actual_micros from app.estimate_usage where id=${dto.id}
        `);
        return rows[0];
      });
      console.log(
        JSON.stringify({
          case: item.id,
          expected: item.expected,
          estimateId: dto.id,
          state: dto.state,
          status: dto.suggestion?.status,
          lowMinutes: dto.suggestion?.lowMinutes,
          highMinutes: dto.suggestion?.highMinutes,
          code: dto.errorCode,
          durationMs: Math.round(performance.now() - started),
          ledger,
        }),
      );
      if (dto.state !== "complete")
        throw new Error("Caso sin resultado evaluable.");
      if (dto.suggestion?.status !== item.expected) process.exitCode = 1;
    }
  } finally {
    try {
      if (grantedOwner)
        await runPremiumCommand(operator, {
          action: "revoke",
          owner: grantedOwner,
          ...audit,
        });
    } finally {
      await operator.end();
      await f.close();
    }
  }
}
