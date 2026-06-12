import { useMemo } from "react";
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
  Hash,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useTaskCommands } from "@/components/task-commands";
import { useTasks } from "@/hooks/use-tasks";
import { tagStats } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { MiniCalendar } from "@/components/mini-calendar";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/focus", label: "Focus", icon: Timer },
  { to: "/review", label: "Review", icon: TrendingUp },
];

export function Sidebar() {
  const { openCreate } = useTaskCommands();
  const { tasks } = useTasks();
  const topTags = useMemo(
    () => tagStats(tasks).filter((s) => s.openCount > 0).slice(0, 6),
    [tasks]
  );

  return (
    <aside className="w-64 border-r bg-background/60 backdrop-blur-xl h-screen flex-col hidden md:flex z-10 sticky top-0 shrink-0">
      <div className="p-5 pb-3">
        <div className="flex items-center gap-3">
          <Logo className="h-9 w-9 drop-shadow-md shrink-0" />
          <div className="flex flex-col leading-tight">
            <span className="text-xl font-bold tracking-tight">Clearmind</span>
            <span className="text-[11px] text-muted-foreground font-medium">
              Your external brain
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={() => openCreate()}
        className="mx-4 mb-2 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary/60 hover:bg-primary/5 text-sm text-muted-foreground hover:text-primary transition-all group"
      >
        <span className="flex items-center gap-2">
          <Command className="h-3.5 w-3.5" />
          Quick capture
        </span>
        <kbd className="text-[10px] border rounded px-1 py-0.5 font-mono bg-muted group-hover:bg-background">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1 overflow-y-auto">
        <nav className="px-4 space-y-1 mt-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 mx-4 border-t pt-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5 px-1">
            Tổng quan
          </p>
        </div>
        <MiniCalendar />

        {topTags.length > 0 && (
          <div className="mt-2 mx-4 border-t pt-3 pb-2">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold inline-flex items-center gap-1">
                <Hash className="h-3 w-3" /> Tags
              </p>
              <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                top {topTags.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {topTags.map((s) => (
                <NavLink
                  key={s.name}
                  to={`/tasks?tag=${encodeURIComponent(s.name)}`}
                  className="inline-flex items-center gap-1 rounded-md bg-muted/60 hover:bg-primary/10 hover:text-primary text-muted-foreground text-[11px] px-1.5 py-0.5 font-medium transition-colors"
                  title={`${s.openCount} task chưa xong (${s.count} tổng cộng)`}
                >
                  #{s.name}
                  <span className="text-[9px] opacity-70 tabular-nums">
                    {s.openCount}
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border/50 space-y-1">
        <NavLink
          to="/import"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`
          }
        >
          <CalendarPlus className="h-4 w-4" />
          <span>Import lịch học</span>
        </NavLink>
        <NavLink
          to="/guide"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
            }`
          }
        >
          <Sparkles className="h-4 w-4" />
          <span>Hướng dẫn</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`
          }
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}
