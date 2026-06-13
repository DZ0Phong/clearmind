import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useT } from "@/lib/i18n";

// Map pathname → i18n key for the browser tab title.
const ROUTE_KEY: Record<string, string> = {
  "/dashboard": "nav.dashboard",
  "/calendar": "nav.calendar",
  "/tasks": "nav.tasks",
  "/focus": "nav.focus",
  "/review": "nav.review",
  "/settings": "nav.settings",
  "/guide": "nav.guide",
  "/import": "nav.import",
};

// Updates document.title based on current route + language. Also reacts when
// the user toggles VI/EN so the tab text follows.
export function useDocumentTitle() {
  const location = useLocation();
  const t = useT();
  useEffect(() => {
    const key = ROUTE_KEY[location.pathname];
    const page = key ? t(key) : "";
    document.title = page ? `${page} · Clearmind` : "Clearmind";
  }, [location.pathname, t]);
}
