import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, plan = "Free") {
  await page.goto("/");
  if (plan === "Premium")
    await page.getByLabel("Perfil de ejemplo").selectOption("Premium");
  await page.getByRole("button", { name: "Continuar con Google" }).click();
  await expect(page.locator(".page-heading h1")).toHaveText(
    /Tu semana, (Alex|Valeria)\./,
  );
}
async function route(page: Page, path: string) {
  await page.goto(`/#${path}`);
}
async function state(page: Page) {
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("loadflow-prototype-v1")!);
    return s.profiles[s.active];
  });
}
async function scenario(page: Page, name: string) {
  await route(page, "/ajustes");
  await page.getByRole("button", { name, exact: false }).click();
  await page
    .getByRole("button", { name: "Cargar escenario", exact: true })
    .click();
  await expect(page.locator(".page-heading h1")).toContainText("Tu semana,");
}
test("first registration, optional Calendar, empty state and session continuity", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await page.getByLabel("Correo de demostración").fill("nuevo@ejemplo.test");
  await page.getByRole("button", { name: "Crear perfil con correo" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Tu tiempo, con contexto",
  );
  await page.getByRole("button", { name: "Ahora no", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tu plan comienza con tus datos" }),
  ).toBeVisible();
  await expect(
    page.getByText("Sin actividades ni sesiones esta semana.").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Viable según datos", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await route(page, "/ajustes");
  await page.getByRole("button", { name: "Cerrar sesión simulada" }).click();
  await expect(
    page.getByRole("button", { name: "Continuar con Google" }),
  ).toBeVisible();
  await page.getByLabel("Correo de demostración").fill("nuevo@ejemplo.test");
  await page
    .getByRole("button", { name: "Continuar con correo", exact: true })
    .click();
  await expect(page.locator(".page-heading h1")).toContainText("Tu semana,");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("dashboard deadlines, advance study and calendar context share data", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect(page.getByTestId("week-2026-11-02")).toContainText(
    "Viable según datos",
  );
  await expect(page.getByTestId("week-2026-11-30")).toContainText(
    "Trabajo adelantado",
  );
  await page
    .getByRole("button", {
      name: "PC 3 · Integrales y aplicaciones",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/calendario\/pc-calculo-1/);
  await expect(
    page.getByRole("complementary", { name: "Detalle de actividad" }),
  ).toContainText("Sesiones vinculadas");
  expect(errors).toEqual([]);
});
test("seven import rows, edits, partial confirmation and draft continuity", async ({
  page,
}) => {
  await login(page);
  await route(page, "/importar");
  await page.getByRole("button", { name: "Excel · 5 PC + 2 exámenes" }).click();
  await expect(page.locator(".review-record")).toHaveCount(7);
  await page
    .getByLabel("Título fila 1", { exact: true })
    .fill("PC 1 corregida por mí");
  await page.getByLabel("Horas fila 1", { exact: true }).fill("2,5");
  await page
    .getByRole("button", { name: "Permitir inicio hoy a seleccionadas" })
    .click();
  await page
    .getByRole("button", { name: "Marcar divisibles seleccionadas" })
    .click();
  await page.getByLabel("Seleccionar todas", { exact: true }).uncheck();
  await page
    .getByLabel("Seleccionar PC 1 corregida por mí", { exact: true })
    .check();
  await page.getByLabel("Horas fila 1", { exact: true }).fill("-2");
  await page
    .getByRole("button", { name: "Confirmar seleccionadas (1)" })
    .click();
  await expect(
    page.getByText(
      "Revisa el campo inválido antes de confirmar. Tus actividades aún no cambiaron.",
    ),
  ).toBeVisible();
  expect((await state(page)).activities).toHaveLength(7);
  await page.getByLabel("Horas fila 1", { exact: true }).fill("2,5");
  await page
    .getByRole("button", { name: "Confirmar seleccionadas (1)" })
    .click();
  await expect(page.getByTestId("week-2026-11-02")).toContainText(
    "PC 1 corregida por mí",
  );
  let data = await state(page);
  expect(data.drafts).toHaveLength(6);
  expect(
    data.activities.find((a: any) => a.title === "PC 1 corregida por mí")
      .effort,
  ).toBe(150);
  await page.reload();
  data = await state(page);
  expect(data.drafts).toHaveLength(6);
  await route(page, "/importar");
  await expect(page.locator(".review-record")).toHaveCount(6);
});
test("manual activity updates plan and survives reload", async ({ page }) => {
  await login(page);
  await route(page, "/calendario/nueva");
  await page
    .getByLabel("Título de la actividad", { exact: true })
    .fill("Ensayo individual de ejemplo");
  await page.getByLabel("Fecha límite", { exact: true }).fill("2026-11-09");
  await page.getByLabel("Hora límite confirmada").fill("18:00");
  await page.getByLabel("Horas estimadas de trabajo").fill("2");
  await page.getByLabel("Puedo empezar desde hoy").check();
  await page.getByLabel("¿Se puede dividir").selectOption("yes");
  await page
    .getByRole("button", { name: "Revisar cambios", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambios", exact: true })
    .click();
  expect(
    (await state(page)).activities.some(
      (a: any) => a.title === "Ensayo individual de ejemplo",
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Ensayo individual de ejemplo",
      exact: true,
    }),
  ).toBeVisible();
});
test("priority base and individual override really update the same state", async ({
  page,
}) => {
  await login(page);
  await route(page, "/prioridades");
  const first = page.getByLabel("Práctica calificada", { exact: true }).first();
  await first.selectOption("Baja");
  await page
    .getByRole("button", { name: "Revisar efecto en mis sesiones" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambios", exact: true })
    .click();
  expect(
    (await state(page)).priorities["Cálculo II::Práctica calificada"],
  ).toBe("Baja");
  await route(page, "/calendario/pc-calculo-1");
  await page
    .getByRole("button", { name: "Editar datos o actualizar fecha" })
    .click();
  await page.getByLabel("Prioridad de esta actividad").selectOption("Alta");
  await page
    .getByRole("button", { name: "Revisar cambios", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambios", exact: true })
    .click();
  const data = await state(page);
  expect(data.activities[0].priority).toBe("Alta");
  expect(data.activities[4].priority).toBe("inherit");
});
test("availability changes produce a preview and different session distribution", async ({
  page,
}) => {
  await login(page);
  const before = (await state(page)).sessions;
  await route(page, "/disponibilidad");
  await page.getByLabel("Lunes: fin", { exact: true }).fill("17:00");
  await page
    .getByRole("button", { name: "Revisar y guardar disponibilidad" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Qué cambia en las sesiones",
  );
  expect((await state(page)).sessions).toEqual(before);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambios", exact: true })
    .click();
  const after = await state(page);
  expect(after.windows.find((v: any) => v.day === 1).end).toBe(1020);
  expect(after.sessions).not.toEqual(before);
});
test("date change is explicit, preserves history and yields only sessions before deadline", async ({
  page,
}) => {
  await login(page);
  await route(page, "/calendario/parcial-fisica");
  await page
    .getByRole("button", { name: "Editar datos o actualizar fecha" })
    .click();
  await page
    .getByLabel("Fecha de evaluación", { exact: true })
    .fill("2026-11-03");
  await page
    .getByRole("button", { name: "Revisar cambios", exact: true })
    .click();
  expect(
    (await state(page)).activities.find((a: any) => a.id === "parcial-fisica")
      .date,
  ).toBe("2026-11-12");
  await expect(page.getByRole("dialog")).toContainText("Nueva propuesta");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar fecha nueva" })
    .click();
  const data = await state(page);
  expect(
    data.activities.find((a: any) => a.id === "parcial-fisica").dateHistory,
  ).toHaveLength(1);
  expect(data.issues.some((i: any) => i.activityId === "parcial-fisica")).toBe(
    true,
  );
  for (const s of data.sessions.filter(
    (s: any) => s.activityId === "parcial-fisica",
  ))
    expect(s.date <= "2026-11-03").toBe(true);
});
test("real accumulated hours can be corrected and preparation closes independently", async ({
  page,
}) => {
  await login(page);
  await route(page, "/calendario/pc-calculo-1");
  await page
    .getByRole("button", { name: "Registrar progreso", exact: true })
    .click();
  await page
    .getByLabel("Horas reales acumuladas (opcional)", { exact: true })
    .fill("2");
  await page
    .getByRole("button", { name: "Guardar progreso", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Registrar progreso", exact: true })
    .click();
  await page
    .getByLabel("Horas reales acumuladas (opcional)", { exact: true })
    .fill("3");
  await page.getByLabel("Terminé de prepararme", { exact: true }).check();
  await page
    .getByRole("button", { name: "Confirmar preparación terminada" })
    .click();
  const data = await state(page);
  const a = data.activities.find((a: any) => a.id === "pc-calculo-1");
  expect(a.real).toBe(180);
  expect(a.preparation).toBe("done");
  expect(a.fulfilled).toBe(false);
  expect(
    data.sessions.some((s: any) => s.activityId === a.id && !s.fixed),
  ).toBe(false);
  await expect(
    page.getByRole("complementary", { name: "Detalle de actividad" }),
  ).toContainText("Pendiente de rendir");
});
test("Calendar connects without OAuth and distinguishes stale source", async ({
  page,
}) => {
  const outgoing: string[] = [];
  page.on("request", (req) => {
    if (
      !req.url().startsWith("http://127.0.0.1:5173") &&
      !req.url().startsWith("data:")
    )
      outgoing.push(req.url());
  });
  await login(page);
  await route(page, "/ajustes");
  await page
    .getByRole("button", { name: "Google Calendar simulado", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Conectar seleccionados (simulado)" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).calendar).toBe("connected");
  await page
    .getByRole("button", { name: "Google Calendar simulado", exact: false })
    .click();
  await page.getByText("Estados para revisión del prototipo").click();
  await page.getByLabel("Simular estado de la fuente").selectOption("stale");
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await route(page, "/tablero");
  await expect(
    page.getByText("Tu información de Calendar está sin actualizar"),
  ).toBeVisible();
  expect(
    (await state(page)).commitments.some((c: any) => c.source === "google"),
  ).toBe(true);
  expect(outgoing).toEqual([]);
});
test("Free blocks only suggestions; Premium accepts simulated estimates, downgrade preserves records", async ({
  page,
}) => {
  await login(page);
  await route(page, "/calendario/pc-calculo-1");
  await page
    .getByRole("button", { name: "Editar datos o actualizar fecha" })
    .click();
  await page
    .getByRole("button", { name: "Solicitar sugerencia simulada" })
    .click();
  await expect(
    page.getByText("Sugerir horas requiere Premium", { exact: true }),
  ).toBeVisible();
  await route(page, "/ajustes");
  await page
    .getByRole("button", { name: "Demostrar Premium", exact: true })
    .click();
  await route(page, "/calendario/pc-calculo-1");
  await page
    .getByRole("button", { name: "Editar datos o actualizar fecha" })
    .click();
  await page
    .getByRole("button", { name: "Solicitar sugerencia simulada" })
    .click();
  await page.getByRole("button", { name: "Aceptar estas horas" }).click();
  await page
    .getByRole("button", { name: "Revisar cambios", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambios", exact: true })
    .click();
  let data = await state(page);
  expect(data.activities[0].estimateOrigin).toBe("suggested");
  const effort = data.activities[0].effort;
  await route(page, "/ajustes");
  await page
    .getByRole("button", { name: "Demostrar Free", exact: true })
    .click();
  data = await state(page);
  expect(data.plan).toBe("Free");
  expect(data.activities[0].effort).toBe(effort);
});
test("eligible Premium scenario shows personalized suggestion only with consent", async ({
  page,
}) => {
  await login(page);
  await scenario(page, "Premium con historial");
  await route(page, "/ajustes");
  await page.getByLabel("Permito usar el historial ficticio").check();
  await route(page, "/calendario/pc-calculo-1");
  await page
    .getByRole("button", { name: "Editar datos o actualizar fecha" })
    .click();
  await page
    .getByRole("button", { name: "Solicitar sugerencia simulada" })
    .click();
  await expect(
    page.getByText("Personalizada · historial elegible del escenario", {
      exact: true,
    }),
  ).toBeVisible();
});
test("group reserve changes and explicit interval equivalence avoid duplicate occupied hours", async ({
  page,
}) => {
  await login(page);
  await route(page, "/ajustes");
  await page
    .getByRole("button", { name: "Google Calendar simulado", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Conectar seleccionados (simulado)" })
    .click();
  await route(page, "/calendario/grupo-innovacion");
  await page
    .getByRole("button", { name: "Revisar o modificar reservas" })
    .click();
  await page.getByLabel(/Ocupado · 2026-11-11 · 17:00–19:00/).check();
  await page
    .getByRole("button", { name: "Aceptar reservas tentativas", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambios", exact: true })
    .click();
  const data = await state(page);
  const group = data.activities.find((a: any) => a.id === "grupo-innovacion");
  expect(group.equivalentIds).toContain("reunion-equivalente");
  expect(group.real).toBe(null);
  expect(
    data.sessions
      .filter((s: any) => s.activityId === group.id)
      .reduce((sum: number, s: any) => sum + s.end - s.start, 0),
  ).toBe(240);
});
test("overload, incomplete and structural conflict scenarios are distinct", async ({
  page,
}) => {
  await login(page);
  await scenario(page, "Información pendiente");
  await expect(page.getByTestId("week-2026-11-02")).toContainText(
    "Faltan datos",
  );
  await scenario(page, "Sobrecarga");
  await expect(page.getByTestId("week-2026-11-02")).toContainText(
    "Sobrecarga prevista",
  );
  await scenario(page, "Sin bloque compatible");
  await expect(page.getByTestId("week-2026-11-02")).toContainText(
    "Restricciones en conflicto",
  );
  await page.getByRole("button", { name: "Revisar", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("bloque continuo");
});
test("all main routes fit viewport without page-level horizontal overflow", async ({
  page,
}, info) => {
  await login(page);
  for (const path of [
    "/tablero",
    "/calendario",
    "/importar",
    "/disponibilidad",
    "/prioridades",
    "/ajustes",
  ]) {
    await route(page, path);
    await expect(page.locator("h1")).toBeVisible();
    const widths = await page.evaluate(() => ({
      body: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(widths.body, `${path} at ${info.project.name}`).toBeLessThanOrEqual(
      widths.viewport + 1,
    );
  }
  await route(page, "/tablero");
  await page.screenshot({
    path: `test-results/dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  await page.screenshot({ path: `.local/preview-${info.project.name}.png` });
  await page.screenshot({
    path: `.local/visual-refinement/tablero-${info.project.name}.png`,
    scale: "css",
  });
  await route(page, "/calendario");
  await page.screenshot({
    path: `.local/visual-refinement/calendario-${info.project.name}.png`,
    scale: "css",
  });
  await page
    .locator(
      info.project.name === "mobile" ? ".agenda-day" : ".calendar-block.study",
    )
    .first()
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: `.local/visual-refinement/sesiones-${info.project.name}.png`,
    scale: "css",
  });
  await route(page, "/importar");
  await page.getByRole("button", { name: "Excel · 5 PC + 2 exámenes" }).click();
  await expect(page.locator(".review-record")).toHaveCount(7);
  await page.screenshot({
    path: `.local/visual-refinement/importar-${info.project.name}.png`,
    scale: "css",
  });
  await page
    .locator(".review-record")
    .first()
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: `.local/visual-refinement/revision-${info.project.name}.png`,
    scale: "css",
  });
  for (const width of [320, 600, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/tablero", "/calendario", "/importar"]) {
      await route(page, path);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
    }
  }
});

test("moving a session fixes it, a new commitment conflicts, and undo revalidates", async ({
  page,
}) => {
  await login(page);
  await route(page, "/calendario/pc-calculo-1");
  await page.locator(".detail-session").first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revisar movimiento" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Mover y fijar" })
    .click();
  const pinned = (await state(page)).sessions.find((s: any) => s.fixed);
  expect(pinned).toBeTruthy();
  await route(page, "/calendario");
  await page
    .getByRole("button", { name: "Añadir compromiso", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nombre", { exact: true })
    .fill("Reunión nueva de ejemplo");
  await dialog.getByLabel("Fecha", { exact: true }).fill(pinned.date);
  const clock = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  await dialog
    .getByLabel("Hora inicial", { exact: true })
    .fill(clock(pinned.start));
  await dialog
    .getByLabel("Hora final", { exact: true })
    .fill(clock(pinned.end));
  await dialog.getByRole("button", { name: "Revisar impacto" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambios", exact: true })
    .click();
  let data = await state(page);
  expect(data.sessions.find((s: any) => s.id === pinned.id)).toEqual(pinned);
  expect(
    data.issues.some(
      (i: any) => i.kind === "conflict" && i.activityId === pinned.activityId,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("No se puede restaurar");
  await expect(
    page.getByRole("button", { name: "Restaurar distribución" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Conservar plan vigente" }).click();
  data = await state(page);
  expect(
    data.commitments.some((c: any) => c.title === "Reunión nueva de ejemplo"),
  ).toBe(true);
});
test("new source proposes an official date update without duplicates or silent replacement", async ({
  page,
}) => {
  await login(page);
  await route(page, "/importar");
  await page.getByRole("button", { name: "Versión con fecha nueva" }).click();
  await page
    .getByLabel("Resolver coincidencia fila 1", { exact: true })
    .selectOption("update");
  await page
    .getByRole("button", { name: "Confirmar seleccionadas (1)" })
    .click();
  expect(
    (await state(page)).activities.find((a: any) => a.id === "parcial-fisica")
      .date,
  ).toBe("2026-11-12");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar fecha nueva" })
    .click();
  const data = await state(page);
  expect(data.activities).toHaveLength(7);
  expect(data.activities.find((a: any) => a.id === "parcial-fisica").date).toBe(
    "2026-11-04",
  );
  expect(
    data.activities.find((a: any) => a.id === "parcial-fisica").dateHistory,
  ).toHaveLength(1);
});

test("unconfirmed form edits require a decision before navigation", async ({
  page,
}) => {
  await login(page);
  await route(page, "/calendario/pc-calculo-1");
  await page
    .getByRole("button", { name: "Editar datos o actualizar fecha" })
    .click();
  await page
    .getByLabel("Título de la actividad", { exact: true })
    .fill("Cambio que todavía no guardé");
  await page
    .getByRole("button", { name: "Cerrar detalle de actividad", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Tienes cambios sin confirmar",
  );
  await page.getByRole("button", { name: "Seguir editando" }).click();
  await expect(
    page.getByLabel("Título de la actividad", { exact: true }),
  ).toHaveValue("Cambio que todavía no guardé");
  await page
    .getByRole("button", { name: "Cerrar detalle de actividad", exact: true })
    .click();
  await page.getByRole("button", { name: "Descartar cambios y salir" }).click();
  await expect(page).toHaveURL(/#\/calendario$/);
  expect((await state(page)).activities[0].title).not.toBe(
    "Cambio que todavía no guardé",
  );
});

test("compact 320px layout, keyboard dialog escape, and cancellation keep the active plan", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 320, height: 740 });
  for (const path of ["/tablero", "/importar", "/disponibilidad", "/ajustes"]) {
    await route(page, path);
    await expect(page.locator(".page-heading h1")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(321);
  }
  const before = await state(page);
  await page
    .getByRole("button", { name: "Google Calendar simulado", exact: false })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).calendar).toBe(before.calendar);
});
