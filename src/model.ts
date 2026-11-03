export type Priority = "Alta" | "Media" | "Baja" | "";
export type ActivityType =
  | "Práctica calificada"
  | "Examen parcial"
  | "Examen final"
  | "Tarea"
  | "Informe"
  | "Exposición"
  | "Proyecto individual"
  | "Entrega grupal";
export type CalendarState =
  "manual" | "connected" | "stale" | "revoked" | "error";
export type EstimateOrigin =
  "manual" | "suggested" | "personalized" | "corrected";
export interface Interval {
  id: string;
  date: string;
  start: number;
  end: number;
}
export interface Commitment extends Interval {
  title: string;
  source: "manual" | "academic" | "google";
  calendar?: string;
  activityId?: string;
}
export interface StudyWindow {
  id: string;
  day: number;
  start: number;
  end: number;
}
export interface Session extends Interval {
  activityId: string;
  fixed: boolean;
  group: boolean;
  equivalent?: boolean;
}
export interface DateRevision {
  before: string;
  after: string;
  source: string;
  at: string;
}
export interface RealRevision {
  before: number | null;
  after: number | null;
  at: string;
}
export interface Activity {
  id: string;
  title: string;
  course: string;
  type: ActivityType;
  date: string;
  time: string;
  eventEnd: string;
  effort: number | null;
  real: number | null;
  remaining: number | null;
  priority: Priority | "inherit";
  startDate: string;
  divisible: "yes" | "no" | "unknown";
  dependencies: string[];
  confirmed: boolean;
  origin: string;
  estimateOrigin: EstimateOrigin;
  preparation: "new" | "progress" | "done";
  fulfilled: boolean;
  completedAt: string;
  groupAccepted: boolean;
  groupEnabled: boolean;
  groupCount: number;
  groupDuration: number;
  equivalentIds: string[];
  description: string;
  dateHistory: DateRevision[];
  realHistory: RealRevision[];
}
export interface Issue {
  activityId: string;
  kind: "pending" | "deficit" | "conflict";
  minutes: number;
  message: string;
}
export interface HistoryRecord {
  title: string;
  course: string;
  type: ActivityType;
  estimated: number;
  real: number;
  date: string;
}
export interface DocumentRecord {
  id: string;
  name: string;
  activityIds: string[];
}
export interface Workspace {
  name: string;
  email: string;
  plan: "Free" | "Premium";
  guide: boolean;
  period: string;
  periodEnd: string;
  calendar: CalendarState;
  calendars: string[];
  lastCalendarUpdate: string;
  availabilityConfirmed: boolean;
  manualCoverage: boolean;
  windows: StudyWindow[];
  exceptions: { date: string; enabled: boolean; start: number; end: number }[];
  commitments: Commitment[];
  activities: Activity[];
  drafts: Activity[];
  documents: DocumentRecord[];
  priorities: Record<string, Priority>;
  courses: string[];
  preferences: { preferred: number; min: number; max: number };
  sessions: Session[];
  issues: Issue[];
  history: HistoryRecord[];
  personalEligible: boolean;
  historyConsent: boolean;
  premiumUnavailable: boolean;
  previousSessions: Session[] | null;
  lastReason: string;
  savedAt: string;
  demoScenario: string;
}
export const TYPES: ActivityType[] = [
  "Práctica calificada",
  "Examen parcial",
  "Examen final",
  "Tarea",
  "Informe",
  "Exposición",
  "Proyecto individual",
  "Entrega grupal",
];
export const PRIORITIES: Priority[] = ["Alta", "Media", "Baja"];
export const NOW_DATE = "2026-11-02";
export const NOW_MINUTE = 8 * 60;
export const PERIOD_END = "2026-12-18";
export const uid = (prefix = "id") => `${prefix}-${crypto.randomUUID()}`;
export const isGroup = (a: Activity) => a.type === "Entrega grupal";
export const isEvaluation = (a: Activity) =>
  [
    "Práctica calificada",
    "Examen parcial",
    "Examen final",
    "Exposición",
  ].includes(a.type);
export const priorityKey = (course: string, type: string) =>
  `${course}::${type}`;
export function emptyActivity(id = uid("activity")): Activity {
  return {
    id,
    title: "",
    course: "",
    type: "Tarea",
    date: "",
    time: "",
    eventEnd: "",
    effort: null,
    real: null,
    remaining: null,
    priority: "inherit",
    startDate: "",
    divisible: "unknown",
    dependencies: [],
    confirmed: false,
    origin: "Manual",
    estimateOrigin: "manual",
    preparation: "new",
    fulfilled: false,
    completedAt: "",
    groupAccepted: false,
    groupEnabled: true,
    groupCount: 3,
    groupDuration: 120,
    equivalentIds: [],
    description: "",
    dateHistory: [],
    realHistory: [],
  };
}
