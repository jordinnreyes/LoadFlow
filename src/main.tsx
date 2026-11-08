import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import ConnectedApp from "./ConnectedApp";
import { ThemeProvider } from "./theme";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/appearance.css";

const DemoApp =
  import.meta.env.MODE === "android-spike" ||
  (import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("modo") === "demo")
    ? lazy(() => import("./DemoApp"))
    : null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      {DemoApp ? (
        <Suspense fallback={<p role="status">Cargando la demostración…</p>}>
          <DemoApp />
        </Suspense>
      ) : (
        <ConnectedApp />
      )}
    </ThemeProvider>
  </React.StrictMode>,
);
