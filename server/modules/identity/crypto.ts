import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
export class Secrets {
  private key: Buffer;
  constructor(hex: string) {
    if (!/^[0-9a-f]{64}$/i.test(hex))
      throw new Error(
        "CREDENTIAL_ENCRYPTION_KEY debe contener 32 bytes aleatorios hex.",
      );
    this.key = Buffer.from(hex, "hex");
  }
  encrypt(value: unknown) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      nonce.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      data.toString("base64url"),
    ].join(".");
  }
  decrypt<T>(value: string): T {
    const [version, nonce, tag, data] = value.split(".");
    if (version !== "v1") throw new Error("Unsupported encryption version");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(nonce, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(data, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as T;
  }
  fingerprint(value: string) {
    return createHmac("sha256", this.key)
      .update("lookup:" + value)
      .digest("hex");
  }
  csrf(cookie: string) {
    return createHmac("sha256", this.key)
      .update("csrf:" + cookie)
      .digest("base64url");
  }
  validCsrf(cookie: string, value: string | undefined) {
    const expected = Buffer.from(this.csrf(cookie));
    const actual = Buffer.from(value ?? "");
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
}
export const opaque = () => randomBytes(32).toString("base64url");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
