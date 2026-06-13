import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Clock, Plus, Search, Settings, Power, PowerOff } from "lucide-react";
import { Sidebar } from "./sidebar";
import { MobileTabBar } from "./mobile-tab-bar";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { useTasks } from "@/hooks/use-tasks";
import { useTaskCommands } from "@/components/task-commands";
import { isPast, isRecurringClass } from "@/lib/utils";
import { useTickingNow } from "@/lib/use-ticking-now";
import { useCliHealth } from "@/lib/use-cli-health";
import { useI18n, useT, useTimeZoneOption } from "@/lib/i18n";
import { LanguageToggle } from "@/components/language-toggle";
import { TipBanner } from "@/components/tip-banner";
import { DuplicateBanner } from "@/components/duplicate-banner";

export function MainLayout({ children }: { children: ReactNode }) {
  // Root locked to exactly viewport height (h-dvh handles mobile address-bar
  // changes). Without this lock the body itself was scrolling whenever a page
  // had tall content — which dragged the calendar's sticky chrome up with the
  // rest of the page, defeating `position: sticky` on the inner scroll
  // container. `overflow-hidden` here doesn't clip the visible UI because
  // `<main>` owns the scroll: any page-level overflow (Tasks, Review, etc.)
  // now scrolls *inside main*, keeping TopBar + TipBanner correctly pinned at
  // the top of main's scroll context, and letting Calendar's bounded chain
  // engage its own inner scroll for the agenda list.
  return (
    <div
      className="flex h-dvh overflow-hidden bg-background relative selection:bg-primary/30"
      style={{
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      <Sidebar />
      <main className="flex-1 flex flex-col relative z-10 min-w-0 overflow-y-auto">
        <TopBar />
        <TipBanner />
        <DuplicateBanner />
        <div className="p-4 md:p-6 lg:p-8 cm-mobile-content-pad flex flex-col flex-1 min-h-0">
          <div className="max-w-[1600px] w-full mx-auto flex-1 flex flex-col min-h-0">
            {children}
          </div>
        </div>
      </main>
      <MobileTabBar />
    </div>
  );
}

function TopBar() {
  const { tasks } = useTasks();
  const { openCreate, openPalette } = useTaskCommands();
  const now = useTickingNow();
  const t = useT();

  const overdueCount = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status !== "done" &&
          t.deadline &&
          isPast(t.deadline, now) &&
          !isRecurringClass(t)
      ).length,
    [tasks, now]
  );

  const { lang } = useI18n();
  const tzOpt = useTimeZoneOption();
  const localeTag = lang === "en" ? "en-US" : "vi-VN";
  const dateLabel = now.toLocaleDateString(localeTag, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    ...tzOpt,
  });
  const timeLabel = now.toLocaleTimeString(localeTag, {
    hour: "2-digit",
    minute: "2-digit",
    ...tzOpt,
  });

  return (
    <header
      className="border-b border-border/50 bg-background/60 backdrop-blur-md flex items-center gap-2 sm:gap-3 px-3 sm:px-5 lg:px-6 shrink-0 sticky top-0 z-20"
      style={{
        // h-14 visible content plus safe-area-inset-top so iPhone Dynamic
        // Island / notched OS chrome doesn't crash the topbar contents.
        // PWA standalone iOS also needs this padding because we set
        // status-bar-style=black-translucent in index.html.
        height: "calc(3.5rem + env(safe-area-inset-top, 0px))",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Brand on mobile only — bottom tab bar handles primary nav, so the
          brand is reduced to a tappable logo (no wordmark) to claw back
          ~75px of topbar width on iPhone SE. */}
      <Link
        to="/dashboard"
        title={t("topbar.dashboardTooltip")}
        aria-label={t("nav.dashboard")}
        className="md:hidden flex items-center shrink-0 cm-touch-44"
      >
        <Logo className="h-7 w-7" />
      </Link>

      <Link
        to="/dashboard"
        title={t("topbar.dashboardTooltip")}
        className="hidden md:flex items-center gap-2 text-sm shrink-0 hover:text-primary transition-colors"
      >
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="capitalize font-semibold">{dateLabel}</span>
        <span className="text-muted-foreground tabular-nums">· {timeLabel}</span>
      </Link>

      <button
        onClick={openPalette}
        aria-label={t("common.search")}
        aria-keyshortcuts="Meta+K Control+K"
        className="cm-touch-44 hidden sm:flex flex-1 lg:flex-initial lg:w-[380px] items-center gap-2 h-9 px-3 rounded-md border bg-muted/40 hover:bg-muted/60 hover:border-input text-sm text-muted-foreground transition-colors ml-auto lg:mx-auto outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left truncate">{t("topbar.searchPlaceholder")}</span>
        <kbd className="text-[10px] border rounded px-1.5 py-0.5 font-mono bg-background shrink-0">
          ⌘K
        </kbd>
      </button>

      <button
        onClick={openPalette}
        className="cm-touch-44 sm:hidden ml-auto p-2 rounded-md hover:bg-muted text-muted-foreground"
        aria-label={t("common.search")}
      >
        <Search className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2 shrink-0">
        <CliStatusBadge />
        {overdueCount > 0 && (
          <Link
            to="/tasks#overdue"
            title={t("topbar.overdue", { n: overdueCount })}
            className="cm-press cm-late-pulse cm-touch-44 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/15 transition-colors"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {t("topbar.overdue", { n: overdueCount })}
          </Link>
        )}
        <Button
          size="sm"
          onClick={() => openCreate()}
          className="gap-1.5 cm-touch-44"
          title={t("palette.action.new")}
          aria-label={t("palette.action.new")}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden md:inline">{t("topbar.add")}</span>
        </Button>
        {/* Mobile-only Settings shortcut. The bottom-tab bar carries the 5
            primary destinations (Dashboard/Calendar/Tasks/Focus/Review) but
            Settings/Import/Guide live in the desktop sidebar's footer — on
            mobile that disappears, so this icon button is the discoverable
            entry-point for theme/language/timezone/backup/etc. Goes to the
            Appearance tab by default so first-touch lands somewhere visually
            engaging instead of the dense System tab. */}
        <Link
          to="/settings?tab=appearance"
          aria-label={t("nav.settings")}
          title={t("nav.settings")}
          className="cm-touch-44 md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Settings className="h-5 w-5" />
        </Link>
        {/* Lang + theme toggles move off mobile topbar — they live in Settings
            (and the bottom-tab bar surfaces the Settings page). Saves ~140px
            of topbar width on iPhone SE 375px so the Add button + overdue
            chip have proper breathing room. */}
        <div className="hidden md:flex items-center gap-2">
          <LanguageToggle />
          <ModeToggle />
        </div>
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
  const t = useT();
  if (status === "n/a") return null;
  if (status === "online") {
    return (
      <Link
        to="/settings?tab=system"
        title={t("cli.tooltipOnline", { port: port ?? "" })}
        className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold hover:bg-emerald-500/15 transition-colors"
      >
        <Power className="h-3 w-3" />
        {t("cli.online")}
      </Link>
    );
  }
  const offline = status === "offline";
  return (
    <Link
      to="/settings?tab=system"
      title={offline ? t("cli.tooltipOffline") : t("common.loading")}
      className={
        offline
          ? "cm-touch-44 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/10 text-destructive text-[11px] font-semibold hover:bg-destructive/15 transition-colors animate-pulse"
          : "hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold"
      }
    >
      <PowerOff className="h-3 w-3" />
      {offline ? t("cli.offline") : t("cli.checking")}
    </Link>
  );
}
