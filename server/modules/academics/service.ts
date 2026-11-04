import { reportProgress } from "../progress/service.js";
import { randomUUID, createHash } from "node:crypto";
import { and, eq, gt, asc, desc, sql, type SQL } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { ownerTransaction } from "../../db/client.js";
import {
  users,
  periods,
  courses,
  activities,
  priorityRules,
  progress,
  effortHistory,
  progressHistory,
} from "../../db/schema.js";
import { DomainError, notFound } from "../../errors.js";
import {
  timezone,
  civilDate,
  academicInstant,
  utcInstant,
  effortState,
  requireRevision,
  confirmReopening,
  completionDate,
  invalid,
} from "./policy.js";
import type {
  CreateActivity,
  EditActivity,
  ReportProgress,
  DateChange,
  ActivityDto,
} from "../../../packages/contracts/academics.js";

export type Context = { db: NodePgDatabase; owner: string };
type Result = { status: number; data: unknown; etag?: string };
type Page = { cursor?: string; limit?: string };
const stable = (v: unknown): string =>
  v === undefined
    ? "null"
    : v === null || typeof v !== "object"
      ? JSON.stringify(v)
      : Array.isArray(v)
        ? "[" + v.map(stable).join(",") + "]"
        : "{" +
          Object.keys(v)
            .sort()
            .map(
              (k) =>
                JSON.stringify(k) +
                ":" +
                stable((v as Record<string, unknown>)[k]),
            )
            .join(",") +
          "}";
const digest = (v: unknown) =>
  createHash("sha256").update(stable(v)).digest("hex");
async function query<T>(db: NodePgDatabase, statement: SQL) {
  return (await db.execute(statement)).rows as unknown as T[];
}
const clean = (value: string) => {
  const s = value.trim();
  if (!s) throw invalid("EMPTY_NAME", "Escribe un nombre o título.");
  return s;
};
const stamp = (v: string | null | undefined) =>
  v == null ? null : new Date(v).toISOString();
const periodDto = (p: typeof periods.$inferSelect) => ({
  id: p.id,
  name: p.name,
  startDate: p.startDate,
  endDate: p.endDate,
  timezone: p.timezone,
  revision: p.revision,
  workspaceRevision: p.workspaceRevision,
  isDefault: p.isDefault,
  planningState: "not_generated" as const,
});
const courseDto = (c: typeof courses.$inferSelect) => ({
  id: c.id,
  periodId: c.periodId,
  name: c.name,
  revision: c.revision,
});

export class Academics {
  constructor(
    readonly pool: pg.Pool,
    readonly now: () => Date = () => new Date(),
  ) {}
  async read<T>(owner: string, run: (ctx: Context) => Promise<T>) {
    return ownerTransaction(this.pool, owner, async (c) => {
      const db = drizzle(c);
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${owner},0))`,
      );
      return run({ db, owner });
    });
  }
  async mutate(
    owner: string,
    operation: string,
    key: string | undefined,
    input: unknown,
    run: (ctx: Context) => Promise<Result>,
  ) {
    if (!key || !/^[a-zA-Z0-9:_-]{1,128}$/.test(key))
      throw new DomainError(
        428,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Envía una clave de operación válida para guardar.",
      );
    return this.read(owner, async (ctx) => {
      const hash = digest(input);
      const saved = await query<{ request_hash: string; response: Result }>(
        ctx.db,
        sql`select request_hash,response from app.idempotency_records where owner_id=${owner} and operation=${operation} and key=${key}`,
      );
      if (saved[0]) {
        if (saved[0].request_hash !== hash)
          throw new DomainError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Esta clave ya se utilizó con otros cambios.",
          );
        return saved[0].response;
      }
      const result = await run(ctx);
      await ctx.db.execute(
        sql`insert into app.idempotency_records(owner_id,operation,key,request_hash,response) values(${owner},${operation},${key},${hash},${JSON.stringify(result)}::jsonb)`,
      );
      return result;
    });
  }
  async ensureUser(owner: string, displayName = "Estudiante") {
    return this.read(owner, async ({ db }) => {
      await db
        .insert(users)
        .values({
          id: owner,
          ownerId: owner,
          displayName: clean(displayName).slice(0, 100),
          onboardingState: "new",
          revision: 1,
          createdAt: this.now().toISOString(),
          updatedAt: this.now().toISOString(),
        })
        .onConflictDoNothing();
      const existing = await db
        .select()
        .from(periods)
        .where(and(eq(periods.ownerId, owner), eq(periods.isDefault, true)));
      if (!existing.length)
        await db
          .insert(periods)
          .values({
            id: randomUUID(),
            ownerId: owner,
            name: "Periodo académico",
            isDefault: true,
            revision: 1,
            workspaceRevision: 1,
            createdAt: this.now().toISOString(),
            updatedAt: this.now().toISOString(),
          });
    });
  }
  profile(owner: string) {
    return this.read(owner, async ({ db }) => {
      const p = (await db.select().from(users).where(eq(users.id, owner)))[0];
      if (!p) throw notFound();
      return {
        id: p.id,
        displayName: p.displayName,
        studyTimezone: p.studyTimezone,
        onboardingState: p.onboardingState,
        revision: p.revision,
      };
    });
  }
  patchProfile(
    owner: string,
    key: string | undefined,
    version: string | undefined,
    input: {
      displayName?: string;
      studyTimezone?: string | null;
      onboardingState?: string;
    },
  ) {
    return this.mutate(
      owner,
      "profile",
      key,
      { input, version },
      async ({ db }) => {
        const p = (await db.select().from(users).where(eq(users.id, owner)))[0];
        if (!p) throw notFound();
        requireRevision(version, "profile", p.revision);
        const [next] = await db
          .update(users)
          .set({
            displayName:
              input.displayName === undefined
                ? p.displayName
                : clean(input.displayName),
            studyTimezone:
              input.studyTimezone === undefined
                ? p.studyTimezone
                : timezone(input.studyTimezone),
            onboardingState: input.onboardingState ?? p.onboardingState,
            revision: p.revision + 1,
            updatedAt: this.now().toISOString(),
          })
          .where(eq(users.id, owner))
          .returning();
        return {
          status: 200,
          data: {
            id: next.id,
            displayName: next.displayName,
            studyTimezone: next.studyTimezone,
            onboardingState: next.onboardingState,
            revision: next.revision,
          },
          etag: `"profile-${next.revision}"`,
        };
      },
    );
  }
  async requirePeriod(ctx: Context, id: string) {
    const p = (
      await ctx.db
        .select()
        .from(periods)
        .where(and(eq(periods.id, id), eq(periods.ownerId, ctx.owner)))
    )[0];
    if (!p) throw notFound();
    return p;
  }
  async requireCourse(ctx: Context, id: string, periodId?: string) {
    const c = (
      await ctx.db
        .select()
        .from(courses)
        .where(and(eq(courses.id, id), eq(courses.ownerId, ctx.owner)))
    )[0];
    if (!c || (periodId && c.periodId !== periodId)) throw notFound();
    return c;
  }
  async requireActivity(ctx: Context, id: string) {
    const a = (
      await ctx.db
        .select()
        .from(activities)
        .where(and(eq(activities.id, id), eq(activities.ownerId, ctx.owner)))
    )[0];
    if (!a) throw notFound();
    return a;
  }
  async touch(ctx: Context, periodId: string) {
    await ctx.db
      .update(periods)
      .set({
        workspaceRevision: sql`${periods.workspaceRevision}+1`,
        updatedAt: this.now().toISOString(),
      })
      .where(and(eq(periods.id, periodId), eq(periods.ownerId, ctx.owner)));
  }
  listPeriods(owner: string, page: Page) {
    return this.read(owner, async ({ db }) => {
      const size = Number(page.limit ?? 50);
      const rows = await db
        .select()
        .from(periods)
        .where(
          and(
            eq(periods.ownerId, owner),
            page.cursor ? gt(periods.id, page.cursor) : undefined,
          ),
        )
        .orderBy(asc(periods.id))
        .limit(size + 1);
      return {
        items: rows.slice(0, size).map(periodDto),
        nextCursor: rows.length > size ? rows[size - 1].id : null,
      };
    });
  }
  savePeriod(
    owner: string,
    key: string | undefined,
    input: {
      name?: string;
      startDate?: string | null;
      endDate?: string | null;
      timezone?: string | null;
    },
    id?: string,
    version?: string,
  ) {
    return this.mutate(
      owner,
      `period:${id ?? "new"}`,
      key,
      { input, version },
      async (ctx) => {
        const p = id ? await this.requirePeriod(ctx, id) : undefined;
        if (p) requireRevision(version, "period", p.revision);
        const start =
          input.startDate === undefined
            ? (p?.startDate ?? null)
            : input.startDate;
        const end =
          input.endDate === undefined ? (p?.endDate ?? null) : input.endDate;
        if (start) civilDate(start);
        if (end) civilDate(end);
        if (start && end && start > end)
          throw invalid(
            "INVALID_PERIOD",
            "El cierre no puede ser anterior al inicio.",
          );
        const zone = timezone(
          input.timezone === undefined ? (p?.timezone ?? null) : input.timezone,
        );
        const data = {
          name: clean(input.name ?? p?.name ?? ""),
          startDate: start,
          endDate: end,
          timezone: zone,
          revision: (p?.revision ?? 0) + 1,
          workspaceRevision: (p?.workspaceRevision ?? 0) + 1,
          updatedAt: this.now().toISOString(),
        };
        const [next] = p
          ? await ctx.db
              .update(periods)
              .set(data)
              .where(eq(periods.id, p.id))
              .returning()
          : await ctx.db
              .insert(periods)
              .values({
                ...data,
                id: randomUUID(),
                ownerId: owner,
                isDefault: false,
                createdAt: this.now().toISOString(),
              })
              .returning();
        return {
          status: p ? 200 : 201,
          data: periodDto(next),
          etag: `"period-${next.revision}"`,
        };
      },
    );
  }
  listCourses(owner: string, periodId: string, page: Page) {
    return this.read(owner, async (ctx) => {
      await this.requirePeriod(ctx, periodId);
      const size = Number(page.limit ?? 50);
      const rows = await ctx.db
        .select()
        .from(courses)
        .where(
          and(
            eq(courses.ownerId, owner),
            eq(courses.periodId, periodId),
            page.cursor ? gt(courses.id, page.cursor) : undefined,
          ),
        )
        .orderBy(asc(courses.id))
        .limit(size + 1);
      return {
        items: rows.slice(0, size).map(courseDto),
        nextCursor: rows.length > size ? rows[size - 1].id : null,
      };
    });
  }
  saveCourse(
    owner: string,
    key: string | undefined,
    input: { name: string },
    periodId?: string,
    id?: string,
    version?: string,
  ) {
    return this.mutate(
      owner,
      `course:${id ?? "new:" + periodId}`,
      key,
      { input, version },
      async (ctx) => {
        const current = id ? await this.requireCourse(ctx, id) : undefined;
        const period = current?.periodId ?? periodId!;
        await this.requirePeriod(ctx, period);
        if (current) requireRevision(version, "course", current.revision);
        const data = {
          name: clean(input.name),
          revision: (current?.revision ?? 0) + 1,
          updatedAt: this.now().toISOString(),
        };
        const [next] = current
          ? await ctx.db
              .update(courses)
              .set(data)
              .where(eq(courses.id, current.id))
              .returning()
          : await ctx.db
              .insert(courses)
              .values({
                ...data,
                id: randomUUID(),
                ownerId: owner,
                periodId: period,
                createdAt: this.now().toISOString(),
              })
              .returning();
        await this.touch(ctx, period);
        return {
          status: current ? 200 : 201,
          data: courseDto(next),
          etag: `"course-${next.revision}"`,
        };
      },
    );
  }
  async activityDto(
    ctx: Context,
    a: typeof activities.$inferSelect,
  ): Promise<ActivityDto> {
    const p = (
      await ctx.db.select().from(progress).where(eq(progress.activityId, a.id))
    )[0];
    const rules = a.courseId
      ? await ctx.db
          .select()
          .from(priorityRules)
          .where(
            and(
              eq(priorityRules.courseId, a.courseId),
              eq(priorityRules.activityType, a.type),
            ),
          )
      : [];
    const estimate = (
      await ctx.db
        .select()
        .from(effortHistory)
        .where(eq(effortHistory.activityId, a.id))
        .orderBy(desc(effortHistory.activityRevision))
        .limit(1)
    )[0];
    const deps = await query<{ predecessor_id: string }>(
      ctx.db,
      sql`select predecessor_id from app.activity_dependencies where owner_id=${ctx.owner} and activity_id=${a.id} order by predecessor_id`,
    );
    const fixed = await query<{ end_at: Date }>(
      ctx.db,
      sql`select end_at from app.fixed_evaluations where owner_id=${ctx.owner} and activity_id=${a.id}`,
    );
    const state = effortState(
      a.operatingMinutes,
      p?.realTotalMinutes ?? null,
      p?.remainingMinutes ?? null,
      a.preparationState,
    );
    return {
      id: a.id,
      periodId: a.periodId,
      courseId: a.courseId,
      title: a.title,
      type: a.type,
      description: a.description,
      dueDate: a.dueDate,
      dueTime: a.dueTime?.slice(0, 5) ?? null,
      timezone: a.timezone,
      dueAt: stamp(a.dueAt),
      evaluationEndAt: fixed[0]
        ? new Date(fixed[0].end_at).toISOString()
        : null,
      allowedStartAt: stamp(a.allowedStartAt),
      divisibility: a.divisibility,
      dependencies: deps.map((x) => x.predecessor_id),
      priorityMode: a.priorityMode,
      priorityOverride: a.priorityOverride,
      effectivePriority:
        a.priorityMode === "override"
          ? a.priorityOverride
          : a.priorityMode === "inherit"
            ? (rules[0]?.priority ?? null)
            : null,
      operatingMinutes: a.operatingMinutes,
      effortOrigin: (estimate?.origin as "manual" | "corrected") ?? null,
      realTotalMinutes: p?.realTotalMinutes ?? null,
      remainingMinutes: p?.remainingMinutes ?? null,
      pendingMinutes: state.pendingMinutes,
      needsReview: state.needsReview,
      effectiveCompletionDate: p?.effectiveCompletionDate ?? null,
      preparationState: a.preparationState,
      fulfillmentState: a.fulfillmentState,
      revision: a.revision,
      planningState: "not_generated",
    };
  }
  getActivity(owner: string, id: string) {
    return this.read(owner, async (ctx) =>
      this.activityDto(ctx, await this.requireActivity(ctx, id)),
    );
  }
  listActivities(
    owner: string,
    page: Page & { periodId?: string; courseId?: string },
  ) {
    return this.read(owner, async (ctx) => {
      if (page.periodId) await this.requirePeriod(ctx, page.periodId);
      if (page.courseId)
        await this.requireCourse(ctx, page.courseId, page.periodId);
      const size = Number(page.limit ?? 50);
      const rows = await ctx.db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.ownerId, owner),
            page.periodId ? eq(activities.periodId, page.periodId) : undefined,
            page.courseId ? eq(activities.courseId, page.courseId) : undefined,
            page.cursor ? gt(activities.id, page.cursor) : undefined,
          ),
        )
        .orderBy(asc(activities.id))
        .limit(size + 1);
      return {
        items: await Promise.all(
          rows.slice(0, size).map((a) => this.activityDto(ctx, a)),
        ),
        nextCursor: rows.length > size ? rows[size - 1].id : null,
      };
    });
  }
  async constraints(
    ctx: Context,
    a: typeof activities.$inferSelect,
    ids: string[],
  ) {
    const edges = await query<{ activity_id: string; predecessor_id: string }>(
      ctx.db,
      sql`select activity_id,predecessor_id from app.activity_dependencies where owner_id=${ctx.owner} and period_id=${a.periodId} and activity_id<>${a.id}`,
    );
    for (const id of ids) {
      const dep = await this.requireActivity(ctx, id);
      if (dep.periodId !== a.periodId) throw notFound();
      edges.push({ activity_id: a.id, predecessor_id: id });
    }
    const active = new Set<string>(),
      done = new Set<string>();
    const visit = (id: string) => {
      if (active.has(id))
        throw invalid("DEPENDENCY_CYCLE", "Las dependencias forman un ciclo.");
      if (done.has(id)) return;
      active.add(id);
      for (const edge of edges.filter((e) => e.activity_id === id))
        visit(edge.predecessor_id);
      active.delete(id);
      done.add(id);
    };
    for (const edge of edges) visit(edge.activity_id);
    await ctx.db.execute(
      sql`delete from app.activity_dependencies where owner_id=${ctx.owner} and activity_id=${a.id}`,
    );
    for (const id of ids)
      await ctx.db.execute(
        sql`insert into app.activity_dependencies(owner_id,period_id,activity_id,predecessor_id) values(${ctx.owner},${a.periodId},${a.id},${id})`,
      );
  }
  async recordEffort(ctx: Context, activityId: string, minutes: number | null) {
    const old = (
      await ctx.db
        .select()
        .from(effortHistory)
        .where(eq(effortHistory.activityId, activityId))
        .orderBy(desc(effortHistory.activityRevision))
        .limit(1)
    )[0];
    const a = await this.requireActivity(ctx, activityId);
    await ctx.db
      .insert(effortHistory)
      .values({
        id: randomUUID(),
        ownerId: ctx.owner,
        activityId,
        activityRevision: a.revision,
        minutes,
        origin: old ? "corrected" : "manual",
        supersedesId: old?.id ?? null,
        confirmedAt: this.now().toISOString(),
      });
  }
  async setFixed(
    ctx: Context,
    a: typeof activities.$inferSelect,
    end: string | null,
  ) {
    await ctx.db.execute(
      sql`delete from app.fixed_evaluations where owner_id=${ctx.owner} and activity_id=${a.id}`,
    );
    if (end !== null) {
      if (
        ![
          "Práctica calificada",
          "Examen parcial",
          "Examen final",
          "Exposición",
        ].includes(a.type) ||
        !a.dueAt ||
        !a.timezone ||
        new Date(end) <= new Date(a.dueAt)
      )
        throw invalid(
          "INVALID_EVALUATION_INTERVAL",
          "Confirma inicio y fin válidos del evento evaluativo.",
        );
      await ctx.db.execute(
        sql`insert into app.fixed_evaluations(activity_id,owner_id,start_at,end_at,timezone) values(${a.id},${ctx.owner},${a.dueAt},${end},${a.timezone})`,
      );
    }
  }
  saveActivity(
    owner: string,
    key: string | undefined,
    input: CreateActivity | EditActivity,
    id?: string,
    version?: string,
  ) {
    return this.mutate(
      owner,
      `activity:${id ?? "new"}`,
      key,
      { input, version },
      async (ctx) => {
        const existing = id ? await this.requireActivity(ctx, id) : undefined;
        if (existing) requireRevision(version, "activity", existing.revision);
        const full = input as CreateActivity;
        const periodId = existing?.periodId ?? full.periodId;
        await this.requirePeriod(ctx, periodId);
        const courseId =
          input.courseId === undefined
            ? (existing?.courseId ?? null)
            : input.courseId;
        if (courseId) await this.requireCourse(ctx, courseId, periodId);
        const kind = input.type ?? existing!.type;
        const minutes =
          input.operatingMinutes === undefined
            ? (existing?.operatingMinutes ?? null)
            : input.operatingMinutes;
        if (kind === "Entrega grupal" && minutes !== null)
          throw invalid(
            "GROUP_NO_INDIVIDUAL_EFFORT",
            "El proyecto grupal no recibe una estimación individual.",
          );
        const mode = input.priorityMode ?? existing?.priorityMode ?? "inherit";
        const priority =
          input.priorityOverride === undefined
            ? (existing?.priorityOverride ?? null)
            : input.priorityOverride;
        if ((mode === "override") !== (priority !== null))
          throw invalid(
            "INVALID_PRIORITY",
            "Confirma una prioridad para la excepción o usa herencia/sin declarar.",
          );
        const date = existing?.dueDate ?? civilDate(full.dueDate);
        const time = existing?.dueTime?.slice(0, 5) ?? full.dueTime ?? null;
        const zone = existing?.timezone ?? timezone(full.timezone ?? null);
        const data = {
          courseId,
          title: clean(input.title ?? existing!.title),
          type: kind,
          description: input.description ?? existing?.description ?? "",
          operatingMinutes: minutes,
          priorityMode: mode,
          priorityOverride: priority,
          revision: (existing?.revision ?? 0) + 1,
          updatedAt: this.now().toISOString(),
        };
        const [next] = existing
          ? await ctx.db
              .update(activities)
              .set(data)
              .where(eq(activities.id, existing.id))
              .returning()
          : await ctx.db
              .insert(activities)
              .values({
                ...data,
                id: randomUUID(),
                ownerId: owner,
                periodId,
                dueDate: date,
                dueTime: time,
                timezone: zone,
                dueAt: academicInstant(date, time, zone),
                allowedStartAt: utcInstant(full.allowedStartAt ?? null),
                divisibility: full.divisibility ?? "unknown",
                preparationState: "new",
                fulfillmentState: "pending",
                confirmedAt: this.now().toISOString(),
                createdAt: this.now().toISOString(),
              })
              .returning();
        if (!existing) {
          await ctx.db
            .insert(progress)
            .values({ activityId: next.id, ownerId: owner, revision: 1 });
          await this.constraints(ctx, next, full.dependencies ?? []);
          await this.setFixed(
            ctx,
            next,
            utcInstant(full.evaluationEndAt ?? null),
          );
        } else if (
          existing.type !== kind &&
          ![
            "Práctica calificada",
            "Examen parcial",
            "Examen final",
            "Exposición",
          ].includes(kind)
        )
          await this.setFixed(ctx, next, null);
        if (
          (!existing && minutes !== null) ||
          (existing && existing.operatingMinutes !== minutes)
        )
          await this.recordEffort(ctx, next.id, minutes);
        await this.touch(ctx, periodId);
        return {
          status: existing ? 200 : 201,
          data: await this.activityDto(ctx, next),
          etag: `"activity-${next.revision}"`,
        };
      },
    );
  }
  listPriorities(owner: string, courseId: string) {
    return this.read(owner, async (ctx) => {
      const c = await this.requireCourse(ctx, courseId);
      const rules = await ctx.db
        .select()
        .from(priorityRules)
        .where(eq(priorityRules.courseId, courseId));
      return {
        course: courseDto(c),
        rules: rules.map((r) => ({
          type: r.activityType,
          priority: r.priority,
        })),
      };
    });
  }
  saveBasePriority(
    owner: string,
    key: string | undefined,
    courseId: string,
    type: string,
    priority: string | null,
    version: string | undefined,
  ) {
    return this.mutate(
      owner,
      `base-priority:${courseId}:${type}`,
      key,
      { priority, version },
      async (ctx) => {
        const c = await this.requireCourse(ctx, courseId);
        requireRevision(version, "course", c.revision);
        if (priority === null)
          await ctx.db
            .delete(priorityRules)
            .where(
              and(
                eq(priorityRules.courseId, courseId),
                eq(priorityRules.activityType, type),
              ),
            );
        else
          await ctx.db
            .insert(priorityRules)
            .values({ ownerId: owner, courseId, activityType: type, priority })
            .onConflictDoUpdate({
              target: [
                priorityRules.ownerId,
                priorityRules.courseId,
                priorityRules.activityType,
              ],
              set: { priority },
            });
        const [next] = await ctx.db
          .update(courses)
          .set({
            revision: c.revision + 1,
            updatedAt: this.now().toISOString(),
          })
          .where(eq(courses.id, courseId))
          .returning();
        await ctx.db
          .update(activities)
          .set({
            revision: sql`${activities.revision}+1`,
            updatedAt: this.now().toISOString(),
          })
          .where(
            and(
              eq(activities.courseId, courseId),
              eq(activities.type, type),
              eq(activities.priorityMode, "inherit"),
            ),
          );
        await this.touch(ctx, c.periodId);
        return {
          status: 200,
          data: courseDto(next),
          etag: `"course-${next.revision}"`,
        };
      },
    );
  }
  saveConstraints(
    owner: string,
    key: string | undefined,
    id: string,
    input: {
      allowedStartAt?: string | null;
      divisibility?: string;
      dependencies?: string[];
    },
    version: string | undefined,
  ) {
    return this.mutate(
      owner,
      `constraints:${id}`,
      key,
      { input, version },
      async (ctx) => {
        const a = await this.requireActivity(ctx, id);
        requireRevision(version, "activity", a.revision);
        if (input.dependencies !== undefined)
          await this.constraints(ctx, a, input.dependencies);
        const [next] = await ctx.db
          .update(activities)
          .set({
            allowedStartAt:
              input.allowedStartAt === undefined
                ? a.allowedStartAt
                : utcInstant(input.allowedStartAt),
            divisibility: input.divisibility ?? a.divisibility,
            revision: a.revision + 1,
            updatedAt: this.now().toISOString(),
          })
          .where(eq(activities.id, id))
          .returning();
        await this.touch(ctx, a.periodId);
        return {
          status: 200,
          data: await this.activityDto(ctx, next),
          etag: `"activity-${next.revision}"`,
        };
      },
    );
  }
  reportProgress(
    owner: string,
    key: string | undefined,
    id: string,
    input: ReportProgress,
    version: string | undefined,
  ) {
    return reportProgress(this, owner, key, id, input, version);
  }
  history(owner: string, id: string, kind: "progress" | "dates", page: Page) {
    return this.read(owner, async (ctx) => {
      await this.requireActivity(ctx, id);
      const limit = Number(page.limit ?? 50);
      if (kind === "progress") {
        const rows = await ctx.db
          .select()
          .from(progressHistory)
          .where(
            and(
              eq(progressHistory.activityId, id),
              page.cursor
                ? sql`${progressHistory.activityRevision} < (select activity_revision from app.progress_revisions where owner_id=${owner} and activity_id=${id} and id=${page.cursor})`
                : undefined,
            ),
          )
          .orderBy(desc(progressHistory.activityRevision))
          .limit(limit + 1);
        return {
          items: rows
            .slice(0, limit)
            .map((r) => ({
              id: r.id,
              activityRevision: r.activityRevision,
              before: r.before,
              after: r.after,
              recordedAt: stamp(r.recordedAt),
            })),
          nextCursor: rows.length > limit ? rows[limit - 1].id : null,
        };
      }
      const rows = await query<{
        id: string;
        activity_revision: number;
        before_value: unknown;
        after_value: unknown;
        source: unknown;
        confirmed_at: Date;
      }>(
        ctx.db,
        sql`select id,activity_revision,before_value,after_value,source,confirmed_at from app.academic_date_revisions where owner_id=${owner} and activity_id=${id} and (${page.cursor ?? null}::uuid is null or activity_revision < (select activity_revision from app.academic_date_revisions where owner_id=${owner} and activity_id=${id} and id=${page.cursor ?? null}::uuid)) order by activity_revision desc limit ${limit + 1}`,
      );
      return {
        items: rows
          .slice(0, limit)
          .map((r) => ({
            id: r.id,
            activityRevision: r.activity_revision,
            before: r.before_value,
            after: r.after_value,
            source: r.source,
            recordedAt: new Date(r.confirmed_at).toISOString(),
          })),
        nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      };
    });
  }
  dateProposal(
    owner: string,
    key: string | undefined,
    id: string,
    input: DateChange,
    version: string | undefined,
  ) {
    return this.mutate(
      owner,
      `date-proposal:${id}`,
      key,
      { input, version },
      async (ctx) => {
        const a = await this.requireActivity(ctx, id);
        requireRevision(version, "activity", a.revision);
        const period = await this.requirePeriod(ctx, a.periodId);
        const current = await this.activityDto(ctx, a);
        const after = {
          dueDate: civilDate(input.dueDate),
          dueTime:
            input.dueTime === undefined ? current.dueTime : input.dueTime,
          timezone: timezone(
            input.timezone === undefined ? current.timezone : input.timezone,
          ),
          evaluationEndAt:
            input.evaluationEndAt === undefined
              ? current.evaluationEndAt
              : utcInstant(input.evaluationEndAt),
        };
        if (
          current.evaluationEndAt &&
          input.evaluationEndAt === undefined &&
          (after.dueDate !== current.dueDate ||
            after.dueTime !== current.dueTime ||
            after.timezone !== current.timezone)
        )
          throw invalid(
            "EVALUATION_END_REQUIRED",
            "Confirma también el fin del nuevo intervalo evaluativo; no se traslada automáticamente.",
          );
        const dueAt = academicInstant(
          after.dueDate,
          after.dueTime,
          after.timezone,
        );
        if (
          after.evaluationEndAt !== null &&
          (!dueAt ||
            new Date(after.evaluationEndAt) <= new Date(dueAt) ||
            ![
              "Práctica calificada",
              "Examen parcial",
              "Examen final",
              "Exposición",
            ].includes(a.type))
        )
          throw invalid(
            "INVALID_EVALUATION_INTERVAL",
            "Confirma el intervalo evaluativo completo.",
          );
        const before = {
          dueDate: current.dueDate,
          dueTime: current.dueTime,
          timezone: current.timezone,
          evaluationEndAt: current.evaluationEndAt,
        };
        const proposalId = randomUUID();
        await ctx.db.execute(
          sql`insert into app.date_change_proposals(id,owner_id,activity_id,base_revision,workspace_revision,before_value,after_value,source) values(${proposalId},${owner},${id},${a.revision},${period.workspaceRevision},${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb,${JSON.stringify(input.source)}::jsonb)`,
        );
        return {
          status: 201,
          data: {
            id: proposalId,
            activityId: id,
            baseWorkspaceRevision: period.workspaceRevision,
            before,
            after,
            source: input.source,
            state: "pending",
            applied: false,
            planningState: "not_generated",
          },
          etag: `"workspace-${period.workspaceRevision}"`,
        };
      },
    );
  }
  getDateProposal(owner: string, id: string) {
    return this.read(owner, (ctx) => this.proposalDto(ctx, id));
  }
  async proposalDto(ctx: Context, id: string) {
    const row = (
      await query<{
        id: string;
        activity_id: string;
        base_revision: number;
        workspace_revision: number;
        before_value: unknown;
        after_value: unknown;
        source: unknown;
        state: string;
      }>(
        ctx.db,
        sql`select * from app.date_change_proposals where owner_id=${ctx.owner} and id=${id}`,
      )
    )[0];
    if (!row) throw notFound();
    return {
      id: row.id,
      activityId: row.activity_id,
      baseWorkspaceRevision: row.workspace_revision,
      before: row.before_value,
      after: row.after_value,
      source: row.source,
      state: row.state,
      applied: row.state === "applied",
      planningState: "not_generated",
    };
  }
  applyDateProposal(
    owner: string,
    key: string | undefined,
    id: string,
    version: string | undefined,
  ) {
    return this.mutate(
      owner,
      `apply-date:${id}`,
      key,
      { version },
      async (ctx) => {
        const row = (
          await query<{
            id: string;
            activity_id: string;
            base_revision: number;
            workspace_revision: number;
            before_value: unknown;
            after_value: DateChange;
            source: unknown;
            state: string;
          }>(
            ctx.db,
            sql`select * from app.date_change_proposals where owner_id=${owner} and id=${id}`,
          )
        )[0];
        if (!row) throw notFound();
        if (row.state !== "pending")
          throw new DomainError(
            409,
            "PROPOSAL_ALREADY_APPLIED",
            "Esta propuesta ya fue aplicada.",
          );
        const a = await this.requireActivity(ctx, row.activity_id);
        const p = await this.requirePeriod(ctx, a.periodId);
        requireRevision(version, "workspace", p.workspaceRevision);
        if (
          a.revision !== row.base_revision ||
          p.workspaceRevision !== row.workspace_revision
        )
          throw new DomainError(
            412,
            "REVISION_MISMATCH",
            "Cambiaron datos desde la propuesta. Revisa nuevamente.",
          );
        const d = row.after_value;
        const [next] = await ctx.db
          .update(activities)
          .set({
            dueDate: d.dueDate,
            dueTime: d.dueTime ?? null,
            timezone: d.timezone ?? null,
            dueAt: academicInstant(
              d.dueDate,
              d.dueTime ?? null,
              d.timezone ?? null,
            ),
            revision: a.revision + 1,
            updatedAt: this.now().toISOString(),
          })
          .where(eq(activities.id, a.id))
          .returning();
        await this.setFixed(ctx, next, d.evaluationEndAt ?? null);
        await ctx.db.execute(
          sql`insert into app.academic_date_revisions(id,owner_id,activity_id,activity_revision,before_value,after_value,source,confirmed_at) values(${randomUUID()},${owner},${a.id},${next.revision},${JSON.stringify(row.before_value)}::jsonb,${JSON.stringify(row.after_value)}::jsonb,${JSON.stringify(row.source)}::jsonb,${this.now().toISOString()})`,
        );
        await ctx.db.execute(
          sql`update app.date_change_proposals set state='applied' where owner_id=${owner} and id=${id}`,
        );
        await this.touch(ctx, a.periodId);
        return {
          status: 200,
          data: await this.activityDto(ctx, next),
          etag: `"activity-${next.revision}"`,
        };
      },
    );
  }
}
