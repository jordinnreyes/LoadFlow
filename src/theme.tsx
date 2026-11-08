import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "dark" | "light";
const KEY = "cargawise-theme";
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);

function initialTheme(): Theme {
  try {
    if (localStorage.getItem(KEY) === "light") return "light";
  } catch {
    // The theme remains usable for the current page without browser storage.
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState(initialTheme);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (themeColor)
      themeColor.content = theme === "light" ? "#f4f5f8" : "#0f141c";
  }, [theme]);
  function setTheme(next: Theme) {
    updateTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // The theme still changes until reload.
    }
  }
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider required");
  return value;
}
