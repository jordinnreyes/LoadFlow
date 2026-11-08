import { randomUUID, createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import {
  calendarRanges,
  calendarWeekRange,
  visibleWeekStart,
} from "./ranges.js";
import type {
  EventsDto,
  RefreshInput,
} from "../../../packages/contracts/calendar.js";
import { ownerTransaction } from "../../db/client.js";
import { DomainError, notFound } from "../../errors.js";
import type { Context } from "../academics/service.js";
import {
  requireRevision,
  invalid,
  utcInstant,
  timezone,
} from "../academics/policy.js";
import type { Identity, SessionContext } from "../identity/service.js";
import { hash, opaque } from "../identity/crypto.js";
import { AvailabilityService } from "../availability/service.js";
import { isoSpans, union } from "../availability/rules.js";
import { snapshotCoverage, type StoredSnapshot } from "./coverage.js";
import {
  CalendarFailure,
  CALENDAR_POLICY,
  EVENT_TITLES_SCOPE,
  granted,
  type CalendarProvider,
  type Token,
  type CalendarInfo,
  type BusyResult,
} from "./provider.js";
export const CALENDAR_COOKIE = "__Host-cw_calendar_oauth";
type ConnectionRow = {
  owner_id: string;
  id: string;
  credential_id: string | null;
  event_titles_credential_id: string | null;
  event_titles_revision: number;
  event_titles_visible: boolean;
  state: "active" | "disconnected" | "revoked";
  revision: number;
  selection_revision: number;
  changed_at: Date;
  last_attempt_at: Date | null;
  last_success_at: Date | null;
  safe_error: string | null;
};
type SourceRow = {
  id: string;
  provider_id: string;
  display_name: string;
  timezone: string | null;
  primary_calendar: boolean;
  selected: boolean;
  accessible: boolean;
  last_error: string | null;
  last_error_at: Date | null;
};
export type JobRow = {
  id: string;
  owner_id: string;
  period_id: string;
  connection_revision: number;
  selection_revision: number;
  status:
    "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
  attempts: number;
  run_after: Date;
  finished_at: Date | null;
  safe_error: string | null;
  lease_token: string | null;
  lease_until: Date | null;
};
type ScopedJob = JobRow & {
  requested_week: string | null;
  include_current_week: boolean;
};
const query = async <T>(ctx: Context, statement: SQL) =>
  (await ctx.db.execute(statement)).rows as unknown as T[];
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
const ownsLease = (current: JobRow | undefined, claim: JobRow, now: Date) =>
  current?.status === "running" &&
  current.lease_token === claim.lease_token &&
  current.lease_until !== null &&
  new Date(current.lease_until) > now;
const unavailable = () =>
  new DomainError(
    503,
    "CALENDAR_NOT_CONFIGURED",
    "Configura el cliente OAuth de Calendar para esta prueba.",
  );
export const jobDto = (j: JobRow) => ({
  id: j.id,
  type: "calendar_refresh" as const,
  status: j.status,
  attempts: j.attempts,
  runAfter: iso(j.run_after)!,
  finishedAt: iso(j.finished_at),
  safeError: j.safe_error,
});
export class CalendarService {
  readonly availability: AvailabilityService;
  constructor(
    readonly identity: Identity,
    readonly provider?: CalendarProvider,
    readonly queueName = "calendar",
  ) {
    this.availability = new AvailabilityService(identity.academics);
  }
  get academics() {
    return this.identity.academics;
  }
  get now() {
    return this.identity.now;
  }
  async connectionRow(ctx: Context) {
    return (
      await query<ConnectionRow>(
        ctx,
        sql`select * from app.calendar_connections where owner_id=${ctx.owner}`,
      )
    )[0];
  }
  async sourceRows(ctx: Context) {
    return query<SourceRow>(
      ctx,
      sql`select * from app.calendar_sources where owner_id=${ctx.owner} order by id`,
    );
  }
  async connection(ctx: Context) {
    const c = await this.connectionRow(ctx),
      sources = await this.sourceRows(ctx),
      selectedCount = sources.filter((s) => s.selected).length;
    const eventTitlesAuthorized =
      c?.state === "active" && !!c.event_titles_credential_id;
    let state = "not_connected";
    if (c?.state === "revoked") state = "revoked";
    else if (c?.state === "active")
      state =
        c.safe_error === "CALENDAR_PARTIAL" ||
        c.safe_error === "CALENDAR_SELECTION_REQUIRED"
          ? "partial"
          : c.safe_error
            ? "error"
            : !selectedCount || !c.last_success_at
              ? "partial"
              : this.now().getTime() - new Date(c.last_success_at).getTime() >
                  1800000
                ? "stale"
                : "connected";
    return {
      configured: !!this.provider,
      state,
      revision: c?.revision ?? 0,
      selectionRevision: c?.selection_revision ?? 0,
      selectedCount,
      eventTitlesAuthorized,
      eventTitlesEnabled: eventTitlesAuthorized && !!c?.event_titles_visible,
      lastAttemptAt: iso(c?.last_attempt_at ?? null),
      lastSuccessAt: iso(c?.last_success_at ?? null),
      safeError: c?.safe_error ?? null,
      policy: CALENDAR_POLICY,
    };
  }
  getConnection(owner: string) {
    return this.academics.read(owner, (ctx) => this.connection(ctx));
  }
  sources(owner: string) {
    return this.academics.read(owner, async (ctx) => ({
      items: (await this.sourceRows(ctx)).map((s) => ({
        id: s.id,
        name: s.display_name,
        timezone: s.timezone,
        primary: s.primary_calendar,
        selected: s.selected,
        accessible: s.accessible,
      })),
      connection: await this.connection(ctx),
    }));
  }
  async invalidate(
    ctx: Context,
    kind: string,
    summary: Record<string, unknown>,
  ) {
    const periods = await query<{ id: string }>(
      ctx,
      sql`select id from app.academic_periods where owner_id=${ctx.owner}`,
    );
    for (const p of periods)
      await this.availability.changed(ctx, p.id, kind, summary);
  }
  async authorize(session: SessionContext, eventTitles = false) {
    if (!this.provider) throw unavailable();
    const state = opaque(),
      verifier = opaque(),
      browser = opaque(),
      expiresAt = new Date(this.now().getTime() + 10 * 60000).toISOString();
    const current = await this.academics.read(session.ownerId, async (ctx) =>
      this.connectionRow(ctx),
    );
    if (
      eventTitles &&
      (current?.state !== "active" || current.event_titles_credential_id)
    )
      throw invalid(
        "CALENDAR_TITLE_AUTH_UNAVAILABLE",
        "Conecta Google Calendar antes de activar los títulos.",
      );
    await ownerTransaction(this.identity.pool, session.ownerId, async (c) => {
      await c.query(
        "insert into app.calendar_oauth_transactions(id,owner_id,session_id,state_hash,browser_hash,verifier_ciphertext,base_revision,expires_at,request_event_titles,base_event_titles_revision) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          randomUUID(),
          session.ownerId,
          session.id,
          hash(state),
          hash(browser),
          this.identity.secrets.encrypt(verifier),
          current?.revision ?? 0,
          expiresAt,
          eventTitles,
          current?.event_titles_revision ?? 0,
        ],
      );
    });
    return {
      browser,
      data: {
        authorizationUrl: this.provider.authorization(state, verifier),
        expiresAt,
      },
    };
  }
  async callback(
    session: SessionContext,
    browser: string | undefined,
    input: { state?: string; code?: string; error?: string },
  ) {
    if (!this.provider) throw unavailable();
    const transaction = await ownerTransaction(
      this.identity.pool,
      session.ownerId,
      async (c) => {
        const r = (
          await c.query<{
            id: string;
            session_id: string;
            browser_hash: string;
            verifier_ciphertext: string;
            base_revision: number;
            request_event_titles: boolean;
            base_event_titles_revision: number;
            expires_at: Date;
            consumed_at: Date | null;
          }>(
            "select * from app.calendar_oauth_transactions where owner_id=$1 and state_hash=$2 for update",
            [session.ownerId, hash(input.state ?? "")],
          )
        ).rows[0];
        if (
          !r ||
          r.session_id !== session.id ||
          !browser ||
          r.browser_hash !== hash(browser) ||
          r.consumed_at ||
          new Date(r.expires_at) <= this.now()
        )
          throw new DomainError(
            400,
            "CALENDAR_FLOW_INVALID",
            "Inicia nuevamente la autorización de Calendar.",
          );
        await c.query(
          "update app.calendar_oauth_transactions set consumed_at=$1 where owner_id=$2 and id=$3",
          [this.now(), session.ownerId, r.id],
        );
        return r;
      },
    );
    if (input.error || !input.code)
      throw new DomainError(
        400,
        "CALENDAR_CANCELLED",
        "Calendar no fue conectado. Puedes continuar con disponibilidad manual.",
      );
    let token: Token;
    try {
      token = await this.provider.exchange(
        input.code,
        this.identity.secrets.decrypt<string>(transaction.verifier_ciphertext),
      );
    } catch (e) {
      throw this.safeError(e);
    }
    if (
      !granted(token.scopes) ||
      (transaction.request_event_titles &&
        !token.scopes.includes(EVENT_TITLES_SCOPE))
    )
      throw new DomainError(
        403,
        "CALENDAR_SCOPES_REQUIRED",
        "Google no concedió los permisos solicitados de Calendar.",
      );
    let primary: string | undefined;
    if (transaction.request_event_titles) {
      try {
        primary = (await this.provider.calendars(token)).find(
          (source) => source.primary,
        )?.providerId;
      } catch (e) {
        throw this.safeError(e);
      }
    }
    const credentialId = randomUUID();
    const titlesCredentialId = token.scopes.includes(EVENT_TITLES_SCOPE)
      ? credentialId
      : null;
    await ownerTransaction(this.identity.pool, session.ownerId, async (c) => {
      await c.query(
        "insert into app.calendar_credentials(id,owner_id,ciphertext) values($1,$2,$3)",
        [credentialId, session.ownerId, this.identity.secrets.encrypt(token)],
      );
    });
    const result = await this.academics
      .read(session.ownerId, async (ctx) => {
        const old = await this.connectionRow(ctx);
        if ((old?.revision ?? 0) !== transaction.base_revision)
          throw new DomainError(
            409,
            "CALENDAR_FLOW_OUTDATED",
            "La conexión cambió. Inicia nuevamente la autorización.",
          );
        if (transaction.request_event_titles) {
          if (
            old?.state !== "active" ||
            old.event_titles_revision !== transaction.base_event_titles_revision
          )
            throw new DomainError(
              409,
              "CALENDAR_FLOW_OUTDATED",
              "La conexión cambió. Inicia nuevamente la autorización.",
            );
          const sources = await this.sourceRows(ctx);
          if (
            !primary ||
            !sources.some(
              (source) =>
                source.primary_calendar &&
                source.accessible &&
                source.provider_id === primary,
            )
          )
            throw invalid(
              "CALENDAR_GOOGLE_ACCOUNT_MISMATCH",
              "Autoriza los títulos con la misma cuenta de Google que conectaste a Calendar.",
            );
          await ctx.db.execute(
            sql`update app.calendar_connections set event_titles_credential_id=${credentialId},event_titles_visible=true,event_titles_revision=event_titles_revision+1 where owner_id=${ctx.owner}`,
          );
          return { connection: await this.connection(ctx), retired: null };
        }
        await ctx.db.execute(
          sql`insert into app.calendar_connections(owner_id,id,credential_id,state,granted_scopes,revision,changed_at,event_titles_credential_id) values(${ctx.owner},${randomUUID()},${credentialId},'active',array(select jsonb_array_elements_text(${JSON.stringify(token.scopes)}::jsonb)),1,${this.now().toISOString()},${titlesCredentialId}) on conflict(owner_id) do update set credential_id=excluded.credential_id,state='active',granted_scopes=excluded.granted_scopes,revision=app.calendar_connections.revision+1,last_attempt_at=null,last_success_at=null,safe_error=null,changed_at=excluded.changed_at,event_titles_credential_id=excluded.event_titles_credential_id,event_titles_visible=false,event_titles_revision=app.calendar_connections.event_titles_revision+1`,
        );
        if (old)
          await ctx.db.execute(
            sql`update app.calendar_sources set accessible=false,selected=false where owner_id=${ctx.owner}`,
          );
        await this.cancelJobs(ctx);
        await this.invalidate(ctx, "calendar_connected", {
          beforeRevision: old?.revision ?? 0,
          afterRevision: (old?.revision ?? 0) + 1,
          sessionsChanged: false,
        });
        return {
          connection: await this.connection(ctx),
          retired: old?.event_titles_credential_id,
        };
      })
      .catch(async (e: unknown) => {
        await this.deleteCredential(session.ownerId, credentialId);
        throw e;
      });
    if (result.retired)
      await this.deleteCredential(session.ownerId, result.retired);
    return result.connection;
  }
  safeError(e: unknown) {
    const f =
      e instanceof CalendarFailure
        ? e
        : new CalendarFailure("CALENDAR_PROVIDER_ERROR", true);
    return new DomainError(
      f.revoked ? 409 : f.code === "CALENDAR_SCOPES_REQUIRED" ? 403 : 503,
      f.code,
      f.revoked
        ? "Vuelve a conectar Calendar."
        : "No pudimos consultar Calendar. Se conserva la ocupación conocida.",
    );
  }
  async cancelJobs(ctx: Context) {
    await ctx.db.execute(
      sql`update app.jobs set status='cancelled',finished_at=${this.now().toISOString()},lease_token=null,lease_until=null where owner_id=${ctx.owner} and status in ('queued','running')`,
    );
  }
  selection(
    owner: string,
    version: string | undefined,
    key: string | undefined,
    ids: string[],
  ) {
    return this.academics.mutate(
      owner,
      "calendar-selection",
      key,
      { version, ids },
      async (ctx) => {
        const c = await this.connectionRow(ctx);
        if (!c || c.state !== "active")
          throw invalid(
            "CALENDAR_CONNECTION_REQUIRED",
            "Conecta Calendar antes de seleccionar fuentes.",
          );
        requireRevision(version, "calendar", c.revision);
        const sources = await this.sourceRows(ctx);
        if (ids.some((id) => !sources.some((s) => s.id === id && s.accessible)))
          throw notFound();
        await ctx.db.execute(
          sql`update app.calendar_sources set selected=false where owner_id=${owner}`,
        );
        for (const id of ids)
          await ctx.db.execute(
            sql`update app.calendar_sources set selected=true where owner_id=${owner} and id=${id}`,
          );
        await ctx.db.execute(
          sql`update app.calendar_connections set revision=revision+1,selection_revision=selection_revision+1,last_success_at=null,safe_error=null,changed_at=${this.now().toISOString()} where owner_id=${owner}`,
        );
        await this.cancelJobs(ctx);
        await this.invalidate(ctx, "calendar_selection_changed", {
          before: sources.filter((s) => s.selected).map((s) => s.id),
          after: ids,
          sessionsChanged: false,
        });
        return {
          status: 200,
          data: await this.connection(ctx),
          etag: `"calendar-${c.revision + 1}"`,
        };
      },
    );
  }
  async credential(owner: string, id: string) {
    return ownerTransaction(this.identity.pool, owner, async (c) => {
      const r = (
        await c.query<{ ciphertext: string }>(
          "select ciphertext from app.calendar_credentials where owner_id=$1 and id=$2",
          [owner, id],
        )
      ).rows[0];
      if (!r)
        throw new CalendarFailure(
          "CALENDAR_CREDENTIAL_MISSING",
          false,
          0,
          true,
        );
      return this.identity.secrets.decrypt<Token>(r.ciphertext);
    });
  }
  async storeCredential(owner: string, id: string, token: Token) {
    await ownerTransaction(this.identity.pool, owner, (c) =>
      c.query(
        "update app.calendar_credentials set ciphertext=$1 where owner_id=$2 and id=$3",
        [this.identity.secrets.encrypt(token), owner, id],
      ),
    );
  }
  private deleteCredential(owner: string, id: string) {
    return ownerTransaction(this.identity.pool, owner, (c) =>
      c.query(
        "delete from app.calendar_credentials where owner_id=$1 and id=$2",
        [owner, id],
      ),
    );
  }
  async currentToken(owner: string, c: Pick<ConnectionRow, "credential_id">) {
    if (!this.provider || !c.credential_id)
      throw new CalendarFailure("CALENDAR_CREDENTIAL_MISSING", false, 0, true);
    let token = await this.credential(owner, c.credential_id);
    if (token.expiresAt <= this.now().getTime() + 60000) {
      token = await this.provider.refresh(token);
      await this.storeCredential(owner, c.credential_id, token);
    }
    return token;
  }
  async disconnect(
    owner: string,
    version: string | undefined,
    key: string | undefined,
  ) {
    const result = await this.academics.mutate(
      owner,
      "calendar-disconnect",
      key,
      { version },
      async (ctx) => {
        const c = await this.connectionRow(ctx);
        requireRevision(version, "calendar", c?.revision ?? 0);
        if (!c)
          return {
            status: 200,
            data: {
              connection: await this.connection(ctx),
              revocation: "not_required",
            },
          };
        await ctx.db.execute(
          sql`update app.calendar_connections set state='disconnected',credential_id=null,revision=revision+1,changed_at=${this.now().toISOString()},safe_error=null,event_titles_credential_id=null,event_titles_visible=false,event_titles_revision=event_titles_revision+1 where owner_id=${owner}`,
        );
        await this.cancelJobs(ctx);
        await this.invalidate(ctx, "calendar_disconnected", {
          beforeRevision: c.revision,
          afterRevision: c.revision + 1,
          sessionsChanged: false,
        });
        return {
          status: 200,
          data: {
            connection: await this.connection(ctx),
            revocation: c.credential_id ? "pending" : "not_required",
            credentialId: c.credential_id,
            titlesCredentialId: c.event_titles_credential_id,
          },
        };
      },
    );
    const privateData = result.data as {
      connection: unknown;
      revocation: string;
      credentialId?: string | null;
      titlesCredentialId?: string | null;
    };
    if (
      privateData.titlesCredentialId &&
      privateData.titlesCredentialId !== privateData.credentialId
    )
      await this.deleteCredential(owner, privateData.titlesCredentialId);
    let revocation = privateData.revocation;
    if (privateData.credentialId) {
      try {
        if (!this.provider) throw unavailable();
        await this.provider.revoke(
          await this.credential(owner, privateData.credentialId),
        );
        revocation = "confirmed";
        await ownerTransaction(this.identity.pool, owner, (c) =>
          c.query(
            "delete from app.calendar_credentials where owner_id=$1 and id=$2",
            [owner, privateData.credentialId],
          ),
        );
      } catch {
        revocation = "unconfirmed";
      }
      if (revocation === "confirmed") {
        const response = {
          status: result.status,
          data: { connection: privateData.connection, revocation },
        };
        await this.academics.read(owner, async (ctx) => {
          await ctx.db.execute(
            sql`update app.idempotency_records set response=${JSON.stringify(response)}::jsonb where owner_id=${owner} and operation='calendar-disconnect' and key=${key}`,
          );
        });
      }
    }
    return {
      status: result.status,
      data: { connection: privateData.connection, revocation },
    };
  }
  refresh(owner: string, key: string | undefined, input: RefreshInput) {
    if (input.weekStart || input.includeCurrentWeek) {
      if (input.reason !== "manual")
        throw invalid(
          "CALENDAR_WEEK_REQUIRES_MANUAL_REFRESH",
          "Actualiza la semana desde el calendario.",
        );
      if (input.weekStart && input.includeCurrentWeek)
        throw invalid(
          "INVALID_CALENDAR_WEEK",
          "Elige un solo alcance de actualización.",
        );
      if (input.weekStart) visibleWeekStart(input.weekStart);
    }
    return this.academics.mutate(
      owner,
      "calendar-refresh",
      key,
      input,
      async (ctx) => {
        await this.academics.requirePeriod(ctx, input.periodId);
        const c = await this.connectionRow(ctx);
        if (!c || c.state !== "active")
          throw invalid(
            "CALENDAR_CONNECTION_REQUIRED",
            "Conecta Calendar o utiliza disponibilidad manual.",
          );
        if (!this.provider) throw unavailable();
        const active = (
          await query<ScopedJob>(
            ctx,
            sql`select *, week_start::text as requested_week from app.jobs where owner_id=${owner} and queue_name=${this.queueName} and status in ('queued','running') order by created_at desc limit 1`,
          )
        )[0];
        if (
          active &&
          (active.requested_week !== (input.weekStart ?? null) ||
            active.include_current_week !== !!input.includeCurrentWeek ||
            active.period_id !== input.periodId)
        )
          throw new DomainError(
            409,
            "CALENDAR_REFRESH_IN_PROGRESS",
            "Hay otra consulta en curso. Espera a que termine y vuelve a actualizar.",
          );
        if (active)
          return {
            status: 202,
            data: {
              job: jobDto(active),
              deduplicated: true,
              statusUrl: `/api/v1/jobs/${active.id}`,
            },
          };
        const previous = (
          await query<{ created_at: Date; finished_at: Date | null }>(
            ctx,
            sql`select created_at,finished_at from app.jobs where owner_id=${owner} and queue_name=${this.queueName} order by created_at desc limit 1`,
          )
        )[0];
        const now = this.now();
        const manual = input.reason === "manual";
        if (
          !manual &&
          previous &&
          now.getTime() - new Date(previous.created_at).getTime() <
            CALENDAR_POLICY.cooldownSeconds * 1000
        )
          throw new DomainError(
            429,
            "CALENDAR_COOLDOWN",
            "Espera 60 segundos antes de volver a solicitar una lectura.",
          );
        const runAfter =
          manual && previous
            ? new Date(
                Math.max(
                  now.getTime(),
                  new Date(
                    previous.finished_at ?? previous.created_at,
                  ).getTime() +
                    CALENDAR_POLICY.manualCooldownSeconds * 1000,
                ),
              )
            : now;
        const id = randomUUID();
        await ctx.db.execute(
          sql`insert into app.jobs(id,owner_id,period_id,type,connection_revision,selection_revision,dedupe_key,status,run_after,created_at,queue_name,week_start,include_current_week) values(${id},${owner},${input.periodId},'calendar_refresh',${c.revision},${c.selection_revision},'calendar_refresh','queued',${runAfter.toISOString()},${now.toISOString()},${this.queueName},${input.weekStart ?? null},${!!input.includeCurrentWeek})`,
        );
        const job = (
          await query<JobRow>(
            ctx,
            sql`select * from app.jobs where owner_id=${owner} and id=${id}`,
          )
        )[0];
        return {
          status: 202,
          data: {
            job: jobDto(job),
            deduplicated: false,
            statusUrl: `/api/v1/jobs/${id}`,
          },
        };
      },
    );
  }
  job(owner: string, id: string) {
    return this.academics.read(owner, async (ctx) => {
      const r = (
        await query<JobRow>(
          ctx,
          sql`select * from app.jobs where owner_id=${owner} and id=${id}`,
        )
      )[0];
      if (!r) throw notFound();
      return jobDto(r);
    });
  }
  async busy(ctx: Context, from: string, to: string) {
    utcInstant(from);
    utcInstant(to);
    const range = { start: Date.parse(from), end: Date.parse(to) };
    if (range.end <= range.start || range.end - range.start > 32 * 86400000)
      throw invalid(
        "INVALID_RANGE",
        "Consulta ocupación por tramos de hasta 31 días locales.",
      );
    const c = await this.connectionRow(ctx),
      connection = await this.connection(ctx);
    if (!c)
      return {
        connection,
        from,
        to,
        coverage: "unknown" as const,
        busy: [],
        covered: [],
        issues: ["CALENDAR_NOT_CONNECTED"],
        lastFetchedAt: null,
        validUntil: null,
      };
    const sources = (await this.sourceRows(ctx)).filter((s) => s.selected);
    const snapshots = await query<Omit<StoredSnapshot, "intervals">>(
      ctx,
      sql`select s.* from app.busy_snapshots s join app.calendar_sources c on c.id=s.calendar_id and c.owner_id=s.owner_id where s.owner_id=${ctx.owner} and c.selected and s.range_start<${to}::timestamptz and s.range_end>${from}::timestamptz`,
    );
    const intervals = await query<{
      snapshot_id: string;
      start_at: Date;
      end_at: Date;
    }>(
      ctx,
      sql`select b.snapshot_id,b.start_at,b.end_at from app.external_busy_intervals b join app.busy_snapshots s on s.id=b.snapshot_id and s.owner_id=b.owner_id join app.calendar_sources c on c.id=s.calendar_id and c.owner_id=s.owner_id where b.owner_id=${ctx.owner} and c.selected and s.range_start<${to}::timestamptz and s.range_end>${from}::timestamptz`,
    );
    const coverage = snapshotCoverage(
      sources.map((s) => s.id),
      snapshots.map((s) => ({
        ...s,
        intervals: intervals
          .filter((b) => b.snapshot_id === s.id)
          .map((b) => ({
            start: new Date(b.start_at).getTime(),
            end: new Date(b.end_at).getTime(),
          })),
      })),
      range,
      this.now(),
      c,
      Object.fromEntries(
        sources
          .filter((s) => s.last_error_at)
          .map((s) => [s.id, new Date(s.last_error_at!).getTime()]),
      ),
    );
    return {
      connection,
      from,
      to,
      coverage: coverage.coverage,
      busy: isoSpans(coverage.busy),
      covered: isoSpans(coverage.covered),
      issues:
        coverage.coverage === "complete"
          ? []
          : [
              !sources.length
                ? "CALENDAR_SELECTION_REQUIRED"
                : c.state === "disconnected"
                  ? "CALENDAR_DISCONNECTED_REFERENCE"
                  : c.state === "revoked"
                    ? "CALENDAR_REVOKED"
                    : (c.safe_error ?? "CALENDAR_COVERAGE_UNKNOWN"),
            ],
      lastFetchedAt: coverage.lastFetchedAt,
      validUntil: coverage.validUntil,
    };
  }
  getBusy(owner: string, from: string, to: string) {
    return this.academics.read(owner, (ctx) => this.busy(ctx, from, to));
  }
  setEventTitleVisibility(
    owner: string,
    key: string | undefined,
    visible: boolean,
  ) {
    return this.academics.mutate(
      owner,
      "calendar-title-visibility",
      key,
      { visible },
      async (ctx) => {
        const c = await this.connectionRow(ctx);
        if (visible && (c?.state !== "active" || !c.event_titles_credential_id))
          throw invalid(
            "CALENDAR_TITLE_AUTH_REQUIRED",
            "Autoriza la lectura de eventos de Google Calendar.",
          );
        if (c)
          await ctx.db.execute(
            sql`update app.calendar_connections set event_titles_visible=${visible},event_titles_revision=event_titles_revision+1 where owner_id=${owner}`,
          );
        return {
          status: 200,
          data: await this.connection(ctx),
        };
      },
    );
  }
  async events(owner: string, from: string, to: string): Promise<EventsDto> {
    utcInstant(from);
    utcInstant(to);
    const duration = Date.parse(to) - Date.parse(from);
    if (duration <= 0 || duration > 8 * 86400000)
      throw invalid(
        "INVALID_RANGE",
        "Consulta los títulos de una semana a la vez.",
      );
    const provider = this.provider;
    if (!provider) throw unavailable();
    const target = await this.academics.read(owner, async (ctx) => {
      const c = await this.connectionRow(ctx);
      if (
        c?.state !== "active" ||
        !c.event_titles_credential_id ||
        !c.event_titles_visible
      )
        return null;
      const sources = (await this.sourceRows(ctx)).filter(
        (s) => s.selected && s.accessible,
      );
      return {
        revision: c.revision,
        titlesRevision: c.event_titles_revision,
        credential: c.event_titles_credential_id,
        sources,
      };
    });
    if (!target || !target.sources.length) return { items: [], partial: false };
    const signal = AbortSignal.timeout(12000);
    let token: Token;
    try {
      token = await this.currentToken(owner, {
        credential_id: target.credential,
      });
      if (!token.scopes.includes(EVENT_TITLES_SCOPE))
        return { items: [], partial: true };
    } catch (e) {
      throw this.safeError(e);
    }
    const sources = target.sources.slice(0, 8);
    const lists = await Promise.allSettled(
      sources.map((s) =>
        provider.events(
          token,
          { providerId: s.provider_id, timezone: s.timezone },
          from,
          to,
          signal,
        ),
      ),
    );
    const current = await this.academics.read(owner, (ctx) =>
      this.connectionRow(ctx),
    );
    if (
      current?.state !== "active" ||
      current.revision !== target.revision ||
      current.event_titles_revision !== target.titlesRevision
    )
      return { items: [], partial: false };
    return {
      items: lists.flatMap((list) =>
        list.status === "fulfilled" ? list.value.items : [],
      ),
      partial:
        sources.length !== target.sources.length ||
        lists.some((list) => list.status === "rejected" || list.value.partial),
    };
  }
  async prepare(job: JobRow) {
    return this.academics.read(job.owner_id, async (ctx) => {
      const c = await this.connectionRow(ctx),
        current = (
          await query<ScopedJob>(
            ctx,
            sql`select *, week_start::text as requested_week from app.jobs where owner_id=${ctx.owner} and id=${job.id} for update`,
          )
        )[0];
      if (
        !current ||
        !c ||
        c.state !== "active" ||
        c.revision !== job.connection_revision ||
        c.selection_revision !== job.selection_revision ||
        !ownsLease(current, job, this.now())
      )
        return null;
      if (!(await this.sourceRows(ctx)).some((s) => s.selected)) {
        await ctx.db.execute(
          sql`update app.calendar_connections set last_attempt_at=${this.now().toISOString()} where owner_id=${ctx.owner}`,
        );
        return { connection: c, chunks: [] as { from: string; to: string }[] };
      }
      const profile = (
        await query<{ study_timezone: string | null }>(
          ctx,
          sql`select study_timezone from app.users where owner_id=${ctx.owner}`,
        )
      )[0];
      const period = await this.academics.requirePeriod(ctx, job.period_id),
        config = await this.availability.configuration(ctx, job.period_id),
        planningZone =
          config.configuration?.timezone ??
          period.timezone ??
          profile?.study_timezone,
        zone = timezone(
          current.requested_week
            ? (profile?.study_timezone ?? planningZone)
            : planningZone,
        );
      if (!zone) throw new CalendarFailure("STUDY_TIMEZONE_REQUIRED");
      const deadlines = current.requested_week
        ? []
        : await query<{
            due_at: Date | null;
            due_date: string;
            academic_timezone: string | null;
          }>(
            ctx,
            sql`select due_at,due_date,academic_timezone from app.activities where owner_id=${ctx.owner}`,
          );
      const chunks = current.requested_week
        ? [calendarWeekRange(current.requested_week, zone)]
        : calendarRanges(
            this.now(),
            zone,
            deadlines.map((d) => ({
              dueAt: d.due_at ? new Date(d.due_at).toISOString() : null,
              dueDate: d.due_date,
              timezone: d.academic_timezone,
            })),
            current.include_current_week
              ? (profile?.study_timezone ?? zone)
              : undefined,
          );
      await ctx.db.execute(
        sql`update app.calendar_connections set last_attempt_at=${this.now().toISOString()} where owner_id=${ctx.owner}`,
      );
      return { connection: c, chunks };
    });
  }
  async persist(
    job: JobRow,
    calendars: CalendarInfo[],
    chunks: { from: string; to: string; results: BusyResult[] }[],
    partial: boolean,
    finish: {
      status: "queued" | "partial" | "succeeded";
      error: string | null;
      delay: number;
    },
  ) {
    return this.academics.read(job.owner_id, async (ctx) => {
      const c = await this.connectionRow(ctx),
        j = (
          await query<JobRow>(
            ctx,
            sql`select * from app.jobs where owner_id=${ctx.owner} and id=${job.id} for update`,
          )
        )[0];
      if (
        !c ||
        c.state !== "active" ||
        c.revision !== job.connection_revision ||
        c.selection_revision !== job.selection_revision ||
        !ownsLease(j, job, this.now())
      )
        return false;
      const comparison = async () => {
        const result: {
          from: string;
          to: string;
          coverage: string;
          busy: { startAt: string; endAt: string }[];
          covered: { startAt: string; endAt: string }[];
        }[] = [];
        for (const chunk of chunks) {
          const b = await this.busy(ctx, chunk.from, chunk.to);
          result.push({
            from: chunk.from,
            to: chunk.to,
            coverage: b.coverage,
            busy: b.busy,
            covered: b.covered,
          });
        }
        return result;
      };
      const before = await comparison();
      await ctx.db.execute(
        sql`update app.calendar_sources set accessible=false where owner_id=${ctx.owner}`,
      );
      for (const source of calendars)
        await ctx.db.execute(
          sql`insert into app.calendar_sources(id,owner_id,connection_id,provider_id,display_name,timezone,primary_calendar,accessible) values(${randomUUID()},${ctx.owner},${c.id},${source.providerId},${source.name},${source.timezone},${source.primary},true) on conflict(owner_id,connection_id,provider_id) do update set display_name=excluded.display_name,timezone=excluded.timezone,primary_calendar=excluded.primary_calendar,accessible=true`,
        );
      const sources = await this.sourceRows(ctx);
      for (const source of sources.filter((s) => s.selected)) {
        const failed = chunks.some((chunk) =>
          chunk.results.some(
            (r) => r.providerId === source.provider_id && r.error,
          ),
        );
        await ctx.db.execute(
          sql`update app.calendar_sources set last_error=${failed ? "CALENDAR_SOURCE_UNAVAILABLE" : null},last_error_at=${failed ? this.now().toISOString() : null} where owner_id=${ctx.owner} and id=${source.id}`,
        );
      }
      let count = 0;
      for (const chunk of chunks)
        for (const result of chunk.results) {
          const source = sources.find(
            (s) => s.provider_id === result.providerId && s.selected,
          );
          if (!source || result.error) continue;
          const range = {
            start: Date.parse(chunk.from),
            end: Date.parse(chunk.to),
          };
          const busy = union(
            result.busy.map((b) => ({
              start: Math.max(
                range.start,
                Math.floor(Date.parse(b.startAt) / 60000) * 60000,
              ),
              end: Math.min(
                range.end,
                Math.ceil(Date.parse(b.endAt) / 60000) * 60000,
              ),
            })),
          );
          const id = randomUUID(),
            contentHash = createHash("sha256")
              .update(JSON.stringify(busy))
              .digest("hex");
          await ctx.db.execute(
            sql`insert into app.busy_snapshots(id,owner_id,calendar_id,connection_revision,selection_revision,range_start,range_end,fetched_at,content_hash) values(${id},${ctx.owner},${source.id},${c.revision},${c.selection_revision},${chunk.from},${chunk.to},${this.now().toISOString()},${contentHash})`,
          );
          for (const block of busy)
            await ctx.db.execute(
              sql`insert into app.external_busy_intervals(id,owner_id,snapshot_id,start_at,end_at) values(${randomUUID()},${ctx.owner},${id},${new Date(block.start).toISOString()},${new Date(block.end).toISOString()})`,
            );
          count++;
        }
      const selected = sources.filter((s) => s.selected),
        safeError = partial
          ? "CALENDAR_PARTIAL"
          : selected.length === 0
            ? "CALENDAR_SELECTION_REQUIRED"
            : null;
      await ctx.db.execute(
        sql`update app.calendar_connections set last_success_at=${count ? this.now().toISOString() : iso(c.last_success_at)},safe_error=${safeError} where owner_id=${ctx.owner}`,
      );
      const after = await comparison();
      if (JSON.stringify(before) !== JSON.stringify(after))
        await this.invalidate(ctx, "calendar_occupancy_refreshed", {
          jobId: job.id,
          connectionRevision: c.revision,
          selectionRevision: c.selection_revision,
          snapshots: count,
          partial: !!safeError,
          before,
          after,
          sessionsChanged: false,
        });
      await ctx.db.execute(
        sql`update app.jobs set status=${finish.status},safe_error=${finish.error},run_after=${new Date(this.now().getTime() + finish.delay * 1000).toISOString()},finished_at=${finish.status === "queued" ? null : this.now().toISOString()},lease_token=null,lease_until=null where owner_id=${ctx.owner} and id=${job.id} and status='running' and lease_token=${job.lease_token}`,
      );
      return true;
    });
  }
  async fail(job: JobRow, failure: CalendarFailure) {
    await this.academics.read(job.owner_id, async (ctx) => {
      const c = await this.connectionRow(ctx),
        j = (
          await query<JobRow>(
            ctx,
            sql`select * from app.jobs where owner_id=${ctx.owner} and id=${job.id} for update`,
          )
        )[0];
      if (
        !c ||
        c.state !== "active" ||
        c.revision !== job.connection_revision ||
        c.selection_revision !== job.selection_revision ||
        !ownsLease(j, job, this.now())
      )
        return;
      await ctx.db.execute(
        sql`update app.calendar_connections set state=${failure.revoked ? "revoked" : c.state},safe_error=${failure.code},changed_at=${this.now().toISOString()} where owner_id=${ctx.owner}`,
      );
      await this.invalidate(ctx, "calendar_refresh_failed", {
        jobId: job.id,
        code: failure.code,
        sessionsChanged: false,
      });
    });
  }
}
