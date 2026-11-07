import Fastify, { type FastifyError } from "fastify";
import swagger from "@fastify/swagger";
import cookie from "@fastify/cookie";
import {
  ErrorResponse,
  Health,
  EmailChallenge,
  EmailVerification,
} from "../packages/contracts/index.js";
import { DomainError } from "./errors.js";
import { assertRuntime } from "./config.js";
import { identityRoutes } from "./modules/identity/routes.js";
import type { Identity } from "./modules/identity/service.js";
import { academicsRoutes } from "./modules/academics/routes.js";
import { availabilityRoutes } from "./modules/availability/routes.js";
import { CalendarService } from "./modules/calendar/service.js";
import { calendarRoutes } from "./modules/calendar/routes.js";
import { importsRoutes } from "./modules/imports/routes.js";
import type { ImportService } from "./modules/imports/service.js";
import { PlanningService } from "./modules/planning/service.js";
import { planningRoutes } from "./modules/planning/routes.js";
import { documentProtocol } from "./openapi.js";

export async function buildApp(
  options: {
    ready?: () => Promise<void>;
    logger?: boolean;
    identity?: Identity;
    calendar?: CalendarService;
    imports?: ImportService;
    planning?: PlanningService;
  } = {},
) {
  assertRuntime();
  const app = Fastify({
    logger: options.logger
      ? {
          redact: [
            "req.headers.authorization",
            "req.headers.cookie",
            'res.headers["set-cookie"]',
            "req.body",
          ],
          serializers: {
            req: (req) => ({ method: req.method, url: req.url?.split("?")[0] }),
          },
        }
      : false,
    bodyLimit: 64 * 1024,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  await app.register(cookie);
  await app.register(swagger, {
    transformObject: documentProtocol,
    openapi: {
      openapi: "3.1.0",
      info: { title: "CargaWise API", version: "0.1.0" },
      servers: [{ url: "/" }],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "__Host-cw_session",
          },
          mobileBearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
  });
  app.addSchema(EmailChallenge);
  app.addSchema(EmailVerification);
  app.setErrorHandler((caught, request, reply) => {
    const error = caught as FastifyError;
    const domain = error instanceof DomainError;
    const invalid = !!error.validation;
    const status = domain
      ? error.status
      : invalid
        ? 422
        : [400, 413, 415, 429].includes(error.statusCode ?? 0)
          ? error.statusCode!
          : 500;
    if (status === 500)
      request.log.error(
        { requestId: request.id, code: "INTERNAL_ERROR" },
        "Request failed",
      );
    reply.status(status).send({
      error: {
        code: domain
          ? error.code
          : invalid
            ? "VALIDATION_ERROR"
            : status === 400
              ? "MALFORMED_JSON"
              : status === 413
                ? "PAYLOAD_TOO_LARGE"
                : status === 415
                  ? "UNSUPPORTED_MEDIA_TYPE"
                  : status === 429
                    ? "REQUEST_LIMITED"
                    : "INTERNAL_ERROR",
        message: domain
          ? error.message
          : invalid
            ? "Revisa los campos indicados."
            : status === 400
              ? "El cuerpo JSON no es válido."
              : status === 413
                ? "La solicitud supera el límite técnico permitido."
                : status === 415
                  ? "Envía un cuerpo JSON compatible."
                  : status === 429
                    ? "Espera antes de reintentar."
                    : "No pudimos completar la operación.",
        fieldErrors: invalid
          ? error.validation!.map((v) => ({
              field: v.instancePath || "/",
              message: v.message ?? "Valor inválido",
            }))
          : [],
        requestId: request.id,
        retryable: status >= 500,
      },
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: "No encontramos este recurso.",
        fieldErrors: [],
        requestId: request.id,
        retryable: false,
      },
    }),
  );
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
  });
  app.get(
    "/api/v1/health/live",
    { schema: { operationId: "liveness", response: { 200: Health } } },
    async () => ({ status: "ok" as const }),
  );
  app.get(
    "/api/v1/health/ready",
    {
      schema: {
        operationId: "readiness",
        response: { 200: Health, 503: ErrorResponse },
      },
    },
    async () => {
      try {
        if (!options.ready) throw new Error("DB absent");
        await options.ready();
      } catch {
        throw new DomainError(
          503,
          "DEPENDENCY_UNAVAILABLE",
          "La persistencia no está disponible.",
        );
      }
      return { status: "ok" as const };
    },
  );
  const getIdentity = () => {
    if (!options.identity)
      throw new DomainError(
        503,
        "AUTH_UNAVAILABLE",
        "Configura la identidad local antes de usar la API.",
      );
    return options.identity;
  };
  await identityRoutes(app, getIdentity);
  await academicsRoutes(app, getIdentity);
  const getCalendar = () =>
    options.calendar ?? new CalendarService(getIdentity());
  await availabilityRoutes(app, getIdentity, getCalendar);
  await calendarRoutes(app, getIdentity, getCalendar);
  let planning = options.planning;
  await planningRoutes(
    app,
    getIdentity,
    () => (planning ??= new PlanningService(getIdentity(), getCalendar())),
  );
  await app.register((scope, _options, done) => {
    importsRoutes(scope, getIdentity, () => options.imports).then(
      () => done(),
      done,
    );
  });
  app.get("/api/v1/openapi.json", { schema: { hide: true } }, async () =>
    app.swagger(),
  );
  return app;
}
