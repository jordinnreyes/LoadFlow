// A temporary processing lease, never an archive for later analysis.
export const ORIGINAL_PROCESSING_TTL_MS = 120_000;
export const REUPLOAD_MESSAGE =
  "El archivo temporal se elimina después de la extracción. Para analizarlo con IA, vuelve a subir el mismo archivo.";
export const analysisSource = () => ({
  state: "reupload_required" as const,
  code: "DOCUMENT_REUPLOAD_REQUIRED" as const,
  message: REUPLOAD_MESSAGE,
});
