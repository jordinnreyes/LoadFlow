import { useEffect, useState } from "react";
import { useApp } from "../state";
import {
  type Activity,
  type Session,
  NOW_DATE,
  emptyActivity,
  isEvaluation,
  isGroup,
} from "../model";
import {
  canConfirm,
  duration,
  effectivePriority,
  formatMinutes,
  intervalLabel,
  pendingEffort,
  shortDate,
  timeNumber,
} from "../rules";
import { navigate, useDirtyForm } from "../navigation";
import {
  ActivityFields,
  GroupFields,
  MinutesField,
  Suggestion,
} from "../components/ActivityForm";
import {
  Badge,
  Button,
  Field,
  Icon,
  Notice,
  PriorityBadge,
} from "../components/ui";
import type { Propose } from "../actions";

const ORIGINS = {
  manual: "Declarado por ti",
  suggested: "Sugerencia Premium aceptada",
  personalized: "Personalizada con historial",
  corrected: "Sugerencia Premium corregida por ti",
};
export default function ActivityPanel({
  selectedId,
  onPropose,
  editSession,
}: {
  selectedId: string;
  onPropose: Propose;
  editSession: (s: Session) => void;
}) {
  const { workspace, save } = useApp();
  const w = workspace!;
  const original = w.activities.find((a) => a.id === selectedId);
  const [value, setValue] = useState<Activity>(
    () => original || emptyActivity(),
  );
  const [mode, setMode] = useState<"detail" | "edit" | "progress" | "group">(
    selectedId === "nueva" ? "edit" : "detail",
  );
  const [error, setError] = useState("");
  const [real, setReal] = useState<number | null>(original?.real ?? null);
  const [remaining, setRemaining] = useState<number | null>(
    original?.remaining ?? null,
  );
  const [closePreparation, setClosePreparation] = useState(false);
  const [fulfilled, setFulfilled] = useState(original?.fulfilled || false);
  const [completedAt, setCompletedAt] = useState(original?.completedAt || "");
  const [removeFixed, setRemoveFixed] = useState(false);
  const [dateSource, setDateSource] = useState(
    "Comunicación docente (demostración)",
  );
  const dirty =
    mode === "edit" || mode === "group"
      ? original
        ? JSON.stringify(value) !== JSON.stringify(original)
        : !!value.title || !!value.date || value.effort !== null
      : mode === "progress" &&
        (real !== original?.real ||
          remaining !== original?.remaining ||
          fulfilled !== original?.fulfilled ||
          closePreparation ||
          completedAt !== original?.completedAt);
  useDirtyForm(dirty);
  useEffect(() => {
    setValue(original || emptyActivity());
    setMode(selectedId === "nueva" ? "edit" : "detail");
    setError("");
  }, [selectedId]);
  useEffect(() => {
    if (original) {
      setValue(original);
      setReal(original.real);
      setRemaining(original.remaining);
      setFulfilled(original.fulfilled);
      setCompletedAt(original.completedAt);
      setMode("detail");
      setClosePreparation(false);
    }
  }, [original]);
  const a = mode === "detail" && original ? original : value;
  const sessions = w.sessions.filter((s) => s.activityId === a.id);
  const persist = (candidate: Activity, borrador = false) => {
    setError("");
    if (!borrador && !canConfirm(candidate)) {
      setError("Confirma título, tipo y fecha válida, o guarda como borrador.");
      return;
    }
    if (
      candidate.time &&
      candidate.eventEnd &&
      timeNumber(candidate.eventEnd) <= timeNumber(candidate.time)
    ) {
      setError("La hora final de evaluación debe ser posterior a la inicial.");
      return;
    }
    if (
      candidate.effort !== null &&
      candidate.effort <= 0 &&
      !isGroup(candidate)
    ) {
      setError(
        "Para programar usa una estimación positiva o deja las horas pendientes. Cero no confirma finalización.",
      );
      return;
    }
    const changedDate =
      !!original &&
      (candidate.date !== original.date ||
        candidate.time !== original.time ||
        candidate.eventEnd !== original.eventEnd);
    const updated = { ...candidate, confirmed: !borrador };
    if (changedDate) {
      if (!dateSource.trim()) {
        setError("Indica el origen del cambio de fecha.");
        return;
      }
      updated.dateHistory = [
        ...original!.dateHistory,
        {
          before: `${original!.date} ${original!.time}–${original!.eventEnd}`,
          after: `${candidate.date} ${candidate.time}–${candidate.eventEnd}`,
          source: dateSource,
          at: new Date().toISOString(),
        },
      ];
    }
    if (borrador) {
      save({
        ...w,
        drafts: [...w.drafts.filter((x) => x.id !== updated.id), updated],
      });
      navigate("/importar", true);
      return;
    }
    const next = {
      ...w,
      activities: original
        ? w.activities.map((x) => (x.id === updated.id ? updated : x))
        : [...w.activities, updated],
      courses: [
        ...new Set([...w.courses, ...(updated.course ? [updated.course] : [])]),
      ],
    };
    onPropose(
      next,
      changedDate
        ? "Confirmar un cambio académico real"
        : original
          ? "Actualizar actividad"
          : "Añadir actividad manual",
      {
        preserveGroup: changedDate && isGroup(updated) ? updated.id : undefined,
        confirmLabel: changedDate
          ? "Confirmar fecha nueva"
          : "Confirmar cambios",
      },
    );
  };
  const progress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!original) return;
    if (completedAt && completedAt > NOW_DATE) {
      setError(
        "La fecha de finalización real no puede ser futura respecto al 2 nov. de demostración.",
      );
      return;
    }
    if (
      real !== null &&
      original.effort !== null &&
      real > original.effort &&
      !closePreparation &&
      original.preparation !== "done" &&
      remaining === null
    ) {
      setError(
        "Has superado la estimación. Declara cuánto te falta o confirma que terminaste la preparación.",
      );
      return;
    }
    const updated = {
      ...original,
      real,
      remaining,
      fulfilled,
      completedAt,
      preparation: closePreparation
        ? ("done" as const)
        : original.preparation === "done"
          ? ("done" as const)
          : real && real > 0
            ? ("progress" as const)
            : original.preparation,
      realHistory:
        real !== original.real
          ? [
              ...original.realHistory,
              {
                before: original.real,
                after: real,
                at: new Date().toISOString(),
              },
            ]
          : original.realHistory,
    };
    const next = {
      ...w,
      activities: w.activities.map((x) => (x.id === updated.id ? updated : x)),
      sessions: closePreparation
        ? w.sessions.filter(
            (s) => s.activityId !== a.id || (s.fixed && !removeFixed),
          )
        : w.sessions,
    };
    onPropose(
      next,
      closePreparation
        ? "Terminar preparación o trabajo y actualizar sesiones"
        : "Registrar progreso y horas reales",
      { immediate: true },
    );
    setMode("detail");
    setError("");
  };
  if (!original && selectedId !== "nueva")
    return (
      <aside className="activity-panel">
        <Notice title="Esta actividad todavía no está confirmada">
          Vuelve a la revisión o cancela la vista previa.
        </Notice>
        <Button onClick={() => navigate("/calendario")}>Cerrar detalle</Button>
      </aside>
    );
  return (
    <aside className="activity-panel" aria-label="Detalle de actividad">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">
            {selectedId === "nueva"
              ? "ACTIVIDAD MANUAL"
              : mode === "progress"
                ? "PROGRESO Y FINALIZACIÓN"
                : "DETALLE DE ACTIVIDAD"}
          </p>
          <h2>
            {selectedId === "nueva" ? "Añadir a mi plan" : original?.title}
          </h2>
        </div>
        <Button
          variant="ghost"
          icon="close"
          aria-label="Cerrar detalle de actividad"
          onClick={() => navigate("/calendario")}
        />
      </div>
      {mode === "detail" && original ? (
        <>
          <div className="activity-panel-body">
            <div className="detail-tags">
              <Badge tone="info">{a.course || "Sin asignar"}</Badge>
              <Badge>{a.type}</Badge>
              <PriorityBadge value={effectivePriority(a, w)} />
            </div>
            <div className="detail-deadline">
              <Icon name="calendar" />
              <div>
                <small>Fecha vigente confirmada</small>
                <strong>
                  {shortDate(a.date, true)} · {a.time || "Hora pendiente"}
                </strong>
                {a.eventEnd && (
                  <small>Evaluación fija hasta las {a.eventEnd}</small>
                )}
              </div>
            </div>
            <Button
              className="full"
              icon="sliders"
              onClick={() => setMode("edit")}
            >
              Editar datos o actualizar fecha
            </Button>
            {!isGroup(a) ? (
              <>
                <div className="detail-section">
                  <h3>Preparación o trabajo</h3>
                  <div className="detail-metrics">
                    <div>
                      <strong>
                        {a.effort === null ? "—" : formatMinutes(a.effort)}
                      </strong>
                      <small>estimación confirmada</small>
                    </div>
                    <div>
                      <strong>
                        {a.real === null ? "—" : formatMinutes(a.real)}
                      </strong>
                      <small>horas reales reportadas</small>
                    </div>
                  </div>
                  <p className="tiny muted">{ORIGINS[a.estimateOrigin]}</p>
                  <Badge
                    tone={a.preparation === "done" ? "success" : "info"}
                    icon={a.preparation === "done" ? "check" : "clock"}
                  >
                    {a.preparation === "done"
                      ? "Preparación terminada"
                      : a.preparation === "progress"
                        ? "En progreso"
                        : "No iniciada"}
                  </Badge>
                  <p>
                    Restante:{" "}
                    {pendingEffort(a) === null
                      ? "pendiente de estimar"
                      : formatMinutes(pendingEffort(a)!)}
                  </p>
                </div>
                <div className="detail-section">
                  <h3>{isEvaluation(a) ? "Evaluación" : "Entrega"}</h3>
                  <Badge tone={a.fulfilled ? "success" : "neutral"}>
                    {a.fulfilled
                      ? isEvaluation(a)
                        ? "Rendida"
                        : "Entregada"
                      : isEvaluation(a)
                        ? "Pendiente de rendir"
                        : "Pendiente de entregar"}
                  </Badge>
                  <p className="tiny muted">
                    Este estado es independiente de terminar la preparación.
                  </p>
                </div>
                <Button
                  variant="primary"
                  icon="check"
                  className="full"
                  onClick={() => {
                    setMode("progress");
                    setError("");
                  }}
                >
                  Registrar progreso
                </Button>
              </>
            ) : (
              <div className="detail-section">
                <h3>Colaboración grupal</h3>
                <Badge tone="warning" icon="group">
                  {a.groupEnabled
                    ? "Reserva tentativa"
                    : "Reservas desactivadas"}
                </Badge>
                <p>
                  {a.groupCount} reservas de {formatMinutes(a.groupDuration)}.{" "}
                  {a.groupAccepted
                    ? "Propuesta aceptada; sigue siendo tentativa."
                    : "Pendiente de revisar y aceptar."}
                </p>
                <Button className="full" onClick={() => setMode("group")}>
                  Revisar o modificar reservas
                </Button>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={a.fulfilled}
                    onChange={(e) =>
                      onPropose(
                        {
                          ...w,
                          activities: w.activities.map((x) =>
                            x.id === a.id
                              ? { ...x, fulfilled: e.target.checked }
                              : x,
                          ),
                        },
                        "Confirmar cumplimiento de entrega grupal",
                      )
                    }
                  />
                  Entrega grupal cumplida
                </label>
              </div>
            )}
            <div className="detail-section">
              <div className="row-between">
                <h3>Sesiones vinculadas</h3>
                <Badge>{sessions.length}</Badge>
              </div>
              {sessions.length ? (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    className="detail-session"
                    onClick={() => editSession(s)}
                  >
                    <Icon
                      name={s.fixed ? "lock" : s.group ? "group" : "clock"}
                      size={18}
                    />
                    <span>
                      <strong>{intervalLabel(s)}</strong>
                      <small>
                        {s.fixed
                          ? "Fijada por ti"
                          : s.group
                            ? "Reserva tentativa"
                            : "Flexible"}{" "}
                        · {formatMinutes(duration(s))}
                      </small>
                    </span>
                    <Icon name="chevron" size={16} />
                  </button>
                ))
              ) : (
                <p className="muted">Todavía no hay sesiones programadas.</p>
              )}
              <Button
                icon="refresh"
                className="full"
                onClick={() =>
                  onPropose(
                    w,
                    `Reorganizar solo las sesiones flexibles de ${a.title}`,
                    { scope: a.id },
                  )
                }
              >
                Reorganizar actividad
              </Button>
            </div>
            <details className="origin-details">
              <summary>Origen, restricciones e historial</summary>
              <p className="tiny">{a.origin}</p>
              <p className="tiny">
                Inicio: {a.startDate || "Sin confirmar"} ·{" "}
                {a.divisible === "yes"
                  ? "Divisible"
                  : a.divisible === "no"
                    ? "Indivisible"
                    : "Divisibilidad no declarada: un solo bloque"}
              </p>
              {a.dateHistory.map((h, i) => (
                <div className="history-entry" key={i}>
                  <small>Anterior: {h.before}</small>
                  <strong>Vigente al confirmar: {h.after}</strong>
                  <small>
                    {h.source} · {new Date(h.at).toLocaleString("es-PE")}
                  </small>
                </div>
              ))}
              {!a.dateHistory.length && (
                <p className="tiny muted">
                  Sin cambios académicos confirmados.
                </p>
              )}
              {a.realHistory.map((h, i) => (
                <p className="tiny" key={`r-${i}`}>
                  Corrección de horas acumuladas:{" "}
                  {h.before === null ? "sin dato" : formatMinutes(h.before)} →{" "}
                  {h.after === null ? "sin dato" : formatMinutes(h.after)}
                </p>
              ))}
            </details>
          </div>
        </>
      ) : (
        <div className="activity-panel-body">
          {error && <Notice title={error} tone="danger" />}
          {mode === "edit" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                persist(value);
              }}
            >
              <ActivityFields value={value} onChange={setValue} workspace={w} />
              {original && (
                <Field label="Origen del cambio académico (si cambia la fecha)">
                  <input
                    value={dateSource}
                    onChange={(e) => setDateSource(e.target.value)}
                  />
                </Field>
              )}
              <Suggestion
                activity={value}
                workspace={w}
                accept={(effort, personal) =>
                  setValue({
                    ...value,
                    effort,
                    estimateOrigin: personal ? "personalized" : "suggested",
                  })
                }
              />
              <div className="form-actions">
                {original ? (
                  <Button
                    onClick={() => {
                      setValue(original);
                      setMode("detail");
                      setError("");
                    }}
                  >
                    Cancelar edición
                  </Button>
                ) : (
                  <Button onClick={() => persist(value, true)}>
                    Guardar borrador
                  </Button>
                )}
                <Button variant="primary" type="submit">
                  Revisar cambios
                </Button>
              </div>
            </form>
          )}
          {mode === "group" && (
            <>
              <GroupFields value={value} onChange={setValue} workspace={w} />
              <div className="form-actions">
                <Button onClick={() => setMode("detail")}>Cancelar</Button>
                <Button
                  variant="primary"
                  onClick={() => persist({ ...value, groupAccepted: true })}
                >
                  {value.groupEnabled
                    ? "Aceptar reservas tentativas"
                    : "Desactivar reservas"}
                </Button>
              </div>
            </>
          )}
          {mode === "progress" && (
            <form onSubmit={progress}>
              <Notice title="Puedes registrar tiempo antes del plazo">
                Las horas son opcionales y no se infieren del calendario. Al
                corregirlas, el total reemplaza al anterior.
              </Notice>
              <MinutesField
                label="Horas reales acumuladas (opcional)"
                value={real}
                onChange={setReal}
              />
              <p className="tiny muted">
                Total anterior:{" "}
                {original?.real === null
                  ? "sin registrar"
                  : formatMinutes(original?.real || 0)}
              </p>
              <MinutesField
                label="Tiempo que te falta (opcional)"
                value={remaining}
                onChange={setRemaining}
              />
              <Field label="Fecha efectiva de finalización (opcional)">
                <input
                  type="date"
                  max={NOW_DATE}
                  value={completedAt}
                  onChange={(e) => setCompletedAt(e.target.value)}
                />
              </Field>
              {original?.preparation !== "done" && (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={closePreparation}
                    onChange={(e) => setClosePreparation(e.target.checked)}
                  />
                  {isEvaluation(a)
                    ? "Terminé de prepararme"
                    : "Terminé el trabajo"}
                </label>
              )}
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={fulfilled}
                  onChange={(e) => setFulfilled(e.target.checked)}
                />
                {isEvaluation(a)
                  ? "Ya rendí la evaluación"
                  : "Ya cumplí la entrega"}
              </label>
              {closePreparation && (
                <>
                  <Notice
                    tone="warning"
                    title="Se cancelarán solo las sesiones futuras flexibles"
                  >
                    La evaluación o entrega conserva su estado independiente.
                    Las sesiones fijadas se mantendrán salvo que autorices
                    retirarlas.
                  </Notice>
                  {sessions.some((s) => s.fixed) && (
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={removeFixed}
                        onChange={(e) => setRemoveFixed(e.target.checked)}
                      />
                      También autorizo retirar mis sesiones fijadas futuras de
                      esta actividad
                    </label>
                  )}
                </>
              )}
              <div className="form-actions">
                <Button
                  onClick={() => {
                    setMode("detail");
                    setError("");
                  }}
                >
                  Cancelar
                </Button>
                <Button variant="primary" type="submit">
                  {closePreparation
                    ? "Confirmar preparación terminada"
                    : "Guardar progreso"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </aside>
  );
}
