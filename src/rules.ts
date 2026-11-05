import {
  type Activity,
  type Commitment,
  type Interval,
  type Issue,
  type Session,
  type Workspace,
  NOW_DATE,
  NOW_MINUTE,
  isGroup,
  isEvaluation,
  priorityKey,
} from "./model";

// Civil date arithmetic: every demonstration time is explicitly in America/Lima.
export const dayNumber = (date: string) =>
  Date.parse(`${date}T00:00:00Z`) / 60000;
export const timeNumber = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
export const stamp = (x: Pick<Interval, "date" | "start">) =>
  dayNumber(x.date) + x.start;
export const endStamp = (x: Pick<Interval, "date" | "end">) =>
  dayNumber(x.date) + x.end;
export const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const addDays = (date: string, count: number) =>
  new Date((dayNumber(date) + count * 1440) * 60000).toISOString().slice(0, 10);
export const dayOfWeek = (date: string) =>
  new Date(`${date}T12:00:00Z`).getUTCDay();
export const weekStart = (date: string) =>
  addDays(date, -(dayOfWeek(date) + 6) % 7);
export const deadline = (a: Activity) =>
  a.date && a.time ? dayNumber(a.date) + timeNumber(a.time) : NaN;
export const duration = (s: Interval) => s.end - s.start;
export const overlaps = (a: Interval, b: Interval) =>
  a.date === b.date && a.start < b.end && b.start < a.end;
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(dayNumber(date)) &&
    new Date(dayNumber(date) * 60000).toISOString().slice(0, 10) === date
  );
}
export const canConfirm = (a: Activity) =>
  !!a.title.trim() && !!a.type && validDate(a.date);
export const effectivePriority = (a: Activity, w: Workspace) =>
  a.priority === "inherit"
    ? w.priorities[priorityKey(a.course, a.type)] || ""
    : a.priority;
export const pendingEffort = (a: Activity) =>
  a.preparation === "done"
    ? 0
    : (a.remaining ??
      (a.effort === null ? null : Math.max(0, a.effort - (a.real || 0))));
export const formatMinutes = (n: number) =>
  `${Math.floor(n / 60) ? `${Math.floor(n / 60)} h` : ""}${n % 60 ? ` ${n % 60} min` : ""}`.trim() ||
  "0 h";
export const shortDate = (date: string, weekday = false) =>
  validDate(date)
    ? new Intl.DateTimeFormat("es-PE", {
        day: "numeric",
        month: "short",
        ...(weekday ? { weekday: "short" } : {}),
        timeZone: "UTC",
      }).format(new Date(`${date}T12:00:00Z`))
    : "Fecha pendiente";
export const intervalLabel = (s: Interval) =>
  `${shortDate(s.date)} · ${clock(s.start)}–${clock(s.end)}`;
export const sourceIncomplete = (w: Workspace) =>
  w.calendar !== "manual" && w.calendar !== "connected" && !w.manualCoverage;

export function occupations(w: Workspace): Commitment[] {
  const external = w.commitments.filter(
    (c) =>
      c.source !== "google" ||
      (w.calendar !== "manual" &&
        w.calendars.includes(c.calendar || "Universidad")),
  );
  const evaluations: Commitment[] = w.activities
    .filter(
      (a) =>
        a.confirmed &&
        isEvaluation(a) &&
        a.time &&
        a.eventEnd &&
        timeNumber(a.eventEnd) > timeNumber(a.time),
    )
    .map((a) => ({
      id: `event-${a.id}`,
      title: a.title,
      source: "academic",
      date: a.date,
      start: timeNumber(a.time),
      end: timeNumber(a.eventEnd),
      activityId: a.id,
    }));
  return [...external, ...evaluations];
}

export function windowsOn(w: Workspace, date: string): Interval[] {
  if (!w.availabilityConfirmed) return [];
  const exception = w.exceptions.find((e) => e.date === date);
  if (exception)
    return exception.enabled
      ? [
          {
            id: `exception-${date}`,
            date,
            start: exception.start,
            end: exception.end,
          },
        ]
      : [];
  return w.windows
    .filter((v) => v.day === dayOfWeek(date))
    .map((v) => ({ ...v, date }));
}
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
  );
  const result: Interval[] = [];
  for (const s of sorted) {
    const last = result.at(-1);
    if (last && last.date === s.date && s.start <= last.end)
      last.end = Math.max(last.end, s.end);
    else result.push({ ...s });
  }
  return result;
}
export function freeIntervals(
  w: Workspace,
  from: number,
  until: number,
  blocks: Interval[],
): Interval[] {
  if (!Number.isFinite(from) || !Number.isFinite(until) || from >= until)
    return [];
  const result: Interval[] = [];
  const lastDay = Math.min(
    Math.floor(until / 1440),
    dayNumber(
      w.periodEnd ||
        w.activities.reduce((d, a) => (a.date > d ? a.date : d), NOW_DATE),
    ) / 1440,
  );
  const firstDay = Math.floor(
    Math.max(from, dayNumber(NOW_DATE) + NOW_MINUTE) / 1440,
  );
  for (let d = firstDay; d <= lastDay; d++) {
    const date = new Date(d * 86400000).toISOString().slice(0, 10);
    const occupied = mergeIntervals(blocks.filter((b) => b.date === date));
    for (const window of mergeIntervals(windowsOn(w, date))) {
      let cursor = Math.max(
        window.start,
        from - d * 1440,
        dayNumber(NOW_DATE) + NOW_MINUTE - d * 1440,
      );
      const limit = Math.min(window.end, until - d * 1440);
      for (const b of occupied) {
        if (b.end <= cursor || b.start >= limit) continue;
        if (b.start > cursor)
          result.push({
            id: `free-${date}-${cursor}`,
            date,
            start: cursor,
            end: Math.min(b.start, limit),
          });
        cursor = Math.max(cursor, b.end);
      }
      if (cursor < limit)
        result.push({
          id: `free-${date}-${cursor}`,
          date,
          start: cursor,
          end: limit,
        });
    }
  }
  return result;
}

export function validateSession(
  s: Session,
  w: Workspace,
  others: Session[] = w.sessions,
): string[] {
  const a = w.activities.find((a) => a.id === s.activityId);
  const reasons: string[] = [];
  if (
    !a ||
    !validDate(s.date) ||
    s.end <= s.start ||
    s.start < 0 ||
    s.end > 1440
  )
    return ["Sesión o intervalo inválido"];
  if (a.preparation === "done" && !s.fixed && !isGroup(a))
    reasons.push(
      "La preparación ya terminó; no se restauran sesiones flexibles canceladas",
    );
  if (stamp(s) < dayNumber(NOW_DATE) + NOW_MINUTE)
    reasons.push("El bloque está en el pasado");
  if (!a.time || endStamp(s) > deadline(a))
    reasons.push("Fuera del plazo vigente confirmado");
  if (!a.startDate || s.date < a.startDate || s.date > (w.periodEnd || a.date))
    reasons.push("Fuera del inicio permitido o del periodo");
  if (
    !mergeIntervals(windowsOn(w, s.date)).some(
      (v) => v.start <= s.start && v.end >= s.end,
    )
  )
    reasons.push("Fuera de una ventana de estudio autorizada");
  if (occupations(w).some((b) => overlaps(s, b)))
    reasons.push("Coincide con un compromiso ocupado");
  if (others.some((b) => b.id !== s.id && !b.equivalent && overlaps(s, b)))
    reasons.push("Coincide con otra sesión");
  for (const dep of a.dependencies) {
    const dependency = w.activities.find((x) => x.id === dep);
    if (!dependency || dependency.preparation !== "done") {
      const related = others.filter((x) => x.activityId === dep);
      const effort = dependency ? pendingEffort(dependency) : null;
      if (
        effort === null ||
        related.reduce((sum, x) => sum + duration(x), 0) < effort ||
        related.some((x) => endStamp(x) > stamp(s))
      )
        reasons.push("No se cumple la dependencia declarada");
    }
  }
  return [...new Set(reasons)];
}

export function plan(
  w: Workspace,
  onlyActivity?: string,
  preserveGroup?: string,
): { sessions: Session[]; issues: Issue[] } {
  const sessions = w.sessions.filter(
    (s) =>
      s.fixed ||
      (onlyActivity && s.activityId !== onlyActivity) ||
      (s.group && s.activityId === preserveGroup),
  );
  const issues: Issue[] = [];
  const occupied = occupations(w);
  for (const s of sessions) {
    const reasons = validateSession(s, w, sessions);
    if (reasons.length)
      issues.push({
        activityId: s.activityId,
        kind: "conflict",
        minutes: duration(s),
        message: `Sesión fijada o conservada: ${reasons.join(". ")}`,
      });
  }
  const weight = { Alta: 3, Media: 2, Baja: 1, "": 0 };
  const activities = w.activities.filter(
    (a) => a.confirmed && (!onlyActivity || a.id === onlyActivity),
  );
  for (const a of activities) {
    if (isEvaluation(a) && (!a.time || !a.eventEnd)) {
      issues.push({
        activityId: a.id,
        kind: "pending",
        minutes: 0,
        message:
          "Horario de evaluación por confirmar: no se inventa su ocupación",
      });
    }
  }
  const declared = activities.some((a) => effectivePriority(a, w));
  const undeclared = activities.some((a) => !effectivePriority(a, w));
  // SUP-04: a mixed set is ordered by deadline only, explicitly provisional in the UI.
  const sorted = [...activities].sort(
    (a, b) =>
      (declared && undeclared
        ? 0
        : weight[effectivePriority(b, w)] - weight[effectivePriority(a, w)]) ||
      (Number.isFinite(deadline(a)) ? deadline(a) : dayNumber(a.date)) -
        (Number.isFinite(deadline(b)) ? deadline(b) : dayNumber(b.date)) ||
      w.activities.indexOf(a) - w.activities.indexOf(b),
  );
  const queue = [...sorted];
  const handled = new Set<string>();
  let stalled = 0;
  while (queue.length) {
    const a = queue.shift()!;
    if (
      a.dependencies.some((id) => queue.some((x) => x.id === id)) &&
      stalled < queue.length + 1
    ) {
      queue.push(a);
      stalled++;
      continue;
    }
    stalled = 0;
    if (a.preparation === "done" && !isGroup(a)) {
      handled.add(a.id);
      continue;
    }
    const issue = (kind: Issue["kind"], minutes: number, message: string) =>
      issues.push({ activityId: a.id, kind, minutes, message });
    if (!w.availabilityConfirmed) {
      issue("pending", 0, "Define y confirma tus ventanas de estudio");
      continue;
    }
    if (!a.startDate) {
      issue("pending", 0, "Confirma desde cuándo puedes empezar");
      continue;
    }
    if (!a.time) {
      issue(
        "pending",
        0,
        "Confirma la hora límite para programar sin inventar un horario",
      );
      continue;
    }
    if (isGroup(a) && (!a.groupAccepted || !a.groupEnabled || a.fulfilled)) {
      if (!a.groupAccepted && a.groupEnabled)
        issue(
          "pending",
          0,
          "Revisa y acepta, modifica o desactiva las reservas grupales tentativas",
        );
      continue;
    }
    let remaining = isGroup(a)
      ? a.groupCount * a.groupDuration
      : pendingEffort(a);
    if (remaining === null) {
      issue("pending", 0, "Horas de preparación o trabajo pendientes");
      continue;
    }
    if (!isGroup(a) && remaining === 0) {
      issue(
        "pending",
        0,
        "Confirma la finalización o revisa el esfuerzo restante",
      );
      continue;
    }
    const equivalent = isGroup(a)
      ? occupied.filter(
          (c) =>
            c.source === "google" &&
            a.equivalentIds.includes(c.id) &&
            c.date >= a.startDate &&
            endStamp(c) <= deadline(a),
        )
      : [];
    // Each linked occupied interval reduces tentative collaboration once; never adds an individual-real record.
    const covered = mergeIntervals(equivalent).reduce(
      (sum, c) => sum + duration(c),
      0,
    );
    const kept = sessions
      .filter((s) => s.activityId === a.id)
      .reduce((sum, s) => sum + duration(s), 0);
    remaining = Math.max(0, remaining - covered - kept);
    let start = Math.max(
      dayNumber(NOW_DATE) + NOW_MINUTE,
      dayNumber(a.startDate),
    );
    let dependencyFailed = false;
    for (const depId of a.dependencies) {
      const dep = w.activities.find((x) => x.id === depId);
      if (dep?.preparation === "done") continue;
      const depSessions = sessions.filter((s) => s.activityId === depId);
      if (
        !dep ||
        !handled.has(depId) ||
        issues.some((x) => x.activityId === depId) ||
        !depSessions.length
      ) {
        dependencyFailed = true;
        break;
      }
      start = Math.max(start, ...depSessions.map(endStamp));
    }
    if (dependencyFailed) {
      issue(
        "conflict",
        remaining,
        "La dependencia declarada no está completada ni puede ubicarse antes",
      );
      handled.add(a.id);
      continue;
    }
    const until = Math.min(
      deadline(a),
      dayNumber(w.periodEnd || a.date) + 1440,
    );
    const free = freeIntervals(w, start, until, [...occupied, ...sessions]);
    const totalFree = free.reduce((sum, s) => sum + duration(s), 0);
    const allocate = (slot: Interval, minutes: number) => {
      sessions.push({
        id: `session-${a.id}-${slot.date}-${slot.start}`,
        activityId: a.id,
        date: slot.date,
        start: slot.start,
        end: slot.start + minutes,
        fixed: false,
        group: isGroup(a),
      });
      slot.start += minutes;
      remaining! -= minutes;
    };
    if (isGroup(a)) {
      // Prefer three consecutive days nearest to the deadline; otherwise nearest distinct compatible days.
      const candidates = [...free]
        .filter((s) => duration(s) >= a.groupDuration)
        .reverse();
      const dates = [...new Set(candidates.map((s) => s.date))]
        .sort()
        .reverse();
      let chosen: string[] = [];
      for (const date of dates) {
        const consecutive = Array.from({ length: a.groupCount }, (_, i) =>
          addDays(date, -i),
        );
        if (consecutive.every((d) => dates.includes(d))) {
          chosen = consecutive;
          break;
        }
      }
      if (!chosen.length) chosen = dates.slice(0, a.groupCount);
      for (const date of chosen.sort()) {
        if (remaining <= 0) break;
        const slot = free.find(
          (s) =>
            s.date === date &&
            duration(s) >= Math.min(a.groupDuration, remaining!),
        );
        if (slot) allocate(slot, Math.min(a.groupDuration, remaining));
      }
    } else if (a.divisible !== "yes") {
      const slot = free.find((s) => duration(s) >= remaining!);
      if (slot) allocate(slot, remaining);
    } else {
      for (const slot of free) {
        while (
          remaining >= w.preferences.min &&
          duration(slot) >= w.preferences.min
        ) {
          let length = Math.min(
            remaining,
            duration(slot),
            w.preferences.max,
            w.preferences.preferred,
          );
          // A small tail may be merged only inside the authorized max and same interval.
          if (
            remaining > length &&
            remaining - length < w.preferences.min &&
            remaining <= duration(slot) &&
            remaining <= w.preferences.max
          )
            length = remaining;
          if (length < w.preferences.min) break;
          allocate(slot, length);
        }
        if (!remaining) break;
      }
    }
    if (remaining > 0) {
      const structural =
        totalFree >= remaining && (a.divisible !== "yes" || isGroup(a));
      issue(
        structural ? "conflict" : "deficit",
        remaining,
        structural
          ? `No hay ${isGroup(a) ? "intervalos grupales compatibles en días distintos" : "un bloque continuo suficiente"} antes del plazo`
          : `Faltan ${formatMinutes(remaining)} por ubicar antes del ${shortDate(a.date)} a las ${a.time}`,
      );
    }
    handled.add(a.id);
  }
  return { sessions: sessions.sort((a, b) => stamp(a) - stamp(b)), issues };
}
export function withPlan(w: Workspace, onlyActivity?: string): Workspace {
  return { ...w, ...plan(w, onlyActivity) };
}
export function weekMetrics(w: Workspace, startDate: string) {
  const end = addDays(startDate, 7);
  const deadlines = w.activities.filter(
    (a) => a.confirmed && a.date >= startDate && a.date < end,
  );
  const sessions = w.sessions.filter(
    (s) => s.date >= startDate && s.date < end,
  );
  const activityIds = new Set([
    ...deadlines.map((a) => a.id),
    ...sessions.map((s) => s.activityId),
  ]);
  const issues = w.issues.filter((i) => activityIds.has(i.activityId));
  const capacity = freeIntervals(
    w,
    dayNumber(startDate),
    dayNumber(end),
    occupations(w),
  ).reduce((sum, s) => sum + duration(s), 0);
  const study = sessions
    .filter((s) => !s.group)
    .reduce((sum, s) => sum + duration(s), 0);
  const group = sessions
    .filter((s) => s.group)
    .reduce((sum, s) => sum + duration(s), 0);
  const state =
    !deadlines.length && !sessions.length
      ? "empty"
      : issues.some((i) => i.kind === "conflict")
        ? "conflict"
        : issues.some((i) => i.kind === "deficit")
          ? "deficit"
          : issues.some((i) => i.kind === "pending") ||
              sourceIncomplete(w) ||
              !w.availabilityConfirmed
            ? "incomplete"
            : "viable";
  return {
    deadlines,
    sessions,
    issues,
    capacity,
    study,
    group,
    state,
    deficit: issues
      .filter((i) => i.kind !== "pending")
      .reduce((sum, i) => sum + i.minutes, 0),
  };
}
