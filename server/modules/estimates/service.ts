import { createHmac, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { DomainError, notFound } from "../../errors.js";
import type { Academics, Context } from "../academics/service.js";
import { requireRevision } from "../academics/policy.js";
import { activeGrant, estimateConsent } from "../entitlements/service.js";
import type {
  ConfirmEstimate,
  SuggestionDto,
  WorkloadSize,
} from "../../../packages/contracts/estimates.js";
import {
  adjustSuggestion,
  calibrationFor,
  localCalibrationPolicy,
  type CalibrationSnapshot,
} from "./calibration.js";
import {
  prepareExcerpt,
  promptVersion,
  validateSuggestion,
  type EstimateContext,
} from "./prompt.js";
import {
  validUsage,
  type EstimateProvider,
  type ProviderResult,
  type Usage,
} from "./provider.js";

export type EstimatePolicy = {
  environment: "development" | "pilot" | "production";
  model: string;
  tariffVersion: string;
  fingerprintKey: Buffer;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxMinutes: number;
  timeoutMs: number;
  concurrency: number;
  inputMicrosPerMillion: bigint;
  outputMicrosPerMillion: bigint;
  userBudgetMicros: bigint;
  globalBudgetMicros: bigint;
  personalization?: boolean;
};

type EstimateRow = {
  id: string;
  activity_id: string;
  activity_revision: number;
  grant_id: string;
  consent_revision: number;
  state: "reserved" | "running" | "succeeded" | "failed" | "outcome_unknown";
  model: string;
  prompt_version: string;
  tariff_version: string;
  max_input_tokens: number;
  max_output_tokens: number;
  input_micros_per_million: string;
  output_micros_per_million: string;
  result: SuggestionDto | null;
  calibration: CalibrationSnapshot | null;
  error_code: string | null;
  created_at: string | Date;
  expires_at: string | Date;
};

const positiveInteger = (n: number, limit: number) =>
  Number.isSafeInteger(n) && n > 0 && n <= limit;
const charge = (usage: Usage, policy: EstimatePolicy) =>
  (BigInt(usage.input) * policy.inputMicrosPerMillion +
    BigInt(usage.output) * policy.outputMicrosPerMillion +
    999999n) /
  1000000n;
const outcomeUnknown = { kind: "unknown", requestId: null } as const;

export class Estimates {
  private readonly policy: EstimatePolicy;
  constructor(
    private readonly academics: Academics,
    private readonly provider: EstimateProvider,
    policy: EstimatePolicy,
  ) {
    if (
      !["development", "pilot", "production"].includes(policy.environment) ||
      !/^[a-zA-Z0-9._-]{1,100}$/.test(policy.model) ||
      !/^[a-zA-Z0-9._-]{1,80}$/.test(policy.tariffVersion) ||
      policy.fingerprintKey.length < 32 ||
      !positiveInteger(policy.maxInputTokens, 2000000) ||
      !positiveInteger(policy.maxOutputTokens, 10000) ||
      !positiveInteger(policy.maxMinutes, 100000) ||
      !positiveInteger(policy.timeoutMs, 30000) ||
      !positiveInteger(policy.concurrency, 16) ||
      [
        policy.inputMicrosPerMillion,
        policy.outputMicrosPerMillion,
        policy.userBudgetMicros,
        policy.globalBudgetMicros,
      ].some(
        (value) =>
          typeof value !== "bigint" || value <= 0n || value > 1000000000000n,
      ) ||
      policy.userBudgetMicros > policy.globalBudgetMicros
    )
      throw new Error("Política de estimaciones inválida.");
    this.policy = {
      ...policy,
      fingerprintKey: Buffer.from(policy.fingerprintKey),
    };
  }

  private async rights(ctx: Context) {
    const grant = await activeGrant(ctx, this.academics.now());
    if (!grant)
      throw new DomainError(
        403,
        "PREMIUM_REQUIRED",
        "Se requiere acceso Premium vigente. Puedes ingresar el esfuerzo manualmente.",
      );
    const consent = await estimateConsent(ctx);
    if (!consent.granted)
      throw new DomainError(
        403,
        "ESTIMATE_CONSENT_REQUIRED",
        "Revisa el consentimiento para solicitar estimaciones.",
      );
    return { grant, consent };
  }

  private async row(ctx: Context, id: string) {
    const { rows } = await ctx.db.execute<EstimateRow>(sql`
      select * from app.estimate_usage where owner_id=${ctx.owner} and id=${id}
      and environment=${this.policy.environment}
    `);
    if (!rows[0]) throw notFound();
    return rows[0];
  }

  async request(
    owner: string,
    activityId: string,
    key: string | undefined,
    version: string | undefined,
    text: string,
    workloadSize?: WorkloadSize,
  ) {
    const excerpt = prepareExcerpt(text);
    const policy = this.policy;
    const fingerprint = (values: unknown) =>
      createHmac("sha256", policy.fingerprintKey)
        .update(JSON.stringify([owner, values]))
        .digest("hex");
    const ticket = await this.academics.mutate(
      owner,
      "estimate:" + activityId,
      key,
      {
        version,
        excerpt: fingerprint(excerpt),
        ...(workloadSize === undefined ? {} : { workloadSize }),
        environment: policy.environment,
      },
      async (ctx) => {
        const activity = await this.academics.requireActivity(ctx, activityId);
        requireRevision(version, "activity", activity.revision);
        const { grant, consent } = await this.rights(ctx);
        if (
          activity.type === "Entrega grupal" ||
          activity.preparationState === "done"
        )
          throw new DomainError(
            422,
            "ESTIMATE_INELIGIBLE",
            "La estimación requiere una actividad individual con preparación abierta.",
          );
        const now = this.academics.now();
        const calibration = policy.personalization
          ? await calibrationFor(
              ctx,
              activity,
              workloadSize,
              {
                environment: policy.environment,
                model: policy.model,
                prompt: promptVersion,
              },
              now,
            )
          : null;
        const hash = fingerprint([
          activityId,
          activity.revision,
          activity.type,
          excerpt,
          policy.model,
          promptVersion,
          policy.maxMinutes,
          ...(workloadSize === undefined ? [] : [workloadSize, calibration]),
        ]);
        const { rows } = await ctx.db.execute<{ id: string }>(sql`
          select id from app.estimate_usage where owner_id=${owner} and activity_id=${activityId}
          and environment=${policy.environment} and fingerprint=${hash} and (
            state in ('running','outcome_unknown')
            or (state='reserved' and expires_at>${now.toISOString()} and grant_id=${grant.id} and consent_revision=${consent.revision}
                and tariff_version=${policy.tariffVersion})
            or (state='succeeded' and grant_id=${grant.id} and consent_revision=${consent.revision})
          ) order by created_at desc,id desc limit 1
        `);
        if (rows[0]) return { status: 202, data: rows[0] };
        const id = randomUUID();
        const { rows: reserved } = await ctx.db.execute<{
          error: string | null;
        }>(sql`
          select app.reserve_estimate(${id},${activityId},${activity.revision},${policy.environment},${hash},
            ${grant.id},${consent.revision},${policy.model},${promptVersion},${policy.tariffVersion},
            ${policy.maxInputTokens},${policy.maxOutputTokens},${policy.inputMicrosPerMillion.toString()},
            ${policy.outputMicrosPerMillion.toString()},${now.toISOString()},
            ${new Date(now.getTime() + 2 * policy.timeoutMs + 10000).toISOString()},
            ${policy.userBudgetMicros.toString()},${policy.globalBudgetMicros.toString()},${policy.concurrency}) as error
        `);
        if (reserved[0].error)
          throw new DomainError(
            429,
            reserved[0].error,
            "La estimación no está disponible por el límite de consumo o concurrencia. Puedes ingresar el esfuerzo manualmente.",
          );
        await ctx.db.execute(sql`
          update app.estimate_usage set course_id=${activity.courseId},activity_type=${activity.type},
          workload_size=${workloadSize ?? null},calibration=${calibration ? JSON.stringify(calibration) : null}::jsonb
          where owner_id=${owner} and id=${id}
        `);
        return { status: 202, data: { id } };
      },
    );
    const { id } = ticket.data as { id: string };
    const claimed = await this.claim(owner, id);
    if (claimed) {
      const result = await this.call({ activityType: claimed, excerpt });
      await this.finish(owner, id, excerpt, result);
    }
    return this.get(owner, id);
  }

  private claim(owner: string, id: string) {
    return this.academics.read(owner, async (ctx) => {
      const row = await this.row(ctx, id);
      if (row.state !== "reserved") return null;
      const activity = await this.academics.requireActivity(
        ctx,
        row.activity_id,
      );
      const grant = await activeGrant(ctx, this.academics.now());
      const consent = await estimateConsent(ctx);
      const now = this.academics.now();
      if (
        row.grant_id !== grant?.id ||
        !consent.granted ||
        row.consent_revision !== consent.revision ||
        row.model !== this.policy.model ||
        row.prompt_version !== promptVersion ||
        row.tariff_version !== this.policy.tariffVersion ||
        row.max_input_tokens !== this.policy.maxInputTokens ||
        row.max_output_tokens !== this.policy.maxOutputTokens ||
        row.input_micros_per_million !==
          this.policy.inputMicrosPerMillion.toString() ||
        row.output_micros_per_million !==
          this.policy.outputMicrosPerMillion.toString() ||
        activity.revision !== row.activity_revision ||
        new Date(row.expires_at).getTime() <=
          now.getTime() + this.policy.timeoutMs
      ) {
        await ctx.db.execute(sql`
          update app.estimate_usage set state='failed',actual_micros=0,error_code='ESTIMATE_STALE',
          finished_at=${now.toISOString()} where id=${id} and state='reserved'
        `);
        return null;
      }
      const { rowCount } = await ctx.db.execute(sql`
        update app.estimate_usage set state='running' where id=${id} and state='reserved'
      `);
      return rowCount === 1 ? activity.type : null;
    });
  }

  private async call(context: EstimateContext) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<ProviderResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(outcomeUnknown);
      }, this.policy.timeoutMs);
    });
    try {
      return await Promise.race([
        this.provider.estimate(context, {
          model: this.policy.model,
          maxOutputTokens: this.policy.maxOutputTokens,
          signal: controller.signal,
        }),
        deadline,
      ]);
    } catch {
      return outcomeUnknown;
    } finally {
      clearTimeout(timer);
    }
  }

  private finish(
    owner: string,
    id: string,
    excerpt: string,
    result: ProviderResult,
  ) {
    return this.academics.read(owner, async (ctx) => {
      await ctx.db.execute(sql`select pg_advisory_xact_lock(204819,2)`);
      const row = await this.row(ctx, id);
      if (row.state !== "running") return;
      const now = this.academics.now();
      const known = result.kind === "settled" && validUsage(result.usage);
      const grant = await activeGrant(ctx, now);
      const consent = await estimateConsent(ctx);
      const activity = await this.academics.requireActivity(
        ctx,
        row.activity_id,
      );
      const stale =
        grant?.id !== row.grant_id ||
        !consent.granted ||
        consent.revision !== row.consent_revision ||
        activity.revision !== row.activity_revision;
      const exceeds =
        known &&
        (result.usage.input > this.policy.maxInputTokens ||
          result.usage.output > this.policy.maxOutputTokens);
      const suggestion =
        known && !stale && !exceeds && !result.errorCode
          ? validateSuggestion(result.output, excerpt, this.policy.maxMinutes)
          : null;
      const error = !known
        ? "PROVIDER_OUTCOME_UNKNOWN"
        : exceeds
          ? "PROVIDER_USAGE_EXCEEDED"
          : stale
            ? "ESTIMATE_STALE"
            : suggestion
              ? null
              : (result.errorCode ?? "PROVIDER_INVALID_OUTPUT");
      await ctx.db.execute(sql`
        update app.estimate_usage set state=${!known ? "outcome_unknown" : suggestion ? "succeeded" : "failed"},
        actual_micros=${known ? charge(result.usage, this.policy).toString() : null},
        input_tokens=${known ? result.usage.input : null}, output_tokens=${known ? result.usage.output : null},
        provider_request_id=${result.requestId},result=${suggestion ? JSON.stringify(suggestion) : null}::jsonb,
        error_code=${error},finished_at=${now.toISOString()} where id=${id} and state='running'
      `);
    });
  }

  get(owner: string, id: string) {
    return this.academics.read(owner, async (ctx) => {
      const row = await this.row(ctx, id);
      const { grant, consent } = await this.rights(ctx);
      const activity = await this.academics.requireActivity(
        ctx,
        row.activity_id,
      );
      const expired = new Date(row.expires_at) <= this.academics.now();
      const unknown =
        row.state === "outcome_unknown" || (row.state === "running" && expired);
      const stale =
        row.grant_id !== grant.id ||
        row.consent_revision !== consent.revision ||
        row.activity_revision !== activity.revision ||
        (row.state === "reserved" && expired);
      const state = unknown
        ? "outcome_unknown"
        : stale || row.state === "failed"
          ? "failed"
          : row.state === "succeeded"
            ? "complete"
            : "pending";
      const shown = await this.presentation(
        ctx,
        row,
        state === "complete" ? row.result : null,
      );
      return {
        id: row.id,
        activityId: row.activity_id,
        activityRevision: row.activity_revision,
        state,
        ...shown,
        errorCode: unknown
          ? "PROVIDER_OUTCOME_UNKNOWN"
          : stale
            ? "ESTIMATE_STALE"
            : row.error_code,
        model: row.model,
        promptVersion: row.prompt_version,
        createdAt: new Date(row.created_at).toISOString(),
        manualEntryAvailable: true,
      };
    });
  }

  private async presentation(
    ctx: Context,
    row: EstimateRow,
    base: SuggestionDto | null,
  ) {
    const snapshot = row.calibration;
    if (
      base &&
      snapshot?.version === localCalibrationPolicy.version &&
      this.policy.personalization
    ) {
      const consent = await estimateConsent(ctx, "personalization");
      if (consent.granted && consent.revision === snapshot.consentRevision) {
        const suggestion = adjustSuggestion(
          base,
          snapshot,
          this.policy.maxMinutes,
        );
        if (suggestion)
          return {
            suggestion,
            origin: "personalized" as const,
            calibration: {
              version: snapshot.version,
              comparableCount: snapshot.comparableCount,
            },
          };
      }
    }
    return { suggestion: base, origin: "base" as const, calibration: null };
  }

  confirm(
    owner: string,
    id: string,
    key: string | undefined,
    version: string | undefined,
    input: ConfirmEstimate,
  ) {
    return this.academics.mutate(
      owner,
      "estimate-confirm:" + id,
      key,
      { version, input },
      async (ctx) => {
        const row = await this.row(ctx, id);
        const activity = await this.academics.requireActivity(
          ctx,
          row.activity_id,
        );
        requireRevision(version, "activity", activity.revision);
        const { grant, consent } = await this.rights(ctx);
        if (
          row.grant_id !== grant.id ||
          row.consent_revision !== consent.revision ||
          row.activity_revision !== activity.revision ||
          activity.type === "Entrega grupal" ||
          activity.preparationState === "done"
        ) {
          throw new DomainError(
            409,
            "ESTIMATE_STALE",
            "La sugerencia cambió. Puedes solicitar otra o ingresar el esfuerzo manualmente.",
          );
        }
        if (row.state !== "succeeded" || row.result?.status !== "estimated")
          throw new DomainError(
            409,
            "ESTIMATE_NOT_APPLICABLE",
            "Esta solicitud no produjo una sugerencia que se pueda confirmar.",
          );
        const shown = await this.presentation(ctx, row, row.result);
        if (shown.origin !== input.origin)
          throw new DomainError(
            409,
            "ESTIMATE_ORIGIN_CHANGED",
            "Revisa el rango y el origen vigentes antes de confirmar.",
          );
        const { lowMinutes, highMinutes } = shown.suggestion ?? row.result;
        if (
          input.decision === "accept" &&
          (lowMinutes === null ||
            highMinutes === null ||
            input.selectedMinutes < lowMinutes ||
            input.selectedMinutes > highMinutes)
        ) {
          throw new DomainError(
            422,
            "ESTIMATE_MINUTES_OUTSIDE_RANGE",
            "Elige minutos dentro del rango o confirma una corrección.",
          );
        }
        return this.academics.confirmEstimatedEffortIn(
          ctx,
          activity,
          input.selectedMinutes,
          {
            id,
            origin:
              input.decision === "correct"
                ? "corrected"
                : shown.origin === "personalized"
                  ? "personalized"
                  : "suggested",
          },
        );
      },
    );
  }
}
