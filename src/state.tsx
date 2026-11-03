import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { type Workspace } from "./model";
import { makeWorkspace } from "./demo";

const STORAGE_KEY = "loadflow-prototype-v1";
interface LocalState {
  version: 1;
  active: string | null;
  profiles: Record<string, Workspace>;
}
const initial = (): LocalState => {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (
      data?.version === 1 &&
      data.profiles &&
      (!data.active || data.profiles[data.active])
    )
      return data;
  } catch {
    /* A damaged local prototype record must not prevent opening the access screen. */
  }
  return { version: 1, active: null, profiles: {} };
};
interface AppContextValue {
  workspace: Workspace | null;
  save: (w: Workspace) => void;
  storageError: boolean;
  login: (
    kind: "new" | "existing",
    profile: "Free" | "Premium",
    email: string,
    method: string,
  ) => void;
  logout: () => void;
  scenario: (id: string) => void;
  hasProfile: (email: string) => boolean;
}
const Context = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LocalState>(initial);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);
  const save = (workspace: Workspace) =>
    setState((prev) =>
      prev.active
        ? {
            ...prev,
            profiles: {
              ...prev.profiles,
              [prev.active]: {
                ...workspace,
                savedAt: new Date().toISOString(),
              },
            },
          }
        : prev,
    );
  const login = (
    kind: "new" | "existing",
    profile: "Free" | "Premium",
    email: string,
    method: string,
  ) => {
    const key =
      email.trim().toLowerCase() || `${profile.toLowerCase()}@ejemplo.test`;
    setState((prev) => {
      const workspace = prev.profiles[key] || {
        ...makeWorkspace(
          kind === "new"
            ? "empty"
            : profile === "Premium"
              ? "premium"
              : "balanced",
          profile,
        ),
        email: key,
        name:
          key.split("@")[0] === "premium"
            ? "Valeria"
            : key.split("@")[0] === "free"
              ? "Alex"
              : key.split("@")[0],
      };
      return {
        ...prev,
        active: key,
        profiles: {
          ...prev.profiles,
          [key]: { ...workspace, lastReason: `Acceso ${method} simulado` },
        },
      };
    });
  };
  const scenario = (id: string) => {
    if (state.active)
      save({
        ...makeWorkspace(id, state.profiles[state.active].plan),
        email: state.active,
        name: state.profiles[state.active].name,
      });
  };
  return (
    <Context.Provider
      value={{
        workspace: state.active ? state.profiles[state.active] : null,
        save,
        storageError,
        login,
        logout: () => setState((prev) => ({ ...prev, active: null })),
        scenario,
        hasProfile: (email) => !!state.profiles[email.trim().toLowerCase()],
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useApp = () => {
  const value = useContext(Context);
  if (!value) throw new Error("AppProvider required");
  return value;
};
