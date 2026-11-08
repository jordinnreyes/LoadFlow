import { Temporal } from "@js-temporal/polyfill";
import { Button, Notice } from "../../components/ui";
import type { Session, Capabilities } from "../../api/client";
import type { Period } from "../../api/academic";

export const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export type Screen = {
  session: Session;
  capabilities: Capabilities;
  period: Period;
  zone: string | null;
  expired: () => void;
};

export function LoadState({
  error,
  reload,
}: {
  error?: string;
  reload: () => void;
}) {
  return error ? (
    <div role="alert">
      <Notice
        tone="danger"
        title={error}
        action={<Button onClick={reload}>Reintentar</Button>}
      />
    </div>
  ) : (
    <p role="status">Consultando los datos de tu cuenta…</p>
  );
}

export function WriteState({
  error,
  conflict,
  reload,
}: {
  error: string;
  conflict: boolean;
  reload: () => void;
}) {
  return error ? (
    <div role="alert">
      <Notice
        tone="danger"
        title={error}
        action={
          conflict ? (
            <Button onClick={reload}>Recargar datos</Button>
          ) : undefined
        }
      />
    </div>
  ) : null;
}

export function monday(date: string) {
  const day = Temporal.PlainDate.from(date);
  return day.subtract({ days: day.dayOfWeek - 1 }).toString();
}

export function addDays(date: string, days: number) {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

export function localDate(instant: string, zone: string) {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
}

export function dayBoundary(date: string, zone: string) {
  return Temporal.PlainDate.from(date).toZonedDateTime(zone).epochMilliseconds;
}

export function localInstant(value: string, zone: string) {
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(zone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}

export function timeLabel(value: string, zone: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  }).format(new Date(value));
}

export function minutesLabel(value: number | null) {
  if (value === null) return "Por confirmar";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return [hours ? `${hours} h` : "", minutes || !hours ? `${minutes} min` : ""]
    .filter(Boolean)
    .join(" ");
}
