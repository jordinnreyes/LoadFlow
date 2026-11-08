import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { ownerTransaction } from "../../server/db/client.js";
import { fixture } from "./fixture.js";
import { CalendarWorker } from "../../server/modules/jobs/calendar-worker.js";
import {
  CalendarFailure,
  EVENT_TITLES_SCOPE,
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
  const visibleWeek = {
    from: "2029-12-31T05:00:00.000Z",
    to: "2030-01-07T05:00:00.000Z",
  };
  const weekBlocks = [
    { startAt: "2029-12-31T14:00:00.000Z", endAt: "2029-12-31T15:00:00.000Z" },
    { startAt: "2030-01-06T14:00:00.000Z", endAt: "2030-01-06T15:00:00.000Z" },
  ];
  const weeklyQueries: { from: string; to: string }[] = [];
  const initialSyncQueries: { from: string; to: string }[] = [];
  const titleQueries: string[] = [];
  let titleHold: Promise<void> | undefined,
    titleEntered: (() => void) | undefined;
  let hold: Promise<void> | undefined, entered: (() => void) | undefined;
  const token = (): Token => ({
    accessToken: "fixture-access-private",
    refreshToken: "fixture-refresh-private",
    expiresAt: now.getTime() + 3600000,
    scopes: [...SCOPES],
  });
  const provider: CalendarProvider = {
    authorization: (state) => `https://fixture.test/consent?state=${state}`,
    exchange: async (code) =>
      code === "fixture-code"
        ? token()
        : {
            ...token(),
            scopes: [...SCOPES, EVENT_TITLES_SCOPE],
            accessToken: code,
          },
    refresh: async () => {
      refreshes++;
      return token();
    },
    revoke: async () => {
      revoked++;
    },
    calendars: async (credential) => {
      if (failure?.revoked) throw failure;
      return [
        {
          providerId:
            credential.accessToken === "wrong-google-account" ? "wrong" : "one",
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
        {
          providerId: "unused",
          name: "Sin seleccionar",
          timezone: "America/Lima",
          primary: false,
        },
      ];
    },
    events: async (credential, source) => {
      assert.ok(credential.scopes.includes(EVENT_TITLES_SCOPE));
      titleQueries.push(source.providerId);
      if (titleHold) {
        titleEntered?.();
        await titleHold;
      }
      return {
        items:
          source.providerId === "one"
            ? [
                {
                  ...weekBlocks[0],
                  title: "Clase ficticia",
                  allDay: false,
                  blocksTime: true,
                },
              ]
            : [],
        partial: false,
      };
    },
    busy: async (_t, ids, from, to) => {
      assert.ok(Date.parse(to) - Date.parse(from) <= 32 * 86400000);
      const weekly = from === visibleWeek.from && to === visibleWeek.to;
      if (weekly) weeklyQueries.push({ from, to });
      else if (from === visibleWeek.from) initialSyncQueries.push({ from, to });
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
          id === "one" && weekly
            ? weekBlocks
            : id === "one"
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
    async function authorize(
      cancel = false,
      titles = false,
      code = "fixture-code",
    ) {
      const start = await r(
        a,
        "POST",
        `/api/v1/calendar/authorization${titles ? "?eventTitles=true" : ""}`,
      );
      assert.equal(start.statusCode, 200, start.body);
      const consent = new URL(start.json().authorizationUrl).searchParams;
      const state = consent.get("state");
      const set = start.headers["set-cookie"];
      const browser = (Array.isArray(set) ? set[0] : set)!.split(";")[0];
      return f.app.inject({
        method: "GET",
        url: `/api/v1/calendar/callback?state=${state}&${cancel ? "error=access_denied" : `code=${code}`}`,
        headers: { cookie: `${a.cookie}; ${browser}` },
      });
    }
    const cancelled = await authorize(true);
    assert.equal(cancelled.statusCode, 400);
    assert.equal((await r(a, "GET", "/api/v1/auth/session")).statusCode, 200);
    const connected = await authorize();
    assert.equal(connected.statusCode, 200, connected.body);
    assert.equal(connected.json().state, "partial");
    assert.equal(connected.json().eventTitlesAuthorized, false);
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
    assert.equal(sources.items.length, 3);
    assert.equal(JSON.stringify(sources).includes("fixture-access"), false);
    const select = await r(
      a,
      "PUT",
      "/api/v1/calendar/selection",
      {
        calendarIds: sources.items
          .filter((x: { name: string }) => x.name !== "Sin seleccionar")
          .map((x: { id: string }) => x.id),
      },
      '"calendar-1"',
    );
    assert.equal(select.statusCode, 200, select.body);
    const next = await r(a, "POST", "/api/v1/calendar/refresh", {
      periodId: period,
      reason: "manual",
      includeCurrentWeek: true,
    });
    assert.equal(next.statusCode, 202, next.body);
    assert.equal(Date.parse(next.json().job.runAfter) - now.getTime(), 3000);
    assert.equal(await worker.claim(), undefined);
    now.setTime(now.getTime() + 3000);
    const j = await worker.claim();
    await worker.process(j);
    assert.equal(
      (await r(a, "GET", next.json().statusUrl)).json().status,
      "succeeded",
    );
    assert.deepEqual(initialSyncQueries, [
      {
        from: visibleWeek.from,
        to: "2030-01-31T05:00:00.000Z",
      },
    ]);
    const firstWeekUrl = `/api/v1/calendar/busy?from=${visibleWeek.from}&to=${visibleWeek.to}`;
    const firstWeek = await r(a, "GET", firstWeekUrl);
    assert.equal(firstWeek.json().coverage, "complete");
    const titlesUrl = `/api/v1/calendar/events?from=${visibleWeek.from}&to=${visibleWeek.to}`;
    assert.deepEqual((await r(a, "GET", titlesUrl)).json(), {
      items: [],
      partial: false,
    });
    assert.equal((await authorize(true, true)).statusCode, 400);
    assert.equal((await authorize(false, true)).statusCode, 403);
    assert.equal(
      (await authorize(false, true, "wrong-google-account")).statusCode,
      422,
    );
    const enabled = await authorize(false, true, "fixture-title-grant");
    assert.equal(enabled.statusCode, 200, enabled.body);
    assert.equal(enabled.json().eventTitlesEnabled, true);
    assert.equal(enabled.json().selectedCount, 2);
    assert.equal(enabled.json().revision, 2);
    const events = await r(a, "GET", titlesUrl);
    assert.equal(events.headers["cache-control"], "no-store");
    assert.equal(events.json().items[0].title, "Clase ficticia");
    assert.deepEqual(titleQueries.sort(), ["one", "two"]);
    assert.deepEqual((await r(b, "GET", titlesUrl)).json(), {
      items: [],
      partial: false,
    });
    const setTitles = (visible: boolean) =>
      r(a, "PUT", "/api/v1/calendar/event-titles", { visible });
    const hidden = await setTitles(false);
    assert.equal(hidden.statusCode, 200, hidden.body);
    assert.equal(hidden.json().eventTitlesEnabled, false);
    assert.equal(hidden.json().eventTitlesAuthorized, true);
    assert.deepEqual((await r(a, "GET", titlesUrl)).json(), {
      items: [],
      partial: false,
    });
    assert.equal(titleQueries.length, 2);
    assert.equal((await setTitles(true)).json().eventTitlesEnabled, true);
    assert.equal(
      (await r(a, "GET", titlesUrl)).json().items[0].title,
      "Clase ficticia",
    );
    let releaseTitles!: () => void;
    titleHold = new Promise<void>((resolve) => (releaseTitles = resolve));
    const fetchingTitles = new Promise<void>(
      (resolve) => (titleEntered = resolve),
    );
    const pendingTitles = r(a, "GET", titlesUrl);
    try {
      await Promise.race([
        fetchingTitles,
        pendingTitles.then(() =>
          assert.fail(
            "La consulta terminó antes de llegar al proveedor de prueba.",
          ),
        ),
      ]);
      assert.equal((await setTitles(false)).json().eventTitlesEnabled, false);
    } finally {
      releaseTitles();
      titleHold = undefined;
    }
    assert.deepEqual((await pendingTitles).json(), {
      items: [],
      partial: false,
    });
    assert.equal((await r(a, "GET", firstWeekUrl)).json().coverage, "complete");
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
    now.setTime(now.getTime() + 61000);
    const refreshWeek = (weekStart: string, reason = "manual") =>
      r(a, "POST", "/api/v1/calendar/refresh", {
        periodId: period,
        reason,
        weekStart,
      });
    assert.equal((await refreshWeek("2030-01-01")).statusCode, 422);
    assert.equal(
      (await refreshWeek("2029-12-31", "foreground")).statusCode,
      422,
    );
    const weekly = await refreshWeek("2029-12-31");
    assert.equal(weekly.statusCode, 202, weekly.body);
    assert.equal((await refreshWeek("2029-12-31")).json().deduplicated, true);
    assert.equal((await refreshWeek("2030-01-07")).statusCode, 409);
    await worker.process((await worker.claim())!);
    assert.equal(
      (await r(a, "GET", weekly.json().statusUrl)).json().status,
      "succeeded",
    );
    assert.deepEqual(weeklyQueries, [visibleWeek]);
    const weeklyBusy = (
      await r(
        a,
        "GET",
        `/api/v1/calendar/busy?from=${visibleWeek.from}&to=${visibleWeek.to}`,
      )
    ).json();
    assert.equal(weeklyBusy.coverage, "complete");
    assert.deepEqual(weeklyBusy.busy, weekBlocks);
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
    failure = new CalendarFailure("CALENDAR_UNREACHABLE", true);
    const limited = await refresh();
    const limitedJob = await worker.claim();
    await worker.process(limitedJob);
    const firstRetry = (await r(a, "GET", limited.json().statusUrl)).json();
    assert.equal(firstRetry.status, "queued");
    assert.equal(Date.parse(firstRetry.runAfter) - now.getTime(), 60000);
    assert.equal(await worker.claim(), undefined);
    assert.equal((await r(a, "GET", range)).json().coverage, "unknown");
    now.setTime(now.getTime() + 61000);
    failure = new CalendarFailure("CALENDAR_RATE_LIMITED", true, 180);
    await worker.process((await worker.claim())!);
    const pending = (await r(a, "GET", limited.json().statusUrl)).json();
    assert.equal(pending.status, "queued");
    assert.ok(Date.parse(pending.runAfter) >= now.getTime() + 180000);
    assert.equal(await worker.claim(), undefined);
    now.setTime(now.getTime() + 181000);
    await worker.process((await worker.claim())!);
    assert.equal(
      (await r(a, "GET", limited.json().statusUrl)).json().status,
      "failed",
    );
    assert.equal((await r(a, "GET", range)).json().busy.length, 1);
    failure = undefined;
    now.setTime(now.getTime() + 61000);
    const delayed = await refresh();
    assert.equal(delayed.statusCode, 202, delayed.body);
    const expired = await worker.claim();
    assert.ok(expired);
    let releaseExpired!: () => void;
    hold = new Promise<void>((resolve) => (releaseExpired = resolve));
    const waiting = new Promise<void>((resolve) => (entered = resolve));
    const obsolete = worker.process(expired);
    try {
      await Promise.race([
        waiting,
        obsolete.then(() =>
          assert.fail(
            "La consulta terminó antes de llegar al proveedor de prueba.",
          ),
        ),
      ]);
      now.setTime(now.getTime() + 61000);
      await worker.heartbeat(expired);
    } finally {
      releaseExpired();
      hold = undefined;
    }
    await obsolete;
    const abandoned = await r(a, "GET", delayed.json().statusUrl);
    assert.equal(abandoned.json().status, "running");
    assert.equal((await r(a, "GET", range)).json().coverage, "unknown");
    const peer = new CalendarWorker(f.calendar, () => 0);
    const claims = (await Promise.all([worker.claim(), peer.claim()])).filter(
      (claim) => !!claim,
    );
    assert.equal(claims.length, 1);
    const recovered = claims[0];
    assert.equal(recovered.id, expired.id);
    assert.equal(recovered.attempts, 2);
    assert.notEqual(recovered.lease_token, expired.lease_token);
    await peer.process(recovered);
    assert.equal(
      (await r(a, "GET", delayed.json().statusUrl)).json().status,
      "succeeded",
    );
    assert.equal((await r(a, "GET", range)).json().coverage, "complete");
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
    const combined = await authorize(false, false, "fixture-title-grant");
    assert.equal(combined.statusCode, 200, combined.body);
    assert.equal(combined.json().eventTitlesAuthorized, true);
    assert.equal(combined.json().eventTitlesEnabled, false);
    now.setTime(now.getTime() + 61000);
    failure = new CalendarFailure("CALENDAR_REVOKED", false, 0, true);
    const revokedRefresh = await refresh();
    assert.equal(revokedRefresh.statusCode, 202, revokedRefresh.body);
    await worker.process((await worker.claim())!);
    const revokedJob = (
      await r(a, "GET", revokedRefresh.json().statusUrl)
    ).json();
    assert.equal(revokedJob.status, "failed");
    assert.equal(revokedJob.attempts, 1);
    assert.equal(await worker.claim(), undefined);
    assert.equal(
      (await r(a, "GET", "/api/v1/calendar/connection")).json().state,
      "revoked",
    );
    assert.equal((await r(a, "GET", range)).json().coverage, "unknown");
    assert.equal((await r(a, "GET", "/api/v1/auth/session")).statusCode, 200);
    const manualCapacity = `/api/v1/periods/${period}/capacity?from=2030-04-01&to=2030-04-02`;
    assert.equal(
      (await r(a, "GET", manualCapacity)).json().availableMinutes,
      null,
    );
    const reconfirmed = await r(
      a,
      "PUT",
      `/api/v1/periods/${period}/availability`,
      {
        ...config,
        manualCoverage: [{ from: "2030-04-01", to: "2030-04-02" }],
      },
      manual.headers.etag,
    );
    assert.equal(reconfirmed.statusCode, 200, reconfirmed.body);
    assert.equal(
      (await r(a, "GET", manualCapacity)).json().availableMinutes,
      180,
    );
    failure = undefined;
    const combinedDisconnected = await r(
      a,
      "DELETE",
      "/api/v1/calendar/connection",
      undefined,
      `"calendar-${combined.json().revision}"`,
    );
    assert.equal(combinedDisconnected.json().revocation, "confirmed");
    assert.equal(
      combinedDisconnected.json().connection.eventTitlesAuthorized,
      false,
    );
    assert.deepEqual((await r(a, "GET", titlesUrl)).json(), {
      items: [],
      partial: false,
    });
    await ownerTransaction(f.ids.pool, a.owner, async (c) => {
      assert.equal(
        (await c.query("select id from app.calendar_credentials")).rowCount,
        0,
      );
    });
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
