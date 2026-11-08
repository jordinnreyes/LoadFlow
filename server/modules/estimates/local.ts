import { createHmac } from "node:crypto";
import type { Academics } from "../academics/service.js";
import { OpenAIResponses } from "./provider.js";
import { Estimates, type EstimatePolicy } from "./service.js";

export function developmentEstimatePolicy(
  fingerprintKey: Buffer,
): EstimatePolicy {
  return {
    environment: "development",
    model: "gpt-6-luna",
    tariffVersion: "openai-luna-standard-ceiling-2026-11-07",
    fingerprintKey,
    maxInputTokens: 1_050_000,
    maxOutputTokens: 768,
    maxMinutes: 1_440,
    timeoutMs: 25_000,
    concurrency: 1,
    inputMicrosPerMillion: 500_000n,
    outputMicrosPerMillion: 1_000_000n,
    userBudgetMicros: 1_000_000n,
    globalBudgetMicros: 1_000_000n,
  };
}

export function localEstimates(academics: Academics, credentialKey: string) {
  if (process.env.ESTIMATES_LOCAL_ENABLED !== "true") return undefined;
  const key = process.env.OPENAI_API_KEY;
  if (!key)
    throw new Error(
      "Falta OPENAI_API_KEY para estimaciones locales habilitadas.",
    );
  const fingerprintKey = createHmac("sha256", Buffer.from(credentialKey, "hex"))
    .update("cargawise-estimate-fingerprint-v1")
    .digest();
  return new Estimates(academics, new OpenAIResponses(key), {
    ...developmentEstimatePolicy(fingerprintKey),
    personalization: true,
  });
}
