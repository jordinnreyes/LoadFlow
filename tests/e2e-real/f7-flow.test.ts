import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import { preview } from "vite";
import type {
  APIResponse,
  Response as BrowserResponse,
} from "@playwright/test";
import type { Response } from "../../src/api/client.js";
import { loopback } from "../../server/config.js";
import { SupabaseProvider } from "../../server/modules/identity/provider.js";
import { SESSION_COOKIE } from "../../server/modules/identity/service.js";
import { isolatedExtract } from "../../server/modules/imports/runner.js";
import { ImportService } from "../../server/modules/imports/service.js";
import { privateImportStorage } from "../../server/modules/imports/storage.js";
import { ImportWorker } from "../../server/modules/jobs/import-worker.js";
import { pdfFixture } from "../fixtures/imports/pdf-fixture.js";
import { fixture } from "../integration/fixture.js";
import { mailCode } from "../integration/mailpit.js";

const api = "/api/v1";

async function response<T>(
  result: APIResponse | BrowserResponse,
  status = 200,
): Promise<T> {
  assert.equal(result.status(), status, result.url());
  return result.json();
}

test("F7-01 registers with OTP, imports, plans, replans and persists progress across browsers", async (t) => {
  const urls = [
    process.env.DATABASE_URL,
    process.env.IDENTITY_DATABASE_URL,
    process.env.SUPABASE_URL,
  ];
  assert.ok(
    urls.every((url) => url && loopback(url)),
    "F7-01 solo usa servicios locales.",
  );
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(".local/browsers"))
    process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".local/browsers");
  const { chromium, expect } = await import("@playwright/test");
  const now = new Date();
  const today = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO("UTC")
    .toPlainDate();
  const deadline = today.add({ days: 2 }).toString();
  const storage = await privateImportStorage(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const f = await fixture(
    now,
    undefined,
    (identity) =>
      new ImportService(identity, storage, `test-f7-${randomUUID()}`),
    undefined,
    new SupabaseProvider(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    ),
  );
  const port = Number(process.env.CW_F7_E2E_PORT ?? 5190);
  const origin = `http://127.0.0.1:${port}`;
  const url = (path: string) => origin + api + path;
  f.identity.config.origin = origin;
  const worker = new ImportWorker(f.imports!, isolatedExtract);
  let vite: Awaited<ReturnType<typeof preview>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const originals = new Set<string>();
  try {
    const apiUrl = await f.app.listen({ host: "127.0.0.1", port: 0 });
    vite = await preview({
      preview: {
        host: "127.0.0.1",
        port,
        strictPort: true,
        proxy: { [api]: apiUrl },
      },
    });
    t.diagnostic("API y build web listos");
    browser = await chromium.launch();
    const a = await browser.newPage();
    a.setDefaultTimeout(45_000);
    await a.goto(origin);
    await expect(a).toHaveTitle(/WiseLoad/);
    const email = `f7-${randomUUID()}@fixture.test`;
    await a.getByRole("button", { name: "Crear cuenta", exact: true }).click();
    await a.getByLabel("Correo electrónico").fill(email);
    await a.getByRole("button", { name: "Enviar código" }).click();
    await a.getByLabel("Código de verificación").fill(await mailCode(email));
    await a.getByRole("button", { name: "Verificar código" }).click();
    await a.getByRole("button", { name: "Ahora no" }).click();
    await expect(a.getByRole("button", { name: "Ahora no" })).toHaveCount(0);
    await expect(
      a.getByText("Sin actividades ni sesiones esta semana.", { exact: true }),
    ).toBeVisible();
    t.diagnostic("Alta OTP y tablero inicial vacío verificados");
    const session = await response<Response<"currentSession", 200>>(
      await a.request.get(url("/auth/session")),
    );
    const headers = (revision?: string) => ({
      Origin: origin,
      "X-CSRF-Token": session.csrfToken,
      "Idempotency-Key": randomUUID(),
      ...(revision ? { "If-Match": revision } : {}),
    });
    assert.equal(
      (
        await a.request.patch(url("/me/preferences"), {
          headers: headers(`"profile-${session.user.revision}"`),
          data: { studyTimezone: "UTC" },
        })
      ).status(),
      200,
    );
    await a.reload();
    const periods = await response<Response<"listPeriods", 200>>(
      await a.request.get(url("/periods")),
    );
    const periodPath = `/periods/${periods.items[0].id}`;
    await a
      .getByRole("link", { name: "Importar actividad — PDF/Excel" })
      .click();
    async function upload(
      file: string | { name: string; mimeType: string; buffer: Buffer },
    ) {
      await a.getByLabel("Archivo PDF o XLSX").setInputFiles(file);
      const uploaded = a.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === api + "/imports" &&
          r.request().method() === "POST",
      );
      await a.getByRole("button", { name: "Subir para revisar" }).click();
      const job = await response<Response<"uploadImport", 202>>(
        await uploaded,
        202,
      );
      originals.add(job.documentId);
      await worker.tick();
      await expect(
        a.getByText("Listo para revisar", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });
      await assert.rejects(storage.get(job.documentId));
      return job;
    }
    const job = await upload(resolve("tests/fixtures/imports/anexo.xlsx"));
    const candidate = a
      .locator("details")
      .filter({ hasText: /· Borrador/ })
      .first();
    if ((await candidate.getAttribute("open")) === null)
      await candidate.locator("summary").click();
    const title = "Informe académico F7";
    await candidate.getByLabel("Título", { exact: true }).fill(title);
    await candidate.getByLabel("Tipo", { exact: true }).selectOption("Tarea");
    await candidate.getByLabel("Fecha límite").fill(deadline);
    await candidate.getByLabel("Hora límite").fill("19:00");
    await candidate.getByLabel("Fin de evaluación").fill("");
    await candidate.getByLabel("Zona").fill("UTC");
    await candidate.getByLabel("Esfuerzo (minutos)").fill("90");
    await candidate.getByRole("button", { name: "Guardar borrador" }).click();
    const revised = a.locator("details").filter({ hasText: title });
    if ((await revised.getAttribute("open")) === null)
      await revised.locator("summary").click();
    await revised
      .getByRole("checkbox", { name: `Seleccionar ${title}` })
      .check();
    const confirmed = a.waitForResponse(
      (r) => new URL(r.url()).pathname === `${api}/imports/${job.id}/confirm`,
    );
    await a
      .getByRole("button", { name: "Confirmar seleccionadas (1)" })
      .click();
    const confirmedResponse = await confirmed;
    assert.equal(confirmedResponse.status(), 200);
    const { items }: Response<"confirmImport", 200> =
      await confirmedResponse.json();
    assert.equal(items.length, 1);
    const activityId = items[0].activityId;
    assert.ok(activityId);
    await expect(a.getByText(/Siguiente pendiente/)).toBeVisible();
    t.diagnostic("Importación, borrado del original y corrección verificados");

    const activityPath = `/calendario/${activityId}`;
    await a.goto(origin + "/#" + activityPath);
    await a.getByRole("button", { name: "Configurar preparación" }).click();
    await a.getByLabel("Puedo empezar desde ahora").check();
    await a.getByLabel("Divisibilidad").selectOption("indivisible");
    const constrained = a.waitForResponse(
      (r) =>
        new URL(r.url()).pathname ===
        `${api}/activities/${activityId}/constraints`,
    );
    await a.getByRole("button", { name: "Guardar", exact: true }).click();
    const prepared = await response<Response<"updateActivityConstraints", 200>>(
      await constrained,
    );
    assert.ok(prepared.allowedStartAt);
    assert.equal(prepared.divisibility, "indivisible");

    const coverage = await a.request.get(url(periodPath + "/availability"));
    const availability = await a.request.put(
      url(periodPath + "/availability"),
      {
        headers: headers(coverage.headers().etag),
        data: {
          confirmed: true,
          timezone: "UTC",
          validFrom: today.toString(),
          validTo: null,
          weekly: Array.from({ length: 7 }, (_, index) => ({
            weekday: index + 1,
            state: "windows",
            intervals: [{ startMinute: 420, endMinute: 1320 }],
          })),
          exceptions: [],
          manualCoverage: [
            { from: today.toString(), to: today.add({ days: 3 }).toString() },
          ],
          preferences: {
            minimumMinutes: 30,
            preferredMinutes: 60,
            maximumMinutes: 120,
          },
        },
      },
    );
    assert.equal(availability.status(), 200, await availability.text());

    async function reviewPlan() {
      await a.goto(origin + "/#/tablero");
      await a
        .getByRole("button", { name: "Revisar nueva distribución" })
        .click();
      const dialog = a.getByRole("dialog", { name: "Revisar propuesta" });
      await expect(dialog).toBeVisible();
      for (const confirmation of await dialog.getByRole("checkbox").all())
        await confirmation.check();
      const applied = a.waitForResponse(
        (r) =>
          new URL(r.url()).pathname.endsWith("/apply") &&
          r.request().method() === "POST",
      );
      await dialog.getByRole("button", { name: "Aplicar propuesta" }).click();
      const result = await applied;
      assert.equal(result.status(), 200);
      return result.json() as Promise<Response<"getStudyPlan", 200>>;
    }
    const planned = await reviewPlan();
    const block = planned.result?.sessions.find(
      (item) => item.activityId === activityId && item.state === "planned",
    );
    assert.ok(
      block,
      "El primer plan debe contener una sesión para la actividad importada.",
    );
    assert.ok(Date.parse(block.endAt) <= Date.parse(deadline + "T19:00:00Z"));
    const busy = await a.request.post(url("/manual-commitments"), {
      headers: headers(),
      data: {
        periodId: periods.items[0].id,
        title: "Compromiso F7",
        confirmed: true,
        startAt: block.startAt,
        endAt: block.endAt,
        timezone: "UTC",
      },
    });
    assert.equal(busy.status(), 201, await busy.text());
    await a.reload();
    const replanned = await reviewPlan();
    assert.ok(replanned.planRevision > planned.planRevision);
    const updated =
      replanned.result?.sessions.filter(
        (item) => item.activityId === activityId && item.state === "planned",
      ) ?? [];
    assert.ok(updated.length);
    assert.ok(
      updated.every(
        (item) =>
          Date.parse(item.endAt) <= Date.parse(block.startAt) ||
          Date.parse(item.startAt) >= Date.parse(block.endAt),
      ),
    );
    t.diagnostic("Plan y replanificación sin solapamiento verificados");

    await a.goto(origin + "/#" + activityPath);
    await a.getByRole("button", { name: "Registrar progreso" }).click();
    await a.getByLabel("Tiempo real acumulado (minutos)").fill("20");
    await a.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(a.getByText(/Real: 20 min/)).toBeVisible();

    const cookie = (await a.context().cookies()).find(
      (item) => item.name === SESSION_COOKIE,
    );
    assert.ok(cookie?.httpOnly && cookie.secure);
    const b = await browser.newPage();
    await b.route(origin + "/__f7_session", (route) =>
      route.fulfill({
        body: "",
        headers: {
          "Set-Cookie": `${SESSION_COOKIE}=${cookie.value}; Secure; HttpOnly; Path=/; SameSite=Lax`,
        },
      }),
    );
    await b.goto(origin + "/__f7_session");
    await b.goto(origin + "/#" + activityPath);
    await expect(b.getByRole("heading", { name: title })).toBeVisible();
    await expect(b.getByText(/Real: 20 min/)).toBeVisible();
    const persisted = await response<Response<"getStudyPlan", 200>>(
      await b.request.get(url(periodPath + "/plan")),
    );
    const current = await response<Response<"getStudyPlan", 200>>(
      await a.request.get(url(periodPath + "/plan")),
    );
    assert.deepEqual(persisted, current);
    const other = await browser.newPage();
    assert.equal(
      (await other.request.get(url(`/activities/${activityId}`))).status(),
      401,
    );

    await t.test(
      "F7-02 offers manual entry from an image-only PDF and preserves saved work",
      async () => {
        const activityUrl = url(`/activities/${activityId}`);
        const existing = await response<Response<"getActivity", 200>>(
          await a.request.get(activityUrl),
        );
        const candidatesUrl = url(`/imports/${job.id}/candidates`);
        const drafts = await response<Response<"listImportCandidates", 200>>(
          await a.request.get(candidatesUrl),
        );
        await a.goto(origin + "/#/importar");
        const scan = await upload({
          name: "scan.pdf",
          mimeType: "application/pdf",
          buffer: pdfFixture(["raster"]),
        });
        const scanPath = `/imports/${scan.id}`;
        const review = await response<Response<"getImport", 200>>(
          await a.request.get(url(scanPath)),
        );
        assert.equal(review.manualEntryAvailable, true);
        assert.deepEqual(
          review.coverage.map((unit) => unit.state),
          ["no_text"],
        );
        await expect(
          a.getByText("Hay páginas del PDF sin texto seleccionable."),
        ).toBeVisible();
        await expect(
          a.getByText(/No se encontraron filas reconocibles/),
        ).toBeVisible();

        await a.getByRole("link", { name: "Añadir manualmente" }).click();
        await a
          .getByLabel("Título de la actividad")
          .fill("Actividad transcrita del escaneo");
        await a.getByLabel("Fecha límite").fill(deadline);
        const created = a.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === `${api}/activities` &&
            r.request().method() === "POST",
        );
        await a.getByRole("button", { name: "Guardar", exact: true }).click();
        const manual = await response<Response<"createActivity", 201>>(
          await created,
          201,
        );
        await expect(
          a.getByRole("heading", { name: manual.title }),
        ).toBeVisible();

        await a.goto(origin + `/#/importar/${scan.id}`);
        await a.getByRole("button", { name: "Retirar fuente" }).click();
        await a.getByRole("button", { name: "Confirmar retirada" }).click();
        await expect(a.getByText("Cancelada", { exact: true })).toBeVisible();
        assert.equal(
          (await a.request.get(url(`/activities/${manual.id}`))).status(),
          200,
        );
        const saved = await response<Response<"getActivity", 200>>(
          await a.request.get(activityUrl),
        );
        assert.equal(saved.revision, existing.revision);
        assert.equal(saved.dueDate, existing.dueDate);
        assert.equal(saved.realTotalMinutes, 20);
        const savedDrafts = await response<
          Response<"listImportCandidates", 200>
        >(await a.request.get(candidatesUrl));
        assert.deepEqual(
          savedDrafts.items.map(({ id, revision, status }) => ({
            id,
            revision,
            status,
          })),
          drafts.items.map(({ id, revision, status }) => ({
            id,
            revision,
            status,
          })),
        );
      },
    );
  } finally {
    await browser?.close();
    await vite?.close();
    for (const original of originals)
      await storage.remove(original).catch(() => {});
    await f.close();
  }
});
