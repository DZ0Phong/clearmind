import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CalendarDays, Plus, Search, Power, PowerOff } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { useTasks } from "@/hooks/use-tasks";
import { useTaskCommands } from "@/components/task-commands";
import { isPast } from "@/lib/utils";
import { useTickingNow } from "@/lib/use-ticking-now";
import { useCliHealth } from "@/lib/use-cli-health";

export function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background relative selection:bg-primary/30">
      {/* Ambient gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-accent/20 via-transparent to-transparent pointer-events-none" />

      <Sidebar />
      <main className="flex-1 flex flex-col relative z-10 min-w-0">
        <TopBar />
        <div className="p-4 md:p-6 lg:p-8 flex flex-col flex-1 min-h-0">
          <div className="max-w-[1600px] w-full mx-auto flex-1 flex flex-col min-h-0">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function TopBar() {
  const { tasks } = useTasks();
  const { openCreate, openPalette } = useTaskCommands();
  const now = useTickingNow();

  const overdueCount = useMemo(
    () =>
      tasks.filter(
        (t) => t.status !== "done" && t.deadline && isPast(t.deadline, now)
      ).length,
    [tasks, now]
  );

  const dateLabel = now.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const timeLabel = now.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <header className="h-12 sm:h-14 border-b border-border/50 bg-background/60 backdrop-blur-md flex items-center gap-3 px-3 sm:px-5 lg:px-6 shrink-0 sticky top-0 z-20">
      {/* Brand on mobile only (sidebar is hidden < md) */}
      <Link
        to="/dashboard"
        className="md:hidden flex items-center gap-2 shrink-0"
      >
        <Logo className="h-6 w-6" />
        <span className="font-semibold text-sm">Clearmind</span>
      </Link>

      {/* Date + time pill — also acts as a Dashboard shortcut */}
      <Link
        to="/dashboard"
        title="Về Dashboard"
        className="hidden lg:flex items-center gap-2 text-sm shrink-0 hover:text-primary transition-colors"
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="capitalize font-semibold">{dateLabel}</span>
        <span className="text-muted-foreground tabular-nums">· {timeLabel}</span>
      </Link>

      {/* Search / command palette trigger */}
      <button
        onClick={openPalette}
        className="hidden sm:flex flex-1 lg:flex-initial lg:w-[380px] items-center gap-2 px-3 py-1.5 rounded-md border bg-muted/40 hover:bg-muted/60 hover:border-input text-sm text-muted-foreground transition-colors ml-auto lg:mx-auto"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left truncate">Tìm task, lệnh, điều hướng…</span>
        <kbd className="text-[10px] border rounded px-1.5 py-0.5 font-mono bg-background shrink-0">
          ⌘K
        </kbd>
      </button>

      {/* Mobile search icon */}
      <button
        onClick={openPalette}
        className="sm:hidden ml-auto p-2 rounded-md hover:bg-muted text-muted-foreground"
        aria-label="Tìm kiếm"
      >
        <Search className="h-5 w-5" />
      </button>

      {/* Right cluster: cli-status → overdue → capture → theme */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <CliStatusBadge />
        {overdueCount > 0 && (
          <Link
            to="/tasks"
            title="Xem danh sách task quá hạn"
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/15 transition-colors"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {overdueCount} quá hạn
          </Link>
        )}
        <Button
          size="sm"
          onClick={() => openCreate()}
          className="gap-1.5"
          title="Tạo task mới"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden md:inline">Thêm</span>
        </Button>
        <ModeToggle />
      </div>
    </header>
  );
}

/**
 * Small status pill next to the overdue badge. Only renders when the SPA
 * is hosted by the Clearmind CLI (i.e. the user expects on-disk persistence
 * and native notifications). Polls /api/health every 30s. If it transitions
 * from online → offline the user sees an immediate red indicator so they
 * know edits aren't being saved.
 */
function CliStatusBadge() {
  const { status, port } = useCliHealth(30_000);
  if (status === "n/a") return null;
  if (status === "online") {
    return (
      <Link
        to="/settings"
        title={`CLI live ở port ${port} — data đang ghi lên đĩa`}
        className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold hover:bg-emerald-500/15 transition-colors"
      >
        <Power className="h-3 w-3" />
        CLI
      </Link>
    );
  }
  // checking | offline
  const offline = status === "offline";
  return (
    <Link
      to="/settings"
      title={offline ? "CLI mất kết nối — chỉnh sửa hiện không ghi được lên đĩa" : "Đang kiểm tra CLI…"}
      className={
        offline
          ? "hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/10 text-destructive text-[11px] font-semibold hover:bg-destructive/15 transition-colors animate-pulse"
          : "hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold"
      }
    >
      <PowerOff className="h-3 w-3" />
      {offline ? "CLI offline" : "…"}
    </Link>
  );
}
