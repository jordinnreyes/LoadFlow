import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { FileIssue } from "../imports/extraction/model.js";
import type { Extractor } from "../imports/runner.js";
import type { ImportService } from "../imports/service.js";

type Job = { id: string; owner_id: string };

export class ImportWorker {
  private pending?: Promise<void>;
  constructor(
    readonly service: ImportService,
    readonly extract: Extractor,
  ) {}

  private async process(job: Job, token: string) {
    const r = await this.service.academics.read(job.owner_id, (ctx) =>
      this.service.row(ctx, job.id),
    );
    if (r.status !== "running" || r.lease_token !== token) return;
    let result: Awaited<ReturnType<Extractor>> | undefined;
    let error: string | null = null;
    try {
      const bytes = await this.service.storage.get(r.document_id);
      if (!this.service.validChecksum(r, bytes))
        throw new FileIssue("FILE_INTEGRITY_FAILED");
      result = await this.extract(bytes, r.filename ?? "document." + r.format);
    } catch (e) {
      error = e instanceof FileIssue ? e.code : "EXTRACTION_FAILED";
    }
    await this.service.academics.read(job.owner_id, async (ctx) => {
      const current = await this.service.row(ctx, job.id, true);
      const now = this.service.now();
      if (
        current.status !== "running" ||
        current.lease_token !== token ||
        !current.lease_until ||
        current.lease_until <= now ||
        current.object_expires_at <= now
      )
        return;
      if (result) {
        await this.service.persist(ctx, current, result);
        return;
      }
      await ctx.db.execute(sql`update app.imports set status='failed',
        safe_error=${error},lease_token=null,lease_until=null,revision=revision+1,
        run_after=${new Date(now.getTime() + 5_000 * current.attempts).toISOString()} where id=${current.id}`);
      await this.service.scheduleDelete(ctx, current, true);
    });
  }

  private async cleanup(job: Job) {
    await this.service.academics.read(job.owner_id, async (ctx) => {
      let r = await this.service.row(ctx, job.id);
      const now = this.service.now();
      if (
        r.status === "review" &&
        r.review_expires_at &&
        r.review_expires_at <= now
      ) {
        await this.service.purge(ctx, r, "expired");
        r = await this.service.row(ctx, job.id);
      }
      const exhausted =
        r.status === "running" &&
        r.attempts >= 3 &&
        r.lease_until &&
        r.lease_until <= now;
      const expired = r.object_expires_at <= now;
      const abandoned =
        r.status === "uploading" &&
        r.created_at.getTime() + 120_000 <= now.getTime();
      if (
        exhausted ||
        ((expired || abandoned) &&
          ["uploading", "queued", "running"].includes(r.status))
      ) {
        await ctx.db.execute(sql`update app.imports set status='failed',
          safe_error=${exhausted ? "RETRY_EXHAUSTED" : "IMPORT_ORIGINAL_EXPIRED"},
          lease_token=null,lease_until=null,revision=revision+1 where id=${r.id}`);
      }
      if (abandoned || expired || exhausted) {
        await this.service.scheduleDelete(
          ctx,
          r,
          ["uploading", "queued", "running", "failed"].includes(r.status),
        );
        r = await this.service.row(ctx, job.id);
      }
      if (
        r.object_state === "deleted" ||
        (r.object_state !== "delete_pending" && !abandoned && !expired)
      )
        return;
      if (r.delete_after > now) return;
      try {
        await this.service.storage.remove(r.document_id);
      } catch {
        await ctx.db
          .execute(sql`update app.documents set delete_after=${new Date(now.getTime() + 60_000).toISOString()}
          where id=${r.document_id}`);
        return;
      }
      await ctx.db.execute(
        sql`update app.documents set object_state='deleted' where id=${r.document_id}`,
      );
    });
  }

  private async run() {
    const pool = this.service.identity.pool;
    const { queueName } = this.service;
    const token = randomUUID();
    const cleanup = await pool.query<Job>(
      "select * from app.next_import_cleanup($1,$2)",
      [this.service.now(), queueName],
    );
    if (cleanup.rows[0]) await this.cleanup(cleanup.rows[0]);
    const claim = await pool.query<Job>(
      "select * from app.claim_import($1,$2,$3)",
      [this.service.now(), token, queueName],
    );
    if (claim.rows[0]) {
      await this.process(claim.rows[0], token);
      // A completed extraction records a durable deletion request before this call.
      await this.cleanup(claim.rows[0]);
    }
  }

  tick() {
    if (!this.pending)
      this.pending = this.run().finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  start(onError: () => void) {
    const timer = setInterval(() => {
      void this.tick().catch(onError);
    }, 2000);
    timer.unref();
    return async () => {
      clearInterval(timer);
      await this.pending;
    };
  }
}
