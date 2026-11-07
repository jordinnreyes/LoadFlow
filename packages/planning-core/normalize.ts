import { Temporal } from "@js-temporal/polyfill";
import type { ActivityDto } from "../contracts/academics.js";
import type { Activity } from "./model.ts";
import type { Span } from "./intervals.ts";

export const instantMinute = (
  value: string,
  rounding: "start" | "end" = "start",
) => {
  const milliseconds = Temporal.Instant.from(value).epochMilliseconds;
  return rounding === "start"
    ? Math.ceil(milliseconds / 60000)
    : Math.floor(milliseconds / 60000);
};
export const instant = (minute: number) =>
  new Date(minute * 60000).toISOString();
export const localDay = (minute: number, zone: string) =>
  Temporal.Instant.from(instant(minute))
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
export const addLocalDays = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();
export function splitDays(spans: Span[], zone: string): Span[] {
  const result: Span[] = [];
  for (const span of spans) {
    let start = span.start;
    while (start < span.end) {
      const day = Temporal.PlainDate.from(localDay(start, zone));
      const midnight =
        day.add({ days: 1 }).toZonedDateTime(zone).epochMilliseconds / 60000;
      const end = Math.min(span.end, midnight);
      result.push({ start, end });
      start = end;
    }
  }
  return result;
}
export function academicMinute(
  date: string,
  time: string | null,
  zone: string | null,
) {
  if (!time || !zone) return null;
  const value = Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(
    zone,
    { disambiguation: "reject" },
  );
  return Math.floor(value.epochMilliseconds / 60000);
}
export function horizon(
  now: Date,
  endDate: string | null,
  zone: string | null,
  deadlines: (number | null)[],
) {
  const start = Math.ceil(now.getTime() / 60000);
  if (!Number.isFinite(start)) throw new Error("INVALID_PLANNING_CLOCK");
  if (endDate && zone) {
    const after = Temporal.PlainDate.from(endDate)
      .add({ days: 1 })
      .toZonedDateTime(zone);
    return {
      start,
      end: Math.floor(after.epochMilliseconds / 60000),
      provisional: false,
    };
  }
  return {
    start,
    end: Math.max(start, ...deadlines.filter((d): d is number => d !== null)),
    provisional: true,
  };
}
export function normalizeActivity(
  a: ActivityDto,
  confirmedAt: string,
  group: Activity["group"],
): Activity {
  return {
    id: a.id,
    type: a.type,
    confirmedAt: Temporal.Instant.from(confirmedAt).epochMilliseconds,
    dueDate: a.dueDate,
    deadline: academicMinute(a.dueDate, a.dueTime, a.timezone),
    start: a.allowedStartAt ? instantMinute(a.allowedStartAt) : null,
    evaluationEnd: a.evaluationEndAt
      ? instantMinute(a.evaluationEndAt, "end")
      : null,
    pending: a.pendingMinutes,
    needsReview: a.needsReview,
    priority:
      a.effectivePriority === "Alta" ||
      a.effectivePriority === "Media" ||
      a.effectivePriority === "Baja"
        ? a.effectivePriority
        : null,
    divisible: a.divisibility === "divisible",
    dependencies: [...a.dependencies].sort(),
    done: a.preparationState === "done",
    fulfilled: a.fulfillmentState === "fulfilled",
    group,
  };
}
