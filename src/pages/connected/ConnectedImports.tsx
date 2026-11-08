import { useEffect, useState } from "react";
import {
  academics,
  segment,
  type Candidate,
  type Course,
  type Import,
} from "../../api/academic";
import {
  allPages,
  endpoint,
  request,
  type Body,
  type Response,
} from "../../api/client";
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
import { LoadState, WriteState, type Screen } from "./shared";

type Row = Body<"confirmImport">["rows"][number];
const STATES = {
  uploading: "Recibiendo archivo",
  queued: "En cola",
  running: "Extrayendo",
  review: "Listo para revisar",
  failed: "Extracción fallida",
  cancelled: "Cancelada",
  removed: "Retirada",
  expired: "Caducada",
};

export function ConnectedImports({
  screen,
  id,
}: {
  screen: Screen;
  id?: string;
}) {
  const read = useRead(
    screen.period.id,
    async (signal) =>
      (await allPages<Import>("/imports", {}, signal)).filter(
        (item) => item.periodId === screen.period.id,
      ),
    screen.expired,
  );
  const write = useWrite(screen.session, screen.expired);
  const [error, setError] = useState("");
  return (
    <>
      <SectionHeading
        eyebrow="IMPORTAR ACTIVIDADES"
        title="Revisa lo que contiene tu archivo"
        actions={
          <a className="button" href="#/calendario/nueva">
            Añadir manualmente
          </a>
        }
      />
      <form
        className="surface"
        onSubmit={async (event) => {
          event.preventDefault();
          const node = event.currentTarget;
          const form = new FormData(node);
          const file = form.get("file");
          setError("");
          if (
            !(file instanceof File) ||
            !file.size ||
            !/\.(pdf|xlsx)$/i.test(file.name)
          ) {
            setError("Selecciona un PDF o un archivo XLSX.");
            return;
          }
          const result = await write.run<Response<"uploadImport", 202>>({
            path: `/imports?${new URLSearchParams({ periodId: screen.period.id })}`,
            body: form,
            signature: JSON.stringify([
              file.name,
              file.size,
              file.lastModified,
            ]),
          });
          if (result) {
            node.reset();
            read.reload();
            window.location.hash = `/importar/${result.id}`;
          }
        }}
      >
        <Field label="Archivo PDF o XLSX">
          <input type="file" name="file" required accept=".pdf,.xlsx" />
        </Field>
        {error && <p role="alert">{error}</p>}
        <WriteState {...write} reload={read.reload} />
        <Button variant="primary" type="submit" disabled={write.busy}>
          {write.busy ? "Subiendo…" : "Subir para revisar"}
        </Button>
      </form>
      <section className="surface">
        <h2>Importaciones y borradores</h2>
        {!read.data ? (
          <LoadState {...read} />
        ) : read.data.length ? (
          <ul>
            {read.data.map((item) => (
              <li key={item.id}>
                <a href={`#/importar/${item.id}`}>
                  {item.format.toUpperCase()} · {STATES[item.state]} ·{" "}
                  {item.id.slice(0, 8)}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>Aún no hay importaciones.</p>
        )}
      </section>
      {id && (
        <ImportDetail
          key={id}
          screen={screen}
          id={id}
          refreshImports={read.reload}
        />
      )}
    </>
  );
}

function ImportDetail({
  screen,
  id,
  refreshImports,
}: {
  screen: Screen;
  id: string;
  refreshImports: () => void;
}) {
  const path = `/imports/${segment(id)}`;
  const read = useRead(
    id,
    async (signal) => {
      const summary = await request<Import>(endpoint(path), { signal });
      if (summary.data.state !== "review")
        return { summary, candidates: [], courses: [] };
      const [candidates, courses] = await Promise.all([
        allPages<Candidate>(`${path}/candidates`, {}, signal),
        academics.courses(summary.data.periodId, signal),
      ]);
      return { summary, candidates, courses };
    },
    screen.expired,
  );
  const state = read.data?.summary.data.state;
  useEffect(() => {
    if (!state || !["uploading", "queued", "running"].includes(state)) return;
    const timer = window.setTimeout(read.reload, 1800);
    return () => window.clearTimeout(timer);
  }, [read.data]);
  const write = useWrite(screen.session, screen.expired);
  const [selected, setSelected] = useState<Record<string, Row>>({});
  const [result, setResult] = useState<Response<"confirmImport", 200>>();
  const [retire, setRetire] = useState(false);
  if (!read.data) return <LoadState {...read} />;
  const { summary, candidates, courses } = read.data;
  const nextDraft = result
    ? candidates.find((item) => item.status === "draft")?.id
    : undefined;
  const rows = Object.values(selected).filter((row) =>
    candidates.some(
      (item) =>
        item.status === "draft" &&
        item.id === row.candidateId &&
        item.revision === row.revision,
    ),
  );
  return (
    <section className="surface">
      <h2>Revisión de importación</h2>
      <Badge>{STATES[summary.data.state]}</Badge>
      {summary.data.errorMessage && (
        <p role="alert">{summary.data.errorMessage}</p>
      )}
      {summary.data.warnings.map((warning, index) => (
        <p key={index}>{warning}</p>
      ))}
      {summary.data.state === "failed" && summary.data.originalAvailable && (
        <Button
          disabled={write.busy}
          onClick={async () => {
            if (
              await write.run({
                path: `${path}/retry`,
                revision: summary.revision,
              })
            ) {
              read.reload();
              refreshImports();
            }
          }}
        >
          Reintentar extracción
        </Button>
      )}
      {["uploading", "queued", "running", "review", "failed"].includes(
        summary.data.state,
      ) && (
        <Button
          variant="ghost"
          disabled={write.busy}
          onClick={() => setRetire(true)}
        >
          Retirar fuente
        </Button>
      )}
      {summary.data.state === "review" && (
        <>
          {screen.capabilities.plan === "Premium" && (
            <Notice title="Análisis posterior del enunciado">
              {summary.data.analysisSource.message}
            </Notice>
          )}
          {!candidates.length && (
            <p>
              No se encontraron filas reconocibles. Puedes añadir una actividad
              manualmente.
            </p>
          )}
          {candidates.map((item) => (
            <DraftRow
              key={`${item.id}:${item.revision}`}
              screen={screen}
              item={item}
              courses={courses}
              selected={rows.find((row) => row.candidateId === item.id)}
              next={item.id === nextDraft}
              onSelect={(row) =>
                setSelected((previous) => {
                  const next = { ...previous };
                  if (row) next[item.id] = row;
                  else delete next[item.id];
                  return next;
                })
              }
              reload={read.reload}
            />
          ))}
          <Button
            variant="primary"
            disabled={!rows.length || rows.length > 100 || write.busy}
            onClick={async () => {
              const saved = await write.run<Response<"confirmImport", 200>>({
                path: `${path}/confirm`,
                revision: summary.revision,
                body: { rows },
              });
              if (saved) {
                setResult(saved);
                setSelected({});
                read.reload();
                refreshImports();
              }
            }}
          >
            Confirmar seleccionadas ({rows.length})
          </Button>
        </>
      )}
      {result && (
        <div role="status">
          <p>Confirmadas: {result.items.length}</p>
          {result.items
            .filter((item) => item.dateProposalId)
            .map((item) => (
              <p key={item.candidateId}>
                Revisa el cambio de fecha propuesto desde{" "}
                <a
                  href={`#/calendario/${item.activityId}?propuesta=${item.dateProposalId}`}
                >
                  la actividad
                </a>
                .
              </p>
            ))}
        </div>
      )}
      {!retire && <WriteState {...write} reload={read.reload} />}
      {retire && (
        <Modal title="Retirar fuente" onClose={() => setRetire(false)}>
          <p>
            Se retiran los borradores de esta fuente y se conservan las
            actividades confirmadas y su procedencia.
          </p>
          <WriteState
            {...write}
            reload={() => {
              setRetire(false);
              read.reload();
            }}
          />
          <div className="form-actions">
            <Button onClick={() => setRetire(false)}>Conservar fuente</Button>
            <Button
              variant="danger"
              disabled={write.busy}
              onClick={async () => {
                if (
                  await write.run({
                    path: `${path}/cancel`,
                    revision: summary.revision,
                  })
                ) {
                  setRetire(false);
                  read.reload();
                  refreshImports();
                }
              }}
            >
              Confirmar retirada
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function DraftRow({
  screen,
  item,
  courses,
  selected,
  next,
  onSelect,
  reload,
}: {
  screen: Screen;
  item: Candidate;
  courses: Course[];
  selected?: Row;
  next: boolean;
  onSelect: (row?: Row) => void;
  reload: () => void;
}) {
  const draft = item.draft;
  const write = useWrite(screen.session, screen.expired);
  const [choice, setChoice] = useState("");
  const match = item.matches.find(
    (entry) => entry.activityId === choice.split(":")[1],
  );
  function select() {
    const resolution = (choice.split(":")[0] ||
      "distinct") as Row["resolution"];
    onSelect({
      candidateId: item.id,
      revision: item.revision,
      resolution,
      ...(match
        ? { activityId: match.activityId, activityRevision: match.revision }
        : {}),
    });
  }
  return (
    <details className="surface" open={selected || next ? true : undefined}>
      <summary>
        {draft.title ?? "Actividad pendiente"} {next && "· Siguiente pendiente"}{" "}
        ·{" "}
        {item.status === "draft"
          ? "Borrador"
          : item.status === "discarded"
            ? "Descartada"
            : "Confirmada"}
      </summary>
      <p>
        Unidad {item.evidence.locator.unit} · fila {item.evidence.locator.row}
      </p>
      {item.status === "draft" && (
        <>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const str = (name: string) =>
                String(form.get(name) ?? "").trim() || null;
              const effort = str("effort");
              const body = {
                title: str("title"),
                type: str("type"),
                courseId: str("course"),
                dueDate: str("date"),
                dueTime: str("time"),
                endTime: str("end"),
                timezone: str("zone"),
                operatingMinutes: effort === null ? null : Number(effort),
              };
              if (
                await write.run({
                  method: "PATCH",
                  path: `/import-candidates/${segment(item.id)}`,
                  revision: `"candidate-${item.revision}"`,
                  body,
                })
              ) {
                onSelect(undefined);
                reload();
              }
            }}
          >
            <Field label="Título">
              <input
                name="title"
                defaultValue={draft.title ?? ""}
                maxLength={200}
              />
            </Field>
            <Field label="Tipo">
              <select name="type" defaultValue={draft.type ?? ""}>
                <option value="">Por confirmar</option>
                {TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </Field>
            <Field label="Curso">
              <select name="course" defaultValue={draft.courseId ?? ""}>
                <option value="">Sin curso</option>
                {courses.map((course) => (
                  <option value={course.id} key={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha límite">
              <input
                type="date"
                name="date"
                defaultValue={draft.dueDate ?? ""}
              />
            </Field>
            <Field label="Hora límite">
              <input
                type="time"
                name="time"
                defaultValue={draft.dueTime?.slice(0, 5)}
              />
            </Field>
            <Field label="Fin de evaluación">
              <input
                type="time"
                name="end"
                defaultValue={draft.endTime?.slice(0, 5)}
              />
            </Field>
            <Field label="Zona">
              <input
                name="zone"
                defaultValue={draft.timezone ?? screen.zone ?? ""}
              />
            </Field>
            <Field label="Esfuerzo (minutos)">
              <input
                name="effort"
                type="number"
                min={0}
                defaultValue={draft.operatingMinutes ?? ""}
              />
            </Field>
            <Button type="submit" disabled={write.busy}>
              Guardar borrador
            </Button>
          </form>
          {!!item.matches.length && (
            <Field label="Resolver coincidencia">
              <select
                value={choice}
                onChange={(event) => {
                  setChoice(event.target.value);
                  onSelect(undefined);
                }}
              >
                <option value="">Elige qué hacer</option>
                <option value="distinct">Es una actividad distinta</option>
                {item.matches.flatMap((entry) => [
                  <option
                    key={`keep-${entry.activityId}`}
                    value={`keep:${entry.activityId}`}
                  >
                    Conservar {entry.title}
                  </option>,
                  <option
                    key={`update-${entry.activityId}`}
                    value={`update:${entry.activityId}`}
                  >
                    Proponer actualización de {entry.title}
                  </option>,
                ])}
              </select>
            </Field>
          )}
          <label className="check-field">
            <input
              type="checkbox"
              checked={!!selected}
              disabled={!!item.matches.length && !choice}
              onChange={(event) =>
                event.target.checked ? select() : onSelect(undefined)
              }
            />
            Seleccionar {draft.title ?? "borrador"}
          </label>
        </>
      )}
      <WriteState {...write} reload={reload} />
    </details>
  );
}
