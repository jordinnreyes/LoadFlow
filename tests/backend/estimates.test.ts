import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIResponses } from "../../server/modules/estimates/provider.js";
import {
  prepareExcerpt,
  validateSuggestion,
} from "../../server/modules/estimates/prompt.js";
import { estimateCorpus } from "../fixtures/estimates/corpus.js";

test("Responses adapter separates untrusted data, disables stored responses and interprets usage and refusals", async () => {
  const { excerpt, activityType } = estimateCorpus[3];
  let calls = 0;
  const adapter = new OpenAIResponses("synthetic-key", async (url, options) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options?.redirect, "error");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.max_output_tokens, 300);
    assert.deepEqual(body.tools, []);
    assert.ok(!body.instructions.includes(excerpt));
    assert.deepEqual(JSON.parse(body.input[0].content), {
      excerpt,
      activityType,
    });
    return Response.json(
      {
        model: "synthetic-model",
        status: "completed",
        usage: { input_tokens: 25, output_tokens: 10 },
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "refusal" }],
          },
        ],
      },
      { headers: { "x-request-id": "fixture-request" } },
    );
  });
  assert.deepEqual(
    await adapter.estimate(
      { excerpt, activityType },
      {
        model: "synthetic-model",
        maxOutputTokens: 300,
        signal: new AbortController().signal,
      },
    ),
    {
      kind: "settled",
      requestId: "fixture-request",
      usage: { input: 25, output: 10 },
      errorCode: "PROVIDER_REFUSED",
    },
  );
  assert.equal(calls, 1);
});

test("semantic validation rejects fabricated evidence, inverted ranges and obvious private context", () => {
  const { excerpt } = estimateCorpus[0];
  const estimated = {
    status: "estimated",
    lowMinutes: 40,
    highMinutes: 80,
    factors: [{ kind: "deliverables", evidence: "un archivo SQL" }],
    missingContext: [],
  };
  assert.deepEqual(validateSuggestion(estimated, excerpt, 120), {
    status: "estimated",
    lowMinutes: 40,
    highMinutes: 80,
    factors: ["deliverables"],
    missingContext: [],
  });
  assert.equal(
    validateSuggestion({ ...estimated, highMinutes: 20 }, excerpt, 120),
    null,
  );
  assert.equal(
    validateSuggestion(
      {
        ...estimated,
        factors: [{ kind: "deliverables", evidence: "una presentación" }],
      },
      excerpt,
      120,
    ),
    null,
  );
  assert.equal(
    validateSuggestion({ ...estimated, status: "needs_context" }, excerpt, 120),
    null,
  );
  assert.throws(() => prepareExcerpt("Contacta a ejemplo@example.test"), {
    code: "ESTIMATE_CONTEXT_PRIVATE",
  });
  assert.equal(
    prepareExcerpt("<b>Entrega</b> un informe."),
    "Entrega un informe.",
  );
});
