import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Temporal } from "@js-temporal/polyfill";
import { createServer } from "vite";
import { fixture } from "../integration/fixture";

test("connected browser persists activity and rejects a stale revision across contexts", async () => {
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(".local/browsers"))
    process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".local/browsers");
  const { chromium } = await import("playwright");
  const { expect } = await import("@playwright/test");
  const now = new Date();
  const f = await fixture(now);
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
    const owner = await f.client();
    const other = await f.client();
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
  } finally {
    await browser?.close();
    await vite.close();
    await f.close();
  }
});
