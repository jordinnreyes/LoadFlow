import test from "node:test";
import assert from "node:assert/strict";
import {
  union,
  subtract,
  resolveWindows,
  validateConfiguration,
  localPoint,
  dates,
  dayBoundary,
  nextDate,
} from "../../server/modules/availability/rules.js";
import type { AvailabilityConfig } from "../../packages/contracts/availability.js";

export const configuration = (): AvailabilityConfig => ({
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
  manualCoverage: [{ from: "2030-01-01", to: "2030-03-01" }],
  preferences: {
    minimumMinutes: 30,
    preferredMinutes: 60,
    maximumMinutes: 120,
  },
});
test("capacity uses the union of occupied intervals once and clips crossing commitments", () => {
  const windows = [
      { start: 0, end: 10 },
      { start: 5, end: 20 },
    ],
    busy = [
      { start: -2, end: 3 },
      { start: 2, end: 8 },
      { start: 8, end: 12 },
      { start: 18, end: 25 },
    ];
  assert.deepEqual(subtract(windows, busy), [{ start: 12, end: 18 }]);
  assert.deepEqual(
    union([
      { start: 10, end: 12 },
      { start: 0, end: 5 },
      { start: 5, end: 10 },
    ]),
    [{ start: 0, end: 12 }],
  );
  assert.equal(windows[1].end, 20);
});
test("explicit no-study, unknown, date exceptions, validity and past time remain distinct", () => {
  const c = configuration();
  c.weekly[0] = { weekday: 1, state: "unknown", intervals: [] };
  c.weekly[1] = { weekday: 2, state: "no_study", intervals: [] };
  validateConfiguration(c);
  assert.equal(
    resolveWindows(c, "2030-01-07", "2030-01-09", new Date("2030-01-01")).issues
      .length,
    1,
  );
  c.exceptions = [
    {
      date: "2030-01-07",
      mode: "replace",
      intervals: [{ startMinute: 600, endMinute: 720 }],
    },
  ];
  const r = resolveWindows(
    c,
    "2030-01-07",
    "2030-01-09",
    new Date("2030-01-07T16:30:01Z"),
  );
  assert.deepEqual(r.issues, []);
  assert.equal(r.windows[0].end - r.windows[0].start, 29 * 60000);
  c.validFrom = "2030-02-01";
  assert.equal(
    resolveWindows(c, "2030-01-08", "2030-01-09", new Date("2030-01-01"))
      .issues[0].code,
    "WINDOWS_UNKNOWN",
  );
});
test("DST gaps and repeated local times require review instead of inventing availability", () => {
  const c = configuration();
  c.timezone = "America/New_York";
  c.exceptions = [
    {
      date: "2030-03-10",
      mode: "replace",
      intervals: [{ startMinute: 150, endMinute: 210 }],
    },
  ];
  assert.equal(
    resolveWindows(c, "2030-03-10", "2030-03-11", new Date("2030-01-01"))
      .issues[0].code,
    "DST_REVIEW_REQUIRED",
  );
  c.exceptions = [
    {
      date: "2030-11-03",
      mode: "replace",
      intervals: [{ startMinute: 90, endMinute: 150 }],
    },
  ];
  assert.equal(
    resolveWindows(c, "2030-11-03", "2030-11-04", new Date("2030-01-01"))
      .windows.length,
    0,
  );
  assert.equal(
    dayBoundary(nextDate("2030-03-10"), c.timezone) -
      dayBoundary("2030-03-10", c.timezone),
    23 * 3600000,
  );
  assert.equal(
    localPoint("2030-01-07", 1440, "America/Lima"),
    localPoint("2030-01-08", 0, "America/Lima"),
  );
});
test("configuration rejects inconsistent days, reversed ranges and unconfirmed preferences", () => {
  const c = configuration();
  c.weekly[0].intervals = [{ startMinute: 720, endMinute: 540 }];
  assert.throws(() => validateConfiguration(c));
  const d = configuration();
  d.preferences.minimumMinutes = 0;
  assert.throws(() => validateConfiguration(d));
  assert.throws(() => dates("2030-01-01", "2030-03-01"));
  assert.equal(dates("2030-01-01", "2030-02-01").length, 31);
});
