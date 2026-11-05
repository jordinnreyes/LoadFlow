import { useState } from "react";
import { useApp } from "../state";
import { type Priority, PRIORITIES, TYPES, priorityKey } from "../model";
import { navigate, useDirtyForm } from "../navigation";
import { Badge, Button, Field, Notice, SectionHeading } from "../components/ui";
import type { Propose } from "../actions";

export default function Priorities({ onPropose }: { onPropose: Propose }) {
  const { workspace } = useApp();
  const w = workspace!;
  const [priorities, setPriorities] = useState({ ...w.priorities });
  const [courses, setCourses] = useState([...w.courses]);
  const [newCourse, setNewCourse] = useState("");
  const [period, setPeriod] = useState(w.period);
  const [end, setEnd] = useState(w.periodEnd);
  const [message, setMessage] = useState("");
  useDirtyForm(
    JSON.stringify(priorities) !== JSON.stringify(w.priorities) ||
      JSON.stringify(courses) !== JSON.stringify(w.courses) ||
      period !== w.period ||
      end !== w.periodEnd,
  );
  return (
    <>
      <SectionHeading
        eyebrow="CONTEXTO ACADÉMICO"
        title="Tus cursos, tus prioridades"
      >
        Da preferencia a lo que importa, sin alterar los plazos ni los
        compromisos confirmados.
      </SectionHeading>
      <Notice title="La prioridad sí cambia la distribución">
        Alta → Media → Baja. A igual prioridad, se considera primero el
        vencimiento más cercano. Una excepción individual prevalece sobre la
        base.
      </Notice>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onPropose(
            { ...w, priorities, courses, period, periodEnd: end },
            "Actualizar periodo, cursos y prioridades heredadas",
          );
        }}
      >
        <section className="surface">
          <h2>Periodo académico</h2>
          <div className="form-row">
            <Field label="Nombre del periodo">
              <input
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                required
              />
            </Field>
            <Field label="Cierre del periodo (opcional)">
              <input
                type="date"
                value={end}
                min="2026-11-02"
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
          </div>
          <p className="tiny muted">
            Si no confirmas cierre, se analiza hasta el último deadline
            confirmado, con alcance provisional.
          </p>
        </section>
        <section className="surface">
          <div className="row-between">
            <h2>Prioridad por curso y tipo</h2>
            <Badge>{courses.length} cursos</Badge>
          </div>
          <div className="add-course">
            <Field label="Nombre de un curso">
              <input
                value={newCourse}
                onChange={(e) => setNewCourse(e.target.value)}
                placeholder="Ej. Álgebra lineal"
              />
            </Field>
            <Button
              icon="plus"
              onClick={() => {
                const n = newCourse.trim();
                if (!n) return;
                if (courses.includes(n)) {
                  setMessage("Ese curso ya está en la lista.");
                  return;
                }
                setCourses([...courses, n]);
                setNewCourse("");
                setMessage("");
              }}
            >
              Añadir curso
            </Button>
          </div>
          {message && <Notice title={message} />}
          <div className="priority-course-list">
            {courses.map((course) => (
              <details className="course-priorities" open key={course}>
                <summary>
                  <span>{course}</span>
                  <Badge>
                    {
                      w.activities.filter(
                        (a) => a.course === course && a.priority !== "inherit",
                      ).length
                    }{" "}
                    excepciones individuales
                  </Badge>
                </summary>
                <div className="priority-type-grid">
                  {TYPES.map((type) => {
                    const key = priorityKey(course, type);
                    const inherits = w.activities.filter(
                      (a) =>
                        a.course === course &&
                        a.type === type &&
                        a.priority === "inherit",
                    ).length;
                    return (
                      <Field
                        label={type}
                        key={key}
                        hint={`${inherits} actividades heredan esta base`}
                      >
                        <select
                          value={priorities[key] || ""}
                          onChange={(e) =>
                            setPriorities({
                              ...priorities,
                              [key]: e.target.value as Priority,
                            })
                          }
                        >
                          <option value="">Sin prioridad declarada</option>
                          {PRIORITIES.map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                      </Field>
                    );
                  })}
                </div>
                {w.activities
                  .filter(
                    (a) => a.course === course && a.priority !== "inherit",
                  )
                  .map((a) => (
                    <p className="exception-link" key={a.id}>
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => navigate(`/calendario/${a.id}`)}
                      >
                        {a.title} · Excepción: {a.priority || "sin declarar"}
                      </button>
                    </p>
                  ))}
              </details>
            ))}
          </div>
          {!courses.length && (
            <p className="muted">
              Añade un curso o importa actividades. El curso puede permanecer
              sin asignar.
            </p>
          )}
        </section>
        <Notice
          tone="warning"
          title="Desempates pendientes de decisión de producto"
        >
          En esta demostración, los empates exactos mantienen el orden estable
          de confirmación. Un conjunto mixto con prioridades no declaradas se
          ordena provisionalmente por plazo, sin asignarle Media.
        </Notice>
        <div className="form-actions">
          <Button variant="primary" icon="check" type="submit">
            Revisar efecto en mis sesiones
          </Button>
        </div>
      </form>
    </>
  );
}
