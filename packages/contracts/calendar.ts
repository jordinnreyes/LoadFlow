import { Type, type Static } from "@sinclair/typebox";
import { Id, strict } from "./index.js";
import { Instant, InstantInterval } from "./availability.js";
export const Authorization = Type.Object(
  { authorizationUrl: Type.String({ format: "uri" }), expiresAt: Instant },
  strict,
);
export const Connection = Type.Object(
  {
    configured: Type.Boolean(),
    state: Type.Union(
      [
        "not_connected",
        "connected",
        "stale",
        "error",
        "revoked",
        "partial",
      ].map((x) => Type.Literal(x)),
    ),
    revision: Type.Integer({ minimum: 0 }),
    selectionRevision: Type.Integer({ minimum: 0 }),
    selectedCount: Type.Integer({ minimum: 0 }),
    lastAttemptAt: Type.Union([Instant, Type.Null()]),
    lastSuccessAt: Type.Union([Instant, Type.Null()]),
    safeError: Type.Union([Type.String(), Type.Null()]),
    policy: Type.Object(
      {
        chunkDays: Type.Literal(31),
        foregroundRefreshSeconds: Type.Literal(900),
        staleAfterSeconds: Type.Literal(1800),
        cooldownSeconds: Type.Literal(60),
        maxAttempts: Type.Literal(3),
      },
      strict,
    ),
  },
  strict,
);
export const Source = Type.Object(
  {
    id: Id,
    name: Type.String(),
    timezone: Type.Union([Type.String(), Type.Null()]),
    primary: Type.Boolean(),
    selected: Type.Boolean(),
    accessible: Type.Boolean(),
  },
  strict,
);
export const Selection = Type.Object(
  { calendarIds: Type.Array(Id, { uniqueItems: true }) },
  strict,
);
export const Refresh = Type.Object(
  {
    periodId: Id,
    reason: Type.Union(
      ["open", "resume", "manual", "foreground"].map((x) => Type.Literal(x)),
    ),
  },
  strict,
);
export const Job = Type.Object(
  {
    id: Id,
    type: Type.Literal("calendar_refresh"),
    status: Type.Union(
      ["queued", "running", "succeeded", "partial", "failed", "cancelled"].map(
        (x) => Type.Literal(x),
      ),
    ),
    attempts: Type.Integer(),
    runAfter: Instant,
    finishedAt: Type.Union([Instant, Type.Null()]),
    safeError: Type.Union([Type.String(), Type.Null()]),
  },
  strict,
);
export const JobAccepted = Type.Object(
  { job: Job, deduplicated: Type.Boolean(), statusUrl: Type.String() },
  strict,
);
export const BusyQuery = Type.Object({ from: Instant, to: Instant }, strict);
export const Busy = Type.Object(
  {
    connection: Connection,
    from: Instant,
    to: Instant,
    coverage: Type.Union([
      Type.Literal("complete"),
      Type.Literal("partial"),
      Type.Literal("unknown"),
    ]),
    busy: Type.Array(InstantInterval),
    covered: Type.Array(InstantInterval),
    issues: Type.Array(Type.String()),
    lastFetchedAt: Type.Union([Instant, Type.Null()]),
  },
  strict,
);
export type BusyDto = Static<typeof Busy>;
