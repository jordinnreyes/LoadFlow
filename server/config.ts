export function assertRuntime() {
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw new Error(
      "WiseLoad backend requiere Node 24. Usa .node-version o el runtime local documentado.",
    );
}
export function loopback(url: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
}
export function runtimeConfig(env = process.env) {
  assertRuntime();
  const origin = env.PUBLIC_APP_ORIGIN ?? "http://127.0.0.1:3001";
  new URL(origin);
  const oauthCallbackOrigin = new URL(env.OAUTH_CALLBACK_ORIGIN ?? origin);
  if (!["http:", "https:"].includes(oauthCallbackOrigin.protocol) ||
      oauthCallbackOrigin.username || oauthCallbackOrigin.password)
    throw new Error("OAUTH_CALLBACK_ORIGIN debe ser un origen HTTP o HTTPS.");
  if (env.NODE_ENV === "production")
    throw new Error(
      "Producción no habilitada en F0/F1; requiere gate de liberación.",
    );
  return {
    origin,
    oauthCallbackOrigin: oauthCallbackOrigin.origin,
    port: Number(env.PORT ?? 3001),
    host: "127.0.0.1",
    databaseUrl: env.DATABASE_URL,
  };
}
