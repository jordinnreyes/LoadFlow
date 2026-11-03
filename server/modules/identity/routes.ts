import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Type } from "@sinclair/typebox";
import {
  EmailChallenge,
  EmailVerification,
  ErrorResponse,
  strict,
} from "../../../packages/contracts/index.js";
import { Profile } from "../../../packages/contracts/academics.js";
import { Identity, SESSION_COOKIE, OAUTH_COOKIE } from "./service.js";
const SessionResponse = Type.Object(
  {
    authenticated: Type.Literal(true),
    user: Profile,
    csrfToken: Type.String(),
  },
  strict,
);
const errors = {
  401: ErrorResponse,
  403: ErrorResponse,
  422: ErrorResponse,
  429: ErrorResponse,
  503: ErrorResponse,
};
const cookieOptions = {
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "lax" as const,
};
function issue(
  reply: FastifyReply,
  result: Awaited<ReturnType<Identity["issue"]>>,
) {
  reply.setCookie(SESSION_COOKIE, result.cookie, {
    ...cookieOptions,
    expires: new Date(result.expiresAt),
  });
  return {
    authenticated: true as const,
    user: result.user,
    csrfToken: result.csrfToken,
  };
}
export async function identityRoutes(
  app: FastifyInstance,
  getIdentity: () => Identity,
) {
  app.post<{ Body: { email: string; intent: "register" | "login" } }>(
    "/api/v1/auth/email/challenges",
    {
      schema: {
        operationId: "requestEmailCode",
        body: EmailChallenge,
        response: {
          202: Type.Object(
            {
              challengeId: Type.String({ format: "uuid" }),
              expiresAt: Type.String({ format: "date-time" }),
              message: Type.String(),
            },
            strict,
          ),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      const identity = getIdentity();
      identity.origin(request.headers.origin);
      return reply
        .code(202)
        .send(
          await identity.challenge(request.body.email, request.body.intent),
        );
    },
  );
  app.post<{ Body: { challengeId: string; code: string } }>(
    "/api/v1/auth/email/verify",
    {
      schema: {
        operationId: "verifyEmailCode",
        body: EmailVerification,
        response: { 200: SessionResponse, ...errors },
      },
    },
    async (request, reply) => {
      const identity = getIdentity();
      identity.origin(request.headers.origin);
      return issue(
        reply,
        await identity.verify(request.body.challengeId, request.body.code),
      );
    },
  );
  app.get(
    "/api/v1/auth/session",
    {
      schema: {
        operationId: "currentSession",
        response: { 200: SessionResponse, ...errors },
        security: [{ sessionCookie: [] }],
      },
    },
    async (request) => {
      const identity = getIdentity();
      const session = await identity.authenticate(
        request.cookies[SESSION_COOKIE],
      );
      return {
        authenticated: true as const,
        user: await identity.academics.profile(session.ownerId),
        csrfToken: session.csrfToken,
      };
    },
  );
  app.post(
    "/api/v1/auth/session/refresh",
    {
      schema: {
        operationId: "refreshSession",
        body: Type.Object({}, strict),
        response: { 200: SessionResponse, ...errors },
        security: [{ sessionCookie: [] }],
      },
    },
    async (request) => {
      const identity = getIdentity();
      identity.origin(request.headers.origin);
      identity.csrf(
        request.cookies[SESSION_COOKIE],
        header(request, "x-csrf-token"),
      );
      const session = await identity.authenticate(
        request.cookies[SESSION_COOKIE],
      );
      return {
        authenticated: true as const,
        user: await identity.academics.profile(session.ownerId),
        csrfToken: session.csrfToken,
      };
    },
  );
  app.post(
    "/api/v1/auth/logout",
    {
      schema: {
        operationId: "logout",
        body: Type.Object({}, strict),
        response: { 204: Type.Null(), ...errors },
        security: [{ sessionCookie: [] }],
      },
    },
    async (request, reply) => {
      const identity = getIdentity();
      identity.origin(request.headers.origin);
      identity.csrf(
        request.cookies[SESSION_COOKIE],
        header(request, "x-csrf-token"),
      );
      await identity.logout(request.cookies[SESSION_COOKIE]!);
      reply.clearCookie(SESSION_COOKIE, cookieOptions);
      return reply.code(204).send();
    },
  );
  app.get(
    "/api/v1/auth/google/start",
    {
      schema: {
        operationId: "startGoogleSignIn",
        response: { 503: ErrorResponse },
      },
    },
    async (_request, reply) => {
      const identity = getIdentity();
      const result = await identity.googleStart();
      reply.setCookie(OAUTH_COOKIE, result.state, {
        ...cookieOptions,
        maxAge: 600,
      });
      return reply.redirect(result.url);
    },
  );
  app.get<{
    Querystring: { code?: string; error?: string; error_description?: string };
  }>(
    "/api/v1/auth/google/callback",
    {
      schema: {
        operationId: "completeGoogleSignIn",
        querystring: Type.Object(
          {
            code: Type.Optional(Type.String({ minLength: 1, maxLength: 2048 })),
            error: Type.Optional(Type.String({ maxLength: 200 })),
            error_description: Type.Optional(Type.String({ maxLength: 1000 })),
          },
          strict,
        ),
        response: { 200: SessionResponse, ...errors },
      },
    },
    async (request, reply) => {
      const identity = getIdentity();
      reply.clearCookie(OAUTH_COOKIE, cookieOptions);
      const result = await identity.googleCallback(
        request.cookies[OAUTH_COOKIE],
        request.query.error ? undefined : request.query.code,
      );
      // Until F6 connects the web client, finish at the API with the same
      // verified-session contract as OTP instead of redirecting to an absent UI.
      return issue(reply, result);
    },
  );
}
export function header(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}
