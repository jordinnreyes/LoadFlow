import type { Span } from "./intervals.ts";

export const POLICY_VERSION = "development-2026-11-06";
export const ALGORITHM_VERSION = "deterministic-1";
export const SEARCH_LIMIT = 10_000;
export const CALCULATION_TIMEOUT_MS = 20_000;
export type Priority = "Alta" | "Media" | "Baja" | null;
export type Activity = {
  id: string;
  type: string;
  confirmedAt: number;
  dueDate: string;
  deadline: number | null;
  start: number | null;
  evaluationEnd: number | null;
  pending: number | null;
  needsReview: boolean;
  priority: Priority;
  divisible: boolean;
  dependencies: string[];
  done: boolean;
  fulfilled: boolean;
  group: {
    enabled: boolean;
    accepted: boolean;
    count: number;
    minutes: number;
  } | null;
};
export type Session = Span & {
  id: string;
  activityId: string;
  kind: "study" | "group";
  fixed: boolean;
  accepted: boolean;
  state: "planned" | "completed" | "cancelled";
};
export type Equivalence = Span & {
  id: string;
  activityId: string;
  sourceId: string;
  valid: boolean;
};
export type Snapshot = {
  now: number;
  end: number;
  timezone: string | null;
  provisionalHorizon: boolean;
  availabilityKnown: boolean;
  sourceFreshUntil: number | null;
  windows: Span[];
  occupied: Span[];
  coverage: Span[];
  sourceIssues: string[];
  activities: Activity[];
  sessions: Session[];
  equivalences: Equivalence[];
  preferences: { minimum: number; preferred: number; maximum: number } | null;
  scope: string | null;
};
export type Diagnostic = {
  activityId: string | null;
  sessionId: string | null;
  code: string;
  kind: "pending" | "deficit" | "conflict" | "search_incomplete";
  minutes: number | null;
};
export type Balance = {
  activityId: string;
  required: number | null;
  scheduled: number;
  covered: number;
  unplaced: number | null;
};
export type Result = {
  algorithmVersion: string;
  policyVersion: string;
  asOf: number;
  horizonEnd: number;
  sessions: Session[];
  diagnostics: Diagnostic[];
  balances: Balance[];
  state: "empty" | "viable" | "partial" | "deficit" | "conflict";
  exploredStates: number;
  searchLimited: boolean;
};
export const isEvaluation = (a: Activity) =>
  [
    "Práctica calificada",
    "Examen parcial",
    "Examen final",
    "Exposición",
  ].includes(a.type);
export const required = (a: Activity) =>
  a.group
    ? !a.group.enabled || a.fulfilled
      ? 0
      : a.group.count * a.group.minutes
    : a.done
      ? 0
      : a.pending;
export const inScope = (snapshot: Snapshot, activityId: string) =>
  snapshot.scope === null || snapshot.scope === activityId;
export const retained = (snapshot: Snapshot, session: Session) =>
  session.state !== "planned" ||
  session.fixed ||
  !inScope(snapshot, session.activityId) ||
  (session.kind === "group" && session.accepted);
export const sameSession = (a: Session, b: Session) =>
  a.id === b.id &&
  a.activityId === b.activityId &&
  a.start === b.start &&
  a.end === b.end &&
  a.kind === b.kind &&
  a.fixed === b.fixed &&
  a.accepted === b.accepted &&
  a.state === b.state;
export const occupancy = (snapshot: Snapshot): Span[] => [
  ...snapshot.occupied,
  ...snapshot.activities
    .filter(
      (a) =>
        isEvaluation(a) &&
        a.deadline !== null &&
        a.evaluationEnd !== null &&
        a.evaluationEnd > a.deadline,
    )
    .map((a) => ({ start: a.deadline!, end: a.evaluationEnd! })),
];
