import {
  emptyActivity,
  type Activity,
  type Workspace,
  type Commitment,
  priorityKey,
  NOW_DATE,
  PERIOD_END,
} from "./model";
import { addDays, withPlan } from "./rules";

export const SCENARIOS = [
  {
    id: "balanced",
    name: "Semana viable",
    detail: "Varios cursos, trabajo adelantado y reservas grupales.",
  },
  {
    id: "empty",
    name: "Primera visita",
    detail: "Tablero vacío y disponibilidad todavía sin confirmar.",
  },
  {
    id: "incomplete",
    name: "Información pendiente",
    detail: "Una evaluación sin horas y otra sin inicio permitido.",
  },
  {
    id: "overload",
    name: "Sobrecarga",
    detail: "Más trabajo del que cabe antes del plazo.",
  },
  {
    id: "conflict",
    name: "Sin bloque compatible",
    detail: "Una actividad indivisible de 3 h y huecos de 1 h.",
  },
  {
    id: "stale",
    name: "Calendar desactualizado",
    detail: "Última ocupación conocida; viabilidad actual sin verificar.",
  },
  {
    id: "premium",
    name: "Premium con historial",
    detail: "Sugerencia personalizada de ejemplo y registro real.",
  },
];
const sample = (
  id: string,
  title: string,
  course: string,
  type: Activity["type"],
  date: string,
  effort: number | null,
  rest: Partial<Activity> = {},
): Activity => ({
  ...emptyActivity(id),
  title,
  course,
  type,
  date,
  time: "18:00",
  effort,
  confirmed: true,
  startDate: NOW_DATE,
  divisible: "yes",
  description:
    "Material de demostración: revisar conceptos, resolver ejercicios y verificar resultados.",
  origin: "Cronograma de ejemplo.xlsx · Hoja Evaluaciones",
  ...rest,
});
export const exampleActivities = (): Activity[] => [
  sample(
    "pc-calculo-1",
    "PC 3 · Integrales y aplicaciones",
    "Cálculo II",
    "Práctica calificada",
    "2026-11-05",
    240,
    { time: "10:00", eventEnd: "12:00" },
  ),
  sample(
    "tarea-programacion",
    "Algoritmos de búsqueda",
    "Programación II",
    "Tarea",
    "2026-11-06",
    180,
    { startDate: "2026-11-03" },
  ),
  sample(
    "parcial-fisica",
    "Parcial · Dinámica y energía",
    "Física I",
    "Examen parcial",
    "2026-11-12",
    360,
    { time: "10:00", eventEnd: "12:00" },
  ),
  sample(
    "grupo-innovacion",
    "Avance del proyecto · Prototipo",
    "Innovación",
    "Entrega grupal",
    "2026-11-13",
    null,
    { groupAccepted: true },
  ),
  sample(
    "pc-calculo-2",
    "PC 4 · Series y sucesiones",
    "Cálculo II",
    "Práctica calificada",
    "2026-11-19",
    180,
    { startDate: "2026-11-09", time: "10:00", eventEnd: "12:00" },
  ),
  sample(
    "informe-fisica",
    "Informe · Conservación de energía",
    "Física I",
    "Informe",
    "2026-11-24",
    240,
    { startDate: "2026-11-16" },
  ),
  sample(
    "final-programacion",
    "Final · Estructuras de datos",
    "Programación II",
    "Examen final",
    "2026-12-10",
    480,
    { startDate: "2026-11-30", time: "09:00", eventEnd: "11:00" },
  ),
];
export function importExamples(
  kind: "excel" | "pdf" | "missing" | "updated",
): Activity[] {
  if (kind === "updated")
    return [
      {
        ...exampleActivities()[2],
        date: "2026-11-04",
        confirmed: false,
        origin: "Cronograma actualizado.pdf · página 2",
      },
    ];
  if (kind === "pdf")
    return [
      sample(
        "pdf-informe",
        "Informe · Modelo experimental",
        "Física I",
        "Informe",
        "2026-11-18",
        null,
        {
          confirmed: false,
          startDate: "",
          divisible: "unknown",
          origin: "Enunciado de ejemplo.pdf · página 1",
        },
      ),
    ];
  return Array.from({ length: 7 }, (_, i) =>
    sample(
      `import-${i}`,
      i < 5
        ? `PC ${i + 1} · Cálculo II`
        : i === 5
          ? "Parcial · Programación II"
          : "Final · Física I",
      i < 5 ? "Cálculo II" : i === 5 ? "Programación II" : "Física I",
      i < 5
        ? "Práctica calificada"
        : i === 5
          ? "Examen parcial"
          : "Examen final",
      addDays("2026-11-05", i * 6),
      null,
      {
        confirmed: false,
        startDate: "",
        divisible: "unknown",
        origin: "Evaluaciones de ejemplo.xlsx · Hoja 1",
        ...(kind === "missing" && i === 6 ? { date: "" } : {}),
      },
    ),
  );
}
export function googleCommitments(): Commitment[] {
  return Array.from({ length: 7 }, (_, week) => [
    {
      id: `clase-${week}-1`,
      title: "Clase de Cálculo II",
      date: addDays(NOW_DATE, week * 7),
      start: 9 * 60,
      end: 11 * 60,
      source: "google" as const,
      calendar: "Universidad",
    },
    {
      id: `clase-${week}-2`,
      title: "Clase de Física I",
      date: addDays(NOW_DATE, week * 7 + 2),
      start: 15 * 60,
      end: 17 * 60,
      source: "google" as const,
      calendar: "Universidad",
    },
    {
      id: `gym-${week}`,
      title: "Gimnasio",
      date: addDays(NOW_DATE, week * 7 + 1),
      start: 18 * 60,
      end: 19 * 60,
      source: "google" as const,
      calendar: "Personal",
    },
  ])
    .flat()
    .concat([
      {
        id: "reunion-equivalente",
        title: "Reunión privada",
        date: "2026-11-11",
        start: 17 * 60,
        end: 19 * 60,
        source: "google",
        calendar: "Universidad",
      },
    ]);
}
export function makeWorkspace(
  scenario = "balanced",
  plan: Workspace["plan"] = "Free",
): Workspace {
  const activities = exampleActivities();
  const priorities: Workspace["priorities"] = {};
  for (const a of activities)
    priorities[priorityKey(a.course, a.type)] =
      a.type.includes("Examen") || a.type === "Práctica calificada"
        ? "Alta"
        : "Media";
  let w: Workspace = {
    name: plan === "Premium" ? "Valeria" : "Alex",
    email: `${plan.toLowerCase()}@ejemplo.test`,
    plan,
    period: "2026 · Ciclo II",
    periodEnd: PERIOD_END,
    guide: scenario === "empty",
    calendar: "manual",
    calendars: ["Universidad", "Personal"],
    lastCalendarUpdate: "",
    availabilityConfirmed: scenario !== "empty",
    manualCoverage: true,
    windows: [1, 2, 3, 4, 5]
      .map((day) => ({
        id: `window-${day}`,
        day,
        start: 16 * 60,
        end: 19 * 60,
      }))
      .concat([{ id: "window-6", day: 6, start: 9 * 60, end: 12 * 60 }]),
    exceptions: [],
    commitments: [],
    activities,
    drafts: [],
    documents: [
      {
        id: "demo-source",
        name: "Cronograma de ejemplo.xlsx",
        activityIds: activities.map((a) => a.id),
      },
    ],
    priorities,
    courses: ["Cálculo II", "Programación II", "Física I", "Innovación"],
    preferences: { preferred: 60, min: 30, max: 120 },
    sessions: [],
    issues: [],
    history: [],
    personalEligible: false,
    historyConsent: false,
    premiumUnavailable: false,
    previousSessions: null,
    lastReason: "",
    savedAt: "",
    demoScenario: scenario,
  };
  if (scenario === "empty")
    w = {
      ...w,
      activities: [],
      documents: [],
      windows: [],
      priorities: {},
      courses: [],
    };
  if (scenario === "incomplete") {
    w.activities[0].effort = null;
    w.activities[1].startDate = "";
  }
  if (scenario === "overload") {
    w.activities = w.activities.slice(0, 3);
    w.activities[0].effort = 1440;
    w.activities[1].effort = 720;
  }
  if (scenario === "conflict") {
    w.activities = [
      sample(
        "indivisible",
        "Simulacro completo · Un solo bloque",
        "Cálculo II",
        "Tarea",
        "2026-11-06",
        180,
        { divisible: "no" },
      ),
    ];
    w.windows = [1, 2, 3, 4, 5].map((day) => ({
      id: `short-${day}`,
      day,
      start: 16 * 60,
      end: 17 * 60,
    }));
    w.priorities = { [priorityKey("Cálculo II", "Tarea")]: "Alta" };
  }
  if (scenario === "stale") {
    w.calendar = "stale";
    w.manualCoverage = false;
    w.lastCalendarUpdate = "1 nov. 2026 · 18:30 (simulado)";
    w.commitments = googleCommitments();
  }
  if (scenario === "premium") {
    w.plan = "Premium";
    w.personalEligible = true;
    w.history = [4, 5, 6, 4].map((hours, i) => ({
      title: `PC de referencia ${i + 1}`,
      course: "Cálculo II",
      type: "Práctica calificada",
      estimated: 240,
      real: hours * 60,
      date: `2026-10-${20 + i}`,
    }));
  }
  return withPlan(w);
}
