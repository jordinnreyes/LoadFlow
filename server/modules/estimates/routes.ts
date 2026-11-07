import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Static } from "@sinclair/typebox";
import {
  EntityIdParams,
  ErrorResponse,
} from "../../../packages/contracts/index.js";
import * as C from "../../../packages/contracts/estimates.js";
import { Activity } from "../../../packages/contracts/academics.js";
import { DomainError } from "../../errors.js";
import { Entitlements } from "../entitlements/service.js";
import { header } from "../identity/routes.js";
import { SESSION_COOKIE, type Identity } from "../identity/service.js";
import type { Estimates } from "./service.js";

const protocol = {
  security: [{ sessionCookie: [] }],
  response: {
    401: ErrorResponse,
    403: ErrorResponse,
    404: ErrorResponse,
    409: ErrorResponse,
    412: ErrorResponse,
    422: ErrorResponse,
    428: ErrorResponse,
    429: ErrorResponse,
    503: ErrorResponse,
  },
};
const id = (r: FastifyRequest) => (r.params as { id: string }).id;

export async function estimateRoutes(
  app: FastifyInstance,
  identity: () => Identity,
  estimates?: Estimates,
) {
  async function authorize(r: FastifyRequest, write = false) {
    const auth = identity();
    if (write) {
      auth.origin(r.headers.origin);
      auth.csrf(r.cookies[SESSION_COOKIE], header(r, "x-csrf-token"));
    }
    return {
      owner: (await auth.authenticate(r.cookies[SESSION_COOKIE])).ownerId,
      access: new Entitlements(auth.academics),
    };
  }
  function configured() {
    if (!estimates)
      throw new DomainError(
        503,
        "ESTIMATES_DISABLED",
        "Las estimaciones no están disponibles en este entorno. Puedes ingresar el esfuerzo manualmente.",
      );
    return estimates;
  }

  for (const { purpose, path, read, write } of [
    {
      purpose: "analysis",
      path: "/api/v1/me/estimate-consent",
      read: "getEstimateConsent",
      write: "setEstimateConsent",
    },
    {
      purpose: "personalization",
      path: "/api/v1/me/estimate-personalization-consent",
      read: "getEstimatePersonalizationConsent",
      write: "setEstimatePersonalizationConsent",
    },
  ] as const) {
    app.get(
      path,
      {
        schema: {
          ...protocol,
          operationId: read,
          response: { ...protocol.response, 200: C.Consent },
        },
      },
      async (r, reply) => {
        const { access, owner } = await authorize(r);
        const consent = await access.consent(owner, purpose);
        return reply
          .header("ETag", '"consent-' + consent.revision + '"')
          .send(consent);
      },
    );

    app.put(
      path,
      {
        schema: {
          ...protocol,
          operationId: write,
          body: C.ConsentInput,
          response: { ...protocol.response, 200: C.Consent },
        },
      },
      async (r, reply) => {
        const { access, owner } = await authorize(r, true);
        const input = r.body as Static<typeof C.ConsentInput>;
        const key = header(r, "idempotency-key");
        const consent = await access.changeConsent(
          owner,
          key,
          header(r, "if-match"),
          input.policyVersion,
          input.granted,
          purpose,
        );
        return reply
          .header("ETag", '"consent-' + consent.revision + '"')
          .send(consent);
      },
    );
  }

  app.post(
    "/api/v1/activities/:id/estimates",
    {
      schema: {
        ...protocol,
        operationId: "requestEstimate",
        params: EntityIdParams,
        body: C.EstimateInput,
        response: { ...protocol.response, 202: C.Estimate },
      },
    },
    async (r, reply) => {
      const { owner } = await authorize(r, true);
      const input = r.body as Static<typeof C.EstimateInput>;
      const result = await configured().request(
        owner,
        id(r),
        header(r, "idempotency-key"),
        header(r, "if-match"),
        input.excerpt,
        input.workloadSize,
      );
      return reply
        .header("Location", "/api/v1/estimates/" + result.id)
        .code(202)
        .send(result);
    },
  );

  app.get(
    "/api/v1/estimates/:id",
    {
      schema: {
        ...protocol,
        operationId: "getEstimate",
        params: EntityIdParams,
        response: { ...protocol.response, 200: C.Estimate },
      },
    },
    async (r) => {
      const { owner } = await authorize(r);
      return configured().get(owner, id(r));
    },
  );
  app.post(
    "/api/v1/estimates/:id/apply",
    {
      schema: {
        ...protocol,
        operationId: "applyEstimate",
        params: EntityIdParams,
        body: C.ConfirmEstimate,
        response: { ...protocol.response, 200: Activity },
      },
    },
    async (r, reply) => {
      const { owner } = await authorize(r, true);
      const result = await configured().confirm(
        owner,
        id(r),
        header(r, "idempotency-key"),
        header(r, "if-match"),
        r.body as C.ConfirmEstimate,
      );
      if (result.etag) reply.header("ETag", result.etag);
      return reply.code(result.status).send(result.data);
    },
  );
}
