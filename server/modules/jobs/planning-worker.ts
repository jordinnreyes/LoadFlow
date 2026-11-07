import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { DomainError } from "../../errors.js";
import { recalculationPolicy } from "../availability/change-policy.js";
import type { PlanningClaim, PlanningService } from "../planning/service.js";

export class PlanningWorker {
  private pending?: Promise<void>;
  constructor(readonly service: PlanningService) {}
  private async finish(
    job: PlanningClaim,
    status: string,
    proposal: string | null,
    error: string | null = null,
  ) {
    const now = this.service.academics.now();
    await this.service.academics.read(job.owner_id, async (ctx) => {
      await ctx.db
        .execute(sql`update app.planning_jobs set status=${status},proposal_id=${proposal},safe_error=${error},
        lease_token=null,lease_until=null,run_after=${new Date(now.getTime() + 5000 * job.attempts).toISOString()}
        where owner_id=${job.owner_id} and period_id=${job.period_id} and lease_token=${job.lease_token}`);
    });
  }
  private async run() {
    const claimed = await this.service.identity.pool.query<PlanningClaim>(
      "select * from app.claim_planning_job($1,$2,$3)",
      [
        this.service.academics.now(),
        randomUUID(),
        this.service.academics.planningQueue,
      ],
    );
    const job = claimed.rows[0];
    if (!job) return;
    const version = `"workspace-${job.workspace_revision}"`;
    const key = `worker:${job.period_id}:${job.workspace_revision}`;
    try {
      const preview = await this.service.preview(
        job.owner_id,
        job.period_id,
        key,
        version,
        { kind: "recalculate" },
      );
      const proposal = preview.data as ReturnType<
        PlanningService["proposalDto"]
      >;
      const policy = recalculationPolicy({
        source: "external",
        dataConfirmed: true,
        inputsCompleteAndFresh:
          proposal.after.state === "viable" || proposal.after.state === "empty",
        expandsStudyLimits: false,
        releasesFixedSessions: false,
        changesOfficialDate: false,
        partialPlan: !["viable", "empty"].includes(proposal.after.state),
        fixedConflict: proposal.requiredConfirmations.includes(
          "keep_fixed_conflicts",
        ),
      });
      if (
        !policy.allowAutomaticFlexible ||
        proposal.requiredConfirmations.length
      ) {
        await this.finish(job, "needs_review", proposal.id);
        return;
      }
      await this.service.apply(
        job.owner_id,
        proposal.id,
        key,
        version,
        { confirmations: [] },
        job,
      );
    } catch (error) {
      const code =
        error instanceof DomainError ? error.code : "PLANNING_JOB_FAILED";
      const retry =
        job.attempts < 3 &&
        code !== "PLANNING_TIMEOUT" &&
        (!(error instanceof DomainError) ||
          error.status >= 500 ||
          error.status === 429);
      await this.finish(job, retry ? "queued" : "failed", null, code);
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
