import { useTheme } from "../theme";

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  return (
    <section
      className="surface appearance-settings"
      aria-labelledby="appearance-title"
    >
      <h2 id="appearance-title">Apariencia</h2>
      <div
        className="appearance-options segmented"
        role="group"
        aria-label="Tema de CargaWise"
      >
        <button
          type="button"
          aria-pressed={theme === "dark"}
          onClick={() => setTheme("dark")}
        >
          Oscuro
        </button>
        <button
          type="button"
          aria-pressed={theme === "light"}
          onClick={() => setTheme("light")}
        >
          Claro
        </button>
      </div>
    </section>
  );
}
