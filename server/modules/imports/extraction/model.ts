export const limits = {
  bytes: 10 * 1024 * 1024,
  pdfPages: 100,
  sheets: 20,
  cells: 20_000,
  zipBytes: 50 * 1024 * 1024,
  zipEntries: 2_000,
  candidates: 500,
  timeoutMs: 30_000,
  outputBytes: 2 * 1024 * 1024,
} as const;

export class FileIssue extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function fileKind(filename: string, bytes: Buffer) {
  const ext = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (!bytes.length) throw new FileIssue("FILE_EMPTY");
  if (
    ext === ".pdf" &&
    /^%PDF-\d\.\d/.test(bytes.subarray(0, 8).toString("ascii"))
  )
    return "pdf";
  if (
    ext === ".xlsx" &&
    bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]))
  )
    return "xlsx";
  if (
    ext === ".xlsx" &&
    bytes.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"))
  )
    throw new FileIssue("FILE_PROTECTED_OR_LEGACY");
  throw new FileIssue("FILE_UNSUPPORTED");
}

export type FileKind = ReturnType<typeof fileKind>;
export type Locator = {
  unit: number;
  row: number;
  columns: Record<string, number>;
  sourceRows: Record<string, number>;
};
export type ExcerptLocation = Pick<Locator, "unit" | "row">;
export const excerptLimit = 2400;
export type Fields = {
  title: string | null;
  course: string | null;
  type: string | null;
  dueDate: string | null;
  dueTime: string | null;
  endTime: string | null;
};
export type Extracted = {
  fields: Fields;
  original: Fields;
  locator: Locator;
  issues: string[];
};
export type Extraction = {
  candidates: Extracted[];
  units: {
    index: number;
    name: string | null;
    state: "recognized" | "unrecognized" | "no_text";
  }[];
  warnings: string[];
};
