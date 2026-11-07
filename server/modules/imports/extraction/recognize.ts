import { Temporal } from "@js-temporal/polyfill";
import type { CellValue } from "read-excel-file/node";
import type { Extracted, Fields } from "./model.ts";

export type Cell = {
  value: CellValue | null;
  column: number;
  formula?: boolean;
  originRow?: number;
};
export type SourceRow = { row: number; cells: Cell[] };
type Role = keyof Fields;

export const simplify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const text = (v: CellValue | null | undefined) =>
  v instanceof Date ? v.toISOString() : String(v ?? "").trim();
export const courseCode = /\b[A-Z]{2,8}\s?-?\d{3,5}\b/;
const months =
  "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split(
    " ",
  );
const monthNames = months.join("|");
export const dateToken = new RegExp(
  `\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{4}|\\d{1,2} de (?:${monthNames}) de \\d{4})\\b`,
  "gi",
);
export const timeToken = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g;
const shortDate = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/;
const noAssessment =
  /^(?:-|—|no|ningun[ao]?|n\/a|feriado|sin evaluacion|total|subtotal|asistencia)(?:\s|$)/;

export function classify(value: string) {
  const s = simplify(value);
  if (/\b(examen\s+(?:parcial|intermedio)|midterm|ep)\b/.test(s))
    return "Examen parcial";
  if (/\b(examen\s+final|final exam|ef)\b/.test(s)) return "Examen final";
  if (/\b(practica\s+calificada|pc\s*\d+)\b/.test(s) || s === "pc")
    return "Práctica calificada";
  if (
    /\b(trabajo|proyecto|actividad|entrega)\s+(?:en\s+grupo|grupal|group)\b/.test(
      s,
    )
  )
    return "Entrega grupal";
  if (/\b(exposicion|presentacion evaluada|oral presentation)\b/.test(s))
    return "Exposición";
  if (/\b(informe|report)\b/.test(s)) return "Informe";
  if (/\b(proyecto individual|individual project)\b/.test(s))
    return "Proyecto individual";
  if (/\b(tarea|homework|assignment|hw\s*[#-]?\s*\d+)\b/.test(s))
    return "Tarea";
  return null;
}
export const assessment =
  /\b(?:examen|exam|midterm|evaluacion\s+continua|continua\s*\d+|ec\s*\d+|practica\s+calificada|pc\s*\d+|proyecto|exposicion|homework|assignment|tarea|entrega\s+grupal)\b/;

export function dateOrder(values: string[]) {
  const orders = new Set<string>();
  for (const value of values) {
    const match = shortDate.exec(value);
    if (!match || !normalizeDate(value, null)) continue;
    if (+match[1] > 12 && +match[2] <= 12) orders.add("DMY");
    if (+match[2] > 12 && +match[1] <= 12) orders.add("MDY");
  }
  return orders.size === 1 ? [...orders][0] : null;
}

export function normalizeDate(
  value: CellValue | null | undefined,
  order: string | null,
): string | null {
  let iso = value instanceof Date ? text(value).slice(0, 10) : text(value);
  const named = new RegExp(`^(\\d{1,2}) de (${monthNames}) de (\\d{4})$`).exec(
    iso.toLowerCase(),
  );
  if (named) {
    const month = String(months.indexOf(named[2]) + 1).padStart(2, "0");
    iso = named[3] + "-" + month + "-" + named[1].padStart(2, "0");
  }
  const m = shortDate.exec(iso);
  if (m) {
    const direction = +m[1] > 12 ? "DMY" : +m[2] > 12 ? "MDY" : order;
    if (!direction && m[1].padStart(2, "0") !== m[2].padStart(2, "0"))
      return null;
    const [day, month] = direction === "MDY" ? [m[2], m[1]] : [m[1], m[2]];
    iso = m[3] + "-" + month.padStart(2, "0") + "-" + day.padStart(2, "0");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  try {
    return Temporal.PlainDate.from(iso).toString();
  } catch {
    return null;
  }
}

function normalizeTime(value: CellValue | null | undefined) {
  if (value instanceof Date) {
    if (
      value.getUTCFullYear() > 1904 ||
      value.getUTCSeconds() ||
      value.getUTCMilliseconds()
    )
      return null;
    return value.toISOString().slice(11, 16);
  }
  if (typeof value === "number" && value >= 0 && value < 1) {
    const minutes = Math.round(value * 1440);
    if (minutes >= 1440 || Math.abs(minutes - value * 1440) > 0.001)
      return null;
    return (
      String(Math.floor(minutes / 60)).padStart(2, "0") +
      ":" +
      String(minutes % 60).padStart(2, "0")
    );
  }
  const m = /^([01]?\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(text(value));
  return m ? m[1].padStart(2, "0") + ":" + m[2] : null;
}

export function candidate(
  row: number,
  unit: number,
  source: Partial<Record<Role, Cell>>,
  order: string | null,
  extra: string[] = [],
): Extracted {
  const original = {} as Fields;
  const columns: Record<string, number> = {};
  const sourceRows: Record<string, number> = {};
  const issues = [...extra];
  for (const key of [
    "title",
    "course",
    "type",
    "dueDate",
    "dueTime",
    "endTime",
  ] as const) {
    const cell = source[key];
    original[key] = text(cell?.value).slice(0, 240) || null;
    if (cell) {
      columns[key] = cell.column;
      if (cell.formula) issues.push(key + ":CACHED_FORMULA_REVIEW");
      if (cell.originRow) {
        sourceRows[key] = cell.originRow;
        if (cell.formula !== undefined) issues.push(key + ":MERGED_CELL");
      }
    }
  }
  const fields: Fields = {
    title: original.title?.slice(0, 180) ?? null,
    course: original.course?.slice(0, 120) ?? null,
    type: classify(original.type ?? original.title ?? ""),
    dueDate: normalizeDate(source.dueDate?.value, order),
    dueTime: normalizeTime(source.dueTime?.value),
    endTime: normalizeTime(source.endTime?.value),
  };
  for (const key of ["title", "course", "type", "dueDate"] as const)
    if (!fields[key])
      issues.push(key + (original[key] ? ":REVIEW" : ":MISSING"));
  for (const key of ["dueTime", "endTime"] as const)
    if (original[key] && !fields[key]) issues.push(key + ":REVIEW");
  if (fields.endTime && (!fields.dueTime || fields.endTime <= fields.dueTime)) {
    fields.endTime = null;
    issues.push("endTime:REVIEW");
  }
  if (fields.dueTime) issues.push("timezone:MISSING");
  return {
    fields,
    original,
    locator: { unit, row, columns, sourceRows },
    issues,
  };
}

const aliases: Record<Role, RegExp> = {
  title:
    /^(?:evaluacion\d*|actividad(?: evaluada)?|obligacion|tarea|entregable|assessment|assignment|titulo|nombre(?: de la (?:evaluacion|actividad))?)$/,
  course:
    /^(?:curso|asignatura|materia|course|cod\.? (?:del )?curso|codigo(?: (?:del )?curso)?)$/,
  type: /^(?:tipo(?: de (?:evaluacion|actividad))?|categoria|type)$/,
  dueDate:
    /^(?:fecha(?: de (?:entrega|evaluacion|vencimiento)| limite| programada)?|vencimiento|deadline|due date|date)$/,
  dueTime:
    /^(?:hora(?: de (?:entrega|evaluacion|inicio)| inicio| limite)?|inicio|start(?: time)?|due time)$/,
  endTime: /^(?:hora(?: de)? fin|hora final|fin|end(?: time)?)$/,
};

export function tableHeader(row: SourceRow) {
  const out: Partial<Record<Role, number>> = {};
  for (const cell of row.cells) {
    const label = simplify(text(cell.value)).replace(/[:*]$/, "");
    for (const key of Object.keys(aliases) as Role[]) {
      if (aliases[key].test(label) && out[key] === undefined)
        out[key] = cell.column;
    }
  }
  return out.title !== undefined &&
    (out.dueDate !== undefined || out.type !== undefined)
    ? out
    : null;
}

export function recognizeTable(
  rows: SourceRow[],
  unit: number,
  fallbackCourse?: Cell,
) {
  const result: Extracted[] = [];
  let header: ReturnType<typeof tableHeader> = null;
  let order: string | null = null;
  for (const [index, row] of rows.entries()) {
    const next = tableHeader(row);
    if (next) {
      header = next;
      const values: string[] = [];
      for (const other of rows.slice(index + 1)) {
        if (tableHeader(other)) break;
        values.push(
          text(other.cells.find((cell) => cell.column === next.dueDate)?.value),
        );
      }
      order = dateOrder(values);
      continue;
    }
    if (!header) continue;
    const source: Partial<Record<Role, Cell>> = {};
    for (const key of Object.keys(header) as Role[]) {
      source[key] = row.cells.find((cell) => cell.column === header![key]);
    }
    const title = simplify(text(source.title?.value));
    if (!title || noAssessment.test(title)) continue;
    const explicit = classify(title) ?? classify(text(source.type?.value));
    if (!explicit && !assessment.test(title) && !text(source.dueDate?.value))
      continue;
    if (!text(source.course?.value)) source.course = fallbackCourse;
    result.push(candidate(row.row, unit, source, order));
  }
  return result;
}
