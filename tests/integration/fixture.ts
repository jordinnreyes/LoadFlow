import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { database } from "../../server/db/client.js";
import { Academics } from "../../server/modules/academics/service.js";
import {
  Identity,
  SESSION_COOKIE,
} from "../../server/modules/identity/service.js";
import type {
  AuthProvider,
  IdentityProof,
} from "../../server/modules/identity/provider.js";
import { buildApp } from "../../server/app.js";
import { CalendarService } from "../../server/modules/calendar/service.js";
import type { CalendarProvider } from "../../server/modules/calendar/provider.js";
import { PlanningService } from "../../server/modules/planning/service.js";
import type { ImportService } from "../../server/modules/imports/service.js";
import type { Estimates } from "../../server/modules/estimates/service.js";
export async function fixture(
  now = new Date("2030-01-01T00:00:00Z"),
  calendarProvider?: CalendarProvider,
  importService?: (identity: Identity) => ImportService,
  estimateService?: (academics: Academics) => Estimates,
  authProvider?: AuthProvider,
) {
  const db = database(process.env.DATABASE_URL!),
    ids = database(process.env.IDENTITY_DATABASE_URL!);
  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const proofs = new Map<string, IdentityProof>();
  const unexpected = async (): Promise<never> => {
    throw new Error("Not part of fixture");
  };
  const provider: AuthProvider = {
    sendCode: unexpected,
    verifyCode: unexpected,
    googleStart: unexpected,
    googleExchange: unexpected,
    refresh: unexpected,
    revoke: async () => {},
    user: async (token) => {
      const p = proofs.get(token);
      if (!p) throw new Error("Invalid fixture identity");
      return p.userId;
    },
  };
  const academics = new Academics(
    db.pool,
    () => now,
    `test-planning-${randomUUID()}`,
  );
  const identity = new Identity(
    ids.pool,
    authProvider ?? provider,
    academics,
    {
      origin: "http://127.0.0.1:3001",
      encryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY!,
      googleEnabled: false,
    },
    () => now,
  );
  const calendar = new CalendarService(
    identity,
    calendarProvider,
    `test-${randomUUID()}`,
  );
  const imports = importService?.(identity);
  const planning = new PlanningService(identity, calendar);
  const app = await buildApp({
    identity,
    calendar,
    imports,
    planning,
    estimates: estimateService?.(academics),
  });
  async function client(tokenLifetimeSeconds = 3600) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `f2-${randomUUID()}@fixture.test`,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error("Fixture identity creation failed");
    const proof: IdentityProof = {
      userId: data.user.id,
      displayName: "F2 fixture",
      accessToken: randomUUID(),
      refreshToken: randomUUID(),
      expiresAt: Math.floor(now.getTime() / 1000) + tokenLifetimeSeconds,
      authSessionId: randomUUID(),
    };
    proofs.set(proof.accessToken, proof);
    const session = await identity.issue(proof);
    return {
      owner: data.user.id,
      cookie: `${SESSION_COOKIE}=${session.cookie}`,
      csrf: session.csrfToken,
    };
  }
  type Client = Awaited<ReturnType<typeof client>>;
  const request = (
    c: Client,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    payload?: unknown,
    version?: string,
    key = randomUUID(),
  ) =>
    app.inject({
      method,
      url,
      headers: {
        cookie: c.cookie,
        origin: identity.config.origin,
        "x-csrf-token": c.csrf,
        "idempotency-key": key,
        ...(version ? { "if-match": version } : {}),
      },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  return {
    db,
    ids,
    app,
    identity,
    academics,
    calendar,
    imports,
    planning,
    client,
    request,
    now,
    close: async () => {
      await app.close();
      await db.pool.end();
      await ids.pool.end();
    },
  };
}
