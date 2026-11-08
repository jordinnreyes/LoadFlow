import {
  activityPath,
  segment,
  type Activity,
  type CalendarSource,
} from "../../api/academic";
import { endpoint, request, type Response } from "../../api/client";
import { useRead } from "../../api/useRead";
import { useWrite } from "../../api/useWrite";
import { Button, Field } from "../../components/ui";
import {
  localInstant,
  LoadState,
  timeLabel,
  WriteState,
  type Screen,
} from "./shared";
import { useState } from "react";

export function ConnectedGroup({
  screen,
  activity,
  reload,
}: {
  screen: Screen;
  activity: Activity;
  reload: () => void;
}) {
  const base = activityPath(activity.id);
  const path = `${base}/group-reservations`;
  const equivalent = `${base}/group-equivalences`;
  const [error, setError] = useState("");
  const write = useWrite(screen.session, screen.expired);
  const read = useRead(
    activity.id,
    async (signal) => {
      const [group, calendar] = await Promise.all([
        request<Response<"getGroupReservations", 200>>(endpoint(path), {
          signal,
        }),
        request<Response<"getCalendarConnection", 200>>(
          endpoint("/calendar/connection"),
          { signal },
        ),
      ]);
      const sources: CalendarSource[] = calendar.data.selectedCount
        ? (
            await request<Response<"listCalendarSources", 200>>(
              endpoint("/calendar/calendars"),
              { signal },
            )
          ).data.items.filter((item) => item.selected && item.accessible)
        : [];
      return { group, sources };
    },
    screen.expired,
  );
  if (!read.data) return <LoadState {...read} />;
  const { group, sources } = read.data;
  const zone = activity.timezone ?? screen.zone;
  return (
    <section className="surface">
      <h3>Reservas grupales</h3>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          if (
            await write.run({
              method: "PUT",
              path,
              revision: group.revision,
              body: {
                enabled: form.has("enabled"),
                accepted: form.has("accepted"),
                count: Number(form.get("count")),
                minutes: Number(form.get("duration")),
              },
            })
          )
            reload();
        }}
      >
        <label className="check-field">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={group.data.enabled}
          />
          Crear reservas grupales
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            name="accepted"
            defaultChecked={group.data.accepted}
          />
          Aceptar las reservas
        </label>
        <Field label="Número de reservas">
          <input
            type="number"
            name="count"
            required
            min={1}
            max={30}
            defaultValue={group.data.count}
          />
        </Field>
        <Field label="Minutos por reserva">
          <input
            type="number"
            name="duration"
            required
            min={1}
            max={1440}
            defaultValue={group.data.minutes}
          />
        </Field>
        <Button type="submit" disabled={write.busy}>
          Guardar reservas
        </Button>
      </form>
      <h4>Equivalencias con ocupación de Calendar</h4>
      <ul>
        {group.data.equivalences.map((item) => (
          <li key={item.id}>
            {timeLabel(item.startAt, zone ?? "UTC")} ·{" "}
            {item.valid ? "Confirmada" : "Requiere revisión"}
            <Button
              variant="ghost"
              disabled={write.busy}
              onClick={async () => {
                if (
                  await write.run({
                    method: "DELETE",
                    path: `${equivalent}/${segment(item.id)}`,
                    revision: group.revision,
                  })
                )
                  reload();
              }}
            >
              Retirar equivalencia
            </Button>
          </li>
        ))}
      </ul>
      {zone && !!sources.length && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setError("");
            try {
              if (
                await write.run({
                  path: equivalent,
                  revision: group.revision,
                  body: {
                    sourceId: form.get("source"),
                    startAt: localInstant(String(form.get("from")), zone),
                    endAt: localInstant(String(form.get("to")), zone),
                  },
                })
              )
                reload();
            } catch {
              setError("Revisa la fecha y el intervalo.");
            }
          }}
        >
          <Field label="Calendario">
            <select name="source">
              {sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Inicio de la ocupación">
            <input name="from" type="datetime-local" required />
          </Field>
          <Field label="Fin de la ocupación">
            <input name="to" type="datetime-local" required />
          </Field>
          <Button type="submit" disabled={write.busy}>
            Confirmar equivalencia
          </Button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      <WriteState {...write} reload={read.reload} />
    </section>
  );
}
