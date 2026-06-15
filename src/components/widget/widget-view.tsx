import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  ListChecks,
  Pin,
  PinOff,
  Minus,
  Maximize2,
} from "lucide-react";
import { useTasks } from "@/hooks/use-tasks";
import { useT, useDateFns } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { subscribeSettings } from "@/lib/cli-bridge";
import {
  isTauri,
  setCurrentAlwaysOnTop,
  hideCurrent,
  showCurrent,
  openMainWindow,
  getWidgetPref,
  setWidgetPref,
  WIDGET_PINNED_KEY,
  WIDGET_SHOW_ON_STARTUP_KEY,
} from "@/lib/desktop-bridge";

/**
 * Compact "today" panel rendered inside the desktop app's sticky-note widget
 * window (frameless, NOT in the taskbar, NOT Alt-Tab-able — see
 * src-tauri/src/lib.rs). It mounts on a tiny provider tree (Theme + Accent +
 * I18n + Tasks) WITHOUT the router or MainLayout, selected in App.tsx when the
 * Tauri window injects `window.__CLEARMIND_WIDGET__`. Because it sits on the
 * same TasksProvider as the main window — wired to the CLI host — checking a
 * task here writes through to %APPDATA%/Clearmind and shows up live in the
 * web/mobile/main-window views too.
 *
 * Its header carries `data-tauri-drag-region` (drag to move) plus the three
 * controls the user asked for: pin/unpin · minimize (tuck to tray) · open the
 * full app. There is NO OS title bar.
 */
export function WidgetView() {
  const { tasks, updateTaskStatus } = useTasks();
  const t = useT();
  const { isToday, extractTimeLabel } = useDateFns();
  const [pinned, setPinned] = useState(false);

  // Apply saved prefs on mount: reveal iff "show on startup" is on (the window
  // is created hidden), and restore the pinned-on-top state.
  useEffect(() => {
    if (!isTauri()) return;
    const startPinned = getWidgetPref(WIDGET_PINNED_KEY, false);
    setPinned(startPinned);
    void setCurrentAlwaysOnTop(startPinned);
    if (getWidgetPref(WIDGET_SHOW_ON_STARTUP_KEY, true)) void showCurrent();
  }, []);

  // Stay in sync if the pin is toggled from the main window's Settings card.
  useEffect(() => {
    return subscribeSettings((s) => {
      const p = s[WIDGET_PINNED_KEY];
      if (typeof p === "boolean") {
        setPinned(p);
        void setCurrentAlwaysOnTop(p);
      }
    });
  }, []);

  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    void setCurrentAlwaysOnTop(next);
    setWidgetPref(WIDGET_PINNED_KEY, next);
  };

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
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden select-none rounded-xl border border-border/60">
      <header
        data-tauri-drag-region
        className="shrink-0 flex items-center justify-between gap-1 pl-3 pr-1.5 py-2 border-b bg-card/70 backdrop-blur cursor-grab active:cursor-grabbing"
      >
        <div data-tauri-drag-region className="min-w-0 flex items-center gap-2">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground leading-none">
              Clearmind
            </div>
            <div className="text-sm font-semibold leading-tight">
              {t("widget.today")}{" "}
              <span className="text-primary tabular-nums">{today.length}</span>
            </div>
          </div>
        </div>

        {/* The three controls — NOT drag regions so they stay clickable. */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={togglePin}
            title={pinned ? t("widget.unpin") : t("widget.pin")}
            aria-label={pinned ? t("widget.unpin") : t("widget.pin")}
            className={cn(
              "h-7 w-7 grid place-items-center rounded-md transition-colors",
              pinned
                ? "text-primary bg-primary/15 hover:bg-primary/25"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => void hideCurrent()}
            title={t("widget.minimize")}
            aria-label={t("widget.minimize")}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void openMainWindow()}
            title={t("widget.openApp")}
            aria-label={t("widget.openApp")}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
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
