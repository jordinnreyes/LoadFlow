import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state";
import {
  type Commitment,
  type Interval,
  type Session,
  NOW_DATE,
} from "../model";
import {
  addDays,
  clock,
  dayNumber,
  duration,
  freeIntervals,
  intervalLabel,
  occupations,
  shortDate,
  stamp,
  timeNumber,
  validateSession,
  weekStart,
  windowsOn,
} from "../rules";
import { navigate } from "../navigation";
import {
  Badge,
  Button,
  Empty,
  Field,
  Icon,
  Modal,
  Notice,
  SectionHeading,
} from "../components/ui";
import type { Propose } from "../actions";
import ActivityPanel from "../panels/ActivityPanel";

export default function Calendar({
  selectedId,
  onPropose,
  onReview,
  onIntegration,
}: {
  selectedId?: string;
  onPropose: Propose;
  onReview: () => void;
  onIntegration: () => void;
}) {
  const { workspace } = useApp();
  const w = workspace!;
  const [date, setDate] = useState(NOW_DATE);
  const [view, setView] = useState(
    window.innerWidth >= 1024 ? "week" : "agenda",
  );
  const [editSession, setEditSession] = useState<Session | null>(null);
  const [newCommitment, setNewCommitment] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [newError, setNewError] = useState("");
  const activity = w.activities.find((a) => a.id === selectedId);
  useEffect(() => {
    if (activity) {
      const first = w.sessions.find((s) => s.activityId === activity.id);
      setDate(weekStart(first?.date || activity.date));
    }
  }, [selectedId]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));
  const occupied = occupations(w);
  const sessions = w.sessions.filter((s) => days.includes(s.date));
  const blocks = occupied.filter((s) => days.includes(s.date));
  const relevant = [
    ...sessions,
    ...blocks,
    ...days.flatMap((d) => windowsOn(w, d)),
  ];
  const minHour = Math.min(8, ...relevant.map((s) => Math.floor(s.start / 60)));
  const maxHour = Math.max(20, ...relevant.map((s) => Math.ceil(s.end / 60)));
  const hours = Array.from(
    { length: maxHour - minHour },
    (_, i) => minHour + i,
  );
  const free = useMemo(
    () =>
      freeIntervals(w, dayNumber(days[0]), dayNumber(addDays(days[6], 1)), [
        ...occupied,
        ...w.sessions,
      ]),
    [w, date],
  );
  const position = (s: Interval) => ({
    top: ((s.start - minHour * 60) * 64) / 60,
    height: Math.max(16, (duration(s) * 64) / 60),
  });
  const label = (c: Commitment) =>
    c.source === "google" ? "Ocupado · Google Calendar" : c.title;
  const saveSession = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!editSession) return;
    const next = {
      ...editSession,
      date: String(form.get("date")),
      start: timeNumber(String(form.get("start"))),
      end: timeNumber(String(form.get("end"))),
      fixed: true,
    };
    const reasons = validateSession(next, w);
    if (reasons.length) {
      setSessionError(reasons.join(". "));
      return;
    }
    setEditSession(null);
    setSessionError("");
    onPropose(
      { ...w, sessions: w.sessions.map((s) => (s.id === next.id ? next : s)) },
      "Mover una sesión y fijarla",
      { scope: next.activityId, confirmLabel: "Mover y fijar" },
    );
  };
  return (
    <>
      <SectionHeading
        eyebrow="CALENDARIO INTERNO"
        title="Un espacio para cada sesión"
        actions={
          <>
            <Button
              icon="plus"
              onClick={() => {
                setNewError("");
                setNewCommitment(true);
              }}
            >
              Añadir compromiso
            </Button>
            <Button
              variant="primary"
              icon="refresh"
              onClick={() =>
                onPropose(w, "Recalcular todas las sesiones flexibles")
              }
            >
              Recalcular plan
            </Button>
          </>
        }
      >
        Estudio, evaluaciones y compromisos en una misma vista.
      </SectionHeading>
      <div className="calendar-toolbar">
        <div className="week-stepper">
          <Button
            icon="back"
            aria-label="Calendario: semana anterior"
            onClick={() => setDate(addDays(date, -7))}
            disabled={date <= NOW_DATE}
          />
          <strong>
            {shortDate(days[0])} — {shortDate(days[6])}
          </strong>
          <Button
            icon="chevron"
            aria-label="Calendario: semana siguiente"
            onClick={() => setDate(addDays(date, 7))}
            disabled={date >= (w.periodEnd || "2026-12-18")}
          />
          <Button variant="ghost" onClick={() => setDate(NOW_DATE)}>
            Hoy de ejemplo
          </Button>
        </div>
        <div className="segmented">
          <button
            className={view === "week" ? "active" : ""}
            onClick={() => setView("week")}
          >
            Semana
          </button>
          <button
            className={view === "agenda" ? "active" : ""}
            onClick={() => setView("agenda")}
          >
            Agenda
          </button>
        </div>
      </div>
      <div className="calendar-legend">
        <span>
          <i className="legend-study" />
          Estudio flexible
        </span>
        <span>
          <Icon name="lock" size={14} />
          Fijada
        </span>
        <span>
          <i className="legend-occupied" />
          Ocupado
        </span>
        <span>
          <i className="legend-available" />
          Disponible
        </span>
        <span>
          <i className="legend-group" />
          Reserva tentativa
        </span>
        <button className="text-link" onClick={onIntegration}>
          {w.calendar === "manual"
            ? "Disponibilidad manual"
            : "Calendar simulado"}
        </button>
      </div>
      <div className={`calendar-layout ${selectedId ? "with-detail" : ""}`}>
        <section className="calendar-main" aria-label="Sesiones y compromisos">
          {selectedId && (
            <div className="context-strip">
              <Icon name="eye" />
              <span>
                {activity
                  ? `Contexto: ${activity.title}`
                  : "Nueva actividad manual"}
              </span>
              <button
                className="text-link"
                onClick={() => navigate("/calendario")}
              >
                Ver calendario completo
              </button>
            </div>
          )}
          {view === "week" ? (
            <div className="calendar-scroll">
              <div className="calendar-grid" style={{ minWidth: 840 }}>
                <div className="calendar-days">
                  <div>GMT−5</div>
                  {days.map((d) => (
                    <div className={d === NOW_DATE ? "today" : ""} key={d}>
                      <span>
                        {new Intl.DateTimeFormat("es", {
                          weekday: "short",
                          timeZone: "UTC",
                        }).format(new Date(d + "T12:00Z"))}
                      </span>
                      <strong>{Number(d.slice(8))}</strong>
                      {w.activities
                        .filter((a) => a.confirmed && a.date === d)
                        .map((a) => (
                          <button
                            key={a.id}
                            className="deadline-marker"
                            onClick={() => navigate(`/calendario/${a.id}`)}
                            title={a.title}
                          >
                            Plazo · {a.time || "sin hora"}
                          </button>
                        ))}
                    </div>
                  ))}
                </div>
                <div
                  className="calendar-body"
                  style={{ height: (maxHour - minHour) * 64 }}
                >
                  <div className="time-axis">
                    {hours.map((h) => (
                      <span key={h} style={{ top: (h - minHour) * 64 }}>
                        {clock(h * 60)}
                      </span>
                    ))}
                  </div>
                  {days.map((d) => (
                    <div className="day-column" key={d}>
                      {windowsOn(w, d).map((s) => (
                        <div
                          key={s.id}
                          className="authorized-window"
                          style={position(s)}
                          aria-hidden="true"
                        />
                      ))}
                      {free
                        .filter((s) => s.date === d)
                        .map((s) => (
                          <div
                            key={s.id}
                            className="available-window"
                            style={position(s)}
                          >
                            <span>Disponible</span>
                          </div>
                        ))}
                      {blocks
                        .filter((s) => s.date === d)
                        .map((c) => (
                          <div
                            key={c.id}
                            className={`calendar-block occupied ${c.source === "google" ? "external" : ""}`}
                            style={position(c)}
                          >
                            <strong>{label(c)}</strong>
                            <small>
                              {clock(c.start)}–{clock(c.end)}
                            </small>
                          </div>
                        ))}
                      {sessions
                        .filter((s) => s.date === d)
                        .map((s) => {
                          const a = w.activities.find(
                            (a) => a.id === s.activityId,
                          );
                          return (
                            <button
                              key={s.id}
                              className={`calendar-block study ${s.group ? "group-block" : ""} ${s.fixed ? "fixed-block" : ""} ${selectedId && selectedId !== s.activityId ? "dimmed" : ""} ${w.issues.some((i) => i.activityId === s.activityId && i.kind === "conflict") ? "conflict-block" : ""}`}
                              style={position(s)}
                              onClick={() => {
                                setEditSession(s);
                                setSessionError("");
                              }}
                              aria-label={`${a?.title} · ${intervalLabel(s)} · ${s.fixed ? "Fijada" : "Flexible"}`}
                            >
                              <strong>
                                {s.fixed && <Icon name="lock" size={12} />}{" "}
                                {s.group ? "Reserva tentativa" : a?.title}
                              </strong>
                              <small>
                                {clock(s.start)}–{clock(s.end)}
                              </small>
                            </button>
                          );
                        })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="agenda-list">
              {days.map((d) => {
                const entries = [
                  ...blocks
                    .filter((b) => b.date === d)
                    .map((c) => ({
                      id: c.id,
                      start: c.start,
                      end: c.end,
                      title: label(c),
                      kind: "occupied",
                      s: null as Session | null,
                    })),
                  ...sessions
                    .filter((s) => s.date === d)
                    .map((s) => ({
                      id: s.id,
                      start: s.start,
                      end: s.end,
                      title:
                        w.activities.find((a) => a.id === s.activityId)
                          ?.title || "Sesión",
                      kind: s.group ? "group" : s.fixed ? "fixed" : "study",
                      s,
                    })),
                  ...free
                    .filter((s) => s.date === d)
                    .map((s) => ({
                      id: s.id,
                      start: s.start,
                      end: s.end,
                      title: "Espacio disponible para estudiar",
                      kind: "available",
                      s: null as Session | null,
                    })),
                ].sort((a, b) => a.start - b.start);
                return (
                  <section className="agenda-day" key={d}>
                    <h3>
                      {shortDate(d, true)}
                      {d === NOW_DATE && (
                        <Badge tone="info">Hoy de ejemplo</Badge>
                      )}
                    </h3>
                    {w.activities
                      .filter((a) => a.confirmed && a.date === d)
                      .map((a) => (
                        <button
                          className="agenda-deadline"
                          onClick={() => navigate(`/calendario/${a.id}`)}
                          key={a.id}
                        >
                          <Icon name="file" size={16} />
                          Plazo: {a.title} · {a.time || "Hora por confirmar"}
                        </button>
                      ))}
                    {!entries.length && (
                      <p className="muted">
                        Sin sesiones ni intervalos declarados.
                      </p>
                    )}
                    {entries.map((x) => (
                      <div className={`agenda-entry ${x.kind}`} key={x.id}>
                        <span className="agenda-time">
                          {clock(x.start)}
                          <small>{clock(x.end)}</small>
                        </span>
                        <span className="agenda-marker" />
                        <div>
                          <span className="agenda-kind">
                            <Icon
                              name={
                                x.kind === "available"
                                  ? "clock"
                                  : x.kind === "group"
                                    ? "group"
                                    : x.kind === "fixed"
                                      ? "lock"
                                      : x.kind === "occupied"
                                        ? "calendar"
                                        : "book"
                              }
                              size={14}
                            />
                            {x.kind === "occupied"
                              ? "Compromiso"
                              : x.kind === "available"
                                ? "Disponible"
                                : x.kind === "group"
                                  ? "Reserva tentativa"
                                  : x.kind === "fixed"
                                    ? "Estudio fijado"
                                    : "Estudio flexible"}
                          </span>
                          <strong>{x.title}</strong>
                          <small>
                            {x.kind === "occupied"
                              ? "Compromiso ocupado"
                              : x.kind === "available"
                                ? "Dentro de una ventana autorizada"
                                : x.kind === "group"
                                  ? "Reserva grupal tentativa"
                                  : x.kind === "fixed"
                                    ? "Sesión fijada por ti"
                                    : "Sesión flexible"}{" "}
                            · {formatDuration(x.end - x.start)}
                          </small>
                        </div>
                        {x.s && (
                          <>
                            <Button
                              variant="ghost"
                              aria-label={`Ver actividad ${x.title}`}
                              icon="eye"
                              onClick={() =>
                                navigate(`/calendario/${x.s!.activityId}`)
                              }
                            />
                            <Button
                              variant="ghost"
                              aria-label={`Editar sesión ${x.title}`}
                              icon="sliders"
                              onClick={() => {
                                setEditSession(x.s);
                                setSessionError("");
                              }}
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>
          )}
          {!w.activities.length && (
            <Empty
              title="Aquí aparecerán tus sesiones"
              action={
                <Button onClick={() => navigate("/importar")}>
                  Importar actividades
                </Button>
              }
            >
              Primero confirma una actividad y tu disponibilidad. Un hueco del
              calendario no se considera estudiable por sí solo.
            </Empty>
          )}
          {!!w.issues.length && (
            <Notice
              tone={
                w.issues.some((i) => i.kind !== "pending") ? "warning" : "info"
              }
              title={`${w.issues.length} asuntos por revisar`}
              action={
                <Button onClick={onReview}>Ver carga y conflictos</Button>
              }
            >
              {w.issues[0].message}
            </Notice>
          )}
        </section>
        {selectedId && (
          <ActivityPanel
            selectedId={selectedId}
            onPropose={onPropose}
            editSession={(s) => {
              setEditSession(s);
              setSessionError("");
            }}
          />
        )}
      </div>
      {editSession && (
        <Modal
          title="Editar sesión"
          eyebrow="UN SOLO BLOQUE"
          onClose={() => setEditSession(null)}
        >
          <p>
            {w.activities.find((a) => a.id === editSession.activityId)?.title}
          </p>
          <form onSubmit={saveSession}>
            <Field label="Fecha">
              <input
                type="date"
                name="date"
                defaultValue={editSession.date}
                required
              />
            </Field>
            <div className="form-row">
              <Field label="Hora inicial">
                <input
                  type="time"
                  name="start"
                  defaultValue={clock(editSession.start)}
                  required
                />
              </Field>
              <Field label="Hora final">
                <input
                  type="time"
                  name="end"
                  defaultValue={clock(editSession.end)}
                  required
                />
              </Field>
            </div>
            <Notice title="Un movimiento manual deja la sesión fijada">
              No se moverá automáticamente hasta que la liberes. Los otros
              bloques se mantienen.
            </Notice>
            {sessionError && <Notice tone="danger" title={sessionError} />}
            <div className="form-actions">
              <Button onClick={() => setEditSession(null)}>Cancelar</Button>
              {editSession.fixed && (
                <Button
                  icon="lock"
                  onClick={() => {
                    const next = {
                      ...w,
                      sessions: w.sessions.map((s) =>
                        s.id === editSession.id ? { ...s, fixed: false } : s,
                      ),
                    };
                    setEditSession(null);
                    onPropose(next, "Liberar una sesión fijada", {
                      scope: editSession.activityId,
                    });
                  }}
                >
                  Liberar sesión
                </Button>
              )}
              <Button variant="primary" type="submit">
                Revisar movimiento
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {newCommitment && (
        <Modal
          title="Añadir compromiso"
          onClose={() => setNewCommitment(false)}
        >
          <p className="muted">
            Un compromiso manual reduce tu disponibilidad. No modifica Google
            Calendar.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const c: Commitment = {
                id: crypto.randomUUID(),
                title: String(data.get("title")),
                date: String(data.get("date")),
                start: timeNumber(String(data.get("start"))),
                end: timeNumber(String(data.get("end"))),
                source: "manual",
              };
              if (c.end <= c.start) {
                setNewError("La hora final debe ser posterior a la inicial.");
                return;
              }
              setNewCommitment(false);
              onPropose(
                { ...w, commitments: [...w.commitments, c] },
                "Añadir un compromiso manual",
              );
            }}
          >
            <Field label="Nombre">
              <input
                name="title"
                placeholder="Clase, gimnasio o reunión"
                required
              />
            </Field>
            <Field label="Fecha">
              <input name="date" type="date" defaultValue={NOW_DATE} required />
            </Field>
            <div className="form-row">
              <Field label="Hora inicial">
                <input name="start" type="time" defaultValue="16:00" required />
              </Field>
              <Field label="Hora final">
                <input name="end" type="time" defaultValue="17:00" required />
              </Field>
            </div>
            {newError && <Notice title={newError} tone="danger" />}
            <div className="form-actions">
              <Button onClick={() => setNewCommitment(false)}>Cancelar</Button>
              <Button variant="primary" type="submit">
                Revisar impacto
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
const formatDuration = (n: number) =>
  n % 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n / 60} h`;
