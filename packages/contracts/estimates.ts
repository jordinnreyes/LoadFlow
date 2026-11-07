import { Type, type Static } from "@sinclair/typebox";
import { Id, Revision, strict } from "./index.js";
import { Instant, NullableText } from "./academics.js";

export const Consent = Type.Object(
  {
    policyVersion: Type.String(),
    granted: Type.Boolean(),
    revision: Type.Integer({ minimum: 0 }),
    notice: Type.String(),
  },
  strict,
);
export const ConsentInput = Type.Object(
  {
    policyVersion: Type.String({ minLength: 1, maxLength: 80 }),
    granted: Type.Boolean(),
  },
  strict,
);
export const WorkloadSize = Type.Union([
  Type.Literal("small"),
  Type.Literal("medium"),
  Type.Literal("large"),
]);
export type WorkloadSize = Static<typeof WorkloadSize>;
export const EstimateInput = Type.Object(
  {
    excerpt: Type.String({ minLength: 1, maxLength: 2400 }),
    workloadSize: Type.Optional(WorkloadSize),
  },
  strict,
);

const Status = Type.Union([
  Type.Literal("estimated"),
  Type.Literal("needs_context"),
  Type.Literal("abstained"),
]);
const SuggestionOrigin = Type.Union([
  Type.Literal("base"),
  Type.Literal("personalized"),
]);
export const EstimateFactor = Type.Union([
  Type.Literal("deliverables"),
  Type.Literal("volume"),
  Type.Literal("validation"),
  Type.Literal("prerequisites"),
]);
export const MissingContext = Type.Union([
  Type.Literal("scope"),
  Type.Literal("deliverables"),
  Type.Literal("volume"),
]);
export const Suggestion = Type.Object(
  {
    status: Status,
    lowMinutes: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    highMinutes: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    factors: Type.Array(EstimateFactor, { maxItems: 4 }),
    missingContext: Type.Array(MissingContext, { maxItems: 3 }),
  },
  strict,
);
export const Estimate = Type.Object(
  {
    id: Id,
    activityId: Id,
    activityRevision: Revision,
    state: Type.Union([
      Type.Literal("pending"),
      Type.Literal("complete"),
      Type.Literal("failed"),
      Type.Literal("outcome_unknown"),
    ]),
    suggestion: Type.Union([Suggestion, Type.Null()]),
    errorCode: NullableText,
    model: Type.String(),
    promptVersion: Type.String(),
    origin: SuggestionOrigin,
    calibration: Type.Union([
      Type.Object(
        {
          version: Type.String(),
          comparableCount: Type.Integer({ minimum: 1 }),
          warning: NullableText,
        },
        strict,
      ),
      Type.Null(),
    ]),
    createdAt: Instant,
    manualEntryAvailable: Type.Literal(true),
  },
  strict,
);
export type SuggestionDto = Static<typeof Suggestion>;
export const ConfirmEstimate = Type.Object(
  {
    decision: Type.Union([Type.Literal("accept"), Type.Literal("correct")]),
    selectedMinutes: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    origin: SuggestionOrigin,
  },
  strict,
);
export type ConfirmEstimate = Static<typeof ConfirmEstimate>;
