import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { Type, type Static } from "@sinclair/typebox";
import {
  EntityIdParams,
  ErrorResponse,
  Id,
  strict,
} from "../../../packages/contracts/index.js";
import { PageQuery } from "../../../packages/contracts/academics.js";
import * as C from "../../../packages/contracts/imports.js";
import {
  EstimateSource,
  EstimateSourcePreview,
} from "../../../packages/contracts/estimates.js";
import type { Identity } from "../identity/service.js";
import { SESSION_COOKIE } from "../identity/service.js";
import { header } from "../identity/routes.js";
import { DomainError } from "../../errors.js";
import { FileIssue, limits } from "./extraction/model.js";
import { limitError, unavailable, type ImportService } from "./service.js";
import { isolatedExcerpt } from "./runner.js";
import { REUPLOAD_MESSAGE } from "./policy.js";
import type { Estimates } from "../estimates/service.js";

const errors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
  409: ErrorResponse,
  412: ErrorResponse,
  413: ErrorResponse,
  415: ErrorResponse,
  422: ErrorResponse,
  428: ErrorResponse,
  429: ErrorResponse,
  503: ErrorResponse,
};
const uploadQuery = Type.Object({ periodId: Id }, strict);
const id = (r: FastifyRequest) => (r.params as { id: string }).id;
const key = (r: FastifyRequest) => header(r, "idempotency-key");
const revision = (r: FastifyRequest) => header(r, "if-match");
const send = (
  reply: FastifyReply,
  result: { status: number; data: unknown; etag?: string },
) => {
  if (result.etag) reply.header("ETag", result.etag);
  return reply.code(result.status).send(result.data);
};
const invalidPart = () =>
  new DomainError(
    422,
    "FILE_REQUIRED",
    "Envía exactamente un archivo en el campo multipart file.",
  );

export async function importsRoutes(
  app: FastifyInstance,
  identity: () => Identity,
  service: () => ImportService | undefined,
  estimates?: Estimates,
) {
  await app.register(multipart, {
    limits: {
      fileSize: limits.bytes + 1,
      files: 1,
      fields: 0,
      parts: 2,
      headerPairs: 16,
    },
  });
  let activeUploads = 0;
  const auth = async (r: FastifyRequest, write = false) => {
    const configured = service();
    if (!configured) throw unavailable();
    const resolver = identity();
    if (write) {
      resolver.origin(r.headers.origin);
      resolver.csrf(r.cookies[SESSION_COOKIE], header(r, "x-csrf-token"));
    }
    return {
      imports: configured,
      owner: (await resolver.authenticate(r.cookies[SESSION_COOKIE])).ownerId,
    };
  };
  const schema = <T extends object>(operationId: string, response: T) => ({
    operationId,
    security: [{ sessionCookie: [] }],
    response: { ...errors, ...response },
  });

  async function withFile<T>(
    r: FastifyRequest,
    action: (name: string, bytes: Buffer) => Promise<T>,
  ) {
    if (!r.isMultipart())
      throw new DomainError(
        415,
        "MULTIPART_REQUIRED",
        "Envía el archivo como multipart/form-data.",
      );
    if (activeUploads >= 2)
      throw new DomainError(
        429,
        "IMPORT_UPLOAD_LIMIT",
        "Hay cargas en curso. Reintenta en unos segundos.",
      );
    activeUploads++;
    try {
      let name: string | undefined;
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const part of r.parts()) {
        if (
          part.type !== "file" ||
          part.fieldname !== "file" ||
          name !== undefined
        )
          throw invalidPart();
        name = part.filename;
        for await (const chunk of part.file) {
          size += chunk.length;
          if (size > limits.bytes) throw limitError();
          chunks.push(chunk as Buffer);
        }
        if (part.file.truncated) throw limitError();
      }
      if (name === undefined) throw invalidPart();
      return await action(name, Buffer.concat(chunks));
    } catch (error) {
      if (error instanceof app.multipartErrors.RequestFileTooLargeError)
        throw limitError();
      if (
        error instanceof app.multipartErrors.PartsLimitError ||
        error instanceof app.multipartErrors.FilesLimitError ||
        error instanceof app.multipartErrors.FieldsLimitError
      )
        throw invalidPart();
      throw error;
    } finally {
      activeUploads--;
    }
  }
  app.post(
    "/api/v1/imports",
    {
      schema: {
        ...schema("uploadImport", { 202: C.ImportAccepted }),
        querystring: uploadQuery,
      },
    },
    async (r, reply) => {
      const { imports, owner } = await auth(r, true);
      if (
        r.isMultipart() &&
        (!key(r) || !/^[a-zA-Z0-9:_-]{1,128}$/.test(key(r)!))
      )
        throw new DomainError(
          428,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Envía una clave de operación válida para guardar.",
        );
      const periodId = (r.query as Static<typeof uploadQuery>).periodId;
      return reply
        .code(202)
        .send(
          await withFile(r, (name, bytes) =>
            imports.upload(owner, key(r), periodId, name, bytes),
          ),
        );
    },
  );
  app.get(
    "/api/v1/activities/:id/estimate-source",
    {
      schema: {
        ...schema("getEstimateSource", { 200: EstimateSource }),
        params: EntityIdParams,
      },
    },
    async (r) => {
      const { imports, owner } = await auth(r);
      if (!estimates)
        throw new DomainError(
          503,
          "ESTIMATES_DISABLED",
          "Las estimaciones no están disponibles en este entorno.",
        );
      await estimates.authorizeSource(owner, id(r));
      return {
        available: (await imports.estimateSources(owner, id(r))).length > 0,
        message: REUPLOAD_MESSAGE,
      };
    },
  );
  app.post(
    "/api/v1/activities/:id/estimate-source",
    {
      schema: {
        ...schema("previewEstimateSource", { 200: EstimateSourcePreview }),
        params: EntityIdParams,
      },
    },
    async (r) => {
      const { imports, owner } = await auth(r, true);
      if (!estimates)
        throw new DomainError(
          503,
          "ESTIMATES_DISABLED",
          "Las estimaciones no están disponibles en este entorno.",
        );
      await estimates.authorizeSource(owner, id(r));
      return withFile(r, async (_name, bytes) => {
        const source = await imports.estimateSource(owner, id(r), bytes);
        let excerpt: string;
        try {
          excerpt = await isolatedExcerpt(
            bytes,
            `enunciado.${source.format}`,
            source.locator,
          );
        } catch (error) {
          if (!(error instanceof FileIssue)) throw error;
          throw new DomainError(
            422,
            error.code,
            "No se pudo preparar un fragmento del archivo. Pega un fragmento revisado o registra el esfuerzo manualmente.",
          );
        }
        await estimates.authorizeSource(owner, id(r));
        await imports.requireAnalysisReupload(owner, source.documentId, bytes);
        return { excerpt };
      });
    },
  );
  app.get(
    "/api/v1/imports",
    {
      schema: {
        ...schema("listImports", { 200: C.Page(C.ImportSummary) }),
        querystring: PageQuery,
      },
    },
    async (r) => {
      const { imports, owner } = await auth(r);
      return imports.list(owner, r.query as Static<typeof PageQuery>);
    },
  );
  app.get(
    "/api/v1/imports/:id",
    {
      schema: {
        ...schema("getImport", { 200: C.ImportSummary }),
        params: EntityIdParams,
      },
    },
    async (r, reply) => {
      const { imports, owner } = await auth(r);
      const result = await imports.get(owner, id(r));
      reply.header("ETag", `"import-${result.revision}"`);
      return result;
    },
  );
  app.get(
    "/api/v1/imports/:id/candidates",
    {
      schema: {
        ...schema("listImportCandidates", { 200: C.Page(C.Candidate) }),
        params: EntityIdParams,
        querystring: PageQuery,
      },
    },
    async (r) => {
      const { imports, owner } = await auth(r);
      return imports.candidates(
        owner,
        id(r),
        r.query as Static<typeof PageQuery>,
      );
    },
  );
  app.patch(
    "/api/v1/import-candidates/:id",
    {
      schema: {
        ...schema("editImportCandidate", { 200: C.Mutation }),
        params: EntityIdParams,
        body: C.DraftPatch,
      },
    },
    async (r, reply) => {
      const { imports, owner } = await auth(r, true);
      return send(
        reply,
        await imports.patch(
          owner,
          id(r),
          key(r),
          revision(r),
          r.body as Static<typeof C.DraftPatch>,
        ),
      );
    },
  );
  app.post(
    "/api/v1/imports/:id/confirm",
    {
      schema: {
        ...schema("confirmImport", { 200: C.Confirmed }),
        params: EntityIdParams,
        body: C.Confirmation,
      },
    },
    async (r, reply) => {
      const { imports, owner } = await auth(r, true);
      return send(
        reply,
        await imports.confirm(
          owner,
          id(r),
          key(r),
          revision(r),
          r.body as C.ConfirmRows,
        ),
      );
    },
  );
  app.post(
    "/api/v1/imports/:id/retry",
    {
      schema: {
        ...schema("retryImport", { 202: C.Mutation }),
        params: EntityIdParams,
      },
    },
    async (r, reply) => {
      const { imports, owner } = await auth(r, true);
      return send(
        reply,
        await imports.retry(owner, id(r), key(r), revision(r)),
      );
    },
  );
  app.post(
    "/api/v1/imports/:id/cancel",
    {
      schema: {
        ...schema("cancelImport", { 200: C.Mutation }),
        params: EntityIdParams,
      },
    },
    async (r, reply) => {
      const { imports, owner } = await auth(r, true);
      return send(
        reply,
        await imports.remove(owner, id(r), key(r), revision(r)),
      );
    },
  );
  app.delete(
    "/api/v1/documents/:id",
    {
      schema: {
        ...schema("withdrawImportDocument", { 200: C.Mutation }),
        params: EntityIdParams,
      },
    },
    async (r, reply) => {
      const { imports, owner } = await auth(r, true);
      return send(
        reply,
        await imports.remove(owner, id(r), key(r), revision(r), true),
      );
    },
  );
}
