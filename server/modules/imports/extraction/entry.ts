import { extract } from "./extract.ts";
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
  const filename: unknown = JSON.parse(
    input.subarray(0, separator).toString("utf8"),
  );
  if (typeof filename !== "string") throw new FileIssue("FILE_INVALID_REQUEST");
  const result = await extract(input.subarray(separator + 1), filename);
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
