import { useState } from "react";
import { useApp } from "../state";
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

export default function Settings({
  onIntegration,
  onConflict,
}: {
  onIntegration: () => void;
  onConflict: () => void;
}) {
  const { workspace, save, logout, scenario } = useApp();
  const w = workspace!;
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
            <Notice title="Guardado solo en este navegador">
              No hay autenticación, backend ni sincronización real entre
              dispositivos. El cierre de sesión oculta la información del perfil
              en la interfaz; no es un sistema de seguridad real.
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
          <section className="surface" id="planes">
            <div className="row-between">
              <h2>Free y Premium</h2>
              <Badge tone="neutral">Demostración sin pagos</Badge>
            </div>
            <p className="muted">
              El núcleo de planificación está disponible en ambos planes.
            </p>
            <div className="plan-switch segmented">
              <button
                className={w.plan === "Free" ? "active" : ""}
                onClick={() => save({ ...w, plan: "Free" })}
              >
                Demostrar Free
              </button>
              <button
                className={w.plan === "Premium" ? "active" : ""}
                onClick={() => save({ ...w, plan: "Premium" })}
              >
                Demostrar Premium
              </button>
            </div>
            <div className="plan-comparison">
              <div>
                <Icon name="check" />
                <span>Importar PDF/Excel, corregir e ingresar horas</span>
                <strong>Ambos</strong>
              </div>
              <div>
                <Icon name="check" />
                <span>Prioridades, calendario, sesiones y reajustes</span>
                <strong>Ambos</strong>
              </div>
              <div>
                <Icon name="check" />
                <span>Registrar y corregir dedicación real</span>
                <strong>Ambos</strong>
              </div>
              <div>
                <Icon name="spark" />
                <span>Sugerencia orientativa desde el enunciado</span>
                <strong>Premium</strong>
              </div>
              <div>
                <Icon name="spark" />
                <span>Personalización con historial elegible</span>
                <strong>Premium</strong>
              </div>
            </div>
            <p className="tiny muted">
              Al pasar a Free se conservan actividades, sesiones, horas
              operativas e historial. No hay precios, cuotas ni condiciones
              comerciales aprobadas.
            </p>
            <label className="check-field">
              <input
                type="checkbox"
                checked={w.historyConsent}
                onChange={(e) =>
                  save({ ...w, historyConsent: e.target.checked })
                }
              />
              Permito usar el historial ficticio para mostrar una sugerencia
              personalizada de ejemplo
            </label>
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
            {w.plan === "Premium" && (
              <Notice
                title={
                  w.personalEligible
                    ? "Este escenario representa historial comparable suficiente"
                    : "Este perfil todavía usa sugerencias generales"
                }
              >
                La elegibilidad es un dato explícito del escenario, no un umbral
                de producto inventado. No se consulta IA.
              </Notice>
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
              Usa datos ficticios. Todo se guarda localmente en este navegador;
              no hay subida de documentos, correo, OAuth, IA ni pagos.
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
