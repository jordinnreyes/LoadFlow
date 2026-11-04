import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { CalendarService, JobRow } from "../calendar/service.js";
import { CalendarFailure } from "../calendar/provider.js";
export class CalendarWorker {
  private running = false;
  constructor(
    readonly service: CalendarService,
    readonly random: () => number = Math.random,
  ) {}
  async claim() {
    const rows = await this.service.identity.pool.query<JobRow>(
      "select * from app.claim_calendar_job($1,$2,$3)",
      [this.service.now(), randomUUID(), this.service.queueName],
    );
    return rows.rows[0];
  }
  async heartbeat(job: JobRow) {
    await this.service.academics.read(job.owner_id, async (ctx) => {
      await ctx.db.execute(
        sql`update app.jobs set heartbeat_at=${this.service.now().toISOString()},lease_until=${new Date(this.service.now().getTime() + 60000).toISOString()} where owner_id=${ctx.owner} and id=${job.id} and status='running' and lease_token=${job.lease_token}`,
      );
    });
  }
  async finish(
    job: JobRow,
    status: "succeeded" | "partial" | "cancelled" | "failed" | "queued",
    code: string | null = null,
    delay = 0,
  ) {
    return this.service.academics.read(job.owner_id, async (ctx) => {
      await ctx.db.execute(
        sql`update app.jobs set status=${status},safe_error=${code},run_after=${new Date(this.service.now().getTime() + delay * 1000).toISOString()},finished_at=${status === "queued" ? null : this.service.now().toISOString()},lease_token=null,lease_until=null where owner_id=${ctx.owner} and id=${job.id} and status='running' and lease_token=${job.lease_token}`,
      );
    });
  }
  async process(job: JobRow) {
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      const context = await this.service.prepare(job);
      if (!context) {
        await this.finish(job, "cancelled");
        return;
      }
      timer = setInterval(() => {
        void this.heartbeat(job).catch(() => {});
      }, 20000);
      timer.unref();
      const provider = this.service.provider;
      if (!provider) throw new CalendarFailure("CALENDAR_NOT_CONFIGURED");
      let token = await this.service.currentToken(
        job.owner_id,
        context.connection,
      );
      const authorized = async <T>(request: () => Promise<T>): Promise<T> => {
        try {
          return await request();
        } catch (e) {
          if (
            e instanceof CalendarFailure &&
            e.code === "CALENDAR_UNAUTHORIZED"
          ) {
            token = await provider.refresh(token);
            await this.service.storeCredential(
              job.owner_id,
              context.connection.credential_id!,
              token,
            );
            try {
              return await request();
            } catch (next) {
              if (
                next instanceof CalendarFailure &&
                next.code === "CALENDAR_UNAUTHORIZED"
              )
                throw new CalendarFailure("CALENDAR_REVOKED", false, 0, true);
              throw next;
            }
          }
          throw e;
        }
      };
      const calendars = await authorized(() => provider.calendars(token));
      const selected = await this.service.academics.read(
        job.owner_id,
        async (ctx) =>
          (await this.service.sourceRows(ctx))
            .filter((s) => s.selected)
            .map((s) => s.provider_id),
      );
      const chunks: {
        from: string;
        to: string;
        results: Awaited<ReturnType<typeof provider.busy>>;
      }[] = [];
      let partial = false;
      for (const chunk of context.chunks) {
        // Stop before each external request when disconnect/selection cancelled this lease.
        const current = await this.service.prepare(job);
        if (!current) {
          await this.finish(job, "cancelled");
          return;
        }
        const results = selected.length
          ? await authorized(() =>
              provider.busy(token, selected, chunk.from, chunk.to),
            )
          : [];
        partial ||= results.some((r) => !!r.error);
        chunks.push({ ...chunk, results });
      }
      const transient = chunks.some((c) =>
        c.results.some((r) => r.error === "CALENDAR_TRANSIENT_PARTIAL"),
      );
      const retry = transient && job.attempts < 3;
      const finish = {
        status: retry
          ? ("queued" as const)
          : partial || !selected.length
            ? ("partial" as const)
            : ("succeeded" as const),
        error: retry
          ? "CALENDAR_TRANSIENT_PARTIAL"
          : partial
            ? "CALENDAR_PARTIAL"
            : !selected.length
              ? "CALENDAR_SELECTION_REQUIRED"
              : null,
        delay: retry ? Math.max(60, 2 ** job.attempts + this.random()) : 0,
      };
      const saved = await this.service.persist(
        job,
        calendars,
        chunks,
        partial,
        finish,
      );
      if (!saved) {
        await this.finish(job, "cancelled");
        return;
      }
    } catch (e) {
      const failure =
        e instanceof CalendarFailure
          ? e
          : new CalendarFailure("CALENDAR_REFRESH_FAILED", true);
      await this.service.fail(job, failure);
      const retry = failure.retryable && job.attempts < 3;
      await this.finish(
        job,
        retry ? "queued" : "failed",
        failure.code,
        retry
          ? Math.max(
              60,
              failure.retryAfterSeconds,
              2 ** job.attempts + this.random(),
            )
          : 0,
      );
    } finally {
      if (timer) clearInterval(timer);
    }
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const job = await this.claim();
      if (job) await this.process(job);
      return job;
    } finally {
      this.running = false;
    }
  }
  start(onError: () => void = () => {}) {
    let pending: Promise<unknown> | undefined;
    const timer = setInterval(() => {
      if (!this.running) pending = this.tick().catch(onError);
    }, 2000);
    timer.unref();
    return async () => {
      clearInterval(timer);
      await pending;
    };
  }
}
