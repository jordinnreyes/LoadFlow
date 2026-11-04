import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type { Context, Academics } from "../academics/service.js";
import {
  invalid,
  requireRevision,
  utcInstant,
  timezone,
} from "../academics/policy.js";
import { notFound } from "../../errors.js";
import type { CalendarService } from "../calendar/service.js";
import { INPUT_POLICY_VERSION } from "../../../packages/contracts/planning-inputs.js";
import type {
  AvailabilityConfig,
  CopyInput,
  CommitmentCreate,
  CommitmentEdit,
  CapacityDto,
} from "../../../packages/contracts/availability.js";
import {
  validateConfiguration,
  dates,
  dayBoundary,
  nextDate,
  resolveWindows,
  subtract,
  union,
  isoSpans,
  type Span,
} from "./rules.js";
type PreferencesRow = {
  timezone: string;
  valid_from: string;
  valid_to: string | null;
  day_states: AvailabilityConfig["weekly"][number]["state"][];
  min_minutes: number;
  preferred_minutes: number;
  max_minutes: number;
  revision: number;
};
type CommitmentRow = {
  id: string;
  period_id: string;
  title: string;
  start_at: Date;
  end_at: Date;
  timezone: string;
  revision: number;
};
const query = async <T>(ctx: Context, statement: SQL) =>
  (await ctx.db.execute(statement)).rows as unknown as T[];
const commitmentDto = (r: CommitmentRow) => ({
  id: r.id,
  periodId: r.period_id,
  title: r.title,
  startAt: new Date(r.start_at).toISOString(),
  endAt: new Date(r.end_at).toISOString(),
  timezone: r.timezone,
  revision: r.revision,
  source: "manual" as const,
});
export class AvailabilityService {
  constructor(
    readonly academics: Academics,
    readonly calendar?: () => CalendarService,
  ) {}
  async configuration(ctx: Context, periodId: string) {
    const row = (
      await query<PreferencesRow>(
        ctx,
        sql`select * from app.planning_preferences where owner_id=${ctx.owner} and period_id=${periodId}`,
      )
    )[0];
    if (!row) return { configuration: null, revision: 0 };
    const windows = await query<{
      weekday: number;
      local_start_minutes: number;
      local_end_minutes: number;
    }>(
      ctx,
      sql`select weekday,local_start_minutes,local_end_minutes from app.study_windows where owner_id=${ctx.owner} and period_id=${periodId} order by weekday,local_start_minutes,local_end_minutes`,
    );
    const exceptions = await query<{
      local_date: string;
      mode: AvailabilityConfig["exceptions"][number]["mode"];
      intervals: AvailabilityConfig["exceptions"][number]["intervals"];
    }>(
      ctx,
      sql`select local_date,mode,intervals from app.availability_exceptions where owner_id=${ctx.owner} and period_id=${periodId} order by local_date`,
    );
    const coverage = await query<{ range_start: string; range_end: string }>(
      ctx,
      sql`select range_start,range_end from app.manual_coverage where owner_id=${ctx.owner} and period_id=${periodId} order by range_start,range_end`,
    );
    const configuration: AvailabilityConfig = {
      confirmed: true,
      timezone: row.timezone,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      weekly: row.day_states.map((state, index) => ({
        weekday: index + 1,
        state,
        intervals: windows
          .filter((w) => w.weekday === index + 1)
          .map((w) => ({
            startMinute: w.local_start_minutes,
            endMinute: w.local_end_minutes,
          })),
      })),
      exceptions: exceptions.map((e) => ({
        date: e.local_date,
        mode: e.mode,
        intervals: e.intervals,
      })),
      manualCoverage: coverage.map((r) => ({
        from: r.range_start,
        to: r.range_end,
      })),
      preferences: {
        minimumMinutes: row.min_minutes,
        preferredMinutes: row.preferred_minutes,
        maximumMinutes: row.max_minutes,
      },
    };
    return { configuration, revision: row.revision };
  }
  async view(ctx: Context, id: string) {
    const period = await this.academics.requirePeriod(ctx, id);
    const data = await this.configuration(ctx, id);
    return {
      periodId: id,
      configured: data.configuration !== null,
      ...data,
      workspaceRevision: period.workspaceRevision,
      planningState: "not_generated" as const,
    };
  }
  get(owner: string, id: string) {
    return this.academics.read(owner, (ctx) => this.view(ctx, id));
  }
  async changed(
    ctx: Context,
    id: string,
    kind: string,
    summary: Record<string, unknown>,
  ) {
    await this.academics.touch(ctx, id);
    const period = await this.academics.requirePeriod(ctx, id);
    await ctx.db.execute(
      sql`insert into app.planning_input_changes(id,owner_id,period_id,workspace_revision,kind,summary) values(${randomUUID()},${ctx.owner},${id},${period.workspaceRevision},${kind},${JSON.stringify({ ...summary, policyVersion: INPUT_POLICY_VERSION, planningState: "not_generated", sessionsChanged: false })}::jsonb)`,
    );
  }
  async write(
    ctx: Context,
    id: string,
    input: AvailabilityConfig,
    revision: number,
    renewCoverage = true,
  ) {
    validateConfiguration(input);
    const weekly = [...input.weekly].sort((a, b) => a.weekday - b.weekday),
      p = input.preferences;
    const previous = renewCoverage
      ? []
      : await query<{
          range_start: string;
          range_end: string;
          confirmed_at: Date;
        }>(
          ctx,
          sql`select range_start,range_end,confirmed_at from app.manual_coverage where owner_id=${ctx.owner} and period_id=${id}`,
        );
    await ctx.db.execute(
      sql`insert into app.planning_preferences(period_id,owner_id,timezone,valid_from,valid_to,day_states,min_minutes,preferred_minutes,max_minutes,revision) values(${id},${ctx.owner},${input.timezone},${input.validFrom},${input.validTo},${JSON.stringify(weekly.map((d) => d.state))}::jsonb,${p.minimumMinutes},${p.preferredMinutes},${p.maximumMinutes},${revision}) on conflict(period_id) do update set timezone=excluded.timezone,valid_from=excluded.valid_from,valid_to=excluded.valid_to,day_states=excluded.day_states,min_minutes=excluded.min_minutes,preferred_minutes=excluded.preferred_minutes,max_minutes=excluded.max_minutes,revision=excluded.revision`,
    );
    await ctx.db.execute(
      sql`delete from app.study_windows where owner_id=${ctx.owner} and period_id=${id}`,
    );
    await ctx.db.execute(
      sql`delete from app.availability_exceptions where owner_id=${ctx.owner} and period_id=${id}`,
    );
    await ctx.db.execute(
      sql`delete from app.manual_coverage where owner_id=${ctx.owner} and period_id=${id}`,
    );
    for (const d of weekly)
      for (const i of d.intervals)
        await ctx.db.execute(
          sql`insert into app.study_windows(id,owner_id,period_id,weekday,local_start_minutes,local_end_minutes,timezone,valid_from,valid_to) values(${randomUUID()},${ctx.owner},${id},${d.weekday},${i.startMinute},${i.endMinute},${input.timezone},${input.validFrom},${input.validTo})`,
        );
    for (const e of input.exceptions)
      await ctx.db.execute(
        sql`insert into app.availability_exceptions(id,owner_id,period_id,local_date,mode,intervals) values(${randomUUID()},${ctx.owner},${id},${e.date},${e.mode},${JSON.stringify(e.intervals)}::jsonb)`,
      );
    for (const r of input.manualCoverage)
      await ctx.db.execute(
        sql`insert into app.manual_coverage(id,owner_id,period_id,range_start,range_end,timezone,source_revision,confirmed_at) values(${randomUUID()},${ctx.owner},${id},${r.from},${r.to},${input.timezone},${revision},${new Date(previous.find((p) => p.range_start === r.from && p.range_end === r.to)?.confirmed_at ?? this.academics.now()).toISOString()})`,
      );
  }
  save(
    owner: string,
    id: string,
    key: string | undefined,
    version: string | undefined,
    input: AvailabilityConfig,
  ) {
    return this.academics.mutate(
      owner,
      `availability:${id}`,
      key,
      { input, version },
      async (ctx) => {
        const old = await this.view(ctx, id);
        requireRevision(version, "availability", old.revision);
        await this.write(ctx, id, input, old.revision + 1);
        await this.changed(ctx, id, "availability_changed", {
          beforeRevision: old.revision,
          afterRevision: old.revision + 1,
          before: old.configuration,
          after: input,
          sessionsChanged: false,
        });
        return {
          status: 200,
          data: await this.view(ctx, id),
          etag: `"availability-${old.revision + 1}"`,
        };
      },
    );
  }
  copy(
    owner: string,
    id: string,
    key: string | undefined,
    version: string | undefined,
    input: CopyInput,
  ) {
    return this.academics.mutate(
      owner,
      `availability-copy:${id}`,
      key,
      { input, version },
      async (ctx) => {
        const old = await this.view(ctx, id);
        requireRevision(version, "availability", old.revision);
        if (!old.configuration)
          throw invalid(
            "AVAILABILITY_REQUIRED",
            "Configura primero la semana.",
          );
        if (input.targetWeekdays.includes(input.sourceWeekday))
          throw invalid(
            "COPY_SOURCE_TARGET",
            "Elige días de destino distintos del origen.",
          );
        const config = structuredClone(old.configuration),
          source = config.weekly.find(
            (d) => d.weekday === input.sourceWeekday,
          )!;
        for (const day of config.weekly.filter((d) =>
          input.targetWeekdays.includes(d.weekday),
        )) {
          if (input.mode === "replace") {
            day.state = source.state;
            day.intervals = structuredClone(source.intervals);
          } else {
            if (source.state !== "windows")
              throw invalid(
                "COPY_WINDOWS_REQUIRED",
                "Para combinar se necesitan ventanas en el origen.",
              );
            day.state = "windows";
            day.intervals = union(
              [...day.intervals, ...source.intervals].map((i) => ({
                start: i.startMinute,
                end: i.endMinute,
              })),
            ).map((i) => ({ startMinute: i.start, endMinute: i.end }));
          }
        }
        await this.write(ctx, id, config, old.revision + 1, false);
        await this.changed(ctx, id, "windows_copied", {
          sourceWeekday: input.sourceWeekday,
          targetWeekdays: input.targetWeekdays,
          mode: input.mode,
          before: old.configuration.weekly,
          after: config.weekly,
          sessionsChanged: false,
        });
        return {
          status: 200,
          data: await this.view(ctx, id),
          etag: `"availability-${old.revision + 1}"`,
        };
      },
    );
  }
  async requireCommitment(ctx: Context, id: string) {
    const row = (
      await query<CommitmentRow>(
        ctx,
        sql`select * from app.manual_commitments where owner_id=${ctx.owner} and id=${id}`,
      )
    )[0];
    if (!row) throw notFound();
    return row;
  }
  saveCommitment(
    owner: string,
    key: string | undefined,
    input: CommitmentCreate | CommitmentEdit,
    id?: string,
    version?: string,
  ) {
    return this.academics.mutate(
      owner,
      `commitment:${id ?? "new"}`,
      key,
      { input, version },
      async (ctx) => {
        const old = id ? await this.requireCommitment(ctx, id) : undefined;
        if (old) requireRevision(version, "commitment", old.revision);
        const create = input as CommitmentCreate,
          periodId = old?.period_id ?? create.periodId;
        await this.academics.requirePeriod(ctx, periodId);
        const title = (input.title ?? old!.title).trim(),
          start = utcInstant(
            input.startAt ?? new Date(old!.start_at).toISOString(),
          )!,
          end = utcInstant(input.endAt ?? new Date(old!.end_at).toISOString())!,
          zone = timezone(input.timezone ?? old!.timezone)!;
        if (!title || title.length > 200)
          throw invalid("INVALID_TITLE", "Confirma un título.");
        if (new Date(end) <= new Date(start))
          throw invalid(
            "INVALID_INTERVAL",
            "El compromiso necesita un fin posterior al inicio.",
          );
        const nextId = id ?? randomUUID(),
          revision = (old?.revision ?? 0) + 1;
        if (old)
          await ctx.db.execute(
            sql`update app.manual_commitments set title=${title},start_at=${start},end_at=${end},timezone=${zone},revision=${revision},updated_at=${this.academics.now().toISOString()} where owner_id=${owner} and id=${nextId}`,
          );
        else
          await ctx.db.execute(
            sql`insert into app.manual_commitments(id,owner_id,period_id,title,start_at,end_at,timezone) values(${nextId},${owner},${periodId},${title},${start},${end},${zone})`,
          );
        await this.changed(
          ctx,
          periodId,
          old ? "commitment_updated" : "commitment_created",
          {
            id: nextId,
            before: old
              ? {
                  startAt: new Date(old.start_at).toISOString(),
                  endAt: new Date(old.end_at).toISOString(),
                }
              : null,
            after: { startAt: start, endAt: end },
            sessionsChanged: false,
          },
        );
        return {
          status: old ? 200 : 201,
          data: commitmentDto(await this.requireCommitment(ctx, nextId)),
          etag: `"commitment-${revision}"`,
        };
      },
    );
  }
  deleteCommitment(
    owner: string,
    id: string,
    key: string | undefined,
    version: string | undefined,
  ) {
    return this.academics.mutate(
      owner,
      `commitment-delete:${id}`,
      key,
      { version },
      async (ctx) => {
        const old = await this.requireCommitment(ctx, id);
        requireRevision(version, "commitment", old.revision);
        await ctx.db.execute(
          sql`delete from app.manual_commitments where owner_id=${owner} and id=${id}`,
        );
        await this.changed(ctx, old.period_id, "commitment_deleted", {
          id,
          startAt: new Date(old.start_at).toISOString(),
          endAt: new Date(old.end_at).toISOString(),
          sessionsChanged: false,
        });
        return {
          status: 200,
          data: { deleted: true, id, planningState: "not_generated" },
        };
      },
    );
  }
  listCommitments(
    owner: string,
    input: {
      periodId: string;
      from: string;
      to: string;
      limit?: string;
      cursor?: string;
    },
  ) {
    return this.academics.read(owner, async (ctx) => {
      await this.academics.requirePeriod(ctx, input.periodId);
      const from = utcInstant(input.from)!,
        to = utcInstant(input.to)!;
      if (
        new Date(to) <= new Date(from) ||
        new Date(to).getTime() - new Date(from).getTime() > 32 * 86400000
      )
        throw invalid(
          "INVALID_RANGE",
          "Consulta compromisos por tramos de hasta 31 días locales.",
        );
      const size = Number(input.limit ?? 50);
      const rows = await query<CommitmentRow>(
        ctx,
        sql`select * from app.manual_commitments where owner_id=${owner} and period_id=${input.periodId} and start_at<${to}::timestamptz and end_at>${from}::timestamptz ${input.cursor ? sql`and id>${input.cursor}::uuid` : sql``} order by id limit ${size + 1}`,
      );
      return {
        items: rows.slice(0, size).map(commitmentDto),
        nextCursor: rows.length > size ? rows[size - 1].id : null,
      };
    });
  }
  capacity(owner: string, id: string, from: string, to: string) {
    return this.academics.read(owner, async (ctx) => {
      dates(from, to);
      const base = await this.view(ctx, id),
        c = base.configuration,
        now = this.academics.now();
      const result: CapacityDto = {
        periodId: id,
        workspaceRevision: base.workspaceRevision,
        availabilityRevision: base.revision,
        from,
        to,
        timezone: c?.timezone ?? null,
        asOf: now.toISOString(),
        certainty: "unknown",
        source: "manual",
        availableMinutes: null,
        provisionalMinutes: 0,
        available: [],
        occupied: [],
        issues: [],
        planningState: "not_generated",
      };
      if (!c) {
        result.issues.push({ code: "AVAILABILITY_UNKNOWN" });
        return result;
      }
      const start = dayBoundary(from, c.timezone),
        end = dayBoundary(to, c.timezone),
        resolved = resolveWindows(c, from, to, now);
      const calendar = this.calendar?.();
      const external = calendar
        ? await calendar.busy(
            ctx,
            new Date(start).toISOString(),
            new Date(end).toISOString(),
          )
        : null;
      const connection = calendar ? await calendar.connectionRow(ctx) : null;
      const manualRows = await query<{
        range_start: string;
        range_end: string;
        confirmed_at: Date;
      }>(
        ctx,
        sql`select range_start,range_end,confirmed_at from app.manual_coverage where owner_id=${owner} and period_id=${id}`,
      );
      const uncertainAfter = connection
        ? connection.state !== "active"
          ? new Date(connection.changed_at).getTime()
          : connection.safe_error
            ? new Date(
                connection.last_attempt_at ?? connection.changed_at,
              ).getTime()
            : external?.connection.state === "stale"
              ? Math.max(
                  new Date(connection.changed_at).getTime(),
                  connection.last_success_at
                    ? new Date(connection.last_success_at).getTime() + 1800000
                    : 0,
                )
              : external?.coverage !== "complete"
                ? new Date(
                    connection.last_attempt_at ?? connection.changed_at,
                  ).getTime()
                : 0
        : 0;
      const occupied = await query<{ start_at: Date; end_at: Date }>(
        ctx,
        sql`select start_at,end_at from app.manual_commitments where owner_id=${owner} and period_id=${id} and start_at<${new Date(end).toISOString()}::timestamptz and end_at>${new Date(start).toISOString()}::timestamptz union all select f.start_at,f.end_at from app.fixed_evaluations f join app.activities a on a.id=f.activity_id and a.owner_id=f.owner_id where f.owner_id=${owner} and a.period_id=${id} and f.start_at<${new Date(end).toISOString()}::timestamptz and f.end_at>${new Date(start).toISOString()}::timestamptz`,
      );
      const busy: Span[] = union(
        [
          ...occupied,
          ...(external?.busy ?? []).map((b) => ({
            start_at: new Date(b.startAt),
            end_at: new Date(b.endAt),
          })),
        ].map((b) => ({
          start: Math.max(
            start,
            Math.floor(new Date(b.start_at).getTime() / 60000) * 60000,
          ),
          end: Math.min(
            end,
            Math.ceil(new Date(b.end_at).getTime() / 60000) * 60000,
          ),
        })),
      );
      const available = subtract(resolved.windows, busy);
      const verified: Span[] = (external?.covered ?? []).map((b) => ({
        start: Date.parse(b.startAt),
        end: Date.parse(b.endAt),
      }));
      for (const date of dates(from, to))
        if (
          manualRows.some(
            (r) =>
              r.range_start <= date &&
              date < r.range_end &&
              new Date(r.confirmed_at).getTime() >= uncertainAfter,
          )
        )
          verified.push({
            start: dayBoundary(date, c.timezone),
            end: dayBoundary(nextDate(date), c.timezone),
          });
      result.issues.push(...resolved.issues);
      for (const date of dates(from, to)) {
        const dstart = dayBoundary(date, c.timezone),
          dend = dayBoundary(nextDate(date), c.timezone);
        if (
          subtract(
            resolved.windows
              .filter((w) => w.start < dend && w.end > dstart)
              .map((w) => ({
                start: Math.max(dstart, w.start),
                end: Math.min(dend, w.end),
              })),
            verified,
          ).length > 0
        )
          result.issues.push({
            code: connection
              ? "SOURCE_COVERAGE_UNKNOWN"
              : "MANUAL_COVERAGE_MISSING",
            date,
          });
      }
      result.source = connection ? "calendar_and_manual" : "manual";
      result.certainty = result.issues.length
        ? available.length
          ? "partial"
          : "unknown"
        : "known";
      result.available = isoSpans(available);
      result.occupied = isoSpans(busy);
      result.provisionalMinutes = available.reduce(
        (n, s) => n + (s.end - s.start) / 60000,
        0,
      );
      if (result.certainty === "known")
        result.availableMinutes = result.provisionalMinutes;
      return result;
    });
  }
}
