import { PlanningState } from "./index.js";
import { Type, type Static } from "@sinclair/typebox";
import {
  ActivityType,
  CivilDate,
  CivilTime,
  Id,
  NullableMinutes,
  Revision,
  strict,
} from "./index.js";
import {
  Instant,
  NullablePriority,
  NullableText,
  PriorityMode,
} from "./academics.js";

export const FileFormat = Type.Union([
  Type.Literal("pdf"),
  Type.Literal("xlsx"),
]);
export const ImportState = Type.Union([
  Type.Literal("uploading"),
  Type.Literal("queued"),
  Type.Literal("running"),
  Type.Literal("review"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
  Type.Literal("removed"),
  Type.Literal("expired"),
]);
const Resolution = Type.Union([
  Type.Literal("distinct"),
  Type.Literal("keep"),
  Type.Literal("update"),
]);
const Unit = Type.Object(
  {
    index: Type.Integer({ minimum: 1 }),
    name: NullableText,
    state: Type.Union([
      Type.Literal("recognized"),
      Type.Literal("unrecognized"),
      Type.Literal("no_text"),
    ]),
  },
  strict,
);
export const ImportSummary = Type.Object(
  {
    id: Id,
    periodId: Id,
    documentId: Id,
    jobId: Id,
    format: FileFormat,
    state: ImportState,
    revision: Revision,
    extractorVersion: Type.String(),
    attempts: Type.Integer({ minimum: 0, maximum: 3 }),
    coverage: Type.Array(Unit),
    warnings: Type.Array(Type.String()),
    errorCode: NullableText,
    errorMessage: NullableText,
    originalAvailable: Type.Boolean(),
    reviewExpiresAt: Type.Union([Instant, Type.Null()]),
    manualEntryAvailable: Type.Literal(true),
  },
  strict,
);
export const ImportAccepted = Type.Object(
  { id: Id, documentId: Id, jobId: Id },
  strict,
);
export const Locator = Type.Object(
  {
    unit: Type.Integer({ minimum: 1 }),
    row: Type.Integer({ minimum: 1 }),
    columns: Type.Record(Type.String(), Type.Integer()),
    sourceRows: Type.Record(Type.String(), Type.Integer()),
  },
  strict,
);
const EvidenceFields = Type.Object(
  {
    title: NullableText,
    type: NullableText,
    course: NullableText,
    dueDate: NullableText,
    dueTime: NullableText,
    endTime: NullableText,
  },
  strict,
);
export const Evidence = Type.Object(
  {
    fields: EvidenceFields,
    original: EvidenceFields,
    locator: Locator,
    issues: Type.Array(Type.String()),
  },
  strict,
);
export const Draft = Type.Object(
  {
    discarded: Type.Optional(Type.Boolean()),
    title: Type.Union([
      Type.String({ minLength: 1, maxLength: 200 }),
      Type.Null(),
    ]),
    type: Type.Union([ActivityType, Type.Null()]),
    courseId: Type.Union([Id, Type.Null()]),
    dueDate: Type.Union([CivilDate, Type.Null()]),
    dueTime: Type.Union([CivilTime, Type.Null()]),
    endTime: Type.Union([CivilTime, Type.Null()]),
    timezone: Type.Union([
      Type.String({ minLength: 1, maxLength: 80 }),
      Type.Null(),
    ]),
    operatingMinutes: NullableMinutes,
    priorityMode: PriorityMode,
    priorityOverride: NullablePriority,
  },
  strict,
);
export const DraftPatch = Type.Partial(Draft);
const Match = Type.Object(
  {
    activityId: Id,
    revision: Revision,
    title: Type.String(),
    type: ActivityType,
    dueDate: CivilDate,
    courseId: Type.Union([Id, Type.Null()]),
  },
  strict,
);
export const Candidate = Type.Object(
  {
    id: Id,
    revision: Revision,
    status: Type.Union([
      Type.Literal("draft"),
      Type.Literal("discarded"),
      Type.Literal("confirmed"),
    ]),
    evidence: Evidence,
    draft: Draft,
    effectivePriority: NullablePriority,
    matches: Type.Array(Match),
    resolution: Type.Union([Resolution, Type.Null()]),
    confirmedActivityId: Type.Union([Id, Type.Null()]),
  },
  strict,
);
export const Confirmation = Type.Object(
  {
    rows: Type.Array(
      Type.Object(
        {
          candidateId: Id,
          revision: Revision,
          resolution: Resolution,
          activityId: Type.Optional(Id),
          activityRevision: Type.Optional(Revision),
        },
        strict,
      ),
      { minItems: 1, maxItems: 100 },
    ),
  },
  strict,
);
export const Confirmed = Type.Object(
  {
    revision: Revision,
    items: Type.Array(
      Type.Object(
        {
          candidateId: Id,
          activityId: Id,
          dateProposalId: Type.Union([Id, Type.Null()]),
        },
        strict,
      ),
    ),
    planningState: PlanningState,
  },
  strict,
);
export const Mutation = Type.Object({ id: Id, revision: Revision }, strict);
export const Page = <T extends typeof Candidate | typeof ImportSummary>(
  item: T,
) =>
  Type.Object(
    {
      items: Type.Array(item),
      nextCursor: Type.Union([Id, Type.Null()]),
    },
    strict,
  );
export type ImportDraft = Static<typeof Draft>;
export type ConfirmRows = Static<typeof Confirmation>;
