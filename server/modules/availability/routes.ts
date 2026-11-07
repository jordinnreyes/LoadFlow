import { PlanningState } from "../../../packages/contracts/index.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Type } from "@sinclair/typebox";
import {
  ErrorResponse,
  EntityIdParams,
  Id,
  strict,
} from "../../../packages/contracts/index.js";
import * as C from "../../../packages/contracts/availability.js";
import type { Identity } from "../identity/service.js";
import { SESSION_COOKIE } from "../identity/service.js";
import { header } from "../identity/routes.js";
import { AvailabilityService } from "./service.js";
import type { CalendarService } from "../calendar/service.js";
export async function availabilityRoutes(
  app: FastifyInstance,
  getIdentity: () => Identity,
  getCalendar: () => CalendarService,
) {
  const errors = {
    401: ErrorResponse,
    403: ErrorResponse,
    404: ErrorResponse,
    409: ErrorResponse,
    412: ErrorResponse,
    422: ErrorResponse,
    428: ErrorResponse,
    503: ErrorResponse,
  };
  const security = [{ sessionCookie: [] }];
  const auth = async (r: FastifyRequest, write = false) => {
    const identity = getIdentity();
    if (write) {
      identity.origin(r.headers.origin);
      identity.csrf(r.cookies[SESSION_COOKIE], header(r, "x-csrf-token"));
    }
    const session = await identity.authenticate(r.cookies[SESSION_COOKIE]);
    return {
      owner: session.ownerId,
      service: new AvailabilityService(identity.academics, () => getCalendar()),
    };
  };
  const id = (r: FastifyRequest) => (r.params as { id: string }).id;
  const save = async (
    reply: import("fastify").FastifyReply,
    result: { status: number; data: unknown; etag?: string },
  ) => {
    if (result.etag) reply.header("ETag", result.etag);
    return reply.code(result.status).send(result.data);
  };
  app.get(
    "/api/v1/periods/:id/availability",
    {
      schema: {
        operationId: "getAvailability",
        security,
        params: EntityIdParams,
        response: { 200: C.Availability, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await auth(r);
      const data = await service.get(owner, id(r));
      reply.header("ETag", `"availability-${data.revision}"`);
      return data;
    },
  );
  app.put(
    "/api/v1/periods/:id/availability",
    {
      schema: {
        operationId: "replaceAvailability",
        security,
        params: EntityIdParams,
        body: C.AvailabilityInput,
        response: { 200: C.Availability, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await auth(r, true);
      return save(
        reply,
        await service.save(
          owner,
          id(r),
          header(r, "idempotency-key"),
          header(r, "if-match"),
          r.body as C.AvailabilityConfig,
        ),
      );
    },
  );
  app.post(
    "/api/v1/periods/:id/availability/copy",
    {
      schema: {
        operationId: "copyStudyWindows",
        security,
        params: EntityIdParams,
        body: C.CopyWindows,
        response: { 200: C.Availability, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await auth(r, true);
      return save(
        reply,
        await service.copy(
          owner,
          id(r),
          header(r, "idempotency-key"),
          header(r, "if-match"),
          r.body as C.CopyInput,
        ),
      );
    },
  );
  app.get(
    "/api/v1/periods/:id/capacity",
    {
      schema: {
        operationId: "getCapacity",
        security,
        params: EntityIdParams,
        querystring: C.RangeQuery,
        response: { 200: C.Capacity, ...errors },
      },
    },
    async (r) => {
      const { owner, service } = await auth(r);
      const range = r.query as { from: string; to: string };
      return service.capacity(owner, id(r), range.from, range.to);
    },
  );
  app.get(
    "/api/v1/manual-commitments",
    {
      schema: {
        operationId: "listManualCommitments",
        security,
        querystring: C.CommitmentQuery,
        response: {
          200: Type.Object(
            {
              items: Type.Array(C.Commitment),
              nextCursor: Type.Union([Id, Type.Null()]),
            },
            strict,
          ),
          ...errors,
        },
      },
    },
    async (r) => {
      const { owner, service } = await auth(r);
      return service.listCommitments(
        owner,
        r.query as Parameters<AvailabilityService["listCommitments"]>[1],
      );
    },
  );
  app.post(
    "/api/v1/manual-commitments",
    {
      schema: {
        operationId: "createManualCommitment",
        security,
        body: C.CommitmentInput,
        response: { 201: C.Commitment, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await auth(r, true);
      return save(
        reply,
        await service.saveCommitment(
          owner,
          header(r, "idempotency-key"),
          r.body as C.CommitmentCreate,
        ),
      );
    },
  );
  app.patch(
    "/api/v1/manual-commitments/:id",
    {
      schema: {
        operationId: "updateManualCommitment",
        security,
        params: EntityIdParams,
        body: C.CommitmentPatch,
        response: { 200: C.Commitment, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await auth(r, true);
      return save(
        reply,
        await service.saveCommitment(
          owner,
          header(r, "idempotency-key"),
          r.body as C.CommitmentEdit,
          id(r),
          header(r, "if-match"),
        ),
      );
    },
  );
  app.delete(
    "/api/v1/manual-commitments/:id",
    {
      schema: {
        operationId: "deleteManualCommitment",
        security,
        params: EntityIdParams,
        response: {
          200: Type.Object(
            {
              deleted: Type.Literal(true),
              id: Id,
              planningState: PlanningState,
            },
            strict,
          ),
          ...errors,
        },
      },
    },
    async (r, reply) => {
      const { owner, service } = await auth(r, true);
      return save(
        reply,
        await service.deleteCommitment(
          owner,
          id(r),
          header(r, "idempotency-key"),
          header(r, "if-match"),
        ),
      );
    },
  );
}
