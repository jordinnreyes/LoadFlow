import { Temporal } from "@js-temporal/polyfill";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { FileIssue, limits, type Extracted } from "./model.ts";
import {
  assessment,
  candidate,
  classify,
  courseCode,
  dateOrder,
  dateToken,
  simplify,
  normalizeDate,
  tableHeader,
  timeToken,
  type Cell,
  type SourceRow,
} from "./recognize.ts";

type Block = {
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
type Line = { row: number; text: string; blocks: Block[] };
type Page = { index: number; lines: Line[] };

function linesFrom(blocks: Block[]): Line[] {
  const groups: Block[][] = [];
  for (const block of blocks.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const last = groups.at(-1);
    if (last && Math.abs(block.y - last[0].y) <= 2.5) last.push(block);
    else groups.push([block]);
  }
  return groups.map((line, index) => {
    const blocks: Block[] = [];
    for (const item of line.sort((a, b) => a.x - b.x)) {
      const prev = blocks.at(-1);
      if (
        prev &&
        item.x - prev.x - prev.width < Math.max(6, item.height * 0.75)
      ) {
        const dateSeparator =
          (/\d$/.test(prev.value) && /^[/.-]$/.test(item.value)) ||
          (/\d[/.-]$/.test(prev.value) && /^\d{1,4}$/.test(item.value));
        prev.value += (dateSeparator ? "" : " ") + item.value;
        prev.width = Math.max(prev.width, item.x + item.width - prev.x);
      } else blocks.push({ ...item });
    }
    return {
      row: index + 1,
      text: blocks.map((b) => b.value).join(" "),
      blocks,
    };
  });
}

const cell = (value: string, column = 1, originRow?: number): Cell => ({
  value,
  column,
  originRow,
});
const printed =
  /^(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}|file:\/\/|https?:\/\/)|p[aá]gina\s+\d+\s+de\s+\d+|\.(?:md|pdf)\s*$/i;
const titleMarker =
  /\b(?:laboratorio\s+(?:n[.°º]*\s*)?\d+|lab\s*\d+|hw\s*#?\s*\d+|(?:actividad|trabajo|entrega)\s+grupal\b|(?:tarea|homework|assignment|proyecto|informe|examen|pr[aá]ctica\s+calificada)\s+(?:#?\s*\d+|parcial|final)|(?:tarea|homework|assignment)\s*[:\-])/i;
const explicitDeadline =
  /\b(?:fecha\s+(?:de\s+entrega|l[ií]mite)\b|(?:fecha de )?vencimiento\b|entrega\s*:|deadline\b|due\s+(?:date|on)\b|entregar\s+(?:hasta|el)\b|entrega\s+(?:hasta|el)\b)\s*[:\-]?\s*(.{0,100})/i;

function tableCandidates(pages: Page[], course: Cell | undefined) {
  let columns:
    | { roles: NonNullable<ReturnType<typeof tableHeader>>; page: number }
    | undefined;
  const selected: {
    page: number;
    row: number;
    values: Parameters<typeof candidate>[2];
    issues: string[];
    weekday?: number;
  }[] = [];
  const dates: string[] = [];
  let sawTable = false;
  let courseTable = false;
  const weekdays = [
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
    "domingo",
  ];
  const isAssessment = (label: string) =>
    assessment.test(label) ||
    /^(?:ec|quiz(?: #?\d+)?|lab(?: #?\d+)?|control(?: #?\d+)?)$/.test(label);
  const oneDate = (value: string) =>
    [...value.matchAll(dateToken)].map((m) => m[0]);
  for (const page of pages) {
    for (const [index, line] of page.lines.entries()) {
      const value = simplify(line.text);
      if (/horarios? de (?:apoyo|tutorias)|^seccion iii\b/.test(value)) {
        columns = undefined;
        courseTable = false;
        continue;
      }
      const row: SourceRow = {
        row: line.row,
        cells: line.blocks.map((b) => cell(b.value, Math.round(b.x))),
      };
      const header = tableHeader(row);
      if (header) {
        columns = { roles: header, page: page.index };
        sawTable = true;
        courseTable ||=
          /(?:curso|asignatura)/.test(value) &&
          /(?:inicio|sesion|hora)/.test(value);
        continue;
      }
      if (
        /\bcurso\b/.test(value) &&
        /\bfecha\b/.test(value) &&
        /\b(?:dia|sesion|seccion)\b/.test(value) &&
        /\b(?:hora|aula)\b/.test(value)
      ) {
        courseTable = true;
        sawTable = true;
        continue;
      }
      if (!columns && !courseTable) continue;
      const issues: string[] = [];
      const values: Parameters<typeof candidate>[2] = { course };
      if (columns && page.index - columns.page <= 1) {
        for (const [key, x] of Object.entries(columns.roles)) {
          const block = line.blocks.find((b) => Math.abs(b.x - x) <= 12);
          if (block)
            values[key as keyof typeof values] = cell(
              block.value,
              Math.round(block.x),
            );
        }
        if (!values.course || !courseCode.test(String(values.course.value)))
          values.course = course;
      }
      const sameLineDates = oneDate(line.text);
      if (sameLineDates.length === 1) dates.push(sameLineDates[0]);
      const contextLines: Line[] = [];
      if (courseTable && courseCode.test(line.text)) {
        for (const previous of page.lines
          .slice(Math.max(0, index - 3), index)
          .reverse()) {
          if (courseCode.test(previous.text)) break;
          contextLines.push(previous);
        }
      }
      const typedBlocks = [line, ...contextLines]
        .flatMap((l) => l.blocks)
        .filter((b) => {
          const label = simplify(b.value);
          return (
            label.length <= 100 &&
            isAssessment(label) &&
            !/^(?:sin|ningun[ao]?)\b/.test(label)
          );
        });
      const typed = typedBlocks.length === 1 ? typedBlocks[0] : undefined;
      const contextual =
        courseTable && [...line.text.matchAll(timeToken)].length > 0;
      if (courseTable && !contextual && !courseCode.test(line.text)) continue;
      if (!values.title && contextual && typed) {
        const origin = [line, ...contextLines].find((l) =>
          l.blocks.includes(typed),
        );
        values.title = cell(typed.value, Math.round(typed.x), origin?.row);
      }
      if (!values.title || !isAssessment(simplify(String(values.title.value))))
        continue;
      const nearby = contextual ? contextLines : [];
      const foundDates = [
        ...new Set([
          ...sameLineDates,
          ...nearby.flatMap((l) => oneDate(l.text)),
        ]),
      ];
      if (foundDates.length > 1) {
        values.dueDate = cell(foundDates.join(" / "));
        issues.push("dueDate:MULTIPLE_DATES");
      } else if (contextual && foundDates.length === 1) {
        const origin = [line, ...nearby]
          .flatMap((l) => l.blocks)
          .find((b) => b.value.includes(foundDates[0]));
        const source = [line, ...nearby].find((l) =>
          l.text.includes(foundDates[0]),
        );
        values.dueDate = cell(
          foundDates[0],
          Math.round(origin?.x ?? 1),
          source?.row,
        );
        if (!sameLineDates.length) issues.push("dueDate:ADJACENT_LINE_REVIEW");
      }
      if (
        contextual &&
        !/^proyecto\b/.test(simplify(String(values.title.value)))
      ) {
        const times = [...line.text.matchAll(timeToken)].map(
          (match) => match[0],
        );
        if (times.length === 2) {
          values.dueTime ??= cell(
            times[0],
            Math.round(
              line.blocks.find((b) => b.value.includes(times[0]))?.x ?? 1,
            ),
          );
          values.endTime ??= cell(
            times[1],
            Math.round(
              line.blocks.find((b) => b.value.includes(times[1]))?.x ?? 1,
            ),
          );
        }
      } else if (contextual) {
        values.dueTime = undefined;
        values.endTime = undefined;
        issues.push("dueTime:SESSION_IS_NOT_DEADLINE");
      }
      const weekday =
        weekdays.findIndex((day) => value.split(" ").includes(day)) + 1;
      selected.push({
        page: page.index,
        row: line.row,
        values,
        issues,
        weekday,
      });
    }
  }
  const order = dateOrder(dates);
  return {
    sawTable,
    rows: selected.map(({ page, row, values, issues, weekday }) => {
      const date = normalizeDate(values.dueDate?.value, order);
      const rowCandidate = candidate(row, page, values, order, issues);
      if (
        weekday &&
        date &&
        Temporal.PlainDate.from(date).dayOfWeek !== weekday
      ) {
        rowCandidate.fields.dueDate = null;
        rowCandidate.issues.push("dueDate:WEEKDAY_MISMATCH");
      }
      return rowCandidate;
    }),
  };
}

function syllabusCandidates(pages: Page[], course: Cell | undefined) {
  let grading = false;
  const results: Extracted[] = [];
  for (const page of pages) {
    for (const line of page.lines) {
      if (
        /^(?:\d+[. ]+)?(?:sistema de evaluacion|evaluaciones del curso|grading (?:scheme|policy))\b/.test(
          simplify(line.text),
        )
      ) {
        grading = true;
        continue;
      }
      if (!grading) continue;
      const row =
        /^(.{3,100}?)\s+\d{1,3}\s*%\s+((?:(?:semana|week)\s*\d+\s*)+)$/i.exec(
          line.text,
        );
      if (!row || !assessment.test(simplify(row[1]))) continue;
      results.push(
        candidate(
          line.row,
          page.index,
          {
            title: cell(row[1]),
            course,
            dueDate: cell(row[2].trim()),
          },
          null,
          ["dueDate:ACADEMIC_WEEK_ONLY"],
        ),
      );
    }
  }
  return results;
}

function statement(pages: Page[], course: Cell | undefined, filename: string) {
  const page = pages.find((p) =>
    p.lines.some((line) => !printed.test(line.text) && line.text.length >= 6),
  );
  if (!page) return [];
  const heading = page.lines
    .slice(0, 12)
    .find(
      (line) =>
        line.text.length <= 200 &&
        !printed.test(line.text) &&
        titleMarker.test(line.text),
    );
  if (!heading) return [];
  const marker = heading.text.match(titleMarker)!;
  const title = heading.text
    .slice(marker.index)
    .split(/\s+(?:fecha|date)\s*:/i)[0]
    .trim();
  const issues: string[] = [];
  const titleNumber = /(?:laboratorio|lab|hw)\s*#?\s*0*(\d+)/i.exec(title)?.[1];
  const filenameNumber = /(?:laboratorio|lab|hw)\s*#?\s*0*(\d+)/i.exec(
    filename,
  )?.[1];
  if (titleNumber && filenameNumber && titleNumber !== filenameNumber)
    issues.push("title:FILENAME_DIFFERS");
  if (!course) {
    const header = page.lines
      .slice(0, page.lines.indexOf(heading))
      .filter((l) => !printed.test(l.text));
    const hasTerm = header.some((l) =>
      /^20\d{2}\s*[-–]\s*[12IV]+$/.test(l.text),
    );
    const label = header.find(
      (l) =>
        /^[\p{Lu}][\p{L} ,&/-]{3,80}$/u.test(l.text) &&
        !/^(?:profesor|profesora|docente|instructor|autor|universidad|departamento)\b/i.test(
          l.text,
        ) &&
        /(?:\b(?:de|del|of|and)\b|\b[IVX]{1,4}$)/.test(l.text),
    );
    if (hasTerm && label)
      course = cell(label.text, Math.round(label.blocks[0].x));
  }
  const all = pages
    .flatMap((p) => p.lines)
    .filter((line) => !printed.test(line.text));
  const explicit = all.flatMap((line) => {
    const match = explicitDeadline.exec(line.text);
    return match ? [match[1]] : [];
  });
  const dates = [
    ...new Set(
      explicit.flatMap((entry) =>
        [...entry.matchAll(dateToken)].map((m) => m[0]),
      ),
    ),
  ];
  const times = [
    ...new Set(
      explicit.flatMap((entry) =>
        [...entry.matchAll(timeToken)].map((m) => m[0]),
      ),
    ),
  ];
  const contextual = all.find((l) =>
    /(?:al final de (?:la clase|la sesion)|\bsemana\s*:\s*\d+)/.test(
      simplify(l.text),
    ),
  );
  if (dates.length > 1) issues.push("dueDate:MULTIPLE_DATES");
  if (times.length > 1) issues.push("dueTime:MULTIPLE_TIMES");
  if (!dates.length && contextual) issues.push("dueDate:RELATIVE_DATE_REVIEW");
  if (/\blab(?:oratorio)?\b/i.test(marker[0]) && !classify(title))
    issues.push("type:LABORATORY_REVIEW");
  return [
    candidate(
      heading.row,
      page.index,
      {
        title: cell(title, Math.round(heading.blocks[0].x)),
        course,
        dueDate: dates.length ? cell(dates.join(" / ")) : undefined,
        dueTime:
          times.length === 1 && dates.length === 1 ? cell(times[0]) : undefined,
      },
      dateOrder(dates),
      issues,
    ),
  ];
}

async function readPages(bytes: Buffer, unit?: number) {
  const document = getDocument({
    data: new Uint8Array(bytes),
    stopAtErrors: true,
    verbosity: 0,
    useSystemFonts: false,
    useWorkerFetch: false,
    disableFontFace: true,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
  });
  try {
    const pdf = await document.promise;
    if (pdf.numPages > limits.pdfPages) throw new FileIssue("PDF_PAGES_LIMIT");
    if (unit !== undefined && unit > pdf.numPages)
      throw new FileIssue("FILE_INVALID_REQUEST");
    const pages: Page[] = [];
    let items = 0;
    for (let index = unit ?? 1; index <= (unit ?? pdf.numPages); index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      items += content.items.length;
      if (items > 150_000) throw new FileIssue("PDF_TEXT_LIMIT");
      pages.push({
        index,
        lines: linesFrom(
          content.items.flatMap((item) => {
            if (!("str" in item) || !item.str.trim()) return [];
            return [
              {
                value: item.str.trim(),
                x: item.transform[4],
                y: item.transform[5],
                width: item.width,
                height: item.height,
              },
            ];
          }),
        ),
      });
      page.cleanup();
    }
    return pages;
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException")
      throw new FileIssue("FILE_PROTECTED");
    throw error;
  } finally {
    await document.destroy();
  }
}

export async function pdfExcerpt(bytes: Buffer, unit: number) {
  const [page] = await readPages(bytes, unit);
  return page.lines
    .filter((line) => !printed.test(line.text))
    .map((line) => line.text)
    .join("\n");
}

export async function extractPdf(bytes: Buffer, filename: string) {
  const pages = await readPages(bytes);
  const first = pages.flatMap((p) => p.lines.slice(0, 12));
  const courseLine = first.find(
    (l) =>
      !printed.test(l.text) &&
      !/^(?:malla|plan|semestre|ciclo|periodo|ano|anio)\b/.test(
        simplify(l.text),
      ) &&
      courseCode.test(l.text),
  );
  const code = courseLine?.text.match(courseCode)?.[0];
  const labelledCourse = first.find((l) =>
    /^(?:curso|asignatura|course)\s*:/i.test(l.text),
  );
  const course = code
    ? cell(code, Math.round(courseLine!.blocks[0].x))
    : labelledCourse
      ? cell(labelledCourse.text.split(":").slice(1).join(":").trim())
      : undefined;
  const table = tableCandidates(pages, course);
  const syllabus = syllabusCandidates(pages, course);
  const candidates = table.rows.length
    ? table.rows
    : syllabus.length
      ? syllabus
      : table.sawTable
        ? []
        : statement(pages, course, filename);
  const units = pages.map((p) => ({
    index: p.index,
    name: null,
    state: !p.lines.length
      ? ("no_text" as const)
      : candidates.some((c) => c.locator.unit === p.index)
        ? ("recognized" as const)
        : ("unrecognized" as const),
  }));
  return {
    candidates,
    units,
    warnings: [
      ...(units.some((u) => u.state === "no_text")
        ? ["PDF_PAGES_WITHOUT_TEXT"]
        : []),
      ...(!candidates.length ? ["MANUAL_ENTRY_AVAILABLE"] : []),
    ],
  };
}
