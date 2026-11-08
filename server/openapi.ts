import type { SwaggerTransformObject } from "@fastify/swagger";

// Document headers enforced by domain middleware without replacing its 403/428 errors.
export const documentProtocol: SwaggerTransformObject = (document) => {
  if (!("openapiObject" in document)) return document.swaggerObject;
  const spec = document.openapiObject;
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    if (!item) continue;
    for (const method of ["post", "put", "patch", "delete"] as const) {
      const operation = item[method];
      if (!operation) continue;
      if (
        ["uploadImport", "previewEstimateSource"].includes(
          operation.operationId ?? "",
        )
      ) {
        operation.requestBody = {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                additionalProperties: false,
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        };
      }
      const auth = path.startsWith("/api/v1/auth/");
      const headers = ["Origin"];
      if (
        !auth ||
        ["/api/v1/auth/session/refresh", "/api/v1/auth/logout"].includes(path)
      )
        headers.push("X-CSRF-Token");
      if (!auth) {
        if (
          path !== "/api/v1/calendar/authorization" &&
          operation.operationId !== "previewEstimateSource"
        )
          headers.push("Idempotency-Key");
        if (
          method !== "post" ||
          path.endsWith("/date-change-proposals") ||
          path.endsWith("/apply") ||
          path.endsWith("/availability/copy") ||
          [
            "confirmImport",
            "retryImport",
            "cancelImport",
            "previewStudyPlan",
            "confirmGroupEquivalence",
            "requestEstimate",
          ].includes(operation.operationId ?? "")
        )
          headers.push("If-Match");
      }
      operation.parameters = [
        ...(operation.parameters ?? []),
        ...headers.map((name) => ({
          name,
          in: "header" as const,
          required: true,
          description:
            name === "If-Match"
              ? operation.operationId === "applyEstimate"
                ? "ETag vigente de la actividad asociada. Responde 428 si falta y 412 si cambió."
                : "ETag vigente; 428 si falta y 412 si cambió. Aplicar una propuesta requiere el ETag workspace de su vista previa."
              : name === "Idempotency-Key"
                ? "Clave de 1–128 caracteres alfanuméricos, : _ o -. Repetir la misma operación/cuerpo devuelve el resultado original; reutilizar con otros datos devuelve 409."
                : name === "Origin"
                  ? "Origen exacto configurado para el cliente web."
                  : "Token obtenido de la sesión, ligado a su cookie opaca.",
          schema: { type: "string" as const },
        })),
      ];
    }
  }
  return spec;
};
