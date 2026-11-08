import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { loopback } from "../../server/config.js";
import { ImportService } from "../../server/modules/imports/service.js";
import { isolatedExtract } from "../../server/modules/imports/runner.js";
import { privateImportStorage } from "../../server/modules/imports/storage.js";
import { ImportWorker } from "../../server/modules/jobs/import-worker.js";
import { pdfFixture } from "../../tests/fixtures/imports/pdf-fixture.js";
import { fixture } from "../../tests/integration/fixture.js";

for (const name of [
  "DATABASE_URL",
  "IDENTITY_DATABASE_URL",
  "SUPABASE_URL",
] as const) {
  const url = process.env[name];
  assert.ok(url && loopback(url), `${name} debe apuntar a la pila local`);
}

const api = "/api/v1";
const storage = await privateImportStorage(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const f = await fixture(
  new Date("2030-03-01T14:00:00Z"),
  undefined,
  (identity) =>
    new ImportService(identity, storage, `test-f7-benchmark-${randomUUID()}`),
);
const originals = new Set<string>();
const results: Record<string, number[]> = {};
async function measure<T>(name: string, run: () => Promise<T>) {
  const start = performance.now();
  const value = await run();
  (results[name] ??= []).push(Math.round(performance.now() - start));
  return value;
}

try {
  const owner = await f.client();
  const period = await f.request(owner, "POST", api + "/periods", {
    name: "Benchmark sintético F7",
    timezone: "America/Lima",
    endDate: "2030-04-29",
  });
  assert.equal(period.statusCode, 201, period.body);
  const periodId: string = period.json().id;
  const path = `${api}/periods/${periodId}`;
  const availability = await f.request(
    owner,
    "PUT",
    path + "/availability",
    {
      confirmed: true,
      timezone: "America/Lima",
      validFrom: "2030-03-01",
      validTo: null,
      weekly: Array.from({ length: 7 }, (_, i) => ({
        weekday: i + 1,
        state: "windows",
        intervals: [{ startMinute: 540, endMinute: 780 }],
      })),
      exceptions: [],
      manualCoverage: [{ from: "2030-03-01", to: "2030-04-30" }],
      preferences: {
        minimumMinutes: 30,
        preferredMinutes: 60,
        maximumMinutes: 120,
      },
    },
    '"availability-0"',
  );
  assert.equal(availability.statusCode, 200, availability.body);
  for (let i = 0; i < 24; i++) {
    const task = await f.request(owner, "POST", api + "/activities", {
      periodId,
      title: `Actividad ficticia ${i + 1}`,
      type: "Tarea",
      dueDate: `2030-03-${String(i + 5).padStart(2, "0")}`,
      dueTime: "17:00",
      timezone: "America/Lima",
      allowedStartAt: f.now.toISOString(),
      operatingMinutes: 120,
      divisibility: "divisible",
    });
    assert.equal(task.statusCode, 201, task.body);
  }
  const current = await f.request(owner, "GET", path + "/plan");
  const preview = () =>
    f.request(
      owner,
      "POST",
      path + "/planning-proposals",
      { kind: "recalculate" },
      String(current.headers.etag),
    );
  let proposal = await preview();
  assert.equal(proposal.statusCode, 201, proposal.body);
  for (let i = 0; i < 3; i++) {
    proposal = await measure("planning_preview_24_activities", preview);
    assert.equal(proposal.statusCode, 201, proposal.body);
    assert.equal(proposal.json().after.sessions.length, 48);
  }
  const applied = await f.request(
    owner,
    "POST",
    `${api}/planning-proposals/${proposal.json().id}/apply`,
    { confirmations: [] },
    String(proposal.headers.etag),
  );
  assert.equal(applied.statusCode, 200, applied.body);
  const week = () =>
    f.request(
      owner,
      "GET",
      path + "/weekly-plan?from=2030-03-04&to=2030-03-11",
    );
  assert.equal((await week()).statusCode, 200);
  for (let i = 0; i < 8; i++)
    assert.equal((await measure("weekly_api", week)).statusCode, 200);

  const worker = new ImportWorker(f.imports!, isolatedExtract);
  const workbook = await readFile(
    new URL("../../tests/fixtures/imports/anexo.xlsx", import.meta.url),
  );
  const pdf = pdfFixture(
    Array.from({ length: 8 }, (_, i) => [
      i === 0 ? "Tarea 8: informe sintético" : `Apéndice ${i}`,
      "Due date: 2030-03-21",
    ]),
  );
  for (const [name, bytes, count] of [
    ["benchmark.pdf", pdf, 1],
    ["benchmark.xlsx", workbook, 7],
  ] as const) {
    const format = name.split(".").at(-1);
    for (let i = 0; i < 3; i++) {
      const boundary = `benchmark-${randomUUID()}`;
      const upload = await measure(`upload_${format}`, () =>
        f.app.inject({
          method: "POST",
          url: `${api}/imports?periodId=${periodId}`,
          headers: {
            cookie: owner.cookie,
            origin: f.identity.config.origin,
            "x-csrf-token": owner.csrf,
            "idempotency-key": randomUUID(),
            "content-type": `multipart/form-data; boundary=${boundary}`,
          },
          payload: Buffer.concat([
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
            ),
            bytes,
            Buffer.from(`\r\n--${boundary}--\r\n`),
          ]),
        }),
      );
      assert.equal(upload.statusCode, 202, upload.body);
      const { id, documentId } = upload.json();
      originals.add(documentId);
      await measure(`worker_${format}`, () => worker.tick());
      const review = await f.request(owner, "GET", `${api}/imports/${id}`);
      assert.equal(review.json().state, "review", review.body);
      assert.equal(review.json().originalAvailable, false);
      const drafts = await f.request(
        owner,
        "GET",
        `${api}/imports/${id}/candidates`,
      );
      assert.equal(drafts.json().items.length, count);
      const withdrawn = await f.request(
        owner,
        "DELETE",
        `${api}/documents/${documentId}`,
        undefined,
        String(review.headers.etag),
      );
      assert.equal(withdrawn.statusCode, 200, withdrawn.body);
    }
  }
  console.log(
    JSON.stringify(
      {
        unit: "ms",
        bytes: { pdf: pdf.length, xlsx: workbook.length },
        results,
      },
      null,
      2,
    ),
  );
} finally {
  try {
    for (const id of originals) await storage.remove(id);
  } finally {
    await f.close();
  }
}
