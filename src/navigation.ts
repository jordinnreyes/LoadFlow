import { useEffect, useRef, useState } from "react";
let guard: ((path: string) => boolean) | null = null;
export function setNavigationGuard(next: typeof guard) {
  guard = next;
}
export function navigate(path: string, bypassGuard = false) {
  if (!bypassGuard && guard && !guard(path)) return;
  window.location.hash = path;
}
export function useDirtyForm(dirty: boolean) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("loadflow-draft", { detail: dirty }));
    return () => {
      window.dispatchEvent(
        new CustomEvent("loadflow-draft", { detail: false }),
      );
    };
  }, [dirty]);
}
export function useRoute() {
  const [path, setPath] = useState(
    () => window.location.hash.slice(1) || "/tablero",
  );
  const current = useRef(path);
  current.current = path;
  useEffect(() => {
    const changed = () => {
      const next = window.location.hash.slice(1) || "/tablero";
      if (guard && !guard(next)) {
        window.history.replaceState(null, "", `#${current.current}`);
        return;
      }
      setPath(next);
    };
    window.addEventListener("hashchange", changed);
    changed();
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  return path;
}
