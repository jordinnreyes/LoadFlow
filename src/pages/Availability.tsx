import { useState } from "react";
import { useApp } from "../state";
import { NOW_DATE, type Workspace } from "../model";
import {
  clock,
  duration,
  freeIntervals,
  dayNumber,
  addDays,
  formatMinutes,
  timeNumber,
} from "../rules";
import { makeWorkspace } from "../demo";
import {
  Badge,
  Button,
  Field,
  Icon,
  Notice,
  SectionHeading,
} from "../components/ui";
import type { Propose } from "../actions";
import { useDirtyForm } from "../navigation";

const DAYS = [
  { id: 1, name: "Lunes" },
  { id: 2, name: "Martes" },
  { id: 3, name: "Miércoles" },
  { id: 4, name: "Jueves" },
  { id: 5, name: "Viernes" },
  { id: 6, name: "Sábado" },
  { id: 0, name: "Domingo" },
];
export default function Availability({
  onPropose,
  openIntegration,
}: {
  onPropose: Propose;
  openIntegration: () => void;
}) {
  const { workspace } = useApp();
  const w = workspace!;
  const [draft, setDraft] = useState<Workspace>(() => structuredClone(w));
  const [error, setError] = useState("");
  const [exceptionDate, setExceptionDate] = useState(NOW_DATE);
  const [exceptionStart, setExceptionStart] = useState("16:00");
  const [exceptionEnd, setExceptionEnd] = useState("18:00");
  const [enabled, setEnabled] = useState(false);
  useDirtyForm(JSON.stringify(draft) !== JSON.stringify(w));
  const capacity = freeIntervals(
    { ...draft, availabilityConfirmed: true },
    dayNumber(NOW_DATE),
    dayNumber(addDays(NOW_DATE, 7)),
    [],
  ).reduce((sum, s) => sum + duration(s), 0);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (
      draft.windows.some((v) => v.end <= v.start) ||
      draft.exceptions.some((v) => v.enabled && v.end <= v.start)
    ) {
      setError(
        "La hora final de cada intervalo debe ser posterior a la inicial.",
      );
      return;
    }
    const p = draft.preferences;
    if (p.min <= 0 || p.preferred < p.min || p.preferred > p.max) {
      setError("Usa una duración positiva y un mínimo ≤ preferida ≤ máximo.");
      return;
    }
    onPropose(
      { ...draft, availabilityConfirmed: true },
      "Confirmar ventanas de estudio y preferencias",
    );
  };
  return (
    <>
      <SectionHeading
        eyebrow="CONFIGURACIÓN DE TU TIEMPO"
        title="Disponibilidad real, plan real"
        actions={
          <Button icon="calendar" onClick={openIntegration}>
            Gestionar Calendar
          </Button>
        }
      >
        Tú decides cuándo estudiar. La aplicación respeta los intervalos que
        confirmas.
      </SectionHeading>
      <div className="settings-layout">
        <form className="settings-main" onSubmit={submit}>
          <section className="surface">
            <div className="row-between">
              <div>
                <h2>Tus ventanas habituales</h2>
                <p className="muted">
                  Activa días y añade uno o más intervalos. Sin activarlo, el
                  día no se usará para estudiar.
                </p>
              </div>
              <Badge tone="info">America/Lima · UTC−5</Badge>
            </div>
            <div className="availability-days">
              {DAYS.map((day) => {
                const windows = draft.windows.filter((v) => v.day === day.id);
                return (
                  <div className="availability-day" key={day.id}>
                    <label className="check-field day-name">
                      <input
                        type="checkbox"
                        checked={windows.length > 0}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            windows: e.target.checked
                              ? [
                                  ...draft.windows,
                                  {
                                    id: crypto.randomUUID(),
                                    day: day.id,
                                    start: 16 * 60,
                                    end: 19 * 60,
                                  },
                                ]
                              : draft.windows.filter((v) => v.day !== day.id),
                          })
                        }
                      />
                      {day.name}
                    </label>
                    <div className="day-intervals">
                      {windows.length ? (
                        windows.map((v) => (
                          <div className="interval-input" key={v.id}>
                            <label>
                              <span className="sr-only">
                                {day.name}: inicio
                              </span>
                              <input
                                type="time"
                                value={clock(v.start)}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    windows: draft.windows.map((x) =>
                                      x.id === v.id
                                        ? {
                                            ...x,
                                            start: timeNumber(e.target.value),
                                          }
                                        : x,
                                    ),
                                  })
                                }
                                required
                              />
                            </label>
                            <span>—</span>
                            <label>
                              <span className="sr-only">{day.name}: fin</span>
                              <input
                                type="time"
                                value={clock(v.end)}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    windows: draft.windows.map((x) =>
                                      x.id === v.id
                                        ? {
                                            ...x,
                                            end: timeNumber(e.target.value),
                                          }
                                        : x,
                                    ),
                                  })
                                }
                                required
                              />
                            </label>
                            <Button
                              variant="ghost"
                              icon="close"
                              aria-label={`Quitar intervalo ${day.name}`}
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  windows: draft.windows.filter(
                                    (x) => x.id !== v.id,
                                  ),
                                })
                              }
                            />
                          </div>
                        ))
                      ) : (
                        <span className="muted">No estudiar</span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      icon="plus"
                      aria-label={`Añadir intervalo ${day.name}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          windows: [
                            ...draft.windows,
                            {
                              id: crypto.randomUUID(),
                              day: day.id,
                              start: 19 * 60,
                              end: 20 * 60,
                            },
                          ],
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
            <div className="form-actions">
              <Button
                icon="refresh"
                onClick={() =>
                  setDraft({ ...draft, windows: makeWorkspace().windows })
                }
              >
                Usar horario semanal de ejemplo
              </Button>
            </div>
          </section>
          <section className="surface">
            <h2>Excepciones por fecha</h2>
            <p className="muted">
              Un feriado o una tarde distinta reemplaza tus ventanas habituales
              solo ese día.
            </p>
            <div className="form-row">
              <Field label="Fecha de excepción">
                <input
                  type="date"
                  value={exceptionDate}
                  min={NOW_DATE}
                  onChange={(e) => setExceptionDate(e.target.value)}
                />
              </Field>
              <Field label="Estudio ese día">
                <select
                  value={enabled ? "yes" : "no"}
                  onChange={(e) => setEnabled(e.target.value === "yes")}
                >
                  <option value="no">No estudiar</option>
                  <option value="yes">Usar otro intervalo</option>
                </select>
              </Field>
            </div>
            {enabled && (
              <div className="form-row">
                <Field label="Inicio de excepción">
                  <input
                    type="time"
                    value={exceptionStart}
                    onChange={(e) => setExceptionStart(e.target.value)}
                  />
                </Field>
                <Field label="Fin de excepción">
                  <input
                    type="time"
                    value={exceptionEnd}
                    onChange={(e) => setExceptionEnd(e.target.value)}
                  />
                </Field>
              </div>
            )}
            <Button
              icon="plus"
              onClick={() => {
                if (!exceptionDate) return;
                setDraft({
                  ...draft,
                  exceptions: [
                    ...draft.exceptions.filter((x) => x.date !== exceptionDate),
                    {
                      date: exceptionDate,
                      enabled,
                      start: timeNumber(exceptionStart),
                      end: timeNumber(exceptionEnd),
                    },
                  ],
                });
              }}
            >
              Añadir excepción al borrador
            </Button>
            {draft.exceptions.map((x) => (
              <div className="saved-exception" key={x.date}>
                <span>
                  {x.date} ·{" "}
                  {x.enabled
                    ? `${clock(x.start)}–${clock(x.end)}`
                    : "No estudiar"}
                </span>
                <Button
                  variant="ghost"
                  icon="close"
                  aria-label={`Quitar excepción ${x.date}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      exceptions: draft.exceptions.filter(
                        (e) => e.date !== x.date,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </section>
          <section className="surface">
            <h2>Preferencias de sesión</h2>
            <p className="muted">
              Los valores iniciales 60 / 30 / 120 min son editables. Solo se
              divide una actividad cuando está permitido.
            </p>
            <div className="form-row three">
              {(["preferred", "min", "max"] as const).map((key, i) => (
                <Field
                  key={key}
                  label={["Preferida (min)", "Mínimo (min)", "Máximo (min)"][i]}
                >
                  <input
                    type="number"
                    min="1"
                    value={draft.preferences[key]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        preferences: {
                          ...draft.preferences,
                          [key]: Number(e.target.value),
                        },
                      })
                    }
                    required
                  />
                </Field>
              ))}
            </div>
            <p className="tiny muted">
              Las reservas grupales se configuran por actividad y no usan estas
              preferencias automáticamente.
            </p>
          </section>
          {error && <Notice title={error} tone="danger" />}
          <div className="form-actions">
            <Button
              onClick={() => {
                setDraft(structuredClone(w));
                setError("");
              }}
            >
              Descartar cambios del formulario
            </Button>
            <Button variant="primary" type="submit" icon="check">
              Revisar y guardar disponibilidad
            </Button>
          </div>
        </form>
        <aside>
          <div className="aside-card">
            <Icon name="clock" size={24} />
            <h3>{formatMinutes(capacity)} autorizadas</h3>
            <p>
              Ventanas de esta semana antes de descontar compromisos. Los
              intervalos solapados se unen.
            </p>
            <Notice title="Los huecos de Google no son ventanas">
              Solo se programan sesiones dentro de los intervalos que autorizas
              aquí.
            </Notice>
          </div>
          <div className="aside-card">
            <h3>Configuración local del prototipo</h3>
            <p>
              Zona de demostración fija: Lima. La política de cambio de zona
              sigue pendiente; no se modifican horarios oficiales.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
