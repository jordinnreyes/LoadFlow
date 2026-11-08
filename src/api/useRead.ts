import { useEffect, useRef, useState } from "react";
import { ApiError, apiMessage } from "./client";

export function useRead<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  onExpired: () => void,
) {
  const callbacks = useRef({ load, onExpired });
  callbacks.current = { load, onExpired };
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    const abort = new AbortController();
    Promise.resolve()
      .then(() => callbacks.current.load(abort.signal))
      .then(
        (data) => {
          if (!abort.signal.aborted) setState({ key, data });
        },
        (error: unknown) => {
          if (abort.signal.aborted) return;
          if (error instanceof ApiError && error.status === 401)
            callbacks.current.onExpired();
          else setState({ key, error: apiMessage(error) });
        },
      );
    return () => abort.abort();
  }, [key, revision]);
  return {
    data: state?.key === key ? state.data : undefined,
    error: state?.key === key ? state.error : undefined,
    reload: () => {
      setState(undefined);
      setRevision((n) => n + 1);
    },
  };
}
