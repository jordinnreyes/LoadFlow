import { localDay } from "./normalize.ts";
import {
  contains,
  duration,
  intersect,
  minutes,
  overlaps,
  union,
} from "./intervals.ts";
import {
  inScope,
  isEvaluation,
  occupancy,
  required,
  retained,
  sameSession,
  type Activity,
  type Diagnostic,
  type Session,
  type Snapshot,
} from "./model.ts";

export function activityIssues(a: Activity, snapshot: Snapshot): string[] {
  const result: string[] = [];
  if (a.group && (!a.group.enabled || a.fulfilled)) return result;
  if (!a.group && a.done) return result;
  if (a.deadline === null) result.push("ACADEMIC_CUTOFF_UNKNOWN");
  if (a.start === null) result.push("ALLOWED_START_UNKNOWN");
  if (required(a) === null) result.push("EFFORT_UNKNOWN");
  if (!a.group && a.needsReview) result.push("EFFORT_REVIEW_REQUIRED");
  if (isEvaluation(a) && (a.deadline === null || a.evaluationEnd === null))
    result.push("EVALUATION_INTERVAL_UNKNOWN");
  if (!snapshot.timezone) result.push("STUDY_TIMEZONE_UNKNOWN");
  if (!snapshot.preferences) result.push("PREFERENCES_UNKNOWN");
  return result;
}

export function dependencyOrder(activities: Activity[]) {
  const rank = new Map(activities.map((a, i) => [a.id, i]));
  const byId = new Map(activities.map((a) => [a.id, a]));
  // Urgent dependents confer their place in the queue on their prerequisites.
  for (let pass = 0; pass < activities.length; pass++) {
    let changed = false;
    for (const a of activities)
      for (const id of a.dependencies) {
        if (rank.has(id) && rank.get(id)! > rank.get(a.id)!) {
          rank.set(id, rank.get(a.id)!);
          changed = true;
        }
      }
    if (!changed) break;
  }
  const remaining = new Map(activities.map((a) => [a.id, a]));
  const ordered: Activity[] = [];
  while (remaining.size) {
    const ready = [...remaining.values()]
      .filter((a) =>
        a.dependencies.every(
          (id) =>
            !remaining.has(id) ||
            (byId.get(id)!.group
              ? byId.get(id)!.fulfilled
              : byId.get(id)!.done),
        ),
      )
      .sort(
        (a, b) =>
          rank.get(a.id)! - rank.get(b.id)! ||
          activities.indexOf(a) - activities.indexOf(b),
      );
    if (!ready.length) break;
    ordered.push(ready[0]);
    remaining.delete(ready[0].id);
  }
  const invalid = new Map<string, string>();
  for (const a of activities)
    if (a.dependencies.some((id) => !byId.has(id)))
      invalid.set(a.id, "DEPENDENCY_MISSING");
  for (const a of remaining.values())
    invalid.set(a.id, "DEPENDENCY_CYCLE_OR_BLOCKED");
  return { ordered, invalid };
}

export function equivalenceCoverage(snapshot: Snapshot) {
  const result = new Map<string, { start: number; end: number }[]>();
  const invalid = new Set<string>();
  const byId = new Map(snapshot.activities.map((a) => [a.id, a]));
  for (const e of snapshot.equivalences) {
    const a = byId.get(e.activityId);
    const collision = snapshot.equivalences.some(
      (other) => other.id !== e.id && overlaps(e, other),
    );
    if (
      !a?.group ||
      !e.valid ||
      collision ||
      a.start === null ||
      a.deadline === null ||
      !Number.isSafeInteger(e.start) ||
      !Number.isSafeInteger(e.end) ||
      e.end <= e.start ||
      e.start < Math.max(a.start, snapshot.now) ||
      e.end > a.deadline ||
      !contains(snapshot.occupied, e) ||
      !contains(snapshot.coverage, e)
    ) {
      invalid.add(e.activityId);
      continue;
    }
    result.set(e.activityId, union([...(result.get(e.activityId) ?? []), e]));
  }
  return { result, invalid };
}

function physicalReasons(
  s: Session,
  snapshot: Snapshot,
  byId: Map<string, Activity>,
  sessions: Session[],
) {
  const a = byId.get(s.activityId);
  const codes: string[] = [];
  if (
    !Number.isSafeInteger(s.start) ||
    !Number.isSafeInteger(s.end) ||
    s.end <= s.start
  )
    return ["SESSION_INTERVAL_INVALID"];
  if (!a) return ["ACTIVITY_UNKNOWN"];
  if (s.start < snapshot.now) codes.push("SESSION_IN_PAST");
  if (s.end > snapshot.end || a.start === null || s.start < a.start)
    codes.push("SESSION_OUTSIDE_RANGE");
  if (a.deadline === null || s.end > a.deadline)
    codes.push("SESSION_AFTER_CUTOFF");
  if (!contains(snapshot.windows, s)) codes.push("SESSION_OUTSIDE_WINDOW");
  if (!contains(snapshot.coverage, s)) codes.push("SESSION_SOURCE_UNVERIFIED");
  if (occupancy(snapshot).some((b) => overlaps(s, b))) codes.push("SESSION_BUSY");
  if (
    sessions.some(
      (other) =>
        other.id !== s.id && other.state === "planned" && overlaps(s, other),
    )
  )
    codes.push("SESSION_OVERLAP");
  if (s.kind !== (a.group ? "group" : "study"))
    codes.push("SESSION_KIND_MISMATCH");
  if (!a.group && a.done) codes.push("PREPARATION_CLOSED");
  if (a.group && (!a.group.enabled || a.fulfilled))
    codes.push("GROUP_RESERVATIONS_DISABLED");
  if (activityIssues(a, snapshot).length)
    codes.push("ACTIVITY_INPUTS_INCOMPLETE");
  if (
    !snapshot.sessions.some((old) => old.id === s.id && retained(snapshot, old))
  ) {
    const p = snapshot.preferences;
    if (
      a.divisible &&
      !a.group &&
      p &&
      (duration(s) < p.minimum || duration(s) > p.maximum)
    )
      codes.push("SESSION_CHUNK_INVALID");
    if (a.group && duration(s) > a.group.minutes)
      codes.push("GROUP_BLOCK_INVALID");
  }
  return codes;
}

export function validateSessions(snapshot: Snapshot, sessions: Session[]) {
  const byId = new Map(snapshot.activities.map((a) => [a.id, a]));
  const reasons = new Map<string, Set<string>>();
  const duplicates = new Set(
    sessions
      .filter((s, i) => sessions.findIndex((other) => other.id === s.id) !== i)
      .map((s) => s.id),
  );
  for (const s of sessions) {
    const codes =
      s.state === "planned" ? physicalReasons(s, snapshot, byId, sessions) : [];
    if (duplicates.has(s.id)) codes.push("SESSION_ID_DUPLICATE");
    reasons.set(s.id, new Set(codes));
  }
  const equivalences = equivalenceCoverage(snapshot);
  const graph = dependencyOrder(snapshot.activities);
  for (const a of snapshot.activities) {
    const active = sessions.filter(
      (s) =>
        s.activityId === a.id &&
        s.state === "planned" &&
        !reasons.get(s.id)!.size,
    );
    const covered = Math.min(
      required(a) ?? 0,
      minutes(equivalences.result.get(a.id) ?? []),
    );
    const allocated = active.reduce((n, s) => n + duration(s), 0);
    const invalid =
      (required(a) !== null && allocated + covered > required(a)!) ||
      (!a.group && !a.divisible && active.length > 1);
    const groupConflict =
      a.group &&
      snapshot.timezone &&
      (active.length > a.group.count ||
        new Set(active.map((s) => localDay(s.start, snapshot.timezone!)))
          .size !== active.length);
    if (groupConflict)
      for (const s of active) reasons.get(s.id)!.add("GROUP_DAYS_CONFLICT");
    if (invalid)
      for (const s of active)
        reasons.get(s.id)!.add("EFFORT_ALLOCATION_INVALID");
  }
  // Invalid prerequisites propagate until no additional session becomes invalid.
  for (let pass = 0; pass <= snapshot.activities.length; pass++) {
    let changed = false;
    for (const s of sessions.filter((s) => s.state === "planned")) {
      const a = byId.get(s.activityId);
      if (!a || reasons.get(s.id)!.size) continue;
      const invalidDependency =
        graph.invalid.has(a.id) ||
        a.dependencies.some((id) => {
          const dep = byId.get(id);
          if (!dep) return true;
          if (dep.done && !dep.group) return false;
          if (dep.group && dep.fulfilled) return false;
          const needed = required(dep);
          const valid = sessions.filter(
            (other) =>
              other.activityId === id &&
              other.state === "planned" &&
              !reasons.get(other.id)!.size,
          );
          const covered = minutes(equivalences.result.get(id) ?? []);
          return (
            needed === null ||
            valid.reduce((n, other) => n + duration(other), 0) + covered <
              needed ||
            valid.some((other) => other.end > s.start) ||
            (equivalences.result.get(id) ?? []).some((e) => e.end > s.start)
          );
        });
      if (invalidDependency) {
        reasons.get(s.id)!.add("DEPENDENCY_UNSATISFIED");
        changed = true;
      }
    }
    if (!changed) break;
  }
  const issues: Diagnostic[] = sessions.flatMap((s) =>
    [...reasons.get(s.id)!].map((code) => ({
      activityId: s.activityId,
      sessionId: s.id,
      code,
      kind: "conflict" as const,
      minutes: duration(s),
    })),
  );
  for (const old of snapshot.sessions.filter((s) => retained(snapshot, s))) {
    const next = sessions.find((s) => s.id === old.id);
    if (!next || !sameSession(next, old))
      issues.push({
        activityId: old.activityId,
        sessionId: old.id,
        code: "PRESERVED_SESSION_CHANGED",
        kind: "conflict",
        minutes: duration(old),
      });
  }
  for (const s of sessions)
    if (
      !snapshot.sessions.some((old) => old.id === s.id) &&
      !inScope(snapshot, s.activityId)
    )
      issues.push({
        activityId: s.activityId,
        sessionId: s.id,
        code: "SESSION_OUTSIDE_SCOPE",
        kind: "conflict",
        minutes: duration(s),
      });
  return {
    issues,
    validIds: new Set(
      sessions
        .filter((s) => s.state === "planned" && !reasons.get(s.id)!.size)
        .map((s) => s.id),
    ),
  };
}
