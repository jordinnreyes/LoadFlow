import { SaxesParser } from "saxes";
import { fromBufferPromise } from "yauzl";
import readXlsxFile, { type Row } from "read-excel-file/node";
import { FileIssue, limits } from "./model.ts";
import { recognizeTable, type Cell, type SourceRow } from "./recognize.ts";

type Merge = { start: [number, number]; end: [number, number] };
type SheetMeta = { merges: Merge[]; formulas: Set<string> };

const reference = (value: string): [number, number] => {
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(value);
  if (!match) throw new FileIssue("XLSX_INVALID_CELL");
  const col = [...match[1]].reduce(
    (n, letter) => n * 26 + letter.charCodeAt(0) - 64,
    0,
  );
  const row = Number(match[2]);
  if (row > 1_048_576 || col > 16_384) throw new FileIssue("XLSX_INVALID_CELL");
  return [row, col];
};

function parseXml(
  bytes: Buffer,
  onTag: (name: string, attrs: Record<string, string>) => void,
) {
  const parser = new SaxesParser();
  parser.on("doctype", () => {
    throw new FileIssue("XLSX_INVALID_XML");
  });
  parser.on("opentag", (tag) =>
    onTag(tag.name.split(":").at(-1)!, tag.attributes),
  );
  parser.write(bytes.toString("utf8")).close();
}

async function inspect(bytes: Buffer) {
  const zip = await fromBufferPromise(bytes, {
    lazyEntries: true,
    validateEntrySizes: true,
    strictFileNames: true,
  });
  const seen = new Set<string>();
  const metadata = new Map<string, SheetMeta>();
  const sheetPaths = new Map<string, string>();
  const sheetIds: string[] = [];
  let expanded = 0;
  let cells = 0;
  let workbook = false;
  let contentType = false;
  try {
    if (zip.entryCount > limits.zipEntries)
      throw new FileIssue("XLSX_ZIP_ENTRIES_LIMIT");
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      if (
        seen.has(name) ||
        entry.generalPurposeBitFlag & 1 ||
        /(?:vbaProject\.bin|^xl\/macrosheets\/)/i.test(name)
      )
        throw new FileIssue("XLSX_UNSAFE_CONTAINER");
      seen.add(name);
      const inspectXml =
        name === "[Content_Types].xml" ||
        name === "xl/workbook.xml" ||
        name === "xl/_rels/workbook.xml.rels" ||
        /^xl\/worksheets\/[^/]+\.xml$/.test(name);
      if (entry.uncompressedSize > limits.zipBytes - expanded)
        throw new FileIssue("XLSX_ZIP_EXPANSION_LIMIT");
      const chunks: Buffer[] = [];
      for await (const part of await zip.openReadStreamPromise(entry)) {
        const chunk = part as Buffer;
        expanded += chunk.length;
        if (expanded > limits.zipBytes)
          throw new FileIssue("XLSX_ZIP_EXPANSION_LIMIT");
        if (inspectXml) chunks.push(chunk);
      }
      if (!inspectXml) continue;
      const meta: SheetMeta = { merges: [], formulas: new Set() };
      let row = 0;
      let col = 0;
      let address = "";
      let entries = 0;
      let counted = false;
      parseXml(Buffer.concat(chunks), (tag, attrs) => {
        if (
          name === "[Content_Types].xml" &&
          tag === "Override" &&
          attrs.PartName === "/xl/workbook.xml"
        )
          contentType =
            attrs.ContentType ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
        if (name === "xl/workbook.xml" && tag === "workbook") workbook = true;
        if (name === "xl/workbook.xml" && tag === "sheet") {
          sheetIds.push(
            attrs["r:id"] ??
              Object.entries(attrs).find(([key]) => key.endsWith(":id"))?.[1],
          );
          if (sheetIds.length > limits.sheets)
            throw new FileIssue("XLSX_SHEETS_LIMIT");
        }
        if (
          name === "xl/_rels/workbook.xml.rels" &&
          tag === "Relationship" &&
          attrs.Type?.endsWith("/worksheet") &&
          attrs.TargetMode !== "External" &&
          attrs.Target
        )
          sheetPaths.set(
            attrs.Id,
            attrs.Target.startsWith("/")
              ? attrs.Target.slice(1)
              : "xl/" + attrs.Target,
          );
        if (!name.startsWith("xl/worksheets/")) return;
        if (tag === "c") {
          const [r, c] = reference(attrs.r ?? "");
          row = Math.max(r, row);
          col = Math.max(c, col);
          address = r + ":" + c;
          counted = false;
          entries++;
          if (entries > limits.cells * 4 || row * col > 400_000)
            throw new FileIssue("XLSX_GRID_LIMIT");
        }
        if (tag === "v" || tag === "is" || tag === "f") {
          if (!counted) {
            counted = true;
            if (++cells > limits.cells) throw new FileIssue("XLSX_CELLS_LIMIT");
          }
          if (tag === "f") meta.formulas.add(address);
        }
        if (tag === "mergeCell") {
          const [start, end] = (attrs.ref ?? "").split(":").map(reference);
          if (
            !start ||
            !end ||
            end[0] < start[0] ||
            end[1] < start[1] ||
            meta.merges.length >= 2_000
          )
            throw new FileIssue("XLSX_GRID_LIMIT");
          meta.merges.push({ start, end });
        }
      });
      if (name.startsWith("xl/worksheets/")) metadata.set(name, meta);
    }
  } finally {
    zip.close();
  }
  if (
    !workbook ||
    !contentType ||
    !sheetIds.length ||
    sheetIds.some((id) => !metadata.has(sheetPaths.get(id) ?? ""))
  )
    throw new FileIssue("XLSX_INVALID_STRUCTURE");
  return sheetIds.map((id) => metadata.get(sheetPaths.get(id)!)!);
}

function sourceRows(data: Row[], meta: SheetMeta): SourceRow[] {
  return data
    .map((values, index) => {
      const cells: Cell[] = values.map((value, col) => ({
        value,
        column: col + 1,
        formula: meta.formulas.has(index + 1 + ":" + (col + 1)),
      }));
      return { row: index + 1, cells };
    })
    .map((row) => {
      // Carry down only single-column merges. A horizontal merged heading is one label.
      for (const { start, end } of meta.merges) {
        if (start[1] !== end[1] || row.row <= start[0] || row.row > end[0])
          continue;
        const target = row.cells[start[1] - 1];
        const value = data[start[0] - 1]?.[start[1] - 1];
        if (target && target.value == null && value != null)
          row.cells[start[1] - 1] = {
            ...target,
            value,
            formula: meta.formulas.has(start.join(":")),
            originRow: start[0],
          };
      }
      return row;
    });
}

export async function extractXlsx(bytes: Buffer) {
  const metadata = await inspect(bytes);
  const sheets = await readXlsxFile(bytes, { trim: true });
  const units = sheets.map((sheet, index) => {
    const candidates = recognizeTable(
      sourceRows(sheet.data, metadata[index]),
      index + 1,
    );
    return { candidates, index: index + 1, name: sheet.sheet.slice(0, 80) };
  });
  return {
    candidates: units.flatMap((unit) => unit.candidates),
    units: units.map(({ candidates, ...unit }) => ({
      ...unit,
      state: candidates.length
        ? ("recognized" as const)
        : ("unrecognized" as const),
    })),
    warnings: metadata.some((sheet) => sheet.formulas.size)
      ? ["XLSX_FORMULAS_NOT_EXECUTED"]
      : [],
  };
}

export async function xlsxExcerpt(bytes: Buffer, unit: number, row: number) {
  const metadata = await inspect(bytes);
  const sheet = (await readXlsxFile(bytes, { trim: true }))[unit - 1];
  if (!sheet) throw new FileIssue("FILE_INVALID_REQUEST");
  return (
    sourceRows(sheet.data, metadata[unit - 1])
      .find((source) => source.row === row)
      ?.cells.flatMap(({ value }) =>
        value == null || value === ""
          ? []
          : [
              value instanceof Date
                ? value.toISOString().slice(0, 10)
                : String(value),
            ],
      )
      .join(" · ") ?? ""
  );
}
