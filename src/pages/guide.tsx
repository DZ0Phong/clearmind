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
} from "lucide-react";
import { Logo } from "@/components/logo";
import { useT } from "@/lib/i18n";

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

  const POWER_TIPS = [
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
    },
    {
      icon: Upload,
      title: t("guide.tip.import.title"),
      desc: t("guide.tip.import.desc"),
    },
  ];

  const SHORTCUTS: [string, string][] = [
    ["⌘ K / Ctrl K", t("guide.shortcut.palette")],
    ["↑ ↓", t("guide.shortcut.nav")],
    ["Enter", t("guide.shortcut.select")],
    ["Esc", t("guide.shortcut.escape")],
  ];

  return (
    <div className="h-full flex flex-col gap-8">
      {/* Hero */}
      <div className="shrink-0 relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-background to-accent/20 p-8 md:p-12">
        <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-8 opacity-30 pointer-events-none hidden md:block">
          <Logo className="h-40 w-40" />
        </div>
        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <Sparkles className="h-3.5 w-3.5" /> {t("guide.hero.badge")}
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

      {/* Power tips */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-orange-500" />
          <h2 className="text-xl font-semibold tracking-tight">{t("guide.tips.title")}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {POWER_TIPS.map(({ icon: Icon, title, desc }) => (
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

      {/* Shortcuts */}
      <section className="pb-4">
        <div className="mb-4 flex items-center gap-2">
          <Keyboard className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">{t("guide.shortcuts.title")}</h2>
        </div>
        <Card className="bg-card">
          <CardContent className="pt-6">
            <div className="grid sm:grid-cols-2 gap-3">
              {SHORTCUTS.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between p-3 rounded-lg border bg-background/50"
                >
                  <span className="text-sm">{v}</span>
                  <kbd className="text-xs border rounded px-1.5 py-0.5 font-mono bg-muted">
                    {k}
                  </kbd>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
