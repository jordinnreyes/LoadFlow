import { useState, type FormEvent } from "react";
import {
  academics,
  activityPath,
  segment,
  type Activity,
  type Course,
  type CreateActivity,
  type Progress,
  type UpdateActivity,
} from "../../api/academic";
import { endpoint, request, type Response } from "../../api/client";
import { useRead } from "../../api/useRead";
import { useWrite } from "../../api/useWrite";
import {
  Badge,
  Button,
  Field,
  Modal,
  Notice,
  SectionHeading,
} from "../../components/ui";
import { TYPES } from "../../model";
import { ConnectedEstimate } from "./ConnectedEstimate";
import { ConnectedGroup } from "./ConnectedGroup";
import {
  localInstant,
  LoadState,
  minutesLabel,
  WriteState,
  type Screen,
} from "./shared";

type DateProposal = Response<"previewAcademicDateChange", 201>;
const text = (form: FormData, field: string) =>
  String(form.get(field) ?? "").trim();
const nullable = (form: FormData, field: string) => text(form, field) || null;
const number = (form: FormData, field: string) =>
  text(form, field) === "" ? null : Number(form.get(field));

export function ConnectedActivity({
  screen,
  id,
}: {
  screen: Screen;
  id?: string;
}) {
  const proposalId = new URLSearchParams(
    window.location.hash.split("?")[1],
  ).get("propuesta");
  const read = useRead(
    `${screen.period.id}:${id ?? "new"}:${proposalId ?? ""}`,
    async (signal) => {
      const [courses, activity, proposal] = await Promise.all([
        academics.courses(screen.period.id, signal),
        id ? academics.activity(id, signal) : null,
        id && proposalId
          ? request<DateProposal>(
              endpoint(`/plan-proposals/${segment(proposalId)}`),
              { signal },
            )
          : null,
      ]);
      return {
        courses,
        activity: activity?.data,
        initialProposal:
          proposal?.data.activityId === id && !proposal?.data.applied
            ? proposal?.data
            : undefined,
      };
    },
    screen.expired,
  );
  if (!read.data) return <LoadState {...read} />;
  return (
    <ActivityFields
      key={`${id ?? "new"}:${read.data.activity?.revision ?? 0}`}
      screen={screen}
      {...read.data}
      reload={read.reload}
    />
  );
}

function ActivityFields({
  screen,
  activity,
  courses,
  initialProposal,
  reload,
}: {
  screen: Screen;
  activity?: Activity;
  courses: Course[];
  initialProposal?: DateProposal;
  reload: () => void;
}) {
  const write = useWrite(screen.session, screen.expired);
  const [view, setView] = useState<"detail" | "edit" | "progress" | "date">(
    activity ? "detail" : "edit",
  );
  const [dateProposal, setDateProposal] = useState(initialProposal);
  const [inputError, setInputError] = useState("");
  const [type, setType] = useState<CreateActivity["type"]>(
    activity?.type ?? "Tarea",
  );
  const revision = activity ? `"activity-${activity.revision}"` : null;
  const path = activity ? activityPath(activity.id) : "/activities";
  const zone = activity?.timezone ?? screen.zone;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setInputError("");
    if (view === "progress" && activity) {
      const progress: Progress = {
        realTotalMinutes: number(form, "actual"),
        remainingMinutes: number(form, "remaining"),
        effectiveCompletionDate: nullable(form, "completed"),
        preparationState: text(
          form,
          "preparation",
        ) as Progress["preparationState"],
        fulfillmentState: text(
          form,
          "fulfillment",
        ) as Progress["fulfillmentState"],
        reopenPreparation: form.has("reopen"),
      };
      if (
        await write.run({
          method: "PUT",
          path: `${path}/progress`,
          revision,
          body: progress,
        })
      )
        reload();
      return;
    }
    if (view === "date" && activity) {
      try {
        const evaluationEnd = nullable(form, "evaluationEnd");
        const next = await write.run<DateProposal>({
          path: `${path}/date-change-proposals`,
          revision,
          body: {
            dueDate: text(form, "date"),
            dueTime: nullable(form, "time"),
            timezone: zone,
            ...(evaluationEnd && zone
              ? { evaluationEndAt: localInstant(evaluationEnd, zone) }
              : {}),
            source: { kind: "manual" },
          },
        });
        if (next) setDateProposal(next);
      } catch {
        setInputError("Revisa el horario de la evaluación.");
      }
      return;
    }
    const body: UpdateActivity = {
      title: text(form, "title"),
      type,
      courseId: nullable(form, "course"),
      description: text(form, "description"),
      priorityMode:
        text(form, "priority") === "none"
          ? "none"
          : text(form, "priority") === "inherit"
            ? "inherit"
            : "override",
      priorityOverride: ["inherit", "none"].includes(text(form, "priority"))
        ? null
        : (nullable(form, "priority") as UpdateActivity["priorityOverride"]),
    };
    const effort = type === "Entrega grupal" ? null : number(form, "effort");
    if (effort !== activity?.operatingMinutes) body.operatingMinutes = effort;
    if (activity) {
      if (await write.run({ path, method: "PATCH", revision, body })) reload();
    } else {
      try {
        const evaluationEnd = nullable(form, "evaluationEnd");
        const start = nullable(form, "start");
        const created = await write.run<Activity>({
          path,
          body: {
            ...body,
            periodId: screen.period.id,
            dueDate: text(form, "date"),
            dueTime: nullable(form, "time"),
            timezone: zone,
            divisibility: text(form, "divisibility"),
            ...(evaluationEnd && zone
              ? { evaluationEndAt: localInstant(evaluationEnd, zone) }
              : {}),
            ...(start && zone
              ? { allowedStartAt: localInstant(start, zone) }
              : {}),
          },
        });
        if (created) window.location.hash = `/calendario/${created.id}`;
      } catch {
        setInputError("Revisa las fechas y horas en tu zona de estudio.");
      }
    }
  }
  return (
    <>
      <SectionHeading
        eyebrow="ACTIVIDAD"
        title={activity?.title ?? "Añadir actividad"}
        actions={
          <a className="button" href="#/calendario">
            Volver al calendario
          </a>
        }
      />
      {activity && (
        <div className="surface">
          <p>
            {activity.dueDate} · {activity.dueTime ?? "Hora por confirmar"}
          </p>
          <p>
            Estimación: {minutesLabel(activity.operatingMinutes)} · Real:{" "}
            {minutesLabel(activity.realTotalMinutes)} · Restante:{" "}
            {minutesLabel(activity.pendingMinutes)}
          </p>
          <Badge>{activity.effectivePriority ?? "Sin prioridad"}</Badge>
          <p>{activity.description}</p>
          <div className="form-actions">
            <Button onClick={() => setView("edit")}>Editar datos</Button>
            <Button onClick={() => setView("date")}>Actualizar fecha</Button>
            <Button onClick={() => setView("progress")}>
              Registrar progreso
            </Button>
          </div>
        </div>
      )}
      {activity && view === "detail" && (
        <ConnectedEstimate
          screen={screen}
          activity={activity}
          reload={reload}
        />
      )}
      {activity?.type === "Entrega grupal" && view === "detail" && (
        <ConnectedGroup screen={screen} activity={activity} reload={reload} />
      )}
      {view !== "detail" && (
        <form className="surface" onSubmit={save} key={view}>
          {view === "edit" && (
            <>
              <Field label="Título de la actividad">
                <input
                  name="title"
                  required
                  maxLength={200}
                  defaultValue={activity?.title}
                />
              </Field>
              <Field label="Tipo de actividad">
                <select
                  value={type}
                  onChange={(e) =>
                    setType(e.target.value as CreateActivity["type"])
                  }
                >
                  {TYPES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Curso">
                <select name="course" defaultValue={activity?.courseId ?? ""}>
                  <option value="">Sin curso</option>
                  {courses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Descripción">
                <textarea
                  name="description"
                  maxLength={10000}
                  defaultValue={activity?.description}
                />
              </Field>
              {type !== "Entrega grupal" && (
                <Field label="Esfuerzo estimado (minutos)">
                  <input
                    name="effort"
                    type="number"
                    min={0}
                    defaultValue={activity?.operatingMinutes ?? ""}
                  />
                </Field>
              )}
              <Field label="Prioridad">
                <select
                  name="priority"
                  defaultValue={
                    activity?.priorityMode === "none"
                      ? "none"
                      : (activity?.priorityOverride ?? "inherit")
                  }
                >
                  <option value="inherit">Usar la prioridad del curso</option>
                  <option value="none">Sin prioridad</option>
                  <option>Alta</option>
                  <option>Media</option>
                  <option>Baja</option>
                </select>
              </Field>
              {!activity && (
                <>
                  {zone && (
                    <Field label="Inicio permitido">
                      <input name="start" type="datetime-local" />
                    </Field>
                  )}
                  <Field label="Divisibilidad">
                    <select name="divisibility">
                      <option value="unknown">Por confirmar</option>
                      <option value="divisible">Divisible</option>
                      <option value="indivisible">Un solo bloque</option>
                    </select>
                  </Field>
                </>
              )}
            </>
          )}
          {(view === "date" || !activity) && (
            <>
              <Field label="Fecha límite">
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={activity?.dueDate}
                />
              </Field>
              <Field label="Hora límite">
                <input
                  name="time"
                  type="time"
                  defaultValue={activity?.dueTime?.slice(0, 5)}
                />
              </Field>
              {zone ? (
                <Field label="Fin de evaluación (si corresponde)">
                  <input name="evaluationEnd" type="datetime-local" />
                </Field>
              ) : (
                <Notice title="Configura tu zona de estudio en Ajustes" />
              )}
            </>
          )}
          {view === "progress" && activity && (
            <>
              <Field label="Tiempo real acumulado (minutos)">
                <input
                  name="actual"
                  type="number"
                  min={0}
                  defaultValue={activity.realTotalMinutes ?? ""}
                />
              </Field>
              <Field label="Tiempo restante (minutos)">
                <input
                  name="remaining"
                  type="number"
                  min={0}
                  defaultValue={activity.remainingMinutes ?? ""}
                />
              </Field>
              <Field label="Fecha de finalización">
                <input
                  name="completed"
                  type="date"
                  defaultValue={activity.effectiveCompletionDate ?? ""}
                />
              </Field>
              <Field label="Preparación">
                <select
                  name="preparation"
                  defaultValue={activity.preparationState}
                >
                  <option value="new">Sin empezar</option>
                  <option value="progress">En progreso</option>
                  <option value="done">Terminada</option>
                </select>
              </Field>
              <Field label="Cumplimiento">
                <select
                  name="fulfillment"
                  defaultValue={activity.fulfillmentState}
                >
                  <option value="pending">Pendiente</option>
                  <option value="fulfilled">Cumplida</option>
                </select>
              </Field>
              {activity.preparationState === "done" && (
                <label className="check-field">
                  <input type="checkbox" name="reopen" />
                  Confirmo reabrir la preparación si cambio su estado
                </label>
              )}
            </>
          )}
          {inputError && <p role="alert">{inputError}</p>}
          <WriteState {...write} reload={reload} />
          <Button type="submit" variant="primary" disabled={write.busy}>
            {view === "date" ? "Revisar cambio" : "Guardar"}
          </Button>
        </form>
      )}
      {dateProposal && (
        <Modal
          title="Confirmar fecha académica"
          onClose={() => setDateProposal(undefined)}
        >
          <p>Revisa el cambio antes de aplicarlo al plan.</p>
          <div className="before-after">
            <p>
              <strong>Fecha vigente</strong>
              <br />
              {dateProposal.before.dueDate} ·{" "}
              {dateProposal.before.dueTime ?? "Hora por confirmar"}
            </p>
            <span aria-hidden="true">→</span>
            <p>
              <strong>Fecha propuesta</strong>
              <br />
              {dateProposal.after.dueDate} ·{" "}
              {dateProposal.after.dueTime ?? "Hora por confirmar"}
            </p>
          </div>
          <WriteState {...write} reload={reload} />
          <Button
            disabled={write.busy}
            onClick={async () => {
              if (
                await write.run({
                  path: `/plan-proposals/${segment(dateProposal.id)}/apply`,
                  revision: `"workspace-${dateProposal.baseWorkspaceRevision}"`,
                  body: { confirmations: ["academic_date_change"] },
                })
              )
                reload();
            }}
          >
            Confirmar fecha nueva
          </Button>
        </Modal>
      )}
    </>
  );
}
