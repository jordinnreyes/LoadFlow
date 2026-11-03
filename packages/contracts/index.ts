import { Type, type Static } from "@sinclair/typebox";

export const strict = { additionalProperties: false } as const;
export const Id = Type.String({ format: "uuid" });
export const Revision = Type.Integer({ minimum: 1 });
export const Minutes = Type.Integer({ minimum: 0, maximum: 2147483647 });
export const NullableMinutes = Type.Union([Minutes, Type.Null()]);
export const CivilDate = Type.String({ format: "date" });
export const CivilTime = Type.String({
  pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$",
});
export const ErrorResponse = Type.Object(
  {
    error: Type.Object(
      {
        code: Type.String(),
        message: Type.String(),
        fieldErrors: Type.Array(
          Type.Object({ field: Type.String(), message: Type.String() }, strict),
        ),
        requestId: Type.String(),
        retryable: Type.Boolean(),
      },
      strict,
    ),
  },
  strict,
);
export const Health = Type.Object({ status: Type.Literal("ok") }, strict);
export const Priority = Type.Union(
  ["Alta", "Media", "Baja"].map((x) => Type.Literal(x)),
);
export const ActivityType = Type.Union(
  [
    "Práctica calificada",
    "Examen parcial",
    "Examen final",
    "Tarea",
    "Informe",
    "Exposición",
    "Proyecto individual",
    "Entrega grupal",
  ].map((x) => Type.Literal(x)),
);
export type ApiError = Static<typeof ErrorResponse>;

// Transport contracts for F1; defining these does not expose an auth route in F0.
export const EmailChallenge = Type.Object({ email: Type.String({ format: 'email', maxLength: 254 }), intent: Type.Union([Type.Literal('register'),Type.Literal('login')]) }, { ...strict, $id: 'EmailChallenge' });
export const EmailVerification = Type.Object({ challengeId: Id, code: Type.String({ pattern: '^[0-9]{6}$' }) }, { ...strict, $id: 'EmailVerification' });
export const EntityIdParams = Type.Object({ id: Id }, strict);
export const RevisionHeaders = Type.Object({ 'if-match': Type.String({ pattern: '^"[a-z]+-[1-9][0-9]*"$' }) }, { additionalProperties: true });
