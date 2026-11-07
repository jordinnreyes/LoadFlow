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
export const EstimateInput = Type.Object(
  {
    excerpt: Type.String({ minLength: 1, maxLength: 2400 }),
  },
  strict,
);

const Status = Type.Union([
  Type.Literal("estimated"),
  Type.Literal("needs_context"),
  Type.Literal("abstained"),
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
    origin: Type.Literal("base"),
    createdAt: Instant,
    manualEntryAvailable: Type.Literal(true),
  },
  strict,
);
export type SuggestionDto = Static<typeof Suggestion>;
