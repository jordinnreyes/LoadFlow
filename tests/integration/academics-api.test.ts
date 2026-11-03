import test from "node:test";
import assert from "node:assert/strict";
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
import type { ActivityDto } from "../../packages/contracts/academics.js";

const origin = "http://127.0.0.1:3001";
test("private REST APIs preserve manual effort, priorities, progress, date proposals and concurrent edits", async () => {
  for (const key of [
    "DATABASE_URL",
    "IDENTITY_DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CREDENTIAL_ENCRYPTION_KEY",
  ])
    assert.ok(process.env[key], `Falta ${key}`);
  const db = database(process.env.DATABASE_URL!),
    ids = database(process.env.IDENTITY_DATABASE_URL!);
  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const now = new Date();
  const clock = () => now;
  const proofs = new Map<string, IdentityProof>();
  const provider: AuthProvider = {
    async sendCode() {
      throw new Error("not part of this test");
    },
    async verifyCode() {
      throw new Error("not part of this test");
    },
    async user(token) {
      const proof = proofs.get(token);
      if (!proof) throw new Error("Invalid fixture identity");
      return proof.userId;
    },
    async refresh(token) {
      const p = [...proofs.values()].find((p) => p.refreshToken === token);
      if (!p) throw new Error();
      return p;
    },
    async revoke() {
      return;
    },
    async googleStart() {
      throw new Error("real Google not used");
    },
    async googleExchange() {
      throw new Error("real Google not used");
    },
  };
  const service = new Academics(db.pool, clock);
  const identity = new Identity(
    ids.pool,
    provider,
    service,
    {
      origin,
      encryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY!,
      googleEnabled: false,
    },
    clock,
  );
  const app = await buildApp({
    identity,
    ready: async () => {
      await db.pool.query("select 1");
    },
  });
  async function client() {
    const { data, error } = await admin.auth.admin.createUser({
      email: `api-${randomUUID()}@fixture.test`,
      email_confirm: true,
    });
    assert.ok(!error && data.user);
    const p: IdentityProof = {
      userId: data.user.id,
      displayName: "Estudiante fixture",
      accessToken: randomUUID(),
      refreshToken: randomUUID(),
      expiresAt: Math.floor(now.getTime() / 1000) + 3600,
      authSessionId: randomUUID(),
    };
    proofs.set(p.accessToken, p);
    const session = await identity.issue(p);
    return {
      owner: data.user.id,
      cookie: `${SESSION_COOKIE}=${session.cookie}`,
      csrf: session.csrfToken,
    };
  }
  const a = await client(),
    b = await client();
  type Client = typeof a;
  async function request(
    client: Client,
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    url: string,
    payload?: Record<string, unknown>,
    version?: string,
    key = randomUUID(),
  ) {
    return app.inject({
      method,
      url,
      headers: {
        cookie: client.cookie,
        origin,
        "x-csrf-token": client.csrf,
        "idempotency-key": key,
        ...(version ? { "if-match": version } : {}),
      },
      ...(payload === undefined ? {} : { payload }),
    });
  }
  async function get(id: string) {
    const response = await request(a, "GET", `/api/v1/activities/${id}`);
    assert.equal(response.statusCode, 200);
    return response.json<ActivityDto>();
  }
  const tag = (x: ActivityDto) => `"activity-${x.revision}"`;
  try {
    assert.equal((await app.inject("/api/v1/activities")).statusCode, 401);
    const profile = await request(a, "GET", "/api/v1/me");
    assert.equal(profile.statusCode, 200);
    const badPlan = await request(
      a,
      "PATCH",
      "/api/v1/me/preferences",
      { plan: "Premium" },
      profile.headers.etag,
    );
    assert.equal(badPlan.statusCode, 422);
    assert.equal(
      (await request(a, "GET", "/api/v1/me/capabilities")).json().plan,
      "Free",
    );
    const profileSaved = await request(
      a,
      "PATCH",
      "/api/v1/me/preferences",
      { studyTimezone: "America/Lima", displayName: "Alex fixture" },
      profile.headers.etag,
    );
    assert.equal(profileSaved.statusCode, 200);
    const periods = (await request(a, "GET", "/api/v1/periods")).json().items;
    assert.equal(periods.length, 1);
    const periodId = periods[0].id as string;
    assert.equal(
      (await request(b, "GET", `/api/v1/periods/${periodId}/courses`))
        .statusCode,
      404,
    );
    const courseKey = randomUUID();
    const course = await request(
      a,
      "POST",
      `/api/v1/periods/${periodId}/courses`,
      { name: "Cálculo I" },
      undefined,
      courseKey,
    );
    assert.equal(course.statusCode, 201);
    const courseId = course.json().id as string;
    const replay = await request(
      a,
      "POST",
      `/api/v1/periods/${periodId}/courses`,
      { name: "Cálculo I" },
      undefined,
      courseKey,
    );
    assert.equal(replay.statusCode, 201);
    assert.equal(replay.json().id, courseId);
    assert.equal(
      (
        await request(
          a,
          "POST",
          `/api/v1/periods/${periodId}/courses`,
          { name: "Otra" },
          undefined,
          courseKey,
        )
      ).statusCode,
      409,
    );
    const missing = await request(a, "POST", "/api/v1/activities", {
      periodId,
      title: "Fecha sola",
      type: "Tarea",
      dueDate: "2026-11-10",
    });
    assert.equal(missing.statusCode, 201);
    assert.equal(missing.json().dueAt, null);
    assert.equal(missing.json().operatingMinutes, null);
    assert.equal(missing.json().needsReview, true);
    const zero = await request(a, "POST", "/api/v1/activities", {
      periodId,
      title: "Cero a revisar",
      type: "Tarea",
      dueDate: "2026-11-11",
      operatingMinutes: 0,
    });
    assert.equal(zero.statusCode, 201);
    assert.equal(zero.json().preparationState, "new");
    assert.equal(zero.json().needsReview, true);
    const base = {
      periodId,
      courseId,
      title: "Parcial",
      type: "Examen parcial",
      dueDate: "2026-11-10",
      dueTime: "10:00",
      timezone: "America/Lima",
      evaluationEndAt: "2026-11-10T17:00:00Z",
      operatingMinutes: 360,
      allowedStartAt: now.toISOString(),
      divisibility: "divisible",
    };
    const created = await request(a, "POST", "/api/v1/activities", base);
    assert.equal(created.statusCode, 201);
    let activity = created.json<ActivityDto>();
    assert.equal(activity.operatingMinutes, 360);
    assert.equal(activity.dueAt, "2026-11-10T15:00:00.000Z");
    const forged = await request(a, "POST", "/api/v1/activities", {
      ...base,
      owner_id: b.owner,
    });
    assert.equal(forged.statusCode, 422);
    assert.equal(
      (await request(b, "GET", `/api/v1/activities/${activity.id}`)).statusCode,
      404,
    );
    assert.equal(
      (
        await request(
          b,
          "PATCH",
          `/api/v1/activities/${activity.id}`,
          { title: "foreign" },
          tag(activity),
        )
      ).statusCode,
      404,
    );
    const priorityPath = `/api/v1/courses/${courseId}/priorities/${encodeURIComponent("Examen parcial")}`;
    const priority = await request(
      a,
      "PUT",
      priorityPath,
      { priority: "Alta" },
      course.headers.etag,
    );
    assert.equal(priority.statusCode, 200);
    activity = await get(activity.id);
    assert.equal(activity.effectivePriority, "Alta");
    const second = await request(a, "POST", "/api/v1/activities", {
      ...base,
      title: "Segundo parcial",
      dueDate: "2026-11-17",
      evaluationEndAt: "2026-11-17T17:00:00Z",
    });
    assert.equal(second.statusCode, 201);
    let exception = second.json<ActivityDto>();
    assert.equal(exception.effectivePriority, "Alta");
    const overridden = await request(
      a,
      "PUT",
      `/api/v1/activities/${exception.id}/priority`,
      { mode: "override", priority: "Baja" },
      tag(exception),
    );
    assert.equal(overridden.statusCode, 200);
    exception = overridden.json<ActivityDto>();
    const baseChanged = await request(
      a,
      "PUT",
      priorityPath,
      { priority: "Media" },
      priority.headers.etag,
    );
    assert.equal(baseChanged.statusCode, 200);
    assert.equal((await get(exception.id)).effectivePriority, "Baja");
    assert.equal((await get(exception.id)).revision, exception.revision);
    activity = await get(activity.id);
    assert.equal(activity.effectivePriority, "Media");
    assert.equal(
      (
        await request(a, "PATCH", `/api/v1/activities/${activity.id}`, {
          operatingMinutes: 420,
        })
      ).statusCode,
      428,
    );
    const estimate = await request(
      a,
      "PATCH",
      `/api/v1/activities/${activity.id}`,
      { operatingMinutes: 420 },
      tag(activity),
    );
    assert.equal(estimate.statusCode, 200);
    activity = estimate.json<ActivityDto>();
    assert.equal(activity.effortOrigin, "corrected");
    const initialProgress = await request(
      a,
      "PUT",
      `/api/v1/activities/${activity.id}/progress`,
      { realTotalMinutes: 120, preparationState: "progress" },
      tag(activity),
    );
    assert.equal(initialProgress.statusCode, 200);
    activity = initialProgress.json<ActivityDto>();
    assert.equal(activity.pendingMinutes, 300);
    const corrected = await request(
      a,
      "PUT",
      `/api/v1/activities/${activity.id}/progress`,
      { realTotalMinutes: 90 },
      tag(activity),
    );
    assert.equal(corrected.statusCode, 200);
    activity = corrected.json<ActivityDto>();
    assert.equal(activity.realTotalMinutes, 90);
    assert.equal(activity.pendingMinutes, 330);
    const done = await request(
      a,
      "PUT",
      `/api/v1/activities/${activity.id}/progress`,
      {
        realTotalMinutes: 100,
        preparationState: "done",
        effectiveCompletionDate: "2026-11-03",
      },
      tag(activity),
    );
    assert.equal(done.statusCode, 200);
    activity = done.json<ActivityDto>();
    assert.equal(activity.fulfillmentState, "pending");
    assert.equal(activity.pendingMinutes, 0);
    assert.equal(activity.evaluationEndAt, "2026-11-10T17:00:00.000Z");
    const withoutConfirmation = await request(
      a,
      "PUT",
      `/api/v1/activities/${activity.id}/progress`,
      { preparationState: "progress", remainingMinutes: 30 },
      tag(activity),
    );
    assert.equal(withoutConfirmation.statusCode, 422);
    const reopened = await request(
      a,
      "PUT",
      `/api/v1/activities/${activity.id}/progress`,
      {
        preparationState: "progress",
        remainingMinutes: 30,
        reopenPreparation: true,
      },
      tag(activity),
    );
    assert.equal(reopened.statusCode, 200);
    activity = reopened.json<ActivityDto>();
    assert.equal(activity.pendingMinutes, 30);
    assert.equal(activity.effectiveCompletionDate, null);
    const fulfilled = await request(
      a,
      "PUT",
      `/api/v1/activities/${activity.id}/progress`,
      { fulfillmentState: "fulfilled" },
      tag(activity),
    );
    assert.equal(fulfilled.statusCode, 200);
    activity = fulfilled.json<ActivityDto>();
    assert.equal(activity.realTotalMinutes, 100);
    assert.equal(activity.preparationState, "progress");
    assert.equal(
      (
        await request(
          a,
          "PUT",
          `/api/v1/activities/${activity.id}/progress`,
          { effectiveCompletionDate: "2099-01-01" },
          tag(activity),
        )
      ).statusCode,
      422,
    );
    const history = await request(
      a,
      "GET",
      `/api/v1/activities/${activity.id}/progress-history?limit=1`,
    );
    assert.equal(history.statusCode, 200);
    assert.equal(history.json().items.length, 1);
    assert.ok(history.json().nextCursor);
    const nextPage = await request(
      a,
      "GET",
      `/api/v1/activities/${activity.id}/progress-history?limit=1&cursor=${history.json().nextCursor}`,
    );
    assert.ok(
      nextPage.json().items[0].activityRevision <
        history.json().items[0].activityRevision,
    );
    assert.equal(
      (
        await request(
          b,
          "GET",
          `/api/v1/activities/${activity.id}/progress-history`,
        )
      ).statusCode,
      404,
    );
    const noSilentDate = await request(
      a,
      "PATCH",
      `/api/v1/activities/${activity.id}`,
      { dueDate: "2026-11-11" },
      tag(activity),
    );
    assert.equal(noSilentDate.statusCode, 422);
    assert.equal(
      (
        await request(
          a,
          "POST",
          `/api/v1/activities/${activity.id}/date-change-proposals`,
          { dueDate: "2026-11-12", source: { kind: "manual" } },
          tag(activity),
        )
      ).statusCode,
      422,
      "new evaluation interval needs its end confirmed",
    );
    const proposal = await request(
      a,
      "POST",
      `/api/v1/activities/${activity.id}/date-change-proposals`,
      {
        dueDate: "2026-11-12",
        evaluationEndAt: "2026-11-12T17:00:00Z",
        source: { kind: "manual", description: "Cambio docente de prueba" },
      },
      tag(activity),
    );
    assert.equal(proposal.statusCode, 201);
    assert.equal(
      (await get(activity.id)).dueDate,
      "2026-11-10",
      "preview does not activate",
    );
    const confirmed = await request(
      a,
      "POST",
      `/api/v1/plan-proposals/${proposal.json().id}/apply`,
      { confirmations: ["academic_date_change"] },
      proposal.headers.etag,
    );
    assert.equal(confirmed.statusCode, 200);
    activity = confirmed.json<ActivityDto>();
    assert.equal(activity.dueDate, "2026-11-12");
    assert.equal(activity.dueTime, "10:00");
    assert.equal(activity.timezone, "America/Lima");
    assert.equal(activity.realTotalMinutes, 100);
    assert.equal(activity.fulfillmentState, "fulfilled");
    const dates = await request(
      a,
      "GET",
      `/api/v1/activities/${activity.id}/date-history`,
    );
    assert.equal(dates.statusCode, 200);
    assert.equal(dates.json().items[0].before.dueDate, "2026-11-10");
    const stale = await request(
      a,
      "POST",
      `/api/v1/activities/${activity.id}/date-change-proposals`,
      {
        dueDate: "2026-11-13",
        evaluationEndAt: "2026-11-13T17:00:00Z",
        source: { kind: "manual" },
      },
      tag(activity),
    );
    assert.equal(stale.statusCode, 201);
    const renamed = await request(
      a,
      "PATCH",
      `/api/v1/activities/${activity.id}`,
      { title: "Parcial actualizado" },
      tag(activity),
    );
    assert.equal(renamed.statusCode, 200);
    activity = renamed.json<ActivityDto>();
    assert.equal(
      (
        await request(
          a,
          "POST",
          `/api/v1/plan-proposals/${stale.json().id}/apply`,
          { confirmations: ["academic_date_change"] },
          stale.headers.etag,
        )
      ).statusCode,
      412,
    );
    assert.equal((await get(activity.id)).dueDate, "2026-11-12");
    const race = await Promise.all([
      request(
        a,
        "PATCH",
        `/api/v1/activities/${activity.id}`,
        { description: "A" },
        tag(activity),
      ),
      request(
        a,
        "PATCH",
        `/api/v1/activities/${activity.id}`,
        { description: "B" },
        tag(activity),
      ),
    ]);
    assert.deepEqual(race.map((r) => r.statusCode).sort(), [200, 412]);
    const parent = missing.json<ActivityDto>();
    const child = zero.json<ActivityDto>();
    const constraint = await request(
      a,
      "PUT",
      `/api/v1/activities/${child.id}/constraints`,
      { dependencies: [parent.id] },
      tag(child),
    );
    assert.equal(constraint.statusCode, 200);
    const cycle = await request(
      a,
      "PUT",
      `/api/v1/activities/${parent.id}/constraints`,
      { dependencies: [child.id] },
      tag(parent),
    );
    assert.equal(cycle.statusCode, 422);
    const groupBad = await request(a, "POST", "/api/v1/activities", {
      periodId,
      title: "Grupo",
      type: "Entrega grupal",
      dueDate: "2026-11-20",
      operatingMinutes: 120,
    });
    assert.equal(groupBad.statusCode, 422);
    const group = await request(a, "POST", "/api/v1/activities", {
      periodId,
      title: "Grupo",
      type: "Entrega grupal",
      dueDate: "2026-11-20",
    });
    assert.equal(group.statusCode, 201);
    assert.equal(
      (
        await request(
          a,
          "PUT",
          `/api/v1/activities/${group.json().id}/progress`,
          { realTotalMinutes: 120 },
          group.headers.etag,
        )
      ).statusCode,
      422,
    );
    const noCsrf = await app.inject({
      method: "PATCH",
      url: `/api/v1/courses/${courseId}`,
      headers: {
        origin,
        cookie: a.cookie,
        "if-match": baseChanged.headers.etag,
      },
      payload: { name: "No CSRF" },
    });
    assert.equal(noCsrf.statusCode, 403);
    const spec = (await app.inject("/api/v1/openapi.json")).json();
    assert.equal(spec.openapi, "3.1.0");
    assert.ok(spec.paths["/api/v1/activities"]);
    assert.ok(spec.paths["/api/v1/activities/{id}/progress"]);
  } finally {
    await app.close();
    await db.pool.end();
    await ids.pool.end();
  }
});
