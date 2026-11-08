import { useState } from "react";
import {
  academics,
  periodPath,
  segment,
  type Course,
} from "../../api/academic";
import {
  endpoint,
  request,
  type Capabilities,
  type Response,
  type Session,
} from "../../api/client";
import { useRead } from "../../api/useRead";
import { useWrite } from "../../api/useWrite";
import { Badge, Button, Field, SectionHeading } from "../../components/ui";
import { TYPES } from "../../model";
import { LoadState, WriteState, type Screen } from "./shared";

export function ConnectedSettings({
  session,
  capabilities,
  reload,
}: {
  session: Session;
  capabilities: Capabilities;
  reload: () => void;
}) {
  const write = useWrite(session, reload);
  return (
    <>
      <SectionHeading
        eyebrow="CUENTA Y PREFERENCIAS"
        title="Tu espacio, a tu manera"
      />
      <section className="surface">
        <h2>Preferencias de planificación</h2>
        <div className="form-actions">
          <a className="button" href="#/disponibilidad?calendar=manage">
            Disponibilidad y Calendar
          </a>
          <a className="button" href="#/prioridades">
            Cursos y prioridades
          </a>
          <a className="button" href="#/importar">
            Documentos y borradores
          </a>
        </div>
      </section>
      <form
        className="surface"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          if (
            await write.run({
              method: "PATCH",
              path: "/me/preferences",
              revision: `"profile-${session.user.revision}"`,
              body: {
                displayName: form.get("name"),
                studyTimezone: String(form.get("zone")).trim() || null,
              },
            })
          )
            reload();
        }}
      >
        <h2>Tu perfil</h2>
        <Field label="Nombre">
          <input
            name="name"
            defaultValue={session.user.displayName}
            required
            maxLength={100}
          />
        </Field>
        <Field
          label="Zona de estudio"
          hint="Usa un nombre de zona, por ejemplo America/Lima."
        >
          <input name="zone" defaultValue={session.user.studyTimezone ?? ""} />
        </Field>
        <WriteState {...write} reload={reload} />
        <Button type="submit" variant="primary" disabled={write.busy}>
          Guardar perfil
        </Button>
      </form>
      <section className="surface">
        <div className="row-between">
          <h2>Tu plan</h2>
          <Badge tone={capabilities.plan === "Premium" ? "premium" : "neutral"}>
            {capabilities.plan}
          </Badge>
        </div>
        <p>
          Planificación, importación estructurada y registro de tiempo real.
        </p>
        {capabilities.plan === "Premium" && (
          <>
            <p>
              {capabilities.aiEstimates
                ? "Estimaciones de IA disponibles para tu cuenta."
                : "Estimaciones de IA sin habilitar en este entorno."}
            </p>
            <details>
              <summary>Estimar desde el enunciado</summary>
              <p>Revisa el fragmento y el rango sugerido para la actividad.</p>
            </details>
            <details>
              <summary>Entender la sugerencia</summary>
              <p>Consulta los factores que intervienen en el rango.</p>
            </details>
            <details>
              <summary>Ajustar con tu historial</summary>
              <p>
                La personalización necesita tu consentimiento y actividades
                comparables ya terminadas.
              </p>
            </details>
            <details>
              <summary>Aceptar o corregir</summary>
              <p>
                El esfuerzo cambia cuando lo confirmas. Puedes seguir
                registrándolo manualmente.
              </p>
            </details>
          </>
        )}
      </section>
    </>
  );
}

type Rules = Response<"listBasePriorities", 200>;
export function ConnectedCourses({ screen }: { screen: Screen }) {
  const [selected, setSelected] = useState("");
  const read = useRead(
    screen.period.id,
    (signal) => academics.courses(screen.period.id, signal),
    screen.expired,
  );
  const course = read.data?.find((item) => item.id === selected);
  const write = useWrite(screen.session, screen.expired);
  return (
    <>
      <SectionHeading
        eyebrow="CURSOS Y PRIORIDADES"
        title="Organiza tu periodo"
      />
      <form
        className="surface"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          if (
            await write.run({
              method: "PATCH",
              path: periodPath(screen.period.id),
              revision: `"period-${screen.period.revision}"`,
              body: {
                name: form.get("name"),
                startDate: form.get("start") || null,
                endDate: form.get("end") || null,
                timezone: form.get("zone") || null,
              },
            })
          )
            screen.expired();
        }}
      >
        <h2>Periodo académico</h2>
        <Field label="Nombre del periodo">
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={screen.period.name}
          />
        </Field>
        <Field label="Inicio del periodo">
          <input
            name="start"
            type="date"
            defaultValue={screen.period.startDate ?? ""}
          />
        </Field>
        <Field label="Cierre del periodo">
          <input
            name="end"
            type="date"
            defaultValue={screen.period.endDate ?? ""}
          />
        </Field>
        <Field label="Zona del periodo">
          <input
            name="zone"
            defaultValue={screen.period.timezone ?? ""}
            placeholder="America/Lima"
          />
        </Field>
        <Button type="submit" disabled={write.busy}>
          Guardar periodo
        </Button>
      </form>
      <form
        className="surface"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const name = String(new FormData(form).get("name")).trim();
          const created = await write.run<Course>({
            path: `${periodPath(screen.period.id)}/courses`,
            body: { name },
          });
          if (created) {
            form.reset();
            setSelected(created.id);
            read.reload();
          }
        }}
      >
        <Field label="Nombre del curso">
          <input name="name" required maxLength={120} />
        </Field>
        <Button type="submit" disabled={write.busy}>
          Añadir curso
        </Button>
      </form>
      {!read.data ? (
        <LoadState {...read} />
      ) : (
        <div className="surface">
          <Field label="Curso">
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Selecciona un curso</option>
              {read.data.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          {course && (
            <CourseRules
              key={`${course.id}:${course.revision}`}
              screen={screen}
              course={course}
              reload={read.reload}
            />
          )}
        </div>
      )}
      <WriteState {...write} reload={screen.expired} />
    </>
  );
}

function CourseRules({
  screen,
  course,
  reload,
}: {
  screen: Screen;
  course: Course;
  reload: () => void;
}) {
  const path = `/courses/${segment(course.id)}`;
  const read = useRead(
    course.id,
    (signal) => request<Rules>(endpoint(`${path}/priorities`), { signal }),
    screen.expired,
  );
  const write = useWrite(screen.session, screen.expired);
  return (
    <>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const name = String(
            new FormData(event.currentTarget).get("name"),
          ).trim();
          if (
            await write.run({
              method: "PATCH",
              path,
              revision: `"course-${course.revision}"`,
              body: { name },
            })
          )
            reload();
        }}
      >
        <Field label="Renombrar curso">
          <input
            name="name"
            defaultValue={course.name}
            required
            maxLength={120}
          />
        </Field>
        <Button type="submit" disabled={write.busy}>
          Guardar nombre
        </Button>
      </form>
      {!read.data ? (
        <LoadState {...read} />
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const type = segment(String(form.get("type")));
            const priority = form.get("priority");
            if (
              await write.run({
                method: priority ? "PUT" : "DELETE",
                path: `${path}/priorities/${type}`,
                revision: read.data?.revision ?? `"course-${course.revision}"`,
                ...(priority ? { body: { priority } } : {}),
              })
            )
              reload();
          }}
        >
          <h3>Prioridad por tipo</h3>
          <ul>
            {read.data.data.rules.map((item) => (
              <li key={item.type}>
                {item.type} · {item.priority}
              </li>
            ))}
          </ul>
          <Field label="Tipo">
            <select name="type">
              {TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="Prioridad base">
            <select name="priority">
              <option value="">Quitar regla</option>
              <option>Alta</option>
              <option>Media</option>
              <option>Baja</option>
            </select>
          </Field>
          <Button type="submit" disabled={write.busy}>
            Guardar prioridad
          </Button>
        </form>
      )}
      <WriteState {...write} reload={reload} />
    </>
  );
}
