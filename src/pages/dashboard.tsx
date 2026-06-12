import { memo, useEffect, useMemo } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useTickingNow } from "@/lib/use-ticking-now";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTasks, type Task } from "@/hooks/use-tasks";
import { useTaskCommands } from "@/components/task-commands";
import { useT, useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Flame,
  MapPin,
  AlertCircle,
  Sparkles,
  Play,
  Hourglass,
  CheckCircle2,
  Inbox,
  TrendingUp,
  ChevronRight,
  Calendar as CalendarIcon,
  Zap,
} from "lucide-react";
import {
  formatDeadline,
  isToday,
  isPast,
  isRecurringClass,
  extractTimeLabel,
  sortByTimeOfDay,
  subjectColor,
  cn,
} from "@/lib/utils";

export function Dashboard() {
  const { tasks } = useTasks();
  const { openEdit, openCreate } = useTaskCommands();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const t = useT();
  const { lang } = useI18n();

  // Deep-link: tray "Quick Capture" item opens /dashboard?capture=1
  // → auto-open the create dialog, then strip the query so reload doesn't re-trigger.
  useEffect(() => {
    if (searchParams.get("capture") === "1") {
      openCreate();
      const next = new URLSearchParams(searchParams);
      next.delete("capture");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, openCreate]);

  // ---- Derived state ---------------------------------------------------

  // Tick every 30s so countdowns ("Sắp tới · 5 phút"), "Up next" hero, and
  // overdue badges stay aligned with reality without a full reload.
  const nowDate = useTickingNow(30_000);
  const now = nowDate.getTime();

  const todayList = useMemo(
    () =>
      sortByTimeOfDay(
        tasks.filter((t) => t.status !== "done" && isToday(t.deadline))
      ),
    [tasks]
  );

  // The "next up" hero — closest upcoming undone task today/tomorrow,
  // fallback to highest priority undone.
  const nextUp = useMemo(() => {
    const upcoming = tasks
      .filter(
        (t) =>
          t.status !== "done" &&
          t.deadline &&
          new Date(t.deadline).getTime() > now - 60 * 1000
      )
      .sort(
        (a, b) =>
          new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()
      );
    if (upcoming.length) return upcoming[0];
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (
      tasks
        .filter((t) => t.status !== "done")
        .sort(
          (a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3)
        )[0] || null
    );
  }, [tasks, now]);

  // Build localized weekday labels once per language flip — buildWeekStrip
  // receives them as a 7-element array indexed by getDay().
  const dowLabels = useMemo(
    () => DOW_I18N_KEYS.map((k) => t(k)),
    [t]
  );
  const weekStrip = useMemo(
    () => buildWeekStrip(tasks, dowLabels),
    [tasks, dowLabels]
  );

  const recentDone = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "done" && t.completedAt)
        .sort(
          (a, b) =>
            new Date(b.completedAt!).getTime() -
            new Date(a.completedAt!).getTime()
        )
        .slice(0, 5),
    [tasks]
  );

  const stats = useMemo(() => {
    const undone = tasks.filter((t) => t.status !== "done");
    const overdue = undone.filter(
      (t) => t.deadline && isPast(t.deadline) && !isRecurringClass(t)
    ).length;
    const inbox = undone.filter((t) => !t.deadline).length;
    const doneToday = tasks.filter(
      (t) => t.status === "done" && t.completedAt && isToday(t.completedAt)
    ).length;
    const totalToday =
      doneToday +
      tasks.filter((t) => t.status !== "done" && isToday(t.deadline)).length;
    const todayProgress = totalToday ? doneToday / totalToday : 0;
    const focusToday = tasks.reduce((sum, t) => {
      if (!t.completedAt || !isToday(t.completedAt)) return sum;
      return sum + (t.pomodoroMinutes || 0);
    }, 0);
    const focusWeek = tasks.reduce(
      (sum, t) => sum + (t.pomodoroMinutes || 0),
      0
    );

    // streak: consecutive days ending today with ≥1 done
    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const done = new Set(
      tasks
        .filter((t) => t.status === "done" && t.completedAt)
        .map((t) => dayKey(new Date(t.completedAt!)))
    );
    let streak = 0;
    const c = new Date();
    while (done.has(dayKey(c))) {
      streak++;
      c.setDate(c.getDate() - 1);
    }

    return {
      undone: undone.length,
      overdue,
      inbox,
      doneToday,
      totalToday,
      todayProgress,
      focusToday,
      focusWeek,
      streak,
    };
  }, [tasks]);

  // ---- Render ----------------------------------------------------------

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Top: greeting + stats */}
      <div className="shrink-0 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            {new Date().toLocaleDateString(lang === "en" ? "en-US" : "vi-VN", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </p>
          <h1 className="text-3xl font-bold tracking-tight mt-0.5">
            {greet(t)}
            {stats.overdue > 0 && (
              <span className="text-destructive">.</span>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {dashboardSubline(stats, t)}
          </p>
        </div>
        {/* Only show stats that have something meaningful. New users see a
            clean header without zero-value tiles cluttering the surface. */}
        <div className="flex flex-wrap gap-2">
          {stats.totalToday > 0 && (
            <ProgressRing
              value={stats.todayProgress}
              label={t("dash.stat.today")}
              sub={`${stats.doneToday}/${stats.totalToday}`}
            />
          )}
          {stats.streak > 0 && (
            <StatTile
              icon={Flame}
              value={stats.streak}
              label={t("dash.stat.streak")}
              tone="orange"
            />
          )}
          {stats.focusToday > 0 && (
            <StatTile
              icon={Hourglass}
              value={stats.focusToday}
              label={t("dash.stat.focus")}
              tone="emerald"
              suffix="m"
            />
          )}
          {stats.overdue > 0 && (
            <StatTile
              icon={AlertCircle}
              value={stats.overdue}
              label={t("dash.stat.overdue")}
              tone="destructive"
              onClick={() => navigate("/tasks")}
            />
          )}
        </div>
      </div>

      {/* Hero "Up next" */}
      {nextUp && (
        <UpNextHero
          task={nextUp}
          onEdit={() => openEdit(nextUp.id)}
          onFocus={() => navigate("/focus")}
        />
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        {/* Today agenda — main column */}
        <div className="lg:col-span-2 flex flex-col gap-5 min-h-0">
          <Card className="flex flex-col flex-1 min-h-0">
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarIcon className="h-5 w-5 text-primary" />
                  {t("dash.todayTitle")}
                </CardTitle>
                <CardDescription>
                  {todayList.length === 0
                    ? t("dash.todayEmpty")
                    : t("dash.todayCount", { n: todayList.length })}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openCreate()}
                className="gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" /> {t("dash.add")}
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-2">
              {todayList.length === 0 ? (
                <EmptyAgenda onCreate={() => openCreate()} />
              ) : (
                todayList.map((task) => (
                  <AgendaRow
                    key={task.id}
                    task={task}
                    onClick={() => openEdit(task.id)}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* Week strip */}
          <Card className="shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="inline-flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  {t("dash.weekTitle")}
                </span>
                <Link
                  to="/calendar"
                  className="text-xs text-primary hover:underline inline-flex items-center"
                >
                  {t("dash.weekFull")} <ChevronRight className="h-3 w-3 ml-0.5" />
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1.5">
                {weekStrip.map((d) => (
                  <Link
                    key={d.iso}
                    to={`/calendar?date=${d.iso}`}
                    className={cn(
                      "rounded-lg p-2 border bg-background/50 hover:bg-accent hover:-translate-y-0.5 transition-all min-h-[88px] flex flex-col",
                      d.isToday && "border-primary bg-primary/5 hover:bg-primary/10",
                      d.isPast && !d.isToday && "opacity-60"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-wide",
                          d.isToday ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        {d.dowLabel}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-bold tabular-nums",
                          d.isToday && "text-primary"
                        )}
                      >
                        {d.day}
                      </span>
                    </div>
                    <div className="flex-1 mt-1.5 space-y-0.5 overflow-hidden">
                      {d.tasks.slice(0, 2).map((t) => {
                        const col = subjectColor(t.title);
                        return (
                          <div
                            key={t.id}
                            className={cn(
                              "text-[10px] rounded px-1 py-0.5 truncate font-medium",
                              col.bg,
                              col.text
                            )}
                            title={t.title}
                          >
                            {t.title}
                          </div>
                        );
                      })}
                      {d.tasks.length > 2 && (
                        <p className="text-[9px] text-muted-foreground">
                          +{d.tasks.length - 2} more
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5 min-h-0 overflow-y-auto pr-1">
          {/* Focus snapshot */}
          <Card className="shrink-0 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4 text-primary" />
                {t("dash.focusTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  {Math.floor(stats.focusWeek / 60)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t("dash.focusWeek", {
                    extra: stats.focusWeek % 60 > 0 ? `${stats.focusWeek % 60}m` : "",
                  })}
                </span>
              </div>
              <Button
                onClick={() => navigate("/focus")}
                className="w-full gap-2"
                size="sm"
              >
                <Play className="h-3.5 w-3.5" />
                {t("dash.focusStart")}
              </Button>
            </CardContent>
          </Card>

          {/* Inbox */}
          {stats.inbox > 0 && (
            <Card className="shrink-0 hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => navigate("/tasks")}>
              <CardContent className="pt-5 pb-5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Inbox className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    {t("dash.inboxCount", { n: stats.inbox })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("dash.inboxHint")}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          )}

          {/* Recent activity */}
          <Card className="shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {t("dash.recentTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentDone.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  {t("dash.recentEmpty")}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {recentDone.map((rt) => (
                    <div
                      key={rt.id}
                      className="flex items-center gap-2 py-1 text-xs"
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          subjectColor(rt.title).dot
                        )}
                      />
                      <span className="flex-1 truncate text-foreground/80 line-through opacity-70">
                        {rt.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {timeAgo(rt.completedAt!, t)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Insights */}
          {stats.focusWeek > 0 && (
            <Card className="shrink-0 border-dashed">
              <CardContent className="pt-5 pb-5 flex items-start gap-3">
                <TrendingUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="text-xs leading-relaxed">
                  <p className="font-medium">{insight(stats, tasks, t)}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function UpNextHero({
  task,
  onEdit,
  onFocus,
}: {
  task: Task;
  onEdit: () => void;
  onFocus: () => void;
}) {
  const t = useT();
  const time = extractTimeLabel(task.deadline);
  const overdue = isPast(task.deadline);
  const color = subjectColor(task.title);
  return (
    <div
      className={cn(
        "shrink-0 relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-primary/5 p-5 cursor-pointer hover:shadow-md transition-shadow",
        task.priority === "high" && "border-destructive/40",
        overdue && "ring-1 ring-destructive/40"
      )}
      onClick={onEdit}
    >
      <div className={cn("absolute left-0 top-0 bottom-0 w-1.5", color.dot)} />
      <div className="flex items-start gap-4 pl-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              {overdue ? t("dash.upnextOverdue") : t("dash.upnext")}
            </p>
            {task.priority === "high" && (
              <span className="text-[10px] font-bold uppercase text-destructive inline-flex items-center gap-0.5">
                <Flame className="h-2.5 w-2.5" /> {t("priority.urgent")}
              </span>
            )}
          </div>
          <h3 className="text-xl md:text-2xl font-bold leading-tight tracking-tight line-clamp-2">
            {task.title}
          </h3>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
            {task.deadline && (
              <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                <Clock className="h-3.5 w-3.5" />
                {time
                  ? `${time} · ${formatDeadline(task.deadline)}`
                  : formatDeadline(task.deadline)}
              </span>
            )}
            {task.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {task.location}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
              {t(`type.${task.type}`)}
            </span>
          </div>
        </div>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
          size="sm"
          className="gap-1.5 shrink-0"
        >
          <Play className="h-3.5 w-3.5" />
          Focus
        </Button>
      </div>
    </div>
  );
}

const AgendaRow = memo(function AgendaRow({
  task,
  onClick,
}: {
  task: Task;
  onClick: () => void;
}) {
  const t = useT();
  const time = extractTimeLabel(task.deadline);
  const overdue = isPast(task.deadline);
  const color = subjectColor(task.title);
  return (
    <div
      className={cn(
        "group flex items-stretch gap-3 p-3 rounded-xl border bg-background/60 hover:bg-accent hover:-translate-y-0.5 hover:shadow-sm transition-all cursor-pointer",
        task.priority === "high" && "border-destructive/30",
        overdue && "ring-1 ring-destructive/40"
      )}
      onClick={onClick}
    >
      <div className="w-14 shrink-0 flex flex-col items-center justify-center text-center">
        {time ? (
          <>
            <span className="text-base font-bold tabular-nums leading-none">
              {time}
            </span>
            {overdue && (
              <span className="text-[9px] font-bold uppercase text-destructive mt-1">
                {t("dash.upnextOverdue")}
              </span>
            )}
          </>
        ) : (
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              color.dot
            )}
          />
        )}
      </div>
      <div className={cn("w-1 rounded-full", color.dot)} />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="font-semibold text-sm leading-tight line-clamp-2">
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px]">
          {task.location && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {task.location}
            </span>
          )}
          {task.priority === "high" && (
            <span className="font-bold uppercase text-destructive inline-flex items-center gap-0.5">
              <Flame className="h-2.5 w-2.5" /> {t("priority.urgent")}
            </span>
          )}
          <span className="text-muted-foreground">{t(`type.${task.type}`)}</span>
        </div>
      </div>
    </div>
  );
});

function EmptyAgenda({ onCreate }: { onCreate: () => void }) {
  const t = useT();
  return (
    <div className="h-full flex-1 flex flex-col items-center justify-center text-center gap-3 py-10">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <div className="max-w-sm">
        <p className="font-semibold">{t("dashboard.emptyAgendaTitle")}</p>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {t("dashboard.emptyAgendaHint")}
        </p>
      </div>
      <Button onClick={onCreate} className="gap-1.5" size="sm">
        <Sparkles className="h-3.5 w-3.5" /> {t("dashboard.emptyAgendaButton")}
      </Button>
    </div>
  );
}

function ProgressRing({
  value,
  label,
  sub,
}: {
  value: number;
  label: string;
  sub: string;
}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const C = 2 * Math.PI * 22;
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-card">
      <div className="relative h-12 w-12 shrink-0">
        <svg className="h-12 w-12 -rotate-90" viewBox="0 0 52 52">
          <circle
            cx="26"
            cy="26"
            r="22"
            fill="none"
            strokeWidth="5"
            className="stroke-muted"
          />
          <circle
            cx="26"
            cy="26"
            r="22"
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            className="stroke-primary transition-all duration-500"
            strokeDasharray={`${(C * pct) / 100} ${C}`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums">
          {Math.round(pct)}%
        </span>
      </div>
      <div className="leading-tight">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </p>
        <p className="text-sm font-bold tabular-nums">{sub}</p>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
  tone,
  suffix,
  onClick,
}: {
  icon: typeof Flame;
  value: number;
  label: string;
  tone: "primary" | "orange" | "emerald" | "destructive";
  suffix?: string;
  onClick?: () => void;
}) {
  const toneClasses =
    tone === "primary"
      ? "bg-primary/10 text-primary border-primary/20"
      : tone === "orange"
      ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
      : tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      : "bg-destructive/10 text-destructive border-destructive/20";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "px-3 py-2 rounded-xl border flex items-center gap-2 backdrop-blur transition-all",
        toneClasses,
        onClick && "hover:-translate-y-0.5 hover:shadow-sm cursor-pointer"
      )}
    >
      <Icon className="h-4 w-4 opacity-80" />
      <div className="leading-tight text-left">
        <p className="text-lg font-bold tabular-nums leading-none">
          {value}
          {suffix && (
            <span className="text-xs font-normal opacity-70 ml-0.5">
              {suffix}
            </span>
          )}
        </p>
        <p className="text-[10px] uppercase tracking-wider opacity-80 leading-none mt-1">
          {label}
        </p>
      </div>
    </Tag>
  );
}

/* ---------------- Pure helpers ---------------- */

interface DayCell {
  iso: string;
  day: number;
  dowLabel: string;
  isToday: boolean;
  isPast: boolean;
  tasks: Task[];
}

// Sun..Sat order, indexed by Date.getDay(). Resolved at render time via
// useT() so the labels follow the app language toggle.
const DOW_I18N_KEYS = [
  "review.dow.sun",
  "review.dow.mon",
  "review.dow.tue",
  "review.dow.wed",
  "review.dow.thu",
  "review.dow.fri",
  "review.dow.sat",
];

function buildWeekStrip(tasks: Task[], dowLabels: string[]): DayCell[] {
  const now = new Date();
  // Anchor to Monday of current week
  const monday = new Date(now);
  const diff = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - diff);
  monday.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const out: DayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = `${d.getFullYear()}-${(d.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
    const dayTasks = tasks.filter((t) => {
      if (!t.deadline) return false;
      const td = new Date(t.deadline);
      return (
        td.getFullYear() === d.getFullYear() &&
        td.getMonth() === d.getMonth() &&
        td.getDate() === d.getDate()
      );
    });
    out.push({
      iso,
      day: d.getDate(),
      dowLabel: dowLabels[d.getDay()] ?? "",
      isToday: d.getTime() === today.getTime(),
      isPast: d.getTime() < today.getTime(),
      tasks: sortByTimeOfDay(dayTasks),
    });
  }
  return out;
}

type T = ReturnType<typeof useT>;

function greet(t: T): string {
  const h = new Date().getHours();
  if (h < 11) return t("dash.greet.morning");
  if (h < 14) return t("dash.greet.noon");
  if (h < 18) return t("dash.greet.afternoon");
  return t("dash.greet.evening");
}

function dashboardSubline(
  stats: { totalToday: number; doneToday: number; overdue: number },
  t: T
): string {
  if (stats.overdue > 0) return t("dash.subline.overdue", { n: stats.overdue });
  if (stats.totalToday === 0) return t("dash.subline.noDeadline");
  if (stats.doneToday === stats.totalToday) return t("dash.subline.allDone");
  return `${stats.doneToday}/${stats.totalToday}`;
}

function timeAgo(iso: string, t: T): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return t("dash.timeAgo.just");
  if (m < 60) return t("dash.timeAgo.min", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("dash.timeAgo.hour", { n: h });
  const d = Math.round(h / 24);
  return t("dash.timeAgo.day", { n: d });
}

function insight(
  stats: { focusWeek: number; streak: number },
  tasks: Task[],
  t: T
): string {
  const map = new Map<string, number>();
  for (const task of tasks) {
    if (!task.pomodoroMinutes) continue;
    const key = task.title.split(/\s+/).slice(0, 2).join(" ");
    map.set(key, (map.get(key) || 0) + task.pomodoroMinutes);
  }
  const top = [...map.entries()].sort((a, b) => b[1] - a[1])[0];
  if (stats.focusWeek === 0) return t("dash.insight.empty");
  if (stats.streak >= 3)
    return `Streak ${stats.streak} · ${t("dash.stat.streak")}`;
  if (top && top[1] >= 30) return `${top[0]} — ${top[1]}m`;
  return `${stats.focusWeek}m · ${t("dash.focusTitle")}`;
}

