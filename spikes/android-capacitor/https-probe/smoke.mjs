import assert from "node:assert/strict";
import https from "node:https";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const local = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.local/android-https",
);
const config = JSON.parse(readFileSync(resolve(local, "config.json"), "utf8"));
const cert = readFileSync(resolve(local, "server-cert.pem"));
function request(path, { trusted = true, origin, method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        hostname: config.host,
        port: config.port,
        path,
        method,
        ca: trusted ? cert : undefined,
        timeout: 5000,
        headers: {
          "X-Cw-Probe-Client": "desktop-smoke",
          ...(origin ? { Origin: origin } : {}),
        },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body,
          }),
        );
      },
    );
    r.on("error", reject);
    r.on("timeout", () => r.destroy(Error("timeout")));
    r.end();
  });
}
const path = "/f0/probe?nonce=" + config.nonce;
const success = await request(path, { origin: "https://localhost" });
assert.equal(success.status, 200);
assert.equal(
  success.headers["access-control-allow-origin"],
  "https://localhost",
);
const data = JSON.parse(success.body);
assert.equal(data.probe, "cargawise-f0");
assert.equal(data.nonce, config.nonce);
assert.equal(data.client, "desktop-smoke");
assert.ok(data.tls.startsWith("TLSv1."));
assert.equal((await request("/.env")).status, 404);
assert.equal((await request("/f0/probe?nonce=wrong")).status, 403);
assert.equal(
  (await request(path, { origin: "https://untrusted.invalid" })).status,
  403,
);
assert.equal((await request(path, { method: "POST" })).status, 405);
assert.equal(
  (
    await request("/f0/probe", {
      method: "OPTIONS",
      origin: "https://localhost",
    })
  ).status,
  204,
);
await assert.rejects(request(path, { trusted: false }), (error) =>
  [
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  ].includes(error.code),
);
console.log(
  "HTTPS desktop smoke: valid certificate/response/CORS, no filesystem route, wrong identifier/origin/method rejected, untrusted certificate rejected. Android runtime remains pending.",
);
