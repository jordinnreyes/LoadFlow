import { useEffect, useRef, useState } from "react";
import { useApp } from "./state";
import { navigate, setNavigationGuard, useRoute } from "./navigation";
import { type Workspace } from "./model";
import { plan, validateSession } from "./rules";
import { Badge, Button, Icon, Modal, Notice } from "./components/ui";
import Access from "./pages/Access";
import Dashboard from "./pages/Dashboard";
import Calendar from "./pages/Calendar";
import ImportReview from "./pages/ImportReview";
import Availability from "./pages/Availability";
import Priorities from "./pages/Priorities";
import Settings from "./pages/Settings";
import IntegrationPanel from "./panels/IntegrationPanel";
import ChangesPanel from "./panels/ChangesPanel";
import type { Propose } from "./actions";

const NAV = [
  { path: "/tablero", label: "Tablero", icon: "grid" },
  { path: "/calendario", label: "Calendario", icon: "calendar" },
  { path: "/disponibilidad", label: "Disponibilidad", icon: "clock" },
  { path: "/prioridades", label: "Cursos y prioridades", icon: "book" },
  { path: "/ajustes", label: "Ajustes", icon: "settings" },
];
interface Review {
  before: Workspace;
  after: Workspace;
  reason: string;
  mode: "preview" | "explain" | "undo";
  confirmLabel?: string;
  blocked?: string[];
}
export default function App() {
  const { workspace: w, save, storageError } = useApp();
  const route = useRoute();
  const [week, setWeek] = useState(0);
  const [integration, setIntegration] = useState<
    false | "welcome" | "settings"
  >(false);
  const [review, setReview] = useState<Review | null>(null);
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [conflictValue, setConflictValue] = useState<Workspace | null>(null);
  const dirty = useRef(false);
  const [leavePath, setLeavePath] = useState("");
  const currentRoute = useRef(route);
  currentRoute.current = route;
  useEffect(() => {
    const check = (path: string) => {
      if (path === currentRoute.current) return true;
      if (dirty.current) {
        setLeavePath(path);
        return false;
      }
      return true;
    };
    const draft = (e: Event) => {
      dirty.current = (e as CustomEvent<boolean>).detail;
    };
    const click = (e: MouseEvent) => {
      const anchor = (e.target as Element)?.closest('a[href^="#/"]');
      if (anchor) {
        const path = anchor.getAttribute("href")!.slice(1);
        if (!check(path)) e.preventDefault();
      }
    };
    const unloading = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    setNavigationGuard(check);
    window.addEventListener("loadflow-draft", draft);
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unloading);
    return () => {
      setNavigationGuard(null);
      window.removeEventListener("loadflow-draft", draft);
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unloading);
    };
  }, []);
  const page = route.split("/")[1] || "tablero";
  const nav = NAV.find((n) => n.path === `/${page}`);
  const pageLabel =
    page === "importar"
      ? "Importar actividades"
      : nav?.label || "Mi planificación";
  useEffect(() => {
    document.title = `${w ? pageLabel : "Acceso"} · CargaWise`;
  }, [page, !!w]);
  useEffect(() => {
    if (w && page === "acceso") navigate("/tablero");
  }, [!!w]);
  useEffect(() => {
    setAdding(false);
  }, [route]);
  const commit = (
    after: Workspace,
    before: Workspace,
    reason: string,
    remember = true,
  ) => {
    save({
      ...after,
      previousSessions: remember ? before.sessions : null,
      lastReason: reason,
    });
    setMessage(`${reason}. Cambios guardados localmente.`);
  };
  const onPropose: Propose = (next, reason, options = {}) => {
    if (!w) return;
    const after = {
      ...next,
      ...plan(next, options.scope, options.preserveGroup),
    };
    if (options.immediate) commit(after, w, reason);
    else
      setReview({
        before: w,
        after,
        reason,
        mode: "preview",
        confirmLabel: options.confirmLabel,
      });
  };
  const explain = () => {
    if (w)
      setReview({
        before: w,
        after: w,
        reason: "Tu carga, explicada",
        mode: "explain",
      });
  };
  const undo = () => {
    if (!w?.previousSessions) return;
    const candidate = { ...w, sessions: w.previousSessions };
    const blocked = [
      ...new Set(
        candidate.sessions.flatMap((s) =>
          validateSession(s, candidate, candidate.sessions),
        ),
      ),
    ];
    if (
      w.calendar !== "manual" &&
      w.calendar !== "connected" &&
      !w.manualCoverage
    )
      blocked.push(
        "Actualiza la ocupación de Calendar antes de verificar la restauración.",
      );
    // Re-analyze remaining demand without moving any restored block.
    const analyzed = plan({
      ...candidate,
      sessions: candidate.sessions.map((s) => ({ ...s, fixed: true })),
    });
    setReview({
      before: w,
      after: { ...candidate, issues: analyzed.issues },
      reason: "Deshacer última reorganización",
      mode: "undo",
      blocked,
    });
  };
  const openConflict = () => {
    if (!w) return;
    const next = structuredClone(w);
    if (next.activities[0])
      next.activities[0].effort = (next.activities[0].effort || 0) + 60;
    setConflictValue(next);
    setConflict(true);
  };
  if (!w) return <Access onWelcome={() => setIntegration("welcome")} />;
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Saltar al contenido
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="#/tablero">
            <span className="brand-mark">
              <Icon name="book" size={23} />
            </span>
            CargaWise
          </a>
          <div className="workspace-label">MI ESPACIO ACADÉMICO</div>
          <nav aria-label="Navegación principal">
            {NAV.map((n) => (
              <a
                key={n.path}
                href={`#${n.path}`}
                className={n.path === `/${page}` ? "active" : ""}
                aria-current={n.path === `/${page}` ? "page" : undefined}
              >
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {n.path === "/tablero" && w.issues.length > 0 && (
                  <span className="nav-count">{w.issues.length}</span>
                )}
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-tip">
              <Icon name="info" />
              <p>Un plan posible empieza por conocer tu tiempo.</p>
            </div>
            <a className="profile" href="#/ajustes">
              <span className="avatar">{w.name.slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{w.name}</strong>
                <small>Estudiante · {w.plan}</small>
              </span>
              <Icon name="chevron" size={16} />
            </a>
          </div>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <a
              className="mobile-brand"
              href="#/tablero"
              aria-label="CargaWise · Tablero"
            >
              <span className="brand-mark">
                <Icon name="book" size={20} />
              </span>
              <span>
                CargaWise<small>{pageLabel}</small>
              </span>
            </a>
            <div className="breadcrumb">
              Mi espacio <Icon name="chevron" size={14} />
              <strong>{pageLabel}</strong>
            </div>
            <div className="topbar-right">
              <span className="save-state">
                <i className={storageError ? "failed" : ""} />
                {storageError ? "Sin guardar" : "Guardado local"}
              </span>
              <Badge tone={w.plan === "Premium" ? "premium" : "neutral"}>
                {w.plan}
              </Badge>
              <span className="topbar-period">{w.period}</span>
              <div className="add-wrapper">
                <Button
                  icon="plus"
                  variant="primary"
                  onClick={() => setAdding(!adding)}
                  aria-expanded={adding}
                >
                  Añadir
                </Button>
                {adding && (
                  <div className="add-menu">
                    <button onClick={() => navigate("/importar")}>
                      <Icon name="upload" />
                      Importar PDF/Excel
                    </button>
                    <button onClick={() => navigate("/calendario/nueva")}>
                      <Icon name="plus" />
                      Actividad manual
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <div className="demo-ribbon">
            <span className="demo-dot" />
            Prototipo · datos ficticios
            <span className="ribbon-separator">·</span>
            <span>Hoy de ejemplo: 2 nov. 2026 · Lima</span>
            <a href="#/ajustes">
              Cambiar escenario <Icon name="arrow" size={14} />
            </a>
          </div>
          <main
            className={`content page-${page}`}
            id="main-content"
            tabIndex={-1}
          >
            {storageError && (
              <Notice
                tone="danger"
                title="No pudimos guardar en este navegador"
              >
                Los cambios solo están en memoria y pueden perderse al recargar.
                Revisa que el almacenamiento local esté permitido.
              </Notice>
            )}
            {message && (
              <div className="change-notification" role="status">
                <Icon name="check" size={18} />
                <span>{message}</span>
                <button className="text-link" onClick={explain}>
                  Ver cambios y carga
                </button>
                {w.previousSessions && (
                  <button className="text-link" onClick={undo}>
                    Deshacer
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label="Cerrar mensaje de cambios"
                  onClick={() => setMessage("")}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}
            {page === "tablero" && (
              <Dashboard
                week={week}
                setWeek={setWeek}
                openReview={explain}
                openIntegration={() => setIntegration("settings")}
              />
            )}
            {page === "calendario" && (
              <Calendar
                selectedId={route.split("/")[2]}
                onPropose={onPropose}
                onReview={explain}
                onIntegration={() => setIntegration("settings")}
              />
            )}
            {page === "importar" && <ImportReview onPropose={onPropose} />}
            {page === "disponibilidad" && (
              <Availability
                key={w.savedAt}
                onPropose={onPropose}
                openIntegration={() => setIntegration("settings")}
              />
            )}
            {page === "prioridades" && (
              <Priorities key={w.savedAt} onPropose={onPropose} />
            )}
            {page === "ajustes" && (
              <Settings
                onIntegration={() => setIntegration("settings")}
                onConflict={openConflict}
              />
            )}
            {!NAV.some((n) => n.path === `/${page}`) && page !== "importar" && (
              <Notice
                title="Esta vista no existe en el prototipo"
                action={
                  <Button onClick={() => navigate("/tablero")}>
                    Ir al tablero
                  </Button>
                }
              />
            )}
          </main>
          <footer className="app-footer">
            <span>CargaWise · Un poco más de perspectiva.</span>
            <span>Solo demostración local · sin servicios externos</span>
          </footer>
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {NAV.filter((n) =>
          ["/tablero", "/calendario", "/ajustes"].includes(n.path),
        ).map((n) => (
          <a
            key={n.path}
            href={`#${n.path}`}
            className={n.path === `/${page}` ? "active" : ""}
            aria-current={n.path === `/${page}` ? "page" : undefined}
          >
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
      {integration && (
        <IntegrationPanel
          welcome={integration === "welcome"}
          onClose={() => setIntegration(false)}
          onPropose={onPropose}
        />
      )}
      {review && (
        <ChangesPanel
          before={review.before}
          after={review.after}
          title={review.reason}
          mode={review.mode}
          confirmLabel={review.confirmLabel}
          blocked={review.blocked}
          onClose={() => setReview(null)}
          onUndo={undo}
          onApply={
            review.mode === "explain"
              ? undefined
              : () => {
                  if (review.before.savedAt !== w.savedAt) {
                    setMessage(
                      "El plan cambió desde que abriste esta propuesta. Revisa de nuevo antes de aplicar.",
                    );
                    setReview(null);
                    return;
                  }
                  const newActivity = review.after.activities.find(
                    (a) => !review.before.activities.some((x) => x.id === a.id),
                  );
                  commit(
                    review.after,
                    review.before,
                    review.reason,
                    review.mode !== "undo",
                  );
                  dirty.current = false;
                  setReview(null);
                  if (newActivity)
                    navigate(`/calendario/${newActivity.id}`, true);
                  else if (page === "importar") navigate("/tablero", true);
                }
          }
        />
      )}
      {conflict && conflictValue && (
        <Modal
          title="Revisar dos versiones"
          eyebrow="CONFLICTO SIMULADO · SIN OTRO DISPOSITIVO REAL"
          onClose={() => setConflict(false)}
        >
          <Notice
            tone="warning"
            title="Una edición de ejemplo difiere de lo guardado"
          >
            Este panel demuestra cómo se pediría resolver una concurrencia. No
            existe sincronización entre dispositivos en este prototipo.
          </Notice>
          {w.activities[0] ? (
            <>
              <h3>{w.activities[0].title}</h3>
              <div className="before-after">
                <div>
                  <Badge>Guardado localmente</Badge>
                  <p>Esfuerzo: {(w.activities[0].effort || 0) / 60} h</p>
                </div>
                <Icon name="arrow" />
                <div>
                  <Badge tone="info">Cambio pendiente de ejemplo</Badge>
                  <p>
                    Esfuerzo: {(conflictValue.activities[0].effort || 0) / 60} h
                  </p>
                </div>
              </div>
              <div className="form-actions">
                <Button onClick={() => setConflict(false)}>
                  Conservar lo guardado
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setConflict(false);
                    onPropose(
                      conflictValue,
                      "Reaplicar edición local de ejemplo tras revisar diferencias",
                    );
                  }}
                >
                  Revisar mi cambio
                </Button>
              </div>
            </>
          ) : (
            <p>Añade una actividad para representar este caso.</p>
          )}
        </Modal>
      )}
      {!!leavePath && (
        <Modal
          title="Tienes cambios sin confirmar"
          onClose={() => setLeavePath("")}
        >
          <p>
            Los cambios de este formulario todavía no están en el plan activo.
            Puedes seguir editando o descartarlos para salir.
          </p>
          <div className="form-actions">
            <Button onClick={() => setLeavePath("")}>Seguir editando</Button>
            <Button
              variant="danger"
              onClick={() => {
                dirty.current = false;
                const path = leavePath;
                setLeavePath("");
                navigate(path, true);
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
