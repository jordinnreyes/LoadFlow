import { useState } from "react";
import { useApp } from "../state";
import { navigate } from "../navigation";
import { type Activity, type Workspace, NOW_DATE, isGroup } from "../model";
import {
  addDays,
  duration,
  effectivePriority,
  formatMinutes,
  pendingEffort,
  shortDate,
  weekMetrics,
  sourceIncomplete,
} from "../rules";
import {
  Badge,
  Button,
  Empty,
  Icon,
  Notice,
  PriorityBadge,
  SectionHeading,
} from "../components/ui";

export function ActivityRow({
  activity,
  workspace,
  compact = false,
}: {
  activity: Activity;
  workspace: Workspace;
  compact?: boolean;
}) {
  const a = activity;
  const issue = workspace.issues.find((i) => i.activityId === a.id);
  const appearance =
    a.preparation === "done" || a.fulfilled
      ? "complete"
      : issue?.kind === "deficit" || issue?.kind === "conflict"
        ? "at-risk"
        : issue?.kind === "pending"
          ? "pending"
          : isGroup(a)
            ? "tentative"
            : "scheduled";
  return (
    <div className={`activity-row ${appearance} ${compact ? "compact" : ""}`}>
      <span className={`activity-symbol ${isGroup(a) ? "group-symbol" : ""}`}>
        <Icon
          name={
            isGroup(a) ? "group" : a.type.includes("Examen") ? "book" : "file"
          }
        />
      </span>
      <div className="activity-copy">
        <span className="activity-course">{a.course || "Sin asignar"}</span>
        <button
          className="activity-title"
          onClick={() => navigate(`/calendario/${a.id}`)}
        >
          {a.title}
        </button>
        <p>
          <Icon name="calendar" size={14} /> {shortDate(a.date)}
          {a.time ? ` · ${a.time}` : " · Hora pendiente"}
        </p>
        <div className="activity-tags">
          <PriorityBadge value={effectivePriority(a, workspace)} />
          {a.preparation === "done" && (
            <Badge tone="success" icon="check">
              Preparación terminada
            </Badge>
          )}
          {a.fulfilled && (
            <Badge tone="success">
              {a.type.includes("Examen") || a.type === "Práctica calificada"
                ? "Rendida"
                : "Entregada"}
            </Badge>
          )}
        </div>
      </div>
      <div className="activity-effort">
        {isGroup(a) ? (
          <>
            <strong>Tentativa</strong>
            <small>Reserva grupal</small>
          </>
        ) : (
          <>
            <strong>
              {pendingEffort(a) === null
                ? "Pendiente"
                : formatMinutes(pendingEffort(a)!)}
            </strong>
            <small>
              {pendingEffort(a) === null
                ? "Completar horas"
                : "restantes estimadas"}
            </small>
          </>
        )}
      </div>
      <button
        className="icon-button"
        aria-label={`Abrir ${a.title}`}
        onClick={() => navigate(`/calendario/${a.id}`)}
      >
        <Icon name="chevron" />
      </button>
    </div>
  );
}
const STATUS: Record<string, { label: string; tone: string; icon: string }> = {
  empty: {
    label: "Sin actividades ni sesiones",
    tone: "neutral",
    icon: "calendar",
  },
  incomplete: { label: "Faltan datos", tone: "info", icon: "info" },
  viable: { label: "Viable según datos", tone: "success", icon: "check" },
  deficit: { label: "Sobrecarga prevista", tone: "danger", icon: "warning" },
  conflict: {
    label: "Restricciones en conflicto",
    tone: "danger",
    icon: "warning",
  },
};
export default function Dashboard({
  week,
  setWeek,
  openReview,
  openIntegration,
}: {
  week: number;
  setWeek: (n: number) => void;
  openReview: () => void;
  openIntegration: () => void;
}) {
  const { workspace: nullable, save } = useApp();
  const w = nullable!;
  const [course, setCourse] = useState("");
  const [filter, setFilter] = useState("all");
  const dates = Array.from({ length: 5 }, (_, i) =>
    addDays(NOW_DATE, (week + i) * 7),
  );
  const selected = weekMetrics(w, dates[0]);
  const active = w.activities.filter((a) => a.confirmed);
  const next = active
    .filter((a) => !a.fulfilled)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const pending = w.issues.filter((i) => i.kind === "pending").length;
  const futureRisk = w.issues.find((i) => {
    const a = w.activities.find((a) => a.id === i.activityId);
    return a && a.date >= addDays(dates[4], 7);
  });
  return (
    <>
      <SectionHeading
        eyebrow="TU PLANIFICACIÓN ACADÉMICA"
        title={`Tu semana, ${w.name}.`}
        actions={
          <Button icon="calendar" onClick={() => navigate("/calendario")}>
            Abrir calendario
          </Button>
        }
      >
        Anticipa lo que viene. Haz espacio para lo importante.
      </SectionHeading>
      {w.guide && (
        <div className="welcome-guide">
          <span className="guide-icon">
            <Icon name="book" size={26} />
          </span>
          <div>
            <h2>Tu plan comienza con tus datos</h2>
            <p>
              Importa tu cronograma, revisa las horas y define cuándo puedes
              estudiar.
            </p>
            <div className="guide-links">
              <button onClick={() => navigate("/importar")}>
                1. Importar actividades <Icon name="arrow" size={16} />
              </button>
              <button onClick={() => navigate("/prioridades")}>
                2. Revisar prioridades <Icon name="arrow" size={16} />
              </button>
              <button onClick={() => navigate("/disponibilidad")}>
                3. Definir disponibilidad <Icon name="arrow" size={16} />
              </button>
            </div>
          </div>
          <button
            className="icon-button"
            aria-label="Cerrar guía"
            onClick={() => save({ ...w, guide: false })}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {sourceIncomplete(w) && (
        <Notice
          tone="warning"
          title="Tu información de Calendar está sin actualizar"
          action={<Button onClick={openIntegration}>Revisar fuente</Button>}
        >
          Última consulta: {w.lastCalendarUpdate || "sin lectura confirmada"}.
          El cálculo actual es parcial; los intervalos anteriores se conservan.
        </Notice>
      )}
      {!!w.drafts.length && (
        <Notice
          title={`Tienes ${w.drafts.length} actividades en borrador`}
          action={
            <Button onClick={() => navigate("/importar")}>
              Continuar revisión
            </Button>
          }
        >
          Todavía no cuentan en tu carga confirmada.
        </Notice>
      )}
      <div className="dashboard-stats">
        <div className="stat-card">
          <span>
            <Icon name="clock" />
            Trabajo programado
          </span>
          <strong>{active.length ? formatMinutes(selected.study) : "—"}</strong>
          <small>
            en la semana seleccionada
            {selected.group
              ? ` + ${formatMinutes(selected.group)} tentativas`
              : ""}
          </small>
        </div>
        <div className="stat-card">
          <span>
            <Icon name="calendar" />
            Tiempo disponible
          </span>
          <strong>
            {w.availabilityConfirmed
              ? formatMinutes(selected.capacity)
              : "Por definir"}
          </strong>
          <small>
            {w.availabilityConfirmed
              ? "ventanas menos compromisos fijos"
              : "Configura cuándo puedes estudiar"}
          </small>
        </div>
        <div className="stat-card">
          <span>
            <Icon name="book" />
            Próximo plazo
          </span>
          <strong className="date-stat">
            {next ? shortDate(next.date) : "Aún sin actividades"}
          </strong>
          <small>{next ? next.title : "Importa o añade una actividad"}</small>
        </div>
      </div>
      <div className="week-controls">
        <div className="week-stepper">
          <Button
            icon="back"
            aria-label="Semana anterior"
            onClick={() => setWeek(Math.max(0, week - 1))}
            disabled={week === 0}
          />
          <span>
            {shortDate(dates[0])} — {shortDate(addDays(dates[0], 6))}
            <small>Semana seleccionada · 2026</small>
          </span>
          <Button
            icon="chevron"
            aria-label="Semana siguiente"
            onClick={() => setWeek(week + 1)}
            disabled={dates[0] >= (w.periodEnd || "2026-12-18")}
          />
        </div>
        <Button variant="ghost" onClick={() => setWeek(0)}>
          Esta semana
        </Button>
        <div className="filters">
          <label className="sr-only" htmlFor="course-filter">
            Filtrar por curso
          </label>
          <select
            id="course-filter"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
          >
            <option value="">Todos los cursos</option>
            {w.courses.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="state-filter">
            Filtrar semanas
          </label>
          <select
            id="state-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="attention">Requieren atención</option>
            <option value="viable">Viables según datos</option>
          </select>
        </div>
      </div>
      <div className="dashboard-columns">
        <section className="week-list" aria-label="Tarjetas semanales">
          <div className="row-between section-kicker">
            <h2>Tu horizonte semanal</h2>
            <span>5 semanas · navega para ver más</span>
          </div>
          {dates.map((date, index) => {
            const m = weekMetrics(w, date);
            const status = STATUS[m.state];
            const deadlines = m.deadlines.filter(
              (a) => !course || a.course === course,
            );
            const sessionActivities = [
              ...new Set(m.sessions.map((s) => s.activityId)),
            ]
              .map((id) => w.activities.find((a) => a.id === id)!)
              .filter((a) => a && (!course || a.course === course));
            if (
              (filter === "attention" &&
                !["incomplete", "deficit", "conflict"].includes(m.state)) ||
              (filter === "viable" && m.state !== "viable") ||
              (course && !deadlines.length && !sessionActivities.length)
            )
              return null;
            return (
              <article
                className={`week-card ${m.state}`}
                key={date}
                data-testid={`week-${date}`}
              >
                <header className="week-card-header">
                  <div className="week-label">
                    <span className="week-index">
                      {String(week + index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>
                        {shortDate(date)} — {shortDate(addDays(date, 6))}
                      </h3>
                      <span>
                        {week + index === 0
                          ? "Esta semana"
                          : "Próxima semana de estudio"}
                      </span>
                    </div>
                  </div>
                  <Badge tone={status.tone} icon={status.icon}>
                    {status.label}
                  </Badge>
                </header>
                {m.state === "empty" ? (
                  <div className="week-empty">
                    <Icon name="calendar" />
                    <p>
                      Sin actividades ni sesiones esta semana.
                      <small>Los datos que añadas aparecerán aquí.</small>
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="load-summary">
                      <div>
                        <strong>{formatMinutes(m.study)}</strong>
                        <span>de estudio programado</span>
                      </div>
                      <div>
                        <strong>
                          {w.availabilityConfirmed
                            ? formatMinutes(m.capacity)
                            : "Sin definir"}
                        </strong>
                        <span>disponibles para estudiar</span>
                      </div>
                      {m.group > 0 && (
                        <div>
                          <strong>{formatMinutes(m.group)}</strong>
                          <span>reservas grupales tentativas</span>
                        </div>
                      )}
                      {m.deficit > 0 && (
                        <div className="load-unplaced">
                          <strong>{formatMinutes(m.deficit)}</strong>
                          <span>sin ubicar o en conflicto</span>
                        </div>
                      )}
                    </div>
                    {w.availabilityConfirmed && m.capacity > 0 && (
                      <div className="load-distribution">
                        <div className="load-caption">
                          <span>Distribución del tiempo semanal</span>
                          <strong>
                            {Math.round(
                              ((m.study + m.group) / m.capacity) * 100,
                            )}
                            % reservado
                          </strong>
                        </div>
                        <div className="load-track" aria-hidden="true">
                          <span
                            style={{
                              width: `${Math.min(100, (m.study / m.capacity) * 100)}%`,
                            }}
                          />
                          {m.group > 0 && (
                            <span
                              className="tentative-track"
                              style={{
                                width: `${Math.min(100 - (m.study / m.capacity) * 100, (m.group / m.capacity) * 100)}%`,
                              }}
                            />
                          )}
                        </div>
                        <div className="load-key">
                          <span>
                            <i />
                            Estudio programado
                          </span>
                          {m.group > 0 && (
                            <span>
                              <i className="tentative" />
                              Reservas tentativas
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {!!m.issues.length && (
                      <div
                        className={`week-alert ${m.deficit ? "danger" : "info"}`}
                      >
                        <Icon name={m.deficit ? "warning" : "info"} size={18} />
                        <div>
                          <strong>
                            {m.deficit
                              ? `${formatMinutes(m.deficit)} sin ubicar o en conflicto`
                              : `${m.issues.length} datos por completar`}
                          </strong>
                          <p>{m.issues[0].message}</p>
                        </div>
                        <button className="text-link" onClick={openReview}>
                          Revisar
                        </button>
                      </div>
                    )}
                    {!!deadlines.length && (
                      <div className="week-section">
                        <div className="section-kicker">
                          <h4>Vence esta semana</h4>
                          <span>
                            {deadlines.length}{" "}
                            {deadlines.length === 1
                              ? "obligación"
                              : "obligaciones"}
                          </span>
                        </div>
                        {deadlines.map((a) => (
                          <ActivityRow key={a.id} activity={a} workspace={w} />
                        ))}
                      </div>
                    )}
                    {!!sessionActivities.length && (
                      <div className="week-section">
                        <div className="section-kicker">
                          <h4>Sesiones esta semana</h4>
                          <span>{m.sessions.length} bloques internos</span>
                        </div>
                        {sessionActivities.map((a) => {
                          const sessions = m.sessions.filter(
                            (s) => s.activityId === a.id,
                          );
                          const early = a.date >= addDays(date, 7);
                          return (
                            <button
                              className="session-summary"
                              key={a.id}
                              onClick={() => navigate(`/calendario/${a.id}`)}
                            >
                              <span
                                className={`mini-icon ${isGroup(a) ? "tentative" : ""}`}
                              >
                                <Icon
                                  name={isGroup(a) ? "group" : "clock"}
                                  size={18}
                                />
                              </span>
                              <div>
                                <strong>{a.title}</strong>
                                <small>
                                  {early
                                    ? `Trabajo adelantado · vence el ${shortDate(a.date)}`
                                    : `${sessions.length} sesiones · ${a.course || "Sin asignar"}`}
                                </small>
                              </div>
                              <span>
                                {formatMinutes(
                                  sessions.reduce((n, s) => n + duration(s), 0),
                                )}
                              </span>
                              <Icon name="chevron" size={16} />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
                <footer className="week-card-footer">
                  <small>
                    {sourceIncomplete(w)
                      ? "Fuente pendiente de actualización"
                      : w.calendar === "manual"
                        ? "Disponibilidad manual"
                        : "Ocupación de Calendar simulada"}
                    {m.state !== "empty" ? " · Horas estimadas" : ""}
                  </small>
                  <button className="text-link" onClick={openReview}>
                    Ver carga y opciones <Icon name="arrow" size={16} />
                  </button>
                </footer>
              </article>
            );
          })}
          {filter !== "all" &&
            !dates.some((date) =>
              filter === "viable"
                ? weekMetrics(w, date).state === "viable"
                : ["incomplete", "deficit", "conflict"].includes(
                    weekMetrics(w, date).state,
                  ),
            ) && (
              <Empty
                title="Ninguna semana coincide"
                action={
                  <Button onClick={() => setFilter("all")}>
                    Ver todos los estados
                  </Button>
                }
              >
                Cambia el filtro para volver a consultar el horizonte completo.
              </Empty>
            )}
          <div className="import-footer">
            <div>
              <Icon name="upload" size={24} />
              <div>
                <strong>Tu próximo cronograma, en un solo lugar</strong>
                <p>PDF o Excel · revisión gratuita en ambos planes</p>
              </div>
            </div>
            <Button
              variant="primary"
              icon="upload"
              onClick={() => navigate("/importar")}
            >
              Importar actividad — PDF/Excel
            </Button>
          </div>
        </section>
        <aside className="dashboard-aside">
          <div className="aside-card">
            <div className="aside-title">
              <Icon name="eye" />
              <h2>Una mirada a tu plan</h2>
            </div>
            <p>
              Las horas de estudio se cuentan en la semana en que las
              realizarás, aunque la evaluación venza después.
            </p>
            <div className="aside-rule" />
            <div className="row-between">
              <span>Actividades confirmadas</span>
              <strong>{active.length}</strong>
            </div>
            <div className="row-between">
              <span>Datos por completar</span>
              <strong>{pending}</strong>
            </div>
            <div className="row-between">
              <span>Sesiones fijadas</span>
              <strong>{w.sessions.filter((s) => s.fixed).length}</strong>
            </div>
            <Button
              icon="sliders"
              className="full"
              onClick={() => navigate("/disponibilidad")}
            >
              Ajustar disponibilidad
            </Button>
          </div>
          <div className="aside-card source-card">
            <span className="aside-icon">
              <Icon name="calendar" />
            </span>
            <h3>
              {w.calendar === "manual"
                ? "Tu disponibilidad es manual"
                : "Tus compromisos, a la vista"}
            </h3>
            <p>
              {w.calendar === "manual"
                ? "Puedes conectar Calendar de forma opcional para considerar tus horarios ocupados."
                : "Consulta ocupación y ventanas de estudio en el calendario interno."}
            </p>
            <button className="text-link" onClick={openIntegration}>
              {w.calendar === "manual"
                ? "Conectar Calendar"
                : "Gestionar Calendar"}{" "}
              <Icon name="arrow" size={16} />
            </button>
          </div>
          {futureRisk && (
            <Notice
              tone="warning"
              title="Hay riesgo fuera de estas cinco semanas"
              action={
                <Button
                  onClick={() => {
                    const a = w.activities.find(
                      (a) => a.id === futureRisk.activityId,
                    )!;
                    setWeek(
                      Math.floor(
                        (Date.parse(a.date) - Date.parse(NOW_DATE)) / 604800000,
                      ),
                    );
                  }}
                >
                  Ver semana
                </Button>
              }
            />
          )}
          <p className="aside-caption">
            <Icon name="info" size={16} />
            Tu plan se basa en los datos que confirmas. No es una garantía de
            cumplimiento.
          </p>
        </aside>
      </div>
    </>
  );
}
