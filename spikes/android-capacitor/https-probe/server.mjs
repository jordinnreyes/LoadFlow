import https from "node:https";
import { readFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, X509Certificate } from "node:crypto";
const local = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.local/android-https",
);
const config = JSON.parse(readFileSync(resolve(local, "config.json"), "utf8"));
const cert = readFileSync(resolve(local, "server-cert.pem"));
if (
  !/^192\.168\.\d+\.\d+$|^10\.\d+\.\d+\.\d+$|^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(
    config.host,
  ) ||
  config.port !== 38443 ||
  !/^[a-f0-9]{48}$/.test(config.nonce)
)
  throw Error("Private LAN fixture configuration required");
if (
  new Date(config.validTo) <= new Date() ||
  new X509Certificate(cert).fingerprint256 !== config.certificateFingerprint ||
  !new X509Certificate(cert).checkIP(config.host)
)
  throw Error("Prepare a fresh matching test certificate and APK");
const server = https.createServer(
  {
    key: readFileSync(resolve(local, "server-key.pem")),
    cert,
    minVersion: "TLSv1.2",
  },
  (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const origin = req.headers.origin;
    if (origin && origin !== "https://localhost") {
      res.writeHead(403);
      res.end();
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    let url;
    try {
      if ((req.url ?? "").length > 2048) throw Error();
      url = new URL(req.url, "https://probe.invalid");
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (url.pathname !== "/f0/probe") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET");
      res.setHeader("Access-Control-Allow-Private-Network", "true");
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    if (url.searchParams.get("nonce") !== config.nonce) {
      res.writeHead(403);
      res.end();
      return;
    }
    const event = {
      probe: "cargawise-f0",
      nonce: config.nonce,
      requestId: randomUUID(),
      at: new Date().toISOString(),
      tls: req.socket.getProtocol(),
      origin: origin ?? "local-client",
      client:
        req.headers["x-cw-probe-client"] === "desktop-smoke"
          ? "desktop-smoke"
          : "manual-unconfirmed",
    };
    appendFileSync(
      resolve(local, "evidence.ndjson"),
      JSON.stringify(event) + "\n",
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(event));
    console.log(
      JSON.stringify({
        requestId: event.requestId,
        at: event.at,
        tls: event.tls,
        origin: event.origin,
        client: event.client,
      }),
    );
  },
);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.maxConnections = 16;
server.listen(config.port, config.host, () =>
  console.log(
    `F0 HTTPS fixture listening on ${config.host}:${config.port}; fictitious data only.`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => server.close());
