import {
  FileIssue,
  fileKind,
  limits,
  excerptLimit,
  type ExcerptLocation,
  type Extraction,
} from "./model.ts";

export async function extractExcerpt(
  bytes: Buffer,
  filename: string,
  location: ExcerptLocation,
) {
  if (bytes.length > limits.bytes) throw new FileIssue("FILE_BYTES_LIMIT");
  const kind = fileKind(filename, bytes);
  const text =
    kind === "xlsx"
      ? await (
          await import("./xlsx.ts")
        ).xlsxExcerpt(bytes, location.unit, location.row)
      : await (await import("./pdf.ts")).pdfExcerpt(bytes, location.unit);
  const excerpt = text.trim().slice(0, excerptLimit).trimEnd();
  if (!excerpt) throw new FileIssue("DOCUMENT_NO_TEXT");
  return excerpt;
}

export async function extract(
  bytes: Buffer,
  filename: string,
): Promise<Extraction> {
  if (bytes.length > limits.bytes) throw new FileIssue("FILE_BYTES_LIMIT");
  const kind = fileKind(filename, bytes);
  let result: Extraction;
  try {
    result =
      kind === "xlsx"
        ? await (await import("./xlsx.ts")).extractXlsx(bytes)
        : await (await import("./pdf.ts")).extractPdf(bytes, filename);
  } catch (error) {
    if (error instanceof FileIssue) throw error;
    throw new FileIssue(
      kind === "xlsx" ? "XLSX_INVALID_STRUCTURE" : "PDF_INVALID_STRUCTURE",
    );
  }
  if (result.candidates.length > limits.candidates)
    throw new FileIssue("FILE_CANDIDATES_LIMIT");
  return result;
}
