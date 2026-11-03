import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../server/app.js";
import { Type } from "@sinclair/typebox";
test("health, readiness failure and not found use safe contracts", async () => {
  const app = await buildApp();
  try {
    assert.deepEqual((await app.inject("/api/v1/health/live")).json(), {
      status: "ok",
    });
    const unavailable = await app.inject("/api/v1/health/ready");
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.json().error.code, "DEPENDENCY_UNAVAILABLE");
    assert.equal(unavailable.headers["cache-control"], "no-store");
    assert.equal((await app.inject("/unknown")).statusCode, 404);
    await app.ready();
    const spec = app.swagger();
    assert.ok("openapi" in spec);
    assert.equal(spec.openapi, "3.1.0");
  } finally {
    await app.close();
  }
});
test("invalid/extra fields and malformed JSON return safe errors without echoing bodies", async () => {
  const app = await buildApp();
  app.post(
    "/contract-probe",
    {
      schema: {
        body: Type.Object(
          { minutes: Type.Integer({ minimum: 0 }) },
          { additionalProperties: false },
        ),
      },
    },
    async (request) => request.body,
  );
  try {
    for (const payload of [
      { minutes: -1 },
      { minutes: 30, owner_id: "untrusted-owner" },
      { minutes: "30" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/contract-probe",
        payload,
      });
      assert.equal(response.statusCode, 422);
      assert.equal(response.json().error.code, "VALIDATION_ERROR");
      assert.ok(!response.body.includes("untrusted-owner"));
    }
    const malformed = await app.inject({
      method: "POST",
      url: "/contract-probe",
      headers: { "content-type": "application/json" },
      payload: '{"minutes":',
    });
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.json().error.code, "MALFORMED_JSON");
    const oversized = await app.inject({
      method: "POST",
      url: "/contract-probe",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ minutes: 30, private: "x".repeat(70000) }),
    });
    assert.equal(oversized.statusCode, 413);
    assert.equal(oversized.json().error.code, "PAYLOAD_TOO_LARGE");
    const unsupported = await app.inject({
      method: "POST",
      url: "/contract-probe",
      headers: { "content-type": "application/x-private" },
      payload: "private-fixture",
    });
    assert.equal(unsupported.statusCode, 415);
    assert.ok(!unsupported.body.includes("private-fixture"));
  } finally {
    await app.close();
  }
});
test("OpenAPI describes private mutations, concurrency and idempotency without provider secrets", async () => {
  const app = await buildApp();
  try {
    const result = await app.inject("/api/v1/openapi.json");
    assert.equal(result.statusCode, 200);
    const spec = result.json();
    const headers = (path: string, method: string) =>
      spec.paths[path][method].parameters
        .filter((p: { in: string }) => p.in === "header")
        .map((p: { name: string }) => p.name)
        .sort();
    assert.deepEqual(headers("/api/v1/activities/{id}/progress", "put"), [
      "Idempotency-Key",
      "If-Match",
      "Origin",
      "X-CSRF-Token",
    ]);
    assert.deepEqual(headers("/api/v1/activities", "post"), [
      "Idempotency-Key",
      "Origin",
      "X-CSRF-Token",
    ]);
    assert.deepEqual(headers("/api/v1/auth/email/challenges", "post"), [
      "Origin",
    ]);
    assert.deepEqual(headers("/api/v1/auth/session/refresh", "post"), [
      "Origin",
      "X-CSRF-Token",
    ]);
    assert.deepEqual(spec.paths["/api/v1/me"].get.security, [
      { sessionCookie: [] },
    ]);
    const operations = Object.values(spec.paths).flatMap((path) =>
      Object.values(path as Record<string, { operationId?: string }>)
        .map((op) => op.operationId)
        .filter(Boolean),
    );
    assert.equal(new Set(operations).size, operations.length);
    assert.ok(!result.body.includes("CREDENTIAL_ENCRYPTION_KEY"));
    assert.ok(operations.length >= 30);
  } finally {
    await app.close();
  }
});
test("ready state requires a successful database probe", async () => {
  let calls = 0;
  const app = await buildApp({
    ready: async () => {
      calls++;
    },
  });
  try {
    assert.equal((await app.inject("/api/v1/health/ready")).statusCode, 200);
    assert.equal(calls, 1);
  } finally {
    await app.close();
  }
});
