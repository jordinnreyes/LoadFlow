import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { fixture } from "./fixture.js";
import { CalendarWorker } from "../../server/modules/jobs/calendar-worker.js";
import {
  CalendarFailure,
  SCOPES,
  type CalendarProvider,
  type Token,
} from "../../server/modules/calendar/provider.js";
test("Calendar consent, private queue, fresh/stale/partial coverage, bounded retries and disconnect races use real PostgreSQL", async () => {
  const now = new Date("2030-01-01T12:00:00Z");
  let failure: CalendarFailure | undefined,
    refreshes = 0,
    revoked = 0;
  let partialSource = false,
    unauthorizedOnce = false;
  let hold: Promise<void> | undefined, entered: (() => void) | undefined;
  const token = (): Token => ({
    accessToken: "fixture-access-private",
    refreshToken: "fixture-refresh-private",
    expiresAt: now.getTime() + 3600000,
    scopes: [...SCOPES],
  });
  const provider: CalendarProvider = {
    authorization: (state) => `https://fixture.test/consent?state=${state}`,
    exchange: async () => token(),
    refresh: async () => {
      refreshes++;
      return token();
    },
    revoke: async () => {
      revoked++;
    },
    calendars: async () => [
      {
        providerId: "one",
        name: "Clases ficticias",
        timezone: "America/Lima",
        primary: true,
      },
      {
        providerId: "two",
        name: "Personal ficticio",
        timezone: "America/Lima",
        primary: false,
      },
    ],
    busy: async (_t, ids, from, to) => {
      assert.ok(Date.parse(to) - Date.parse(from) <= 32 * 86400000);
      if (failure) throw failure;
      if (unauthorizedOnce) {
        unauthorizedOnce = false;
        throw new CalendarFailure("CALENDAR_UNAUTHORIZED");
      }
      if (hold) {
        entered?.();
        await hold;
      }
      return ids.map((id) => ({
        providerId: id,
        ...(partialSource && id === "two"
          ? { error: "CALENDAR_SOURCE_UNAVAILABLE" }
          : {}),
        busy:
          id === "one"
            ? [
                {
                  startAt: "2030-01-07T14:00:00Z",
                  endAt: "2030-01-07T15:00:00Z",
                },
              ]
            : [],
      }));
    },
  };
  const f = await fixture(now, provider),
    worker = new CalendarWorker(f.calendar, () => 0);
  try {
    const a = await f.client(),
      b = await f.client(),
      r = f.request;
    const period = (await r(a, "GET", "/api/v1/periods")).json().items[0].id;
    const config = {
      confirmed: true,
      timezone: "America/Lima",
      validFrom: "2030-01-01",
      validTo: null,
      weekly: Array.from({ length: 7 }, (_, i) => ({
        weekday: i + 1,
        state: "windows",
        intervals: [{ startMinute: 540, endMinute: 720 }],
      })),
      exceptions: [],
      manualCoverage: [],
      preferences: {
        minimumMinutes: 30,
        preferredMinutes: 60,
        maximumMinutes: 120,
      },
    };
    assert.equal(
      (
        await r(
          a,
          "PUT",
          `/api/v1/periods/${period}/availability`,
          config,
          '"availability-0"',
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await r(a, "POST", "/api/v1/activities", {
          periodId: period,
          title: "Evaluación ficticia",
          type: "Examen parcial",
          dueDate: "2030-03-10",
          dueTime: "09:00",
          timezone: "America/Lima",
        })
      ).statusCode,
      201,
    );
    const initial = (await r(a, "GET", "/api/v1/calendar/connection")).json();
    assert.equal(initial.state, "not_connected");
    async function authorize(cancel = false) {
      const start = await r(a, "POST", "/api/v1/calendar/authorization");
      assert.equal(start.statusCode, 200, start.body);
      const state = new URL(start.json().authorizationUrl).searchParams.get(
        "state",
      );
      const set = start.headers["set-cookie"];
      const browser = (Array.isArray(set) ? set[0] : set)!.split(";")[0];
      return f.app.inject({
        method: "GET",
        url: `/api/v1/calendar/callback?state=${state}&${cancel ? "error=access_denied" : "code=fixture-code"}`,
        headers: { cookie: `${a.cookie}; ${browser}` },
      });
    }
    const cancelled = await authorize(true);
    assert.equal(cancelled.statusCode, 400);
    assert.equal((await r(a, "GET", "/api/v1/auth/session")).statusCode, 200);
    const connected = await authorize();
    assert.equal(connected.statusCode, 200, connected.body);
    assert.equal(connected.json().state, "partial");
    const refresh = () =>
      r(a, "POST", "/api/v1/calendar/refresh", {
        periodId: period,
        reason: "manual",
      });
    const first = await refresh();
    assert.equal(first.statusCode, 202, first.body);
    assert.equal((await refresh()).json().deduplicated, true);
    assert.equal((await r(b, "GET", first.json().statusUrl)).statusCode, 404);
    const firstJob = await worker.claim();
    assert.equal(firstJob.id, first.json().job.id);
    await worker.process(firstJob);
    const sources = (await r(a, "GET", "/api/v1/calendar/calendars")).json();
    assert.equal(sources.items.length, 2);
    assert.equal(JSON.stringify(sources).includes("fixture-access"), false);
    const select = await r(
      a,
      "PUT",
      "/api/v1/calendar/selection",
      { calendarIds: sources.items.map((x: { id: string }) => x.id) },
      '"calendar-1"',
    );
    assert.equal(select.statusCode, 200, select.body);
    now.setTime(now.getTime() + 61000);
    const next = await refresh();
    assert.equal(next.statusCode, 202, next.body);
    const j = await worker.claim();
    await worker.process(j);
    assert.equal(
      (await r(a, "GET", next.json().statusUrl)).json().status,
      "succeeded",
    );
    const range =
      "/api/v1/calendar/busy?from=2030-01-07T05:00:00Z&to=2030-01-08T05:00:00Z";
    const busy = (await r(a, "GET", range)).json();
    assert.equal(busy.coverage, "complete");
    assert.equal(busy.busy.length, 1);
    const cap = `/api/v1/periods/${period}/capacity?from=2030-01-07&to=2030-01-08`;
    assert.equal((await r(a, "GET", cap)).json().availableMinutes, 120);
    const stableWorkspace = (
      await r(a, "GET", `/api/v1/periods/${period}/availability`)
    ).json().workspaceRevision;
    now.setTime(now.getTime() + 61000);
    unauthorizedOnce = true;
    const renew = await refresh();
    await worker.process((await worker.claim())!);
    assert.equal(
      (await r(a, "GET", renew.json().statusUrl)).json().status,
      "succeeded",
    );
    assert.equal(refreshes, 1);
    assert.equal(
      (await r(a, "GET", `/api/v1/periods/${period}/availability`)).json()
        .workspaceRevision,
      stableWorkspace,
    );
    now.setTime(now.getTime() + 61000);
    partialSource = true;
    const partial = await refresh();
    await worker.process((await worker.claim())!);
    assert.equal(
      (await r(a, "GET", partial.json().statusUrl)).json().status,
      "partial",
    );
    assert.equal((await r(a, "GET", range)).json().coverage, "partial");
    assert.equal((await r(a, "GET", cap)).json().availableMinutes, null);
    now.setTime(now.getTime() + 61000);
    partialSource = false;
    await refresh();
    await worker.process((await worker.claim())!);
    assert.equal((await r(a, "GET", range)).json().coverage, "complete");
    const outside = (
      await r(
        a,
        "GET",
        "/api/v1/calendar/busy?from=2030-04-01T00:00:00Z&to=2030-04-02T00:00:00Z",
      )
    ).json();
    assert.equal(outside.coverage, "unknown");
    const availability = await r(
      a,
      "GET",
      `/api/v1/periods/${period}/availability`,
    );
    const manual = await r(
      a,
      "PUT",
      `/api/v1/periods/${period}/availability`,
      { ...config, manualCoverage: [{ from: "2030-04-01", to: "2030-04-02" }] },
      availability.headers.etag,
    );
    assert.equal(manual.statusCode, 200, manual.body);
    assert.equal(
      (
        await r(
          a,
          "GET",
          `/api/v1/periods/${period}/capacity?from=2030-04-01&to=2030-04-02`,
        )
      ).json().availableMinutes,
      180,
    );
    now.setTime(now.getTime() + 31 * 60000);
    assert.equal(
      (await r(a, "GET", "/api/v1/calendar/connection")).json().state,
      "stale",
    );
    assert.equal((await r(a, "GET", cap)).json().availableMinutes, null);
    assert.equal((await r(a, "GET", range)).json().busy.length, 1);
    failure = new CalendarFailure("CALENDAR_RATE_LIMITED", true, 180);
    const limited = await refresh();
    const limitedJob = await worker.claim();
    await worker.process(limitedJob);
    const pending = (await r(a, "GET", limited.json().statusUrl)).json();
    assert.equal(pending.status, "queued");
    assert.ok(Date.parse(pending.runAfter) >= now.getTime() + 180000);
    assert.equal(await worker.claim(), undefined);
    now.setTime(now.getTime() + 181000);
    await worker.process((await worker.claim())!);
    now.setTime(now.getTime() + 181000);
    await worker.process((await worker.claim())!);
    assert.equal(
      (await r(a, "GET", limited.json().statusUrl)).json().status,
      "failed",
    );
    assert.equal((await r(a, "GET", range)).json().busy.length, 1);
    failure = undefined;
    now.setTime(now.getTime() + 61000);
    const race = await refresh();
    const raceJob = await worker.claim();
    let release!: () => void;
    hold = new Promise<void>((resolve) => (release = resolve));
    const started = new Promise<void>((resolve) => (entered = resolve));
    const processing = worker.process(raceJob);
    await started;
    const disconnectKey = randomUUID();
    const disconnected = await r(
      a,
      "DELETE",
      "/api/v1/calendar/connection",
      undefined,
      '"calendar-2"',
      disconnectKey,
    );
    assert.equal(disconnected.statusCode, 200, disconnected.body);
    assert.equal(disconnected.json().revocation, "confirmed");
    const repeated = await r(
      a,
      "DELETE",
      "/api/v1/calendar/connection",
      undefined,
      '"calendar-2"',
      disconnectKey,
    );
    assert.equal(repeated.json().revocation, "confirmed");
    release();
    await processing;
    hold = undefined;
    assert.equal(
      (await r(a, "GET", race.json().statusUrl)).json().status,
      "cancelled",
    );
    assert.equal(
      (await r(a, "GET", "/api/v1/calendar/connection")).json().state,
      "not_connected",
    );
    assert.equal((await r(a, "GET", range)).json().busy.length, 1);
    assert.equal(revoked, 1);
    assert.equal(refreshes, 1);
    assert.equal((await r(a, "GET", "/api/v1/auth/session")).statusCode, 200);
    const privateDenied = await f.db.pool.query(
      "select has_table_privilege(current_user,'app.calendar_credentials','select') as allowed",
    );
    assert.equal(privateDenied.rows[0].allowed, false);
    const own = await f.academics.read(b.owner, (ctx) =>
      ctx.db.execute(sql`select id from app.jobs`),
    );
    assert.equal(own.rows.length, 0);
  } finally {
    await f.close();
  }
});
