import { useLayoutEffect, useRef } from "react";
import { Temporal } from "@js-temporal/polyfill";
import type { Activity, CalendarEvents, WeeklyPlan } from "../../api/academic";
import { addDays, dayBoundary, WEEKDAY_LABELS } from "./shared";

const MINUTES_PER_DAY = 24 * 60;
type Session = WeeklyPlan["weeks"][number]["sessions"][number];
type Entry = {
  key: string;
  title: string;
  kind: "google" | "session" | "deadline";
  href?: string;
  details?: string;
};
type TimedEntry = Entry & { from: number; to: number; allDay?: boolean };
type PositionedEntry = TimedEntry & {
  start: number;
  end: number;
  displayEnd: number;
  lane: number;
};

function localMinute(instant: number, zone: string) {
  const time =
    Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(zone);
  return time.hour * 60 + time.minute + time.second / 60;
}

function clockLabel(minute: number) {
  const whole = Math.floor(minute);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function positionedGroups(entries: TimedEntry[], date: string, zone: string) {
  const dayStart = dayBoundary(date, zone);
  const dayEnd = dayBoundary(addDays(date, 1), zone);
  const visible = entries
    .flatMap((entry) => {
      if (entry.allDay) return [];
      const from = Math.max(entry.from, dayStart);
      const to = Math.min(entry.to, dayEnd);
      if (from >= to) return [];
      const start = from === dayStart ? 0 : localMinute(from, zone);
      const wallEnd = to === dayEnd ? MINUTES_PER_DAY : localMinute(to, zone);
      // A repeated local hour can place an event's end before its start on the clock.
      const layoutEnd =
        wallEnd > start
          ? wallEnd
          : Math.min(MINUTES_PER_DAY, start + (to - from) / 60000);
      const displayEnd = Math.min(
        MINUTES_PER_DAY,
        Math.max(layoutEnd, start + 20),
      );
      return [{ ...entry, start, end: wallEnd, displayEnd, lane: 0 }];
    })
    .sort((a, b) => a.start - b.start || b.displayEnd - a.displayEnd);
  const groups: { entries: PositionedEntry[]; lanes: number[]; end: number }[] =
    [];
  for (const entry of visible) {
    // Short blocks have room for one line. Reserve that space when placing overlaps.
    let group = groups.at(-1);
    if (!group || entry.start >= group.end) {
      group = { entries: [], lanes: [], end: 0 };
      groups.push(group);
    }
    const lane = group.lanes.findIndex((end) => end <= entry.start);
    entry.lane = lane < 0 ? group.lanes.length : lane;
    group.lanes[entry.lane] = entry.displayEnd;
    group.end = Math.max(group.end, entry.displayEnd);
    group.entries.push(entry);
  }
  return groups;
}

function CalendarEntry({
  entry,
  time,
  lane,
  count,
}: {
  entry: Entry;
  time: string;
  lane?: PositionedEntry;
  count?: number;
}) {
  const className = `connected-calendar-entry ${entry.kind}${lane ? " timed" : ""}`;
  const style =
    lane && count
      ? {
          insetBlockStart: `${(lane.start / MINUTES_PER_DAY) * 100}%`,
          blockSize: `${((lane.displayEnd - lane.start) / MINUTES_PER_DAY) * 100}%`,
          insetInlineStart: `calc(${(lane.lane / count) * 100}% + 2px)`,
          inlineSize: `calc(${100 / count}% - 4px)`,
        }
      : undefined;
  const label = [time, entry.details].filter(Boolean).join(" · ");
  const props = { className, style, title: `${entry.title} · ${label}` };
  const content = (
    <>
      <strong>{entry.title}</strong>
      <small>{label}</small>
    </>
  );
  return entry.href ? (
    <a {...props} href={entry.href}>
      {content}
    </a>
  ) : (
    <div {...props}>{content}</div>
  );
}

export function WeeklyCalendar({
  start,
  zone,
  google,
  deadlines,
  sessions,
  activityTitle,
  positionKey,
  positions,
}: {
  start: string;
  zone: string | null;
  google: CalendarEvents["items"];
  deadlines: Activity[];
  sessions: Session[];
  activityTitle: (id: string) => string;
  positionKey: string;
  positions: Map<string, { top: number; left: number }>;
}) {
  const scroll = useRef<HTMLElement>(null);
  const axis = useRef<HTMLDivElement>(null);
  const dates = WEEKDAY_LABELS.map((label, index) => ({
    label,
    date: addDays(start, index),
  }));
  const weekStart = zone ? dayBoundary(start, zone) : 0;
  const weekEnd = zone ? dayBoundary(addDays(start, 7), zone) : 0;
  const dated = deadlines.map((item) => ({
    date: item.dueDate,
    time: item.dueTime,
    at: Date.parse(item.dueAt ?? ""),
    entry: {
      key: `deadline:${item.id}`,
      title: item.title,
      kind: "deadline" as const,
      href: `#/calendario/${item.id}`,
      details: "Plazo",
    },
  }));
  const inside = (at: number) => at >= weekStart && at < weekEnd;
  const timed: TimedEntry[] = [
    ...google.map((item, index): TimedEntry => ({
      key: `google:${index}`,
      title: item.title,
      kind: "google",
      from: Date.parse(item.startAt),
      to: Date.parse(item.endAt),
      allDay: item.allDay,
      details: item.blocksTime ? undefined : "Marcado como libre",
    })),
    ...sessions.map((item): TimedEntry => ({
      key: `session:${item.id}`,
      title: activityTitle(item.activityId),
      kind: "session",
      href: `#/calendario/${item.activityId}`,
      from: Date.parse(item.startAt),
      to: Date.parse(item.endAt),
      details:
        item.kind === "group" ? "Reserva" : item.fixed ? "Fijada" : "Estudio",
    })),
    ...dated
      .filter((item) => inside(item.at))
      .map(({ at, entry }) => ({
        ...entry,
        from: at,
        to: at + 1000,
      })),
  ];
  const notes = dates.map(({ date }) => [
    ...dated
      .filter((item) => item.date === date && !inside(item.at))
      .map(({ entry, time }) => ({
        entry,
        time: time ?? "Hora por confirmar",
      })),
    ...(zone
      ? timed
          .filter(
            (item) =>
              item.allDay &&
              item.from < dayBoundary(addDays(date, 1), zone) &&
              item.to > dayBoundary(date, zone),
          )
          .map((entry) => ({ entry, time: "Todo el día" }))
      : []),
  ]);
  useLayoutEffect(() => {
    if (!scroll.current || !axis.current) return;
    const previous = positions.get(positionKey);
    scroll.current.scrollTop =
      previous?.top ?? axis.current.clientHeight * (7 / 24);
    scroll.current.scrollLeft = previous?.left ?? 0;
  }, [positionKey, positions]);

  return (
    <section
      ref={scroll}
      className="calendar-scroll connected-calendar-scroll"
      aria-label="Semana del calendario"
      tabIndex={0}
      onScroll={(event) => {
        const { scrollTop: top, scrollLeft: left } = event.currentTarget;
        positions.set(positionKey, { top, left });
      }}
    >
      <div className="connected-calendar-grid">
        <div className="calendar-days">
          <div>Hora</div>
          {dates.map(({ date, label }) => (
            <div key={date}>
              <span>{label}</span>
              <strong>{date.slice(-2)}</strong>
            </div>
          ))}
        </div>
        {notes.some((entries) => entries.length > 0) && (
          <div className="calendar-body connected-calendar-notes">
            <div className="connected-calendar-axis-label">Día</div>
            {notes.map((entries, index) => (
              <div key={dates[index].date}>
                {entries.map(({ entry, time }) => (
                  <CalendarEntry key={entry.key} entry={entry} time={time} />
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="calendar-body connected-calendar-hours">
          <div className="time-axis" ref={axis}>
            {Array.from({ length: 25 }, (_, hour) => (
              <span
                key={hour}
                style={{ insetBlockStart: `${(hour / 24) * 100}%` }}
              >
                {clockLabel(hour * 60)}
              </span>
            ))}
          </div>
          {dates.map(({ date, label }) => (
            <div
              className="day-column"
              key={date}
              role="group"
              aria-label={`${label} ${date.slice(-2)}`}
            >
              {zone &&
                positionedGroups(timed, date, zone).flatMap((group) =>
                  group.entries.map((entry) => (
                    <CalendarEntry
                      key={entry.key}
                      entry={entry}
                      lane={entry}
                      count={group.lanes.length}
                      time={
                        entry.kind === "deadline"
                          ? clockLabel(entry.start)
                          : `${clockLabel(entry.start)}–${clockLabel(entry.end)}`
                      }
                    />
                  )),
                )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
