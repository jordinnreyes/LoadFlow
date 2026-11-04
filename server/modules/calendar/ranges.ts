import { Temporal } from "@js-temporal/polyfill";
import { dayBoundary, nextDate } from "../availability/rules.js";
export type AcademicDeadline = {
  dueAt: string | null;
  dueDate: string;
  timezone: string | null;
};
export function calendarRanges(
  now: Date,
  zone: string,
  deadlines: AcademicDeadline[],
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
  const end = future.length
    ? future.reduce((latest, value) => Math.max(latest, value), 0)
    : dayBoundary(nextDate(today), zone);
  const result: { from: string; to: string }[] = [];
  for (let start = dayBoundary(today, zone); start < end;) {
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
