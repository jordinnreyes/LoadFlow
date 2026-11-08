import { useRef, useState } from "react";
import {
  ApiError,
  apiMessage,
  endpoint,
  request,
  type Session,
} from "./client";

type Command = {
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  revision?: string | null;
  signature?: string;
};

export function useWrite(session: Session, onExpired: () => void) {
  const running = useRef(false);
  const last = useRef<{ fingerprint: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  async function run<T>(command: Command): Promise<T | undefined> {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setConflict(false);
    const fingerprint = JSON.stringify([
      command.method,
      command.path,
      command.revision,
      command.signature ?? command.body,
    ]);
    if (last.current?.fingerprint !== fingerprint) {
      last.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      const { data } = await request<T>(endpoint(command.path), {
        method: command.method ?? "POST",
        body: command.body,
        revision: command.revision,
        key: last.current.key,
        csrfToken: session.csrfToken,
      });
      last.current = null;
      window.dispatchEvent(
        new CustomEvent("loadflow-draft", { detail: false }),
      );
      return data;
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else if (failure instanceof ApiError && failure.needsReview) {
        setConflict(true);
        setError(
          "Los datos cambiaron. Vuelve a consultarlos y revisa tu edición antes de guardarla.",
        );
      } else setError(apiMessage(failure));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error, conflict };
}
