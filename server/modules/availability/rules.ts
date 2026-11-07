import { Temporal } from "@js-temporal/polyfill";
import type { AvailabilityConfig } from "../../../packages/contracts/availability.js";
import { invalid, timezone, civilDate } from "../academics/policy.js";
import {
  union,
  subtract,
  type Span,
} from "../../../packages/planning-core/intervals.js";
export {
  union,
  subtract,
  type Span,
} from "../../../packages/planning-core/intervals.js";
export const isoSpans = (spans: Span[]) =>
  spans.map((s) => ({
    startAt: new Date(s.start).toISOString(),
    endAt: new Date(s.end).toISOString(),
  }));
export function dates(from: string, to: string) {
  civilDate(from);
  civilDate(to);
  const a = Temporal.PlainDate.from(from),
    b = Temporal.PlainDate.from(to);
  if (
    a.year < 1 ||
    b.year < 1 ||
    Temporal.PlainDate.compare(a, b) >= 0 ||
    a.until(b).days > 31
  )
    throw invalid(
      "INVALID_RANGE",
      "Consulta un tramo de 1 a 31 días; el horizonte puede consultarse por partes.",
    );
  const days: string[] = [];
  for (let d = a; Temporal.PlainDate.compare(d, b) < 0; d = d.add({ days: 1 }))
    days.push(d.toString());
  return days;
}
export function localPoint(date: string, minute: number, zone: string) {
  let day = Temporal.PlainDate.from(date);
  if (minute === 1440) {
    day = day.add({ days: 1 });
    minute = 0;
  }
  return Temporal.PlainDateTime.from(
    `${day}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
  ).toZonedDateTime(zone, { disambiguation: "reject" }).epochMilliseconds;
}
export function dayBoundary(date: string, zone: string) {
  return Temporal.PlainDate.from(date).toZonedDateTime(zone).epochMilliseconds;
}
export function nextDate(date: string) {
  return Temporal.PlainDate.from(date).add({ days: 1 }).toString();
}
export function validateConfiguration(c: AvailabilityConfig) {
  timezone(c.timezone);
  civilDate(c.validFrom);
  if (Temporal.PlainDate.from(c.validFrom).year < 1)
    throw invalid("INVALID_DATE", "Confirma el año.");
  if (c.validTo !== null) {
    civilDate(c.validTo);
    if (c.validTo < c.validFrom)
      throw invalid(
        "INVALID_VALIDITY",
        "La vigencia final no puede ser anterior al inicio.",
      );
  }
  const p = c.preferences;
  if (
    p.minimumMinutes <= 0 ||
    p.minimumMinutes > p.preferredMinutes ||
    p.preferredMinutes > p.maximumMinutes
  )
    throw invalid(
      "INVALID_PREFERENCES",
      "Usa 0 < mínimo ≤ preferido ≤ máximo.",
    );
  if (new Set(c.weekly.map((d) => d.weekday)).size !== 7)
    throw invalid(
      "DUPLICATE_WEEKDAY",
      "Declara cada día ISO de lunes (1) a domingo (7) una vez.",
    );
  const check = (intervals: { startMinute: number; endMinute: number }[]) => {
    for (const i of intervals)
      if (i.endMinute <= i.startMinute)
        throw invalid(
          "INVALID_WINDOW",
          "El fin debe ser posterior al inicio; divide una ventana nocturna entre sus dos días.",
        );
  };
  for (const d of c.weekly) {
    check(d.intervals);
    if ((d.state === "windows") !== d.intervals.length > 0)
      throw invalid(
        "INCONSISTENT_DAY",
        "Un día con ventanas necesita intervalos; desconocido o no estudiar no admite ventanas.",
      );
  }
  if (new Set(c.exceptions.map((e) => e.date)).size !== c.exceptions.length)
    throw invalid(
      "DUPLICATE_EXCEPTION",
      "Declara una sola excepción por fecha.",
    );
  for (const e of c.exceptions) {
    civilDate(e.date);
    check(e.intervals);
    if ((e.mode === "replace") !== e.intervals.length > 0)
      throw invalid(
        "INVALID_EXCEPTION",
        "Confirma los intervalos de reemplazo o declara no estudiar/desconocido.",
      );
  }
  for (const r of c.manualCoverage) {
    civilDate(r.from);
    civilDate(r.to);
    if (r.to <= r.from)
      throw invalid(
        "INVALID_COVERAGE",
        "La cobertura manual requiere un rango explícito con fin posterior al inicio.",
      );
  }
}
export function resolveWindows(
  c: AvailabilityConfig,
  from: string,
  to: string,
  now: Date,
) {
  const authorized: Span[] = [],
    unknownDates: string[] = [],
    issues: { code: string; date: string }[] = [];
  for (const date of dates(from, to)) {
    const exception = c.exceptions.find((e) => e.date === date),
      weekly = c.weekly.find(
        (d) => d.weekday === Temporal.PlainDate.from(date).dayOfWeek,
      )!;
    let state = exception
      ? exception.mode === "replace"
        ? "windows"
        : exception.mode
      : weekly.state;
    if (
      !exception &&
      (date < c.validFrom || (c.validTo !== null && date > c.validTo))
    )
      state = "unknown";
    if (state === "unknown") {
      unknownDates.push(date);
      issues.push({ code: "WINDOWS_UNKNOWN", date });
      continue;
    }
    if (state === "no_study") continue;
    try {
      const local = (exception?.intervals ?? weekly.intervals).map((i) => ({
        start: Math.max(
          localPoint(date, i.startMinute, c.timezone),
          Math.ceil(now.getTime() / 60000) * 60000,
        ),
        end: localPoint(date, i.endMinute, c.timezone),
      }));
      authorized.push(...local.filter((s) => s.end > s.start));
    } catch {
      unknownDates.push(date);
      issues.push({ code: "DST_REVIEW_REQUIRED", date });
    }
  }
  return { windows: union(authorized), unknownDates, issues };
}
export function coveredDates(c: AvailabilityConfig, from: string, to: string) {
  return dates(from, to).filter((date) =>
    c.manualCoverage.some((r) => r.from <= date && date < r.to),
  );
}
