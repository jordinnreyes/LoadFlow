import { type Workspace } from "../model";
import {
  duration,
  formatMinutes,
  intervalLabel,
  sourceIncomplete,
} from "../rules";
import { Badge, Button, Empty, Icon, Modal, Notice } from "../components/ui";
import { navigate } from "../navigation";

export default function ChangesPanel({
  before,
  after,
  title,
  mode,
  blocked,
  confirmLabel,
  onApply,
  onClose,
  onUndo,
}: {
  before: Workspace;
  after: Workspace;
  title: string;
  mode: "preview" | "explain" | "undo";
  blocked?: string[];
  confirmLabel?: string;
  onApply?: () => void;
  onClose: () => void;
  onUndo?: () => void;
}) {
  const ids = [
    ...new Set([
      ...before.sessions.map((s) => s.activityId),
      ...after.sessions.map((s) => s.activityId),
    ]),
  ];
  const changes = ids.filter(
    (id) =>
      JSON.stringify(before.sessions.filter((s) => s.activityId === id)) !==
      JSON.stringify(after.sessions.filter((s) => s.activityId === id)),
  );
  const changedDates = after.activities.filter((a) => {
    const old = before.activities.find((x) => x.id === a.id);
    return (
      old &&
      (old.date !== a.date ||
        old.time !== a.time ||
        old.eventEnd !== a.eventEnd)
    );
  });
  const deficit = after.issues
    .filter((i) => i.kind !== "pending")
    .reduce((sum, i) => sum + i.minutes, 0);
  return (
    <Modal
      title={title}
      eyebrow={
        mode === "explain"
          ? "PLAN ACTIVO · EXPLICACIÓN"
          : mode === "undo"
            ? "REVALIDACIÓN DE DISTRIBUCIÓN ANTERIOR"
            : "VISTA PREVIA · AÚN SIN APLICAR"
      }
      onClose={onClose}
      wide
    >
      <div className="change-summary">
        <div>
          <strong>{after.sessions.length}</strong>
          <small>sesiones en el resultado</small>
        </div>
        <div>
          <strong>
            {formatMinutes(
              after.sessions.reduce((sum, s) => sum + duration(s), 0),
            )}
          </strong>
          <small>programadas, incluidas tentativas</small>
        </div>
        <div>
          <strong>{formatMinutes(deficit)}</strong>
          <small>sin ubicar o en conflicto</small>
        </div>
      </div>
      {changedDates.map((a) => {
        const old = before.activities.find((x) => x.id === a.id)!;
        return (
          <div className="academic-comparison" key={a.id}>
            <h3>{a.title}</h3>
            <div className="before-after">
              <div>
                <Badge>Fecha vigente</Badge>
                <strong>
                  {old.date} · {old.time || "sin hora"}
                  {old.eventEnd ? `–${old.eventEnd}` : ""}
                </strong>
              </div>
              <Icon name="arrow" />
              <div>
                <Badge tone="info">Nueva propuesta</Badge>
                <strong>
                  {a.date} · {a.time || "sin hora"}
                  {a.eventEnd ? `–${a.eventEnd}` : ""}
                </strong>
              </div>
            </div>
            <p className="tiny">
              Origen: {a.dateHistory.at(-1)?.source || a.origin}. Se conserva la
              fecha anterior, el progreso y las horas reales. Solo la nueva
              confirmada se usará al aplicar.
            </p>
          </div>
        );
      })}
      {!!blocked?.length && (
        <Notice
          tone="danger"
          title="No se puede restaurar la distribución anterior"
        >
          {blocked.map((message, i) => (
            <p key={i}>{message}</p>
          ))}
          El plan vigente se conserva; no se aplicarán bloques incompatibles.
        </Notice>
      )}
      {sourceIncomplete(after) && (
        <Notice
          tone="warning"
          title="La ocupación de Calendar no está actualizada"
        >
          El resultado sigue siendo parcial. Actualiza o confirma cobertura
          manual antes de afirmar viabilidad.
        </Notice>
      )}
      {!!after.issues.length && (
        <div className="issues-list">
          <h3>Lo que requiere atención</h3>
          {after.issues.map((i, index) => {
            const a = after.activities.find((a) => a.id === i.activityId);
            return (
              <div className={`issue-row ${i.kind}`} key={index}>
                <Icon name={i.kind === "pending" ? "info" : "warning"} />
                <div>
                  <strong>{a?.title || "Actividad"}</strong>
                  <p>{i.message}</p>
                  <small>
                    Plazo: {a?.date} · {a?.time || "hora pendiente"}
                    {i.minutes ? ` · ${formatMinutes(i.minutes)}` : ""}
                  </small>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    onClose();
                    navigate(`/calendario/${i.activityId}`);
                  }}
                >
                  Ver actividad
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {mode === "explain" && (
        <div className="form-actions">
          <Button
            icon="clock"
            onClick={() => {
              onClose();
              navigate("/disponibilidad");
            }}
          >
            Revisar disponibilidad
          </Button>
          <Button
            icon="sliders"
            onClick={() => {
              onClose();
              navigate("/prioridades");
            }}
          >
            Revisar prioridades
          </Button>
        </div>
      )}
      {!!changes.length && (
        <div className="changes-list">
          <h3>Qué cambia en las sesiones</h3>
          {changes.map((id) => (
            <div className="change-activity" key={id}>
              <strong>
                {after.activities.find((a) => a.id === id)?.title ||
                  before.activities.find((a) => a.id === id)?.title}
              </strong>
              <div className="before-after">
                <div>
                  <span className="before-after-label">Antes</span>
                  {before.sessions
                    .filter((s) => s.activityId === id)
                    .map((s) => (
                      <p key={s.id}>
                        {intervalLabel(s)} {s.fixed ? "· Fijada" : ""}
                      </p>
                    ))}
                  {!before.sessions.some((s) => s.activityId === id) && (
                    <p>Sin sesiones</p>
                  )}
                </div>
                <Icon name="arrow" />
                <div>
                  <span className="before-after-label">Después</span>
                  {after.sessions
                    .filter((s) => s.activityId === id)
                    .map((s) => (
                      <p key={s.id}>
                        {intervalLabel(s)} {s.fixed ? "· Fijada" : ""}
                        {s.group ? "· Tentativa" : ""}
                      </p>
                    ))}
                  {!after.sessions.some((s) => s.activityId === id) && (
                    <p>Sin sesiones</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!after.issues.length && !changes.length && !changedDates.length && (
        <Empty
          title={
            mode === "explain"
              ? "Las sesiones caben según los datos confirmados"
              : "No cambian las ubicaciones"
          }
        >
          El cálculo usa ventanas autorizadas, fechas vigentes, prioridades y
          restricciones. Las horas siguen siendo estimaciones.
        </Empty>
      )}
      {mode !== "explain" && (
        <Notice title="Solo se aplicarán los cambios que confirmes">
          Las sesiones fijadas se conservan o se muestran en conflicto. Un
          resultado parcial mantiene visibles las horas que no caben; no
          modifica fechas oficiales para resolverlas.
        </Notice>
      )}
      <div className="modal-footer">
        <Button onClick={onClose}>
          {mode === "explain" ? "Volver a mi plan" : "Conservar plan vigente"}
        </Button>
        {mode === "explain" && onUndo && before.previousSessions && (
          <Button icon="undo" onClick={onUndo}>
            Deshacer última reorganización
          </Button>
        )}
        {onApply && (
          <Button
            variant="primary"
            icon="check"
            onClick={onApply}
            disabled={!!blocked?.length}
          >
            {confirmLabel ||
              (mode === "undo"
                ? "Restaurar distribución"
                : "Confirmar cambios")}
          </Button>
        )}
      </div>
    </Modal>
  );
}
