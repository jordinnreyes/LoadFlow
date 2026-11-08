import App from "./App";
import { AppProvider } from "./state";

export default function DemoApp() {
  return (
    <AppProvider>
      <App />
    </AppProvider>
  );
}
