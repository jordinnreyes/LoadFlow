import { sql } from "drizzle-orm";
import type { Context } from "../academics/service.js";
import type { activities } from "../../db/schema.js";
import type {
  SuggestionDto,
  WorkloadSize,
} from "../../../packages/contracts/estimates.js";
import { estimateConsent } from "../entitlements/service.js";

export const localCalibrationPolicy = Object.freeze({
  version: "local-d10-v2",
  minimumSamples: 1,
  samplesWithoutWarning: 3,
  shrinkage: 5,
  lookbackDays: 180,
  maximumAdjustmentBps: 2500,
});

export type CalibrationSnapshot = {
  version: string;
  consentRevision: number;
  comparableCount: number;
  multiplierBps: number;
};

export function calibrationWarning(comparableCount: number) {
  if (comparableCount >= localCalibrationPolicy.samplesWithoutWarning)
    return null;
  return comparableCount === 1
    ? "Este ajuste se basa en una sola actividad similar terminada."
    : "Este ajuste se basa en solo dos actividades similares terminadas.";
}

type Comparable = { low: number; high: number; actual: number };

export function fitCalibration(
  samples: Comparable[],
  consentRevision: number,
): CalibrationSnapshot | null {
  const policy = localCalibrationPolicy;
  const logs = samples
    .filter(({ low, high, actual }) => low > 0 && high >= low && actual > 0)
    .map(({ low, high, actual }) => Math.log(actual / ((low + high) / 2)))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const n = logs.length;
  if (n < policy.minimumSamples) return null;
  const median = (logs[Math.floor((n - 1) / 2)] + logs[Math.floor(n / 2)]) / 2;
  const rawBps = Math.round(
    10000 * Math.exp((median * n) / (n + policy.shrinkage)),
  );
  const limit = policy.maximumAdjustmentBps;
  return {
    version: policy.version,
    consentRevision,
    comparableCount: n,
    multiplierBps: Math.max(10000 - limit, Math.min(10000 + limit, rawBps)),
  };
}

export function adjustSuggestion(
  base: SuggestionDto,
  calibration: CalibrationSnapshot,
  maxMinutes: number,
) {
  if (
    base.lowMinutes === null ||
    base.highMinutes === null ||
    calibration.multiplierBps === 10000
  )
    return null;
  const lowMinutes = Math.min(
    maxMinutes,
    Math.max(
      1,
      Math.floor((base.lowMinutes * calibration.multiplierBps) / 10000),
    ),
  );
  const highMinutes = Math.min(
    maxMinutes,
    Math.ceil((base.highMinutes * calibration.multiplierBps) / 10000),
  );
  return lowMinutes === base.lowMinutes && highMinutes === base.highMinutes
    ? null
    : {
        ...base,
        lowMinutes,
        highMinutes,
      };
}

export async function calibrationFor(
  ctx: Context,
  activity: typeof activities.$inferSelect,
  size: WorkloadSize | undefined,
  source: { environment: string; model: string; prompt: string },
  now: Date,
) {
  if (!size || !activity.courseId) return null;
  const consent = await estimateConsent(ctx, "personalization");
  if (!consent.granted) return null;
  const cutoff = new Date(
    now.getTime() - localCalibrationPolicy.lookbackDays * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const { rows } = await ctx.db.execute<Comparable>(sql`
    select comparable.low,comparable.high,comparable.actual
    from (
      select distinct on (a.id) a.id,observed.closed_at,
        (e.result->>'lowMinutes')::int as low,(e.result->>'highMinutes')::int as high,
        p.real_total_minutes as actual
      from app.effort_confirmations f
      join app.estimate_usage e on (e.owner_id,e.activity_id,e.id)=(f.owner_id,f.activity_id,f.estimate_id)
      join app.activities a on (a.owner_id,a.id)=(f.owner_id,f.activity_id)
      join app.progress_current p on (p.owner_id,p.activity_id)=(a.owner_id,a.id)
      join lateral (
        select min(r.activity_revision) filter (where r.after_value->>'realTotalMinutes' is not null
          or r.after_value->>'preparationState'='done') as first_observed_revision,
          max(r.recorded_at) filter (where r.after_value->>'preparationState'='done'
            and r.before_value->>'preparationState' is distinct from 'done') as closed_at
        from app.progress_revisions r where (r.owner_id,r.activity_id)=(a.owner_id,a.id)
      ) observed on true
      where a.owner_id=${ctx.owner} and a.id<>${activity.id} and a.course_id=${activity.courseId}
        and a.type=${activity.type} and a.preparation_state='done' and p.real_total_minutes>0
        and e.course_id=a.course_id and e.activity_type=a.type and e.workload_size=${size}
        and e.environment=${source.environment} and e.model=${source.model} and e.prompt_version=${source.prompt}
        and e.state='succeeded' and e.result->>'status'='estimated'
        and e.finished_at<=f.confirmed_at and f.activity_revision<observed.first_observed_revision
        and observed.closed_at<=${now.toISOString()}
        and coalesce(p.effective_completion_date,(observed.closed_at at time zone 'UTC')::date)>=${cutoff}::date
      order by a.id,f.activity_revision
    ) comparable order by comparable.closed_at desc,comparable.id limit 100
  `);
  return fitCalibration(rows, consent.revision);
}
