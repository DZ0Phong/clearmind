import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { installGlobalErrorHandlers } from "@/lib/error-log";

// Catches async errors thrown outside React's render tree (window.onerror +
// unhandledrejection). The in-React ErrorBoundary handles render errors.
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Service worker is intentionally NOT registered. The legacy one cached the
// app shell (cache-first with stale-while-revalidate) and that masked CLI
// rebuilds — user kept seeing the previous UI after restarting the server.
// On a localhost-only app the SW gave no benefit anyway; the CLI must be
// running for data to load.
//
// One-time cleanup: if an old SW is still registered on this browser, let
// the replacement public/sw.js take over — it self-unregisters + clears
// caches + reloads the tab. This block triggers that handoff and then exits.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      for (const r of regs) {
        r.unregister().catch(() => {});
      }
    })
    .catch(() => {});
  if ("caches" in window) {
    caches
      .keys()
      .then((keys) => keys.forEach((k) => caches.delete(k).catch(() => {})))
      .catch(() => {});
  }
}
