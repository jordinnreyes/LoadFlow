import test from "node:test";
import assert from "node:assert/strict";
import { makeWorkspace, googleCommitments, SCENARIOS } from "../src/demo";
import {
  emptyActivity,
  NOW_DATE,
  priorityKey,
  type Workspace,
} from "../src/model";
import {
  addDays,
  dayNumber,
  deadline,
  duration,
  effectivePriority,
  freeIntervals,
  occupations,
  overlaps,
  pendingEffort,
  plan,
  sourceIncomplete,
  validateSession,
  weekMetrics,
  withPlan,
} from "../src/rules";

const small = (): Workspace => {
  const w = makeWorkspace("empty");
  return {
    ...w,
    availabilityConfirmed: true,
    windows: [{ id: "mon", day: 1, start: 16 * 60, end: 17 * 60 }],
    activities: [
      {
        ...emptyActivity("a"),
        title: "Más cercana",
        course: "Cálculo",
        date: "2026-11-03",
        time: "18:00",
        effort: 60,
        startDate: NOW_DATE,
        divisible: "yes",
        priority: "Media",
        confirmed: true,
      },
      {
        ...emptyActivity("b"),
        title: "Más lejana",
        course: "Física",
        date: "2026-11-04",
        time: "18:00",
        effort: 60,
        startDate: NOW_DATE,
        divisible: "yes",
        priority: "Media",
        confirmed: true,
      },
    ],
  };
};
test("all supplied scenarios generate only sessions inside authorized windows and deadlines", () => {
  for (const scenario of SCENARIOS) {
    const w = makeWorkspace(scenario.id);
    for (const s of w.sessions)
      assert.deepEqual(validateSession(s, w), [], `${scenario.id}: ${s.id}`);
  }
});
test("priority changes actually change assignment when windows compete", () => {
  const w = small();
  w.activities[1].priority = "Alta";
  let result = plan(w);
  assert.equal(result.sessions[0].activityId, "b");
  assert.equal(
    result.issues.find((x) => x.activityId === "a")?.kind,
    "deficit",
  );
  w.activities[0].priority = "Alta";
  w.activities[1].priority = "Baja";
  result = plan({ ...w, sessions: result.sessions });
  assert.equal(result.sessions[0].activityId, "a");
});
test("equal priority selects earlier deadline, with a stable exact tie", () => {
  const w = small();
  assert.equal(plan(w).sessions[0].activityId, "a");
  w.activities[1].date = w.activities[0].date;
  assert.deepEqual(plan(w), plan(w));
  assert.equal(plan(w).sessions[0].activityId, "a");
});
test("course/type priority inheritance preserves individual overrides", () => {
  const w = small();
  w.activities[0].priority = "inherit";
  w.priorities[priorityKey("Cálculo", "Tarea")] = "Alta";
  assert.equal(effectivePriority(w.activities[0], w), "Alta");
  w.activities[0].priority = "Baja";
  assert.equal(effectivePriority(w.activities[0], w), "Baja");
});
test("overlapping windows and occupied intervals count once", () => {
  const w = small();
  w.activities = [];
  w.windows.push({ id: "overlap", day: 1, start: 16 * 60 + 30, end: 18 * 60 });
  const blocks = [
    { id: "x", date: NOW_DATE, start: 17 * 60, end: 17 * 60 + 30 },
    { id: "y", date: NOW_DATE, start: 17 * 60 + 15, end: 18 * 60 },
  ];
  const free = freeIntervals(
    w,
    dayNumber(NOW_DATE),
    dayNumber(addDays(NOW_DATE, 1)),
    blocks,
  );
  assert.equal(
    free.reduce((sum, s) => sum + duration(s), 0),
    60,
  );
});
test("missing effort or allowed start never means zero or permission", () => {
  const w = small();
  w.activities[0].effort = null;
  w.activities[1].startDate = "";
  const result = plan(w);
  assert.equal(result.sessions.length, 0);
  assert.equal(result.issues.filter((x) => x.kind === "pending").length, 2);
});
test("unknown divisibility uses a single continuous block and flags structural conflict", () => {
  const w = makeWorkspace("conflict");
  assert.equal(w.sessions.length, 0);
  assert.equal(w.issues[0].kind, "conflict");
  assert.equal(w.issues[0].minutes, 180);
});
test("remainders below minimum are preserved as unplaced", () => {
  const w = small();
  w.activities = w.activities.slice(0, 1);
  w.activities[0].effort = 80;
  const result = plan(w);
  assert.equal(
    result.sessions.reduce((sum, s) => sum + duration(s), 0),
    60,
  );
  assert.equal(result.issues[0].minutes, 20);
});
test("fixed sessions are retained and a new collision is reported instead of moved", () => {
  let w = withPlan(small());
  const first = { ...w.sessions[0], fixed: true };
  w = {
    ...w,
    sessions: [first],
    commitments: [
      {
        id: "busy",
        source: "manual",
        title: "Nuevo compromiso",
        date: first.date,
        start: first.start,
        end: first.end,
      },
    ],
  };
  const result = plan(w);
  assert.deepEqual(
    result.sessions.find((s) => s.id === first.id),
    first,
  );
  assert.ok(result.issues.some((i) => i.kind === "conflict"));
  assert.ok(validateSession(first, { ...w, sessions: result.sessions }).length);
});
test("regenerating around a fixed block never creates duplicate session IDs", () => {
  let w = makeWorkspace();
  w.sessions[0].fixed = true;
  w = withPlan(w);
  assert.equal(new Set(w.sessions.map((s) => s.id)).size, w.sessions.length);
});
test("completion cancels only flexible preparation, preserving fixed and exam", () => {
  let w = makeWorkspace();
  const id = w.activities[0].id;
  w.sessions.find((s) => s.activityId === id)!.fixed = true;
  const fixed = w.sessions.find((s) => s.activityId === id && s.fixed)!;
  w.activities[0].preparation = "done";
  w = withPlan(w);
  assert.deepEqual(
    w.sessions.filter((s) => s.activityId === id),
    [fixed],
  );
  assert.ok(occupations(w).some((c) => c.activityId === id));
  assert.equal(w.activities[0].fulfilled, false);
});
test("real total replaces prior value, explicit remaining prevails, zero does not close", () => {
  const w = small();
  const a = w.activities[0];
  a.effort = 240;
  a.real = 300;
  assert.equal(pendingEffort(a), 0);
  assert.equal(a.preparation, "new");
  a.real = 120;
  assert.equal(pendingEffort(a), 120);
  a.remaining = 180;
  assert.equal(pendingEffort(a), 180);
});
test("manual source can be viable; stale source never presents current viability", () => {
  const manual = makeWorkspace();
  assert.equal(sourceIncomplete(manual), false);
  assert.equal(weekMetrics(manual, NOW_DATE).state, "viable");
  const stale = makeWorkspace("stale");
  assert.equal(sourceIncomplete(stale), true);
  assert.notEqual(weekMetrics(stale, NOW_DATE).state, "viable");
});
test("advancing a deadline does not schedule in the past or after the new limit", () => {
  let w = makeWorkspace();
  w.activities[2].date = "2026-11-03";
  w = withPlan(w);
  const a = w.activities[2];
  assert.ok(
    w.sessions
      .filter((s) => s.activityId === a.id)
      .every((s) => dayNumber(s.date) + s.end <= deadline(a)),
  );
  assert.ok(w.issues.some((i) => i.activityId === a.id));
});
test("external equivalent collaboration is deducted once, only after explicit linkage", () => {
  const w = makeWorkspace();
  w.calendar = "connected";
  w.commitments = googleCommitments();
  const group = w.activities.find((a) => a.type === "Entrega grupal")!;
  const before = plan(w);
  group.equivalentIds = ["reunion-equivalente"];
  const after = plan(w);
  const beforeMinutes = before.sessions
    .filter((s) => s.activityId === group.id)
    .reduce((sum, s) => sum + duration(s), 0);
  const afterMinutes = after.sessions
    .filter((s) => s.activityId === group.id)
    .reduce((sum, s) => sum + duration(s), 0);
  assert.equal(beforeMinutes - afterMinutes, 120);
  assert.ok(
    after.sessions.every((s) => !occupations(w).some((c) => overlaps(s, c))),
  );
  assert.equal(group.real, null);
});
test("activity-only reorganization preserves other flexible sessions", () => {
  const w = makeWorkspace();
  const id = w.activities[0].id;
  const before = w.sessions.filter((s) => s.activityId !== id);
  const result = plan(w, id);
  assert.deepEqual(
    result.sessions.filter((s) => s.activityId !== id),
    before,
  );
});
test("undo candidate is invalid when a newer occupied commitment blocks it", () => {
  const w = makeWorkspace();
  const previous = w.sessions[0];
  w.commitments.push({
    id: "new-block",
    date: previous.date,
    start: previous.start,
    end: previous.end,
    title: "Nuevo compromiso",
    source: "manual",
  });
  assert.ok(validateSession(previous, w).some((x) => x.includes("ocupado")));
});
test("a date without a time is a visible obligation but not a fictional midnight event", () => {
  const w = small();
  w.activities = w.activities.slice(0, 1);
  w.activities[0].time = "";
  const result = plan(w);
  assert.equal(result.sessions.length, 0);
  assert.equal(result.issues[0].kind, "pending");
  assert.equal(occupations(w).length, 0);
});
test("weeks with advance study but no deadlines are populated without double counting", () => {
  const w = small();
  w.activities = w.activities.slice(0, 1);
  w.activities[0].date = "2026-11-12";
  const planned = withPlan(w);
  const first = weekMetrics(planned, NOW_DATE);
  const second = weekMetrics(planned, addDays(NOW_DATE, 7));
  assert.equal(first.deadlines.length, 0);
  assert.equal(first.study, 60);
  assert.equal(first.state, "viable");
  assert.equal(second.study, 0);
  assert.equal(second.deadlines.length, 1);
});
test("declared dependencies cannot be scheduled after their dependent work", () => {
  const w = makeWorkspace();
  w.activities[1].dependencies = [w.activities[0].id];
  const result = plan(w);
  const dep = result.sessions.filter(
    (s) => s.activityId === w.activities[0].id,
  );
  const work = result.sessions.filter(
    (s) => s.activityId === w.activities[1].id,
  );
  const depEnd = Math.max(...dep.map((s) => dayNumber(s.date) + s.end));
  assert.ok(work.every((s) => dayNumber(s.date) + s.start >= depEnd));
});
test("a group deadline change can preserve accepted reservations for conflict review", () => {
  const w = makeWorkspace();
  const a = w.activities.find((a) => a.type === "Entrega grupal")!;
  const before = w.sessions.filter((s) => s.activityId === a.id);
  a.date = "2026-11-04";
  const result = plan(w, undefined, a.id);
  assert.deepEqual(
    result.sessions.filter((s) => s.activityId === a.id),
    before,
  );
  assert.ok(
    result.issues.some((i) => i.activityId === a.id && i.kind === "conflict"),
  );
});

test("incomplete fixed evaluation interval leaves load partial even with preparation sessions", () => {
  const w = makeWorkspace();
  w.activities[0].eventEnd = "";
  const result = plan(w);
  assert.ok(result.sessions.some((s) => s.activityId === w.activities[0].id));
  assert.ok(
    result.issues.some(
      (i) => i.activityId === w.activities[0].id && i.kind === "pending",
    ),
  );
  assert.equal(
    occupations(w).some((c) => c.activityId === w.activities[0].id),
    false,
  );
});
