import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FileIssue,
  limits,
  type Extraction,
  type ExcerptLocation,
} from "./extraction/model.js";

const source = fileURLToPath(new URL("./extraction/", import.meta.url));
const dependencies = resolve(source, "../../../../node_modules");
export const parserImage =
  "node:24.22.2-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9";

export type Extractor = (
  bytes: Buffer,
  filename: string,
) => Promise<Extraction>;

export type ExcerptExtractor = (
  bytes: Buffer,
  filename: string,
  location: ExcerptLocation,
) => Promise<string>;

export const isolatedExtract: Extractor = (bytes, filename) =>
  isolatedRequest<Extraction>(bytes, filename);
export const isolatedExcerpt: ExcerptExtractor = (bytes, filename, location) =>
  isolatedRequest<string>(bytes, { filename, ...location });

function isolatedRequest<T>(
  bytes: Buffer,
  request: string | ({ filename: string } & ExcerptLocation),
) {
  return new Promise<T>((accept, reject) => {
    const name = "cw-f3-parser-" + randomUUID();
    const child = spawn(
      "docker",
      [
        "run",
        "--rm",
        "-i",
        "--pull",
        "never",
        "--name",
        name,
        "--network",
        "none",
        "--memory",
        "384m",
        "--memory-swap",
        "384m",
        "--pids-limit",
        "48",
        "--cpus",
        "1",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--read-only",
        "--user",
        "1000:1000",
        "--mount",
        "type=bind,source=" + source + ",target=/work/extraction,readonly",
        "--mount",
        "type=bind,source=" +
          dependencies +
          ",target=/work/node_modules,readonly",
        parserImage,
        "node",
        "--max-old-space-size=192",
        "--disallow-code-generation-from-strings",
        "/work/extraction/entry.ts",
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
    );
    const chunks: Buffer[] = [];
    let size = 0;
    let failure: string | undefined;
    const stop = (code: string) => {
      failure = code;
      child.kill();
    };
    const timer = setTimeout(
      () => stop("EXTRACTION_TIMEOUT"),
      limits.timeoutMs,
    );
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limits.outputBytes + 4096) stop("FILE_OUTPUT_LIMIT");
      else chunks.push(chunk);
    });
    child.stdin.on("error", () => {});
    child.on("error", () => {
      failure = "EXTRACTOR_UNAVAILABLE";
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failure) {
        execFile(
          "docker",
          ["rm", "-f", name],
          { timeout: 5000, windowsHide: true },
          () => reject(new FileIssue(failure!)),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new FileIssue(
            code === 137 ? "EXTRACTION_MEMORY_LIMIT" : "EXTRACTOR_UNAVAILABLE",
          ),
        );
        return;
      }
      try {
        const value = JSON.parse(
          Buffer.concat(chunks).toString("utf8").trim().split("\n").at(-1)!,
        ) as {
          result?: T;
          error?: string;
        };
        if (value.result) accept(value.result);
        else reject(new FileIssue(value.error ?? "EXTRACTION_FAILED"));
      } catch {
        reject(new FileIssue("EXTRACTION_FAILED"));
      }
    });
    child.stdin.write(JSON.stringify(request) + "\n");
    child.stdin.end(bytes);
  });
}
