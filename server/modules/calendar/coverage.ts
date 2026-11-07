import { union, subtract, type Span } from "../availability/rules.js";
import { CALENDAR_POLICY } from "./provider.js";
export type StoredSnapshot = {
  id: string;
  calendar_id: string;
  connection_revision: number;
  selection_revision: number;
  range_start: Date;
  range_end: Date;
  fetched_at: Date;
  intervals: Span[];
};
export function intersect(a: Span[], b: Span[]) {
  return subtract(a, subtract(a, b));
}
export function snapshotCoverage(
  sourceIds: string[],
  snapshots: StoredSnapshot[],
  range: Span,
  now: Date,
  connection: {
    revision: number;
    selection_revision: number;
    state: string;
    safe_error: string | null;
  },
  failures: Record<string, number> = {},
) {
  let covered: Span[] = [range];
  const reference: Span[] = [];
  let lastFetchedAt: string | null = null;
  let anyFresh = false;
  let validUntil: number | null = null;
  for (const id of sourceIds) {
    let consumed: Span[] = [],
      fresh: Span[] = [];
    for (const s of snapshots
      .filter((s) => s.calendar_id === id)
      .sort(
        (a, b) =>
          new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime() ||
          b.id.localeCompare(a.id),
      )) {
      const window = intersect(
        [
          {
            start: new Date(s.range_start).getTime(),
            end: new Date(s.range_end).getTime(),
          },
        ],
        [range],
      );
      const remaining = subtract(window, consumed);
      if (!remaining.length) continue;
      reference.push(...intersect(s.intervals, remaining));
      consumed = union([...consumed, ...window]);
      const timestamp = new Date(s.fetched_at).getTime();
      if (lastFetchedAt === null || timestamp > Date.parse(lastFetchedAt))
        lastFetchedAt = new Date(timestamp).toISOString();
      if (
        connection.state === "active" &&
        (!connection.safe_error ||
          connection.safe_error === "CALENDAR_PARTIAL") &&
        s.connection_revision === connection.revision &&
        s.selection_revision === connection.selection_revision &&
        !(failures[id] !== undefined && timestamp <= failures[id]) &&
        timestamp <= now.getTime() &&
        now.getTime() - timestamp <= CALENDAR_POLICY.staleAfterSeconds * 1000
      ) {
        fresh.push(...remaining);
        const expires = timestamp + CALENDAR_POLICY.staleAfterSeconds * 1000;
        validUntil =
          validUntil === null ? expires : Math.min(validUntil, expires);
        anyFresh ||= remaining.length > 0;
      }
    }
    covered = intersect(covered, union(fresh));
  }
  if (!sourceIds.length) covered = [];
  const coverage =
    subtract([range], covered).length === 0
      ? "complete"
      : anyFresh
        ? "partial"
        : "unknown";
  return {
    busy: union(reference),
    covered,
    coverage,
    lastFetchedAt,
    validUntil,
  };
}
