import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { networkInterfaces } from "node:os";
import { execFileSync } from "node:child_process";
import { randomBytes, X509Certificate } from "node:crypto";
const here = dirname(fileURLToPath(import.meta.url));
const spike = resolve(here, ".."),
  root = resolve(spike, "../..");
if (process.versions.node.split(".")[0] !== "24") throw Error("Use Node 24");
const privateIP = (ip) =>
  /^192\.168\.\d+\.\d+$|^10\.\d+\.\d+\.\d+$|^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(
    ip,
  );
const requested = process.argv.find((x) => x.startsWith("--host="))?.slice(7);
const candidates = Object.entries(networkInterfaces())
  .filter(
    ([name]) => !/(vEthernet|WSL|Docker|VMware|VirtualBox|VPN)/i.test(name),
  )
  .flatMap(([, items]) =>
    items
      .filter((x) => x.family === "IPv4" && !x.internal && privateIP(x.address))
      .map((x) => x.address),
  );
const host = requested ?? candidates[0];
if (!host || !privateIP(host))
  throw Error("Choose a private LAN IPv4 address with --host=...");
const local = resolve(root, ".local/android-https");
mkdirSync(local, { recursive: true });
const key = resolve(local, "server-key.pem"),
  cert = resolve(local, "server-cert.pem");
const openssl =
  process.env.CW_OPENSSL ??
  (existsSync("C:/Program Files/Git/usr/bin/openssl.exe")
    ? "C:/Program Files/Git/usr/bin/openssl.exe"
    : "openssl");
execFileSync(
  openssl,
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-noenc",
    "-sha256",
    "-days",
    "2",
    "-keyout",
    key,
    "-out",
    cert,
    "-subj",
    "/CN=CargaWise F0 local HTTPS",
    "-addext",
    `subjectAltName=IP:${host},IP:127.0.0.1,DNS:localhost`,
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    "-addext",
    "extendedKeyUsage=serverAuth",
    "-addext",
    "keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
const certificate = new X509Certificate(readFileSync(cert));
if (!certificate.checkIP(host))
  throw Error("Certificate address does not match");
const nonce = randomBytes(24).toString("hex"),
  port = 38443;
const endpoint = `https://${host}:${port}/f0/probe?nonce=${nonce}`;
const config = {
  host,
  port,
  nonce,
  certificateFingerprint: certificate.fingerprint256,
  validTo: certificate.validTo,
};
writeFileSync(
  resolve(local, "config.json"),
  JSON.stringify(config, null, 2) + "\n",
);
const assets = resolve(spike, "android/app/src/httpsProbe/assets/public");
const raw = resolve(spike, "android/app/src/httpsProbe/res/raw");
mkdirSync(assets, { recursive: true });
mkdirSync(raw, { recursive: true });
copyFileSync(cert, resolve(raw, "cw_f0_ca.pem"));
const html = readFileSync(resolve(here, "probe.html"), "utf8")
  .replace("__ORIGIN__", `https://${host}:${port}`)
  .replace("__ENDPOINT_JSON__", JSON.stringify(endpoint))
  .replace("__NONCE_JSON__", JSON.stringify(nonce));
writeFileSync(resolve(assets, "f0-https.html"), html);
console.log(
  JSON.stringify({
    host,
    port,
    validTo: config.validTo,
    certificateFingerprint: config.certificateFingerprint,
    note: "Private key stays in .local; only public certificate and fictitious probe identifier enter the debug APK.",
  }),
);
