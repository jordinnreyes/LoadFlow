import { Temporal } from "@js-temporal/polyfill";
import { DomainError } from "../../errors.js";
export const invalid = (code: string, message: string) =>
  new DomainError(422, code, message);
export function timezone(value: string | null) {
  if (value === null) return null;
  try {
    new Intl.DateTimeFormat("es", { timeZone: value });
    return value;
  } catch {
    throw invalid("INVALID_TIMEZONE", "Confirma una zona horaria IANA válida.");
  }
}
export function civilDate(value: string) {
  try {
    if (Temporal.PlainDate.from(value).toString() !== value) throw new Error();
    return value;
  } catch {
    throw invalid("INVALID_DATE", "Confirma una fecha válida.");
  }
}
export function academicInstant(
  date: string,
  time: string | null,
  zone: string | null,
) {
  civilDate(date);
  timezone(zone);
  if (time === null || zone === null) return null;
  try {
    const local = Temporal.PlainDateTime.from(`${date}T${time}`);
    return local
      .toZonedDateTime(zone, { disambiguation: "reject" })
      .toInstant()
      .toString();
  } catch {
    throw invalid(
      "AMBIGUOUS_LOCAL_TIME",
      "Confirma un horario existente y no ambiguo en esa zona.",
    );
  }
}
export function utcInstant(value: string | null) {
  if (value === null) return null;
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    throw invalid(
      "INVALID_INSTANT",
      "Confirma fecha, hora y zona del intervalo.",
    );
  }
}
export function effectivePriority<T>(
  mode: string,
  override: T | null,
  inherited: T | null,
): T | null {
  if (mode === "override") return override;
  if (mode === "inherit") return inherited;
  return null;
}
export function effortState(
  estimated: number | null,
  real: number | null,
  remaining: number | null,
  preparation: string,
) {
  if (preparation === "done") return { pendingMinutes: 0, needsReview: false };
  if (estimated === 0)
    return { pendingMinutes: remaining ?? 0, needsReview: true };
  const pending =
    remaining ??
    (estimated === null ? null : Math.max(0, estimated - (real ?? 0)));
  return {
    pendingMinutes: pending,
    needsReview:
      pending === null ||
      pending === 0 ||
      (real !== null &&
        estimated !== null &&
        real > estimated &&
        remaining === null),
  };
}
export function requireRevision(
  header: string | undefined,
  prefix: string,
  revision: number,
) {
  if (!header)
    throw new DomainError(
      428,
      "PRECONDITION_REQUIRED",
      "Actualiza el recurso y envía su versión para guardar.",
    );
  if (header !== `"${prefix}-${revision}"`)
    throw new DomainError(
      412,
      "REVISION_MISMATCH",
      "El recurso cambió. Revisa la versión vigente antes de guardar.",
    );
}
export function confirmReopening(
  previous: string,
  next: string,
  reopen: boolean | undefined,
  remaining: number | null | undefined,
) {
  if (
    previous === "done" &&
    next !== "done" &&
    (!reopen || remaining === null || remaining === undefined)
  ) {
    throw invalid(
      "REOPEN_CONFIRMATION_REQUIRED",
      "Para reabrir, confirma la acción y el esfuerzo restante.",
    );
  }
}
export function completionDate(
  value: string | null,
  zone: string | null,
  now: Date,
) {
  if (value === null) return null;
  civilDate(value);
  if (!zone)
    throw invalid(
      "COMPLETION_TIMEZONE_REQUIRED",
      "Confirma una zona horaria para verificar la fecha real; puedes guardar horas sin esa fecha.",
    );
  const today = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(timezone(zone)!)
    .toPlainDate()
    .toString();
  if (value > today)
    throw invalid(
      "COMPLETION_DATE_IN_FUTURE",
      "La fecha real de finalización no puede estar en el futuro.",
    );
  return value;
}
