import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  extract,
  extractExcerpt,
} from "../../server/modules/imports/extraction/extract.ts";
import { limits } from "../../server/modules/imports/extraction/model.ts";
import { pdfFixture } from "../fixtures/imports/pdf-fixture.js";

const fixture = (name: string) =>
  readFile(new URL("../fixtures/imports/" + name, import.meta.url));
const rejects = (bytes: Buffer, name: string, code: string) =>
  assert.rejects(extract(bytes, name), { code });

test("analysis preview reads only the linked PDF page or XLSX row", async () => {
  const pdf = pdfFixture([
    ["Tarea 1", "Entregable: informe."],
    ["Otra actividad"],
    [],
  ]);
  assert.equal(
    await extractExcerpt(pdf, "preview.pdf", { unit: 1, row: 1 }),
    "Tarea 1\nEntregable: informe.",
  );
  await assert.rejects(
    extractExcerpt(pdf, "preview.pdf", { unit: 3, row: 1 }),
    {
      code: "DOCUMENT_NO_TEXT",
    },
  );
  const row = await extractExcerpt(
    await fixture("anexo.xlsx"),
    "preview.xlsx",
    { unit: 1, row: 4 },
  );
  assert.match(row, /PC2.*MAT1200/);
  assert.doesNotMatch(row, /PC1|PC3/);
});

test("XLSX reads seven real rows, date systems, merged origins and cached formulas", async () => {
  const data = await extract(await fixture("anexo.xlsx"), "schedule.XLSX");
  assert.deepEqual(
    data.units.map((u) => u.state),
    ["recognized", "recognized", "unrecognized"],
  );
  assert.deepEqual(
    data.candidates.map((c) => c.fields.title),
    ["PC1", "PC2", "PC3", "PC4", "PC5", "Examen parcial", "Examen final"],
  );
  assert.equal(data.candidates[1].fields.course, "MAT1200");
  assert.ok(data.candidates[1].issues.includes("course:MERGED_CELL"));
  assert.deepEqual(data.candidates[1].locator, {
    unit: 1,
    row: 4,
    sourceRows: { course: 3 },
    columns: { title: 1, course: 2, dueDate: 3, dueTime: 4, endTime: 5 },
  });
  assert.equal(data.candidates[4].fields.dueDate, "2030-03-25");
  assert.ok(
    data.candidates[4].issues.includes("dueDate:CACHED_FORMULA_REVIEW"),
  );
  assert.equal(data.candidates[0].fields.dueTime, "09:00");
  assert.equal(data.candidates[6].fields.dueDate, "2030-06-03");
  const dates = await extract(await fixture("epoch-1904.xlsx"), "other.xlsx");
  assert.deepEqual(
    dates.candidates.map((c) => c.fields.dueDate),
    ["2031-01-16", null, null, null],
  );
});

test("PDF distinguishes statements, print metadata and actual deadlines", async () => {
  const pdf = pdfFixture([
    [
      "16/10/30, 18:09 Lab10.md",
      "Sistemas de Datos II",
      "2030 - 2",
      "Laboratorio 09: Indexación",
      "Fecha: 02/03/2030",
      "Entregables: informe y consultas.",
      "Entregar al final de la clase.",
    ],
    [],
  ]);
  const result = await extract(pdf, "Laboratorio 10.pdf");
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0].fields, {
    title: "Laboratorio 09: Indexación",
    course: "Sistemas de Datos II",
    type: null,
    dueDate: null,
    dueTime: null,
    endTime: null,
  });
  assert.ok(result.candidates[0].issues.includes("title:FILENAME_DIFFERS"));
  assert.ok(
    result.candidates[0].issues.includes("dueDate:RELATIVE_DATE_REVIEW"),
  );
  assert.deepEqual(
    result.units.map((u) => u.state),
    ["recognized", "no_text"],
  );
  const explicit = await extract(
    pdfFixture([
      ["DAT2400 Sistemas 2030-II HW#2", "Due date: 2030-12-03 18:30"],
    ]),
    "hw2.pdf",
  );
  assert.equal(explicit.candidates[0].fields.dueDate, "2030-12-03");
  assert.equal(explicit.candidates[0].fields.dueTime, "18:30");
  assert.equal(explicit.candidates[0].fields.type, "Tarea");
  const ambiguous = await extract(
    pdfFixture([["Tarea 12", "Fecha de entrega: 04/05/2031"]]),
    "tarea.pdf",
  );
  assert.equal(ambiguous.candidates[0].fields.dueDate, null);
  assert.ok(ambiguous.candidates[0].issues.includes("dueDate:REVIEW"));
});

test("PDF extracts syllabus weeks and only evaluated rows in positioned schedules", async () => {
  const syllabus = await extract(
    pdfFixture([
      ["SÍLABO", "MALLA 2030"],
      [
        "DAT2400 - Sistemas",
        "8. SISTEMA DE EVALUACIÓN",
        "Examen Parcial 20% Semana 8 Semana 4",
        "Práctica y/o laboratorio 60%",
        "Proyecto (P1) 15% Semana 7 Semana 3",
      ],
    ]),
    "syllabus.pdf",
  );
  assert.equal(syllabus.candidates.length, 2);
  assert.equal(syllabus.candidates[0].fields.course, "DAT2400");
  assert.equal(syllabus.candidates[0].original.dueDate, "Semana 8 Semana 4");
  assert.equal(syllabus.candidates[0].fields.dueDate, null);
  const schedule = await extract(
    pdfFixture([
      [
        "DAT2400 - Sistemas",
        [30, 700, "Curso"],
        [150, 700, "Fecha"],
        [230, 700, "Día"],
        [290, 700, "Hora Inicio"],
        [370, 700, "Hora Fin"],
        [440, 700, "Evaluación"],
        [30, 680, "DAT2400"],
        [150, 680, "21/03/2030"],
        [230, 680, "Jueves"],
        [290, 680, "09:00"],
        [370, 680, "10:00"],
        [150, 662, "22/03/2030"],
        [440, 657, "PC1"],
        [30, 650, "DAT2400"],
        [230, 650, "Viernes"],
        [290, 650, "09:00"],
        [370, 650, "10:00"],
      ],
      [
        [30, 700, "DAT2400"],
        [150, 700, "28/03/2030"],
        [230, 700, "Jueves"],
        [290, 700, "13:00"],
        [370, 700, "15:00"],
        [440, 700, "Examen 1"],
      ],
    ]),
    "schedule.pdf",
  );
  assert.deepEqual(
    schedule.candidates.map((c) => c.fields.title),
    ["PC1", "Examen 1"],
  );
  assert.deepEqual(
    schedule.candidates.map((c) => c.fields.dueDate),
    ["2030-03-22", "2030-03-28"],
  );
  assert.ok(
    schedule.candidates[0].issues.includes("dueDate:ADJACENT_LINE_REVIEW"),
  );
  assert.equal(schedule.candidates[1].fields.type, null);
});

test("F7 PDF annex preserves conflicting dates, evaluation evidence and project ambiguity", async () => {
  const result = await extract(
    pdfFixture([
      [
        [30, 720, "MAT4830 - Modelos"],
        [30, 690, "Curso"],
        [125, 690, "Fecha"],
        [260, 690, "Día"],
        [330, 690, "Hora Inicio"],
        [415, 690, "Hora Fin"],
        [490, 690, "Evaluación"],
        [125, 671, "2030-03-20"],
        [30, 660, "MAT4830"],
        [125, 660, "2030-03-22"],
        [260, 660, "Viernes"],
        [330, 660, "09:00"],
        [415, 660, "10:00"],
        [490, 660, "PC1"],
        [30, 630, "MAT4830"],
        [125, 630, "2030-03-21"],
        [260, 630, "Viernes"],
        [330, 630, "14:00"],
        [415, 630, "16:00"],
        [490, 630, "Examen 2"],
        [30, 600, "MAT4830"],
        [125, 600, "2030-03-28"],
        [260, 600, "Jueves"],
        [330, 600, "09:00"],
        [415, 600, "11:00"],
        [490, 600, "Proyecto"],
      ],
      "raster",
    ]),
    "annex.pdf",
  );
  assert.deepEqual(
    result.units.map((unit) => unit.state),
    ["recognized", "no_text"],
  );
  assert.deepEqual(
    result.candidates.map(({ fields }) => fields),
    [
      {
        title: "PC1",
        course: "MAT4830",
        type: "Práctica calificada",
        dueDate: null,
        dueTime: "09:00",
        endTime: "10:00",
      },
      {
        title: "Examen 2",
        course: "MAT4830",
        type: null,
        dueDate: null,
        dueTime: "14:00",
        endTime: "16:00",
      },
      {
        title: "Proyecto",
        course: "MAT4830",
        type: null,
        dueDate: "2030-03-28",
        dueTime: null,
        endTime: null,
      },
    ],
  );
  const [conflicting, mismatch, project] = result.candidates;
  assert.match(conflicting.original.dueDate ?? "", /2030-03-20/);
  assert.match(conflicting.original.dueDate ?? "", /2030-03-22/);
  assert.ok(conflicting.issues.includes("dueDate:MULTIPLE_DATES"));
  assert.equal(mismatch.original.dueDate, "2030-03-21");
  assert.ok(mismatch.issues.includes("dueDate:WEEKDAY_MISMATCH"));
  assert.ok(project.issues.includes("dueTime:SESSION_IS_NOT_DEADLINE"));
  assert.deepEqual(result.warnings, ["PDF_PAGES_WITHOUT_TEXT"]);
});

test("F7 PDF multipage group handout does not treat exercises or print metadata as deadlines", async () => {
  const result = await extract(
    pdfFixture([
      [
        "Trabajo grupal: Modelo de población",
        "Semana: 2",
        "Entregable: cuaderno",
        "2030-2",
      ],
      [
        "Ejercicio 1. Compare mediciones de 12/04/2030 y 14/04/2030.",
        "19/04/30, 12:30 export.md",
      ],
    ]),
    "group-handout.pdf",
  );
  assert.deepEqual(
    result.candidates.map(({ fields }) => fields),
    [
      {
        title: "Trabajo grupal: Modelo de población",
        course: null,
        type: "Entrega grupal",
        dueDate: null,
        dueTime: null,
        endTime: null,
      },
    ],
  );
  assert.ok(
    result.candidates[0].issues.includes("dueDate:RELATIVE_DATE_REVIEW"),
  );
});

test("parser rejects empty, disguised, corrupt, encrypted and excessive input", async () => {
  await rejects(Buffer.alloc(0), "empty.pdf", "FILE_EMPTY");
  await rejects(Buffer.from("MZ"), "disguised.pdf", "FILE_UNSUPPORTED");
  await rejects(
    Buffer.from("%PDF-1.7\nbroken"),
    "broken.pdf",
    "PDF_INVALID_STRUCTURE",
  );
  await rejects(
    await fixture("protected.pdf"),
    "protected.pdf",
    "FILE_PROTECTED",
  );
  await rejects(
    pdfFixture(Array.from({ length: 101 }, () => [])),
    "many.pdf",
    "PDF_PAGES_LIMIT",
  );
  await rejects(
    Buffer.alloc(limits.bytes + 1),
    "large.xlsx",
    "FILE_BYTES_LIMIT",
  );
  await rejects(
    await fixture("too-many-sheets.xlsx"),
    "sheets.xlsx",
    "XLSX_SHEETS_LIMIT",
  );
  await rejects(
    await fixture("too-many-cells.xlsx"),
    "cells.xlsx",
    "XLSX_CELLS_LIMIT",
  );
  const zip = await fixture("anexo.xlsx");
  const central = zip.indexOf(Buffer.from([0x50, 0x4b, 1, 2]));
  zip.writeUInt32LE(limits.zipBytes + 1, central + 24);
  await rejects(zip, "expansion.xlsx", "XLSX_ZIP_EXPANSION_LIMIT");
  await rejects(zip, "macro.xlsm", "FILE_UNSUPPORTED");
  const scan = await extract(pdfFixture(["raster"]), "image-only.pdf");
  assert.equal(scan.candidates.length, 0);
  assert.deepEqual(scan.warnings, [
    "PDF_PAGES_WITHOUT_TEXT",
    "MANUAL_ENTRY_AVAILABLE",
  ]);
});

test("F7 XLSX rejects a disguised macro member and ZIP traversal", async () => {
  const original = await fixture("anexo.xlsx");
  const member = "docProps/core.xml";
  for (const [name, code] of [
    ["xl/vbaProject.bin", "XLSX_UNSAFE_CONTAINER"],
    ["../escape-zip.xml", "XLSX_INVALID_STRUCTURE"],
  ]) {
    assert.equal(name.length, member.length);
    const tampered = Buffer.from(original);
    const local = tampered.indexOf(member);
    const central = tampered.indexOf(member, local + member.length);
    assert.ok(local >= 0 && central > local);
    tampered.write(name, local, "ascii");
    tampered.write(name, central, "ascii");
    await rejects(tampered, "looks-like-a-workbook.xlsx", code);
  }
});
