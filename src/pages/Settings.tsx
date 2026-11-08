import { useState } from "react";
import { useApp } from "../state";
import { AppearanceSettings } from "../components/AppearanceSettings";
import { SCENARIOS } from "../demo";
import { navigate } from "../navigation";
import {
  Badge,
  Button,
  Icon,
  Modal,
  Notice,
  SectionHeading,
} from "../components/ui";
import { formatMinutes } from "../rules";

const FREE_FEATURES = [
  [
    "Organizar tus actividades",
    "Importa PDF o Excel, revisa lo extraído y añade actividades manualmente.",
  ],
  [
    "Planificar tu semana",
    "Configura tu disponibilidad y prioridades, conecta Calendar de forma opcional y revisa las sesiones y los reajustes.",
  ],
  [
    "Registrar tu dedicación",
    "Indica el esfuerzo estimado y registra o corrige las horas que realmente dedicaste.",
  ],
];

const PREMIUM_FEATURES = [
  {
    title: "Estimar desde el enunciado",
    summary: "Obtén un rango de tiempo para la actividad.",
    detail:
      "La IA usa el fragmento del enunciado que revisas y autorizas. Si el contexto es insuficiente, puedes completarlo o indicar las horas manualmente.",
  },
  {
    title: "Entender la sugerencia",
    summary: "Consulta qué factores influyeron en el rango.",
    detail:
      "Puedes revisar los factores detectados en el enunciado y el origen del rango que ves, ya sea general o ajustado con tu historial.",
  },
  {
    title: "Ajustar con tu historial",
    summary: "Usa tus horas reales para afinar la estimación.",
    detail:
      "Con tu permiso, el rango se puede ajustar desde una actividad individual comparable que ya terminaste. Se compara por curso, tipo y tamaño. Con una o dos comparables se indica cuántas respaldan el ajuste. A partir de tres, el aviso desaparece.",
  },
  {
    title: "Aceptar o corregir la estimación",
    summary: "Tú eliges cuánto tiempo usar en tu plan.",
    detail:
      "Puedes elegir un tiempo del rango o corregirlo. El esfuerzo cambia cuando lo confirmas. Si afecta las sesiones, revisas la propuesta de reajuste por separado.",
  },
];

export default function Settings({
  onIntegration,
  onConflict,
}: {
  onIntegration: () => void;
  onConflict: () => void;
}) {
  const { workspace, save, logout, scenario } = useApp();
  const w = workspace!;
  const premium = w.plan === "Premium";
  const [scenarioId, setScenarioId] = useState("");
  const [remove, setRemove] = useState<string | null>(null);
  return (
    <>
      <SectionHeading
        eyebrow="CUENTA Y PREFERENCIAS"
        title="Tu espacio, a tu manera"
      >
        Revisa tus fuentes, preferencias y el alcance de esta demostración.
      </SectionHeading>
      <div className="settings-layout">
        <div className="settings-main">
          <section className="surface">
            <div className="account-summary">
              <span className="avatar large">
                {w.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h2>{w.name}</h2>
                <p>{w.email}</p>
              </div>
              <Badge tone={w.plan === "Premium" ? "premium" : "neutral"}>
                {w.plan} · perfil ficticio
              </Badge>
            </div>
            <Notice title="Perfil de demostración">
              Los cambios de la demostración se guardan en este navegador. Usa
              datos ficticios para explorar la interfaz.
            </Notice>
            <div className="form-actions">
              <Button
                icon="logout"
                onClick={() => {
                  logout();
                  navigate("/acceso");
                }}
              >
                Cerrar sesión simulada
              </Button>
            </div>
          </section>
          <AppearanceSettings />
          <section className="surface">
            <h2>Preferencias de planificación</h2>
            <div className="settings-link-list">
              <button onClick={() => navigate("/disponibilidad")}>
                <Icon name="clock" />
                <span>
                  <strong>Disponibilidad y sesiones</strong>
                  <small>Ventanas, excepciones y duración de los bloques</small>
                </span>
                <Icon name="chevron" />
              </button>
              <button onClick={() => navigate("/prioridades")}>
                <Icon name="book" />
                <span>
                  <strong>Periodo, cursos y prioridades</strong>
                  <small>Herencia por curso y tipo, con excepciones</small>
                </span>
                <Icon name="chevron" />
              </button>
              <button onClick={onIntegration}>
                <Icon name="calendar" />
                <span>
                  <strong>Google Calendar simulado</strong>
                  <small>
                    {w.calendar === "manual"
                      ? "No conectado · modo manual"
                      : w.calendar === "connected"
                        ? "Conectado · ocupación de ejemplo"
                        : "Fuente sin actualizar"}
                  </small>
                </span>
                <Icon name="chevron" />
              </button>
            </div>
          </section>
          <section
            className="surface plan-settings"
            id="planes"
            aria-labelledby="plans-title"
          >
            <div className="plan-settings-header">
              <h2 id="plans-title">Free y Premium</h2>
              <Badge tone="neutral">Demostración sin pagos</Badge>
            </div>
            <div
              className="plan-switch segmented"
              role="group"
              aria-label="Elegir plan de demostración"
            >
              <button
                type="button"
                className={!premium ? "active" : ""}
                aria-pressed={!premium}
                onClick={() => save({ ...w, plan: "Free" })}
              >
                Demostrar Free
              </button>
              <button
                type="button"
                className={premium ? "active" : ""}
                aria-pressed={premium}
                onClick={() => save({ ...w, plan: "Premium" })}
              >
                Demostrar Premium
              </button>
            </div>
            {premium ? (
              <div className="plan-benefits">
                <div>
                  <h3>Estimaciones con IA</h3>
                  <p className="muted">
                    Premium incluye todo Free y añade estas opciones de
                    estimación.
                  </p>
                </div>
                <div className="premium-features">
                  {PREMIUM_FEATURES.map(({ title, summary, detail }) => (
                    <details key={title} name="premium-benefit">
                      <summary>
                        <span>
                          <strong>{title}</strong>
                          <small>{summary}</small>
                        </span>
                        <Icon name="chevron" size={16} />
                      </summary>
                      <p>{detail}</p>
                    </details>
                  ))}
                </div>
                <div className="plan-history-preference">
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={w.historyConsent}
                      onChange={(e) =>
                        save({ ...w, historyConsent: e.target.checked })
                      }
                    />
                    Permitir el uso de mi historial ficticio para probar
                    sugerencias personalizadas
                  </label>
                  <small className="muted">
                    {w.personalEligible && w.historyConsent
                      ? "Este escenario puede mostrar una sugerencia personalizada de ejemplo."
                      : "En este estado, la demostración usa sugerencias generales."}
                  </small>
                </div>
                <p className="tiny muted">
                  Al volver a Free se conservan tus actividades, sesiones, horas
                  e historial.
                </p>
              </div>
            ) : (
              <div className="plan-benefits">
                <div>
                  <h3>Planificación y seguimiento</h3>
                  <p className="muted">
                    Organiza tu carga y lleva un registro de tu progreso.
                  </p>
                </div>
                <ul className="free-features">
                  {FREE_FEATURES.map(([title, detail]) => (
                    <li key={title}>
                      <Icon name="check" size={16} />
                      <span>
                        <strong>{title}</strong>
                        <small>{detail}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <section className="surface">
            <h2>Dedicación registrada</h2>
            <p className="muted">
              Las horas reales pertenecen a tu historial en ambos planes.
            </p>
            {w.activities
              .filter((a) => a.real !== null)
              .map((a) => (
                <div className="history-row" key={a.id}>
                  <span>
                    <strong>{a.title}</strong>
                    <small>{a.course}</small>
                  </span>
                  <strong>{formatMinutes(a.real!)}</strong>
                  <Button onClick={() => navigate(`/calendario/${a.id}`)}>
                    Corregir
                  </Button>
                </div>
              ))}
            {w.history.map((h, i) => (
              <div className="history-row" key={i}>
                <span>
                  <strong>{h.title}</strong>
                  <small>
                    {h.course} · {h.date} · registro ficticio
                  </small>
                </span>
                <div>
                  <strong>{formatMinutes(h.real)}</strong>
                  <small>Estimada: {formatMinutes(h.estimated)}</small>
                </div>
              </div>
            ))}
            {!w.history.length &&
              !w.activities.some((a) => a.real !== null) && (
                <p className="muted">
                  Aún no hay horas reales registradas. Puedes anotarlas al
                  avanzar o completar una actividad.
                </p>
              )}
          </section>
          <section className="surface">
            <h2>Documentos y borradores</h2>
            {w.documents.map((d) => (
              <div className="document-row" key={d.id}>
                <Icon name="file" />
                <div>
                  <strong>{d.name}</strong>
                  <small>
                    {d.activityIds.length} actividades asociadas · fuente
                    ficticia
                  </small>
                </div>
                <Button variant="ghost" onClick={() => setRemove(d.id)}>
                  Retirar fuente
                </Button>
              </div>
            ))}
            {!w.documents.length && (
              <p className="muted">Todavía no hay documentos confirmados.</p>
            )}
            <div className="form-actions">
              <Button onClick={() => navigate("/importar")}>
                {w.drafts.length
                  ? `Retomar ${w.drafts.length} borradores`
                  : "Importar ejemplo"}
              </Button>
            </div>
          </section>
          <section className="surface">
            <h2>Ayuda y privacidad</h2>
            <p>
              En la demostración los documentos, el correo, Calendar y las
              sugerencias de IA se muestran con ejemplos.
            </p>
            <p className="muted">
              Retención, exportación y eliminación de cuenta reales requieren
              políticas pendientes. Retirar una fuente no elimina
              silenciosamente actividades.
            </p>
            <Button
              icon="info"
              onClick={() => {
                save({ ...w, guide: true });
                navigate("/tablero");
              }}
            >
              Reabrir guía contextual
            </Button>
          </section>
        </div>
        <aside>
          <section className="aside-card demo-controls">
            <Badge tone="info">Herramientas del prototipo</Badge>
            <h3>Explora otros escenarios</h3>
            <p>
              Cada escenario reemplaza el plan local de este perfil. No modifica
              otros perfiles.
            </p>
            <div className="scenario-list">
              {SCENARIOS.map((s) => (
                <button key={s.id} onClick={() => setScenarioId(s.id)}>
                  <strong>{s.name}</strong>
                  <small>{s.detail}</small>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
            </div>
            <Button className="full" onClick={onConflict}>
              Simular conflicto entre versiones
            </Button>
            {premium && (
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={w.premiumUnavailable}
                  onChange={(e) =>
                    save({ ...w, premiumUnavailable: e.target.checked })
                  }
                />
                Simular sugerencias Premium no disponibles
              </label>
            )}
          </section>
        </aside>
      </div>
      {scenarioId && (
        <Modal
          title="Cargar escenario de demostración"
          onClose={() => setScenarioId("")}
        >
          <Notice
            tone="warning"
            title={`Reemplazar el plan por «${SCENARIOS.find((s) => s.id === scenarioId)?.name}»`}
          >
            Se reemplazan actividades, borradores y preferencias de este perfil
            local. Esta acción sirve para reiniciar la revisión; no representa
            una operación del producto real.
          </Notice>
          <div className="form-actions">
            <Button onClick={() => setScenarioId("")}>Conservar mi plan</Button>
            <Button
              variant="primary"
              onClick={() => {
                scenario(scenarioId);
                setScenarioId("");
                navigate("/tablero");
              }}
            >
              Cargar escenario
            </Button>
          </div>
        </Modal>
      )}
      {remove && (
        <Modal
          title="Retirar documento de ejemplo"
          onClose={() => setRemove(null)}
        >
          <p>{w.documents.find((d) => d.id === remove)?.name}</p>
          <Notice title="Se conservarán las actividades confirmadas y su procedencia histórica">
            Esta acción solo retira la fuente de la lista local. No elimina
            obligaciones ni horas reales. Es el supuesto de diseño SUP-10,
            sujeto a revisión de políticas.
          </Notice>
          <div className="form-actions">
            <Button onClick={() => setRemove(null)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => {
                save({
                  ...w,
                  documents: w.documents.filter((d) => d.id !== remove),
                });
                setRemove(null);
              }}
            >
              Retirar fuente y conservar actividades
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
