import { Icon } from "./ui";
import { formatMinutes } from "../rules";

const HOURS = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 });

export function LoadChart({
  days,
  study,
  group,
  capacity,
  state,
  index,
  status,
  onReview,
}: {
  days: {
    label: string;
    date: string;
    capacity: number;
    study: number;
    group: number;
    unplaced: number;
    total: number;
  }[];
  study: number;
  group: number;
  capacity: number | null;
  state: string;
  index: number;
  status: string;
  onReview: () => void;
}) {
  const unplaced = days.reduce((sum, day) => sum + day.unplaced, 0);
  const total = study + group + unplaced;
  const hasCapacity = capacity !== null;
  const excess = capacity === null ? 0 : Math.max(0, total - capacity);
  const ceiling = Math.max(
    60,
    ...days.map((d) => Math.max(d.total, d.capacity)),
  );
  const height = (minutes: number) => `${(minutes / ceiling) * 100}%`;
  const critical = state === "deficit" || state === "conflict";
  return (
    <section
      className={`ledger-load ledger-${state}`}
      aria-label="Resumen gráfico de la semana seleccionada"
    >
      <div className="ledger-top">
        <strong>
          <Icon name={critical ? "warning" : "clock"} size={15} /> {status}
        </strong>
        <span>Semana {String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="ledger-readout">
        <div>
          <span>
            {unplaced ? "Carga estimada" : "Horas reservadas"} / Disponibilidad
          </span>
          <div className="ledger-total">
            {HOURS.format(total / 60)}
            <small> h</small>
            <span>
              {" "}
              /{" "}
              {hasCapacity ? `${HOURS.format(capacity / 60)} h` : "Por definir"}
            </span>
          </div>
        </div>
        {excess > 0 && (
          <strong className="ledger-excess">
            +{formatMinutes(excess)} de exceso
            {capacity !== null &&
              capacity > 0 &&
              ` · ${Math.round((total / capacity) * 100)}% de la capacidad`}
          </strong>
        )}
      </div>
      <div className="ledger-chart-header">
        <span>Horas por día</span>
        {hasCapacity && <span>┄ Capacidad del día</span>}
      </div>
      <figure
        className="ledger-chart"
        aria-label="Horas por día de estudio. Las horas sin ubicar se muestran en el día de su plazo."
      >
        <div className="ledger-days">
          {days.map((d) => (
            <div
              className="ledger-day"
              role="group"
              key={d.date}
              aria-label={`${d.label}: ${formatMinutes(d.study)} programadas, ${formatMinutes(d.group)} tentativas, ${formatMinutes(d.unplaced)} sin ubicar${hasCapacity ? `, ${formatMinutes(d.capacity)} de capacidad` : ""}`}
            >
              <div className="ledger-day-plot" aria-hidden="true">
                <div
                  className="ledger-stack"
                  style={{ height: height(d.total) }}
                >
                  {d.study > 0 && (
                    <i
                      style={{ flexGrow: d.study }}
                      className="ledger-scheduled"
                    />
                  )}
                  {d.group > 0 && (
                    <i
                      style={{ flexGrow: d.group }}
                      className="ledger-tentative"
                    />
                  )}
                  {d.unplaced > 0 && (
                    <i
                      style={{ flexGrow: d.unplaced }}
                      className="ledger-unplaced"
                    />
                  )}
                  <span className={d.unplaced ? "ledger-over-value" : ""}>
                    {HOURS.format(d.total / 60)} h
                  </span>
                </div>
                {hasCapacity && (
                  <i
                    className="ledger-limit"
                    style={{ bottom: height(d.capacity) }}
                  />
                )}
              </div>
              <span className="ledger-day-label" aria-hidden="true">
                {d.label}
              </span>
            </div>
          ))}
        </div>
        <figcaption className="ledger-key">
          <span>
            <i className="ledger-scheduled" /> Estudio programado
          </span>
          {group > 0 && (
            <span>
              <i className="ledger-tentative" /> Reservas tentativas
            </span>
          )}
          {unplaced > 0 && (
            <span>
              <i className="ledger-unplaced" /> Sin ubicar, por fecha de plazo
            </span>
          )}
        </figcaption>
      </figure>
      {(critical || unplaced > 0) && (
        <div className="ledger-detail">
          <span>
            {unplaced > 0
              ? `${formatMinutes(unplaced)} sin ubicar antes de los plazos`
              : "Hay restricciones en conflicto"}
          </span>
          <button className="text-link" onClick={onReview}>
            Ver carga y opciones <Icon name="arrow" size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
