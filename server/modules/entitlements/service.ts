import { sql } from "drizzle-orm";
import type { Academics, Context } from "../academics/service.js";
import { DomainError } from "../../errors.js";
import { requireRevision } from "../academics/policy.js";

export const consentVersion = "estimate-analysis-v1";
const notice =
  "Autorizo el uso del fragmento académico revisado para solicitar una estimación con OpenAI. Elimina datos personales antes de enviarlo. Puedes retirar el consentimiento en cualquier momento.";

export async function activeGrant(ctx: Context, now: Date) {
  const { rows } = await ctx.db.execute<{
    id: string;
    expires_at: string | Date;
  }>(sql`
    select id,expires_at from app.premium_grants where owner_id=${ctx.owner}
    and revoked_at is null and granted_at<=${now.toISOString()} and expires_at>${now.toISOString()}
  `);
  return rows[0];
}

export async function estimateConsent(ctx: Context) {
  const { rows } = await ctx.db.execute<{
    granted: boolean;
    policy_version: string;
    revision: number;
  }>(sql`
    select granted,policy_version,revision from app.estimate_consents where owner_id=${ctx.owner}
  `);
  const row = rows[0];
  return {
    policyVersion: consentVersion,
    granted: row?.policy_version === consentVersion && row.granted,
    revision: row?.revision ?? 0,
    notice,
  };
}

export class Entitlements {
  constructor(private readonly academics: Academics) {}

  get(owner: string, configured: boolean) {
    return this.academics.read(owner, async (ctx) => {
      const grant = await activeGrant(ctx, this.academics.now());
      return {
        plan: grant ? ("premium" as const) : ("free" as const),
        expiresAt: grant ? new Date(grant.expires_at).toISOString() : null,
        estimatesAvailable: Boolean(grant && configured),
      };
    });
  }

  consent(owner: string) {
    return this.academics.read(owner, estimateConsent);
  }

  async changeConsent(
    owner: string,
    key: string | undefined,
    revision: string | undefined,
    version: string,
    granted: boolean,
  ) {
    if (version !== consentVersion)
      throw new DomainError(
        409,
        "CONSENT_POLICY_CHANGED",
        "Revisa la versión vigente del consentimiento.",
      );
    await this.academics.mutate(
      owner,
      "estimate-consent",
      key,
      { revision, version, granted },
      async (ctx) => {
        requireRevision(
          revision,
          "consent",
          (await estimateConsent(ctx)).revision,
        );
        await ctx.db.execute(sql`
        insert into app.estimate_consents(owner_id,policy_version,granted,revision,changed_at)
        values(${owner},${version},${granted},1,${this.academics.now().toISOString()})
        on conflict(owner_id) do update set policy_version=excluded.policy_version,
          granted=excluded.granted,revision=app.estimate_consents.revision+1,changed_at=excluded.changed_at
        where (app.estimate_consents.policy_version,app.estimate_consents.granted)
          is distinct from (excluded.policy_version,excluded.granted)
      `);
        return { status: 200, data: null };
      },
    );
    return this.consent(owner);
  }
}
