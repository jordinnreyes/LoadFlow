import { useState } from "react";
import {
  academics,
  periodPath,
  segment,
  type Activity,
  type PlanCommand,
  type Proposal,
} from "../../api/academic";
import { useRead } from "../../api/useRead";
import { useCalendarRefresh } from "../../api/useCalendarRefresh";
import { useWrite } from "../../api/useWrite";
import {
  ApiError,
  apiMessage,
  endpoint,
  request,
  type Response,
} from "../../api/client";
import { LoadChart } from "../../components/LoadChart";
import {
  calendarBlocks,
  OccupancyAgenda,
  OccupancyStatus,
} from "./CalendarOccupancy";
import { WeeklyCalendar } from "./WeeklyCalendar";
import {
  Badge,
  Button,
  Field,
  Modal,
  Notice,
  SectionHeading,
} from "../../components/ui";
import {
  addDays,
  dayBoundary,
  localInstant,
  LoadState,
  minutesLabel,
  timeLabel,
  WEEKDAY_LABELS,
  WriteState,
  type Screen,
} from "./shared";

const STATES = {
  empty: "Sin actividades ni sesiones",
  partial: "Faltan datos",
  viable: "Viable según datos",
  deficit: "Sobrecarga prevista",
  conflict: "Restricciones en conflicto",
};
const CONFIRM = {
  accept_partial_plan:
    "Acepto las horas que quedan sin ubicar en este plan parcial",
  keep_fixed_conflicts: "Conservar las sesiones fijadas que requieren revisión",
  group_reservations: "Confirmo los cambios en reservas grupales",
  release_fixed_sessions: "Confirmo liberar las sesiones fijadas indicadas",
  academic_date_change: "Confirmo el cambio de fecha académica",
};

export function ConnectedWeek({
  screen,
  first,
  offset,
  setOffset,
  calendar,
}: {
  screen: Screen;
  first: string;
  offset: number;
  setOffset: (offset: number) => void;
  calendar: boolean;
}) {
  const { period, session, expired } = screen;
  const start = addDays(first, offset * 7);
  const read = useRead(
    `${period.id}:${start}`,
    async (signal) => {
      const [weekly, plan, activities, courses] = await Promise.all([
        academics.weekly(period.id, start, addDays(start, 7), signal),
        academics.plan(period.id, signal),
        academics.activities(period.id, signal),
        academics.courses(period.id, signal),
      ]);
      return {
        weekly: weekly.data,
        plan: plan.data,
        revision: plan.revision,
        activities,
        courses,
      };
    },
    expired,
  );
  const write = useWrite(session, expired);
  const [course, setCourse] = useState("");
  const [calendarView, setCalendarView] = useState<"week" | "agenda">("week");
  const [stateFilter, setStateFilter] = useState("all");
  const [proposal, setProposal] = useState<Proposal>();
  const [confirmations, setConfirmations] = useState<
    Proposal["requiredConfirmations"]
  >([]);
  const [review, setReview] = useState(false);
  const [move, setMove] = useState<{ id: string; revision: number }>();
  const [formError, setFormError] = useState("");
  async function propose(command: PlanCommand) {
    if (!read.data?.revision) return;
    const result = await write.run<Proposal>({
      path: `${periodPath(period.id)}/planning-proposals`,
      body: command,
      revision: read.data.revision,
    });
    if (result) {
      setMove(undefined);
      setReview(false);
      setConfirmations([]);
      setProposal(result);
    }
  }
  const data = read.data;
  const week = data?.weekly.weeks[0];
  const zone = data?.weekly.timezone ?? screen.zone;
  const calendarRange =
    calendar && zone
      ? {
          from: new Date(dayBoundary(start, zone)).toISOString(),
          to: new Date(dayBoundary(addDays(start, 7), zone)).toISOString(),
        }
      : null;
  const occupancy = useRead(
    calendarRange
      ? `${period.id}:${calendarRange.from}:${calendarRange.to}`
      : "",
    async (signal) =>
      calendarRange
        ? (
            await academics.calendarBusy(
              calendarRange.from,
              calendarRange.to,
              signal,
            )
          ).data
        : null,
    expired,
  );
  const calendarWrite = useWrite(session, expired);
  const refresh = useCalendarRefresh(
    calendarWrite.run,
    expired,
    occupancy.reload,
  );
  const connection = occupancy.data?.connection;
  const canReadTitles =
    !!calendarRange &&
    connection?.eventTitlesEnabled &&
    connection.selectedCount > 0;
  const events = useRead(
    canReadTitles
      ? `${calendarRange.from}:${calendarRange.to}:${connection.revision}:${occupancy.data?.lastFetchedAt}`
      : "",
    async (signal) =>
      canReadTitles
        ? (
            await academics.calendarEvents(
              calendarRange.from,
              calendarRange.to,
              signal,
            )
          ).data
        : null,
    expired,
  );
  const blocks = calendarBlocks(occupancy.data, events.data?.items ?? []);
  const canRefreshWeek =
    !!zone &&
    connection?.configured &&
    connection.selectedCount > 0 &&
    !["not_connected", "revoked"].includes(connection.state);
  const titleConsentFailed =
    calendar &&
    new URLSearchParams(window.location.hash.split("?")[1]).get("calendar") ===
      "failed";
  const showWeek =
    !!week &&
    (stateFilter === "all" ||
      (stateFilter === "viable"
        ? week.state === "viable"
        : ["partial", "conflict", "deficit"].includes(week.state)));
  const matchCourse = (activity: Activity | undefined) =>
    !course || activity?.courseId === course;
  const visible = (id: string) => data?.activities.find((a) => a.id === id);
  const end =
    period.endDate ??
    data?.activities.reduce(
      (latest, item) => (item.dueDate > latest ? item.dueDate : latest),
      first,
    );
  return (
    <>
      <SectionHeading
        eyebrow="TU PLANIFICACIÓN ACADÉMICA"
        title={
          calendar
            ? "Un espacio para cada sesión"
            : `Tu semana, ${session.user.displayName}.`
        }
        actions={
          calendar ? (
            <a className="button" href="#/tablero">
              Volver al tablero
            </a>
          ) : (
            <a className="button" href="#/calendario">
              Abrir calendario
            </a>
          )
        }
      >
        {period.name}
      </SectionHeading>
      {!calendar && week && week.state !== "empty" && (
        <LoadChart
          state={week.state}
          status={STATES[week.state]}
          index={offset}
          study={week.studyMinutes}
          group={week.groupMinutes}
          capacity={week.capacityMinutes}
          onReview={() => setReview(true)}
          days={week.days.map((day, index) => ({
            label: WEEKDAY_LABELS[index],
            date: day.date,
            capacity: day.capacityMinutes ?? 0,
            study: day.studyMinutes,
            group: day.groupMinutes,
            unplaced: day.unplacedMinutes ?? 0,
            total:
              day.studyMinutes + day.groupMinutes + (day.unplacedMinutes ?? 0),
          }))}
        />
      )}
      <div className="week-controls">
        <div className="week-stepper" role="group" aria-label="Elegir semana">
          <Button
            icon="back"
            aria-label="Semana anterior"
            disabled={offset === 0}
            onClick={() => setOffset(offset - 1)}
          />
          <span aria-live="polite">
            {start} — {addDays(start, 6)}
          </span>
          <Button
            icon="chevron"
            aria-label="Semana siguiente"
            disabled={!end || addDays(start, 7) > end}
            onClick={() => setOffset(offset + 1)}
          />
        </div>
        <Button variant="ghost" onClick={() => setOffset(0)}>
          Esta semana
        </Button>
        <div className="filters">
          <select
            aria-label="Filtrar por curso"
            value={course}
            onChange={(event) => setCourse(event.target.value)}
          >
            <option value="">Todos los cursos</option>
            {data?.courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {!calendar && (
            <select
              aria-label="Filtrar por estado"
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
            >
              <option value="all">Todos los estados</option>
              <option value="attention">Requieren atención</option>
              <option value="viable">Viables según datos</option>
            </select>
          )}
        </div>
      </div>
      {calendar && (
        <div className="form-actions">
          <div
            className="segmented"
            role="group"
            aria-label="Vista del calendario"
          >
            <button
              type="button"
              className={calendarView === "week" ? "active" : ""}
              aria-pressed={calendarView === "week"}
              onClick={() => setCalendarView("week")}
            >
              Semana
            </button>
            <button
              type="button"
              className={calendarView === "agenda" ? "active" : ""}
              aria-pressed={calendarView === "agenda"}
              onClick={() => setCalendarView("agenda")}
            >
              Agenda
            </button>
          </div>
          {canRefreshWeek && occupancy.data?.coverage !== "complete" && (
            <Button
              disabled={calendarWrite.busy || refresh.inProgress}
              onClick={() =>
                refresh.start({
                  periodId: period.id,
                  reason: "manual",
                  weekStart: start,
                })
              }
            >
              Actualizar esta semana
            </Button>
          )}
          {canRefreshWeek && (
            <Button
              disabled={calendarWrite.busy}
              onClick={async () => {
                if (connection.eventTitlesAuthorized) {
                  if (
                    await calendarWrite.run({
                      method: "PUT",
                      path: "/calendar/event-titles",
                      body: { visible: !connection.eventTitlesEnabled },
                    })
                  )
                    occupancy.reload();
                  return;
                }
                const auth = await calendarWrite.run<
                  Response<"authorizeCalendar", 200>
                >({
                  path: "/calendar/authorization?eventTitles=true",
                });
                if (auth) window.location.assign(auth.authorizationUrl);
              }}
            >
              {connection.eventTitlesEnabled
                ? "Ocultar títulos de Google Calendar"
                : "Mostrar títulos de Google Calendar"}
            </Button>
          )}
          {!canRefreshWeek && (
            <a className="button" href="#/disponibilidad?calendar=manage">
              Disponibilidad y Calendar
            </a>
          )}
        </div>
      )}
      {calendar && (
        <>
          {titleConsentFailed && !connection?.eventTitlesAuthorized && (
            <Notice tone="warning" title="No se autorizó la lectura de títulos">
              Usa la misma cuenta de Google que conectaste a Calendar.
            </Notice>
          )}
          <WriteState {...calendarWrite} reload={occupancy.reload} />
          {refresh.read.error && <LoadState {...refresh.read} />}
          {refresh.inProgress && (
            <p role="status">Consultando Google Calendar…</p>
          )}
          {refresh.state === "partial" && (
            <p role="status">La consulta devolvió cobertura parcial.</p>
          )}
          {["failed", "cancelled"].includes(refresh.state ?? "") && (
            <p role="status">No se pudo actualizar la semana consultada.</p>
          )}
        </>
      )}
      {calendar &&
        (zone ? (
          occupancy.data ? (
            <OccupancyStatus data={occupancy.data} />
          ) : (
            <LoadState {...occupancy} />
          )
        ) : (
          week && (
            <Notice title="Confirma tu zona de estudio para mostrar la ocupación de Google Calendar">
              Abre Disponibilidad y Calendar para indicarla y actualizar la
              ocupación.
            </Notice>
          )
        ))}
      {canReadTitles && (events.error || events.data?.partial) && (
        <Notice
          tone="warning"
          title="Faltan algunos títulos de Google Calendar"
          action={<Button onClick={events.reload}>Reintentar títulos</Button>}
        >
          Los horarios ocupados siguen disponibles.
        </Notice>
      )}
      {calendar && calendarView === "agenda" && occupancy.data && zone && (
        <OccupancyAgenda
          data={occupancy.data}
          blocks={blocks}
          start={start}
          zone={zone}
        />
      )}
      {calendar && calendarView === "week" && week && (
        <WeeklyCalendar
          start={start}
          zone={zone}
          google={blocks}
          deadlines={week.deadlineActivityIds
            .map(visible)
            .filter((item): item is Activity => !!item && matchCourse(item))}
          sessions={week.sessions.filter((item) =>
            matchCourse(visible(item.activityId)),
          )}
          activityTitle={(id) => visible(id)?.title ?? "Actividad"}
        />
      )}
      {!data ? (
        <LoadState {...read} />
      ) : (
        <>
          {data.plan.state === "stale" && (
            <Notice
              tone="warning"
              title="La distribución necesita actualizarse"
            >
              Las sesiones mostradas son las últimas confirmadas.
            </Notice>
          )}
          {showWeek ? (
            <article className={`week-card ${week.state}`}>
              <header className="week-card-header">
                <h2>Tu horizonte semanal</h2>
                <Badge>{STATES[week.state]}</Badge>
              </header>
              {week.state === "empty" && (
                <p className="week-empty">
                  {calendar
                    ? "Sin actividades académicas ni sesiones de estudio esta semana."
                    : "Sin actividades ni sesiones esta semana."}
                </p>
              )}
              <div className="week-section obligation-section">
                <h3>Vence esta semana</h3>
                {week.deadlineActivityIds
                  .map(visible)
                  .filter(
                    (item): item is Activity => !!item && matchCourse(item),
                  )
                  .map((activity) => (
                    <a
                      className="ledger-entry obligation-entry"
                      key={activity.id}
                      href={`#/calendario/${activity.id}`}
                    >
                      <span className="entry-identity">
                        <strong className="entry-title">
                          {activity.title}
                        </strong>
                        <small>
                          {data.courses.find(
                            (item) => item.id === activity.courseId,
                          )?.name ?? "Sin curso"}{" "}
                          · {activity.effectivePriority ?? "Sin prioridad"}
                        </small>
                      </span>
                      <span className="entry-deadline">
                        {activity.dueDate} ·{" "}
                        {activity.dueTime ?? "Hora por confirmar"}
                      </span>
                      <strong className="entry-effort">
                        {minutesLabel(activity.pendingMinutes)}
                      </strong>
                    </a>
                  ))}
              </div>
              <div className="week-section obligation-section">
                <h3>Sesiones programadas</h3>
                {week.sessions
                  .filter((item) => matchCourse(visible(item.activityId)))
                  .map((item) => {
                    const activity = visible(item.activityId);
                    return (
                      <div className="surface" key={item.id}>
                        <a href={`#/calendario/${item.activityId}`}>
                          {activity?.title ?? "Actividad"}
                        </a>
                        <p>
                          {zone ? timeLabel(item.startAt, zone) : item.startAt}{" "}
                          ·{" "}
                          {minutesLabel(
                            (Date.parse(item.endAt) -
                              Date.parse(item.startAt)) /
                              60000,
                          )}
                        </p>
                        {activity && activity.dueDate >= week.endDate && (
                          <small>
                            Trabajo adelantado · vence {activity.dueDate}
                          </small>
                        )}
                        {item.kind === "group" && (
                          <p>
                            Reserva grupal{" "}
                            {item.accepted ? "aceptada" : "tentativa"}
                          </p>
                        )}
                        {calendar && item.state === "planned" && (
                          <div className="form-actions">
                            <Button
                              disabled={write.busy}
                              onClick={() =>
                                propose({
                                  kind: "fix",
                                  sessionId: item.id,
                                  revision: item.revision,
                                  fixed: !item.fixed,
                                })
                              }
                            >
                              {item.fixed ? "Liberar" : "Fijar"}
                            </Button>
                            {zone && (
                              <Button
                                disabled={write.busy}
                                onClick={() => {
                                  setFormError("");
                                  setMove({
                                    id: item.id,
                                    revision: item.revision,
                                  });
                                }}
                              >
                                Mover
                              </Button>
                            )}
                            <Button
                              disabled={write.busy}
                              onClick={() =>
                                propose({
                                  kind: "session_state",
                                  sessionId: item.id,
                                  revision: item.revision,
                                  state: "completed",
                                })
                              }
                            >
                              Completar sesión
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
              <footer className="week-card-footer">
                <button className="text-link" onClick={() => setReview(true)}>
                  Ver carga y opciones
                </button>
              </footer>
            </article>
          ) : (
            <Notice title="La semana no coincide con los filtros" />
          )}
          <div className="form-actions">
            <a className="button primary" href="#/calendario/nueva">
              Añadir actividad
            </a>
            <a className="button" href="#/importar">
              Importar actividad — PDF/Excel
            </a>
            <Button
              disabled={write.busy || !data.revision}
              onClick={() => propose({ kind: "recalculate" })}
            >
              Revisar nueva distribución
            </Button>
            {data.plan.undoAvailable && (
              <Button
                disabled={write.busy}
                onClick={() => propose({ kind: "undo" })}
              >
                Revisar deshacer
              </Button>
            )}
            {data.plan.pendingProposalId && (
              <Button
                disabled={write.busy}
                onClick={async () => {
                  try {
                    const { data: next } = await request<Proposal>(
                      endpoint(
                        `/planning-proposals/${segment(data.plan.pendingProposalId!)}`,
                      ),
                    );
                    setFormError("");
                    setConfirmations([]);
                    setProposal(next);
                  } catch (failure) {
                    if (failure instanceof ApiError && failure.status === 401)
                      expired();
                    else setFormError(apiMessage(failure));
                  }
                }}
              >
                Revisar propuesta pendiente
              </Button>
            )}
          </div>
        </>
      )}
      <WriteState {...write} reload={read.reload} />
      {!move && formError && <p role="alert">{formError}</p>}
      {review && week && (
        <Modal title="Tu carga, explicada" onClose={() => setReview(false)}>
          <p>{STATES[week.state]}</p>
          <p>
            Disponible: {minutesLabel(week.capacityMinutes)} · Estudio:{" "}
            {minutesLabel(week.studyMinutes)} · Sin ubicar:{" "}
            {minutesLabel(week.unplacedMinutes)}
          </p>
          {data?.plan.result?.diagnostics
            .filter(
              (item) =>
                !item.activityId ||
                week.deadlineActivityIds.includes(item.activityId) ||
                week.sessions.some(
                  (session) => session.activityId === item.activityId,
                ),
            )
            .map((item, i) => (
              <p key={i}>
                {item.activityId ? visible(item.activityId)?.title : "Plan"} ·{" "}
                {item.kind === "deficit"
                  ? "Horas sin ubicar"
                  : item.kind === "pending"
                    ? "Datos por confirmar"
                    : item.kind === "search_incomplete"
                      ? "Búsqueda incompleta"
                      : "Conflicto"}{" "}
                · {minutesLabel(item.minutes)}
              </p>
            ))}
        </Modal>
      )}
      {proposal && (
        <Modal title="Revisar propuesta" onClose={() => setProposal(undefined)}>
          <p>
            Antes: {proposal.before.length} sesiones. Después:{" "}
            {proposal.after.sessions.length} sesiones.
          </p>
          <p>
            {proposal.differences.added.length} nuevas ·{" "}
            {proposal.differences.removed.length} retiradas ·{" "}
            {proposal.differences.changed.length} cambiadas
          </p>
          <p>{STATES[proposal.after.state]}</p>
          <ul>
            {[
              ...new Set([
                ...proposal.differences.added,
                ...proposal.differences.removed,
                ...proposal.differences.changed,
              ]),
            ].map((id) => {
              const before = proposal.before.find((item) => item.id === id);
              const after = proposal.after.sessions.find(
                (item) => item.id === id,
              );
              const activity = visible((after ?? before)?.activityId ?? "");
              return (
                <li key={id}>
                  <strong>{activity?.title ?? "Sesión de estudio"}</strong>
                  <div className="before-after">
                    <p>
                      Antes ·{" "}
                      {before
                        ? zone
                          ? timeLabel(before.startAt, zone)
                          : before.startAt
                        : "Sin sesión"}
                    </p>
                    <span aria-hidden="true">→</span>
                    <p>
                      Después ·{" "}
                      {after
                        ? zone
                          ? timeLabel(after.startAt, zone)
                          : after.startAt
                        : "Sin sesión"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {proposal.requiredConfirmations.map((item) => (
            <label className="check-field" key={item}>
              <input
                type="checkbox"
                checked={confirmations.includes(item)}
                onChange={(event) =>
                  setConfirmations((previous) =>
                    event.target.checked
                      ? [...previous, item]
                      : previous.filter((value) => value !== item),
                  )
                }
              />
              {CONFIRM[item]}
            </label>
          ))}
          <WriteState
            {...write}
            reload={() => {
              setProposal(undefined);
              read.reload();
            }}
          />
          <Button
            variant="primary"
            disabled={
              write.busy ||
              confirmations.length !== proposal.requiredConfirmations.length
            }
            onClick={async () => {
              const result = await write.run({
                path: `/planning-proposals/${segment(proposal.id)}/apply`,
                revision: `"workspace-${proposal.workspaceRevision}"`,
                body: { confirmations },
              });
              if (result) {
                setProposal(undefined);
                read.reload();
              }
            }}
          >
            Aplicar propuesta
          </Button>
        </Modal>
      )}
      {move && zone && (
        <Modal title="Mover sesión" onClose={() => setMove(undefined)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              try {
                void propose({
                  kind: "move",
                  sessionId: move.id,
                  revision: move.revision,
                  startAt: localInstant(String(form.get("start")), zone),
                  endAt: localInstant(String(form.get("end")), zone),
                });
              } catch {
                setFormError(
                  "Selecciona una fecha y una hora válidas en tu zona.",
                );
              }
            }}
          >
            <p>Zona: {zone}</p>
            <Field label="Inicio">
              <input required type="datetime-local" name="start" />
            </Field>
            <Field label="Fin">
              <input required type="datetime-local" name="end" />
            </Field>
            {formError && <p role="alert">{formError}</p>}
            <WriteState
              {...write}
              reload={() => {
                setMove(undefined);
                read.reload();
              }}
            />
            <Button type="submit" disabled={write.busy}>
              Revisar movimiento
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
