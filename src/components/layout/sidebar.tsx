import {
  Calendar,
  CheckSquare,
  LayoutDashboard,
  Settings,
  Timer,
  TrendingUp,
  Command,
  Sparkles,
  CalendarPlus,
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useTaskCommands } from "@/components/tasks/task-commands";
import { useT } from "@/lib/i18n";
import { Logo } from "@/components/logo";
import { MiniCalendar } from "@/components/calendar/mini-calendar";

// Main nav — the five top-level workspaces.
const navItems = [
  { to: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/calendar", key: "nav.calendar", icon: Calendar },
  { to: "/tasks", key: "nav.tasks", icon: CheckSquare },
  { to: "/focus", key: "nav.focus", icon: Timer },
  { to: "/review", key: "nav.review", icon: TrendingUp },
] as const;

// Footer nav — secondary actions/screens. Kept text-labeled (icon-only
// row was harder to scan during user testing).
const footerItems = [
  { to: "/import", key: "nav.import", icon: CalendarPlus },
  { to: "/guide", key: "nav.guide", icon: Sparkles },
  { to: "/settings", key: "nav.settings", icon: Settings },
] as const;

export function Sidebar() {
  const { openCreate } = useTaskCommands();
  const t = useT();

  return (
    <aside
      aria-label={t("nav.primary")}
      className="w-60 border-r bg-background/60 backdrop-blur-xl h-dvh flex-col hidden md:flex z-10 sticky top-0 shrink-0"
    >
      {/* Brand — compact (p-4 not p-5; tighter line-height). Plain Link
          (not NavLink) so it doesn't add a duplicate aria-current="page"
          when the user is on /dashboard — the main nav item below is the
          canonical active marker. */}
      <Link
        to="/dashboard"
        title={t("topbar.dashboardTooltip")}
        className="cm-press p-4 pb-3 block hover:bg-accent/30 transition-colors shrink-0"
      >
        <div className="flex items-center gap-2.5">
          <Logo className="h-8 w-8 drop-shadow-sm shrink-0" />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-lg font-bold tracking-tight">Clearmind</span>
            <span className="text-[10px] text-muted-foreground font-medium truncate">
              {t("sidebar.tagline")}
            </span>
          </div>
        </div>
      </Link>

      {/* Quick Capture — small button, ⌘K hint visible */}
      <button
        onClick={() => openCreate()}
        className="cm-press mx-3 mb-2 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-dashed border-border hover:border-primary/60 hover:bg-primary/5 text-xs text-muted-foreground hover:text-primary transition-all group shrink-0"
      >
        <span className="flex items-center gap-1.5">
          <Command className="h-3 w-3" />
          {t("nav.quickCapture")}
        </span>
        <kbd className="text-[9px] border rounded px-1 py-0.5 font-mono bg-muted group-hover:bg-background">
          ⌘K
        </kbd>
      </button>

      {/* Main nav — fixed (no scroll), pulls flex-1 into footer area */}
      <nav className="px-3 space-y-0.5 mt-1 shrink-0">
        {navItems.map(({ to, key, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all duration-200 cm-press ${
                isActive
                  ? "bg-primary/10 text-primary cm-nav-active"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`
            }
          >
            <span className="cm-nav-rail" aria-hidden />
            <Icon className="h-4 w-4 transition-transform duration-200" />
            <span>{t(key)}</span>
          </NavLink>
        ))}
      </nav>

      {/* Mini calendar — at-a-glance month heatmap with recurring-task
          dots properly expanded (see mini-calendar.tsx dayMeta). Inside a
          non-scrollable sidebar by design — total sidebar height stays
          within a 720px viewport on a fresh install. */}
      <div className="mt-3 pt-2 border-t border-border/40 shrink-0">
        <MiniCalendar />
      </div>

      {/* Spacer pushes footer to the bottom */}
      <div className="flex-1" />

      {/* Footer — secondary nav, same dense layout as main */}
      <nav aria-label={t("nav.secondary")} className="p-3 border-t border-border/50 space-y-0.5 shrink-0">
        {footerItems.map(({ to, key, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all duration-200 cm-press ${
                isActive
                  ? "bg-primary/10 text-primary cm-nav-active"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`
            }
          >
            <span className="cm-nav-rail" aria-hidden />
            <Icon className="h-4 w-4" />
            <span>{t(key)}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
