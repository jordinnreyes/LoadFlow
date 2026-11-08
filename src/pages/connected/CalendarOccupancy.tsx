import { subtract } from "../../../packages/planning-core/intervals";
import type { CalendarBusy, CalendarEvents } from "../../api/academic";
import { addDays, dayBoundary, timeLabel } from "./shared";
import { Notice } from "../../components/ui";

export function OccupancyStatus({ data }: { data: CalendarBusy }) {
  const { connection, coverage, lastFetchedAt, busy } = data;
  if (!connection.configured) return null;
  if (connection.state === "not_connected")
    return (
      <Notice title="Google Calendar sin conectar">
        Puedes conectarlo desde Disponibilidad y Calendar.
      </Notice>
    );
  if (connection.state === "revoked")
    return (
      <Notice tone="warning" title="Permiso de Google Calendar revocado">
        Vuelve a autorizarlo desde Disponibilidad y Calendar.
      </Notice>
    );
  if (!connection.selectedCount)
    return (
      <Notice title="Selecciona un calendario de Google">
        Elige tus calendarios y pulsa Guardar y sincronizar en Disponibilidad y
        Calendar.
      </Notice>
    );
  if (connection.safeError === "STUDY_TIMEZONE_REQUIRED")
    return (
      <Notice tone="warning" title="Pendiente de actualizar">
        Pulsa Actualizar esta semana para aplicar tu zona de estudio.
      </Notice>
    );
  if (coverage === "complete")
    return busy.length ? null : (
      <p role="status">
        Google Calendar no registra bloques ocupados en esta semana.
      </p>
    );
  return (
    <Notice
      tone="warning"
      title={
        lastFetchedAt
          ? "Cobertura de Google Calendar incompleta"
          : "Todavía falta consultar la ocupación de esta semana"
      }
    >
      {lastFetchedAt
        ? "Se muestran los bloques conocidos. Los tramos sin cobertura vigente quedan por confirmar."
        : "Todavía no hay bloques conocidos para este rango."}{" "}
      Pulsa Actualizar esta semana para consultar de lunes a domingo.
    </Notice>
  );
}

type Block = CalendarEvents["items"][number];

export function calendarBlocks(
  data: CalendarBusy | null | undefined,
  events: CalendarEvents["items"],
): Block[] {
  if (
    !data ||
    data.connection.state === "not_connected" ||
    data.connection.state === "revoked" ||
    !data.connection.selectedCount
  )
    return [];
  const shown = data.connection.eventTitlesEnabled ? events : [];
  const span = (item: { startAt: string; endAt: string }) => ({
    start: Date.parse(item.startAt),
    end: Date.parse(item.endAt),
  });
  const anonymous = subtract(
    data.busy.map(span),
    shown.filter((event) => event.blocksTime).map(span),
  ).map(({ start, end }) => ({
    title: "Ocupado · Google Calendar",
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    allDay: false,
    blocksTime: true,
  }));
  return [...anonymous, ...shown].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );
}

function renderBlocks(blocks: Block[], date: string, zone: string) {
  const start = dayBoundary(date, zone);
  const end = dayBoundary(addDays(date, 1), zone);
  const clock = new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zone,
  });
  return blocks.flatMap((block, index) => {
    const from = Math.max(Date.parse(block.startAt), start);
    const to = Math.min(Date.parse(block.endAt), end);
    if (from >= to) return [];
    return (
      <div
        className="connected-calendar-busy"
        key={`${block.startAt}:${block.endAt}:${index}`}
      >
        <strong>{block.title}</strong>
        <small>
          {block.allDay && from === start && to === end
            ? "Todo el día"
            : `${clock.format(from)}–${to === end ? "24:00" : clock.format(to)}`}
          {!block.blocksTime && " · Marcado como libre"}
        </small>
      </div>
    );
  });
}

export function OccupancyAgenda({
  data,
  blocks,
  start,
  zone,
}: {
  data: CalendarBusy;
  blocks: Block[];
  start: string;
  zone: string;
}) {
  if (!blocks.length) return null;
  const dateLabel = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return (
    <section className="surface" aria-label="Ocupación de Google Calendar">
      <h3>Ocupación de Google Calendar</h3>
      {Array.from({ length: 7 }, (_, index) => addDays(start, index)).map(
        (date) => {
          const dayBlocks = renderBlocks(blocks, date, zone);
          if (!dayBlocks.length) return null;
          return (
            <section key={date}>
              <h4>{dateLabel.format(new Date(`${date}T12:00:00Z`))}</h4>
              {dayBlocks}
            </section>
          );
        },
      )}
      {data.lastFetchedAt && (
        <small>
          Última lectura en este rango: {timeLabel(data.lastFetchedAt, zone)}
        </small>
      )}
    </section>
  );
}
