import { Type, type Static } from "@sinclair/typebox";
import { CivilDate, Id, Minutes, strict } from "./index.js";
export const Interval = Type.Object(
  {
    startMinute: Type.Integer({ minimum: 0, maximum: 1439 }),
    endMinute: Type.Integer({ minimum: 1, maximum: 1440 }),
  },
  strict,
);
export const DayState = Type.Union([
  Type.Literal("unknown"),
  Type.Literal("no_study"),
  Type.Literal("windows"),
]);
export const Weekday = Type.Integer({ minimum: 1, maximum: 7 });
export const WeeklyDay = Type.Object(
  { weekday: Weekday, state: DayState, intervals: Type.Array(Interval) },
  strict,
);
export const Exception = Type.Object(
  {
    date: CivilDate,
    mode: Type.Union([
      Type.Literal("replace"),
      Type.Literal("no_study"),
      Type.Literal("unknown"),
    ]),
    intervals: Type.Array(Interval),
  },
  strict,
);
export const ManualCoverage = Type.Object(
  { from: CivilDate, to: CivilDate },
  strict,
);
export const Preferences = Type.Object(
  {
    minimumMinutes: Minutes,
    preferredMinutes: Minutes,
    maximumMinutes: Minutes,
  },
  strict,
);
export const AvailabilityInput = Type.Object(
  {
    confirmed: Type.Literal(true),
    timezone: Type.String({ minLength: 1, maxLength: 80 }),
    validFrom: CivilDate,
    validTo: Type.Union([CivilDate, Type.Null()]),
    weekly: Type.Array(WeeklyDay, { minItems: 7, maxItems: 7 }),
    exceptions: Type.Array(Exception),
    manualCoverage: Type.Array(ManualCoverage),
    preferences: Preferences,
  },
  strict,
);
export const CopyWindows = Type.Object(
  {
    confirmed: Type.Literal(true),
    sourceWeekday: Weekday,
    targetWeekdays: Type.Array(Weekday, {
      minItems: 1,
      maxItems: 6,
      uniqueItems: true,
    }),
    mode: Type.Union([Type.Literal("replace"), Type.Literal("merge")]),
  },
  strict,
);
export const Availability = Type.Object(
  {
    periodId: Id,
    configured: Type.Boolean(),
    revision: Type.Integer({ minimum: 0 }),
    workspaceRevision: Type.Integer({ minimum: 1 }),
    configuration: Type.Union([AvailabilityInput, Type.Null()]),
    planningState: Type.Literal("not_generated"),
  },
  strict,
);
export const Instant = Type.String({ format: "date-time" });
export const CommitmentInput = Type.Object(
  {
    periodId: Id,
    title: Type.String({ minLength: 1, maxLength: 200 }),
    startAt: Instant,
    endAt: Instant,
    timezone: Type.String({ minLength: 1, maxLength: 80 }),
    confirmed: Type.Literal(true),
  },
  strict,
);
export const CommitmentPatch = Type.Partial(
  Type.Object(
    {
      title: Type.String({ minLength: 1, maxLength: 200 }),
      startAt: Instant,
      endAt: Instant,
      timezone: Type.String({ minLength: 1, maxLength: 80 }),
    },
    strict,
  ),
);
export const Commitment = Type.Object(
  {
    id: Id,
    periodId: Id,
    title: Type.String(),
    startAt: Instant,
    endAt: Instant,
    timezone: Type.String(),
    revision: Type.Integer({ minimum: 1 }),
    source: Type.Literal("manual"),
  },
  strict,
);
export const RangeQuery = Type.Object(
  { from: CivilDate, to: CivilDate },
  strict,
);
export const CommitmentQuery = Type.Object(
  {
    periodId: Id,
    from: Instant,
    to: Instant,
    limit: Type.Optional(Type.String({ pattern: "^([1-9]|[1-9][0-9]|100)$" })),
    cursor: Type.Optional(Id),
  },
  strict,
);
export const InstantInterval = Type.Object(
  { startAt: Instant, endAt: Instant },
  strict,
);
export const Capacity = Type.Object(
  {
    periodId: Id,
    workspaceRevision: Type.Integer(),
    availabilityRevision: Type.Integer(),
    from: CivilDate,
    to: CivilDate,
    timezone: Type.Union([Type.String(), Type.Null()]),
    asOf: Instant,
    certainty: Type.Union([
      Type.Literal("known"),
      Type.Literal("partial"),
      Type.Literal("unknown"),
    ]),
    source: Type.String(),
    availableMinutes: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
    provisionalMinutes: Type.Number({ minimum: 0 }),
    available: Type.Array(InstantInterval),
    occupied: Type.Array(InstantInterval),
    issues: Type.Array(
      Type.Object(
        { code: Type.String(), date: Type.Optional(CivilDate) },
        strict,
      ),
    ),
    planningState: Type.Literal("not_generated"),
  },
  strict,
);
export type AvailabilityConfig = Static<typeof AvailabilityInput>;
export type CopyInput = Static<typeof CopyWindows>;
export type CommitmentCreate = Static<typeof CommitmentInput>;
export type CommitmentEdit = Static<typeof CommitmentPatch>;
export type CapacityDto = Static<typeof Capacity>;
