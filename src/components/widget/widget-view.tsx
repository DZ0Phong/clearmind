import { useMemo } from "react";
import { Check, Clock, ListChecks } from "lucide-react";
import { useTasks } from "@/hooks/use-tasks";
import { useT, useDateFns } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Compact "today" panel rendered inside the desktop app's floating widget
 * window (frameless, always-on-top — see src-tauri/src/lib.rs). It mounts on
 * a tiny provider tree (Theme + Accent + I18n + Tasks) WITHOUT the router or
 * MainLayout, selected in App.tsx when the Tauri window injects
 * `window.__CLEARMIND_WIDGET__`. Because it sits on the same TasksProvider as
 * the main window — which is wired to the CLI host — checking a task here
 * writes through to %APPDATA%/Clearmind and the change shows up live in the
 * web/mobile/main-window views too.
 *
 * The top bar carries `data-tauri-drag-region` so the user can drag the
 * frameless window by its header.
 */
export function WidgetView() {
  const { tasks, updateTaskStatus } = useTasks();
  const t = useT();
  const { isToday, extractTimeLabel } = useDateFns();

  const today = useMemo(
    () =>
      tasks
        .filter((tk) => tk.status !== "done" && isToday(tk.deadline))
        .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || "")),
    [tasks, isToday]
  );

  const nextUp = useMemo(() => {
    const now = Date.now();
    return (
      tasks
        .filter(
          (tk) =>
            tk.status !== "done" &&
            tk.deadline &&
            !isToday(tk.deadline) &&
            new Date(tk.deadline).getTime() > now
        )
        .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || ""))[0] || null
    );
  }, [tasks, isToday]);

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden select-none">
      <header
        data-tauri-drag-region
        className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b bg-card/70 backdrop-blur cursor-grab active:cursor-grabbing"
      >
        <div data-tauri-drag-region className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Clearmind
          </div>
          <div className="text-sm font-semibold leading-tight">
            {t("widget.today")}
          </div>
        </div>
        <span className="shrink-0 h-7 min-w-7 px-1.5 rounded-lg bg-primary/15 text-primary text-xs font-bold grid place-items-center">
          {today.length}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {today.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-5 text-muted-foreground">
            <ListChecks className="h-7 w-7 text-primary/60" />
            <div className="text-sm font-medium text-foreground">
              {t("widget.empty")}
            </div>
            {nextUp && (
              <div className="text-xs leading-snug">
                {t("widget.next")}:{" "}
                <span className="text-foreground/80">{nextUp.title}</span>
              </div>
            )}
          </div>
        ) : (
          today.map((tk) => {
            const time = tk.deadline ? extractTimeLabel(tk.deadline) : "";
            return (
              <button
                key={tk.id}
                type="button"
                onClick={() => updateTaskStatus(tk.id, "done")}
                title={t("widget.complete")}
                className="w-full text-left flex items-start gap-2.5 rounded-xl px-2.5 py-2 hover:bg-accent transition-colors group"
              >
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/40 group-hover:border-primary grid place-items-center transition-colors">
                  <Check className="h-2.5 w-2.5 text-transparent group-hover:text-primary transition-colors" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug truncate">
                    {tk.title}
                  </span>
                  {time && (
                    <span className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {time}
                    </span>
                  )}
                </span>
                {tk.priority === "high" && (
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500"
                    )}
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
