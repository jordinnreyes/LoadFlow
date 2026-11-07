import test from "node:test";
import assert from "node:assert/strict";
import { plan, priorityOrder } from "../../packages/planning-core/plan.js";
import { validateSessions } from "../../packages/planning-core/validate.js";
import {
  academicMinute,
  horizon,
  instantMinute,
} from "../../packages/planning-core/normalize.js";
import type { Activity, Snapshot } from "../../packages/planning-core/model.js";
import { calculatePlan } from "../../server/modules/planning/calculate.js";

export const activity = (
  id: string,
  values: Partial<Activity> = {},
): Activity => ({
  id,
  type: "Tarea",
  confirmedAt: 0,
  dueDate: "2030-01-01",
  deadline: 300,
  start: 0,
  evaluationEnd: null,
  pending: 60,
  needsReview: false,
  priority: null,
  divisible: true,
  dependencies: [],
  done: false,
  fulfilled: false,
  group: null,
  ...values,
});
export const snapshot = (
  activities: Activity[],
  values: Partial<Snapshot> = {},
): Snapshot => ({
  now: 0,
  end: 600,
  timezone: "America/Lima",
  provisionalHorizon: false,
  availabilityKnown: true,
  sourceFreshUntil: null,
  windows: [{ start: 0, end: 600 }],
  occupied: [],
  coverage: [{ start: 0, end: 600 }],
  sourceIssues: [],
  activities,
  sessions: [],
  equivalences: [],
  preferences: { minimum: 30, preferred: 60, maximum: 120 },
  scope: null,
  ...values,
});

test("F4 uses declared priority, deadlines, confirmation and IDs with dependency precedence", () => {
  const input = [
    activity("absent", { deadline: 90 }),
    activity("low", { priority: "Baja" }),
    activity("high", { priority: "Alta", dependencies: ["absent"] }),
  ];
  assert.deepEqual(
    priorityOrder(input).map((a) => a.id),
    ["high", "low", "absent"],
  );
  const contest = snapshot(
    [
      activity("unknown", { deadline: 60 }),
      activity("declared", { priority: "Baja", deadline: 120 }),
    ],
    { windows: [{ start: 0, end: 60 }], coverage: [{ start: 0, end: 120 }] },
  );
  assert.equal(plan(contest).sessions[0].activityId, "declared");
  const equal = snapshot(
    [
      activity("later", { deadline: 120, priority: "Alta" }),
      activity("sooner", { deadline: 60, priority: "Alta" }),
    ],
    { windows: [{ start: 0, end: 60 }], coverage: [{ start: 0, end: 120 }] },
  );
  assert.equal(plan(equal).sessions[0].activityId, "sooner");
  const result = plan(snapshot(input));
  assert.ok(
    result.sessions.find((s) => s.activityId === "high")!.start >=
      result.sessions.find((s) => s.activityId === "absent")!.end,
  );
  assert.equal(
    validateSessions(snapshot(input), result.sessions).issues.length,
    0,
  );
});

test("F4 repairs a greedy placement while preserving fixed sessions and exact effort", () => {
  const input = snapshot(
    [
      activity("a", { divisible: false }),
      activity("b", { pending: 120, divisible: false }),
    ],
    {
      windows: [
        { start: 0, end: 120 },
        { start: 180, end: 240 },
      ],
    },
  );
  const result = plan(input);
  assert.equal(result.state, "viable");
  assert.equal(
    result.balances.reduce((n, b) => n + b.unplaced!, 0),
    0,
  );
  assert.ok(result.exploredStates > 0);
  assert.equal(validateSessions(input, result.sessions).issues.length, 0);
  assert.deepEqual(plan(input), result);
  assert.deepEqual(input.sessions, []);
});

test("F4 distinguishes missing inputs, confirmed deficit, structural conflict and incomplete search", () => {
  assert.equal(
    plan(snapshot([activity("unknown", { deadline: null })])).state,
    "partial",
  );
  const deficit = plan(
    snapshot([activity("a", { pending: 90 })], {
      windows: [{ start: 0, end: 60 }],
    }),
  );
  assert.equal(deficit.state, "deficit");
  assert.equal(deficit.balances[0].unplaced, 30);
  const structural = plan(
    snapshot([activity("a", { pending: 90, divisible: false })], {
      windows: [
        { start: 0, end: 60 },
        { start: 120, end: 180 },
      ],
    }),
  );
  assert.equal(structural.state, "conflict");
  const remainder = plan(snapshot([activity("a", { pending: 20 })]));
  assert.equal(remainder.state, "partial");
  assert.ok(
    remainder.diagnostics.some((d) => d.code === "DISTRIBUTION_NOT_FOUND"),
  );
  const stale = plan(
    snapshot([activity("a")], {
      coverage: [],
      availabilityKnown: false,
      sourceIssues: ["CALENDAR_STALE"],
    }),
  );
  assert.equal(stale.sessions.length, 0);
  assert.equal(stale.state, "partial");
});

test("F4 validator rejects invalid sessions independently and keeps frozen blocks unchanged", () => {
  const input = snapshot([activity("a")]);
  const result = plan(input);
  const s = result.sessions[0];
  assert.ok(
    validateSessions(input, [{ ...s, start: -1 }]).issues.some(
      (d) => d.code === "SESSION_IN_PAST",
    ),
  );
  assert.ok(
    validateSessions(input, [{ ...s, end: 301 }]).issues.some(
      (d) => d.code === "SESSION_AFTER_CUTOFF",
    ),
  );
  const existing = snapshot([activity("a")], {
    sessions: [{ ...s, start: 180, end: 240 }],
  });
  assert.deepEqual(plan(existing).sessions, existing.sessions);
  const frozen = snapshot([activity("a")], {
    sessions: [{ ...s, fixed: true }],
  });
  assert.ok(
    validateSessions(frozen, []).issues.some(
      (d) => d.code === "PRESERVED_SESSION_CHANGED",
    ),
  );
  const recalculated = plan(frozen);
  assert.deepEqual(recalculated.sessions, frozen.sessions);
  const scoped = snapshot([activity("a"), activity("b")], {
    sessions: [s],
    scope: "b",
  });
  assert.ok(
    plan(scoped).sessions.some(
      (other) => other.id === s.id && other.start === s.start && !other.fixed,
    ),
  );
  const exam = snapshot([
    activity("exam", {
      type: "Examen parcial",
      deadline: 60,
      evaluationEnd: 120,
    }),
    activity("a"),
  ]);
  assert.ok(
    validateSessions(exam, [{ ...s, start: 60, end: 120 }]).issues.some(
      (d) => d.code === "SESSION_BUSY",
    ),
  );
  const collision = plan({ ...frozen, occupied: [{ start: 0, end: 30 }] });
  assert.equal(collision.state, "conflict");
  assert.equal(collision.balances[0].scheduled, 60);
  assert.ok(
    collision.sessions.some((other) => other.id === s.id && other.fixed),
  );
});

test("F4 treats cycles, indivisibility and groups without inventing individual effort", () => {
  const cycle = plan(
    snapshot([
      activity("a", { dependencies: ["b"] }),
      activity("b", { dependencies: ["a"] }),
    ]),
  );
  assert.equal(cycle.state, "conflict");
  assert.equal(cycle.sessions.length, 0);
  const group = activity("g", {
    type: "Entrega grupal",
    pending: null,
    group: { enabled: true, accepted: false, count: 3, minutes: 120 },
    deadline: 6000,
  });
  const result = plan(
    snapshot([group], {
      end: 6000,
      windows: [
        { start: 0, end: 120 },
        { start: 1440, end: 1560 },
        { start: 2880, end: 3000 },
      ],
      coverage: [{ start: 0, end: 6000 }],
    }),
  );
  assert.equal(result.sessions.length, 3);
  assert.equal(result.balances[0].required, 360);
  assert.equal(result.state, "partial");
  assert.ok(result.sessions.every((s) => s.kind === "group" && !s.accepted));
});

test("F4 clock, horizon and academic zones are explicit and do not invent a cutoff", () => {
  const now = new Date("2030-03-01T10:00:01Z");
  assert.equal(
    horizon(now, null, null, [instantMinute("2030-05-01T10:00Z")]).end,
    instantMinute("2030-05-01T10:00Z"),
  );
  assert.equal(
    horizon(now, "2030-03-10", "America/New_York", []).end,
    instantMinute("2030-03-11T04:00Z"),
  );
  assert.equal(academicMinute("2030-03-01", null, "America/Lima"), null);
  assert.equal(
    academicMinute("2030-03-01", "10:00", "America/Lima"),
    instantMinute("2030-03-01T15:00Z"),
  );
  assert.throws(() =>
    academicMinute("2030-03-10", "02:30", "America/New_York"),
  );
  assert.throws(
    () => plan(snapshot([activity("a")]), () => true),
    /PLANNING_TIMEOUT/,
  );
});

test("F4 placements agree with an independent minute-grid oracle on small indivisible cases", () => {
  const slots = 7;
  const feasible = (
    tasks: Activity[],
    occupied: number,
    index = 0,
  ): boolean => {
    if (index === tasks.length) return true;
    const task = tasks[index];
    for (
      let start = task.start!;
      start + task.pending! <= task.deadline!;
      start++
    ) {
      const block = ((1 << task.pending!) - 1) << start;
      if (!(occupied & block) && feasible(tasks, occupied | block, index + 1))
        return true;
    }
    return false;
  };
  for (let sample = 0; sample < 64; sample++) {
    const occupied = (sample * 13) & 0b0101010;
    const tasks = Array.from({ length: 3 }, (_, i) =>
      activity(String(i), {
        pending: 1 + ((sample >> i) % 3),
        start: (sample + i) % 2,
        deadline: slots - ((sample >> (i + 1)) % 3),
        divisible: false,
      }),
    );
    const input = snapshot(tasks, {
      end: slots,
      windows: [{ start: 0, end: slots }],
      coverage: [{ start: 0, end: slots }],
      occupied: Array.from({ length: slots }, (_, start) => ({
        start,
        end: start + 1,
      })).filter((s) => occupied & (1 << s.start)),
      preferences: { minimum: 1, preferred: 2, maximum: 3 },
    });
    const result = plan(input);
    assert.equal(
      result.balances.every((b) => b.unplaced === 0),
      feasible(tasks, occupied),
      `case ${sample}`,
    );
    assert.deepEqual(validateSessions(input, result.sessions).issues, []);
    for (const b of result.balances)
      assert.equal(b.required, b.scheduled + b.covered + b.unplaced!);
  }
});

test("F4 aborts an isolated calculation without returning a partial distribution on timeout", async () => {
  const input = snapshot([activity("task")]);
  await assert.rejects(calculatePlan(input, 1), { code: "PLANNING_TIMEOUT" });
  assert.equal((await calculatePlan(input)).state, "viable");
});
