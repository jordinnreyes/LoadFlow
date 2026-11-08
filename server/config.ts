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
  if (env.WISELOAD_ENV === "staging" || env.WISELOAD_ENV === "production")
    return hostedConfig(env, env.WISELOAD_ENV);
  if (env.WISELOAD_ENV || env.NODE_ENV === "production")
    throw new Error("Producción requiere autorización de liberación.");
  const origin = env.PUBLIC_APP_ORIGIN ?? "http://127.0.0.1:3001";
  new URL(origin);
  const oauthCallbackOrigin = new URL(env.OAUTH_CALLBACK_ORIGIN ?? origin);
  if (
    !["http:", "https:"].includes(oauthCallbackOrigin.protocol) ||
    oauthCallbackOrigin.username ||
    oauthCallbackOrigin.password
  )
    throw new Error("OAUTH_CALLBACK_ORIGIN debe ser un origen HTTP o HTTPS.");
  return {
    mode: "local" as const,
    origin,
    oauthCallbackOrigin: oauthCallbackOrigin.origin,
    port: Number(env.PORT ?? 3001),
    host: "127.0.0.1",
    databaseUrl: env.DATABASE_URL,
  };
}

function httpsOrigin(value: string | undefined, variable: string) {
  const url = parseUrl(value);
  if (
    !url ||
    url.protocol !== "https:" ||
    value !== url.origin ||
    loopback(url.href)
  )
    throw new Error(`${variable} debe ser un origen HTTPS remoto exacto.`);
  return url;
}

function hostedConfig(env: NodeJS.ProcessEnv, mode: "staging" | "production") {
  const production = mode === "production";
  const app = httpsOrigin(env.PUBLIC_APP_ORIGIN, "PUBLIC_APP_ORIGIN");
  if (
    (env.RENDER_EXTERNAL_URL && env.RENDER_EXTERNAL_URL !== app.origin) ||
    (env.OAUTH_CALLBACK_ORIGIN && env.OAUTH_CALLBACK_ORIGIN !== app.origin)
  )
    throw new Error(
      "La web y los callbacks deben usar el mismo origen del entorno.",
    );
  const project = managedProject(env, mode);
  const openRegistration =
    production && env.PUBLIC_REGISTRATION_ENABLED === "true";
  const allowlistVariable = production
    ? "PRODUCTION_ALLOWED_EMAILS"
    : "STAGING_ALLOWED_EMAILS";
  const allowedEmails = new Set(
    (env[allowlistVariable] ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  if (
    (!openRegistration && !allowedEmails.size) ||
    [...allowedEmails].some(
      (email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    )
  )
    throw new Error(
      `Configura ${allowlistVariable} con cuentas de prueba autorizadas.`,
    );
  const privacyContact = env.PUBLIC_PRIVACY_CONTACT?.trim();
  if (
    production &&
    !/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(privacyContact ?? "")
  )
    throw new Error(
      "Configura PUBLIC_PRIVACY_CONTACT para la versión pública.",
    );
  const googleSiteVerification = env.GOOGLE_SITE_VERIFICATION;
  if (
    production &&
    googleSiteVerification &&
    !/^[a-zA-Z0-9_-]{1,200}$/.test(googleSiteVerification)
  )
    throw new Error("GOOGLE_SITE_VERIFICATION inválido.");
  if (openRegistration && env.GOOGLE_AUTH_ENABLED !== "true")
    throw new Error("El registro público requiere Google Sign-In configurado.");
  const port = Number(env.PORT ?? 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT debe ser un puerto válido.");
  if (env.ESTIMATES_LOCAL_ENABLED === "true")
    throw new Error(
      "La política local de estimaciones no se usa en entornos desplegados.",
    );
  return {
    mode,
    origin: app.origin,
    oauthCallbackOrigin: app.origin,
    host: "0.0.0.0",
    port,
    databaseUrl: managedDatabaseUrl(env.DATABASE_URL, project, "cw_runtime"),
    identityDatabaseUrl: managedDatabaseUrl(
      env.IDENTITY_DATABASE_URL,
      project,
      "cw_identity",
    ),
    allowedEmails: openRegistration ? undefined : allowedEmails,
    calendarEnabled: !production || env.PRODUCTION_CALENDAR_ENABLED === "true",
    publicWeb: production
      ? { privacyContact: privacyContact!, googleSiteVerification }
      : undefined,
  };
}

export function managedProject(
  env: NodeJS.ProcessEnv,
  mode: "staging" | "production",
) {
  const supabase = httpsOrigin(env.SUPABASE_URL, "SUPABASE_URL");
  const project = /^([a-z0-9]{20})\.supabase\.co$/.exec(supabase.host)?.[1];
  if (!project) throw new Error("Se requiere un proyecto Supabase gestionado.");
  if (
    mode === "production" &&
    (env.PRODUCTION_SUPABASE_PROJECT_REF !== project ||
      !/^[a-z0-9]{20}$/.test(env.STAGING_SUPABASE_PROJECT_REF ?? "") ||
      env.STAGING_SUPABASE_PROJECT_REF === project)
  )
    throw new Error(
      "Producción requiere un proyecto explícito distinto de staging.",
    );
  return project;
}

export function managedDatabaseUrl(
  value: string | undefined,
  project: string,
  role: "cw_runtime" | "cw_identity" | "postgres",
) {
  const url = parseUrl(value);
  const direct =
    url?.hostname === `db.${project}.supabase.co` && url.username === role;
  const pooled =
    url?.hostname.endsWith(".pooler.supabase.com") &&
    url.username === `${role}.${project}`;
  if (
    !url ||
    url.protocol !== "postgresql:" ||
    !(direct || pooled) ||
    url.port !== "5432" ||
    !url.password ||
    url.pathname !== "/postgres" ||
    url.hash ||
    url.search !== "?sslmode=verify-full"
  )
    throw new Error(
      `Conexión gestionada inválida para ${role}. Usa TLS verificado y puerto 5432.`,
    );
  return url.href;
}

function parseUrl(value: string | undefined) {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
}
