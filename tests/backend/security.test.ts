import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { Writable } from "node:stream";
import test from "node:test";
import { buildApp } from "../../server/app.js";
import { SupabaseProvider } from "../../server/modules/identity/provider.js";
import { privateImportStorage } from "../../server/modules/imports/storage.js";

test("F7 logs route templates and safe errors without OAuth queries, credentials or documents", async () => {
  const records: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      records.push(chunk.toString());
      done();
    },
  });
  const app = await buildApp({ logger: { stream } });
  app.post("/log-probe/:id", async () => {
    throw new Error("private-provider-error");
  });
  app.get("/cookie-probe", async (_request, reply) => {
    reply.setCookie("__Host-cw_session", "private-set-cookie");
    return { fragment: "private-response-fragment" };
  });
  try {
    const callback = await app.inject(
      "/api/v1/auth/google/callback?code=private-oauth-code",
    );
    assert.equal(callback.headers["referrer-policy"], "no-referrer");
    assert.equal(callback.headers["cache-control"], "no-store");
    const response = await app.inject({
      method: "POST",
      url: "/log-probe/private-path-segment",
      headers: {
        cookie: "__Host-cw_session=private-session-cookie",
        authorization: "Bearer private-access-token",
        "x-csrf-token": "private-csrf-token",
        "request-id": "private-user-request-id",
      },
      payload: { excerpt: "private-request-fragment", code: "private-otp" },
    });
    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(response.body, /private-/);
    assert.equal((await app.inject("/cookie-probe")).statusCode, 200);
    assert.equal(
      (await app.inject("/unknown/private-unmatched-path")).statusCode,
      404,
    );
    const logs = records.join("");
    assert.doesNotMatch(logs, /private-/);
    assert.match(logs, /"route":"\/log-probe\/:id"/);
    assert.match(logs, /"route":"\/api\/v1\/auth\/google\/callback"/);
    assert.match(logs, /"statusCode":500/);
    assert.match(logs, /"code":"INTERNAL_ERROR"/);
  } finally {
    await app.close();
  }
});

test("F7 Supabase Auth and private Storage refuse HTTP redirects before forwarding data", async (t) => {
  const errorLog = t.mock.method(console, "error", () => {});
  const requests: string[] = [];
  const target = createServer((req, res) => {
    requests.push("redirect-target");
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: randomUUID(), Key: "unexpected-forward" }));
  });
  const configured = createServer((req, res) => {
    if (req.url?.startsWith("/storage/v1/bucket/")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ public: false }));
      return;
    }
    requests.push(req.url === "/auth/v1/user" ? "auth" : "storage");
    req.resume();
    res.writeHead(307, { location: origin(target) + "/private-redirect-path" });
    res.end();
  });
  function origin(server: typeof target) {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return `http://127.0.0.1:${address.port}`;
  }
  try {
    await Promise.all(
      [target, configured].map((server) =>
        once(server.listen(0, "127.0.0.1"), "listening"),
      ),
    );
    const auth = new SupabaseProvider(
      origin(configured),
      "private-fixture-anon-key",
    );
    await assert.rejects(auth.user("private-fixture-token"), {
      code: "AUTH_UNAVAILABLE",
    });
    const storage = await privateImportStorage(
      origin(configured),
      "private-fixture-service-key",
    );
    await assert.rejects(
      storage.put(randomUUID(), Buffer.from("private-fixture-bytes")),
      { code: "STORAGE_UNAVAILABLE" },
    );
    assert.deepEqual(requests, ["auth", "storage"]);
    for (const call of errorLog.mock.calls)
      assert.doesNotMatch(call.arguments.map(String).join(" "), /private-/);
  } finally {
    await Promise.all(
      [configured, target].map((server) => server[Symbol.asyncDispose]()),
    );
  }
});
