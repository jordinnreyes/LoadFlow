import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, plan = "Free") {
  await page.goto("/?modo=demo");
  if (plan === "Premium")
    await page.getByLabel("Perfil de ejemplo").selectOption("Premium");
  await page.getByRole("button", { name: "Continuar con Google" }).click();
  await expect(page.locator(".page-heading h1")).toHaveText(
    /Tu semana, (Alex|Valeria)\./,
  );
}
async function route(page: Page, path: string) {
  await page.goto(`/?modo=demo#${path}`);
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

test("dark by default, light survives reload and has the same week controls", async ({
  page,
}) => {
  await login(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await route(page, "/ajustes");
  await page.getByRole("button", { name: "Claro", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Claro", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await route(page, "/tablero");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".week-card")).toHaveCount(1);
  await expect(page.locator(".dashboard-stats")).toHaveCount(0);
});

test("connected access uses the HTTP contract and never loads the demo workspace", async ({
  page,
}) => {
  test.setTimeout(60_000);
  let signedIn = false;
  let calendarAuthorized = false;
  let calendarsFound = false;
  let calendarSelected = false;
  let occupancyRefreshed = false;
  let weekRefreshed = false;
  let eventTitlesEnabled = false;
  const calendarConnection = () => ({
    configured: true,
    state: !calendarAuthorized
      ? "not_connected"
      : weekRefreshed
        ? "connected"
        : "partial",
    selectedCount: calendarSelected ? 1 : 0,
    eventTitlesAuthorized: calendarAuthorized,
    eventTitlesEnabled,
    revision: calendarSelected ? 2 : 1,
    lastSuccessAt: occupancyRefreshed ? "2026-11-02T13:00:00Z" : null,
  });
  const user = {
    id: "test-user",
    displayName: "Cuenta de integración",
    studyTimezone: null as string | null,
    onboardingState: "new",
    revision: 1,
  };
  const session = { authenticated: true, user, csrfToken: "test-csrf" };
  let activity: {
    id: string;
    title: string;
    dueDate: string;
    type: string;
  } | null = null;
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/v1/auth/session") {
      if (signedIn)
        await route.fulfill({
          json: session,
          headers: { date: "Thu, 05 Nov 2026 13:00:00 GMT" },
        });
      else
        await route.fulfill({
          status: 401,
          json: {
            error: {
              code: "SESSION_REQUIRED",
              message: "Inicia sesión.",
              fieldErrors: [],
              requestId: "test",
              retryable: false,
            },
          },
        });
    } else if (path === "/api/v1/auth/email/challenges") {
      expect(route.request().postDataJSON()).toEqual({
        email: "f6@fixture.test",
        intent: "register",
      });
      await route.fulfill({
        status: 202,
        json: {
          challengeId: "test-challenge",
          expiresAt: "2030-01-01T00:00:00Z",
          message: "Revisa tu correo.",
        },
      });
    } else if (path === "/api/v1/auth/email/verify") {
      expect(route.request().postDataJSON()).toEqual({
        challengeId: "test-challenge",
        code: "123456",
      });
      signedIn = true;
      await route.fulfill({ json: session });
    } else if (path === "/api/v1/me/capabilities") {
      await route.fulfill({ json: { plan: "Free" } });
    } else if (path === "/api/v1/me/preferences") {
      expect(route.request().headers()["if-match"]).toBe(
        `"profile-${user.revision}"`,
      );
      const update = route.request().postDataJSON();
      if (user.onboardingState === "new") {
        expect(update).toEqual({ onboardingState: "seen" });
        user.onboardingState = "seen";
      } else {
        expect(update).toEqual({ studyTimezone: "America/Lima" });
        user.studyTimezone = update.studyTimezone;
      }
      user.revision += 1;
      await route.fulfill({ json: user });
    } else if (path === "/api/v1/periods") {
      await route.fulfill({
        json: {
          items: [{ id: "test-period", name: "Periodo desde API" }],
          nextCursor: null,
        },
      });
    } else if (path === "/api/v1/periods/test-period/weekly-plan") {
      await route.fulfill({
        json: {
          weeks: [
            {
              startDate: "2026-11-02",
              endDate: "2026-11-09",
              state: activity ? "partial" : "empty",
              days: [],
              deadlineActivityIds: activity ? [activity.id] : [],
              sessions: [],
              studyMinutes: 0,
              groupMinutes: 0,
              capacityMinutes: null,
              unplacedMinutes: null,
            },
          ],
        },
      });
    } else if (path === "/api/v1/periods/test-period/availability") {
      await route.fulfill({ json: { configuration: null, revision: 0 } });
    } else if (path === "/api/v1/manual-commitments") {
      await route.fulfill({ json: { items: [], nextCursor: null } });
    } else if (path === "/api/v1/calendar/connection") {
      await route.fulfill({
        json: calendarConnection(),
        headers: { etag: `"calendar-${calendarConnection().revision}"` },
      });
    } else if (path === "/api/v1/calendar/authorization") {
      expect(url.searchParams.has("eventTitles")).toBe(false);
      calendarAuthorized = true;
      await route.fulfill({
        json: {
          authorizationUrl: new URL("/#/disponibilidad?calendar=connected", url)
            .href,
        },
      });
    } else if (path === "/api/v1/calendar/event-titles") {
      expect(route.request().method()).toBe("PUT");
      const { visible } = route.request().postDataJSON();
      expect(visible).toBe(!eventTitlesEnabled);
      eventTitlesEnabled = visible;
      await route.fulfill({ json: calendarConnection() });
    } else if (path === "/api/v1/calendar/events") {
      expect(eventTitlesEnabled).toBe(true);
      expect(url.searchParams.get("from")).toBe("2026-11-02T05:00:00.000Z");
      expect(url.searchParams.get("to")).toBe("2026-11-09T05:00:00.000Z");
      await route.fulfill({
        json: {
          partial: false,
          items: [
            {
              title: "Clase de Bases de Datos",
              startAt: "2026-11-02T14:00:00Z",
              endAt: "2026-11-02T15:00:00Z",
              allDay: false,
              blocksTime: true,
            },
            {
              title: "Consulta opcional",
              startAt: "2026-11-02T14:30:00Z",
              endAt: "2026-11-02T15:30:00Z",
              allDay: false,
              blocksTime: false,
            },
          ],
        },
      });
    } else if (path === "/api/v1/calendar/calendars") {
      await route.fulfill({
        json: {
          items: calendarsFound
            ? [
                {
                  id: "test-calendar",
                  name: "Calendario de prueba",
                  accessible: true,
                  selected: calendarSelected,
                },
              ]
            : [],
        },
      });
    } else if (path === "/api/v1/calendar/selection") {
      expect(route.request().headers()["if-match"]).toBe('"calendar-1"');
      expect(route.request().postDataJSON()).toEqual({
        calendarIds: ["test-calendar"],
      });
      calendarSelected = true;
      await route.fulfill({ json: calendarConnection() });
    } else if (path === "/api/v1/calendar/refresh") {
      const input = route.request().postDataJSON();
      expect(input).toEqual({
        periodId: "test-period",
        reason: "manual",
        ...(input.weekStart && { weekStart: "2026-11-02" }),
        ...(calendarSelected &&
          !input.weekStart && { includeCurrentWeek: true }),
      });
      await route.fulfill({
        status: 202,
        json: {
          job: {
            id: input.weekStart
              ? "week-job"
              : calendarSelected
                ? "refresh-job"
                : "discover-job",
          },
        },
      });
    } else if (path === "/api/v1/jobs/discover-job") {
      calendarsFound = true;
      await route.fulfill({ json: { status: "partial" } });
    } else if (path === "/api/v1/jobs/refresh-job") {
      occupancyRefreshed = true;
      await route.fulfill({ json: { status: "partial" } });
    } else if (path === "/api/v1/jobs/week-job") {
      weekRefreshed = true;
      await route.fulfill({ json: { status: "succeeded" } });
    } else if (path === "/api/v1/calendar/busy") {
      expect(url.searchParams.get("from")).toBe("2026-11-02T05:00:00.000Z");
      expect(url.searchParams.get("to")).toBe("2026-11-09T05:00:00.000Z");
      await route.fulfill({
        json: {
          connection: calendarConnection(),
          coverage: weekRefreshed
            ? "complete"
            : occupancyRefreshed
              ? "partial"
              : "unknown",
          lastFetchedAt: calendarConnection().lastSuccessAt,
          busy: [
            ...(occupancyRefreshed
              ? [
                  {
                    startAt: "2026-11-06T04:30:00Z",
                    endAt: "2026-11-06T05:30:00Z",
                  },
                ]
              : []),
            ...(weekRefreshed
              ? [
                  {
                    startAt: "2026-11-02T14:00:00Z",
                    endAt: "2026-11-02T15:00:00Z",
                  },
                  {
                    startAt: "2026-11-02T18:00:00Z",
                    endAt: "2026-11-02T20:00:00Z",
                  },
                  {
                    startAt: "2026-11-08T20:00:00Z",
                    endAt: "2026-11-08T21:00:00Z",
                  },
                ]
              : []),
          ],
        },
      });
    } else if (path === "/api/v1/periods/test-period/plan") {
      await route.fulfill({
        json: { state: "not_generated", result: null },
        headers: { etag: '"workspace-1"' },
      });
    } else if (path === "/api/v1/periods/test-period/courses") {
      await route.fulfill({ json: { items: [], nextCursor: null } });
    } else if (
      path === "/api/v1/activities" &&
      route.request().method() === "POST"
    ) {
      expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
      expect(route.request().headers()["idempotency-key"]).toBeTruthy();
      activity = {
        id: "own-activity",
        ...route.request().postDataJSON(),
        revision: 1,
        pendingMinutes: null,
        operatingMinutes: null,
        realTotalMinutes: null,
      };
      await route.fulfill({ status: 201, json: activity });
    } else if (path === "/api/v1/activities") {
      await route.fulfill({
        json: { items: activity ? [activity] : [], nextCursor: null },
      });
    } else if (path === "/api/v1/activities/own-activity") {
      await route.fulfill({ json: activity });
    } else if (path === "/api/v1/auth/logout") {
      expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
      signedIn = false;
      await route.fulfill({ status: 204 });
    } else {
      await route.abort();
    }
  });
  await page.goto("/#/tablero");
  await expect(page).toHaveURL(/#\/acceso$/);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await page.getByLabel("Correo electrónico").fill("f6@fixture.test");
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de verificación").fill("123456");
  await page.getByRole("button", { name: "Verificar código" }).click();
  await page.getByRole("button", { name: "Ahora no" }).click();
  await expect(
    page.getByText("Sin actividades ni sesiones esta semana.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("loadflow-prototype-v1")),
  ).toBeNull();
  await page.getByRole("link", { name: "Calendario", exact: true }).click();
  await page
    .getByRole("link", { name: "Disponibilidad y Calendar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Conectar Google Calendar", exact: true })
    .click();
  await expect(page).toHaveURL(/calendar=connected$/);
  await page.getByRole("checkbox", { name: "Calendario de prueba" }).check();
  await page
    .getByLabel("Zona de estudio", { exact: true })
    .fill("America/Lima");
  await page.getByRole("button", { name: "Guardar y sincronizar" }).click();
  await expect(
    page.getByText("Google devolvió cobertura parcial.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Calendario", exact: true }).click();
  const weekCalendar = page.getByRole("region", {
    name: "Semana del calendario",
  });
  await expect(
    weekCalendar.getByText("Ocupado · Google Calendar", { exact: true }),
  ).toHaveCount(2);
  await expect(weekCalendar.getByText("23:30–24:00")).toBeVisible();
  await expect(weekCalendar.getByText("00:00–00:30")).toBeVisible();
  await expect(
    page.getByText("Cobertura de Google Calendar incompleta"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Actualizar esta semana" }).click();
  await expect(weekCalendar.getByText("09:00–10:00")).toBeVisible();
  await expect(weekCalendar.getByText("15:00–16:00")).toBeVisible();
  await expect(weekCalendar.getByText("00:00", { exact: true })).toBeVisible();
  await expect(weekCalendar.getByText("24:00", { exact: true })).toBeVisible();
  const monday = weekCalendar.getByRole("group", { name: "Lun 02" });
  const positions = await monday
    .locator(".connected-calendar-entry")
    .evaluateAll((entries) =>
      entries.map((entry) => {
        const block = entry.getBoundingClientRect();
        const day = entry.parentElement!.getBoundingClientRect();
        return {
          hour: ((block.top - day.top) / day.height) * 24,
          duration: (block.height / day.height) * 24,
        };
      }),
    );
  expect(positions).toHaveLength(2);
  expect(positions[0].hour).toBeCloseTo(9, 1);
  expect(positions[0].duration).toBeCloseTo(1, 1);
  expect(positions[1].hour).toBeCloseTo(13, 1);
  expect(positions[1].duration).toBeCloseTo(2, 1);
  await expect(
    page.getByText("Cobertura de Google Calendar incompleta"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Ocupación de Google Calendar" })
      .getByText("Ocupado · Google Calendar", { exact: true }),
  ).toHaveCount(5);
  await page.getByRole("button", { name: "Semana", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Mostrar títulos de Google Calendar",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Ocultar títulos de Google Calendar",
      exact: true,
    }),
  ).toBeVisible();
  await expect(weekCalendar.getByText("Clase de Bases de Datos")).toBeVisible();
  const overlap = await monday
    .locator(".connected-calendar-entry")
    .evaluateAll((entries) =>
      entries.slice(0, 2).map((entry) => {
        const { left, right } = entry.getBoundingClientRect();
        return { left, right };
      }),
    );
  expect(overlap[0].right).toBeLessThan(overlap[1].left);
  await expect(
    weekCalendar.getByText("Ocupado · Google Calendar", { exact: true }),
  ).toHaveCount(4);
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Ocupación de Google Calendar" })
      .getByText("Clase de Bases de Datos"),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Ocultar títulos de Google Calendar",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Mostrar títulos de Google Calendar",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Semana", exact: true }).click();
  await expect(
    weekCalendar.getByText("Ocupado · Google Calendar", { exact: true }),
  ).toHaveCount(5);
  await expect(weekCalendar.getByText("Clase de Bases de Datos")).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Tablero", exact: true }).click();
  await page
    .getByRole("link", { name: "Añadir actividad", exact: true })
    .click();
  await page.getByLabel("Título de la actividad").fill("Obligación propia");
  await page.getByLabel("Fecha límite").fill("2026-11-05");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Obligación propia" }),
  ).toBeVisible();
  await page.goto("/#/tablero");
  await page.reload();
  await expect(
    page.getByRole("link", { name: /Obligación propia/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ajustes", exact: true }).click();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/acceso$/);
  await expect(page.getByText("Periodo desde API")).toHaveCount(0);
});

test("first registration, optional Calendar, empty state and session continuity", async ({
  page,
}) => {
  await page.goto("/?modo=demo");
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
  await expect(page.locator(".page-heading h1")).toContainText("Tu semana,");
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
  await expect(page.locator(".week-card")).toHaveCount(1);
  for (let step = 0; step < 4; step++) {
    await page.getByRole("button", { name: "Semana siguiente" }).click();
  }
  await expect(page.getByTestId("week-2026-11-30")).toContainText(
    "Trabajo adelantado",
  );
  await expect(page.getByTestId("week-2026-11-02")).toHaveCount(0);
  await page.getByRole("button", { name: "Esta semana", exact: true }).click();
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
  baseURL,
}) => {
  const outgoing: string[] = [];
  const origin = new URL(baseURL!).origin;
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.origin !== origin && url.protocol !== "data:")
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
  await page.getByLabel(/Permitir el uso de mi historial ficticio/).check();
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
