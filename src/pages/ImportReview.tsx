import { useEffect, useRef, useState } from "react";
import { useApp } from "../state";
import {
  type Activity,
  NOW_DATE,
  PRIORITIES,
  TYPES,
  isEvaluation,
} from "../model";
import { importExamples } from "../demo";
import { canConfirm, effectivePriority, timeNumber } from "../rules";
import { navigate } from "../navigation";
import { MinutesField, Suggestion } from "../components/ActivityForm";
import {
  Badge,
  Button,
  Field,
  Icon,
  Notice,
  SectionHeading,
} from "../components/ui";
import type { Propose } from "../actions";

export default function ImportReview({ onPropose }: { onPropose: Propose }) {
  const { workspace, save } = useApp();
  const w = workspace!;
  const rows = w.drafts;
  const [file, setFile] = useState(rows[0]?.origin.split(" · ")[0] || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>(rows.map((r) => r.id));
  const [expanded, setExpanded] = useState<string[]>([]);
  const [duplicateChoice, setDuplicateChoice] = useState<
    Record<string, string>
  >({});
  const [discard, setDiscard] = useState<Activity | null>(null);
  const table = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const load = (kind: "excel" | "pdf" | "missing" | "updated") => {
    if (
      rows.length &&
      !window.confirm(
        "Este ejemplo reemplazará los borradores del lote actual. Las actividades confirmadas se conservan. ¿Continuar?",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    const name =
      kind === "pdf"
        ? "Enunciado de ejemplo.pdf"
        : kind === "updated"
          ? "Cronograma actualizado.pdf"
          : "Evaluaciones de ejemplo.xlsx";
    setFile(name);
    timer.current = window.setTimeout(() => {
      const drafts = importExamples(kind);
      save({ ...w, drafts });
      setSelected(drafts.map((a) => a.id));
      setBusy(false);
    }, 450);
  };
  const update = (a: Activity) =>
    save({ ...w, drafts: rows.map((x) => (x.id === a.id ? a : x)) });
  const match = (a: Activity) =>
    w.activities.find(
      (x) => x.id === a.id || (x.title === a.title && x.course === a.course),
    );
  const confirm = () => {
    setMessage("");
    const invalid = table.current?.querySelector<HTMLInputElement>(
      "input:invalid, select:invalid, textarea:invalid",
    );
    if (invalid) {
      invalid.reportValidity();
      setMessage(
        "Revisa el campo inválido antes de confirmar. Tus actividades aún no cambiaron.",
      );
      return;
    }
    const picked = rows.filter((a) => selected.includes(a.id));
    if (!picked.length) {
      setMessage("Selecciona al menos una fila para confirmar.");
      return;
    }
    if (picked.some((a) => !canConfirm(a))) {
      setMessage(
        "Hay filas seleccionadas sin título o fecha válida. Desmárcalas para confirmar las demás; sus borradores se conservan.",
      );
      return;
    }
    if (picked.some((a) => a.effort !== null && a.effort <= 0)) {
      setMessage(
        "Las horas estimadas deben ser positivas o quedar pendientes.",
      );
      return;
    }
    if (
      picked.some(
        (a) =>
          a.time && a.eventEnd && timeNumber(a.eventEnd) <= timeNumber(a.time),
      )
    ) {
      setMessage(
        "Revisa los intervalos: la hora final de una evaluación debe ser posterior a la inicial.",
      );
      return;
    }
    if (picked.some((a) => match(a) && !duplicateChoice[a.id])) {
      setMessage(
        "Revisa las coincidencias y elige actualizar, mantener lo vigente o crear una actividad distinta.",
      );
      return;
    }
    let activities = [...w.activities];
    let changedDate = false;
    const acceptedIds: string[] = [];
    for (const row of picked) {
      const old = match(row);
      const choice = duplicateChoice[row.id];
      if (old && choice === "keep") continue;
      let next = { ...row, confirmed: true };
      if (old && choice === "update") {
        const changed =
          old.date !== row.date ||
          old.time !== row.time ||
          old.eventEnd !== row.eventEnd;
        changedDate = changedDate || changed;
        // Source updates preserve manually confirmed effort, priority and progress unless explicitly edited here.
        next = {
          ...old,
          ...row,
          id: old.id,
          effort: row.effort ?? old.effort,
          real: old.real,
          remaining: old.remaining,
          preparation: old.preparation,
          fulfilled: old.fulfilled,
          realHistory: old.realHistory,
          priority: row.priority === "inherit" ? old.priority : row.priority,
          confirmed: true,
          dateHistory: changed
            ? [
                ...old.dateHistory,
                {
                  before: `${old.date} ${old.time}`,
                  after: `${row.date} ${row.time}`,
                  source: row.origin,
                  at: new Date().toISOString(),
                },
              ]
            : old.dateHistory,
        };
        activities = activities.map((a) => (a.id === old.id ? next : a));
      } else {
        if (old) next = { ...next, id: crypto.randomUUID() };
        activities.push(next);
      }
      acceptedIds.push(next.id);
    }
    const next = {
      ...w,
      activities,
      drafts: rows.filter((a) => !selected.includes(a.id)),
      courses: [
        ...new Set([
          ...w.courses,
          ...picked.map((a) => a.course).filter(Boolean),
        ]),
      ],
      documents: [
        ...w.documents,
        {
          id: crypto.randomUUID(),
          name: file || "Lote de demostración",
          activityIds: acceptedIds,
        },
      ],
    };
    onPropose(
      next,
      changedDate
        ? "Confirmar nueva fecha desde documento actualizado"
        : "Confirmar actividades del lote de demostración",
      {
        immediate: !changedDate,
        confirmLabel: changedDate
          ? "Confirmar fecha nueva"
          : "Confirmar actividades",
      },
    );
    if (!changedDate) navigate("/tablero");
  };
  return (
    <>
      <SectionHeading
        eyebrow="CAPTURA Y REVISIÓN"
        title="De tu cronograma a tu plan"
        actions={
          <Badge tone="info" icon="file">
            Importación gratuita
          </Badge>
        }
      >
        Revisa cada actividad y confirma las horas que necesitas para
        prepararte.
      </SectionHeading>
      <Notice title="Extracción simulada con datos de demostración">
        Los ejemplos usan un conjunto fijo de actividades ficticias. No leemos
        ni interpretamos documentos arbitrarios; los archivos elegidos no salen
        de tu navegador.
      </Notice>
      <div className="import-steps">
        <span className={rows.length ? "done" : "current"}>
          <i>{rows.length ? "✓" : "1"}</i>Elegir ejemplo
        </span>
        <div />
        <span className={rows.length ? "current" : ""}>
          <i>2</i>Revisar y completar
        </span>
        <div />
        <span>
          <i>3</i>Confirmar y planificar
        </span>
      </div>
      <section className="upload-panel">
        <span className="upload-icon">
          <Icon name="upload" size={28} />
        </span>
        <div>
          <h2>{file || "Elige un archivo de ejemplo"}</h2>
          <p>
            {busy
              ? "Preparando extracción de demostración…"
              : "PDF o Excel (.xlsx) · sin procesamiento real"}
          </p>
        </div>
        <label className="button secondary file-picker">
          <Icon name="file" />
          Elegir archivo local
          <input
            type="file"
            accept=".pdf,.xlsx"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (!picked) return;
              setFile(picked.name);
              setMessage(
                /\.(pdf|xlsx)$/i.test(picked.name)
                  ? "Archivo seleccionado, pero no interpretado. Elige explícitamente un ejemplo de abajo para cargar datos ficticios, o añade actividades manualmente."
                  : "Este prototipo solo representa PDF y .xlsx. Puedes crear las actividades manualmente.",
              );
              e.target.value = "";
            }}
          />
        </label>
      </section>
      <div className="sample-options">
        <Button icon="file" onClick={() => load("excel")} disabled={busy}>
          Excel · 5 PC + 2 exámenes
        </Button>
        <Button icon="file" onClick={() => load("pdf")} disabled={busy}>
          PDF · enunciado
        </Button>
        <Button onClick={() => load("missing")} disabled={busy}>
          Datos incompletos
        </Button>
        <Button onClick={() => load("updated")} disabled={busy}>
          Versión con fecha nueva
        </Button>
        <Button
          onClick={() => {
            setMessage(
              "Ejemplo ilegible: no se detectaron actividades. Las filas ya guardadas se conservan. Puedes reintentar con otro ejemplo o registrar actividades manualmente.",
            );
          }}
        >
          Simular archivo ilegible
        </Button>
      </div>
      {busy && (
        <div className="loading-block" role="status">
          <span className="spinner" />
          Preparando filas de ejemplo…
        </div>
      )}
      {message && (
        <div role="status">
          <Notice
            tone="warning"
            title={message}
            action={
              <Button onClick={() => navigate("/calendario/nueva")}>
                Ingreso manual
              </Button>
            }
          />
        </div>
      )}
      {!busy && rows.length > 0 && (
        <>
          <div className="review-toolbar">
            <div>
              <h2>
                {rows.length} actividades detectadas{" "}
                <Badge tone="neutral">Datos ficticios</Badge>
              </h2>
              <p>
                {rows.filter((a) => a.effort === null).length} sin horas ·{" "}
                {rows.filter((a) => !canConfirm(a)).length} sin datos mínimos ·{" "}
                {selected.length} seleccionadas
              </p>
            </div>
            <Button
              onClick={() =>
                setSelected(rows.filter(canConfirm).map((a) => a.id))
              }
            >
              Seleccionar confirmables
            </Button>
          </div>
          <div className="batch-actions">
            <label className="check-field">
              <input
                type="checkbox"
                checked={selected.length === rows.length}
                onChange={(e) =>
                  setSelected(e.target.checked ? rows.map((a) => a.id) : [])
                }
              />
              Seleccionar todas
            </label>
            <Button
              variant="ghost"
              onClick={() =>
                save({
                  ...w,
                  drafts: rows.map((a) =>
                    selected.includes(a.id) ? { ...a, startDate: NOW_DATE } : a,
                  ),
                })
              }
            >
              Permitir inicio hoy a seleccionadas
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                save({
                  ...w,
                  drafts: rows.map((a) =>
                    selected.includes(a.id) ? { ...a, divisible: "yes" } : a,
                  ),
                })
              }
            >
              Marcar divisibles seleccionadas
            </Button>
          </div>
          <div className="review-table" ref={table}>
            <div className="review-table-head">
              <span />
              <span>Actividad y curso</span>
              <span>Tipo</span>
              <span>Fecha y hora</span>
              <span>Horas de preparación</span>
              <span>Prioridad</span>
              <span />
            </div>
            {rows.map((a, index) => {
              const found = match(a);
              const open = expanded.includes(a.id);
              return (
                <article className="review-record" key={a.id}>
                  <div className="review-card-labels" aria-hidden="true">
                    <span>
                      <Icon name="book" size={14} />
                      {a.course || "Sin curso"}
                    </span>
                    <span>{a.type}</span>
                  </div>
                  <div className="review-row">
                    <label className="row-checkbox">
                      <span className="sr-only">
                        Seleccionar {a.title || `fila ${index + 1}`}
                      </span>
                      <input
                        type="checkbox"
                        checked={selected.includes(a.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, a.id]
                              : selected.filter((id) => id !== a.id),
                          )
                        }
                      />
                    </label>
                    <div>
                      <label className="cell-field">
                        <span className="sr-only">Título fila {index + 1}</span>
                        <input
                          value={a.title}
                          onChange={(e) =>
                            update({ ...a, title: e.target.value })
                          }
                        />
                      </label>
                      <label className="cell-field">
                        <span className="sr-only">Curso fila {index + 1}</span>
                        <input
                          value={a.course}
                          placeholder="Sin asignar"
                          onChange={(e) =>
                            update({ ...a, course: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <Field label={`Tipo fila ${index + 1}`}>
                      <select
                        value={a.type}
                        onChange={(e) =>
                          update({
                            ...a,
                            type: e.target.value as Activity["type"],
                          })
                        }
                      >
                        {TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                    <div>
                      <Field label={`Fecha fila ${index + 1}`}>
                        <input
                          type="date"
                          value={a.date}
                          onChange={(e) =>
                            update({ ...a, date: e.target.value })
                          }
                        />
                      </Field>
                      <Field label={`Hora fila ${index + 1}`}>
                        <input
                          type="time"
                          value={a.time}
                          onChange={(e) =>
                            update({ ...a, time: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                    <MinutesField
                      label={`Horas fila ${index + 1}`}
                      value={a.effort}
                      onChange={(effort) =>
                        update({
                          ...a,
                          effort,
                          estimateOrigin:
                            a.estimateOrigin === "manual"
                              ? "manual"
                              : "corrected",
                        })
                      }
                    />
                    <Field label={`Prioridad fila ${index + 1}`}>
                      <select
                        value={a.priority}
                        onChange={(e) =>
                          update({
                            ...a,
                            priority: e.target.value as Activity["priority"],
                          })
                        }
                      >
                        <option value="inherit">
                          Heredar · {effectivePriority(a, w) || "sin base"}
                        </option>
                        <option value="">Sin declarar</option>
                        {PRIORITIES.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </Field>
                    <Button
                      variant="ghost"
                      icon="sliders"
                      aria-label={`Detalles fila ${index + 1}`}
                      onClick={() =>
                        setExpanded(
                          open
                            ? expanded.filter((id) => id !== a.id)
                            : [...expanded, a.id],
                        )
                      }
                    />
                  </div>
                  <div className="row-status">
                    <Badge
                      tone={
                        !canConfirm(a)
                          ? "warning"
                          : a.effort === null
                            ? "info"
                            : "success"
                      }
                    >
                      {!canConfirm(a)
                        ? "Datos mínimos pendientes"
                        : a.effort === null
                          ? "Horas pendientes"
                          : "Datos revisables"}
                    </Badge>
                    <small>{a.origin}</small>
                    <button className="text-link" onClick={() => setDiscard(a)}>
                      Descartar fila
                    </button>
                  </div>
                  {found && (
                    <Notice
                      tone="warning"
                      title={`Posible coincidencia: ${found.title}`}
                    >
                      <p>
                        Vigente: {found.date} {found.time} · Propuesta:{" "}
                        {a.date || "sin fecha"} {a.time}. Una actualización
                        conserva el historial y no crea un duplicado.
                      </p>
                      <Field label={`Resolver coincidencia fila ${index + 1}`}>
                        <select
                          value={duplicateChoice[a.id] || ""}
                          onChange={(e) =>
                            setDuplicateChoice({
                              ...duplicateChoice,
                              [a.id]: e.target.value,
                            })
                          }
                        >
                          <option value="">Elige cómo tratar esta fila</option>
                          <option value="keep">
                            Mantener actividad vigente
                          </option>
                          <option value="update">
                            Actualizar la misma actividad con esta propuesta
                          </option>
                          <option value="distinct">
                            Son actividades distintas
                          </option>
                        </select>
                      </Field>
                    </Notice>
                  )}
                  {open && (
                    <div className="row-expanded">
                      <div className="form-row">
                        <Field label={`Inicio permitido fila ${index + 1}`}>
                          <input
                            type="date"
                            value={a.startDate}
                            min={NOW_DATE}
                            onChange={(e) =>
                              update({ ...a, startDate: e.target.value })
                            }
                          />
                        </Field>
                        <Field label={`Divisibilidad fila ${index + 1}`}>
                          <select
                            value={a.divisible}
                            onChange={(e) =>
                              update({
                                ...a,
                                divisible: e.target
                                  .value as Activity["divisible"],
                              })
                            }
                          >
                            <option value="unknown">
                              No declarada · un solo bloque
                            </option>
                            <option value="yes">Puede dividirse</option>
                            <option value="no">Bloque indivisible</option>
                          </select>
                        </Field>
                        {isEvaluation(a) && (
                          <Field label={`Fin de evaluación fila ${index + 1}`}>
                            <input
                              type="time"
                              value={a.eventEnd}
                              onChange={(e) =>
                                update({ ...a, eventEnd: e.target.value })
                              }
                            />
                          </Field>
                        )}
                      </div>
                      <Field label={`Enunciado fila ${index + 1}`}>
                        <textarea
                          value={a.description}
                          onChange={(e) =>
                            update({ ...a, description: e.target.value })
                          }
                        />
                      </Field>
                      <Suggestion
                        activity={a}
                        workspace={w}
                        accept={(effort, personal) =>
                          update({
                            ...a,
                            effort,
                            estimateOrigin: personal
                              ? "personalized"
                              : "suggested",
                          })
                        }
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <div className="review-bottom">
            <p>
              <Icon name="info" size={18} />
              Puedes confirmar sin horas. La actividad se verá en su vencimiento
              y la carga seguirá parcial.
            </p>
            <div className="form-actions">
              <Button onClick={() => navigate("/tablero")}>
                Guardar borradores y continuar después
              </Button>
              <Button variant="primary" icon="check" onClick={confirm}>
                Confirmar seleccionadas ({selected.length})
              </Button>
            </div>
          </div>
        </>
      )}
      {discard && (
        <div className="inline-confirm">
          <Notice
            tone="warning"
            title={`¿Descartar «${discard.title}» de este lote?`}
          >
            Las actividades ya confirmadas se conservan.
          </Notice>
          <div className="form-actions">
            <Button onClick={() => setDiscard(null)}>Mantener fila</Button>
            <Button
              variant="danger"
              onClick={() => {
                save({ ...w, drafts: rows.filter((a) => a.id !== discard.id) });
                setSelected(selected.filter((id) => id !== discard.id));
                setDiscard(null);
              }}
            >
              Descartar borrador
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
