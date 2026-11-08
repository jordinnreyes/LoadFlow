import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.js";
import { privateImportStorage } from "../../server/modules/imports/storage.js";
import { ImportService } from "../../server/modules/imports/service.js";
import { ImportWorker } from "../../server/modules/jobs/import-worker.js";
import { extract } from "../../server/modules/imports/extraction/extract.ts";
import {
  FileIssue,
  limits,
} from "../../server/modules/imports/extraction/model.ts";
import { pdfFixture } from "../fixtures/imports/pdf-fixture.js";

const api = "/api/v1";
const encoded = (file: Buffer, name: string) => {
  const boundary = "cw-fixture-" + randomUUID();
  return {
    headers: { "content-type": "multipart/form-data; boundary=" + boundary },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
};

test("F3 keeps routes closed without a configured import service", async () => {
  const f = await fixture();
  try {
    const response = await f.app.inject({
      method: "POST",
      url: api + "/imports?periodId=" + randomUUID(),
      ...encoded(pdfFixture([["Tarea 1"]]), "test.pdf"),
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, "IMPORTS_DISABLED");
  } finally {
    await f.close();
  }
});

test("F3 integrates private Storage, PostgreSQL drafts, confirmation, revisions and cleanup", async () => {
  const now = new Date("2030-01-01T00:00:00Z");
  const storage = await privateImportStorage(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const f = await fixture(
    now,
    undefined,
    (identity) => new ImportService(identity, storage, "test-" + randomUUID()),
  );
  const service = f.imports!;
  const worker = new ImportWorker(service, extract);
  const uploaded = new Set<string>();
  try {
    const a = await f.client();
    const b = await f.client();
    const period = (
      await f.request(a, "POST", api + "/periods", {
        name: "Periodo sintético",
      })
    ).json().id;
    const periodB = (
      await f.request(b, "POST", api + "/periods", { name: "Otra cuenta" })
    ).json().id;
    const upload = (
      file: Buffer,
      name: string,
      client = a,
      key = randomUUID(),
      targetPeriod = period,
    ) => {
      const form = encoded(file, name);
      return f.app.inject({
        method: "POST",
        url: api + "/imports?periodId=" + targetPeriod,
        payload: form.payload,
        headers: {
          ...form.headers,
          cookie: client.cookie,
          origin: f.identity.config.origin,
          "x-csrf-token": client.csrf,
          "idempotency-key": key,
        },
      });
    };
    const workbook = await readFile(
      new URL("../fixtures/imports/anexo.xlsx", import.meta.url),
    );
    const tooLarge = await upload(
      Buffer.alloc(limits.bytes + 1),
      "oversize.xlsx",
    );
    assert.equal(tooLarge.statusCode, 413, tooLarge.body);
    assert.equal((await upload(Buffer.from("MZ"), "fake.pdf")).statusCode, 415);
    assert.equal((await upload(workbook, "source.xlsx", b)).statusCode, 404);
    const key = randomUUID();
    const first = await upload(workbook, "source.xlsx", a, key);
    assert.equal(first.statusCode, 202, first.body);
    const one = first.json();
    uploaded.add(one.documentId);
    assert.deepEqual((await upload(workbook, "other-name.xlsx")).json(), one);
    assert.equal(
      (await upload(pdfFixture([["Tarea 1"]]), "other.pdf", a, key)).statusCode,
      409,
    );
    const second = await upload(
      workbook,
      "source.xlsx",
      b,
      randomUUID(),
      periodB,
    );
    assert.equal(second.statusCode, 202, second.body);
    const two = second.json();
    uploaded.add(two.documentId);
    assert.notEqual(two.documentId, one.documentId);
    assert.deepEqual(await storage.get(one.documentId), workbook);
    const publicGet = await fetch(
      process.env.SUPABASE_URL +
        "/storage/v1/object/public/cargawise-imports-f3/" +
        one.documentId,
    );
    assert.ok(!publicGet.ok);
    assert.equal(
      (await f.request(b, "GET", api + "/imports/" + one.id)).statusCode,
      404,
    );
    await worker.tick();
    await worker.tick();
    const path = api + "/imports/" + one.id;
    const reviewed = await f.request(a, "GET", path);
    assert.equal(reviewed.json().state, "review", reviewed.body);
    assert.equal(reviewed.json().originalAvailable, false);
    assert.equal(reviewed.json().originalDeletionPending, false);
    assert.equal(reviewed.json().reviewExpiresAt, null);
    assert.equal(
      reviewed.json().analysisSource.code,
      "DOCUMENT_REUPLOAD_REQUIRED",
    );
    assert.match(
      reviewed.json().analysisSource.message,
      /vuelve a subir el mismo archivo/,
    );
    await assert.rejects(storage.get(one.documentId));
    await assert.rejects(
      service.requireAnalysisReupload(a.owner, one.documentId),
      { code: "DOCUMENT_REUPLOAD_REQUIRED" },
    );
    await assert.rejects(
      service.requireAnalysisReupload(b.owner, one.documentId, workbook),
      { code: "NOT_FOUND" },
    );
    await assert.rejects(
      service.requireAnalysisReupload(
        a.owner,
        one.documentId,
        pdfFixture([["Otro archivo"]]),
      ),
      { code: "DOCUMENT_REUPLOAD_MISMATCH" },
    );
    assert.deepEqual(
      await service.requireAnalysisReupload(a.owner, one.documentId, workbook),
      { documentId: one.documentId, format: "xlsx" },
    );
    // The verification uses memory only and never recreates an archived original.
    await assert.rejects(storage.get(one.documentId));
    const all = (await f.request(a, "GET", path + "/candidates")).json().items;
    assert.equal(all.length, 7);
    assert.equal(all[0].draft.operatingMinutes, null);
    assert.equal(
      (await f.request(b, "GET", path + "/candidates")).statusCode,
      404,
    );
    const candidate = api + "/import-candidates/" + all[0].id;
    const badPatch = await f.request(
      b,
      "PATCH",
      candidate,
      { timezone: "America/Lima" },
      '"candidate-1"',
    );
    assert.equal(badPatch.statusCode, 404);
    const patch = await f.request(
      a,
      "PATCH",
      candidate,
      { timezone: "America/Lima", operatingMinutes: 90 },
      '"candidate-1"',
    );
    assert.equal(patch.statusCode, 200, patch.body);
    assert.equal(
      (
        await f.request(
          a,
          "PATCH",
          candidate,
          { operatingMinutes: 91 },
          '"candidate-1"',
        )
      ).statusCode,
      412,
    );
    const choose = {
      candidateId: all[0].id,
      revision: 2,
      resolution: "distinct",
    };
    const invalidBatch = await f.request(
      a,
      "POST",
      path + "/confirm",
      {
        rows: [
          choose,
          { candidateId: all[1].id, revision: 1, resolution: "distinct" },
        ],
      },
      reviewed.headers.etag as string,
    );
    assert.equal(invalidBatch.statusCode, 422, invalidBatch.body);
    assert.equal(
      (await f.request(a, "GET", api + "/activities?periodId=" + period)).json()
        .items.length,
      0,
    );
    const confirmationKey = randomUUID();
    const confirm = await f.request(
      a,
      "POST",
      path + "/confirm",
      { rows: [choose] },
      reviewed.headers.etag as string,
      confirmationKey,
    );
    assert.equal(confirm.statusCode, 200, confirm.body);
    assert.deepEqual(
      (
        await f.request(
          a,
          "POST",
          path + "/confirm",
          { rows: [choose] },
          reviewed.headers.etag as string,
          confirmationKey,
        )
      ).json(),
      confirm.json(),
    );
    const id = confirm.json().items[0].activityId;
    assert.equal(
      (await f.request(a, "GET", path + "/candidates"))
        .json()
        .items.filter((row: { resolution: unknown }) => !row.resolution).length,
      6,
    );
    const activity = await f.request(a, "GET", api + "/activities/" + id);
    assert.equal(activity.json().operatingMinutes, 90);
    assert.equal(activity.json().evaluationEndAt, "2030-03-21T15:00:00.000Z");
    const progress = await f.request(
      a,
      "PUT",
      api + "/activities/" + id + "/progress",
      {
        realTotalMinutes: 30,
        remainingMinutes: 60,
      },
      activity.headers.etag as string,
    );
    assert.equal(progress.statusCode, 200, progress.body);
    const newPdf = pdfFixture([
      [
        [30, 720, "MAT1200 - Matemáticas"],
        [30, 690, "Curso"],
        [125, 690, "Fecha"],
        [260, 690, "Día"],
        [330, 690, "Hora Inicio"],
        [415, 690, "Hora Fin"],
        [490, 690, "Evaluación"],
        [30, 660, "MAT1200"],
        [125, 660, "2030-03-22"],
        [260, 660, "Viernes"],
        [330, 660, "09:00"],
        [415, 660, "10:00"],
        [490, 660, "PC1"],
        [30, 630, "MAT1200"],
        [125, 630, "2030-03-22"],
        [260, 630, "Viernes"],
        [330, 630, "09:00"],
        [415, 630, "10:00"],
        [490, 630, "PC1"],
      ],
    ]);
    const changeUpload = await upload(newPdf, "replacement.pdf");
    assert.equal(changeUpload.statusCode, 202, changeUpload.body);
    const change = changeUpload.json();
    uploaded.add(change.documentId);
    await worker.tick();
    const changePath = api + "/imports/" + change.id;
    const newer = await f.request(a, "GET", changePath);
    const rows = (await f.request(a, "GET", changePath + "/candidates")).json()
      .items;
    assert.equal(rows.length, 2);
    const [row, duplicateRow] = rows;
    assert.ok(row.evidence.issues.includes("POSSIBLE_DUPLICATE_ROW"));
    assert.ok(duplicateRow.evidence.issues.includes("POSSIBLE_DUPLICATE_ROW"));
    assert.notEqual(
      row.evidence.locator.row,
      duplicateRow.evidence.locator.row,
    );
    assert.equal(row.draft.title, "PC1");
    assert.equal(row.draft.type, "Práctica calificada");
    assert.equal(row.draft.dueDate, "2030-03-22");
    assert.equal(row.draft.dueTime, "09:00");
    assert.equal(row.draft.endTime, "10:00");
    assert.equal(row.draft.timezone, null);
    const updated = await f.request(
      a,
      "PATCH",
      api + "/import-candidates/" + row.id,
      { timezone: "America/Lima" },
      '"candidate-1"',
    );
    assert.equal(updated.statusCode, 200, updated.body);
    const matches = (
      await f.request(a, "GET", changePath + "/candidates")
    ).json().items[0].matches;
    assert.equal(matches[0].activityId, id);
    const update = await f.request(
      a,
      "POST",
      changePath + "/confirm",
      {
        rows: [
          {
            candidateId: row.id,
            revision: 2,
            resolution: "update",
            activityId: id,
            activityRevision: matches[0].revision,
          },
        ],
      },
      newer.headers.etag as string,
    );
    assert.equal(update.statusCode, 200, update.body);
    const proposalId = update.json().items[0].dateProposalId;
    assert.ok(proposalId);
    assert.equal(
      (await f.request(a, "GET", api + "/activities/" + id)).json().dueDate,
      "2030-03-21",
    );
    const proposalPath = api + "/plan-proposals/" + proposalId;
    const proposal = await f.request(a, "GET", proposalPath);
    assert.equal(proposal.json().source.kind, "import");
    const unconfirmed = await f.request(
      a,
      "POST",
      proposalPath + "/apply",
      { confirmations: [] },
      proposal.headers.etag as string,
    );
    assert.equal(unconfirmed.statusCode, 422, unconfirmed.body);
    assert.equal(
      (await f.request(a, "GET", api + "/activities/" + id)).json().dueDate,
      "2030-03-21",
    );
    const applied = await f.request(
      a,
      "POST",
      proposalPath + "/apply",
      { confirmations: ["academic_date_change"] },
      proposal.headers.etag as string,
    );
    assert.equal(applied.statusCode, 200, applied.body);
    assert.equal(applied.json().dueDate, "2030-03-22");
    assert.equal(applied.json().operatingMinutes, 90);
    assert.equal(
      (await f.request(a, "GET", api + "/activities?periodId=" + period)).json()
        .items.length,
      1,
    );
    const real = await f.request(
      a,
      "GET",
      api + "/activities/" + id + "/progress",
    );
    assert.equal(real.json().realTotalMinutes, 30);
    const history = await f.request(
      a,
      "GET",
      api + "/activities/" + id + "/date-history",
    );
    assert.equal(history.statusCode, 200, history.body);
    const dateChange = history.json().items[0];
    assert.equal(dateChange.source.kind, "import");
    assert.equal(dateChange.before.dueDate, "2030-03-21");
    assert.equal(dateChange.after.dueDate, "2030-03-22");
    const removal = await f.request(
      a,
      "DELETE",
      api + "/documents/" + one.documentId,
      undefined,
      confirm.headers.etag as string,
    );
    assert.equal(removal.statusCode, 200, removal.body);
    assert.equal(
      (await f.request(a, "GET", path + "/candidates")).json().items.length,
      0,
    );
    assert.equal(
      (await f.request(a, "GET", api + "/activities/" + id)).statusCode,
      200,
    );

    const discard = await f.request(
      b,
      "GET",
      api + "/imports/" + two.id + "/candidates",
    );
    const discardId = discard.json().items[0].id;
    const discarded = await f.request(
      b,
      "PATCH",
      api + "/import-candidates/" + discardId,
      { discarded: true },
      '"candidate-1"',
    );
    assert.equal(discarded.statusCode, 200, discarded.body);
    assert.equal(
      (
        await f.request(b, "GET", api + "/imports/" + two.id + "/candidates")
      ).json().items[0].status,
      "discarded",
    );
    const existingB = await f.request(b, "POST", api + "/activities", {
      periodId: periodB,
      title: "Actividad vigente conservada",
      type: "Tarea",
      dueDate: "2030-04-13",
      operatingMinutes: 45,
    });
    assert.equal(existingB.statusCode, 201, existingB.body);
    const keepRow = discard.json().items[1];
    const bReview = await f.request(b, "GET", api + "/imports/" + two.id);
    const foreignMatch = await f.request(
      b,
      "POST",
      api + "/imports/" + two.id + "/confirm",
      {
        rows: [
          {
            candidateId: keepRow.id,
            revision: 1,
            resolution: "keep",
            activityId: id,
            activityRevision: 1,
          },
        ],
      },
      bReview.headers.etag as string,
    );
    assert.equal(foreignMatch.statusCode, 404, foreignMatch.body);
    const kept = await f.request(
      b,
      "POST",
      api + "/imports/" + two.id + "/confirm",
      {
        rows: [
          {
            candidateId: keepRow.id,
            revision: 1,
            resolution: "keep",
            activityId: existingB.json().id,
            activityRevision: 1,
          },
        ],
      },
      bReview.headers.etag as string,
    );
    assert.equal(kept.statusCode, 200, kept.body);
    const keptActivity = await f.request(
      b,
      "GET",
      api + "/activities/" + existingB.json().id,
    );
    assert.deepEqual(keptActivity.json(), existingB.json());
    assert.equal(
      (
        await f.request(b, "GET", api + "/activities?periodId=" + periodB)
      ).json().items.length,
      1,
    );
    const emptyContext = await f.db.pool.query("select id from app.documents");
    assert.equal(emptyContext.rows.length, 0);
    const transient = await upload(
      pdfFixture([["Tarea 8", "Due date: 2030-07-08"]]),
      "retry.pdf",
    );
    assert.equal(transient.statusCode, 202, transient.body);
    uploaded.add(transient.json().documentId);
    const transientPath = api + "/imports/" + transient.json().id;
    const failingWorker = new ImportWorker(service, async () => {
      throw new FileIssue("EXTRACTOR_UNAVAILABLE");
    });
    await failingWorker.tick();
    const failed = await f.request(a, "GET", transientPath);
    assert.equal(failed.json().state, "failed", failed.body);
    assert.equal(failed.json().originalAvailable, false);
    await assert.rejects(storage.get(transient.json().documentId));
    const retried = await f.request(
      a,
      "POST",
      transientPath + "/retry",
      undefined,
      failed.headers.etag as string,
    );
    assert.equal(retried.statusCode, 409, retried.body);
    const resubmitted = await upload(
      pdfFixture([["Tarea 8", "Due date: 2030-07-08"]]),
      "retry.pdf",
    );
    assert.equal(resubmitted.statusCode, 202, resubmitted.body);
    assert.notEqual(resubmitted.json().id, transient.json().id);
    uploaded.add(resubmitted.json().documentId);
    await worker.tick();
    assert.equal(
      (
        await f.request(a, "GET", api + "/imports/" + resubmitted.json().id)
      ).json().state,
      "review",
    );
    const crash = await upload(
      pdfFixture([["Tarea 9", "Due date: 2030-07-09"]]),
      "lease.pdf",
    );
    assert.equal(crash.statusCode, 202, crash.body);
    uploaded.add(crash.json().documentId);
    const leased = await f.ids.pool.query(
      "select * from app.claim_import($1,$2,$3)",
      [now, randomUUID(), service.queueName],
    );
    assert.equal(leased.rows[0].id, crash.json().id);
    now.setUTCSeconds(now.getUTCSeconds() + 61);
    await worker.tick();
    const recovered = await service.get(a.owner, crash.json().id);
    assert.equal(recovered.state, "review");
    assert.equal(recovered.attempts, 2);
    assert.equal(
      (await service.candidates(a.owner, crash.json().id, {})).items.length,
      1,
    );
    now.setUTCDate(now.getUTCDate() + 8);
    for (let i = 0; i < 5; i++) await worker.tick();
    await assert.rejects(
      service.requireAnalysisReupload(a.owner, resubmitted.json().documentId),
      { code: "DOCUMENT_REUPLOAD_REQUIRED" },
    );
    await service.requireAnalysisReupload(
      a.owner,
      resubmitted.json().documentId,
      pdfFixture([["Tarea 8", "Due date: 2030-07-08"]]),
    );
    assert.equal(
      (await service.get(a.owner, resubmitted.json().id)).state,
      "review",
    );
    assert.equal(
      (await service.candidates(a.owner, resubmitted.json().id, {})).items
        .length,
      1,
    );
    assert.equal(
      (await f.academics.getActivity(a.owner, id)).dueDate,
      "2030-03-22",
    );
  } finally {
    for (const object of uploaded) await storage.remove(object);
    await f.close();
  }
});
test("F3 recovers staged objects and retries interrupted deletion with explicit Storage doubles", async () => {
  const now = new Date("2030-01-01T00:00:00Z");
  const objects = new Map<string, Buffer>();
  let breakPut = true;
  let breakDelete = true;
  const f = await fixture(
    now,
    undefined,
    (identity) =>
      new ImportService(
        identity,
        {
          async put(id, bytes) {
            objects.set(id, bytes);
            if (breakPut) throw new FileIssue("STORAGE_UNAVAILABLE");
          },
          async get(id) {
            const value = objects.get(id);
            if (!value) throw new FileIssue("STORAGE_UNAVAILABLE");
            return value;
          },
          async remove(id) {
            if (breakDelete) throw new FileIssue("STORAGE_UNAVAILABLE");
            objects.delete(id);
          },
        },
        "test-" + randomUUID(),
      ),
  );
  const service = f.imports!;
  const worker = new ImportWorker(service, extract);
  try {
    const a = await f.client();
    const period = (
      await f.request(a, "POST", api + "/periods", { name: "Recuperación" })
    ).json().id;
    const key = randomUUID();
    const bytes = pdfFixture([["Tarea 19", "Due date: 2030-08-14"]]);
    await assert.rejects(
      service.upload(a.owner, key, period, "staged.pdf", bytes),
      { code: "STORAGE_UNAVAILABLE" },
    );
    assert.equal(objects.size, 1);
    const staged = (await service.list(a.owner, {})).items[0];
    assert.equal(staged.state, "uploading");
    breakPut = false;
    // Replaying the same request after an ambiguous write reuses the tracked object.
    const resumed = await service.upload(
      a.owner,
      key,
      period,
      "staged.pdf",
      bytes,
    );
    assert.equal(resumed.id, staged.id);
    assert.equal(objects.size, 1);
    await worker.tick();
    assert.equal((await service.get(a.owner, staged.id)).state, "review");
    assert.equal(
      (await service.get(a.owner, staged.id)).originalDeletionPending,
      true,
    );
    await assert.rejects(
      service.requireAnalysisReupload(a.owner, staged.documentId),
      { code: "DOCUMENT_REUPLOAD_REQUIRED" },
    );
    assert.equal(objects.size, 1);
    now.setUTCSeconds(now.getUTCSeconds() + 30);
    breakDelete = false;
    await worker.tick();
    assert.equal(objects.size, 1);
    now.setUTCSeconds(now.getUTCSeconds() + 31);
    await worker.tick();
    assert.equal(objects.size, 0);

    breakPut = true;
    await assert.rejects(
      service.upload(
        a.owner,
        randomUUID(),
        period,
        "orphan.pdf",
        pdfFixture([["Tarea 20"]]),
      ),
      { code: "STORAGE_UNAVAILABLE" },
    );
    assert.equal(objects.size, 1);
    now.setUTCSeconds(now.getUTCSeconds() + 121);
    await worker.tick();
    assert.equal(objects.size, 0);
    const latest = (await service.list(a.owner, {})).items.find(
      (row) => row.id !== staged.id,
    )!;
    assert.equal(latest.state, "failed");
    assert.equal(latest.originalAvailable, false);
    breakPut = false;
    const waitingBytes = pdfFixture([["Tarea 21"]]);
    const waiting = await service.upload(
      a.owner,
      randomUUID(),
      period,
      "waiting.pdf",
      waitingBytes,
    );
    now.setUTCSeconds(now.getUTCSeconds() + 121);
    await worker.tick();
    assert.equal(objects.size, 0);
    const expired = await service.get(a.owner, waiting.id);
    assert.equal(expired.state, "failed");
    assert.equal(expired.errorCode, "IMPORT_ORIGINAL_EXPIRED");
    assert.equal(expired.originalAvailable, false);
    const replacement = await service.upload(
      a.owner,
      randomUUID(),
      period,
      "waiting.pdf",
      waitingBytes,
    );
    assert.notEqual(replacement.id, waiting.id);
    await worker.tick();
    assert.equal((await service.get(a.owner, replacement.id)).state, "review");
    assert.equal(objects.size, 0);
    breakDelete = true;
    const delayed = await service.upload(
      a.owner,
      randomUUID(),
      period,
      "delayed.pdf",
      pdfFixture([["Tarea 22"]]),
    );
    await worker.tick();
    assert.equal(objects.size, 1);
    now.setUTCSeconds(now.getUTCSeconds() + 121);
    await worker.tick(); // Retry fails after the original processing deadline.
    breakDelete = false;
    now.setUTCSeconds(now.getUTCSeconds() + 30);
    await worker.tick();
    assert.equal(objects.size, 1); // Expiry must not reset the deletion backoff.
    now.setUTCSeconds(now.getUTCSeconds() + 31);
    await worker.tick();
    assert.equal(objects.size, 0);
    assert.equal(
      (await service.get(a.owner, delayed.id)).originalDeletionPending,
      false,
    );
  } finally {
    await f.close();
  }
});
