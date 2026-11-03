import { Type, type Static } from "@sinclair/typebox";
import {
  strict,
  Id,
  Revision,
  Priority,
  ActivityType,
  NullableMinutes,
  CivilDate,
  CivilTime,
} from "./index.js";
export const NullableText = Type.Union([Type.String(), Type.Null()]);
export const Instant = Type.String({ format: "date-time" });
export const NullableInstant = Type.Union([Instant, Type.Null()]);
export const NullableDate = Type.Union([CivilDate, Type.Null()]);
export const NullablePriority = Type.Union([Priority, Type.Null()]);
export const PriorityMode = Type.Union(
  ["inherit", "override", "none"].map((x) => Type.Literal(x)),
);
export const Divisibility = Type.Union(
  ["unknown", "divisible", "indivisible"].map((x) => Type.Literal(x)),
);
export const Preparation = Type.Union(
  ["new", "progress", "done"].map((x) => Type.Literal(x)),
);
export const Fulfillment = Type.Union(
  ["pending", "fulfilled"].map((x) => Type.Literal(x)),
);
export const Profile = Type.Object(
  {
    id: Id,
    displayName: Type.String(),
    studyTimezone: NullableText,
    onboardingState: Type.String(),
    revision: Revision,
  },
  strict,
);
export const ProfilePatch = Type.Partial(
  Type.Object(
    {
      displayName: Type.String({ minLength: 1, maxLength: 100 }),
      studyTimezone: NullableText,
      onboardingState: Type.Union([Type.Literal("new"), Type.Literal("seen")]),
    },
    strict,
  ),
);
export const PeriodInput = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    startDate: Type.Optional(NullableDate),
    endDate: Type.Optional(NullableDate),
    timezone: Type.Optional(NullableText),
  },
  strict,
);
export const PeriodPatch = Type.Partial(PeriodInput);
export const Period = Type.Object(
  {
    id: Id,
    name: Type.String(),
    startDate: NullableDate,
    endDate: NullableDate,
    timezone: NullableText,
    revision: Revision,
    workspaceRevision: Revision,
    isDefault: Type.Boolean(),
    planningState: Type.Literal("not_generated"),
  },
  strict,
);
export const CourseInput = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 120 }) },
  strict,
);
export const Course = Type.Object(
  { id: Id, periodId: Id, name: Type.String(), revision: Revision },
  strict,
);
const temporalFields = {
  dueDate: CivilDate,
  dueTime: Type.Optional(Type.Union([CivilTime, Type.Null()])),
  timezone: Type.Optional(NullableText),
  evaluationEndAt: Type.Optional(NullableInstant),
};
const constraints = {
  allowedStartAt: Type.Optional(NullableInstant),
  divisibility: Type.Optional(Divisibility),
  dependencies: Type.Optional(
    Type.Array(Id, { uniqueItems: true, maxItems: 100 }),
  ),
};
const editable = {
  title: Type.String({ minLength: 1, maxLength: 200 }),
  type: ActivityType,
  courseId: Type.Optional(Type.Union([Id, Type.Null()])),
  description: Type.Optional(Type.String({ maxLength: 10000 })),
  operatingMinutes: Type.Optional(NullableMinutes),
  priorityMode: Type.Optional(PriorityMode),
  priorityOverride: Type.Optional(NullablePriority),
};
export const ActivityInput = Type.Object(
  { periodId: Id, ...editable, ...temporalFields, ...constraints },
  strict,
);
export const ActivityPatch = Type.Partial(Type.Object(editable, strict));
export const ConstraintInput = Type.Object(constraints, strict);
export const ActivityPriorityInput = Type.Object(
  { mode: PriorityMode, priority: Type.Optional(NullablePriority) },
  strict,
);
export const BasePriorityInput = Type.Object({ priority: Priority }, strict);
export const Activity = Type.Object(
  {
    id: Id,
    periodId: Id,
    courseId: Type.Union([Id, Type.Null()]),
    title: Type.String(),
    type: ActivityType,
    description: Type.String(),
    dueDate: CivilDate,
    dueTime: Type.Union([CivilTime, Type.Null()]),
    timezone: NullableText,
    dueAt: NullableInstant,
    evaluationEndAt: NullableInstant,
    allowedStartAt: NullableInstant,
    divisibility: Divisibility,
    dependencies: Type.Array(Id),
    priorityMode: PriorityMode,
    priorityOverride: NullablePriority,
    effectivePriority: NullablePriority,
    operatingMinutes: NullableMinutes,
    effortOrigin: Type.Union([
      Type.Literal("manual"),
      Type.Literal("corrected"),
      Type.Null(),
    ]),
    realTotalMinutes: NullableMinutes,
    remainingMinutes: NullableMinutes,
    pendingMinutes: NullableMinutes,
    needsReview: Type.Boolean(),
    effectiveCompletionDate: NullableDate,
    preparationState: Preparation,
    fulfillmentState: Fulfillment,
    revision: Revision,
    planningState: Type.Literal("not_generated"),
  },
  strict,
);
export const ProgressInput = Type.Object(
  {
    realTotalMinutes: Type.Optional(NullableMinutes),
    remainingMinutes: Type.Optional(NullableMinutes),
    effectiveCompletionDate: Type.Optional(NullableDate),
    preparationState: Type.Optional(Preparation),
    fulfillmentState: Type.Optional(Fulfillment),
    reopenPreparation: Type.Optional(Type.Boolean()),
  },
  strict,
);
export const DateProposalInput = Type.Object(
  {
    ...temporalFields,
    source: Type.Object(
      {
        kind: Type.Literal("manual"),
        description: Type.Optional(Type.String({ maxLength: 500 })),
      },
      strict,
    ),
  },
  strict,
);
export const ApplyDateProposal = Type.Object(
  {
    confirmations: Type.Array(Type.Literal("academic_date_change"), {
      minItems: 1,
      maxItems: 1,
    }),
  },
  strict,
);
export const PageQuery = Type.Object(
  {
    limit: Type.Optional(Type.String({ pattern: "^[1-9][0-9]?$|^100$" })),
    cursor: Type.Optional(Id),
  },
  strict,
);
export const ActivityQuery = Type.Object(
  {
    ...PageQuery.properties,
    periodId: Type.Optional(Id),
    courseId: Type.Optional(Id),
  },
  strict,
);
export const pageOf = (
  schema: typeof Profile | typeof Period | typeof Course | typeof Activity,
) =>
  Type.Object(
    { items: Type.Array(schema), nextCursor: Type.Union([Id, Type.Null()]) },
    strict,
  );
export type CreateActivity = Static<typeof ActivityInput>;
export type EditActivity = Static<typeof ActivityPatch>;
export type ReportProgress = Static<typeof ProgressInput>;
export type DateChange = Static<typeof DateProposalInput>;
export type ActivityDto = Static<typeof Activity>;
