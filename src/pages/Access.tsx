import { useState } from "react";
import { useApp } from "../state";
import { navigate } from "../navigation";
import { Badge, Button, Field, Icon, Notice } from "../components/ui";

export default function Access({ onWelcome }: { onWelcome: () => void }) {
  const { login, hasProfile } = useApp();
  const [mode, setMode] = useState<"new" | "existing">("existing");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<"Free" | "Premium">("Free");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const enter = (method: string, preset?: string) => {
    const address = preset || email || `${plan.toLowerCase()}@ejemplo.test`;
    if (method === "correo" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setMessage(
        "Escribe un correo de ejemplo válido, como alex@ejemplo.test.",
      );
      return;
    }
    const newAccount = mode === "new" && !hasProfile(address);
    setBusy(true);
    setMessage("");
    window.setTimeout(() => {
      login(newAccount ? "new" : "existing", plan, address, method);
      navigate("/tablero");
      setBusy(false);
      if (newAccount) onWelcome();
    }, 350);
  };
  return (
    <main className="access-page">
      <section className="access-story">
        <a href="#/acceso" className="brand">
          <span className="brand-mark">
            <Icon name="book" size={24} />
          </span>
          WiseLoad
        </a>
        <div className="story-content">
          <Badge tone="info" icon="book">
            Tu espacio académico
          </Badge>
          <h1>
            Tu semana,
            <br />
            con perspectiva.
          </h1>
          <p>
            Entiende tu carga, encuentra espacio para estudiar y reorganiza tu
            plan cuando la vida cambia.
          </p>
          <div className="story-week">
            <div className="row-between">
              <strong>Una semana más clara</strong>
              <Icon name="calendar" />
            </div>
            <div className="story-line">
              <span className="story-check">
                <Icon name="check" size={16} />
              </span>
              <div>
                <strong>Parcial de Física</strong>
                <small>Preparación distribuida en 3 sesiones</small>
              </div>
              <span>6 h</span>
            </div>
            <div className="story-bars">
              {[45, 70, 38, 60, 22, 12, 5].map((h, i) => (
                <div key={i}>
                  <span style={{ height: h }} />
                  <small>{["L", "M", "M", "J", "V", "S", "D"][i]}</small>
                </div>
              ))}
            </div>
            <p className="tiny muted">
              Ilustración de datos ficticios, sin conexión externa.
            </p>
          </div>
        </div>
        <p className="story-footer">
          Más claridad para decidir. Un plan que puedes ajustar.
        </p>
      </section>
      <section className="access-form">
        <Badge tone="neutral">Prototipo interactivo · datos ficticios</Badge>
        <div className="access-form-inner">
          <div className="segmented">
            <button
              className={mode === "existing" ? "active" : ""}
              onClick={() => setMode("existing")}
            >
              Iniciar sesión
            </button>
            <button
              className={mode === "new" ? "active" : ""}
              onClick={() => setMode("new")}
            >
              Crear cuenta
            </button>
          </div>
          <h2>
            {mode === "existing"
              ? "Qué bueno verte de nuevo"
              : "Empieza con una semana clara"}
          </h2>
          <p className="muted">
            {mode === "existing"
              ? "Entra a un perfil de ejemplo y explora tu planificación."
              : "Crea un perfil local de demostración. No necesitas datos reales."}
          </p>
          <Button
            variant="primary"
            className="full"
            onClick={() => enter("Google")}
            disabled={busy}
          >
            <span className="google-g" aria-hidden="true">
              G
            </span>
            {busy ? "Abriendo perfil…" : "Continuar con Google"}
            <span className="recommended">Recomendado</span>
          </Button>
          <p className="tiny muted">
            Acceso simulado. No se abrirá Google ni se solicitarán permisos.
          </p>
          <div className="divider-text">o continúa con correo</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enter("correo");
            }}
          >
            <Field label="Correo de demostración">
              <input
                type="email"
                value={email}
                placeholder="alex@ejemplo.test"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Perfil de ejemplo">
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as "Free" | "Premium")}
              >
                <option>Free</option>
                <option>Premium</option>
              </select>
            </Field>
            {message && <Notice tone="warning" title={message} />}
            <Button type="submit" className="full" disabled={busy}>
              {mode === "new"
                ? "Crear perfil con correo"
                : "Continuar con correo"}
            </Button>
          </form>
          <button
            className="text-link recovery"
            onClick={() =>
              setMessage(
                "Recuperación simulada: usa de nuevo el mismo correo local. No enviamos mensajes ni verificamos identidades.",
              )
            }
          >
            ¿Necesitas recuperar el acceso?
          </button>
          <div className="demo-hint">
            <Icon name="info" />
            <p>
              Todo se conserva en este navegador. Los perfiles de ejemplo no son
              cuentas reales ni se sincronizan entre dispositivos.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
