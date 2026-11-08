import test from "node:test";
import assert from "node:assert/strict";
import {
  GoogleCalendarProvider,
  SCOPES,
  EVENT_TITLES_SCOPE,
  CalendarFailure,
  retryAfter,
  challenge,
  granted,
  type Token,
} from "../../server/modules/calendar/provider.js";
import {
  snapshotCoverage,
  type StoredSnapshot,
} from "../../server/modules/calendar/coverage.js";
import { calendarRanges } from "../../server/modules/calendar/ranges.js";
test("Calendar covers the last exact deadline across zones and chunks without truncation or assumed academic cutoffs", () => {
  const chunks = calendarRanges(
    new Date("2030-01-01T12:00:00Z"),
    "America/Lima",
    [
      {
        dueDate: "2030-03-10",
        timezone: "Pacific/Honolulu",
        dueAt: "2030-03-11T09:00:00Z",
      },
    ],
  );
  assert.equal(chunks.length, 3);
  assert.equal(chunks.at(-1)!.to, "2030-03-11T09:00:00.000Z");
  assert.ok(
    chunks.every(
      (c) =>
        Date.parse(c.to) > Date.parse(c.from) &&
        Date.parse(c.to) - Date.parse(c.from) <= 31 * 86400000,
    ),
  );
  const dateOnly = calendarRanges(
    new Date("2030-01-01T12:00:00Z"),
    "America/Lima",
    [{ dueDate: "2030-01-02", timezone: "Pacific/Honolulu", dueAt: null }],
  );
  assert.equal(dateOnly.at(-1)!.to, "2030-01-03T10:00:00.000Z");
});
const token: Token = {
  accessToken: "fixture-access",
  refreshToken: "fixture-refresh",
  expiresAt: Date.now() + 3600000,
  scopes: [...SCOPES],
};
const config = {
  clientId: "fixture-client",
  clientSecret: "fixture-secret",
  callback: "http://127.0.0.1:3001/api/v1/calendar/callback",
};
test("Calendar consent requests list, occupancy and event reading with state and S256 PKCE", () => {
  const provider = new GoogleCalendarProvider(config),
    u = new URL(provider.authorization("fixture-state", "fixture-verifier"));
  assert.equal(u.searchParams.get("state"), "fixture-state");
  assert.equal(
    u.searchParams.get("code_challenge"),
    challenge("fixture-verifier"),
  );
  assert.equal(
    u.searchParams.get("scope"),
    [...SCOPES, EVENT_TITLES_SCOPE].join(" "),
  );
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("include_granted_scopes"), "false");
  assert.ok(!u.toString().includes(config.clientSecret));
  assert.equal(
    granted([...SCOPES, "https://www.googleapis.com/auth/calendar"]),
    false,
  );
});
test("event titles request minimal fields, expand occurrences and handle all-day and hidden events", async () => {
  const p = new GoogleCalendarProvider(config, async (input) => {
    const url = new URL(String(input));
    assert.match(url.pathname, /\/example%40test\/events$/);
    assert.equal(url.searchParams.get("singleEvents"), "true");
    const fields = url.searchParams.get("fields") ?? "";
    assert.match(fields, /summary/);
    assert.doesNotMatch(fields, /attendees|description|location/);
    return url.searchParams.has("pageToken")
      ? Response.json({
          timeZone: "America/Lima",
          items: [
            {
              summary: "Clase",
              start: {
                dateTime: "2030-01-02T09:00:00",
                timeZone: "America/Lima",
              },
              end: { dateTime: "2030-01-02T10:00:00-05:00" },
              transparency: "transparent",
            },
            {
              summary: "Cancelado",
              status: "cancelled",
              start: { date: "2030-01-02" },
              end: { date: "2030-01-03" },
            },
          ],
        })
      : Response.json({
          timeZone: "America/Lima",
          nextPageToken: "next",
          items: [
            {
              summary: "Día libre",
              start: { date: "2030-01-01" },
              end: { date: "2030-01-02" },
            },
            { start: { date: "2030-01-02" }, end: { date: "2030-01-03" } },
          ],
        });
  });
  const result = await p.events(
    token,
    { providerId: "example@test", timezone: null },
    "2030-01-01T00:00:00Z",
    "2030-01-08T00:00:00Z",
    AbortSignal.timeout(1000),
  );
  assert.deepEqual(result, {
    items: [
      {
        title: "Día libre",
        startAt: "2030-01-01T05:00:00Z",
        endAt: "2030-01-02T05:00:00Z",
        allDay: true,
        blocksTime: true,
      },
      {
        title: "Clase",
        startAt: "2030-01-02T14:00:00Z",
        endAt: "2030-01-02T15:00:00Z",
        allDay: false,
        blocksTime: false,
      },
    ],
    partial: false,
  });
});
test("Google adapter limits fields, paginates calendars and batches FreeBusy at 50 without reading events", async () => {
  const urls: string[] = [],
    batches: number[] = [];
  const request: typeof fetch = async (input, init) => {
    const u = new URL(String(input));
    urls.push(u.pathname);
    if (u.pathname.endsWith("calendarList")) {
      assert.ok(u.searchParams.get("fields")?.includes("summary"));
      return Response.json({
        items: [
          {
            id: u.searchParams.has("pageToken") ? "b" : "a",
            summary: "Calendario ficticio",
            timeZone: "America/Lima",
            accessRole: "owner",
          },
        ],
        ...(u.searchParams.has("pageToken") ? {} : { nextPageToken: "next" }),
      });
    }
    const body = JSON.parse(String(init?.body));
    batches.push(body.items.length);
    assert.equal(body.calendarExpansionMax, 50);
    return Response.json({
      calendars: Object.fromEntries(
        body.items.map((x: { id: string }) => [x.id, { busy: [] }]),
      ),
    });
  };
  const p = new GoogleCalendarProvider(config, request);
  assert.equal((await p.calendars(token)).length, 2);
  assert.equal(
    (
      await p.busy(
        token,
        Array.from({ length: 51 }, (_, i) => String(i)),
        "2030-01-01T00:00:00Z",
        "2030-01-02T00:00:00Z",
      )
    ).length,
    51,
  );
  assert.deepEqual(batches, [50, 1]);
  assert.ok(urls.every((u) => !u.includes("/events")));
});
test("HTTP errors are sanitized, Retry-After is respected and invalid grants require reconnection", async () => {
  for (const [status, error, retryable, revoked] of [
    [429, { error: "secret-provider-details" }, true, false],
    [503, { error: "secret-provider-details" }, true, false],
    [
      403,
      { error: { errors: [{ reason: "rateLimitExceeded" }] } },
      true,
      false,
    ],
    [403, { error: { errors: [{ reason: "forbidden" }] } }, false, false],
    [401, { error: "unauthorized" }, false, false],
    [400, { error: "invalid_grant" }, false, true],
  ] as const) {
    const p = new GoogleCalendarProvider(config, async () =>
      Response.json(error, { status, headers: { "Retry-After": "180" } }),
    );
    await assert.rejects(
      () => p.refresh(token),
      (e: unknown) =>
        e instanceof CalendarFailure &&
        e.retryable === retryable &&
        e.revoked === revoked &&
        !e.message.includes("secret"),
    );
  }
  assert.equal(
    retryAfter(
      "Wed, 02 Jan 2030 00:03:00 GMT",
      Date.parse("2030-01-02T00:00:00Z"),
    ),
    180,
  );
  const htmlLimited = new GoogleCalendarProvider(
    config,
    async () =>
      new Response("private-provider-html", {
        status: 429,
        headers: { "Retry-After": "180" },
      }),
  );
  await assert.rejects(
    () => htmlLimited.refresh(token),
    (e: unknown) =>
      e instanceof CalendarFailure &&
      e.retryAfterSeconds === 180 &&
      e.retryable,
  );
});
test("a new complete snapshot replaces old occupancy; stale, missing or revoked coverage never becomes free", () => {
  const range = { start: 0, end: 1000 },
    now = new Date("2030-01-01T00:00:00Z"),
    c = {
      revision: 1,
      selection_revision: 1,
      state: "active",
      safe_error: null,
    };
  const snapshot: StoredSnapshot = {
    id: "a",
    calendar_id: "one",
    connection_revision: 1,
    selection_revision: 1,
    range_start: new Date(0),
    range_end: new Date(1000),
    fetched_at: new Date(now.getTime() - 60000),
    intervals: [{ start: 100, end: 200 }],
  };
  assert.equal(
    snapshotCoverage(["one"], [snapshot], range, now, c).coverage,
    "complete",
  );
  const empty = { ...snapshot, id: "b", fetched_at: now, intervals: [] };
  assert.deepEqual(
    snapshotCoverage(["one"], [snapshot, empty], range, now, c).busy,
    [],
  );
  const stale = snapshotCoverage(
    ["one"],
    [snapshot],
    range,
    new Date(now.getTime() + 1800001),
    c,
  );
  assert.equal(stale.coverage, "unknown");
  assert.deepEqual(stale.busy, snapshot.intervals);
  assert.equal(
    snapshotCoverage(["one", "missing"], [snapshot], range, now, c).coverage,
    "partial",
  );
  const failed = snapshotCoverage(["one"], [snapshot], range, now, c, {
    one: now.getTime(),
  });
  assert.equal(failed.coverage, "unknown");
  assert.equal(failed.busy.length, 1);
  assert.equal(
    snapshotCoverage(["one"], [snapshot], range, now, {
      ...c,
      state: "revoked",
    }).coverage,
    "unknown",
  );
  assert.deepEqual(
    snapshotCoverage(["one"], [snapshot], range, now, { ...c, revision: 2 })
      .busy,
    snapshot.intervals,
  );
});
