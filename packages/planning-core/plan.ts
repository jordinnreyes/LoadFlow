import { createHash } from "node:crypto";
import {
  contains,
  duration,
  intersect,
  minutes,
  subtract,
  type Span,
} from "./intervals.ts";
import { addLocalDays, localDay, splitDays } from "./normalize.ts";
import {
  activityIssues,
  dependencyOrder,
  equivalenceCoverage,
  validateSessions,
} from "./validate.ts";
import {
  ALGORITHM_VERSION,
  POLICY_VERSION,
  SEARCH_LIMIT,
  inScope,
  occupancy,
  required,
  retained,
  type Activity,
  type Balance,
  type Diagnostic,
  type Result,
  type Session,
  type Snapshot,
} from "./model.ts";

export function stableId(value: string) {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const weights = { Alta: 3, Media: 2, Baja: 1 };
export function priorityOrder(activities: Activity[]) {
  return [...activities].sort(
    (a, b) =>
      (b.priority ? weights[b.priority] : 0) -
        (a.priority ? weights[a.priority] : 0) ||
      (a.deadline ?? Infinity) - (b.deadline ?? Infinity) ||
      a.confirmedAt - b.confirmedAt ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function balances(snapshot: Snapshot, sessions: Session[]): Balance[] {
  const { validIds } = validateSessions(snapshot, sessions);
  const equivalent = equivalenceCoverage(snapshot).result;
  return snapshot.activities.map((a) => {
    const need = required(a);
    const scheduled = sessions
      .filter((s) => s.activityId === a.id && validIds.has(s.id))
      .reduce((n, s) => n + duration(s), 0);
    const covered = Math.min(need ?? 0, minutes(equivalent.get(a.id) ?? []));
    return {
      activityId: a.id,
      required: need,
      scheduled,
      covered,
      unplaced: need === null ? null : Math.max(0, need - scheduled - covered),
    };
  });
}

function session(snapshot: Snapshot, a: Activity, span: Span): Session {
  const kind = a.group ? "group" : "study";
  const old = snapshot.sessions.find(
    (s) =>
      s.activityId === a.id &&
      s.state === "planned" &&
      s.start === span.start &&
      s.end === span.end &&
      s.kind === kind,
  );
  const key = `${a.id}:${kind}:${span.start}:${span.end}`;
  let id = old?.id ?? stableId(key);
  for (let i = 1; !old && snapshot.sessions.some((s) => s.id === id); i++)
    id = stableId(`${key}:${i}`);
  return {
    ...span,
    id,
    activityId: a.id,
    kind,
    fixed: false,
    accepted: a.group?.accepted ?? true,
    state: "planned",
  };
}

function availableFor(snapshot: Snapshot, a: Activity, sessions: Session[]) {
  if (a.start === null || a.deadline === null) return [];
  let start = Math.max(snapshot.now, a.start);
  const byId = new Map(snapshot.activities.map((other) => [other.id, other]));
  const known = balances(snapshot, sessions);
  for (const id of a.dependencies) {
    const dep = byId.get(id);
    if (!dep || known.find((b) => b.activityId === id)?.unplaced !== 0)
      return [];
    if ((dep.done && !dep.group) || (dep.group && dep.fulfilled)) continue;
    const blocks = sessions.filter(
      (s) => s.activityId === id && s.state === "planned",
    );
    const equivalents = equivalenceCoverage(snapshot).result.get(id) ?? [];
    start = Math.max(
      start,
      ...blocks.map((s) => s.end),
      ...equivalents.map((s) => s.end),
    );
  }
  return subtract(
    intersect(intersect(snapshot.windows, snapshot.coverage), [
      { start, end: Math.min(a.deadline, snapshot.end) },
    ]),
    [...occupancy(snapshot), ...sessions.filter((s) => s.state === "planned")],
  );
}

function* windowOrders(
  free: Span[],
  consecutive: Span[] | null,
  group: boolean,
) {
  if (consecutive) yield consecutive;
  if (group) yield [...free].reverse();
  yield free;
  if (!group) yield [...free].reverse();
  // Try another starting window only when the search reaches this branch.
  for (let i = 1; i < free.length; i++)
    yield [...free.slice(i), ...free.slice(0, i)];
}

function consecutiveWindows(
  free: Span[],
  zone: string,
  count: number,
  size: number,
) {
  const byDate = new Map<string, Span>();
  for (const slot of free)
    if (duration(slot) >= size) byDate.set(localDay(slot.start, zone), slot);
  for (const date of [...byDate.keys()].reverse()) {
    const sequence = Array.from({ length: count }, (_, i) =>
      byDate.get(addLocalDays(date, -i)),
    );
    if (sequence.every((slot): slot is Span => !!slot)) return sequence;
  }
  return null;
}

function individualChunks(
  snapshot: Snapshot,
  a: Activity,
  free: Span[],
  need: number,
  edge: "start" | "end" = "start",
) {
  const preferences = snapshot.preferences!;
  const blocks: Session[] = [];
  let remaining = need;
  for (const span of free) {
    const slot = { ...span };
    while (
      remaining >= preferences.minimum &&
      duration(slot) >= preferences.minimum
    ) {
      let size = Math.min(
        remaining,
        duration(slot),
        preferences.maximum,
        preferences.preferred,
      );
      if (
        remaining > size &&
        remaining - size < preferences.minimum &&
        remaining <= duration(slot)
      ) {
        if (remaining <= preferences.maximum) size = remaining;
        else if (remaining >= 2 * preferences.minimum)
          size = remaining - preferences.minimum;
      }
      if (size < preferences.minimum) break;
      const start = edge === "start" ? slot.start : slot.end - size;
      blocks.push(session(snapshot, a, { start, end: start + size }));
      if (edge === "start") slot.start += size;
      else slot.end -= size;
      remaining -= size;
    }
    if (!remaining) break;
  }
  return blocks.sort((a, b) => a.start - b.start);
}

function* options(
  snapshot: Snapshot,
  a: Activity,
  sessions: Session[],
): Generator<Session[]> {
  if (
    !inScope(snapshot, a.id) ||
    activityIssues(a, snapshot).length ||
    required(a) === 0
  ) {
    yield [];
    return;
  }
  const need = balances(snapshot, sessions).find(
    (b) => b.activityId === a.id,
  )!.unplaced;
  if (need === null || need <= 0) {
    yield [];
    return;
  }
  const available = availableFor(snapshot, a, sessions);
  const free = a.group ? splitDays(available, snapshot.timezone!) : available;
  if (!a.group) {
    let reusedMinutes = 0;
    const reusable = snapshot.sessions
      .filter(
        (old) =>
          old.activityId === a.id &&
          old.state === "planned" &&
          !sessions.some((kept) => kept.id === old.id) &&
          contains(free, old) &&
          (!a.divisible ||
            (duration(old) >= snapshot.preferences!.minimum &&
              duration(old) <= snapshot.preferences!.maximum)),
      )
      .filter((old) => {
        if (reusedMinutes + duration(old) > need) return false;
        reusedMinutes += duration(old);
        return true;
      });
    if (reusable.length && reusedMinutes === need) yield reusable;
    else if (reusable.length && a.divisible)
      yield [
        ...reusable,
        ...individualChunks(
          snapshot,
          a,
          subtract(free, reusable),
          need - reusedMinutes,
        ),
      ];
  }
  const seen = new Set<string>();
  if (!a.group && !a.divisible) {
    for (const slot of free.filter((s) => duration(s) >= need)) {
      yield [
        session(snapshot, a, { start: slot.start, end: slot.start + need }),
      ];
      if (slot.end - need !== slot.start)
        yield [session(snapshot, a, { start: slot.end - need, end: slot.end })];
      for (let start = slot.start + 1; start < slot.end - need; start++)
        yield [session(snapshot, a, { start, end: start + need })];
    }
  } else {
    const kept = a.group
      ? sessions.filter((s) => s.activityId === a.id && s.state === "planned")
      : [];
    const consecutive =
      a.group && !kept.length
        ? consecutiveWindows(
            free,
            snapshot.timezone!,
            Math.min(a.group.count, Math.ceil(need / a.group.minutes)),
            Math.min(a.group.minutes, need),
          )
        : null;
    for (const order of windowOrders(free, consecutive, a.group !== null)) {
      if (!a.group) {
        for (const edge of ["start", "end"] as const) {
          const blocks = individualChunks(snapshot, a, order, need, edge);
          const key = JSON.stringify(blocks);
          if (!seen.has(key)) {
            seen.add(key);
            yield blocks;
          }
        }
        continue;
      }
      const blocks: Session[] = [];
      const usedDays = new Set(
        kept.map((s) => localDay(s.start, snapshot.timezone!)),
      );
      let remaining = need;
      for (const span of order) {
        const slot = { ...span };
        if (a.group) {
          const day = localDay(slot.start, snapshot.timezone!);
          if (usedDays.has(day) || usedDays.size >= a.group.count) continue;
          const size = Math.min(remaining, a.group.minutes);
          if (duration(slot) < size) continue;
          const end = order === free ? slot.start + size : slot.end;
          blocks.push(session(snapshot, a, { start: end - size, end }));
          usedDays.add(day);
          remaining -= size;
        }
        if (!remaining) break;
      }
      const key = JSON.stringify(blocks);
      if (!seen.has(key)) {
        seen.add(key);
        yield blocks;
      }
    }
  }
  yield [];
}

export function describe(
  snapshot: Snapshot,
  sessions: Session[],
  exploredStates = 0,
  searchLimited = false,
): Result {
  const validation = validateSessions(snapshot, sessions);
  const amounts = balances(snapshot, sessions);
  const diagnostics: Diagnostic[] = [...validation.issues];
  const graph = dependencyOrder(snapshot.activities);
  const equivalents = equivalenceCoverage(snapshot);
  const preservedIds = new Set(
    snapshot.sessions.filter((s) => retained(snapshot, s)).map((s) => s.id),
  );
  const add = (
    a: Activity,
    code: string,
    kind: Diagnostic["kind"],
    value: number | null,
  ) =>
    diagnostics.push({
      activityId: a.id,
      sessionId: null,
      code,
      kind,
      minutes: value,
    });
  if (!snapshot.availabilityKnown || snapshot.sourceIssues.length)
    diagnostics.push({
      activityId: null,
      sessionId: null,
      code: "SOURCE_OR_WINDOWS_INCOMPLETE",
      kind: "pending",
      minutes: null,
    });
  for (const a of snapshot.activities) {
    const b = amounts.find((item) => item.activityId === a.id)!;
    if (required(a) === 0 && (a.done || a.group)) continue;
    for (const code of activityIssues(a, snapshot))
      add(a, code, "pending", b.unplaced);
    if (a.group && !a.group.accepted && a.group.enabled && !a.fulfilled)
      add(a, "GROUP_ACCEPTANCE_REQUIRED", "pending", b.unplaced);
    if (equivalents.invalid.has(a.id))
      add(a, "GROUP_EQUIVALENCE_REVIEW_REQUIRED", "pending", b.unplaced);
    if (graph.invalid.has(a.id)) {
      add(a, graph.invalid.get(a.id)!, "conflict", b.unplaced);
      continue;
    }
    if (
      !b.unplaced ||
      activityIssues(a, snapshot).length ||
      !inScope(snapshot, a.id)
    )
      continue;
    if (a.start! >= Math.min(a.deadline!, snapshot.end)) {
      add(a, "START_AFTER_CUTOFF", "conflict", b.unplaced);
      continue;
    }
    const base = subtract(
      intersect(snapshot.windows, [
        {
          start: Math.max(a.start!, snapshot.now),
          end: Math.min(a.deadline!, snapshot.end),
        },
      ]),
      [
        ...occupancy(snapshot),
        ...sessions.filter(
          (s) =>
            s.activityId !== a.id &&
            preservedIds.has(s.id) &&
            s.state === "planned",
        ),
      ],
    );
    if (
      snapshot.availabilityKnown &&
      !a.divisible &&
      !a.group &&
      !base.some((s) => duration(s) >= b.unplaced!)
    )
      add(a, "CONTIGUOUS_BLOCK_TOO_SHORT", "conflict", b.unplaced);
    else if (snapshot.availabilityKnown && minutes(base) < b.unplaced)
      add(a, "CAPACITY_DEFICIT", "deficit", b.unplaced);
    else add(a, "DISTRIBUTION_NOT_FOUND", "search_incomplete", b.unplaced);
  }
  // A prefix capacity certificate is independent of the search outcome.
  if (snapshot.availabilityKnown)
    for (const a of snapshot.activities.filter((a) => a.deadline !== null)) {
      const due = Math.min(a.deadline!, snapshot.end);
      const relevant = snapshot.activities.filter(
        (other) =>
          inScope(snapshot, other.id) &&
          !activityIssues(other, snapshot).length &&
          other.deadline! <= due,
      );
      const demand = relevant.reduce(
        (n, other) =>
          n +
          (required(other) ?? 0) -
          Math.min(
            required(other) ?? 0,
            minutes(equivalents.result.get(other.id) ?? []),
          ),
        0,
      );
      const capacity = minutes(
        subtract(
          intersect(snapshot.windows, [{ start: snapshot.now, end: due }]),
          occupancy(snapshot),
        ),
      );
      if (demand > capacity)
        for (const other of relevant) {
          const unplaced = amounts.find(
            (b) => b.activityId === other.id,
          )!.unplaced;
          if (unplaced)
            add(other, "DEADLINE_CAPACITY_DEFICIT", "deficit", unplaced);
        }
    }
  const unique = [
    ...new Map(
      diagnostics.map((d) => [`${d.activityId}:${d.sessionId}:${d.code}`, d]),
    ).values(),
  ];
  const state =
    !snapshot.activities.length && !sessions.some((s) => s.state === "planned")
      ? "empty"
      : unique.some((d) => d.kind === "conflict")
        ? "conflict"
        : unique.some((d) => d.kind === "deficit")
          ? "deficit"
          : unique.length || amounts.some((b) => b.unplaced !== 0)
            ? "partial"
            : "viable";
  return {
    algorithmVersion: ALGORITHM_VERSION,
    policyVersion: POLICY_VERSION,
    asOf: snapshot.now,
    horizonEnd: snapshot.end,
    sessions: [...sessions].sort(
      (a, b) => a.start - b.start || (a.id < b.id ? -1 : 1),
    ),
    diagnostics: unique,
    balances: amounts,
    state,
    exploredStates,
    searchLimited,
  };
}

export function plan(
  snapshot: Snapshot,
  shouldAbort: () => boolean = () => false,
): Result {
  const priority = priorityOrder(snapshot.activities);
  const graph = dependencyOrder(priority);
  const ordered = graph.ordered.filter((a) => !graph.invalid.has(a.id));
  const preserved = snapshot.sessions.filter((s) => retained(snapshot, s));
  let explored = 0;
  let limited = false;
  let best = [...preserved];
  for (const a of ordered) {
    if (shouldAbort()) throw new Error("PLANNING_TIMEOUT");
    best = [...best, ...(options(snapshot, a, best).next().value ?? [])];
  }
  const needs = priority.map((a) =>
    !inScope(snapshot, a.id) ||
    activityIssues(a, snapshot).length ||
    graph.invalid.has(a.id)
      ? 0
      : (required(a) ?? 0),
  );
  const score = (sessions: Session[]) => {
    const byId = new Map(
      balances(snapshot, sessions).map((b) => [
        b.activityId,
        b.scheduled + b.covered,
      ]),
    );
    return priority.map((a) => byId.get(a.id)!);
  };
  const currentIds = new Set(snapshot.sessions.map((s) => s.id));
  const changes = (items: Session[]) =>
    items.filter((s) => !currentIds.has(s.id)).length;
  let bestScore = score(best);
  const complete = () =>
    needs.every((value, index) => bestScore[index] >= value);
  if (!complete()) {
    type Branch = {
      index: number;
      sessions: Session[];
      choices?: Generator<Session[]>;
    };
    const stack: Branch[] = [{ index: 0, sessions: preserved }];
    while (stack.length && !complete()) {
      if (shouldAbort()) throw new Error("PLANNING_TIMEOUT");
      const branch = stack.at(-1)!;
      if (!branch.choices) {
        if (explored >= SEARCH_LIMIT) {
          limited = true;
          break;
        }
        explored++;
        const candidateScore = score(branch.sessions);
        const difference = candidateScore.findIndex(
          (value, index) => value !== bestScore[index],
        );
        if (
          difference >= 0
            ? candidateScore[difference] > bestScore[difference]
            : changes(branch.sessions) < changes(best)
        ) {
          best = branch.sessions;
          bestScore = candidateScore;
        }
        if (branch.index === ordered.length || complete()) {
          stack.pop();
          continue;
        }
        branch.choices = options(
          snapshot,
          ordered[branch.index],
          branch.sessions,
        );
      }
      const next = branch.choices.next();
      if (next.done) stack.pop();
      else
        stack.push({
          index: branch.index + 1,
          sessions: [...branch.sessions, ...next.value],
        });
    }
  }
  const valid = validateSessions(snapshot, best).validIds;
  const preservedIds = new Set(preserved.map((s) => s.id));
  return describe(
    snapshot,
    best.filter((s) => preservedIds.has(s.id) || valid.has(s.id)),
    explored,
    limited,
  );
}
