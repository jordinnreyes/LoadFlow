import { useEffect, useRef, useState } from "react";
import { useCalendarRefresh } from "../../api/useCalendarRefresh";
import {
  allPages,
  endpoint,
  request,
  type Body,
  type Response,
} from "../../api/client";
import { academics, periodPath, segment } from "../../api/academic";
import { useRead } from "../../api/useRead";
import { useWrite } from "../../api/useWrite";
import { Button, Field, Notice, SectionHeading } from "../../components/ui";
import {
  addDays,
  localInstant,
  LoadState,
  timeLabel,
  WriteState,
  type Screen,
} from "./shared";

const DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
type Configuration = Body<"replaceAvailability">;
type Commitment = Response<"listManualCommitments", 200>["items"][number];
const isoClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
function intervals(value: string) {
  return value.split(",").map((part) => {
    const match = /^(\d{2}):(\d{2})\s*[-–]\s*(\d{2}):(\d{2})$/.exec(
      part.trim(),
    );
    if (!match)
      throw new Error("Usa HH:MM–HH:MM y separa los intervalos con comas.");
    const [, fromHour, fromMinute, toHour, toMinute] = match.map(Number);
    const startMinute = fromHour * 60 + fromMinute;
    const endMinute = toHour * 60 + toMinute;
    if (
      fromHour > 23 ||
      fromMinute > 59 ||
      toHour > 24 ||
      toMinute > 59 ||
      endMinute > 1440 ||
      endMinute <= startMinute
    )
      throw new Error("Revisa los límites de los intervalos.");
    return { startMinute, endMinute };
  });
}

export function ConnectedAvailability({
  screen,
  today,
  onProfileSaved,
  calendarMode,
}: {
  screen: Screen;
  today: string | null;
  onProfileSaved: (user: Screen["session"]["user"]) => void;
  calendarMode: string | null;
}) {
  const path = `${periodPath(screen.period.id)}/availability`;
  const read = useRead(
    screen.period.id,
    (signal) => academics.availability(screen.period.id, signal),
    screen.expired,
  );
  const write = useWrite(screen.session, screen.expired);
  const [error, setError] = useState("");
  const configuration = read.data?.data.configuration;
  const zone = configuration?.timezone ?? screen.zone;
  const calendar = (
    <ConnectedCalendar
      key={calendarMode ?? "availability"}
      screen={screen}
      zone={zone}
      oauthFailed={calendarMode === "failed"}
      onProfileSaved={onProfileSaved}
    />
  );
  return (
    <>
      <SectionHeading
        eyebrow="DISPONIBILIDAD"
        title="Define cuándo puedes estudiar"
      />
      {calendarMode && calendar}
      {!read.data ? (
        <LoadState {...read} />
      ) : (
        <>
          <form
            className="surface"
            key={read.data.data.revision}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setError("");
              let config: Configuration;
              try {
                config = {
                  confirmed: true,
                  timezone: String(form.get("zone")).trim(),
                  validFrom: String(form.get("from")),
                  validTo: String(form.get("to")) || null,
                  weekly: DAYS.map((_, index) => {
                    const value = String(form.get(`day-${index}`) ?? "").trim();
                    return {
                      weekday: index + 1,
                      state: !value
                        ? "unknown"
                        : value === "—"
                          ? "no_study"
                          : "windows",
                      intervals:
                        !value || value === "—" ? [] : intervals(value),
                    };
                  }),
                  exceptions: configuration?.exceptions ?? [],
                  manualCoverage: configuration?.manualCoverage ?? [],
                  preferences: {
                    minimumMinutes: Number(form.get("min")),
                    preferredMinutes: Number(form.get("preferred")),
                    maximumMinutes: Number(form.get("max")),
                  },
                };
              } catch (failure) {
                setError((failure as Error).message);
                return;
              }
              const coverageFrom = String(form.get("coverageFrom"));
              const coverageTo = String(form.get("coverageTo"));
              if (coverageFrom || coverageTo) {
                if (!coverageFrom || !coverageTo) {
                  setError("Completa ambas fechas de cobertura manual.");
                  return;
                }
                config.manualCoverage = [
                  ...config.manualCoverage,
                  { from: coverageFrom, to: coverageTo },
                ];
              }
              const date = String(form.get("exceptionDate"));
              if (date) {
                const mode = String(
                  form.get("exceptionMode"),
                ) as Configuration["exceptions"][number]["mode"];
                try {
                  config.exceptions = [
                    ...config.exceptions.filter((item) => item.date !== date),
                    {
                      date,
                      mode,
                      intervals:
                        mode === "replace"
                          ? intervals(String(form.get("exceptionHours")))
                          : [],
                    },
                  ];
                } catch (failure) {
                  setError((failure as Error).message);
                  return;
                }
              }
              if (
                await write.run({
                  method: "PUT",
                  path,
                  revision: read.data?.revision,
                  body: config,
                })
              )
                read.reload();
            }}
          >
            <h2>Ventanas y sesiones</h2>
            <Field label="Zona de las ventanas">
              <input
                name="zone"
                required
                defaultValue={zone ?? ""}
                placeholder="America/Lima"
              />
            </Field>
            <Field label="Vigente desde">
              <input
                name="from"
                type="date"
                required
                defaultValue={configuration?.validFrom ?? today ?? ""}
              />
            </Field>
            <Field label="Vigente hasta">
              <input
                name="to"
                type="date"
                defaultValue={configuration?.validTo ?? ""}
              />
            </Field>
            <p>
              Indica intervalos separados por comas. Escribe «—» si confirmas
              que ese día no estudiarás. Deja vacío si aún falta decidir.
            </p>
            {DAYS.map((day, index) => {
              const stored = configuration?.weekly.find(
                (item) => item.weekday === index + 1,
              );
              return (
                <Field key={day} label={day}>
                  <input
                    name={`day-${index}`}
                    defaultValue={
                      stored?.state === "no_study"
                        ? "—"
                        : (stored?.intervals
                            .map(
                              (span) =>
                                `${isoClock(span.startMinute)}–${isoClock(span.endMinute)}`,
                            )
                            .join(", ") ?? "")
                    }
                    placeholder="16:00–18:00"
                  />
                </Field>
              );
            })}
            {(
              [
                [
                  "min",
                  "Duración mínima",
                  configuration?.preferences.minimumMinutes ?? 30,
                ],
                [
                  "preferred",
                  "Duración preferida",
                  configuration?.preferences.preferredMinutes ?? 60,
                ],
                [
                  "max",
                  "Duración máxima",
                  configuration?.preferences.maximumMinutes ?? 120,
                ],
              ] as const
            ).map(([name, label, value]) => (
              <Field key={name} label={`${label} (minutos)`}>
                <input
                  required
                  type="number"
                  min={1}
                  name={name}
                  defaultValue={value}
                />
              </Field>
            ))}
            <details>
              <summary>Excepciones y cobertura manual</summary>
              <ul>
                {configuration?.exceptions.map((item) => (
                  <li key={item.date}>
                    {item.date} ·{" "}
                    {item.mode === "replace"
                      ? item.intervals
                          .map(
                            (span) =>
                              `${isoClock(span.startMinute)}–${isoClock(span.endMinute)}`,
                          )
                          .join(", ")
                      : item.mode === "no_study"
                        ? "Sin estudio"
                        : "Por confirmar"}
                  </li>
                ))}
              </ul>
              <Field label="Fecha de excepción">
                <input type="date" name="exceptionDate" />
              </Field>
              <Field label="Estado de la excepción">
                <select name="exceptionMode">
                  <option value="replace">Usar otros intervalos</option>
                  <option value="no_study">Sin estudio</option>
                  <option value="unknown">Por confirmar</option>
                </select>
              </Field>
              <Field label="Intervalos de excepción">
                <input name="exceptionHours" />
              </Field>
              <ul>
                {configuration?.manualCoverage.map((item) => (
                  <li key={`${item.from}:${item.to}`}>
                    Cobertura confirmada: {item.from} — {item.to}
                  </li>
                ))}
              </ul>
              <Field label="Ocupaciones manuales confirmadas desde">
                <input type="date" name="coverageFrom" />
              </Field>
              <Field label="Ocupaciones manuales confirmadas hasta (exclusiva)">
                <input type="date" name="coverageTo" />
              </Field>
            </details>
            {error && <p role="alert">{error}</p>}
            <WriteState {...write} reload={read.reload} />
            <Button type="submit" variant="primary" disabled={write.busy}>
              Guardar disponibilidad
            </Button>
          </form>
          {configuration && (
            <form
              className="surface"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const sourceWeekday = Number(form.get("source"));
                const targetWeekday = Number(form.get("target"));
                if (sourceWeekday === targetWeekday) {
                  setError("Elige días distintos.");
                  return;
                }
                if (
                  await write.run({
                    path: `${path}/copy`,
                    revision: read.data?.revision,
                    body: {
                      confirmed: true,
                      sourceWeekday,
                      targetWeekdays: [targetWeekday],
                      mode: form.get("mode"),
                    },
                  })
                )
                  read.reload();
              }}
            >
              <h2>Copiar ventanas</h2>
              {["source", "target"].map((key) => (
                <Field
                  key={key}
                  label={key === "source" ? "Día de origen" : "Día de destino"}
                >
                  <select name={key}>
                    {DAYS.map((day, i) => (
                      <option key={day} value={i + 1}>
                        {day}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              <Field label="Modo de copia">
                <select name="mode">
                  <option value="merge">Combinar</option>
                  <option value="replace">Reemplazar</option>
                </select>
              </Field>
              {error && <p role="alert">{error}</p>}
              <Button type="submit" disabled={write.busy}>
                Confirmar copia
              </Button>
            </form>
          )}
        </>
      )}
      {zone && today && (
        <ManualCommitments screen={screen} zone={zone} today={today} />
      )}
      {!calendarMode && calendar}
    </>
  );
}

function ManualCommitments({
  screen,
  zone,
  today,
}: {
  screen: Screen;
  zone: string;
  today: string;
}) {
  const [error, setError] = useState("");
  const read = useRead(
    `${screen.period.id}:${today}:${zone}`,
    (signal) =>
      allPages<Commitment>(
        "/manual-commitments",
        {
          periodId: screen.period.id,
          from: localInstant(`${today}T00:00`, zone),
          to: localInstant(`${addDays(today, 31)}T00:00`, zone),
        },
        signal,
      ),
    screen.expired,
  );
  const write = useWrite(screen.session, screen.expired);
  return (
    <section className="surface">
      <h2>Compromisos manuales</h2>
      <p>Próximos 31 días · {zone}</p>
      {!read.data ? (
        <LoadState {...read} />
      ) : (
        <ul>
          {read.data.map((item) => (
            <li key={item.id}>
              {item.title} · {timeLabel(item.startAt, zone)} —{" "}
              {timeLabel(item.endAt, zone)}
              <Button
                variant="ghost"
                disabled={write.busy}
                onClick={async () => {
                  if (
                    await write.run({
                      method: "DELETE",
                      path: `/manual-commitments/${segment(item.id)}`,
                      revision: `"commitment-${item.revision}"`,
                    })
                  )
                    read.reload();
                }}
              >
                Retirar compromiso
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const node = event.currentTarget;
          const form = new FormData(node);
          setError("");
          try {
            if (
              await write.run({
                path: "/manual-commitments",
                body: {
                  periodId: screen.period.id,
                  title: form.get("title"),
                  timezone: zone,
                  confirmed: true,
                  startAt: localInstant(String(form.get("start")), zone),
                  endAt: localInstant(String(form.get("end")), zone),
                },
              })
            ) {
              node.reset();
              read.reload();
            }
          } catch {
            setError("Revisa los horarios del compromiso.");
          }
        }}
      >
        <Field label="Título del compromiso">
          <input name="title" required maxLength={200} />
        </Field>
        <Field label="Inicio del compromiso">
          <input name="start" required type="datetime-local" />
        </Field>
        <Field label="Fin del compromiso">
          <input name="end" required type="datetime-local" />
        </Field>
        {error && <p role="alert">{error}</p>}
        <WriteState {...write} reload={read.reload} />
        <Button type="submit" disabled={write.busy}>
          Añadir compromiso
        </Button>
      </form>
    </section>
  );
}

function ConnectedCalendar({
  screen,
  zone,
  oauthFailed,
  onProfileSaved,
}: {
  screen: Screen;
  zone: string | null;
  oauthFailed: boolean;
  onProfileSaved: (user: Screen["session"]["user"]) => void;
}) {
  const read = useRead(
    screen.period.id,
    async (signal) => {
      const connection = await academics.calendar(signal);
      const sources =
        connection.data.configured &&
        !["not_connected", "revoked"].includes(connection.data.state)
          ? (
              await request<Response<"listCalendarSources", 200>>(
                endpoint("/calendar/calendars"),
                { signal },
              )
            ).data.items
          : [];
      return { ...connection, sources };
    },
    screen.expired,
  );
  const write = useWrite(screen.session, screen.expired);
  const {
    job,
    read: jobRead,
    state,
    inProgress,
    start,
  } = useCalendarRefresh(write.run, screen.expired, read.reload);
  const connection = read.data?.data;
  const sources = read.data?.sources.filter((item) => item.accessible) ?? [];
  const canAuthorize =
    connection?.state === "not_connected" ||
    connection?.state === "revoked" ||
    connection?.safeError === "CALENDAR_SCOPES_REQUIRED";
  const canSync = !!connection?.configured && !canAuthorize;
  const discover = canSync && !sources.length;
  const discoveredRevision = useRef<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const busy = write.busy || inProgress || saving;

  function discoverSources() {
    return start({ periodId: screen.period.id, reason: "manual" }, "discover");
  }

  useEffect(() => {
    if (
      !connection ||
      !discover ||
      busy ||
      discoveredRevision.current === connection.revision
    )
      return;
    discoveredRevision.current = connection.revision;
    void discoverSources();
  }, [connection, discover, busy, discoverSources]);

  const status =
    job && !jobRead.error
      ? inProgress
        ? job.kind === "discover"
          ? "Buscando tus calendarios…"
          : "Sincronizando con Google Calendar…"
        : job.kind === "refresh"
          ? state === "succeeded"
            ? "Google Calendar sincronizado"
            : state === "partial"
              ? "Google devolvió cobertura parcial."
              : "No se pudo completar la sincronización."
          : !sources.length && connection
            ? state === "failed"
              ? "No pudimos consultar tus calendarios."
              : "Google no devolvió calendarios disponibles."
            : null
      : null;
  return (
    <section className="surface" aria-label="Google Calendar">
      <h2>Google Calendar</h2>
      <p>Usa tus horarios ocupados para planificar cuándo estudiar.</p>
      {oauthFailed && (
        <Notice
          tone="warning"
          title="No se completó la autorización de Calendar"
        >
          Usa la misma cuenta de Google que conectaste a WiseLoad y
          acepta los permisos solicitados.
        </Notice>
      )}
      {!connection ? (
        <LoadState {...read} />
      ) : !connection.configured ? (
        <p>Calendar no está configurado en este entorno.</p>
      ) : (
        <>
          {canAuthorize && (
            <>
              <p>
                Google también solicitará permiso para leer los títulos. Puedes
                elegir si se muestran desde Calendario.
              </p>
              <Button
                disabled={busy}
                onClick={async () => {
                  const auth = await write.run<
                    Response<"authorizeCalendar", 200>
                  >({
                    path: "/calendar/authorization",
                  });
                  if (auth) window.location.assign(auth.authorizationUrl);
                }}
              >
                {connection.state === "not_connected"
                  ? "Conectar Google Calendar"
                  : "Volver a conectar Google Calendar"}
              </Button>
            </>
          )}
          {canSync && (
            <>
              {connection.lastSuccessAt && (
                <p>
                  {connection.state === "stale"
                    ? "Ocupación desactualizada · "
                    : ""}
                  Última sincronización:{" "}
                  {timeLabel(connection.lastSuccessAt, zone ?? "UTC")}
                </p>
              )}
              {sources.length > 0 && (
                <form
                  key={connection.revision}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (busy || !read.data) return;
                    const form = new FormData(event.currentTarget);
                    const calendarIds = form.getAll("calendar");
                    setFormError("");
                    if (!calendarIds.length) {
                      setFormError("Elige al menos un calendario.");
                      return;
                    }
                    setSaving(true);
                    try {
                      if (!zone) {
                        const user = await write.run<
                          Response<"updateProfile", 200>
                        >({
                          method: "PATCH",
                          path: "/me/preferences",
                          revision: `"profile-${screen.session.user.revision}"`,
                          body: {
                            studyTimezone: String(form.get("zone")).trim(),
                          },
                        });
                        if (!user) return;
                        onProfileSaved(user);
                      }
                      if (
                        sources.some(
                          (item) =>
                            item.selected !== calendarIds.includes(item.id),
                        ) ||
                        connection.selectedCount !== calendarIds.length
                      ) {
                        const selection = await write.run({
                          method: "PUT",
                          path: "/calendar/selection",
                          revision: read.data.revision,
                          body: { calendarIds },
                        });
                        if (!selection) return;
                        read.reload();
                      }
                      await start({
                        periodId: screen.period.id,
                        reason: "manual",
                        includeCurrentWeek: true,
                      });
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <fieldset disabled={busy}>
                    <legend>Elige los calendarios que quieres usar</legend>
                    {sources.map((item) => (
                      <label key={item.id} className="check-field">
                        <input
                          type="checkbox"
                          name="calendar"
                          value={item.id}
                          defaultChecked={item.selected}
                        />
                        {item.name}
                      </label>
                    ))}
                    {!zone && (
                      <Field
                        label="Zona de estudio"
                        hint="Confirma la zona sugerida o cámbiala."
                      >
                        <input
                          name="zone"
                          required
                          maxLength={80}
                          defaultValue={
                            Intl.DateTimeFormat().resolvedOptions().timeZone
                          }
                          placeholder="America/Lima"
                        />
                      </Field>
                    )}
                  </fieldset>
                  {formError && <p role="alert">{formError}</p>}
                  <Button type="submit" disabled={busy}>
                    Guardar y sincronizar
                  </Button>
                </form>
              )}
              {discover &&
                !busy &&
                discoveredRevision.current === connection.revision &&
                !jobRead.error && (
                  <Button onClick={discoverSources}>Reintentar búsqueda</Button>
                )}
            </>
          )}
          {connection.state !== "not_connected" && (
            <details>
              <summary>Administrar conexión</summary>
              <Button
                disabled={busy}
                onClick={async () => {
                  const result = await write.run({
                    method: "DELETE",
                    path: "/calendar/connection",
                    revision: read.data?.revision,
                  });
                  if (result) read.reload();
                }}
              >
                Desconectar Google Calendar
              </Button>
            </details>
          )}
        </>
      )}
      {status && <p role="status">{status}</p>}
      {jobRead.error && <LoadState {...jobRead} />}
      <WriteState {...write} reload={read.reload} />
    </section>
  );
}
