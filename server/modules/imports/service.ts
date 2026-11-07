import { createHash, randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type { Identity } from "../identity/service.js";
import type { Context } from "../academics/service.js";
import {
  academicInstant,
  civilDate,
  effectivePriority,
  invalid,
  requireRevision,
  timezone,
} from "../academics/policy.js";
import { DomainError, notFound } from "../../errors.js";
import type {
  ConfirmRows,
  ImportDraft,
} from "../../../packages/contracts/imports.js";
import type {
  CreateActivity,
  DateChange,
} from "../../../packages/contracts/academics.js";
import {
  FileIssue,
  fileKind,
  limits,
  type Extracted,
  type Extraction,
  type FileKind,
} from "./extraction/model.js";
import { simplify } from "./extraction/recognize.js";
import type { ImportStorage } from "./storage.js";

const version = "structural-1";
const dayMs = 86_400_000;
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export const unavailable = () =>
  new DomainError(
    503,
    "IMPORTS_DISABLED",
    "La importación todavía no está habilitada en este entorno. Puedes registrar la actividad manualmente.",
  );
export const limitError = () =>
  new DomainError(
    413,
    "FILE_BYTES_LIMIT",
    "El archivo supera 10 MiB. Puedes registrar la actividad manualmente.",
  );
const conflict = (code: string, message: string) =>
  new DomainError(409, code, message);
const iso = (date: Date | string | null) =>
  date === null ? null : new Date(date).toISOString();
const rows = async <T>(ctx: Context, query: SQL) =>
  (await ctx.db.execute(query)).rows as unknown as T[];
const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;

type ImportRow = {
  id: string;
  period_id: string;
  document_id: string;
  format: FileKind;
  filename: string | null;
  sha256: string | null;
  object_state: "staging" | "stored" | "delete_pending" | "deleted";
  object_expires_at: Date;
  delete_after: Date;
  created_at: Date;
  status:
    | "uploading"
    | "queued"
    | "running"
    | "review"
    | "failed"
    | "cancelled"
    | "removed"
    | "expired";
  revision: number;
  extractor_version: string;
  attempts: number;
  safe_error: string | null;
  coverage: Extraction["units"];
  warnings: string[];
  review_expires_at: Date | null;
  lease_token: string | null;
  lease_until: Date | null;
};
type CandidateRow = {
  id: string;
  import_id: string;
  revision: number;
  ordinal: number;
  draft: ImportDraft;
  evidence: Extracted & { fingerprint?: string };
  resolution: string | null;
  confirmed_activity_id: string | null;
};
type AcademicRow = {
  id: string;
  title: string;
  type: string;
  course_id: string | null;
  due_date: string;
  revision: number;
};
type Page = { cursor?: string; limit?: string };

function dates(row: ImportRow): ImportRow {
  return {
    ...row,
    object_expires_at: new Date(row.object_expires_at),
    delete_after: new Date(row.delete_after),
    created_at: new Date(row.created_at),
    review_expires_at: row.review_expires_at
      ? new Date(row.review_expires_at)
      : null,
    lease_until: row.lease_until ? new Date(row.lease_until) : null,
  };
}
const fileErrors: Record<string, string> = {
  FILE_BYTES_LIMIT: "El archivo supera 10 MiB.",
  PDF_PAGES_LIMIT: "El PDF supera 100 páginas.",
  XLSX_SHEETS_LIMIT: "El XLSX supera 20 hojas.",
  XLSX_CELLS_LIMIT: "El XLSX supera 20 000 celdas no vacías.",
  XLSX_ZIP_EXPANSION_LIMIT: "El XLSX supera 50 MiB al descomprimirse.",
  XLSX_ZIP_ENTRIES_LIMIT: "El XLSX supera 2000 entradas ZIP.",
  FILE_CANDIDATES_LIMIT: "El archivo supera 500 candidatos reconocidos.",
  EXTRACTION_TIMEOUT: "La extracción superó 30 segundos.",
  EXTRACTION_MEMORY_LIMIT: "La extracción superó el límite de memoria.",
  FILE_PROTECTED: "El PDF está protegido con contraseña.",
  PDF_INVALID_STRUCTURE: "El PDF está dañado o su estructura no se puede leer.",
  XLSX_INVALID_STRUCTURE:
    "El XLSX está dañado o su estructura no se puede leer.",
};
const summary = (r: ImportRow) => ({
  id: r.id,
  periodId: r.period_id,
  documentId: r.document_id,
  jobId: r.id,
  state: r.status,
  revision: r.revision,
  format: r.format,
  extractorVersion: r.extractor_version,
  attempts: r.attempts,
  errorCode: r.safe_error,
  errorMessage: r.safe_error
    ? (fileErrors[r.safe_error] ?? "No pudimos extraer el archivo.") +
      " Puedes continuar manualmente."
    : null,
  coverage: r.coverage,
  warnings: r.warnings,
  originalAvailable: r.object_state === "stored",
  reviewExpiresAt: iso(r.review_expires_at),
  manualEntryAvailable: true as const,
});
const selectImport = sql`select i.*,d.format,d.filename,d.sha256,d.object_state,d.object_expires_at,d.delete_after,d.created_at
  from app.imports i join app.documents d on (d.owner_id,d.id)=(i.owner_id,i.document_id)`;

function validatedDraft(d: ImportDraft) {
  if (d.title !== null && !d.title.trim())
    throw invalid("EMPTY_NAME", "Escribe un título.");
  if (d.dueDate) civilDate(d.dueDate);
  timezone(d.timezone);
  if ((d.priorityMode === "override") !== (d.priorityOverride !== null))
    throw invalid(
      "INVALID_PRIORITY",
      "Confirma una prioridad para la excepción o usa herencia.",
    );
  if (d.type === "Entrega grupal" && d.operatingMinutes !== null)
    throw invalid(
      "GROUP_NO_INDIVIDUAL_EFFORT",
      "Una entrega grupal no recibe esfuerzo individual.",
    );
  return d;
}

function confirmedFields(draft: ImportDraft) {
  if (draft.discarded)
    throw invalid(
      "CANDIDATE_DISCARDED",
      "Restaura la fila antes de confirmarla.",
    );
  if (!draft.title || !draft.type || !draft.dueDate)
    throw invalid(
      "CANDIDATE_INCOMPLETE",
      "Confirma el título, el tipo y la fecha de cada fila seleccionada.",
    );
  const end = draft.endTime
    ? academicInstant(draft.dueDate, draft.endTime, draft.timezone)
    : null;
  if (
    draft.endTime &&
    (!end || !draft.dueTime || draft.endTime <= draft.dueTime)
  )
    throw invalid(
      "INVALID_EVALUATION_INTERVAL",
      "Confirma inicio, fin y zona del intervalo evaluativo.",
    );
  return {
    ...draft,
    title: draft.title,
    type: draft.type,
    dueDate: draft.dueDate,
    evaluationEndAt: end,
  };
}

export class ImportService {
  constructor(
    readonly identity: Identity,
    readonly storage: ImportStorage,
    readonly queueName = "imports",
  ) {}
  get academics() {
    return this.identity.academics;
  }
  now() {
    return this.academics.now();
  }

  async row(ctx: Context, id: string, lock = false) {
    const [r] = await rows<ImportRow>(
      ctx,
      sql`${selectImport} where i.owner_id=${ctx.owner} and i.id=${id} ${lock ? sql`for update of i` : sql``}`,
    );
    if (!r) throw notFound();
    return dates(r);
  }
  private async document(ctx: Context, id: string) {
    const [r] = await rows<ImportRow>(
      ctx,
      sql`${selectImport} where i.owner_id=${ctx.owner} and d.id=${id}`,
    );
    if (!r) throw notFound();
    return dates(r);
  }
  private async candidate(ctx: Context, id: string) {
    const [r] = await rows<CandidateRow>(
      ctx,
      sql`select * from app.import_candidates where owner_id=${ctx.owner} and id=${id}`,
    );
    if (!r) throw notFound();
    return r;
  }

  async upload(
    owner: string,
    key: string | undefined,
    periodId: string,
    rawName: string,
    bytes: Buffer,
  ) {
    if (bytes.length > limits.bytes) throw limitError();
    const filename = rawName
      .split(/[\\/]/)
      .at(-1)!
      .replace(/[\p{Cc}\p{Cf}]/gu, "")
      .slice(-200);
    let format: FileKind;
    try {
      format = fileKind(filename, bytes);
    } catch (error) {
      throw new DomainError(
        415,
        (error as FileIssue).code,
        "Envía un PDF o XLSX legible y sin protección. Puedes registrar la actividad manualmente.",
      );
    }
    const sha = digest(bytes);
    const reservation = await this.academics.mutate(
      owner,
      "import-upload",
      key,
      { periodId, sha, format },
      async (ctx) => {
        await this.academics.requirePeriod(ctx, periodId);
        const [existing] = await rows<ImportRow>(
          ctx,
          sql`${selectImport}
        where d.owner_id=${owner} and d.period_id=${periodId} and d.sha256=${sha} and d.removed_at is null`,
        );
        if (existing)
          return {
            status: 202,
            data: {
              id: existing.id,
              documentId: existing.document_id,
              jobId: existing.id,
            },
          };
        const id = randomUUID();
        const documentId = randomUUID();
        const now = this.now();
        await ctx.db.execute(sql`insert into app.documents
        (id,owner_id,period_id,format,filename,size_bytes,sha256,object_state,created_at,object_expires_at)
        values (${documentId},${owner},${periodId},${format},${filename},${bytes.length},${sha},'staging',
          ${now.toISOString()},${new Date(now.getTime() + dayMs).toISOString()})`);
        await ctx.db
          .execute(sql`insert into app.imports(id,owner_id,period_id,document_id,queue_name,status,extractor_version,run_after)
        values(${id},${owner},${periodId},${documentId},${this.queueName},'uploading',${version},${now.toISOString()})`);
        return { status: 202, data: { id, documentId, jobId: id } };
      },
    );
    const result = reservation.data as {
      id: string;
      documentId: string;
      jobId: string;
    };
    // Staging is durable before Storage I/O. The owner lock serializes upload with
    // cancellation and cleanup. Retrying after an interrupted write uses the same key.
    await this.academics.read(owner, async (ctx) => {
      const r = await this.row(ctx, result.id);
      if (r.status !== "uploading") return;
      if (r.object_expires_at <= this.now())
        throw conflict("IMPORT_EXPIRED", "Vuelve a cargar el archivo.");
      try {
        await this.storage.put(r.document_id, bytes);
      } catch {
        throw new DomainError(
          503,
          "STORAGE_UNAVAILABLE",
          "La carga se interrumpió. Reintenta con la misma clave.",
        );
      }
      await ctx.db.execute(
        sql`update app.documents set object_state='stored' where id=${r.document_id}`,
      );
      await ctx.db.execute(
        sql`update app.imports set status='queued',revision=revision+1,run_after=${this.now().toISOString()} where id=${r.id}`,
      );
    });
    return result;
  }

  async get(owner: string, id: string) {
    return this.academics.read(owner, async (ctx) =>
      summary(await this.row(ctx, id)),
    );
  }
  async list(owner: string, page: Page) {
    return this.academics.read(owner, async (ctx) => {
      const limit = Number(page.limit ?? 50);
      const found = await rows<ImportRow>(
        ctx,
        sql`${selectImport} where i.owner_id=${owner}
        ${page.cursor ? sql`and i.id>${page.cursor}` : sql``} order by i.id limit ${limit + 1}`,
      );
      return {
        items: found.slice(0, limit).map(summary),
        nextCursor: found.length > limit ? found[limit - 1].id : null,
      };
    });
  }
  private async academicRows(
    ctx: Context,
    period: string,
    drafts: ImportDraft[],
    exactIds: string[],
  ) {
    if (!drafts.length) return [];
    const titles = drafts.flatMap((d) => (d.title ? [d.title.trim()] : []));
    const dates = drafts.flatMap((d) => (d.dueDate ? [d.dueDate] : []));
    // Filter for likely matches before comparing, while preserving manual and imported activities.
    return rows<AcademicRow>(
      ctx,
      sql`select id,title,type,course_id,due_date::text,revision from app.activities
      where owner_id=${ctx.owner} and period_id=${period} and
      (lower(trim(title)) in (select lower(trim(value)) from jsonb_array_elements_text(${json(titles)}))
      or due_date in (select value::date from jsonb_array_elements_text(${json(dates)}))
      or id in (select value::uuid from jsonb_array_elements_text(${json(exactIds)})))
      order by id`,
    );
  }
  private matches(d: ImportDraft, known: AcademicRow[], exactIds: string[]) {
    return known
      .filter(
        (a) =>
          exactIds.includes(a.id) ||
          (d.title &&
            simplify(d.title) === simplify(a.title) &&
            (!d.courseId || !a.course_id || d.courseId === a.course_id)) ||
          (d.courseId &&
            d.courseId === a.course_id &&
            d.dueDate === a.due_date &&
            d.type === a.type),
      )
      .slice(0, 10)
      .map((a) => ({
        activityId: a.id,
        title: a.title,
        type: a.type,
        courseId: a.course_id,
        dueDate: a.due_date,
        revision: a.revision,
      }));
  }
  async candidates(owner: string, id: string, page: Page) {
    return this.academics.read(owner, async (ctx) => {
      const r = await this.row(ctx, id);
      if (r.review_expires_at && r.review_expires_at <= this.now())
        return { items: [], nextCursor: null };
      const limit = Number(page.limit ?? 50);
      const cursor = page.cursor
        ? await this.candidate(ctx, page.cursor)
        : null;
      if (cursor && cursor.import_id !== id) throw notFound();
      const found = await rows<CandidateRow>(
        ctx,
        sql`select * from app.import_candidates
        where owner_id=${owner} and import_id=${id} and ordinal>${cursor?.ordinal ?? 0} order by ordinal limit ${limit + 1}`,
      );
      const fingerprints = [
        ...new Set(
          found.flatMap((c) =>
            c.evidence.fingerprint ? [c.evidence.fingerprint] : [],
          ),
        ),
      ];
      const exact = await rows<{ fingerprint: string; activity_id: string }>(
        ctx,
        sql`select distinct c.evidence->>'fingerprint' as fingerprint,c.confirmed_activity_id as activity_id
          from app.import_candidates c join app.imports i on (i.owner_id,i.id)=(c.owner_id,c.import_id)
          where c.owner_id=${owner} and i.period_id=${r.period_id} and c.confirmed_activity_id is not null
          and c.evidence->>'fingerprint' in (select value from jsonb_array_elements_text(${json(fingerprints)}))`,
      );
      const known = await this.academicRows(
        ctx,
        r.period_id,
        found.map((c) => c.draft),
        exact.map((match) => match.activity_id),
      );
      const rules = await rows<{
        course_id: string;
        activity_type: string;
        priority: "Alta" | "Media" | "Baja";
      }>(
        ctx,
        sql`select course_id,activity_type,priority from app.priority_rules
          where owner_id=${owner} and course_id in (
            select value::uuid from jsonb_array_elements_text(${json([...new Set(found.flatMap((c) => (c.draft.courseId ? [c.draft.courseId] : [])))])})
          )`,
      );
      const inherited = new Map(
        rules.map((rule) => [
          rule.course_id + ":" + rule.activity_type,
          rule.priority,
        ]),
      );
      return {
        items: found.slice(0, limit).map((c) => ({
          id: c.id,
          revision: c.revision,
          draft: c.draft,
          evidence: c.evidence,
          status: c.resolution
            ? "confirmed"
            : c.draft.discarded
              ? "discarded"
              : "draft",
          effectivePriority: effectivePriority(
            c.draft.priorityMode,
            c.draft.priorityOverride,
            inherited.get(c.draft.courseId + ":" + c.draft.type) ?? null,
          ),
          resolution: c.resolution,
          confirmedActivityId: c.confirmed_activity_id,
          matches: c.resolution
            ? []
            : this.matches(
                c.draft,
                known,
                exact
                  .filter((m) => m.fingerprint === c.evidence.fingerprint)
                  .map((m) => m.activity_id),
              ),
        })),
        nextCursor: found.length > limit ? found[limit - 1].id : null,
      };
    });
  }
  private assertReview(r: ImportRow) {
    if (
      r.status !== "review" ||
      !r.review_expires_at ||
      r.review_expires_at <= this.now()
    )
      throw conflict(
        "IMPORT_NOT_REVIEWABLE",
        "La revisión del archivo ya no está disponible.",
      );
  }
  async patch(
    owner: string,
    id: string,
    key: string | undefined,
    rev: string | undefined,
    patch: Partial<ImportDraft>,
  ) {
    return this.academics.mutate(
      owner,
      "import-candidate:" + id,
      key,
      { rev, patch },
      async (ctx) => {
        const c = await this.candidate(ctx, id);
        const r = await this.row(ctx, c.import_id);
        this.assertReview(r);
        requireRevision(rev, "candidate", c.revision);
        if (c.resolution)
          throw conflict(
            "CANDIDATE_CONFIRMED",
            "Edita la actividad confirmada en su ficha.",
          );
        const draft = validatedDraft({ ...c.draft, ...patch });
        if (draft.courseId)
          await this.academics.requireCourse(ctx, draft.courseId, r.period_id);
        await ctx.db.execute(
          sql`update app.import_candidates set draft=${json(draft)},revision=revision+1 where id=${id}`,
        );
        return {
          status: 200,
          data: { id, revision: c.revision + 1 },
          etag: `"candidate-${c.revision + 1}"`,
        };
      },
    );
  }

  async confirm(
    owner: string,
    id: string,
    key: string | undefined,
    rev: string | undefined,
    input: ConfirmRows,
  ) {
    return this.academics.mutate(
      owner,
      "confirm-import:" + id,
      key,
      { rev, input },
      async (ctx) => {
        const r = await this.row(ctx, id);
        this.assertReview(r);
        requireRevision(rev, "import", r.revision);
        const used = new Set<string>();
        const targets = new Set<string>();
        const items: {
          candidateId: string;
          activityId: string;
          dateProposalId: string | null;
        }[] = [];
        const proposals: {
          item: (typeof items)[number];
          input: DateChange;
          revision: string;
        }[] = [];
        for (const decision of input.rows) {
          if (used.has(decision.candidateId))
            throw invalid(
              "DUPLICATE_CANDIDATE",
              "Selecciona cada fila una sola vez.",
            );
          used.add(decision.candidateId);
          const c = await this.candidate(ctx, decision.candidateId);
          if (c.import_id !== id) throw notFound();
          requireRevision(
            `"candidate-${decision.revision}"`,
            "candidate",
            c.revision,
          );
          if (c.resolution)
            throw conflict("CANDIDATE_CONFIRMED", "La fila ya se confirmó.");
          const d = validatedDraft(c.draft);
          if (d.discarded)
            throw invalid(
              "CANDIDATE_DISCARDED",
              "Restaura la fila antes de confirmarla.",
            );
          const locator = {
            unit: c.evidence.locator.unit,
            row: c.evidence.locator.row,
          };
          let activityId: string;
          if (decision.resolution === "distinct") {
            if (decision.activityId || decision.activityRevision)
              throw invalid(
                "UNEXPECTED_MATCH",
                "La actividad distinta no requiere una coincidencia.",
              );
            const { endTime: _end, ...fields } = confirmedFields(d);
            const saved = await this.academics.saveActivityIn(ctx, {
              ...fields,
              periodId: r.period_id,
            } satisfies CreateActivity);
            activityId = saved.data.id;
          } else {
            if (!decision.activityId || !decision.activityRevision)
              throw invalid(
                "MATCH_REQUIRED",
                "Selecciona la actividad vigente y su revisión.",
              );
            const target = await this.academics.requireActivity(
              ctx,
              decision.activityId,
            );
            if (target.periodId !== r.period_id) throw notFound();
            if (targets.has(target.id))
              throw invalid(
                "DUPLICATE_MATCH",
                "Revisa las filas que apuntan a la misma actividad.",
              );
            targets.add(target.id);
            const revision = `"activity-${decision.activityRevision}"`;
            requireRevision(revision, "activity", target.revision);
            activityId = target.id;
            if (decision.resolution === "update") {
              const proposed = confirmedFields(d);
              const before = await this.academics.activityDto(ctx, target);
              if (
                before.evaluationEndAt &&
                !proposed.evaluationEndAt &&
                (before.dueDate !== proposed.dueDate ||
                  proposed.dueTime !== null)
              )
                throw invalid(
                  "EVALUATION_END_REQUIRED",
                  "Confirma también inicio, fin y zona del nuevo intervalo evaluativo.",
                );
              const after = {
                dueDate: proposed.dueDate,
                dueTime: proposed.dueTime ?? before.dueTime,
                timezone: proposed.timezone ?? before.timezone,
                evaluationEndAt:
                  proposed.evaluationEndAt ?? before.evaluationEndAt,
              };
              if (
                before.dueDate !== after.dueDate ||
                before.dueTime !== after.dueTime ||
                before.timezone !== after.timezone ||
                before.evaluationEndAt !== after.evaluationEndAt
              ) {
                const item = {
                  candidateId: c.id,
                  activityId,
                  dateProposalId: null,
                };
                proposals.push({
                  item,
                  input: {
                    ...after,
                    source: { kind: "import", format: r.format, ...locator },
                  },
                  revision,
                });
                items.push(item);
              }
            }
          }
          if (!items.some((item) => item.candidateId === c.id))
            items.push({ candidateId: c.id, activityId, dateProposalId: null });
          await ctx.db
            .execute(sql`update app.import_candidates set confirmed_activity_id=${activityId},resolution=${decision.resolution},
          revision=revision+1 where id=${c.id}`);
          await ctx.db
            .execute(sql`insert into app.activity_sources(id,owner_id,activity_id,candidate_id,format,locator)
          values(${randomUUID()},${owner},${activityId},${c.id},${r.format},${json(locator)})`);
        }
        // Capture the workspace revision after new activities in the same batch.
        for (const p of proposals) {
          const proposed = await this.academics.dateProposalIn(
            ctx,
            p.item.activityId,
            p.input,
            p.revision,
          );
          p.item.dateProposalId = proposed.data.id;
        }
        await ctx.db.execute(
          sql`update app.imports set revision=revision+1 where id=${id}`,
        );
        return {
          status: 200,
          data: {
            revision: r.revision + 1,
            items,
            planningState: "not_generated",
          },
          etag: `"import-${r.revision + 1}"`,
        };
      },
    );
  }

  async retry(
    owner: string,
    id: string,
    key: string | undefined,
    rev: string | undefined,
  ) {
    return this.academics.mutate(
      owner,
      "retry-import:" + id,
      key,
      { rev },
      async (ctx) => {
        const r = await this.row(ctx, id);
        requireRevision(rev, "import", r.revision);
        if (
          r.status !== "failed" ||
          r.object_state !== "stored" ||
          r.object_expires_at <= this.now()
        )
          throw conflict(
            "IMPORT_CANNOT_RETRY",
            "No hay una copia disponible para reintentar la extracción.",
          );
        await ctx.db
          .execute(sql`update app.imports set status='queued',attempts=0,safe_error=null,run_after=${this.now().toISOString()},
        revision=revision+1 where id=${id}`);
        return {
          status: 202,
          data: { id, revision: r.revision + 1 },
          etag: `"import-${r.revision + 1}"`,
        };
      },
    );
  }

  async remove(
    owner: string,
    id: string,
    key: string | undefined,
    rev: string | undefined,
    document = false,
  ) {
    return this.academics.mutate(
      owner,
      (document ? "remove-document:" : "cancel-import:") + id,
      key,
      { rev },
      async (ctx) => {
        const r = await (document ? this.document(ctx, id) : this.row(ctx, id));
        requireRevision(rev, "import", r.revision);
        if (!["removed", "expired", "cancelled"].includes(r.status))
          await this.purge(ctx, r, document ? "removed" : "cancelled");
        const after = await this.row(ctx, r.id);
        return {
          status: 200,
          data: { id: r.id, revision: after.revision },
          etag: `"import-${after.revision}"`,
        };
      },
    );
  }

  async purge(
    ctx: Context,
    r: ImportRow,
    state: "removed" | "cancelled" | "expired",
  ) {
    await ctx.db
      .execute(sql`update app.activity_sources set candidate_id=null where owner_id=${ctx.owner} and candidate_id in
      (select id from app.import_candidates where import_id=${r.id})`);
    await ctx.db.execute(
      sql`delete from app.import_candidates where owner_id=${ctx.owner} and import_id=${r.id}`,
    );
    await ctx.db
      .execute(sql`update app.imports set status=${state},revision=revision+1,coverage='[]',warnings='[]',
      safe_error=null,lease_token=null,lease_until=null,review_expires_at=null where id=${r.id}`);
    await ctx.db
      .execute(sql`update app.documents set filename=null,sha256=null,removed_at=${this.now().toISOString()},
      object_state=case when object_state='deleted' then 'deleted' else 'delete_pending' end,
      delete_after=${this.now().toISOString()} where id=${r.document_id}`);
  }

  async persist(ctx: Context, r: ImportRow, result: Extraction) {
    const known = await rows<{ id: string; name: string }>(
      ctx,
      sql`select id,name from app.courses
      where owner_id=${ctx.owner} and period_id=${r.period_id}`,
    );
    const fingerprint = (c: Extracted) =>
      digest(
        Buffer.from(
          JSON.stringify([
            simplify(c.fields.title ?? ""),
            simplify(c.fields.course ?? ""),
            c.fields.type,
            c.fields.dueDate ?? c.original.dueDate,
            c.fields.dueTime,
            c.fields.endTime,
          ]),
        ),
      );
    const counts = new Map<string, number>();
    const fingerprints = result.candidates.map((c) => {
      const key = fingerprint(c);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return key;
    });
    for (const [index, c] of result.candidates.entries()) {
      const matches = known.filter(
        (course) =>
          c.fields.course &&
          simplify(course.name) === simplify(c.fields.course),
      );
      const d: ImportDraft = {
        discarded: false,
        title: c.fields.title,
        type: c.fields.type,
        courseId: matches.length === 1 ? matches[0].id : null,
        dueDate: c.fields.dueDate,
        dueTime: c.fields.dueTime,
        endTime: c.fields.endTime,
        timezone: null,
        operatingMinutes: null,
        priorityMode: "inherit",
        priorityOverride: null,
      };
      const key = fingerprints[index];
      const evidence = {
        ...c,
        fingerprint: key,
        issues:
          counts.get(key)! > 1
            ? [...c.issues, "POSSIBLE_DUPLICATE_ROW"]
            : c.issues,
      };
      await ctx.db
        .execute(sql`insert into app.import_candidates(id,owner_id,import_id,ordinal,evidence,draft)
        values(${randomUUID()},${ctx.owner},${r.id},${index + 1},${json(evidence)},${json(d)})`);
    }
    const expires = new Date(this.now().getTime() + 7 * dayMs).toISOString();
    await ctx.db
      .execute(sql`update app.imports set status='review',revision=revision+1,lease_token=null,lease_until=null,
      coverage=${json(result.units)},warnings=${json(result.warnings)},safe_error=null,review_expires_at=${expires} where id=${r.id}`);
    await this.scheduleDelete(ctx, r);
  }

  async scheduleDelete(ctx: Context, r: ImportRow) {
    await ctx.db
      .execute(sql`update app.documents set filename=null,object_state='delete_pending',
      delete_after=${this.now().toISOString()} where owner_id=${ctx.owner} and id=${r.document_id} and object_state<>'deleted'`);
  }

  validChecksum(r: ImportRow, bytes: Buffer) {
    return r.sha256 === digest(bytes);
  }
}
