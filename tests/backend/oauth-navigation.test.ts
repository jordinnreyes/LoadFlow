import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../../server/app.js";
import { DomainError } from "../../server/errors.js";
import type { Identity } from "../../server/modules/identity/service.js";
import type { CalendarService } from "../../server/modules/calendar/service.js";

test("OAuth browser returns to the configured app and JSON callers keep the API", async () => {
  const origin = "http://127.0.0.1:5173";
  const identity = {
    config: { origin },
    googleCallback: async (_state: string, code?: string) => {
      if (!code)
        throw new DomainError(401, "SESSION_REQUIRED", "Inicia sesión.");
      return {
        cookie: "browser-test-cookie",
        csrfToken: "csrf",
        expiresAt: "2030-01-01T00:00:00Z",
        user: {
          id: "b6a1a725-84d5-4d48-94f0-f92a74486d5a",
          displayName: "Fixture",
          studyTimezone: null,
          onboardingState: "seen",
          revision: 1,
        },
      };
    },
    authenticate: async () => ({ ownerId: "fixture" }),
  } as unknown as Identity;
  const calendar = {
    callback: async (
      _session: unknown,
      _cookie: unknown,
      query: { code?: string },
    ) => {
      if (!query.code)
        throw new DomainError(401, "CALENDAR_DENIED", "Permiso rechazado.");
      return {};
    },
  } as unknown as CalendarService;
  const app = await buildApp({ identity, calendar });
  try {
    const html = { accept: "text/html,application/xhtml+xml" };
    const google = "/api/v1/auth/google/callback";
    const result = await app.inject({
      url: `${google}?code=fixture-code`,
      headers: html,
    });
    assert.equal(result.statusCode, 303, result.body);
    assert.equal(result.headers.location, `${origin}/#/tablero`);
    assert.equal(result.headers["referrer-policy"], "no-referrer");
    assert.match(
      String(result.headers["set-cookie"]),
      /__Host-cw_session=.*HttpOnly/i,
    );
    assert.equal(result.body.includes("csrf"), false);
    const cancelled = await app.inject({
      url: `${google}?error=access_denied`,
      headers: html,
    });
    assert.equal(
      cancelled.headers.location,
      `${origin}/#/acceso?google=failed`,
    );
    const json = await app.inject({
      url: `${google}?code=fixture-code`,
      headers: { accept: "application/json" },
    });
    assert.equal(json.statusCode, 200);
    assert.equal(json.json().authenticated, true);
    const calendarPath = "/api/v1/calendar/callback";
    assert.equal(
      (
        await app.inject({
          url: `${calendarPath}?code=fixture-code`,
          headers: html,
        })
      ).headers.location,
      `${origin}/#/disponibilidad?calendar=connected`,
    );
    assert.equal(
      (
        await app.inject({
          url: `${calendarPath}?error=access_denied`,
          headers: html,
        })
      ).headers.location,
      `${origin}/#/disponibilidad?calendar=failed`,
    );
    const titles = {
      ...html,
      cookie: "__Host-cw_calendar_oauth=titles.fixture-browser",
    };
    assert.equal(
      (
        await app.inject({
          url: `${calendarPath}?code=fixture-code`,
          headers: titles,
        })
      ).headers.location,
      `${origin}/#/calendario?calendar=connected`,
    );
    assert.equal(
      (
        await app.inject({
          url: `${calendarPath}?error=access_denied`,
          headers: titles,
        })
      ).headers.location,
      `${origin}/#/calendario?calendar=failed`,
    );
  } finally {
    await app.close();
  }
});
