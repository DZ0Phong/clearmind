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

// Register service worker — only in production builds to avoid dev HMR conflicts.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}
