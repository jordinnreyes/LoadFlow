import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { calculatePlan } from "../../server/modules/planning/calculate.js";
import type { Activity, Snapshot } from "../../packages/planning-core/model.js";
const task = (id: string, rest = {}): Activity => ({
  id,
  type: "Tarea",
  confirmedAt: 0,
  dueDate: "2030-01-01",
  deadline: 300,
  start: 0,
  evaluationEnd: null,
  pending: 60,
  needsReview: false,
  priority: null,
  divisible: false,
  dependencies: [],
  done: false,
  fulfilled: false,
  group: null,
  ...rest,
});
const base = (activities: Activity[], rest = {}): Snapshot => ({
  now: 0,
  end: 600,
  timezone: "America/Lima",
  provisionalHorizon: false,
  availabilityKnown: true,
  sourceFreshUntil: null,
  windows: [{ start: 0, end: 600 }],
  occupied: [],
  coverage: [{ start: 0, end: 600 }],
  sourceIssues: [],
  activities,
  sessions: [],
  equivalences: [],
  preferences: { minimum: 30, preferred: 60, maximum: 120 },
  scope: null,
  ...rest,
});
const samples = [
  [
    "repair",
    base([task("a"), task("b", { pending: 120 })], {
      windows: [
        { start: 0, end: 120 },
        { start: 180, end: 240 },
      ],
    }),
  ],
  [
    "semester",
    base(
      Array.from({ length: 24 }, (_, i) =>
        task(String(i), {
          pending: 120,
          divisible: true,
          deadline: 60 * 1440,
          priority: i < 8 ? "Alta" : i < 16 ? "Media" : null,
        }),
      ),
      {
        end: 60 * 1440,
        windows: Array.from({ length: 60 }, (_, i) => ({
          start: i * 1440 + 540,
          end: i * 1440 + 780,
        })),
        coverage: [{ start: 0, end: 60 * 1440 }],
      },
    ),
  ],
  [
    "bounded_search",
    base(
      Array.from({ length: 5 }, (_, i) =>
        task(String(i), { pending: 60, deadline: 240 }),
      ),
      { end: 240, windows: [{ start: 0, end: 240 }] },
    ),
  ],
] as const;
const rows = [];
for (const [name, input] of samples) {
  const start = performance.now();
  const result = await calculatePlan(input);
  const row = {
    name,
    ms: Math.round(performance.now() - start),
    activities: input.activities.length,
    sessions: result.sessions.length,
    states: result.exploredStates,
    limited: result.searchLimited,
    state: result.state,
    unplaced: result.balances.reduce((n, b) => n + (b.unplaced ?? 0), 0),
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}
await mkdir(".local/f4", { recursive: true });
await writeFile(
  ".local/f4/benchmark.json",
  JSON.stringify(rows, null, 2) + "\n",
);
