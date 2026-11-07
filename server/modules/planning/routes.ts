import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import {
  EntityIdParams,
  ErrorResponse,
  Id,
  strict,
} from "../../../packages/contracts/index.js";
import * as C from "../../../packages/contracts/planning.js";
import type { Identity } from "../identity/service.js";
import { SESSION_COOKIE } from "../identity/service.js";
import { header } from "../identity/routes.js";
import type { PlanningService } from "./service.js";

const errors = {
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
const schema = <T extends object>(operationId: string, response: T) => ({
  operationId,
  security: [{ sessionCookie: [] }],
  params: EntityIdParams,
  response: { ...errors, ...response },
});
const id = (r: FastifyRequest) => (r.params as { id: string }).id;
const key = (r: FastifyRequest) => header(r, "idempotency-key");
const rev = (r: FastifyRequest) => header(r, "if-match");
const send = (
  reply: FastifyReply,
  result: { status: number; data: unknown; etag?: string },
) => {
  if (result.etag) reply.header("ETag", result.etag);
  return reply.code(result.status).send(result.data);
};

export async function planningRoutes(
  app: FastifyInstance,
  identity: () => Identity,
  planning: () => PlanningService,
) {
  async function owner(r: FastifyRequest, write = false) {
    const auth = identity();
    if (write) {
      auth.origin(r.headers.origin);
      auth.csrf(r.cookies[SESSION_COOKIE], header(r, "x-csrf-token"));
    }
    return (await auth.authenticate(r.cookies[SESSION_COOKIE])).ownerId;
  }
  app.get(
    "/api/v1/periods/:id/plan",
    { schema: schema("getStudyPlan", { 200: C.Plan }) },
    async (r, reply) => {
      const result = await planning().get(await owner(r), id(r));
      reply.header("ETag", `"workspace-${result.workspaceRevision}"`);
      return result;
    },
  );
  app.post(
    "/api/v1/periods/:id/planning-proposals",
    {
      schema: {
        ...schema("previewStudyPlan", { 201: C.Proposal }),
        body: C.Command,
      },
    },
    async (r, reply) =>
      send(
        reply,
        await planning().preview(
          await owner(r, true),
          id(r),
          key(r),
          rev(r),
          r.body as C.PlanningCommand,
        ),
      ),
  );
  app.get(
    "/api/v1/planning-proposals/:id",
    { schema: schema("getStudyPlanProposal", { 200: C.Proposal }) },
    async (r, reply) => {
      const result = await planning().getProposal(await owner(r), id(r));
      reply.header("ETag", `"workspace-${result.workspaceRevision}"`);
      return result;
    },
  );
  app.post(
    "/api/v1/planning-proposals/:id/apply",
    {
      schema: {
        ...schema("applyStudyPlanProposal", { 200: C.Plan }),
        body: C.Apply,
      },
    },
    async (r, reply) =>
      send(
        reply,
        await planning().apply(
          await owner(r, true),
          id(r),
          key(r),
          rev(r),
          r.body as C.ApplyInput,
        ),
      ),
  );
  app.get(
    "/api/v1/periods/:id/weekly-plan",
    {
      schema: {
        ...schema("getWeeklyStudyPlan", { 200: C.Weekly }),
        querystring: C.RangeQuery,
      },
    },
    async (r) => {
      const { from, to } = r.query as Static<typeof C.RangeQuery>;
      return planning().weekly(await owner(r), id(r), from, to);
    },
  );
  app.get(
    "/api/v1/activities/:id/group-reservations",
    { schema: schema("getGroupReservations", { 200: C.Group }) },
    async (r, reply) => {
      const result = await planning().getGroup(await owner(r), id(r));
      reply.header("ETag", `"activity-${result.activityRevision}"`);
      return result;
    },
  );
  app.put(
    "/api/v1/activities/:id/group-reservations",
    {
      schema: {
        ...schema("updateGroupReservations", { 200: C.Group }),
        body: C.GroupInput,
      },
    },
    async (r, reply) =>
      send(
        reply,
        await planning().saveGroup(
          await owner(r, true),
          id(r),
          key(r),
          rev(r),
          r.body as C.GroupSettings,
        ),
      ),
  );
  app.post(
    "/api/v1/activities/:id/group-equivalences",
    {
      schema: {
        ...schema("confirmGroupEquivalence", { 200: C.Group }),
        body: C.EquivalenceInput,
      },
    },
    async (r, reply) =>
      send(
        reply,
        await planning().equivalence(
          await owner(r, true),
          id(r),
          key(r),
          rev(r),
          r.body as C.Equivalence,
        ),
      ),
  );
  app.delete(
    "/api/v1/activities/:id/group-equivalences/:equivalenceId",
    {
      schema: {
        ...schema("removeGroupEquivalence", { 200: C.Group }),
        params: Type.Object({ id: Id, equivalenceId: Id }, strict),
      },
    },
    async (r, reply) =>
      send(
        reply,
        await planning().equivalence(
          await owner(r, true),
          id(r),
          key(r),
          rev(r),
          { removeId: (r.params as { equivalenceId: string }).equivalenceId },
        ),
      ),
  );
}
