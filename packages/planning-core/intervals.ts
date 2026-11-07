// Generalizes the half-open union/subtraction used by src/rules.ts and F2.
// Coordinates may be UTC minutes (planner) or milliseconds (source capacity).
export type Span = { start: number; end: number };
export const overlaps = (a: Span, b: Span) =>
  a.start < b.end && b.start < a.end;
export const duration = (s: Span) => s.end - s.start;
export function union(spans: readonly Span[]): Span[] {
  const result: Span[] = [];
  for (const span of spans
    .filter(
      (s) =>
        Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start,
    )
    .map((s) => ({ ...s }))
    .sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = result.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else result.push(span);
  }
  return result;
}
export function subtract(
  windows: readonly Span[],
  busy: readonly Span[],
): Span[] {
  const occupied = union(busy);
  const result: Span[] = [];
  for (const window of union(windows)) {
    let cursor = window.start;
    for (const block of occupied) {
      if (block.end <= cursor) continue;
      if (block.start >= window.end) break;
      if (block.start > cursor)
        result.push({ start: cursor, end: Math.min(block.start, window.end) });
      cursor = Math.max(cursor, block.end);
      if (cursor >= window.end) break;
    }
    if (cursor < window.end) result.push({ start: cursor, end: window.end });
  }
  return result;
}
export const intersect = (a: readonly Span[], b: readonly Span[]) =>
  subtract(a, subtract(a, b));
export const minutes = (spans: readonly Span[]) =>
  union(spans).reduce((n, s) => n + duration(s), 0);
export const contains = (windows: readonly Span[], span: Span) =>
  union(windows).some((w) => w.start <= span.start && span.end <= w.end);
