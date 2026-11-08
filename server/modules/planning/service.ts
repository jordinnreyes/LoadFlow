import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Temporal } from "@js-temporal/polyfill";
import { eq, sql, type SQL } from "drizzle-orm";
import { activities, users } from "../../db/schema.js";
import { DomainError, notFound } from "../../errors.js";
import { digest, type Context } from "../academics/service.js";
import { invalid, requireRevision } from "../academics/policy.js";
import type { Identity } from "../identity/service.js";
import type { CalendarService } from "../calendar/service.js";
import { AvailabilityService } from "../availability/service.js";
import { dates, dayBoundary } from "../availability/rules.js";
import { snapshotCoverage, type StoredSnapshot } from "../calendar/coverage.js";
import { describe } from "../../../packages/planning-core/plan.js";
import {
  CALCULATION_TIMEOUT_MS,
  retained,
  sameSession,
  type Result,
  type Snapshot,
  type Session,
} from "../../../packages/planning-core/model.js";
import {
  academicMinute,
  horizon,
  instant,
  instantMinute,
  localDay,
  normalizeActivity,
} from "../../../packages/planning-core/normalize.js";
import {
  contains,
  duration,
  intersect,
  minutes,
  overlaps,
  union,
  type Span,
} from "../../../packages/planning-core/intervals.js";
import { validateSessions } from "../../../packages/planning-core/validate.js";
import type {
  PlanningCommand,
  ApplyInput,
  GroupSettings,
  Equivalence,
} from "../../../packages/contracts/planning.js";
import { calculatePlan } from "./calculate.js";
import type { DateChange } from "../../../packages/contracts/academics.js";

const query = async <T>(ctx: Context, statement: SQL) =>
  (await ctx.db.execute(statement)).rows as unknown as T[];
const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
const exactMinute = (value: string) => {
  const minute = instantMinute(value);
  if (Date.parse(value) !== minute * 60000)
    throw invalid(
      "SESSION_MINUTE_PRECISION",
      "Usa horas con precisión de minutos.",
    );
  return minute;
};
type StoredSession = {
  id: string;
  activity_id: string;
  start_at: Date;
  end_at: Date;
  kind: Session["kind"];
  fixed: boolean;
  accepted: boolean;
  state: Session["state"];
  revision: number;
  cancel_reason: string | null;
};
type Envelope = {
  periodId: string;
  workspaceRevision: number;
  planRevision: number;
  snapshot: Snapshot;
  activityRevisions: Record<string, number>;
  sessionRevisions: Record<string, number>;
  reversibleCancellationIds: string[];
};
type ProposalRow = {
  id: string;
  period_id: string;
  workspace_revision: number;
  plan_revision: number;
  snapshot: Envelope;
  result: Result;
  command: PlanningCommand;
  required_confirmations: ApplyInput["confirmations"];
  input_hash: string;
  state: "pending" | "applied";
};
type VersionRow = {
  id: string;
  period_id: string;
  workspace_revision: number;
  plan_revision: number;
  result: Result;
  previous_version_id: string | null;
  source_valid_until: Date | null;
};
type DateProposal = {
  id: string;
  activity_id: string;
  base_revision: number;
  workspace_revision: number;
  after_value: DateChange;
  state: string;
};
type GroupRow = {
  activity_id: string;
  enabled: boolean;
  accepted: boolean;
  block_count: number;
  block_minutes: number;
  revision: number;
};
type EquivalenceRow = {
  id: string;
  activity_id: string;
  calendar_id: string;
  start_at: Date;
  end_at: Date;
  connection_revision: number;
  selection_revision: number;
};
const asSession = (s: StoredSession): Session => ({
  id: s.id,
  activityId: s.activity_id,
  start: instantMinute(new Date(s.start_at).toISOString()),
  end: instantMinute(new Date(s.end_at).toISOString(), "end"),
  kind: s.kind,
  fixed: s.fixed,
  accepted: s.accepted,
  state: s.state,
});
const sessionDto = (s: Session, revision: number) => ({
  id: s.id,
  activityId: s.activityId,
  startAt: instant(s.start),
  endAt: instant(s.end),
  kind: s.kind,
  fixed: s.fixed,
  accepted: s.accepted,
  state: s.state,
  revision,
});
const resultDto = (result: Result, revisions: Record<string, number>) => ({
  ...result,
  asOf: instant(result.asOf),
  horizonEnd: instant(result.horizonEnd),
  sessions: result.sessions.map((s) => sessionDto(s, revisions[s.id] ?? 1)),
});
export type PlanningClaim = {
  owner_id: string;
  period_id: string;
  workspace_revision: number;
  lease_token: string;
  attempts: number;
  review_required: boolean;
};

export class PlanningService {
  readonly availability: AvailabilityService;
  constructor(
    readonly identity: Identity,
    readonly calendar: CalendarService,
  ) {
    this.availability = new AvailabilityService(
      identity.academics,
      () => calendar,
    );
  }
  get academics() {
    return this.identity.academics;
  }
  async latest(ctx: Context, id: string) {
    return (
      await query<VersionRow>(
        ctx,
        sql`select * from app.plan_versions where owner_id=${ctx.owner} and period_id=${id} order by plan_revision desc limit 1`,
      )
    )[0];
  }
  async dateChange(ctx: Context, id: string, periodId: string) {
    const [proposal] = await query<DateProposal>(
      ctx,
      sql`select * from app.date_change_proposals where owner_id=${ctx.owner} and id=${id}`,
    );
    if (!proposal) throw notFound();
    const a = await this.academics.requireActivity(ctx, proposal.activity_id);
    const p = await this.academics.requirePeriod(ctx, periodId);
    if (a.periodId !== periodId) throw notFound();
    if (
      proposal.state !== "pending" ||
      proposal.base_revision !== a.revision ||
      proposal.workspace_revision !== p.workspaceRevision
    )
      throw new DomainError(
        412,
        "REVISION_MISMATCH",
        "La propuesta de fecha cambió. Revísala nuevamente.",
      );
    return proposal;
  }
  async sourceCoverage(ctx: Context, sourceId: string, span: Span) {
    const c = await this.calendar.connectionRow(ctx);
    const source = (await this.calendar.sourceRows(ctx)).find(
      (s) => s.id === sourceId && s.selected && s.accessible,
    );
    if (!c || !source) return null;
    const stored = await query<Omit<StoredSnapshot, "intervals">>(
      ctx,
      sql`select * from app.busy_snapshots where owner_id=${ctx.owner} and calendar_id=${sourceId}
        and range_start<${instant(span.end)}::timestamptz and range_end>${instant(span.start)}::timestamptz`,
    );
    const busy = await query<{
      snapshot_id: string;
      start_at: Date;
      end_at: Date;
    }>(
      ctx,
      sql`select b.* from app.external_busy_intervals b join app.busy_snapshots s on (s.owner_id,s.id)=(b.owner_id,b.snapshot_id)
        where b.owner_id=${ctx.owner} and s.calendar_id=${sourceId} and s.range_start<${instant(span.end)}::timestamptz
        and s.range_end>${instant(span.start)}::timestamptz`,
    );
    const coverage = snapshotCoverage(
      [sourceId],
      stored.map((s) => ({
        ...s,
        intervals: busy
          .filter((b) => b.snapshot_id === s.id)
          .map((b) => ({
            start: new Date(b.start_at).getTime(),
            end: new Date(b.end_at).getTime(),
          })),
      })),
      { start: span.start * 60000, end: span.end * 60000 },
      this.academics.now(),
      c,
      source.last_error_at
        ? { [sourceId]: new Date(source.last_error_at).getTime() }
        : {},
    );
    return {
      connectionRevision: c.revision,
      selectionRevision: c.selection_revision,
      valid:
        coverage.coverage === "complete" &&
        contains(coverage.busy, {
          start: span.start * 60000,
          end: span.end * 60000,
        }),
    };
  }
  async snapshot(
    ctx: Context,
    id: string,
    command: PlanningCommand = { kind: "recalculate" },
  ): Promise<Envelope> {
    const readDeadline = performance.now() + CALCULATION_TIMEOUT_MS;
    const checkReadBudget = () => {
      if (performance.now() >= readDeadline)
        throw new DomainError(
          503,
          "PLANNING_INPUT_TIMEOUT",
          "La lectura de entradas superó el límite del cálculo.",
        );
    };
    const p = await this.academics.requirePeriod(ctx, id);
    const configuration = await this.availability.configuration(ctx, id);
    const [profile] = await ctx.db
      .select({ studyTimezone: users.studyTimezone })
      .from(users)
      .where(eq(users.id, ctx.owner));
    const zone =
      configuration.configuration?.timezone ??
      p.timezone ??
      profile?.studyTimezone ??
      null;
    const raw = await ctx.db
      .select()
      .from(activities)
      .where(eq(activities.periodId, id))
      .orderBy(activities.id);
    const groups = await query<GroupRow>(
      ctx,
      sql`select g.* from app.group_reservation_settings g join app.activities a on a.id=g.activity_id
      where g.owner_id=${ctx.owner} and a.period_id=${id}`,
    );
    const override =
      command.kind === "academic_date"
        ? await this.dateChange(ctx, command.proposalId, id)
        : null;
    const normalized: Snapshot["activities"] = [];
    const activityRevisions: Record<string, number> = {};
    const planningState = await this.academics.planningState(ctx, id);
    for (const a of raw) {
      checkReadBudget();
      const dto = await this.academics.activityDto(ctx, a, planningState);
      if (override?.activity_id === a.id)
        Object.assign(dto, override.after_value);
      const group = groups.find((g) => g.activity_id === a.id);
      const settings =
        a.type === "Entrega grupal"
          ? {
              enabled: group?.enabled ?? true,
              accepted: group?.accepted ?? false,
              count: group?.block_count ?? 3,
              minutes: group?.block_minutes ?? 120,
            }
          : null;
      normalized.push(normalizeActivity(dto, a.confirmedAt, settings));
      activityRevisions[a.id] = a.revision;
    }
    const range = horizon(
      this.academics.now(),
      p.endDate,
      p.timezone ?? zone,
      normalized.map((a) => a.deadline),
    );
    const windows: Span[] = [],
      occupied: Span[] = [],
      coverage: Span[] = [];
    const sourceIssues = new Set<string>();
    let known = configuration.configuration !== null;
    let sourceFreshUntil: number | null = null;
    if (zone && range.end > range.start) {
      let date = Temporal.PlainDate.from(localDay(range.start, zone));
      const until = Temporal.PlainDate.from(localDay(range.end - 1, zone)).add({
        days: 1,
      });
      while (Temporal.PlainDate.compare(date, until) < 0) {
        checkReadBudget();
        const next =
          Temporal.PlainDate.compare(date.add({ days: 31 }), until) < 0
            ? date.add({ days: 31 })
            : until;
        const capacity = await this.availability.capacityIn(
          ctx,
          id,
          date.toString(),
          next.toString(),
          override?.activity_id ?? null,
        );
        windows.push(
          ...capacity.available.map((s) => ({
            start: instantMinute(s.startAt),
            end: instantMinute(s.endAt, "end"),
          })),
        );
        occupied.push(
          ...capacity.occupied.map((s) => ({
            start: instantMinute(s.startAt, "end"),
            end: instantMinute(s.endAt),
          })),
        );
        coverage.push(
          ...capacity.verified.map((s) => ({
            start: instantMinute(s.startAt),
            end: instantMinute(s.endAt, "end"),
          })),
        );
        known &&= capacity.certainty === "known";
        for (const issue of capacity.issues) sourceIssues.add(issue.code);
        if (capacity.sourceValidUntil !== null)
          sourceFreshUntil = Math.min(
            sourceFreshUntil ?? Infinity,
            Math.floor(capacity.sourceValidUntil / 60000),
          );
        date = next;
      }
    } else if (!zone) {
      known = false;
      sourceIssues.add("STUDY_TIMEZONE_UNKNOWN");
    }
    for (const a of normalized)
      if (a.evaluationEnd !== null && a.deadline !== null)
        occupied.push({ start: a.deadline, end: a.evaluationEnd });
    const stored = await query<StoredSession>(
      ctx,
      sql`select * from app.sessions where owner_id=${ctx.owner} and period_id=${id} order by start_at,id`,
    );
    const equivalents = await query<EquivalenceRow>(
      ctx,
      sql`select e.* from app.group_equivalences e join app.activities a on a.id=e.activity_id
      where e.owner_id=${ctx.owner} and a.period_id=${id} order by e.id`,
    );
    const equivalences: Snapshot["equivalences"] = [];
    for (const e of equivalents) {
      const span = {
        start: instantMinute(new Date(e.start_at).toISOString()),
        end: instantMinute(new Date(e.end_at).toISOString(), "end"),
      };
      const current = await this.sourceCoverage(ctx, e.calendar_id, span);
      equivalences.push({
        ...span,
        id: e.id,
        activityId: e.activity_id,
        sourceId: e.calendar_id,
        valid:
          !!current?.valid &&
          current.connectionRevision === e.connection_revision &&
          current.selectionRevision === e.selection_revision,
      });
    }
    const preferences = configuration.configuration?.preferences;
    return {
      periodId: id,
      workspaceRevision: p.workspaceRevision,
      planRevision: p.planRevision,
      activityRevisions,
      reversibleCancellationIds: stored
        .filter(
          (s) => s.state === "cancelled" && s.cancel_reason === "replanned",
        )
        .map((s) => s.id),
      sessionRevisions: Object.fromEntries(
        stored.map((s) => [s.id, s.revision]),
      ),
      snapshot: {
        now: range.start,
        end: range.end,
        timezone: zone,
        provisionalHorizon: range.provisional,
        availabilityKnown: known,
        sourceFreshUntil,
        windows: union(windows),
        occupied: union(occupied),
        coverage: union(coverage),
        sourceIssues: [...sourceIssues].sort(),
        activities: normalized,
        sessions: stored.map(asSession),
        equivalences,
        preferences: preferences
          ? {
              minimum: preferences.minimumMinutes,
              preferred: preferences.preferredMinutes,
              maximum: preferences.maximumMinutes,
            }
          : null,
        scope:
          command.kind === "recalculate" ? (command.activityId ?? null) : null,
      },
    };
  }

  async proposalRow(ctx: Context, id: string) {
    const [row] = await query<ProposalRow>(
      ctx,
      sql`select * from app.planning_proposals where owner_id=${ctx.owner} and id=${id}`,
    );
    if (!row) throw notFound();
    return row;
  }
  proposalDto(row: ProposalRow) {
    const old = row.snapshot.snapshot.sessions;
    const next = row.result.sessions;
    const revisions = Object.fromEntries(
      next.map((s) => {
        const before = old.find((before) => before.id === s.id);
        return [
          s.id,
          (row.snapshot.sessionRevisions[s.id] ?? 0) +
            (before && sameSession(before, s) ? 0 : 1),
        ];
      }),
    );
    return {
      id: row.id,
      periodId: row.period_id,
      workspaceRevision: row.workspace_revision,
      planRevision: row.plan_revision,
      state: row.state,
      command: row.command,
      before: old.map((s) =>
        sessionDto(s, row.snapshot.sessionRevisions[s.id]),
      ),
      after: resultDto(row.result, revisions),
      requiredConfirmations: row.required_confirmations,
      inputHash: row.input_hash,
      differences: {
        added: next
          .filter((s) => !old.some((o) => o.id === s.id))
          .map((s) => s.id),
        removed: old
          .filter((s) => !next.some((n) => n.id === s.id))
          .map((s) => s.id),
        changed: next
          .filter((s) => old.some((o) => o.id === s.id && !sameSession(o, s)))
          .map((s) => s.id),
      },
    };
  }
  private calculate(state: Envelope, command: PlanningCommand) {
    if (
      command.kind === "recalculate" &&
      command.activityId &&
      !state.snapshot.activities.some((a) => a.id === command.activityId)
    )
      throw notFound();
    return calculatePlan(state.snapshot);
  }

  private async commandResult(
    ctx: Context,
    state: Envelope,
    command: Exclude<
      PlanningCommand,
      { kind: "recalculate" | "academic_date" }
    >,
  ): Promise<Result> {
    const s = state.snapshot;
    if (command.kind === "undo") {
      const current = await this.latest(ctx, state.periodId);
      if (!current?.previous_version_id)
        throw invalid(
          "UNDO_UNAVAILABLE",
          "Todavía no hay una distribución anterior para restaurar.",
        );
      const [previous] = await query<VersionRow>(
        ctx,
        sql`select * from app.plan_versions where owner_id=${ctx.owner} and id=${current.previous_version_id}`,
      );
      const restored = new Map(previous.result.sessions.map((s) => [s.id, s]));
      for (const current of s.sessions) {
        if (
          retained(s, current) &&
          !state.reversibleCancellationIds.includes(current.id)
        )
          restored.set(current.id, current);
      }
      const desired = [...restored.values()];
      return describe(this.undoSnapshot(state, desired), desired);
    }
    const current = s.sessions.find(
      (session) => session.id === command.sessionId,
    );
    if (!current) throw notFound();
    requireRevision(
      `"session-${command.revision}"`,
      "session",
      state.sessionRevisions[current.id],
    );
    if (current.state !== "planned")
      throw invalid("SESSION_NOT_ACTIVE", "La sesión ya se cerró o canceló.");
    let next = { ...current };
    if (command.kind === "move") {
      const start = exactMinute(command.startAt),
        end = exactMinute(command.endAt);
      if (end - start !== duration(current))
        throw invalid(
          "SESSION_DURATION_CHANGED",
          "Conserva la duración al mover la sesión.",
        );
      next = { ...next, start, end, fixed: true };
    } else if (command.kind === "fix") next.fixed = command.fixed;
    else {
      if (command.state === "completed" && current.end > s.now)
        throw invalid(
          "FUTURE_SESSION_COMPLETION",
          "Confirma la realización después de terminar el intervalo.",
        );
      next.state = command.state;
    }
    // The explicit command authorizes this one retained-session edit only.
    const expected = {
      ...s,
      sessions: s.sessions.map((item) =>
        item.id === current.id ? next : item,
      ),
    };
    return describe(expected, expected.sessions);
  }
  confirmations(state: Envelope, result: Result, command: PlanningCommand) {
    const required: ApplyInput["confirmations"] = [];
    if (result.state !== "viable" && result.state !== "empty")
      required.push("accept_partial_plan");
    if (
      result.diagnostics.some(
        (d) =>
          d.sessionId &&
          state.snapshot.sessions.some(
            (s) =>
              s.id === d.sessionId &&
              (retained(state.snapshot, s) ||
                ("sessionId" in command && s.id !== command.sessionId)),
          ),
      )
    )
      required.push("keep_fixed_conflicts");
    if (result.sessions.some((s) => s.kind === "group" && !s.accepted))
      required.push("group_reservations");
    if (command.kind === "academic_date") required.push("academic_date_change");
    if (
      (command.kind === "fix" && !command.fixed) ||
      (command.kind === "session_state" &&
        state.snapshot.sessions.find((s) => s.id === command.sessionId)?.fixed)
    )
      required.push("release_fixed_sessions");
    return required;
  }
  async preview(
    owner: string,
    periodId: string,
    key: string | undefined,
    version: string | undefined,
    command: PlanningCommand,
  ) {
    const operation = `planning-preview:${periodId}`;
    const input = { version, command };
    const existing = await this.academics.read(owner, (ctx) =>
      this.academics.replayIn(ctx, operation, key, input),
    );
    if (existing) return existing;
    const state = await this.academics.read(owner, async (ctx) => {
      const current = await this.snapshot(ctx, periodId, command);
      requireRevision(version, "workspace", current.workspaceRevision);
      return current;
    });
    // Pure CPU calculation occurs outside the owner transaction.
    const result = await this.commandResultOutside(owner, state, command);
    return this.academics.mutate(owner, operation, key, input, async (ctx) => {
      const p = await this.academics.requirePeriod(ctx, periodId);
      requireRevision(version, "workspace", p.workspaceRevision);
      if (p.planRevision !== state.planRevision)
        throw new DomainError(
          412,
          "PLAN_CHANGED",
          "La distribución cambió. Calcula una nueva vista previa.",
        );
      const id = randomUUID();
      await ctx.db
        .execute(sql`insert into app.planning_proposals(id,owner_id,period_id,workspace_revision,plan_revision,snapshot,result,command,required_confirmations,input_hash,created_at)
        values(${id},${owner},${periodId},${state.workspaceRevision},${state.planRevision},${json(state)},${json(result)},${json(command)},
          ${json(this.confirmations(state, result, command))},${digest({ state, command })},${this.academics.now().toISOString()})`);
      return {
        status: 201,
        data: this.proposalDto(await this.proposalRow(ctx, id)),
        etag: `"workspace-${state.workspaceRevision}"`,
      };
    });
  }
  private commandResultOutside(
    owner: string,
    state: Envelope,
    command: PlanningCommand,
  ) {
    if (command.kind === "recalculate" || command.kind === "academic_date")
      return this.calculate(state, command);
    return this.academics.read(owner, (ctx) =>
      this.commandResult(ctx, state, command),
    );
  }
  private undoSnapshot(state: Envelope, desired: Session[]): Snapshot {
    return {
      ...state.snapshot,
      sessions: state.snapshot.sessions.filter(
        (s) =>
          !state.reversibleCancellationIds.includes(s.id) ||
          !desired.some((next) => next.id === s.id && next.state === "planned"),
      ),
    };
  }
  async getProposal(owner: string, id: string) {
    return this.academics.read(owner, async (ctx) =>
      this.proposalDto(await this.proposalRow(ctx, id)),
    );
  }

  async apply(
    owner: string,
    id: string,
    key: string | undefined,
    version: string | undefined,
    input: ApplyInput,
    claim?: PlanningClaim,
  ) {
    return this.academics.mutate(
      owner,
      `planning-apply:${id}`,
      key,
      { version, input },
      async (ctx) => {
        const proposal = await this.proposalRow(ctx, id);
        if (proposal.state !== "pending")
          throw new DomainError(
            409,
            "PROPOSAL_ALREADY_APPLIED",
            "Esta distribución ya se aplicó.",
          );
        if (claim) {
          const active = await query<{ period_id: string }>(
            ctx,
            sql`select period_id from app.planning_jobs where owner_id=${owner}
          and period_id=${proposal.period_id} and workspace_revision=${claim.workspace_revision} and lease_token=${claim.lease_token}
          and lease_until>${this.academics.now().toISOString()}::timestamptz and status='running' for update`,
          );
          if (!active.length)
            throw new DomainError(
              412,
              "PLANNING_LEASE_LOST",
              "La recalculación ya tiene una versión más reciente.",
            );
        }
        const current = await this.snapshot(
          ctx,
          proposal.period_id,
          proposal.command,
        );
        requireRevision(version, "workspace", current.workspaceRevision);
        if (
          current.workspaceRevision !== proposal.workspace_revision ||
          current.planRevision !== proposal.plan_revision
        )
          throw new DomainError(
            412,
            "REVISION_MISMATCH",
            "Cambiaron datos o sesiones. Revisa una propuesta nueva.",
          );
        const required = proposal.required_confirmations;
        if (
          required.some(
            (confirmation) => !input.confirmations.includes(confirmation),
          ) ||
          input.confirmations.some(
            (confirmation) => !required.includes(confirmation),
          )
        )
          throw invalid(
            "CONFIRMATIONS_REQUIRED",
            "Revisa y confirma el alcance exacto de esta propuesta.",
          );
        const result = {
          ...proposal.result,
          sessions: proposal.result.sessions.map((s) => ({
            ...s,
            accepted:
              s.kind === "group" &&
              input.confirmations.includes("group_reservations")
                ? true
                : s.accepted,
          })),
        };
        let expected =
          proposal.command.kind === "undo"
            ? this.undoSnapshot(current, result.sessions)
            : current.snapshot;
        const command = proposal.command;
        if (
          command.kind === "move" ||
          command.kind === "fix" ||
          command.kind === "session_state"
        ) {
          expected = {
            ...expected,
            sessions: expected.sessions.map((s) =>
              s.id === command.sessionId
                ? result.sessions.find((n) => n.id === s.id)!
                : s,
            ),
          };
        }
        const validation = validateSessions(expected, result.sessions);
        if (command.kind === "undo" && validation.issues.length)
          throw invalid(
            "UNDO_REVALIDATION_FAILED",
            "La distribución anterior entra en conflicto con las restricciones vigentes.",
          );
        const editedId = "sessionId" in command ? command.sessionId : null;
        const originallyRetained = current.snapshot.sessions
          .filter(
            (s) =>
              retained(current.snapshot, s) ||
              (editedId !== null && s.id !== editedId),
          )
          .map((s) => s.id);
        const unacceptable = validation.issues.filter(
          (issue) =>
            issue.code === "PRESERVED_SESSION_CHANGED" ||
            issue.code === "SESSION_OUTSIDE_SCOPE" ||
            !issue.sessionId ||
            !originallyRetained.includes(issue.sessionId) ||
            issue.sessionId === editedId,
        );
        if (unacceptable.length)
          throw invalid(
            "PLAN_REVALIDATION_FAILED",
            "La distribución ya no cumple las restricciones vigentes. Revisa una nueva propuesta.",
          );
        const checked = describe(
          expected,
          result.sessions,
          result.exploredStates,
          result.searchLimited,
        );
        const rechecked = this.confirmations(current, checked, command);
        if (rechecked.some((confirmation) => !required.includes(confirmation)))
          throw new DomainError(
            412,
            "PLAN_CONFIRMATIONS_CHANGED",
            "Cambiaron las condiciones de planificación. Revisa una propuesta nueva.",
          );
        if (command.kind === "academic_date")
          await this.academics.applyDateProposalIn(
            ctx,
            command.proposalId,
            version,
          );
        const accepting = new Set(
          proposal.result.sessions
            .filter(
              (s) => s.kind === "group" && !s.accepted && s.state === "planned",
            )
            .map((s) => s.activityId),
        );
        if (input.confirmations.includes("group_reservations")) {
          for (const a of expected.activities.filter(
            (a) => a.group && accepting.has(a.id),
          )) {
            await ctx.db
              .execute(sql`insert into app.group_reservation_settings(activity_id,owner_id,enabled,accepted,block_count,block_minutes)
            values(${a.id},${owner},${a.group!.enabled},true,${a.group!.count},${a.group!.minutes}) on conflict(activity_id)
            do update set accepted=true,revision=app.group_reservation_settings.revision+1`);
            await ctx.db.execute(
              sql`update app.activities set revision=revision+1 where owner_id=${owner} and id=${a.id}`,
            );
          }
        }
        const after = describe(
          {
            ...expected,
            activities: expected.activities.map((a) =>
              a.group && accepting.has(a.id)
                ? { ...a, group: { ...a.group, accepted: true } }
                : a,
            ),
          },
          result.sessions,
          result.exploredStates,
          result.searchLimited,
        );
        await this.persist(ctx, current, after);
        await ctx.db.execute(
          sql`update app.planning_proposals set state='applied' where owner_id=${owner} and id=${id}`,
        );
        return {
          status: 200,
          data: await this.currentIn(ctx, proposal.period_id),
          etag: `"workspace-${(await this.academics.requirePeriod(ctx, proposal.period_id)).workspaceRevision}"`,
        };
      },
    );
  }
  async persist(ctx: Context, state: Envelope, result: Result) {
    const ids = result.sessions.map((s) => s.id);
    await ctx.db
      .execute(sql`update app.sessions set state='cancelled',cancel_reason='replanned',revision=revision+1 where owner_id=${ctx.owner} and period_id=${state.periodId}
      and state='planned' and id not in (select value::uuid from jsonb_array_elements_text(${json(ids)}))`);
    for (const s of result.sessions) {
      await ctx.db
        .execute(sql`insert into app.sessions(id,owner_id,period_id,activity_id,start_at,end_at,kind,fixed,accepted,state,cancel_reason)
        values(${s.id},${ctx.owner},${state.periodId},${s.activityId},${instant(s.start)},${instant(s.end)},${s.kind},${s.fixed},${s.accepted},${s.state},${s.state === "cancelled" ? "student" : null})
        on conflict(id) do update set start_at=excluded.start_at,end_at=excluded.end_at,fixed=excluded.fixed,accepted=excluded.accepted,state=excluded.state,cancel_reason=excluded.cancel_reason,revision=app.sessions.revision+1
        where app.sessions.owner_id=excluded.owner_id and app.sessions.period_id=excluded.period_id and app.sessions.activity_id=excluded.activity_id
        and (app.sessions.start_at,app.sessions.end_at,app.sessions.fixed,app.sessions.accepted,app.sessions.state)
          is distinct from (excluded.start_at,excluded.end_at,excluded.fixed,excluded.accepted,excluded.state)`);
    }
    const previous = await this.latest(ctx, state.periodId);
    await ctx.db
      .execute(sql`update app.academic_periods set workspace_revision=workspace_revision+1,plan_revision=plan_revision+1,
      updated_at=${this.academics.now().toISOString()} where owner_id=${ctx.owner} and id=${state.periodId}`);
    const p = await this.academics.requirePeriod(ctx, state.periodId);
    await ctx.db
      .execute(sql`insert into app.plan_versions(id,owner_id,period_id,workspace_revision,plan_revision,result,source_valid_until,previous_version_id,created_at)
      values(${randomUUID()},${ctx.owner},${state.periodId},${p.workspaceRevision},${p.planRevision},${json(result)},
        ${state.snapshot.sourceFreshUntil === null ? null : instant(state.snapshot.sourceFreshUntil)},${previous?.id ?? null},${this.academics.now().toISOString()})`);
    await ctx.db.execute(
      sql`update app.planning_jobs set status='done',lease_token=null,lease_until=null,review_required=false where owner_id=${ctx.owner} and period_id=${state.periodId}`,
    );
  }
  async currentIn(ctx: Context, id: string) {
    const state = await this.snapshot(ctx, id);
    const version = await this.latest(ctx, id);
    const [job] = await query<{
      proposal_id: string | null;
      status: string;
      safe_error: string | null;
    }>(
      ctx,
      sql`select proposal_id,status,safe_error from app.planning_jobs where owner_id=${ctx.owner} and period_id=${id}`,
    );
    const [lastApplied] = await query<{ id: string }>(
      ctx,
      sql`select id from app.planning_proposals where owner_id=${ctx.owner}
      and period_id=${id} and state='applied' and plan_revision=${state.planRevision - 1} order by created_at desc,id desc limit 1`,
    );
    const result = version
      ? describe(
          state.snapshot,
          state.snapshot.sessions,
          version.result.exploredStates,
          version.result.searchLimited,
        )
      : null;
    const stale =
      version &&
      (version.workspace_revision !== state.workspaceRevision ||
        (version.source_valid_until !== null &&
          Date.parse(new Date(version.source_valid_until).toISOString()) <
            this.academics.now().getTime()) ||
        result!.diagnostics.some((d) => d.code === "SESSION_IN_PAST"));
    return {
      periodId: id,
      workspaceRevision: state.workspaceRevision,
      planRevision: state.planRevision,
      state: !version ? "not_generated" : stale ? "stale" : "current",
      result: result ? resultDto(result, state.sessionRevisions) : null,
      pendingProposalId:
        job?.status === "needs_review" ? job.proposal_id : null,
      lastAppliedProposalId: lastApplied?.id ?? null,
      undoAvailable:
        version?.previous_version_id !== null &&
        version?.previous_version_id !== undefined,
      recalculation: job
        ? { state: job.status, errorCode: job.safe_error }
        : null,
    };
  }
  get(owner: string, id: string) {
    return this.academics.read(owner, (ctx) => this.currentIn(ctx, id));
  }

  weekly(owner: string, id: string, from: string, to: string) {
    return this.academics.read(owner, async (ctx) => {
      dates(from, to);
      const state = await this.snapshot(ctx, id);
      const activeState = await this.academics.planningState(ctx, id);
      const snapshot = state.snapshot;
      const [profile] = await ctx.db
        .select({ studyTimezone: users.studyTimezone })
        .from(users)
        .where(eq(users.id, owner));
      const zone = profile?.studyTimezone ?? snapshot.timezone;
      const result = describe(snapshot, snapshot.sessions);
      const { validIds } = validateSessions(snapshot, snapshot.sessions);
      const weeks = [];
      let week = Temporal.PlainDate.from(from);
      week = week.subtract({ days: week.dayOfWeek - 1 });
      while (week.toString() < to) {
        const next = week.add({ days: 7 });
        const startDate = week.toString(),
          endDate = next.toString();
        const start = startDate < from ? from : startDate;
        const end = endDate > to ? to : endDate;
        const deadlineActivityIds = snapshot.activities
          .filter((a) => a.dueDate >= start && a.dueDate < end)
          .map((a) => a.id);
        const range = zone
          ? {
              start: dayBoundary(start, zone) / 60000,
              end: dayBoundary(end, zone) / 60000,
            }
          : null;
        const sessions = range
          ? snapshot.sessions.filter(
              (s) => s.state !== "cancelled" && overlaps(s, range),
            )
          : [];
        const visible = new Set([
          ...deadlineActivityIds,
          ...sessions.map((s) => s.activityId),
        ]);
        const issues = result.diagnostics.filter(
          (d) => d.activityId === null || visible.has(d.activityId),
        );
        const selectedBalances = result.balances.filter((b) =>
          deadlineActivityIds.includes(b.activityId),
        );
        const utilization = (kind: Session["kind"], span = range) =>
          span
            ? minutes(
                intersect(
                  sessions.filter((s) => s.kind === kind && validIds.has(s.id)),
                  [span],
                ),
              )
            : 0;
        const activityDates = new Map(snapshot.activities.map((activity) => [activity.id, activity.dueDate]));
        const days = [];
        for (let day = Temporal.PlainDate.from(start); day.toString() < end; day = day.add({ days: 1 })) {
          const date = day.toString();
          const span = zone ? {
            start: dayBoundary(date, zone) / 60000,
            end: dayBoundary(day.add({ days: 1 }).toString(), zone) / 60000,
          } : null;
          const balances = selectedBalances.filter((balance) => activityDates.get(balance.activityId) === date);
          days.push({
            date,
            capacityMinutes: span && snapshot.availabilityKnown ? minutes(intersect(snapshot.windows, [span])) : null,
            studyMinutes: utilization("study", span),
            groupMinutes: utilization("group", span),
            unplacedMinutes: balances.some((balance) => balance.unplaced === null)
              ? null
              : balances.reduce((sum, balance) => sum + (balance.unplaced ?? 0), 0),
          });
        }
        const incompleteActivityIds = [
          ...new Set(
            issues
              .filter((d) => d.kind === "pending" && d.activityId !== null)
              .map((d) => d.activityId!),
          ),
        ];
        weeks.push({
          startDate,
          endDate,
          deadlineActivityIds,
          sessions: sessions.map((s) =>
            sessionDto(s, state.sessionRevisions[s.id]),
          ),
          capacityMinutes:
            range && snapshot.availabilityKnown
              ? minutes(intersect(snapshot.windows, [range]))
              : null,
          studyMinutes: utilization("study"),
          groupMinutes: utilization("group"),
          days,
          incompleteActivityIds,
          unplacedMinutes: selectedBalances.some((b) => b.unplaced === null)
            ? null
            : selectedBalances.reduce((n, b) => n + (b.unplaced ?? 0), 0),
          state: !visible.size
            ? "empty"
            : issues.some((d) => d.kind === "conflict")
              ? "conflict"
              : issues.some((d) => d.kind === "deficit")
                ? "deficit"
                : !zone ||
                    activeState !== "current" ||
                    issues.length ||
                    selectedBalances.some((b) => b.unplaced !== 0)
                  ? "partial"
                  : "viable",
        });
        week = next;
      }
      return { periodId: id, from, to, timezone: zone, weeks };
    });
  }

  async groupIn(ctx: Context, id: string) {
    const a = await this.academics.requireActivity(ctx, id);
    if (a.type !== "Entrega grupal")
      throw invalid(
        "GROUP_ACTIVITY_REQUIRED",
        "Selecciona una entrega grupal.",
      );
    const [g] = await query<GroupRow>(
      ctx,
      sql`select * from app.group_reservation_settings where owner_id=${ctx.owner} and activity_id=${id}`,
    );
    const rows = await query<EquivalenceRow>(
      ctx,
      sql`select * from app.group_equivalences where owner_id=${ctx.owner} and activity_id=${id} order by id`,
    );
    const equivalences = [];
    for (const e of rows) {
      const span = {
        start: instantMinute(new Date(e.start_at).toISOString()),
        end: instantMinute(new Date(e.end_at).toISOString()),
      };
      const current = await this.sourceCoverage(ctx, e.calendar_id, span);
      equivalences.push({
        id: e.id,
        sourceId: e.calendar_id,
        startAt: instant(span.start),
        endAt: instant(span.end),
        valid:
          !!current?.valid &&
          current.connectionRevision === e.connection_revision &&
          current.selectionRevision === e.selection_revision,
      });
    }
    return {
      activityId: id,
      activityRevision: a.revision,
      revision: g?.revision ?? 0,
      enabled: g?.enabled ?? true,
      accepted: g?.accepted ?? false,
      count: g?.block_count ?? 3,
      minutes: g?.block_minutes ?? 120,
      equivalences,
    };
  }
  getGroup(owner: string, id: string) {
    return this.academics.read(owner, (ctx) => this.groupIn(ctx, id));
  }
  saveGroup(
    owner: string,
    id: string,
    key: string | undefined,
    version: string | undefined,
    input: GroupSettings,
  ) {
    return this.academics.mutate(
      owner,
      `group:${id}`,
      key,
      { version, input },
      async (ctx) => {
        const a = await this.academics.requireActivity(ctx, id);
        requireRevision(version, "activity", a.revision);
        await this.groupIn(ctx, id);
        await ctx.db
          .execute(sql`insert into app.group_reservation_settings(activity_id,owner_id,enabled,accepted,block_count,block_minutes)
        values(${id},${owner},${input.enabled},${input.accepted},${input.count},${input.minutes}) on conflict(activity_id)
        do update set enabled=excluded.enabled,accepted=excluded.accepted,block_count=excluded.block_count,block_minutes=excluded.block_minutes,revision=app.group_reservation_settings.revision+1`);
        await ctx.db.execute(
          sql`update app.activities set revision=revision+1 where owner_id=${owner} and id=${id}`,
        );
        if (!input.enabled) {
          await ctx.db
            .execute(sql`update app.sessions set state='cancelled',cancel_reason='student',revision=revision+1
          where owner_id=${owner} and activity_id=${id} and state='planned' and not fixed
          and kind='group' and start_at>=${this.academics.now().toISOString()}::timestamptz`);
        }
        await this.academics.touch(ctx, a.periodId);
        return {
          status: 200,
          data: await this.groupIn(ctx, id),
          etag: `"activity-${a.revision + 1}"`,
        };
      },
    );
  }
  equivalence(
    owner: string,
    id: string,
    key: string | undefined,
    version: string | undefined,
    input: Equivalence | { removeId: string },
  ) {
    return this.academics.mutate(
      owner,
      `group-equivalence:${id}`,
      key,
      { version, input },
      async (ctx) => {
        const a = await this.academics.requireActivity(ctx, id);
        requireRevision(version, "activity", a.revision);
        await this.groupIn(ctx, id);
        if ("removeId" in input) {
          const deleted = await ctx.db.execute(
            sql`delete from app.group_equivalences where owner_id=${owner} and activity_id=${id} and id=${input.removeId} returning id`,
          );
          if (!deleted.rows.length) throw notFound();
        } else {
          const span = {
            start: exactMinute(input.startAt),
            end: exactMinute(input.endAt),
          };
          const start = a.allowedStartAt
            ? instantMinute(a.allowedStartAt)
            : null;
          const deadline = academicMinute(
            a.dueDate,
            a.dueTime?.slice(0, 5) ?? null,
            a.timezone,
          );
          if (
            span.end <= span.start ||
            start === null ||
            deadline === null ||
            span.start <
              Math.max(
                start,
                instantMinute(this.academics.now().toISOString()),
              ) ||
            span.end > deadline ||
            span.end - span.start > 31 * 1440
          )
            throw invalid(
              "INVALID_GROUP_EQUIVALENCE",
              "Confirma un intervalo futuro dentro del inicio y plazo grupal.",
            );
          if (
            !(await this.calendar.sourceRows(ctx)).some(
              (source) => source.id === input.sourceId,
            )
          )
            throw notFound();
          const source = await this.sourceCoverage(ctx, input.sourceId, span);
          if (!source?.valid)
            throw invalid(
              "GROUP_SOURCE_NOT_VERIFIED",
              "Selecciona ocupación vigente de un calendario elegido.",
            );
          const overlaps = await query<{ id: string }>(
            ctx,
            sql`select id from app.group_equivalences where owner_id=${owner}
          and start_at<${instant(span.end)}::timestamptz and end_at>${instant(span.start)}::timestamptz`,
          );
          if (overlaps.length)
            throw invalid(
              "GROUP_EQUIVALENCE_ALREADY_USED",
              "Ese intervalo ya cubre una reserva. Divide el tramo expresamente.",
            );
          await ctx.db
            .execute(sql`insert into app.group_equivalences(id,owner_id,activity_id,calendar_id,start_at,end_at,connection_revision,selection_revision)
          values(${randomUUID()},${owner},${id},${input.sourceId},${instant(span.start)},${instant(span.end)},${source.connectionRevision},${source.selectionRevision})`);
        }
        await ctx.db.execute(
          sql`update app.activities set revision=revision+1 where owner_id=${owner} and id=${id}`,
        );
        await this.academics.touch(ctx, a.periodId);
        return {
          status: 200,
          data: await this.groupIn(ctx, id),
          etag: `"activity-${a.revision + 1}"`,
        };
      },
    );
  }
}
