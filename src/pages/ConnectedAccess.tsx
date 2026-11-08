import { useState, type FormEvent } from "react";
import { api, apiMessage, type EmailChallenge } from "../api/client";
import { Badge, Button, Field, Icon, Notice } from "../components/ui";

export default function ConnectedAccess({
  onSession,
}: {
  onSession: () => void;
}) {
  const emailEnabled =
    !document.documentElement.hasAttribute("data-google-only");
  const [intent, setIntent] = useState<"register" | "login">("login");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<EmailChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const google = new URLSearchParams(window.location.hash.split("?")[1]).get(
    "google",
  );

  async function requestCode() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.challenge({ email: email.trim(), intent });
      setChallenge(data);
      setCode("");
    } catch (failure) {
      setError(apiMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) {
      await requestCode();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.verify({ challengeId: challenge.challengeId, code });
      onSession();
    } catch (failure) {
      setError(apiMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="access-page">
      <section className="access-story">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="book" size={24} />
          </span>
          WiseLoad
        </div>
        <div className="story-content">
          <h1>
            Tu semana,
            <br />
            con perspectiva.
          </h1>
          <p>Entiende tu carga y encuentra espacio para estudiar.</p>
        </div>
      </section>
      <section className="access-form">
        <Badge tone="info">Tu cuenta WiseLoad</Badge>
        <div className="access-form-inner">
          {emailEnabled && !challenge && (
            <div className="segmented" role="group" aria-label="Tipo de acceso">
              <button
                type="button"
                className={intent === "login" ? "active" : ""}
                aria-pressed={intent === "login"}
                disabled={busy}
                onClick={() => {
                  setIntent("login");
                  setError("");
                }}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                className={intent === "register" ? "active" : ""}
                aria-pressed={intent === "register"}
                disabled={busy}
                onClick={() => {
                  setIntent("register");
                  setError("");
                }}
              >
                Crear cuenta
              </button>
            </div>
          )}
          <h2>
            {!emailEnabled
              ? "Ingresa con tu cuenta de Google"
              : challenge
                ? "Verifica tu correo"
                : intent === "login"
                  ? "Ingresa con tu correo"
                  : "Crea tu cuenta con correo"}
          </h2>
          {challenge && <p role="status">{challenge.message}</p>}
          {!challenge && (
            <>
              <a
                className="button primary full"
                href="/api/v1/auth/google/start"
              >
                Continuar con Google
              </a>
              {google && (
                <Notice
                  tone="warning"
                  title={
                    google === "busy"
                      ? "Hay muchos intentos de acceso. Vuelve a intentarlo en unos minutos."
                      : google === "unavailable"
                        ? "Google no está configurado en este entorno"
                        : "No se completó el acceso con Google"
                  }
                >
                  {emailEnabled
                    ? "Puedes continuar con correo."
                    : "Vuelve a intentar el acceso."}
                </Notice>
              )}
              {emailEnabled && (
                <div className="divider-text">o continúa con correo</div>
              )}
            </>
          )}
          {emailEnabled && (
            <form onSubmit={submit} aria-busy={busy}>
              {challenge ? (
                <Field label="Código de verificación">
                  <input
                    type="text"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </Field>
              ) : (
                <Field label="Correo electrónico">
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
              )}
              {error && (
                <div role="alert">
                  <Notice tone="danger" title={error} />
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                className="full"
                disabled={busy}
              >
                {busy
                  ? "Un momento…"
                  : challenge
                    ? "Verificar código"
                    : "Enviar código"}
              </Button>
            </form>
          )}
          {!emailEnabled && (
            <p>
              <a href="/privacidad">Política de privacidad</a>
            </p>
          )}
          {challenge && (
            <div className="form-actions">
              <Button variant="ghost" onClick={requestCode} disabled={busy}>
                Reenviar código
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setChallenge(null);
                  setCode("");
                  setError("");
                }}
              >
                Cambiar correo
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
