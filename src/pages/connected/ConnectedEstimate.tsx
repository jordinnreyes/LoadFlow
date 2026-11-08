import { useEffect, useState } from "react";
import { activityPath, segment, type Activity } from "../../api/academic";
import { endpoint, request, type Response } from "../../api/client";
import { useRead } from "../../api/useRead";
import { useWrite } from "../../api/useWrite";
import { Button, Field, Notice } from "../../components/ui";
import { LoadState, minutesLabel, WriteState, type Screen } from "./shared";

type Estimate = Response<"getEstimate", 200>;
type Consent = Response<"getEstimateConsent", 200>;
const PATHS = [
  "/me/estimate-consent",
  "/me/estimate-personalization-consent",
] as const;
const FACTORS = {
  deliverables: "Entregables",
  volume: "Volumen",
  validation: "Validación",
  prerequisites: "Requisitos previos",
};

export function ConnectedEstimate({
  screen,
  activity,
  reload,
}: {
  screen: Screen;
  activity: Activity;
  reload: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (
    screen.capabilities.plan !== "Premium" ||
    activity.type === "Entrega grupal"
  )
    return null;
  return (
    <section className="surface">
      <h3>Estimación Premium</h3>
      {!screen.capabilities.aiEstimates ? (
        <p>
          Las estimaciones están deshabilitadas en este entorno. Puedes indicar
          el esfuerzo manualmente.
        </p>
      ) : open ? (
        <EstimateFields screen={screen} activity={activity} reload={reload} />
      ) : (
        <Button onClick={() => setOpen(true)}>Estimar esfuerzo</Button>
      )}
    </section>
  );
}

function EstimateFields({
  screen,
  activity,
  reload,
}: {
  screen: Screen;
  activity: Activity;
  reload: () => void;
}) {
  const consents = useRead(
    activity.id,
    (signal) =>
      Promise.all(
        PATHS.map((path) => request<Consent>(endpoint(path), { signal })),
      ),
    screen.expired,
  );
  const write = useWrite(screen.session, screen.expired);
  const [estimate, setEstimate] = useState<Estimate>();
  const pending = useRead(
    estimate?.id ?? "",
    async (signal) =>
      estimate?.id
        ? (
            await request<Estimate>(
              endpoint(`/estimates/${segment(estimate.id)}`),
              { signal },
            )
          ).data
        : null,
    screen.expired,
  );
  const result = pending.data ?? estimate;
  useEffect(() => {
    if (pending.data?.state !== "pending") return;
    const timer = window.setTimeout(pending.reload, 1800);
    return () => window.clearTimeout(timer);
  }, [pending.data]);
  if (!consents.data) return <LoadState {...consents} />;
  const [analysis, personalization] = consents.data;
  const suggestion = result?.suggestion;
  const revision = `"activity-${activity.revision}"`;
  return (
    <>
      {[analysis, personalization].map((item, index) => (
        <details key={PATHS[index]} open={index === 0}>
          <summary>
            {index === 0
              ? "Permiso para analizar el enunciado"
              : "Permiso para personalizar con tu historial"}
          </summary>
          <p>{item.data.notice}</p>
          <Button
            disabled={write.busy}
            onClick={async () => {
              if (
                await write.run({
                  method: "PUT",
                  path: PATHS[index],
                  revision: item.revision,
                  body: {
                    granted: !item.data.granted,
                    policyVersion: item.data.policyVersion,
                  },
                })
              ) {
                consents.reload();
                setEstimate(undefined);
              }
            }}
          >
            {item.data.granted ? "Revocar permiso" : "Autorizar"}
          </Button>
        </details>
      ))}
      {analysis.data.granted && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const size = form.get("size");
            const data = await write.run<Estimate>({
              path: `${activityPath(activity.id)}/estimates`,
              revision,
              body: {
                excerpt: form.get("excerpt"),
                ...(size ? { workloadSize: size } : {}),
              },
            });
            if (data) {
              setEstimate(data);
              pending.reload();
            }
          }}
        >
          <Field label="Fragmento del enunciado">
            <textarea required name="excerpt" maxLength={2400} />
          </Field>
          <Field label="Tamaño">
            <select name="size">
              <option value="">Por confirmar</option>
              <option value="small">Pequeño</option>
              <option value="medium">Mediano</option>
              <option value="large">Grande</option>
            </select>
          </Field>
          <label className="check-field">
            <input type="checkbox" required />
            Revisé el fragmento y retiré los datos personales.
          </label>
          <Button
            type="submit"
            disabled={
              write.busy ||
              result?.state === "pending" ||
              result?.state === "outcome_unknown"
            }
          >
            Solicitar rango
          </Button>
        </form>
      )}
      {pending.error && <LoadState {...pending} />}
      {result?.state === "pending" && (
        <p role="status">Consultando la estimación…</p>
      )}
      {result &&
        (result.state === "failed" || result.state === "outcome_unknown") && (
          <Notice tone="warning" title="La estimación no está disponible">
            Puedes ingresar el esfuerzo manualmente.
          </Notice>
        )}
      {suggestion && suggestion.status !== "estimated" && (
        <Notice
          title={
            suggestion.status === "needs_context"
              ? "Falta contexto en el enunciado"
              : "No hay una estimación suficiente"
          }
        >
          Completa el fragmento o ingresa el esfuerzo manualmente.
        </Notice>
      )}
      {result &&
        suggestion?.status === "estimated" &&
        analysis.data.granted && (
          <form
            key={result.id}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              if (
                await write.run({
                  path: `/estimates/${segment(result.id)}/apply`,
                  revision,
                  body: {
                    decision: form.get("decision"),
                    selectedMinutes: Number(form.get("minutes")),
                    origin: result.origin,
                  },
                })
              )
                reload();
            }}
          >
            <p>
              {minutesLabel(suggestion.lowMinutes)} —{" "}
              {minutesLabel(suggestion.highMinutes)} ·{" "}
              {result.origin === "personalized" ? "Personalizada" : "General"}
            </p>
            {!!suggestion.factors.length && (
              <p>
                {suggestion.factors
                  .map((factor) => FACTORS[factor])
                  .join(" · ")}
              </p>
            )}
            {result.calibration?.warning && (
              <Notice title={result.calibration.warning} />
            )}
            <Field label="Tiempo elegido (minutos)">
              <input
                name="minutes"
                type="number"
                required
                min={1}
                defaultValue={suggestion.lowMinutes ?? undefined}
              />
            </Field>
            <Field label="Decisión">
              <select name="decision">
                <option value="accept">Aceptar dentro del rango</option>
                <option value="correct">Corregir la estimación</option>
              </select>
            </Field>
            <Button type="submit" disabled={write.busy}>
              Confirmar esfuerzo
            </Button>
          </form>
        )}
      <WriteState {...write} reload={reload} />
    </>
  );
}
