import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTaskCommands } from "@/components/tasks/task-commands";
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Timer,
  TrendingUp,
  Settings,
  Command,
  Sparkles,
  Mic,
  Bell,
  Repeat,
  Tag,
  Download,
  Upload,
  MousePointerClick,
  Hourglass,
  ArrowRight,
  Keyboard,
  Lightbulb,
  MapPin,
  Flame,
  GraduationCap,
  CalendarPlus,
  Server,
  Smartphone,
  Globe,
  Hand,
  ChevronDown,
  Power,
  HardDrive,
  RotateCcw,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { useT } from "@/lib/i18n";
import { useTasks } from "@/hooks/use-tasks";
import { usePlatform } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";

type Feature = {
  icon: typeof LayoutDashboard;
  title: string;
  desc: string;
  to?: string;
  accent: string;
};

export function GuidePage() {
  const { openCreate } = useTaskCommands();
  const t = useT();
  const platform = usePlatform();
  const { requestNotifications } = useTasks();

  const FEATURES: Feature[] = [
    {
      icon: LayoutDashboard,
      title: t("guide.feature.dashboard.title"),
      desc: t("guide.feature.dashboard.desc"),
      to: "/dashboard",
      accent: "text-primary bg-primary/10",
    },
    {
      icon: Calendar,
      title: t("guide.feature.calendar.title"),
      desc: t("guide.feature.calendar.desc"),
      to: "/calendar",
      accent: "text-blue-500 bg-blue-500/10",
    },
    {
      icon: CheckSquare,
      title: t("guide.feature.tasks.title"),
      desc: t("guide.feature.tasks.desc"),
      to: "/tasks",
      accent: "text-emerald-500 bg-emerald-500/10",
    },
    {
      icon: Timer,
      title: t("guide.feature.focus.title"),
      desc: t("guide.feature.focus.desc"),
      to: "/focus",
      accent: "text-orange-500 bg-orange-500/10",
    },
    {
      icon: TrendingUp,
      title: t("guide.feature.review.title"),
      desc: t("guide.feature.review.desc"),
      to: "/review",
      accent: "text-violet-500 bg-violet-500/10",
    },
    {
      icon: CalendarPlus,
      title: t("guide.feature.import.title"),
      desc: t("guide.feature.import.desc"),
      to: "/import",
      accent: "text-pink-500 bg-pink-500/10",
    },
    {
      icon: Settings,
      title: t("guide.feature.settings.title"),
      desc: t("guide.feature.settings.desc"),
      to: "/settings",
      accent: "text-muted-foreground bg-muted",
    },
  ];

  const QUICK_STEPS = [
    {
      icon: Command,
      title: t("guide.step.capture.title"),
      desc: t("guide.step.capture.desc"),
    },
    {
      icon: Tag,
      title: t("guide.step.autoParse.title"),
      desc: t("guide.step.autoParse.desc"),
    },
    {
      icon: MapPin,
      title: t("guide.step.location.title"),
      desc: t("guide.step.location.desc"),
    },
    {
      icon: MousePointerClick,
      title: t("guide.step.drag.title"),
      desc: t("guide.step.drag.desc"),
    },
    {
      icon: Hourglass,
      title: t("guide.step.focus.title"),
      desc: t("guide.step.focus.desc"),
    },
    {
      icon: TrendingUp,
      title: t("guide.step.review.title"),
      desc: t("guide.step.review.desc"),
    },
  ];

  // Power tips — annotate cliOnly so we hide backup advice from
  // browser/mobile users (where it doesn't apply at all).
  const POWER_TIPS: Array<{
    icon: typeof GraduationCap;
    title: string;
    desc: string;
    cliOnly?: boolean;
  }> = [
    {
      icon: GraduationCap,
      title: t("guide.tip.weeklySchedule.title"),
      desc: t("guide.tip.weeklySchedule.desc"),
    },
    {
      icon: Flame,
      title: t("guide.tip.urgent.title"),
      desc: t("guide.tip.urgent.desc"),
    },
    {
      icon: Mic,
      title: t("guide.tip.voice.title"),
      desc: t("guide.tip.voice.desc"),
    },
    {
      icon: Bell,
      title: t("guide.tip.notify.title"),
      desc: t("guide.tip.notify.desc"),
    },
    {
      icon: Repeat,
      title: t("guide.tip.recurrence.title"),
      desc: t("guide.tip.recurrence.desc"),
    },
    {
      icon: Download,
      title: t("guide.tip.backup.title"),
      desc: t("guide.tip.backup.desc"),
      cliOnly: true,
    },
    {
      icon: Upload,
      title: t("guide.tip.import.title"),
      desc: t("guide.tip.import.desc"),
    },
  ];

  // Shortcuts — only meaningful on desktop. Mobile users see the
  // Gestures section instead. Includes Focus-page shortcuts (Space /
  // R / S) that weren't in the earlier 4-item list — those genuinely
  // exist (see focus.tsx) and the guide should advertise them.
  const SHORTCUTS: [string, string][] = [
    ["⌘ K / Ctrl K", t("guide.shortcut.palette")],
    ["↑ ↓", t("guide.shortcut.nav")],
    ["Enter", t("guide.shortcut.select")],
    ["Esc", t("guide.shortcut.escape")],
    ["Space", t("guide.shortcut.focusPause")],
    ["R", t("guide.shortcut.focusReset")],
    ["S", t("guide.shortcut.focusSkip")],
  ];

  const GESTURES = [
    {
      icon: LayoutDashboard,
      title: t("guide.gesture.bottomTab.title"),
      desc: t("guide.gesture.bottomTab.desc"),
    },
    {
      icon: ChevronDown,
      title: t("guide.gesture.swipeSheet.title"),
      desc: t("guide.gesture.swipeSheet.desc"),
    },
    {
      icon: Hand,
      title: t("guide.gesture.longPress.title"),
      desc: t("guide.gesture.longPress.desc"),
    },
    {
      icon: Command,
      title: t("guide.gesture.searchTopbar.title"),
      desc: t("guide.gesture.searchTopbar.desc"),
    },
  ];

  const CLI_FEATURES = [
    {
      icon: Server,
      title: t("guide.cli.tray.title"),
      desc: t("guide.cli.tray.desc"),
    },
    {
      icon: Power,
      title: t("guide.cli.autostart.title"),
      desc: t("guide.cli.autostart.desc"),
    },
    {
      icon: HardDrive,
      title: t("guide.cli.backup.title"),
      desc: t("guide.cli.backup.desc"),
    },
    {
      icon: RotateCcw,
      title: t("guide.cli.recovery.title"),
      desc: t("guide.cli.recovery.desc"),
    },
    {
      icon: Bell,
      title: t("guide.cli.notif.title"),
      desc: t("guide.cli.notif.desc"),
    },
  ];

  // Pick platform badge label + icon (single source of truth at the
  // top of the page so user immediately sees how the rest of the page
  // is contextualised).
  const platformBadge = platform.isStandalonePWA
    ? { label: t("guide.platform.pwa"), icon: Smartphone }
    : platform.isCli
      ? { label: t("guide.platform.cli"), icon: Server }
      : platform.isMobileWeb
        ? { label: t("guide.platform.mobile"), icon: Smartphone }
        : { label: t("guide.platform.web"), icon: Globe };
  const PlatformIcon = platformBadge.icon;

  const visibleTips = POWER_TIPS.filter((tip) => !tip.cliOnly || platform.isCli);

  return (
    <div className="flex flex-col gap-8 pb-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-background to-accent/20 p-8 md:p-12">
        <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-8 opacity-30 pointer-events-none hidden md:block">
          <Logo className="h-40 w-40" />
        </div>
        <div className="relative max-w-2xl">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" /> {t("guide.hero.badge")}
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 border text-[11px] font-medium text-muted-foreground">
              <PlatformIcon className="h-3 w-3" />
              {platformBadge.label}
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-3">
            <Logo className="h-10 w-10 md:hidden" />
            {t("guide.hero.welcomePrefix")} <span className="text-primary">Clearmind</span>
          </h1>
          <p className="text-muted-foreground mt-3 text-base md:text-lg leading-relaxed">
            {t("guide.hero.intro")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => openCreate()} className="gap-2">
              <Command className="h-4 w-4" /> {t("guide.hero.createFirst")}
            </Button>
            <Button variant="outline" asChild>
              <Link to="/dashboard" className="gap-2">
                {t("guide.hero.openDashboard")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Features grid */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{t("guide.features.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("guide.features.subtitle")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, to, accent }) => {
            const inner = (
              <Card className="h-full hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 cursor-pointer bg-card">
                <CardHeader className="pb-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base mt-3">{title}</CardTitle>
                  <CardDescription className="leading-relaxed">
                    {desc}
                  </CardDescription>
                </CardHeader>
                {to && (
                  <CardContent className="pt-0">
                    <span className="text-xs font-medium text-primary inline-flex items-center gap-1">
                      {t("guide.features.openLink")} <ArrowRight className="h-3 w-3" />
                    </span>
                  </CardContent>
                )}
              </Card>
            );
            return to ? (
              <Link key={title} to={to} className="block">
                {inner}
              </Link>
            ) : (
              <div key={title}>{inner}</div>
            );
          })}
        </div>
      </section>

      {/* Quick start steps */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">{t("guide.steps.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("guide.steps.subtitle")}
          </p>
        </div>
        <Card className="bg-card">
          <CardContent className="pt-6">
            <ol className="space-y-4">
              {QUICK_STEPS.map(({ icon: Icon, title, desc }, i) => (
                <li
                  key={title}
                  className="flex gap-4 p-3 rounded-xl border bg-background/50"
                >
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center">
                      {i + 1}
                    </div>
                    {i < QUICK_STEPS.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-2" />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <h3 className="font-medium">{title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* Notifications — every platform speaks notifications, but how
          they actually fire differs significantly. Section content
          adapts so a mobile-web user doesn't read about Windows toasts
          they can never get. */}
      <NotificationsGuide
        platform={platform}
        onRequest={requestNotifications}
        t={t}
      />

      {/* Power tips */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-orange-500" />
          <h2 className="text-xl font-semibold tracking-tight">{t("guide.tips.title")}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTips.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="p-4 rounded-xl border bg-card hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-primary" />
                <h3 className="font-medium text-sm">{title}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CLI-only — tray, autostart, backup, recovery. Hidden entirely
          on web/mobile since those features simply don't exist there. */}
      {platform.isCli && (
        <section>
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-emerald-500" />
              <h2 className="text-xl font-semibold tracking-tight">
                {t("guide.cli.title")}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t("guide.cli.subtitle")}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CLI_FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="p-4 rounded-xl border bg-emerald-500/5 border-emerald-500/20"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="font-medium text-sm">{title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Shortcuts (desktop) OR Gestures (mobile) — never both, since
          a phone has no keyboard and a mouse-user doesn't long-press. */}
      {platform.isMobile ? (
        <section className="pb-4">
          <div className="mb-4 flex items-center gap-2">
            <Hand className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold tracking-tight">
              {t("guide.gestures.title")}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {t("guide.gestures.subtitle")}
          </p>
          <Card className="bg-card">
            <CardContent className="pt-6 space-y-3">
              {GESTURES.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="flex gap-3 p-3 rounded-lg border bg-background/50"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm">{title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : (
        <section className="pb-4">
          <div className="mb-4 flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold tracking-tight">
              {t("guide.shortcuts.title")}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {platform.isCli
              ? t("guide.shortcuts.descCli")
              : t("guide.shortcuts.descWeb")}
          </p>
          <Card className="bg-card">
            <CardContent className="pt-6">
              <div className="grid sm:grid-cols-2 gap-3">
                {SHORTCUTS.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between p-3 rounded-lg border bg-background/50"
                  >
                    <span className="text-sm">{v}</span>
                    <kbd className="text-xs border rounded px-1.5 py-0.5 font-mono bg-muted shrink-0">
                      {k}
                    </kbd>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* PWA install hint — shows to non-CLI users who haven't installed
          the PWA yet. CLI users already have the native tray app, and
          installed-PWA users already did the thing. */}
      {!platform.isCli && !platform.isStandalonePWA && (
        <section className="pb-4">
          <div className="rounded-2xl border bg-gradient-to-br from-accent/15 via-card to-primary/5 p-5 sm:p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-base">{t("guide.pwa.title")}</h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {t("guide.pwa.desc")}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Notifications guide — three-card grid (CLI / Web / Mobile) with the
 * card matching the user's current platform tinted + flagged active.
 * Below the cards, a live permission-status line + an actionable
 * "Grant permission" button when the browser supports the API and the
 * user hasn't decided yet (or already denied — clicking the button
 * after deny is harmless; the browser shows the same hint).
 */
function NotificationsGuide({
  platform,
  onRequest,
  t,
}: {
  platform: ReturnType<typeof usePlatform>;
  onRequest: () => Promise<boolean>;
  t: ReturnType<typeof useT>;
}) {
  const cards = [
    {
      key: "cli",
      icon: Server,
      title: t("guide.notif.cli.title"),
      desc: t("guide.notif.cli.desc"),
      active: platform.isCli,
    },
    {
      key: "web",
      icon: Globe,
      title: t("guide.notif.web.title"),
      desc: t("guide.notif.web.desc"),
      active: platform.isWebDesktop,
    },
    {
      key: "mobile",
      icon: Smartphone,
      title: t("guide.notif.mobile.title"),
      desc: t("guide.notif.mobile.desc"),
      active: platform.isMobileWeb,
    },
  ];

  const permissionLine =
    platform.notifPermission === "granted"
      ? { className: "text-emerald-600 dark:text-emerald-400", text: t("guide.notif.permission.granted") }
      : platform.notifPermission === "denied"
        ? { className: "text-destructive", text: t("guide.notif.permission.denied") }
        : platform.notifPermission === "unsupported"
          ? { className: "text-muted-foreground italic", text: t("guide.notif.permission.unsupported") }
          : { className: "text-amber-600 dark:text-amber-400", text: t("guide.notif.permission.default") };

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold tracking-tight">
          {t("guide.notif.title")}
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        {t("guide.notif.subtitle")}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map(({ key, icon: Icon, title, desc, active }) => (
          <div
            key={key}
            className={cn(
              "p-4 rounded-xl border transition-colors",
              active
                ? "bg-primary/10 border-primary/40 shadow-sm"
                : "bg-card border-border"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon
                className={cn(
                  "h-4 w-4",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              />
              <h3 className="font-medium text-sm">{title}</h3>
              {active && (
                <span className="ml-auto text-[10px] uppercase tracking-wider font-bold text-primary px-1.5 py-0.5 rounded-full bg-primary/15 border border-primary/30">
                  ●
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {desc}
            </p>
          </div>
        ))}
      </div>

      {/* Live permission status + grant button — only meaningful when
          the user is NOT on CLI (CLI uses the OS toast system, no
          Notifications API permission required). */}
      {!platform.isCli && platform.hasNotifAPI && (
        <div className="mt-4 p-4 rounded-xl border bg-background/50 flex items-center justify-between gap-3 flex-wrap">
          <p className={cn("text-sm font-medium", permissionLine.className)}>
            {permissionLine.text}
          </p>
          {platform.notifPermission !== "granted" &&
            platform.notifPermission !== "unsupported" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRequest()}
                className="gap-2 shrink-0"
              >
                <Bell className="h-3.5 w-3.5" />
                {t("guide.notif.requestButton")}
              </Button>
            )}
        </div>
      )}
    </section>
  );
}
