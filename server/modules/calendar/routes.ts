import type { FastifyInstance, FastifyRequest } from "fastify";
import { Type } from "@sinclair/typebox";
import {
  ErrorResponse,
  EntityIdParams,
  strict,
} from "../../../packages/contracts/index.js";
import * as C from "../../../packages/contracts/calendar.js";
import { SESSION_COOKIE, type Identity } from "../identity/service.js";
import { browserNavigation, header } from "../identity/routes.js";
import { DomainError } from "../../errors.js";
import { CalendarService, CALENDAR_COOKIE } from "./service.js";
export async function calendarRoutes(
  app: FastifyInstance,
  getIdentity: () => Identity,
  getCalendar: () => CalendarService,
) {
  const security = [{ sessionCookie: [] }],
    errors = {
      400: ErrorResponse,
      401: ErrorResponse,
      403: ErrorResponse,
      404: ErrorResponse,
      409: ErrorResponse,
      412: ErrorResponse,
      422: ErrorResponse,
      428: ErrorResponse,
      429: ErrorResponse,
      503: ErrorResponse,
    };
  const auth = async (r: FastifyRequest, write = false) => {
    const i = getIdentity();
    if (write) {
      i.origin(r.headers.origin);
      i.csrf(r.cookies[SESSION_COOKIE], header(r, "x-csrf-token"));
    }
    return i.authenticate(r.cookies[SESSION_COOKIE]);
  };
  app.post(
    "/api/v1/calendar/authorization",
    {
      schema: {
        operationId: "authorizeCalendar",
        security,
        querystring: Type.Object(
          { eventTitles: Type.Optional(Type.Literal("true")) },
          strict,
        ),
        response: { 200: C.Authorization, ...errors },
      },
    },
    async (r, reply) => {
      const session = await auth(r, true);
      const titles =
        (r.query as { eventTitles?: "true" }).eventTitles === "true";
      const result = await getCalendar().authorize(session, titles);
      reply.setCookie(
        CALENDAR_COOKIE,
        titles ? `titles.${result.browser}` : result.browser,
        {
          secure: true,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 600,
        },
      );
      return result.data;
    },
  );
  app.get(
    "/api/v1/calendar/callback",
    {
      schema: {
        operationId: "completeCalendarAuthorization",
        security,
        querystring: Type.Object(
          {
            state: Type.Optional(Type.String({ maxLength: 200 })),
            code: Type.Optional(Type.String({ maxLength: 4096 })),
            error: Type.Optional(Type.String({ maxLength: 200 })),
            scope: Type.Optional(Type.String()),
            authuser: Type.Optional(Type.String()),
            prompt: Type.Optional(Type.String()),
          },
          { additionalProperties: true },
        ),
        response: { 200: C.Connection, 303: Type.Null(), ...errors },
      },
    },
    async (r, reply) => {
      const browser = r.cookies[CALENDAR_COOKIE];
      const titles = browser?.startsWith("titles.");
      const destination = titles ? "/#/calendario" : "/#/disponibilidad";
      try {
        const session = await auth(r);
        const connection = await getCalendar().callback(
          session,
          titles ? browser?.slice("titles.".length) : browser,
          r.query as { state?: string; code?: string; error?: string },
        );
        if (browserNavigation(r))
          return reply.redirect(
            new URL(
              `${destination}?calendar=connected`,
              getIdentity().config.origin,
            ).toString(),
            303,
          );
        return connection;
      } catch (error) {
        if (browserNavigation(r) && error instanceof DomainError)
          return reply.redirect(
            new URL(
              `${destination}?calendar=failed`,
              getIdentity().config.origin,
            ).toString(),
            303,
          );
        throw error;
      } finally {
        reply.clearCookie(CALENDAR_COOKIE, {
          secure: true,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
      }
    },
  );
  app.get(
    "/api/v1/calendar/connection",
    {
      schema: {
        operationId: "getCalendarConnection",
        security,
        response: { 200: C.Connection, ...errors },
      },
    },
    async (r, reply) => {
      const session = await auth(r),
        data = await getCalendar().getConnection(session.ownerId);
      reply.header("ETag", `"calendar-${data.revision}"`);
      return data;
    },
  );
  app.get(
    "/api/v1/calendar/calendars",
    {
      schema: {
        operationId: "listCalendarSources",
        security,
        response: {
          200: Type.Object(
            { items: Type.Array(C.Source), connection: C.Connection },
            strict,
          ),
          ...errors,
        },
      },
    },
    async (r) => {
      const s = await auth(r);
      return getCalendar().sources(s.ownerId);
    },
  );
  app.put(
    "/api/v1/calendar/selection",
    {
      schema: {
        operationId: "selectCalendarSources",
        security,
        body: C.Selection,
        response: { 200: C.Connection, ...errors },
      },
    },
    async (r, reply) => {
      const s = await auth(r, true),
        result = await getCalendar().selection(
          s.ownerId,
          header(r, "if-match"),
          header(r, "idempotency-key"),
          (r.body as { calendarIds: string[] }).calendarIds,
        );
      if (result.etag) reply.header("ETag", result.etag);
      return reply.code(result.status).send(result.data);
    },
  );
  app.post(
    "/api/v1/calendar/refresh",
    {
      schema: {
        operationId: "refreshCalendarBusy",
        security,
        body: C.Refresh,
        response: { 202: C.JobAccepted, ...errors },
      },
    },
    async (r, reply) => {
      const s = await auth(r, true),
        result = await getCalendar().refresh(
          s.ownerId,
          header(r, "idempotency-key"),
          r.body as C.RefreshInput,
        );
      return reply.code(result.status).send(result.data);
    },
  );
  app.delete(
    "/api/v1/calendar/connection",
    {
      schema: {
        operationId: "disconnectCalendar",
        security,
        response: {
          200: Type.Object(
            {
              connection: C.Connection,
              revocation: Type.Union(
                ["not_required", "pending", "confirmed", "unconfirmed"].map(
                  (x) => Type.Literal(x),
                ),
              ),
            },
            strict,
          ),
          ...errors,
        },
      },
    },
    async (r, reply) => {
      const s = await auth(r, true),
        result = await getCalendar().disconnect(
          s.ownerId,
          header(r, "if-match"),
          header(r, "idempotency-key"),
        );
      return reply.code(result.status).send(result.data);
    },
  );
  app.get(
    "/api/v1/calendar/busy",
    {
      schema: {
        operationId: "getCalendarBusy",
        security,
        querystring: C.BusyQuery,
        response: { 200: C.Busy, ...errors },
      },
    },
    async (r) => {
      const s = await auth(r),
        q = r.query as { from: string; to: string };
      return getCalendar().getBusy(s.ownerId, q.from, q.to);
    },
  );
  app.get(
    "/api/v1/calendar/events",
    {
      schema: {
        operationId: "listCalendarEvents",
        security,
        querystring: C.BusyQuery,
        response: { 200: C.Events, ...errors },
      },
    },
    async (r) => {
      const s = await auth(r);
      const q = r.query as { from: string; to: string };
      return getCalendar().events(s.ownerId, q.from, q.to);
    },
  );
  app.put(
    "/api/v1/calendar/event-titles",
    {
      schema: {
        operationId: "setCalendarEventTitleVisibility",
        security,
        body: C.EventTitleVisibility,
        response: { 200: C.Connection, ...errors },
      },
    },
    async (r) => {
      const s = await auth(r, true);
      const result = await getCalendar().setEventTitleVisibility(
        s.ownerId,
        header(r, "idempotency-key"),
        (r.body as { visible: boolean }).visible,
      );
      return result.data;
    },
  );
  app.get(
    "/api/v1/jobs/:id",
    {
      schema: {
        operationId: "getOwnJob",
        security,
        params: EntityIdParams,
        response: { 200: C.Job, ...errors },
      },
    },
    async (r) => {
      const s = await auth(r);
      return getCalendar().job(s.ownerId, (r.params as { id: string }).id);
    },
  );
}
