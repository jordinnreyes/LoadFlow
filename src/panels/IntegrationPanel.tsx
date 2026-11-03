import { useEffect, useRef, useState } from "react";
import { useApp } from "../state";
import { googleCommitments } from "../demo";
import { Badge, Button, Field, Icon, Modal, Notice } from "../components/ui";
import type { Propose } from "../actions";
import type { CalendarState } from "../model";

export default function IntegrationPanel({
  welcome,
  onClose,
  onPropose,
}: {
  welcome: boolean;
  onClose: () => void;
  onPropose: Propose;
}) {
  const { workspace } = useApp();
  const w = workspace!;
  const [calendars, setCalendars] = useState(w.calendars);
  const [busy, setBusy] = useState(false);
  const [disconnect, setDisconnect] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const connect = () => {
    setBusy(true);
    timer.current = window.setTimeout(() => {
      onPropose(
        {
          ...w,
          calendar: "connected",
          calendars,
          lastCalendarUpdate: "2 nov. 2026 · 08:00 (simulado)",
          manualCoverage: false,
          commitments: [
            ...w.commitments.filter((c) => c.source !== "google"),
            ...googleCommitments(),
          ],
        },
        "Conectar Calendar de demostración y revisar ocupaciones",
        { immediate: true },
      );
      setBusy(false);
      onClose();
    }, 400);
  };
  const manual = () => {
    const snapshots = w.commitments
      .filter(
        (c) =>
          c.source === "google" &&
          w.calendars.includes(c.calendar || "Universidad"),
      )
      .map((c) => ({
        ...c,
        id: `manual-${c.id}`,
        source: "manual" as const,
        title: "Ocupación conservada para revisión manual",
      }));
    onPropose(
      {
        ...w,
        calendar: "manual",
        manualCoverage: false,
        availabilityConfirmed: false,
        commitments: [
          ...w.commitments.filter((c) => c.source !== "google"),
          ...snapshots,
        ],
      },
      "Desconectar Calendar; disponibilidad manual pendiente de confirmar",
      { immediate: true },
    );
    onClose();
  };
  const labels: Record<CalendarState, string> = {
    manual: "No conectado · modo manual",
    connected: "Conectado · actualizado",
    stale: "Fuente desactualizada",
    revoked: "Permiso revocado",
    error: "Error de lectura",
  };
  return (
    <Modal
      title={welcome ? "Tu tiempo, con contexto" : "Google Calendar"}
      eyebrow={
        welcome ? "BIENVENIDA · PASO OPCIONAL" : "CONEXIÓN DE DEMOSTRACIÓN"
      }
      onClose={onClose}
    >
      <div className="integration-visual">
        <Icon name="calendar" size={36} />
        <span>+</span>
        <Icon name="book" size={36} />
      </div>
      <p className="integration-intro">
        Considera tus compromisos sin volver a ingresarlos.
      </p>
      <p className="muted">
        La integración del producto consulta horarios ocupados. No crea ni
        modifica eventos, ni necesita títulos privados. Aquí solo cargaremos
        intervalos ficticios.
      </p>
      <Badge
        tone={
          w.calendar === "manual"
            ? "neutral"
            : w.calendar === "connected"
              ? "success"
              : "warning"
        }
        icon="calendar"
      >
        {labels[w.calendar]}
      </Badge>
      {w.lastCalendarUpdate && (
        <p className="tiny muted">Última consulta: {w.lastCalendarUpdate}</p>
      )}
      {!disconnect ? (
        <>
          <div className="calendar-selection">
            <h3>Calendarios de ejemplo</h3>
            {["Universidad", "Personal"].map((name) => (
              <label className="check-field" key={name}>
                <input
                  type="checkbox"
                  checked={calendars.includes(name)}
                  onChange={(e) =>
                    setCalendars(
                      e.target.checked
                        ? [...calendars, name]
                        : calendars.filter((x) => x !== name),
                    )
                  }
                />
                <span>
                  <strong>{name}</strong>
                  <small>
                    {name === "Universidad"
                      ? "Clases y reuniones ficticias"
                      : "Horarios ocupados personales ficticios"}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <Notice title="Tu inicio con Google no autoriza Calendar">
            Este paso es separado y opcional. Puedes usar ventanas y compromisos
            manuales.
          </Notice>
          <div className="form-actions">
            <Button onClick={onClose}>{welcome ? "Ahora no" : "Volver"}</Button>
            {w.calendar !== "manual" && (
              <Button variant="ghost" onClick={() => setDisconnect(true)}>
                Desconectar
              </Button>
            )}
            <Button
              variant="primary"
              icon="calendar"
              onClick={connect}
              disabled={busy || !calendars.length}
            >
              {busy
                ? "Cargando ocupación ficticia…"
                : w.calendar === "manual"
                  ? "Conectar seleccionados (simulado)"
                  : "Actualizar ocupación simulada"}
            </Button>
          </div>
          {!calendars.length && (
            <p className="tiny">
              Elige al menos un calendario de ejemplo o continúa en modo manual.
            </p>
          )}
          {!welcome && w.calendar !== "manual" && (
            <details className="demo-state-options">
              <summary>Estados para revisión del prototipo</summary>
              <Field label="Simular estado de la fuente">
                <select
                  value={w.calendar}
                  onChange={(e) =>
                    onPropose(
                      {
                        ...w,
                        calendar: e.target.value as CalendarState,
                        manualCoverage: false,
                      },
                      "Cambiar estado de fuente de demostración",
                      { immediate: true },
                    )
                  }
                >
                  <option value="connected">Conectado y actualizado</option>
                  <option value="stale">Conectado pero desactualizado</option>
                  <option value="revoked">Permiso revocado</option>
                  <option value="error">Error de lectura</option>
                </select>
              </Field>
            </details>
          )}
        </>
      ) : (
        <>
          <Notice
            tone="warning"
            title="Revisa tu disponibilidad al desconectar"
          >
            No habrá nuevas consultas. Conservaremos los últimos intervalos como
            ocupaciones manuales para revisión y no afirmaremos viabilidad hasta
            que confirmes tus ventanas.
          </Notice>
          <div className="form-actions">
            <Button onClick={() => setDisconnect(false)}>
              Mantener conexión simulada
            </Button>
            <Button variant="danger" onClick={manual}>
              Desconectar y revisar manualmente
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
