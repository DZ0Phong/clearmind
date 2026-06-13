import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Timer,
  TrendingUp,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Primary navigation on < md viewports. Mirrors the five top-level
// workspaces in sidebar.tsx so the mobile + desktop nav stay synced.
// Rendered always (the .cm-mobile-tabbar utility class flips display: none
// at md and above), so no JS resize listener is needed.
const tabs = [
  { to: "/dashboard", key: "nav.dashboard", Icon: LayoutDashboard },
  { to: "/calendar", key: "nav.calendar", Icon: Calendar },
  { to: "/tasks", key: "nav.tasks", Icon: CheckSquare },
  { to: "/focus", key: "nav.focus", Icon: Timer },
  { to: "/review", key: "nav.review", Icon: TrendingUp },
] as const;

export function MobileTabBar() {
  const t = useT();
  return (
    <nav aria-label={t("nav.primary")} className="cm-mobile-tabbar">
      {tabs.map(({ to, key, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn("cm-mobile-tabbar-item cm-press", isActive && "cm-nav-active")
          }
        >
          <Icon className="h-5 w-5" aria-hidden />
          <span>{t(key)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
