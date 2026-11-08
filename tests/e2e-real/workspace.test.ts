import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import pg from "pg";
import { Temporal } from "@js-temporal/polyfill";
import { createServer } from "vite";
import { fixture } from "../integration/fixture.js";
import { ImportService } from "../../server/modules/imports/service.js";
import { privateImportStorage } from "../../server/modules/imports/storage.js";
import { ImportWorker } from "../../server/modules/jobs/import-worker.js";
import { isolatedExtract } from "../../server/modules/imports/runner.js";
import { Estimates } from "../../server/modules/estimates/service.js";
import { developmentEstimatePolicy } from "../../server/modules/estimates/local.js";
import { runPremiumCommand } from "../../server/modules/entitlements/operator.js";
import { pdfFixture } from "../fixtures/imports/pdf-fixture.js";

test("connected browser persists activity and rejects a stale revision across contexts", async () => {
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(".local/browsers"))
    process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".local/browsers");
  const { chromium } = await import("playwright");
  const { expect } = await import("@playwright/test");
  const now = new Date("2031-03-12T12:00:00Z");
  const storage = await privateImportStorage(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const sent: string[] = [];
  const f = await fixture(
    now,
    undefined,
    (identity) => new ImportService(identity, storage, `test-${randomUUID()}`),
    (academics) =>
      new Estimates(
        academics,
        {
          async estimate(context) {
            sent.push(context.excerpt);
            return {
              kind: "settled",
              requestId: "f6-fixture",
              usage: { input: 25, output: 10 },
              output: {
                status: "estimated",
                lowMinutes: 40,
                highMinutes: 80,
                factors: [{ kind: "deliverables", evidenceIndex: 1 }],
                missingContext: [],
              },
            };
          },
        },
        {
          ...developmentEstimatePolicy(randomBytes(32)),
          model: "f6-fixture",
          tariffVersion: "f6-fixture",
        },
      ),
  );
  f.app.addHook("onSend", async (_request, reply) => {
    reply.header("Date", now.toUTCString());
  });
  const worker = new ImportWorker(f.imports!, isolatedExtract);
  const operator = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  let grantedOwner: string | undefined;
  let uploadedDocument: string | undefined;
  const port = Number(process.env.CW_REAL_E2E_PORT ?? 5188);
  const origin = `http://127.0.0.1:${port}`;
  f.identity.config.origin = origin;
  const apiUrl = await f.app.listen({ host: "127.0.0.1", port: 0 });
  const vite = await createServer({
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      proxy: { "/api/v1": apiUrl },
    },
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await vite.listen();
    for (const pool of [f.db.pool, f.ids.pool]) {
      const probe = () => pool.query("select 1");
      await probe().catch((error: unknown) => {
        if (
          !(error instanceof Error) ||
          !/connection timeout/i.test(error.message)
        )
          throw error;
        return probe();
      });
    }
    const owner = await f.client();
    const other = await f.client();
    const profile = await f.request(
      owner,
      "PATCH",
      "/api/v1/me/preferences",
      { studyTimezone: "UTC" },
      '"profile-1"',
    );
    assert.equal(profile.statusCode, 200, profile.body);
    browser = await chromium.launch();
    async function open(cookie: string, firstVisit = true) {
      const context = await browser!.newContext();
      const page = await context.newPage();
      // Chromium accepts secure loopback cookies from HTTP response headers,
      // whereas the DevTools cookie setter rejects __Host cookies for HTTP URLs.
      await page.route(`${origin}/__fixture_session`, (route) =>
        route.fulfill({
          body: "",
          headers: {
            "Set-Cookie": `${cookie}; Secure; HttpOnly; Path=/; SameSite=Lax`,
          },
        }),
      );
      await page.goto(`${origin}/__fixture_session`);
      assert.ok(
        (await context.cookies()).some(
          (item) => item.name === "__Host-cw_session" && item.httpOnly,
        ),
      );
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      if (firstVisit)
        await page.getByRole("button", { name: "Ahora no" }).click();
      await expect(
        page.getByText("Sin actividades ni sesiones esta semana.", {
          exact: true,
        }),
      ).toBeVisible();
      return page;
    }
    const a = await open(owner.cookie);
    const b = await open(owner.cookie, false);
    const c = await open(other.cookie);
    await a
      .getByRole("link", { name: "Añadir actividad", exact: true })
      .click();
    await a
      .getByLabel("Título de la actividad")
      .fill("Obligación registrada en F6");
    await a
      .getByLabel("Fecha límite")
      .fill(
        Temporal.Instant.from(now.toISOString())
          .toZonedDateTimeISO("UTC")
          .toPlainDate()
          .toString(),
      );
    await a.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(
      a.getByRole("heading", { name: "Obligación registrada en F6" }),
    ).toBeVisible();
    await b.goto(a.url(), { waitUntil: "domcontentloaded" });
    await expect(
      b.getByRole("heading", { name: "Obligación registrada en F6" }),
    ).toBeVisible();
    for (const page of [a, b])
      await page.getByRole("button", { name: "Registrar progreso" }).click();
    await a.getByLabel("Tiempo real acumulado (minutos)").fill("20");
    await a.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(a.getByText(/Real: 20 min/)).toBeVisible();
    await b.getByLabel("Tiempo real acumulado (minutos)").fill("35");
    await b.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(
      b.getByText("Los datos cambiaron.", { exact: false }),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "Recargar datos", exact: true })
      .click();
    await expect(b.getByText(/Real: 20 min/)).toBeVisible();
    await c.goto(a.url(), { waitUntil: "domcontentloaded" });
    await expect(c.getByText("No encontramos este recurso.")).toBeVisible();
    assert.equal(await c.getByText("Obligación registrada en F6").count(), 0);

    await operator.connect();
    await runPremiumCommand(
      operator,
      {
        action: "grant",
        owner: owner.owner,
        expiresAt: new Date(now.getTime() + 86400000),
        actor: "fixture-f6",
        reason: "Verificación local con proveedor simulado",
      },
      now,
    );
    grantedOwner = owner.owner;
    await a.reload();
    await a.getByRole("link", { name: "Tablero", exact: true }).click();
    await a
      .getByRole("link", { name: "Importar actividad — PDF/Excel" })
      .click();
    const workbook = resolve("tests/fixtures/imports/anexo.xlsx");
    await a.getByLabel("Archivo PDF o XLSX").setInputFiles(workbook);
    await a.getByRole("button", { name: "Subir para revisar" }).click();
    await expect(a).toHaveURL(/#\/importar\/[a-f0-9-]+$/);
    const importId = a.url().split("/").at(-1)!;
    const importPath = `/api/v1/imports/${importId}`;
    uploadedDocument = (await f.request(owner, "GET", importPath)).json()
      .documentId;
    await worker.tick();
    await expect(
      a.getByText("Listo para revisar", { exact: true }),
    ).toBeVisible();
    const imported = (await f.request(owner, "GET", importPath)).json();
    assert.equal(imported.originalAvailable, false);
    assert.equal(imported.originalDeletionPending, false);
    await assert.rejects(storage.get(imported.documentId));
    const draft = a
      .locator("details")
      .filter({ hasText: /· Borrador/ })
      .first();
    await draft.locator("summary").click();
    await draft
      .getByLabel("Título", { exact: true })
      .fill("Enunciado de prueba F6");
    await draft.getByLabel("Tipo", { exact: true }).selectOption("Tarea");
    await draft.getByLabel("Fecha límite").fill("2031-03-12");
    await draft.getByLabel("Hora límite").fill("19:00");
    await draft.getByLabel("Fin de evaluación").fill("");
    await draft.getByLabel("Zona").fill("UTC");
    await draft.getByRole("button", { name: "Guardar borrador" }).click();
    const row = a
      .locator("details")
      .filter({ hasText: "Enunciado de prueba F6 · Borrador" });
    await row.locator("summary").click();
    await row
      .getByRole("checkbox", { name: "Seleccionar Enunciado de prueba F6" })
      .check();
    await a
      .getByRole("button", { name: "Confirmar seleccionadas (1)" })
      .click();
    await expect(a.getByText("Confirmadas: 1", { exact: true })).toBeVisible();
    await expect(a.getByText(/Siguiente pendiente/)).toBeVisible();
    const reviewed = (
      await f.request(owner, "GET", importPath + "/candidates")
    ).json().items;
    assert.equal(
      reviewed.filter((item: { status: string }) => item.status === "confirmed")
        .length,
      1,
    );
    assert.equal(
      reviewed.filter((item: { status: string }) => item.status === "draft")
        .length,
      6,
    );
    assert.equal((await f.request(other, "GET", importPath)).statusCode, 404);
    await b.goto(a.url());
    await b.getByRole("button", { name: "Descartar cambios y salir" }).click();
    await expect(
      b.getByText("Enunciado de prueba F6 · Confirmada", { exact: true }),
    ).toBeVisible();

    await a.getByRole("link", { name: "Calendario", exact: true }).click();
    const calendar = a.getByRole("region", { name: "Semana del calendario" });
    const deadline = calendar.getByRole("link", {
      name: /Enunciado de prueba F6/,
    });
    await deadline.scrollIntoViewIfNeeded();
    const position = await calendar.evaluate((el) => ({
      top: el.scrollTop,
      left: el.scrollLeft,
    }));
    assert.ok(position.top > 600);
    await deadline.click();
    const activityId = a.url().split("/").at(-1)!;
    await a.getByRole("link", { name: "Volver al calendario" }).click();
    await expect
      .poll(() =>
        calendar.evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft })),
      )
      .toEqual(position);
    await deadline.click();
    assert.equal(
      (
        await f.request(
          owner,
          "GET",
          `/api/v1/activities/${activityId}/estimate-source`,
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.request(
          other,
          "GET",
          `/api/v1/activities/${activityId}/estimate-source`,
        )
      ).statusCode,
      404,
    );
    await a.getByRole("button", { name: "Estimar esfuerzo" }).click();
    await a
      .getByRole("button", { name: "Autorizar", exact: true })
      .filter({ visible: true })
      .click();
    await expect(
      a.getByRole("button", { name: "Revocar permiso", exact: true }),
    ).toBeVisible();
    const sourceStatus = await f.request(
      owner,
      "GET",
      `/api/v1/activities/${activityId}/estimate-source`,
    );
    assert.equal(sourceStatus.statusCode, 200, sourceStatus.body);
    assert.equal(sourceStatus.json().available, true);
    const sourceFile = a.getByLabel("Mismo archivo de la importación");
    await sourceFile.setInputFiles({
      name: "diferente.pdf",
      mimeType: "application/pdf",
      buffer: pdfFixture([["Tarea diferente"]]),
    });
    await a
      .getByRole("button", { name: "Preparar fragmento para revisar" })
      .click();
    await expect(
      a.getByText("Sube el mismo archivo que se usó para esta importación.", {
        exact: true,
      }),
    ).toBeVisible();
    await sourceFile.setInputFiles(workbook);
    await a
      .getByRole("button", { name: "Preparar fragmento para revisar" })
      .click();
    const fragment = a.getByLabel("Fragmento del enunciado");
    await expect(fragment).not.toHaveValue("", { timeout: 35_000 });
    assert.equal(sent.length, 0);
    await assert.rejects(storage.get(imported.documentId));
    await fragment.fill(
      "Preparar un informe sintético. Entregar dos ejercicios resueltos.",
    );
    await a
      .getByText("Revisé el fragmento y retiré los datos personales.")
      .click();
    await a.getByRole("button", { name: "Solicitar rango" }).click();
    await a.getByRole("button", { name: "Confirmar esfuerzo" }).click();
    await expect(a.getByText(/40 min/).first()).toBeVisible();
    assert.deepEqual(sent, [
      "Preparar un informe sintético. Entregar dos ejercicios resueltos.",
    ]);

    await a.getByRole("link", { name: "Volver al calendario" }).click();
    const visualPath = resolve(".local/f6-final-visual");
    if (process.env.CW_F6_CAPTURE === "1")
      await mkdir(visualPath, { recursive: true });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await a.setViewportSize({ width, height: 900 });
      await expect(calendar).toBeVisible();
      await expect(
        a.getByRole("button", { name: "Agenda", exact: true }),
      ).toBeVisible();
      assert.equal(
        await a.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
        `Ancho ${width}`,
      );
      if (process.env.CW_F6_CAPTURE === "1" && [390, 1440].includes(width))
        await a.screenshot({
          path: resolve(visualPath, `calendario-${width}.png`),
        });
    }
    await a.getByRole("link", { name: "Ajustes", exact: true }).click();
    await a.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(a).toHaveURL(/#\/acceso$/);
    await b.reload();
    await expect(b).toHaveURL(/#\/acceso$/);
  } finally {
    await browser?.close();
    await vite.close();
    if (uploadedDocument)
      await storage.remove(uploadedDocument).catch(() => {});
    if (grantedOwner)
      await runPremiumCommand(
        operator,
        {
          action: "revoke",
          owner: grantedOwner,
          actor: "fixture-f6",
          reason: "Fin de comprobación local",
        },
        now,
      );
    await f.close();
    await operator.end();
  }
});
