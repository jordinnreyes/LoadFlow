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
  const scan = await extract(pdfFixture([[]]), "image-only.pdf");
  assert.equal(scan.candidates.length, 0);
  assert.deepEqual(scan.warnings, [
    "PDF_PAGES_WITHOUT_TEXT",
    "MANUAL_ENTRY_AVAILABLE",
  ]);
});
