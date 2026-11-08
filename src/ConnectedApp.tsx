import { useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  apiMessage,
  type Capabilities,
  type PeriodPage,
  type Session,
} from "./api/client";
import { AppearanceSettings } from "./components/AppearanceSettings";
import {
  Badge,
  Button,
  Field,
  Icon,
  Modal,
  Notice,
  SectionHeading,
} from "./components/ui";
import ConnectedAccess from "./pages/ConnectedAccess";
import { ConnectedWeek } from "./pages/connected/ConnectedWeek";
import { ConnectedActivity } from "./pages/connected/ConnectedActivity";
import {
  ConnectedSettings,
  ConnectedCourses,
} from "./pages/connected/ConnectedSettings";
import { ConnectedAvailability } from "./pages/connected/ConnectedAvailability";
import { ConnectedImports } from "./pages/connected/ConnectedImports";
import {
  localDate,
  monday,
  WriteState,
  type Screen,
} from "./pages/connected/shared";
import { navigate, setNavigationGuard, useRoute } from "./navigation";
import { useWrite } from "./api/useWrite";

type Account = {
  session: Session;
  capabilities: Capabilities;
  periods: PeriodPage;
  serverTime: string | null;
};
type Connection =
  | { state: "loading" | "signed-out" }
  | { state: "error"; message: string }
  | { state: "ready"; account: Account };

export default function ConnectedApp() {
  const [connection, setConnection] = useState<Connection>({
    state: "loading",
  });
  const [refresh, setRefresh] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        const { data: session, serverTime } = await api.session(abort.signal);
        const [{ data: capabilities }, { data: periods }] = await Promise.all([
          api.capabilities(abort.signal),
          api.periods(abort.signal),
        ]);
        if (abort.signal.aborted) return;
        if (
          !window.location.hash ||
          /^#\/(acceso|cuenta)/.test(window.location.hash)
        )
          window.history.replaceState(null, "", "#/tablero");
        setConnection({
          state: "ready",
          account: { session, capabilities, periods, serverTime },
        });
      } catch (error) {
        if (abort.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          if (!/^#\/acceso(?:\?|$)/.test(window.location.hash))
            window.history.replaceState(null, "", "#/acceso");
          setConnection({ state: "signed-out" });
        } else {
          setConnection({ state: "error", message: apiMessage(error) });
        }
      }
    }
    void load();
    return () => abort.abort();
  }, [refresh]);

  const reload = () => {
    setConnection({ state: "loading" });
    setRefresh((value) => value + 1);
  };

  async function logout(session: Session) {
    setLeaving(true);
    setLogoutError("");
    try {
      await api.logout(session.csrfToken);
      reload();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) reload();
      else setLogoutError(apiMessage(error));
    } finally {
      setLeaving(false);
    }
  }

  if (connection.state === "signed-out")
    return <ConnectedAccess onSession={reload} />;
  if (connection.state === "ready")
    return (
      <Workspace
        account={connection.account}
        onProfileSaved={(user) =>
          setConnection((current) =>
            current.state === "ready"
              ? {
                  state: "ready",
                  account: {
                    ...current.account,
                    session: { ...current.account.session, user },
                  },
                }
              : current,
          )
        }
        reload={reload}
        leaving={leaving}
        logoutError={logoutError}
        logout={() => logout(connection.account.session)}
      />
    );
  return (
    <main className="content connected-account">
      <SectionHeading title="Tu espacio académico" />
      {connection.state === "loading" && (
        <p role="status">Comprobando tu sesión…</p>
      )}
      {connection.state === "error" && (
        <div role="alert">
          <Notice
            tone="danger"
            title={connection.message}
            action={<Button onClick={reload}>Reintentar</Button>}
          />
        </div>
      )}
    </main>
  );
}

const NAV = [
  ["/tablero", "Tablero", "grid"],
  ["/calendario", "Calendario", "calendar"],
  ["/disponibilidad", "Disponibilidad", "clock"],
  ["/prioridades", "Cursos y prioridades", "book"],
  ["/ajustes", "Ajustes", "settings"],
];

function Workspace({
  account,
  onProfileSaved,
  reload,
  logout,
  leaving,
  logoutError,
}: {
  account: Account;
  onProfileSaved: (user: Session["user"]) => void;
  reload: () => void;
  logout: () => void;
  leaving: boolean;
  logoutError: string;
}) {
  const route = useRoute();
  const [page, id] = route.split("?")[0].split("/").slice(1);
  const [offset, setOffset] = useState(0);
  const calendarPositions = useRef(
    new Map<string, { top: number; left: number }>(),
  );
  const [periodId, setPeriodId] = useState("");
  const [guide, setGuide] = useState(
    account.session.user.onboardingState === "new" && page === "tablero",
  );
  const [leavePath, setLeavePath] = useState("");
  const dirty = useRef(false);
  const currentRoute = useRef(route);
  currentRoute.current = route;
  useEffect(() => {
    function check(next: string) {
      if (next === currentRoute.current || !dirty.current) return true;
      setLeavePath(next);
      return false;
    }
    function click(event: MouseEvent) {
      const link =
        event.target instanceof Element
          ? event.target.closest('a[href^="#/"]')
          : null;
      if (link && !check(link.getAttribute("href")!.slice(1)))
        event.preventDefault();
    }
    function unload(event: BeforeUnloadEvent) {
      if (dirty.current) event.preventDefault();
    }
    function draft(event: Event) {
      dirty.current = Boolean((event as CustomEvent).detail);
    }
    setNavigationGuard(check);
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("loadflow-draft", draft);
    return () => {
      setNavigationGuard(null);
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("loadflow-draft", draft);
    };
  }, []);
  const { session, capabilities, serverTime } = account;
  const write = useWrite(session, reload);
  const period =
    account.periods.items.find((item) => item.id === periodId) ??
    account.periods.items.find((item) => item.isDefault) ??
    account.periods.items[0];
  const zone = session.user.studyTimezone ?? period?.timezone ?? null;
  const parsed = serverTime ? Date.parse(serverTime) : Number.NaN;
  const today = Number.isFinite(parsed)
    ? localDate(new Date(parsed).toISOString(), zone ?? "UTC")
    : null;
  const screen: Screen | undefined = period
    ? { session, period, capabilities, zone, expired: reload }
    : undefined;
  async function dismissGuide(toCalendar: boolean) {
    const data = await write.run({
      method: "PATCH",
      path: "/me/preferences",
      revision: `"profile-${session.user.revision}"`,
      body: { onboardingState: "seen" },
    });
    if (!data) return;
    setGuide(false);
    if (toCalendar) navigate("/disponibilidad");
    reload();
  }
  const links = (items: string[][]) =>
    items.map(([path, label, icon]) => (
      <a
        key={path}
        href={`#${path}`}
        className={path === `/${page}` ? "active" : ""}
        aria-current={path === `/${page}` ? "page" : undefined}
      >
        <Icon name={icon} />
        <span>{label}</span>
      </a>
    ));
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Saltar al contenido
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="#/tablero">
            <span className="brand-mark">
              <Icon name="book" />
            </span>
            WiseLoad
          </a>
          <div className="workspace-label">MI ESPACIO ACADÉMICO</div>
          <nav aria-label="Navegación principal">{links(NAV)}</nav>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <a className="mobile-brand" href="#/tablero">
              <span className="brand-mark">
                <Icon name="book" />
              </span>
              WiseLoad
            </a>
            <span className="breadcrumb">Mi espacio académico</span>
            <div className="topbar-right">
              <Badge
                tone={capabilities.plan === "Premium" ? "premium" : "neutral"}
              >
                {capabilities.plan}
              </Badge>
              <a className="button primary" href="#/calendario/nueva">
                Añadir
              </a>
            </div>
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className="content connected-workspace"
            onChangeCapture={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest("form")
              )
                dirty.current = true;
            }}
          >
            <div className="connected-period">
              {account.periods.items.length > 1 ? (
                <Field label="Periodo académico">
                  <select
                    value={period?.id ?? ""}
                    onChange={(event) => {
                      setPeriodId(event.target.value);
                      setOffset(0);
                      navigate("/tablero");
                    }}
                  >
                    {account.periods.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                period && <span>{period.name}</span>
              )}
            </div>
            {!screen && page !== "ajustes" && (
              <Notice title="Aún no tienes periodos académicos" />
            )}
            {screen && (
              <>
                {(page === "tablero" || (page === "calendario" && !id)) &&
                  (today ? (
                    <ConnectedWeek
                      key={screen.period.id}
                      screen={screen}
                      first={monday(today)}
                      offset={offset}
                      setOffset={setOffset}
                      calendarPositions={calendarPositions.current}
                      calendar={page === "calendario"}
                    />
                  ) : (
                    <Notice
                      tone="warning"
                      title="No se pudo obtener la fecha del servidor"
                      action={<Button onClick={reload}>Reintentar</Button>}
                    />
                  ))}
                {page === "calendario" && id && (
                  <ConnectedActivity
                    key={id}
                    screen={screen}
                    id={id === "nueva" ? undefined : id}
                  />
                )}
                {page === "prioridades" && <ConnectedCourses screen={screen} />}
                {page === "disponibilidad" && (
                  <ConnectedAvailability
                    screen={screen}
                    today={today}
                    onProfileSaved={onProfileSaved}
                    calendarMode={new URLSearchParams(route.split("?")[1]).get(
                      "calendar",
                    )}
                  />
                )}
                {page === "importar" && (
                  <ConnectedImports screen={screen} id={id} />
                )}
              </>
            )}
            {page === "ajustes" && (
              <>
                <ConnectedSettings
                  session={session}
                  capabilities={capabilities}
                  reload={reload}
                />
                <AppearanceSettings />
                <div className="form-actions">
                  <Button disabled={leaving} onClick={logout}>
                    Cerrar sesión
                  </Button>
                </div>
                {logoutError && (
                  <div role="alert">
                    <Notice tone="danger" title={logoutError} />
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {links(
          NAV.filter(([path]) =>
            ["/tablero", "/calendario", "/ajustes"].includes(path),
          ),
        )}
      </nav>
      {guide && (
        <Modal
          title="Tu tiempo, con contexto"
          onClose={() => {
            if (!write.busy) void dismissGuide(false);
          }}
        >
          <p>
            Conecta Google Calendar para tener en cuenta tus horarios ocupados.
            También puedes organizar tu semana con disponibilidad manual.
          </p>
          <WriteState {...write} reload={reload} />
          <div className="form-actions">
            <Button onClick={() => dismissGuide(false)} disabled={write.busy}>
              Ahora no
            </Button>
            <Button
              variant="primary"
              onClick={() => dismissGuide(true)}
              disabled={write.busy}
            >
              Revisar disponibilidad y Calendar
            </Button>
          </div>
        </Modal>
      )}
      {leavePath && (
        <Modal
          title="Tienes cambios sin confirmar"
          onClose={() => setLeavePath("")}
        >
          <p>
            Revisa tus cambios o descártalos antes de salir de esta pantalla.
          </p>
          <div className="form-actions">
            <Button onClick={() => setLeavePath("")}>Seguir editando</Button>
            <Button
              variant="danger"
              onClick={() => {
                dirty.current = false;
                navigate(leavePath);
                setLeavePath("");
              }}
            >
              Descartar cambios y salir
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
