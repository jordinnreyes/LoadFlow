import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import {
  ActivityType,
  ErrorResponse,
  Id,
  EntityIdParams,
  strict,
} from "../../../packages/contracts/index.js";
import * as C from "../../../packages/contracts/academics.js";
import type { Identity } from "../identity/service.js";
import { SESSION_COOKIE } from "../identity/service.js";
import { header } from "../identity/routes.js";
import { DomainError } from "../../errors.js";
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
const privateSchema = { security: [{ sessionCookie: [] }] };
const body = <T>(r: FastifyRequest) => r.body as T;
const params = (r: FastifyRequest) => r.params as { id: string; type?: string };
const query = <T>(r: FastifyRequest) => r.query as T;
function send(
  reply: FastifyReply,
  result: { status: number; data: unknown; etag?: string },
) {
  if (result.etag) reply.header("ETag", result.etag);
  return reply.code(result.status).send(result.data);
}
const Snapshot = Type.Object(
  {
    dueDate: CivilDate(),
    dueTime: Type.Union([Type.String(), Type.Null()]),
    timezone: C.NullableText,
    evaluationEndAt: C.NullableInstant,
  },
  strict,
);
function CivilDate() {
  return Type.String({ format: "date" });
}
const Proposal = Type.Object(
  {
    id: Id,
    activityId: Id,
    baseWorkspaceRevision: Type.Integer({ minimum: 1 }),
    before: Snapshot,
    after: Snapshot,
    source: Type.Object(
      {
        kind: Type.Literal("manual"),
        description: Type.Optional(Type.String()),
      },
      strict,
    ),
    state: Type.String(),
    applied: Type.Boolean(),
    planningState: Type.Literal("not_generated"),
  },
  strict,
);
const ProgressSnapshot = Type.Object(
  {
    realTotalMinutes: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    remainingMinutes: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    preparationState: C.Preparation,
    fulfillmentState: C.Fulfillment,
    effectiveCompletionDate: C.NullableDate,
  },
  strict,
);
const ProgressHistory = Type.Object(
  {
    items: Type.Array(
      Type.Object(
        {
          id: Id,
          activityRevision: Type.Integer(),
          before: ProgressSnapshot,
          after: ProgressSnapshot,
          recordedAt: C.Instant,
        },
        strict,
      ),
    ),
    nextCursor: Type.Union([Id, Type.Null()]),
  },
  strict,
);
const DateHistory = Type.Object(
  {
    items: Type.Array(
      Type.Object(
        {
          id: Id,
          activityRevision: Type.Integer(),
          before: Snapshot,
          after: Snapshot,
          source: Type.Object(
            {
              kind: Type.Literal("manual"),
              description: Type.Optional(Type.String()),
            },
            strict,
          ),
          recordedAt: C.Instant,
        },
        strict,
      ),
    ),
    nextCursor: Type.Union([Id, Type.Null()]),
  },
  strict,
);

export async function academicsRoutes(
  app: FastifyInstance,
  getIdentity: () => Identity,
) {
  const authorize = async (r: FastifyRequest, write = false) => {
    const identity = getIdentity();
    if (write) {
      identity.origin(r.headers.origin);
      identity.csrf(r.cookies[SESSION_COOKIE], header(r, "x-csrf-token"));
    }
    const session = await identity.authenticate(r.cookies[SESSION_COOKIE]);
    return { owner: session.ownerId, service: identity.academics };
  };
  const key = (r: FastifyRequest) => header(r, "idempotency-key");
  const version = (r: FastifyRequest) => header(r, "if-match");
  app.get(
    "/api/v1/me",
    {
      schema: {
        ...privateSchema,
        operationId: "getProfile",
        response: { 200: C.Profile, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r);
      const p = await service.profile(owner);
      reply.header("ETag", `"profile-${p.revision}"`);
      return p;
    },
  );
  app.patch(
    "/api/v1/me/preferences",
    {
      schema: {
        ...privateSchema,
        operationId: "updateProfile",
        body: C.ProfilePatch,
        response: { 200: C.Profile, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.patchProfile(
          owner,
          key(r),
          version(r),
          body<Static<typeof C.ProfilePatch>>(r),
        ),
      );
    },
  );
  app.get(
    "/api/v1/me/capabilities",
    {
      schema: {
        ...privateSchema,
        operationId: "getCapabilities",
        response: {
          200: Type.Object(
            {
              plan: Type.Literal("Free"),
              manualEstimates: Type.Literal(true),
              realTimeTracking: Type.Literal(true),
              aiEstimates: Type.Literal(false),
              planningImplementation: Type.Literal("phase4"),
            },
            strict,
          ),
          ...errors,
        },
      },
    },
    async (r) => {
      await authorize(r);
      return {
        plan: "Free",
        manualEstimates: true,
        realTimeTracking: true,
        aiEstimates: false,
        planningImplementation: "phase4",
      };
    },
  );
  app.get(
    "/api/v1/periods",
    {
      schema: {
        ...privateSchema,
        operationId: "listPeriods",
        querystring: C.PageQuery,
        response: { 200: C.pageOf(C.Period), ...errors },
      },
    },
    async (r) => {
      const { owner, service } = await authorize(r);
      return service.listPeriods(owner, query(r));
    },
  );
  app.post(
    "/api/v1/periods",
    {
      schema: {
        ...privateSchema,
        operationId: "createPeriod",
        body: C.PeriodInput,
        response: { 201: C.Period, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.savePeriod(
          owner,
          key(r),
          body<Static<typeof C.PeriodInput>>(r),
        ),
      );
    },
  );
  app.patch(
    "/api/v1/periods/:id",
    {
      schema: {
        ...privateSchema,
        operationId: "updatePeriod",
        params: EntityIdParams,
        body: C.PeriodPatch,
        response: { 200: C.Period, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.savePeriod(
          owner,
          key(r),
          body<Static<typeof C.PeriodPatch>>(r),
          params(r).id,
          version(r),
        ),
      );
    },
  );
  app.get(
    "/api/v1/periods/:id/courses",
    {
      schema: {
        ...privateSchema,
        operationId: "listCourses",
        params: EntityIdParams,
        querystring: C.PageQuery,
        response: { 200: C.pageOf(C.Course), ...errors },
      },
    },
    async (r) => {
      const { owner, service } = await authorize(r);
      return service.listCourses(owner, params(r).id, query(r));
    },
  );
  app.post(
    "/api/v1/periods/:id/courses",
    {
      schema: {
        ...privateSchema,
        operationId: "createCourse",
        params: EntityIdParams,
        body: C.CourseInput,
        response: { 201: C.Course, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.saveCourse(owner, key(r), body(r), params(r).id),
      );
    },
  );
  app.patch(
    "/api/v1/courses/:id",
    {
      schema: {
        ...privateSchema,
        operationId: "updateCourse",
        params: EntityIdParams,
        body: C.CourseInput,
        response: { 200: C.Course, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.saveCourse(
          owner,
          key(r),
          body(r),
          undefined,
          params(r).id,
          version(r),
        ),
      );
    },
  );
  const PriorityParams = Type.Object({ id: Id, type: ActivityType }, strict);
  const PriorityList = Type.Object(
    {
      course: C.Course,
      rules: Type.Array(
        Type.Object({ type: ActivityType, priority: Type.String() }, strict),
      ),
    },
    strict,
  );
  app.get(
    "/api/v1/courses/:id/priorities",
    {
      schema: {
        ...privateSchema,
        operationId: "listBasePriorities",
        params: EntityIdParams,
        response: { 200: PriorityList, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r);
      const result = await service.listPriorities(owner, params(r).id);
      reply.header("ETag", `"course-${result.course.revision}"`);
      return result;
    },
  );
  app.put(
    "/api/v1/courses/:id/priorities/:type",
    {
      schema: {
        ...privateSchema,
        operationId: "setBasePriority",
        params: PriorityParams,
        body: C.BasePriorityInput,
        response: { 200: C.Course, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.saveBasePriority(
          owner,
          key(r),
          params(r).id,
          params(r).type!,
          body<{ priority: string }>(r).priority,
          version(r),
        ),
      );
    },
  );
  app.delete(
    "/api/v1/courses/:id/priorities/:type",
    {
      schema: {
        ...privateSchema,
        operationId: "clearBasePriority",
        params: PriorityParams,
        response: { 200: C.Course, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.saveBasePriority(
          owner,
          key(r),
          params(r).id,
          params(r).type!,
          null,
          version(r),
        ),
      );
    },
  );
  app.get(
    "/api/v1/activities",
    {
      schema: {
        ...privateSchema,
        operationId: "listActivities",
        querystring: C.ActivityQuery,
        response: { 200: C.pageOf(C.Activity), ...errors },
      },
    },
    async (r) => {
      const { owner, service } = await authorize(r);
      return service.listActivities(owner, query(r));
    },
  );
  app.post(
    "/api/v1/activities",
    {
      schema: {
        ...privateSchema,
        operationId: "createActivity",
        body: C.ActivityInput,
        response: { 201: C.Activity, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.saveActivity(owner, key(r), body<C.CreateActivity>(r)),
      );
    },
  );
  app.get(
    "/api/v1/activities/:id",
    {
      schema: {
        ...privateSchema,
        operationId: "getActivity",
        params: EntityIdParams,
        response: { 200: C.Activity, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r);
      const a = await service.getActivity(owner, params(r).id);
      reply.header("ETag", `"activity-${a.revision}"`);
      return a;
    },
  );
  app.patch(
    "/api/v1/activities/:id",
    {
      schema: {
        ...privateSchema,
        operationId: "updateActivity",
        params: EntityIdParams,
        body: C.ActivityPatch,
        response: { 200: C.Activity, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.saveActivity(
          owner,
          key(r),
          body<C.EditActivity>(r),
          params(r).id,
          version(r),
        ),
      );
    },
  );
  app.put(
    "/api/v1/activities/:id/constraints",
    {
      schema: {
        ...privateSchema,
        operationId: "updateActivityConstraints",
        params: EntityIdParams,
        body: C.ConstraintInput,
        response: { 200: C.Activity, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.saveConstraints(
          owner,
          key(r),
          params(r).id,
          body(r),
          version(r),
        ),
      );
    },
  );
  app.put(
    "/api/v1/activities/:id/priority",
    {
      schema: {
        ...privateSchema,
        operationId: "updateActivityPriority",
        params: EntityIdParams,
        body: C.ActivityPriorityInput,
        response: { 200: C.Activity, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      const input = body<Static<typeof C.ActivityPriorityInput>>(r);
      if (input.mode !== "override" && input.priority != null)
        throw new DomainError(
          422,
          "INVALID_PRIORITY",
          "La herencia no debe imponer una excepción.",
        );
      return send(
        reply,
        await service.saveActivity(
          owner,
          key(r),
          {
            priorityMode: input.mode,
            priorityOverride:
              input.mode === "override" ? (input.priority ?? null) : null,
          },
          params(r).id,
          version(r),
        ),
      );
    },
  );
  app.get(
    "/api/v1/activities/:id/progress",
    {
      schema: {
        ...privateSchema,
        operationId: "getProgress",
        params: EntityIdParams,
        response: { 200: C.Activity, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r);
      const a = await service.getActivity(owner, params(r).id);
      reply.header("ETag", `"activity-${a.revision}"`);
      return a;
    },
  );
  app.put(
    "/api/v1/activities/:id/progress",
    {
      schema: {
        ...privateSchema,
        operationId: "reportProgress",
        params: EntityIdParams,
        body: C.ProgressInput,
        response: { 200: C.Activity, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.reportProgress(
          owner,
          key(r),
          params(r).id,
          body<C.ReportProgress>(r),
          version(r),
        ),
      );
    },
  );
  app.get(
    "/api/v1/activities/:id/progress-history",
    {
      schema: {
        ...privateSchema,
        operationId: "getProgressHistory",
        params: EntityIdParams,
        querystring: C.PageQuery,
        response: { 200: ProgressHistory, ...errors },
      },
    },
    async (r) => {
      const { owner, service } = await authorize(r);
      return service.history(owner, params(r).id, "progress", query(r));
    },
  );
  app.get(
    "/api/v1/activities/:id/date-history",
    {
      schema: {
        ...privateSchema,
        operationId: "getAcademicDateHistory",
        params: EntityIdParams,
        querystring: C.PageQuery,
        response: { 200: DateHistory, ...errors },
      },
    },
    async (r) => {
      const { owner, service } = await authorize(r);
      return service.history(owner, params(r).id, "dates", query(r));
    },
  );
  app.post(
    "/api/v1/activities/:id/date-change-proposals",
    {
      schema: {
        ...privateSchema,
        operationId: "previewAcademicDateChange",
        params: EntityIdParams,
        body: C.DateProposalInput,
        response: { 201: Proposal, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.dateProposal(
          owner,
          key(r),
          params(r).id,
          body<C.DateChange>(r),
          version(r),
        ),
      );
    },
  );
  app.get(
    "/api/v1/plan-proposals/:id",
    {
      schema: {
        ...privateSchema,
        operationId: "getAcademicDateProposal",
        params: EntityIdParams,
        response: { 200: Proposal, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r);
      const result = await service.getDateProposal(owner, params(r).id);
      reply.header("ETag", `"workspace-${result.baseWorkspaceRevision}"`);
      return result;
    },
  );
  app.post(
    "/api/v1/plan-proposals/:id/apply",
    {
      schema: {
        ...privateSchema,
        operationId: "confirmAcademicDateChange",
        params: EntityIdParams,
        body: C.ApplyDateProposal,
        response: { 200: C.Activity, ...errors },
      },
    },
    async (r, reply) => {
      const { owner, service } = await authorize(r, true);
      return send(
        reply,
        await service.applyDateProposal(
          owner,
          key(r),
          params(r).id,
          version(r),
        ),
      );
    },
  );
}
