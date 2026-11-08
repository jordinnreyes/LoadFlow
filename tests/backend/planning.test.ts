import test from "node:test";
import assert from "node:assert/strict";
import { plan, priorityOrder } from "../../packages/planning-core/plan.js";
import { validateSessions } from "../../packages/planning-core/validate.js";
import {
  academicMinute,
  horizon,
  instantMinute,
} from "../../packages/planning-core/normalize.js";
import {
  SEARCH_LIMIT,
  type Activity,
  type Session,
  type Snapshot,
} from "../../packages/planning-core/model.js";
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

test("F7 exhaustive minute-grid oracle checks priorities, coverage, dependencies and fixed sessions", () => {
  const slots = 7;
  const grid = (mask: number) =>
    Array.from({ length: slots }, (_, start) => ({
      start,
      end: start + 1,
    })).filter(({ start }) => mask & (1 << start));
  const oracle = (tasks: Activity[], usable: number, occupied: number) => {
    // The fixtures list prerequisites before their dependents. The scoring
    // order is independent of the order in which we enumerate placements.
    const scoreOrder = [1, 2, 0];
    const ends: (number | null)[] = [];
    let best = [0, 0, 0];
    function enumerate(index: number, taken: number) {
      if (index === tasks.length) {
        const score = scoreOrder.map((i) =>
          ends[i] === null ? 0 : tasks[i].pending!,
        );
        const difference = score.findIndex((value, i) => value !== best[i]);
        if (difference >= 0 && score[difference] > best[difference])
          best = score;
        return;
      }
      ends[index] = null;
      enumerate(index + 1, taken);
      const task = tasks[index];
      const prerequisites = task.dependencies.map((id) => ends[Number(id)]);
      if (prerequisites.includes(null)) return;
      for (
        let start = Math.max(task.start!, ...prerequisites.map((end) => end!));
        start + task.pending! <= task.deadline!;
        start++
      ) {
        const mask = ((1 << task.pending!) - 1) << start;
        if ((mask & usable) !== mask || mask & taken) continue;
        ends[index] = start + task.pending!;
        enumerate(index + 1, taken | mask);
      }
    }
    enumerate(0, occupied);
    return best;
  };
  for (let sample = 0; sample < 192; sample++) {
    const covered = sample % 2 ? 0b1111111 : 0b1110111;
    const windows = sample % 5 ? 0b1111111 : 0b1101111;
    const busy = (sample * 13) & 0b0100100;
    const fixed = sample % 3 === 0;
    const fixedSession: Session = {
      id: "existing",
      activityId: "fixed",
      kind: "study",
      fixed: true,
      accepted: true,
      state: "planned",
      start: 0,
      end: 1,
    };
    const priorities = ["Baja", "Alta", "Media"] as const;
    const tasks = priorities.map((priority, i) =>
      activity(String(i), {
        pending: 1 + ((sample >> i) % 3),
        start: (sample + i) % 3,
        deadline: slots - ((sample >> (i + 1)) % 3),
        priority,
        divisible: false,
        dependencies: i && (sample + i) % 3 === 0 ? [String(i - 1)] : [],
      }),
    );
    const input = snapshot(
      fixed
        ? [
            ...tasks,
            activity("fixed", {
              pending: 1,
              deadline: slots,
              divisible: false,
            }),
          ]
        : tasks,
      {
        end: slots,
        windows: grid(windows),
        coverage: grid(covered),
        occupied: grid(busy),
        availabilityKnown: covered === 0b1111111,
        sessions: fixed ? [fixedSession] : [],
        preferences: { minimum: 1, preferred: 2, maximum: 3 },
      },
    );
    const before = structuredClone(input);
    const result = plan(input);
    const label = `case ${sample}`;
    assert.deepEqual(
      ["1", "2", "0"].map(
        (id) =>
          result.balances.find((item) => item.activityId === id)!.scheduled,
      ),
      oracle(tasks, windows & covered, busy | Number(fixed)),
      label,
    );
    assert.deepEqual(
      validateSessions(input, result.sessions).issues,
      [],
      label,
    );
    assert.deepEqual(input, before, label);
    assert.deepEqual(plan(input), result, label);
    if (fixed)
      assert.deepEqual(
        result.sessions.find((s) => s.id === "existing"),
        fixedSession,
        label,
      );
    assert.equal(
      new Set(result.sessions.map((s) => s.id)).size,
      result.sessions.length,
      label,
    );
    for (const balance of result.balances)
      assert.equal(
        balance.required,
        balance.scheduled + balance.covered + balance.unplaced!,
        label,
      );
    if (!input.availabilityKnown) {
      assert.ok(!result.diagnostics.some((d) => d.kind === "deficit"), label);
      assert.notEqual(result.state, "viable", label);
    }
  }
});

test("F7 can use the far edge of a shared window and rebalance divisible fragments", () => {
  const shared = snapshot(
    [
      activity("high", { pending: 60, deadline: 90, priority: "Alta" }),
      activity("early", { pending: 30, deadline: 30, divisible: false }),
    ],
    { end: 90, windows: [{ start: 0, end: 90 }] },
  );
  assert.deepEqual(
    plan(shared).sessions.map(({ activityId, start, end }) => ({
      activityId,
      start,
      end,
    })),
    [
      { activityId: "early", start: 0, end: 30 },
      { activityId: "high", start: 30, end: 90 },
    ],
  );
  const balanced = snapshot([activity("short", { pending: 70 })], {
    windows: [{ start: 0, end: 70 }],
    preferences: { minimum: 30, preferred: 60, maximum: 60 },
  });
  const result = plan(balanced);
  assert.equal(result.state, "viable");
  assert.deepEqual(
    result.sessions.map((s) => s.end - s.start),
    [40, 30],
  );
  assert.deepEqual(validateSessions(balanced, result.sessions).issues, []);
});

test("F4 aborts an isolated calculation without returning a partial distribution on timeout", async () => {
  const input = snapshot([activity("task")]);
  await assert.rejects(calculatePlan(input, 1), { code: "PLANNING_TIMEOUT" });
  assert.equal((await calculatePlan(input)).state, "viable");
});

test("F7 keeps a capped search distinct from a proven capacity deficit", () => {
  const prerequisites = Array.from({ length: 4 }, (_, i) =>
    activity(`pre-${i}`, { priority: "Alta", divisible: false }),
  );
  const dependent = activity("dependent", {
    deadline: 60,
    divisible: false,
    dependencies: prerequisites.map((task) => task.id),
  });
  const input = snapshot([...prerequisites, dependent], { end: 300 });
  const result = plan(input);
  assert.equal(result.exploredStates, SEARCH_LIMIT);
  assert.equal(result.searchLimited, true);
  assert.equal(result.state, "partial");
  assert.equal(
    result.balances.find((b) => b.activityId === dependent.id)?.unplaced,
    60,
  );
  assert.deepEqual(
    result.diagnostics.map((d) => d.kind),
    ["search_incomplete"],
  );
  assert.deepEqual(validateSessions(input, result.sessions).issues, []);
});
