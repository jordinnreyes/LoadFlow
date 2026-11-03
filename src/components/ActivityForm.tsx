import { useEffect, useRef, useState } from "react";
import {
  type Activity,
  type Workspace,
  TYPES,
  PRIORITIES,
  NOW_DATE,
  isGroup,
  isEvaluation,
} from "../model";
import { formatMinutes, occupations } from "../rules";
import { Badge, Button, Field, Notice } from "./ui";

export function MinutesField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
}) {
  const [text, setText] = useState(
    value === null ? "" : String(value / 60).replace(".", ","),
  );
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current)
      setText(value === null ? "" : String(value / 60).replace(".", ","));
  }, [value]);
  return (
    <Field
      label={label}
      hint={
        hint || (value === null ? "Sin dato confirmado" : formatMinutes(value))
      }
    >
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={text}
        placeholder="Ej. 2,5"
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const v = Number(t.replace(",", "."));
          const valid =
            t === "" ||
            (/^(\d+([,.]\d*)?|[,.]\d+)$/.test(t) &&
              Number.isFinite(v) &&
              v >= 0);
          e.target.setCustomValidity(
            valid ? "" : "Ingresa horas válidas, por ejemplo 1,5.",
          );
          if (valid) onChange(t === "" ? null : Math.round(v * 60));
        }}
        onBlur={() => {
          if (ref.current?.validity.valid)
            setText(value === null ? "" : String(value / 60).replace(".", ","));
        }}
      />
    </Field>
  );
}
export function ActivityFields({
  value: a,
  onChange,
  workspace: w,
  basic = false,
}: {
  value: Activity;
  onChange: (next: Activity) => void;
  workspace: Workspace;
  basic?: boolean;
}) {
  const update = (patch: Partial<Activity>) => onChange({ ...a, ...patch });
  return (
    <>
      <Field label="Título de la actividad">
        <input
          value={a.title}
          onChange={(e) => update({ title: e.target.value })}
        />
      </Field>
      <div className="form-row">
        <Field label="Curso (opcional)">
          <input
            list="course-options"
            value={a.course}
            placeholder="Sin asignar"
            onChange={(e) => update({ course: e.target.value })}
          />
          <datalist id="course-options">
            {w.courses.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Tipo de actividad">
          <select
            value={a.type}
            onChange={(e) =>
              update({ type: e.target.value as Activity["type"] })
            }
          >
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label={isEvaluation(a) ? "Fecha de evaluación" : "Fecha límite"}>
          <input
            type="date"
            value={a.date}
            onChange={(e) => update({ date: e.target.value })}
          />
        </Field>
        <Field
          label={
            isEvaluation(a)
              ? "Hora inicial de evaluación"
              : "Hora límite confirmada"
          }
          hint="Si se desconoce, déjala pendiente"
        >
          <input
            type="time"
            value={a.time}
            onChange={(e) => update({ time: e.target.value })}
          />
        </Field>
      </div>
      {isEvaluation(a) && (
        <Field
          label="Hora final de evaluación"
          hint="Solo un intervalo confirmado bloquea el calendario"
        >
          <input
            type="time"
            value={a.eventEnd}
            onChange={(e) => update({ eventEnd: e.target.value })}
          />
        </Field>
      )}
      {!isGroup(a) ? (
        <MinutesField
          label={
            isEvaluation(a)
              ? "Horas estimadas de preparación"
              : "Horas estimadas de trabajo"
          }
          value={a.effort}
          onChange={(v) =>
            update({
              effort: v,
              estimateOrigin:
                a.estimateOrigin === "manual" ? "manual" : "corrected",
            })
          }
          hint="No incluyas la duración de una evaluación fija. Dejar vacío conserva la carga parcial."
        />
      ) : (
        <Notice title="Proyecto grupal: deadline y reservas tentativas">
          No se calcula automáticamente esfuerzo individual. Podrás revisar
          hasta 3 reservas de 2 h.
        </Notice>
      )}
      <Field label="Prioridad de esta actividad">
        <select
          value={a.priority}
          onChange={(e) =>
            update({ priority: e.target.value as Activity["priority"] })
          }
        >
          <option value="inherit">Heredar de curso + tipo</option>
          <option value="">Sin prioridad declarada</option>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Field>
      {!basic && (
        <>
          <Field label="Descripción o enunciado (opcional)">
            <textarea
              rows={3}
              value={a.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Field>
          <div className="form-section-title">Condiciones de preparación</div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={a.startDate === NOW_DATE}
              onChange={(e) =>
                update({ startDate: e.target.checked ? NOW_DATE : "" })
              }
            />
            Puedo empezar desde hoy de demostración (2 nov.)
          </label>
          <Field label="O empezar desde una fecha">
            <input
              type="date"
              value={a.startDate}
              min={NOW_DATE}
              onChange={(e) => update({ startDate: e.target.value })}
            />
          </Field>
          <Field label="¿Se puede dividir en varias sesiones?">
            <select
              value={a.divisible}
              onChange={(e) =>
                update({ divisible: e.target.value as Activity["divisible"] })
              }
            >
              <option value="unknown">
                No declarado · se mantiene un solo bloque
              </option>
              <option value="yes">Sí, se puede dividir</option>
              <option value="no">No, requiere un bloque continuo</option>
            </select>
          </Field>
          <Field label="Depende de completar (opcional)">
            <select
              value={a.dependencies[0] || ""}
              onChange={(e) =>
                update({ dependencies: e.target.value ? [e.target.value] : [] })
              }
            >
              <option value="">Sin dependencia declarada</option>
              {w.activities
                .filter((x) => x.id !== a.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
            </select>
          </Field>
        </>
      )}
    </>
  );
}
export function GroupFields({
  value: a,
  onChange,
  workspace: w,
}: {
  value: Activity;
  onChange: (next: Activity) => void;
  workspace: Workspace;
}) {
  const available = occupations(w).filter(
    (c) => c.source === "google" && c.date <= a.date,
  );
  return (
    <>
      <Notice
        tone="warning"
        title="Reservas de colaboración, siempre tentativas"
      >
        No representan horas reales individuales. Se proponen en días
        consecutivos cercanos al plazo cuando sea posible.
      </Notice>
      <label className="check-field">
        <input
          type="checkbox"
          checked={a.groupEnabled}
          onChange={(e) =>
            onChange({
              ...a,
              groupEnabled: e.target.checked,
              groupAccepted: true,
            })
          }
        />
        Usar reservas tentativas de colaboración
      </label>
      {a.groupEnabled && (
        <>
          <div className="form-row">
            <Field label="Cantidad de reservas">
              <select
                value={a.groupCount}
                onChange={(e) =>
                  onChange({ ...a, groupCount: Number(e.target.value) })
                }
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Duración de cada reserva">
              <select
                value={a.groupDuration}
                onChange={(e) =>
                  onChange({ ...a, groupDuration: Number(e.target.value) })
                }
              >
                {[30, 60, 90, 120].map((n) => (
                  <option key={n} value={n}>
                    {formatMinutes(n)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="muted">
            ¿Ya tienes una reunión equivalente en Calendar? Confírmala por
            intervalo. La coincidencia por sí sola no establece equivalencia.
          </p>
          {available.length ? (
            available.map((c) => (
              <label className="check-field" key={c.id}>
                <input
                  type="checkbox"
                  checked={a.equivalentIds.includes(c.id)}
                  onChange={(e) =>
                    onChange({
                      ...a,
                      equivalentIds: e.target.checked
                        ? [...a.equivalentIds, c.id]
                        : a.equivalentIds.filter((id) => id !== c.id),
                    })
                  }
                />
                Ocupado · {c.date} · {Math.floor(c.start / 60)}:00–
                {Math.floor(c.end / 60)}:00 <Badge tone="neutral">Google</Badge>
              </label>
            ))
          ) : (
            <p className="tiny muted">
              No hay intervalos externos seleccionados. Puedes conectar el
              Calendar simulado para probar equivalencias.
            </p>
          )}
        </>
      )}
    </>
  );
}
export function Suggestion({
  activity: a,
  workspace: w,
  accept,
}: {
  activity: Activity;
  workspace: Workspace;
  accept: (n: number, personal: boolean) => void;
}) {
  const [stage, setStage] = useState<
    "idle" | "loading" | "result" | "none" | "denied"
  >("idle");
  const [suggested, setSuggested] = useState(240);
  const personal = w.personalEligible && w.historyConsent;
  if (isGroup(a)) return null;
  const request = () => {
    if (w.plan !== "Premium" || w.premiumUnavailable) {
      setStage("denied");
      return;
    }
    setStage("loading");
    window.setTimeout(() => {
      if (!a.description.trim()) {
        setStage("none");
        return;
      }
      setSuggested(personal ? 300 : a.type.includes("Examen") ? 360 : 240);
      setStage("result");
    }, 450);
  };
  return (
    <div className="suggestion">
      <div className="row-between">
        <strong>Sugerencia de esfuerzo</strong>
        <Badge tone="premium" icon="spark">
          Premium · simulación
        </Badge>
      </div>
      {stage === "idle" && (
        <>
          <p className="muted">
            Orientación de ejemplo a partir del enunciado. No se consulta IA ni
            se consume cuota.
          </p>
          <Button icon="spark" onClick={request}>
            Solicitar sugerencia simulada
          </Button>
        </>
      )}
      {stage === "loading" && (
        <p role="status">Preparando ejemplo de sugerencia…</p>
      )}
      {stage === "denied" && (
        <Notice
          title={
            w.plan === "Free"
              ? "Sugerir horas requiere Premium"
              : "Las sugerencias Premium no están disponibles en este escenario"
          }
        >
          Puedes ingresar tus horas y planificar gratis. Cambia el plan de
          demostración desde Ajustes.
        </Notice>
      )}
      {stage === "none" && (
        <Notice title="No hay información suficiente para sugerir horas">
          Añade contexto o ingresa tus horas manualmente.
        </Notice>
      )}
      {stage === "result" && (
        <>
          <Badge tone="premium">
            {personal
              ? "Personalizada · historial elegible del escenario"
              : "Inicial · sin personalización"}
          </Badge>
          <p>
            {personal
              ? "Este escenario representa historial comparable suficiente. Los criterios reales siguen pendientes."
              : "Esta sugerencia es general; no se atribuye aprendizaje a un registro aislado."}
          </p>
          <MinutesField
            label="Horas sugeridas de ejemplo (puedes corregirlas)"
            value={suggested}
            onChange={(n) => setSuggested(n || 0)}
          />
          <p className="tiny muted">
            Basada en el contenido de ejemplo. Es orientativa; no se garantiza
            precisión. La fecha y la prioridad no cambian este valor.
          </p>
          <div className="form-actions">
            <Button onClick={() => setStage("idle")}>Usar mis horas</Button>
            <Button
              variant="primary"
              onClick={() => {
                accept(suggested, personal);
                setStage("idle");
              }}
              disabled={suggested <= 0}
            >
              Aceptar estas horas
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
