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

// Tailwind 4 emits `@layer` + `oklch()` CSS. Pre-2023 engines (some stock
// Android / MIUI "Mi Browser" builds on old Chromium) can't parse those and
// drop the WHOLE stylesheet → the app renders as raw, unstyled HTML (the user
// saw exactly this on a Xiaomi browser). Detect the most load-bearing feature
// (oklch color support) and, when it's missing, show a plain inline-styled
// notice instead of a broken page. Modern Chrome/Edge/Safari/Firefox all pass.
function browserTooOld(): boolean {
  try {
    return !(
      typeof CSS !== "undefined" &&
      CSS.supports &&
      CSS.supports("color", "oklch(0% 0 0)")
    );
  } catch {
    return true;
  }
}

const rootEl = document.getElementById("root")!;

if (browserTooOld()) {
  rootEl.setAttribute(
    "style",
    "min-height:100dvh;min-height:100vh;display:flex;align-items:center;justify-content:center;" +
      "padding:24px;background:#0b0b12;color:#e7e7ee;" +
      "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"
  );
  rootEl.innerHTML =
    '<div style="max-width:360px;text-align:center;line-height:1.6">' +
    '<div style="font-size:42px;margin-bottom:12px">🧭</div>' +
    '<h1 style="font-size:18px;font-weight:700;margin:0 0 10px">Trình duyệt quá cũ · Browser too old</h1>' +
    '<p style="font-size:14px;opacity:.82;margin:0">Clearmind cần một trình duyệt hiện đại. Hãy mở bằng ' +
    "<b>Chrome</b> hoặc <b>Edge</b> mới nhất nhé.</p>" +
    '<p style="font-size:13px;opacity:.6;margin:12px 0 0">Please open Clearmind in an up-to-date ' +
    "<b>Chrome</b> or <b>Edge</b>.</p>" +
    "</div>";
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

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
