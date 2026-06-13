import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { installGlobalErrorHandlers } from "@/lib/error-log";
import { installGlobalWheelNormaliser } from "@/lib/horizontal-wheel";

// Catches async errors thrown outside React's render tree (window.onerror +
// unhandledrejection). The in-React ErrorBoundary handles render errors.
installGlobalErrorHandlers();
// Translate vertical wheel into horizontal scroll on horizontally-only
// scrollers (tab strips, chip rows). Browser default ignores this and
// scrolls the page underneath instead, which feels broken when a tab
// strip clearly has overflow.
installGlobalWheelNormaliser();

// iOS Safari does NOT shrink the layout viewport / dvh when the soft
// keyboard opens — it slides OVER the layout, obscuring the bottom of
// centered dialogs. Mirror window.visualViewport.height into a CSS var
// so chrome that needs to anchor to the *visible* region can read it.
// (cm-sheet-mobile dialogs already pin to bottom: 0 so they slide up
// with the visual viewport automatically; this is for any future
// surface that needs explicit visual-viewport awareness.)
if (typeof window !== "undefined" && window.visualViewport) {
  const vv = window.visualViewport;
  const sync = () => {
    document.documentElement.style.setProperty("--visual-vh", `${vv.height}px`);
  };
  sync();
  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
}

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
