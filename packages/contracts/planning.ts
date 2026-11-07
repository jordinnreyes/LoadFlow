import { Type, type Static } from "@sinclair/typebox";
import { Id, Revision, strict } from "./index.js";
import { Instant, InstantInterval, RangeQuery } from "./availability.js";
const NullableId = Type.Union([Id, Type.Null()]);
export const Session = Type.Object(
  {
    id: Id,
    activityId: Id,
    startAt: Instant,
    endAt: Instant,
    kind: Type.Union([Type.Literal("study"), Type.Literal("group")]),
    fixed: Type.Boolean(),
    accepted: Type.Boolean(),
    state: Type.Union([
      Type.Literal("planned"),
      Type.Literal("completed"),
      Type.Literal("cancelled"),
    ]),
    revision: Revision,
  },
  strict,
);
export const Command = Type.Union([
  Type.Object(
    { kind: Type.Literal("recalculate"), activityId: Type.Optional(Id) },
    strict,
  ),
  Type.Object(
    {
      kind: Type.Literal("move"),
      sessionId: Id,
      revision: Revision,
      startAt: Instant,
      endAt: Instant,
    },
    strict,
  ),
  Type.Object(
    {
      kind: Type.Literal("fix"),
      sessionId: Id,
      revision: Revision,
      fixed: Type.Boolean(),
    },
    strict,
  ),
  Type.Object(
    {
      kind: Type.Literal("session_state"),
      sessionId: Id,
      revision: Revision,
      state: Type.Union([Type.Literal("completed"), Type.Literal("cancelled")]),
    },
    strict,
  ),
  Type.Object({ kind: Type.Literal("undo") }, strict),
  Type.Object({ kind: Type.Literal("academic_date"), proposalId: Id }, strict),
]);
export const Confirmation = Type.Union([
  Type.Literal("accept_partial_plan"),
  Type.Literal("keep_fixed_conflicts"),
  Type.Literal("group_reservations"),
  Type.Literal("release_fixed_sessions"),
  Type.Literal("academic_date_change"),
]);
export const Apply = Type.Object(
  {
    confirmations: Type.Array(Confirmation, { uniqueItems: true, maxItems: 5 }),
  },
  strict,
);
export const Diagnostic = Type.Object(
  {
    activityId: NullableId,
    sessionId: NullableId,
    code: Type.String(),
    kind: Type.Union([
      Type.Literal("pending"),
      Type.Literal("deficit"),
      Type.Literal("conflict"),
      Type.Literal("search_incomplete"),
    ]),
    minutes: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  },
  strict,
);
const NullableMinutes = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);
export const Result = Type.Object(
  {
    algorithmVersion: Type.String(),
    policyVersion: Type.String(),
    asOf: Instant,
    horizonEnd: Instant,
    sessions: Type.Array(Session),
    diagnostics: Type.Array(Diagnostic),
    balances: Type.Array(
      Type.Object(
        {
          activityId: Id,
          required: NullableMinutes,
          scheduled: Type.Integer({ minimum: 0 }),
          covered: Type.Integer({ minimum: 0 }),
          unplaced: NullableMinutes,
        },
        strict,
      ),
    ),
    state: Type.Union([
      Type.Literal("empty"),
      Type.Literal("viable"),
      Type.Literal("partial"),
      Type.Literal("deficit"),
      Type.Literal("conflict"),
    ]),
    exploredStates: Type.Integer({ minimum: 0 }),
    searchLimited: Type.Boolean(),
  },
  strict,
);
export const Proposal = Type.Object(
  {
    id: Id,
    periodId: Id,
    workspaceRevision: Revision,
    planRevision: Type.Integer({ minimum: 0 }),
    state: Type.Union([Type.Literal("pending"), Type.Literal("applied")]),
    command: Command,
    before: Type.Array(Session),
    after: Result,
    requiredConfirmations: Type.Array(Confirmation),
    differences: Type.Object(
      {
        added: Type.Array(Id),
        removed: Type.Array(Id),
        changed: Type.Array(Id),
      },
      strict,
    ),
    inputHash: Type.String(),
  },
  strict,
);
export const Plan = Type.Object(
  {
    periodId: Id,
    workspaceRevision: Revision,
    planRevision: Type.Integer({ minimum: 0 }),
    state: Type.Union([
      Type.Literal("not_generated"),
      Type.Literal("current"),
      Type.Literal("stale"),
    ]),
    result: Type.Union([Result, Type.Null()]),
    pendingProposalId: NullableId,
    lastAppliedProposalId: NullableId,
    undoAvailable: Type.Boolean(),
    recalculation: Type.Union([
      Type.Object(
        {
          state: Type.String(),
          errorCode: Type.Union([Type.String(), Type.Null()]),
        },
        strict,
      ),
      Type.Null(),
    ]),
  },
  strict,
);
export const GroupInput = Type.Object(
  {
    enabled: Type.Boolean(),
    accepted: Type.Boolean(),
    count: Type.Integer({ minimum: 1, maximum: 30 }),
    minutes: Type.Integer({ minimum: 1, maximum: 1440 }),
  },
  strict,
);
export const Group = Type.Object(
  {
    activityId: Id,
    activityRevision: Revision,
    revision: Type.Integer({ minimum: 0 }),
    ...GroupInput.properties,
    equivalences: Type.Array(
      Type.Object(
        {
          id: Id,
          sourceId: Id,
          ...InstantInterval.properties,
          valid: Type.Boolean(),
        },
        strict,
      ),
    ),
  },
  strict,
);
export const EquivalenceInput = Type.Object(
  { sourceId: Id, ...InstantInterval.properties },
  strict,
);
export const Weekly = Type.Object(
  {
    periodId: Id,
    from: Type.String({ format: "date" }),
    to: Type.String({ format: "date" }),
    timezone: Type.Union([Type.String(), Type.Null()]),
    weeks: Type.Array(
      Type.Object(
        {
          startDate: Type.String({ format: "date" }),
          endDate: Type.String({ format: "date" }),
          deadlineActivityIds: Type.Array(Id),
          sessions: Type.Array(Session),
          capacityMinutes: NullableMinutes,
          studyMinutes: Type.Integer({ minimum: 0 }),
          groupMinutes: Type.Integer({ minimum: 0 }),
          unplacedMinutes: NullableMinutes,
          incompleteActivityIds: Type.Array(Id),
          state: Type.Union([
            Type.Literal("empty"),
            Type.Literal("viable"),
            Type.Literal("partial"),
            Type.Literal("deficit"),
            Type.Literal("conflict"),
          ]),
        },
        strict,
      ),
    ),
  },
  strict,
);
export { RangeQuery };
export type PlanningCommand = Static<typeof Command>;
export type ApplyInput = Static<typeof Apply>;
export type GroupSettings = Static<typeof GroupInput>;
export type Equivalence = Static<typeof EquivalenceInput>;
