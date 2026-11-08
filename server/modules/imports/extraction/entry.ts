import { extract, extractExcerpt } from "./extract.ts";
import { FileIssue, limits } from "./model.ts";

try {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > limits.bytes + 1024) throw new FileIssue("FILE_BYTES_LIMIT");
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks);
  const separator = input.indexOf(10);
  if (separator < 1 || separator > 1023)
    throw new FileIssue("FILE_INVALID_REQUEST");
  const request: unknown = JSON.parse(
    input.subarray(0, separator).toString("utf8"),
  );
  const bytes = input.subarray(separator + 1);
  let result;
  if (typeof request === "string") result = await extract(bytes, request);
  else {
    const command = request as {
      filename?: string;
      unit?: number;
      row?: number;
    } | null;
    if (
      typeof command?.filename !== "string" ||
      !Number.isSafeInteger(command.unit) ||
      command.unit! < 1 ||
      !Number.isSafeInteger(command.row) ||
      command.row! < 1
    )
      throw new FileIssue("FILE_INVALID_REQUEST");
    result = await extractExcerpt(bytes, command.filename, {
      unit: command.unit!,
      row: command.row!,
    });
  }
  const output = JSON.stringify({ result });
  if (Buffer.byteLength(output) > limits.outputBytes)
    throw new FileIssue("FILE_OUTPUT_LIMIT");
  process.stdout.write(output + "\n");
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      error: error instanceof FileIssue ? error.code : "EXTRACTION_FAILED",
    }) + "\n",
  );
}
