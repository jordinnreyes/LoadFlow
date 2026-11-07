// Optional local check: real private Storage + the pinned isolated Docker parser.
// Uses only a synthetic account/document and a private test queue; no AI calls.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "../../tests/integration/fixture.js";
import { pdfFixture } from "../../tests/fixtures/imports/pdf-fixture.js";
import { localImports } from "../../server/modules/imports/local.js";
const f = await fixture();
let documentId: string | undefined;
let service: Awaited<ReturnType<typeof localImports>>["service"] | undefined;
try {
  const runtime = await localImports(
    f.identity,
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    "test-" + randomUUID(),
  );
  service = runtime.service;
  const client = await f.client();
  const period = await f.request(client, "POST", "/api/v1/periods", {
    name: "Prueba local temporal",
  });
  assert.equal(period.statusCode, 201, period.body);
  const bytes = pdfFixture([["Tarea 10", "Due date: 2030-03-21"]]);
  const accepted = await service.upload(
    client.owner,
    randomUUID(),
    period.json().id,
    "synthetic.pdf",
    bytes,
  );
  documentId = accepted.documentId;
  await runtime.worker.tick();
  const result = await service.get(client.owner, accepted.id);
  assert.equal(result.state, "review");
  assert.equal(result.originalAvailable, false);
  assert.equal(result.originalDeletionPending, false);
  await assert.rejects(service.storage.get(documentId));
  assert.equal(
    (await service.candidates(client.owner, accepted.id, {})).items.length,
    1,
  );
  await assert.rejects(
    service.requireAnalysisReupload(client.owner, documentId),
    { code: "DOCUMENT_REUPLOAD_REQUIRED" },
  );
  await service.requireAnalysisReupload(client.owner, documentId, bytes);
  console.log(
    "PASS: isolated extraction, original removed, review retained, same-file reupload required; no AI call.",
  );
} finally {
  if (service && documentId) await service.storage.remove(documentId);
  await f.close();
}
