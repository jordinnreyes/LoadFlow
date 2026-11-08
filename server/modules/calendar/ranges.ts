import { Temporal } from "@js-temporal/polyfill";
import { dayBoundary, nextDate } from "../availability/rules.js";
import { civilDate, invalid } from "../academics/policy.js";
export type AcademicDeadline = {
  dueAt: string | null;
  dueDate: string;
  timezone: string | null;
};
export function visibleWeekStart(value: string) {
  const start = Temporal.PlainDate.from(civilDate(value));
  if (start.year < 1 || start.dayOfWeek !== 1)
    throw invalid(
      "INVALID_CALENDAR_WEEK",
      "Selecciona una semana que empiece en lunes.",
    );
  return start;
}

export function calendarWeekRange(weekStart: string, zone: string) {
  const start = visibleWeekStart(weekStart);
  return {
    from: new Date(dayBoundary(weekStart, zone)).toISOString(),
    to: new Date(
      dayBoundary(start.add({ days: 7 }).toString(), zone),
    ).toISOString(),
  };
}
export function calendarRanges(
  now: Date,
  zone: string,
  deadlines: AcademicDeadline[],
  includeCurrentWeekIn?: string,
) {
  const today = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
  const future = deadlines
    .map((d) =>
      d.dueAt
        ? Date.parse(d.dueAt)
        : dayBoundary(nextDate(d.dueDate), d.timezone ?? zone),
    )
    .filter((end) => Number.isFinite(end) && end > now.getTime());
  // Date-only obligations define a conservative query boundary, never a fictional
  // scheduling deadline. Unknown academic time still stays unknown in F1/F4.
  let end = future.length
    ? future.reduce((latest, value) => Math.max(latest, value), 0)
    : dayBoundary(nextDate(today), zone);
  let start = dayBoundary(today, zone);
  if (includeCurrentWeekIn) {
    const displayDate = Temporal.Instant.from(now.toISOString())
      .toZonedDateTimeISO(includeCurrentWeekIn)
      .toPlainDate();
    const monday = displayDate.subtract({ days: displayDate.dayOfWeek - 1 });
    const week = calendarWeekRange(monday.toString(), includeCurrentWeekIn);
    start = Math.min(start, Date.parse(week.from));
    end = Math.max(end, Date.parse(week.to));
  }
  const result: { from: string; to: string }[] = [];
  while (start < end) {
    const next = Temporal.Instant.fromEpochMilliseconds(start)
      .toZonedDateTimeISO(zone)
      .add({ days: 31 }).epochMilliseconds;
    const until = Math.min(end, next);
    result.push({
      from: new Date(start).toISOString(),
      to: new Date(until).toISOString(),
    });
    start = until;
  }
  return result;
}
