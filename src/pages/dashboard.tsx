import { memo, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTickingNow } from "@/hooks/use-ticking-now";
import { useTasks, type Task } from "@/hooks/use-tasks";
import { useTaskCommands } from "@/components/tasks/task-commands";
import {
  useT,
  useI18n,
  useDateFns,
  DOW_KEYS_SUN_FIRST,
} from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Flame,
  MapPin,
  Sparkles,
  ChevronRight,
  AlertCircle,
  Clock,
  Play,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isPast, isRecurringClass, sortByTimeOfDay, subjectColor, cn } from "@/lib/utils";
import { FirstRunWelcome } from "@/components/feedback/first-run-welcome";

/**
 * "Today" page (route still `/dashboard` for bookmark compatibility, but
 * the LABEL in nav reads "Hôm nay" / "Today").
 *
 * Inspired by Things 3, Linear "My Issues", Sunsama daily-planning:
 * ONE focal point per page. The home screen of a calendar+task app
 * answers a single question — "what do I have today?". Stats, streaks,
 * heatmaps, recent activity, focus shortcuts all live in /review.
 *
 * Structure (single-column flow, 5 sections):
 *
 *   1. Heading          — date + greeting + adaptive subline
 *   2. UP NEXT hero     — single most important task, focus CTA
 *   3. Lịch hôm nay     — agenda rows for today (no card wrapper)
 *   4. Sắp tới · 7 ngày — non-recurring deadlines next 7 days
 *   5. Tuần này         — progress bar + 7-cell load strip
 *   6. Tháng footer     — one-line month roll-up + link to /calendar
 *
 * Layout history: v3 (3 sections) felt empty, v6 added Upcoming +
 * Week + Month, v7 split into 2-col (main 2/3 + sidebar 1/3) which
 * left a large empty rectangle below the shorter main column at
 * 1080p+. Back to single column — Things 3 / Linear "My Issues"
 * pattern — main-layout caps width at 1600px so long content stays
 * readable.
 */
export function Dashboard() {
  const { tasks } = useTasks();
  const { openEdit, openCreate } = useTaskCommands();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const t = useT();
  const { lang } = useI18n();
  const { isToday, dayKey, extractTimeLabel } = useDateFns();

  // Deep-link: tray "Quick Capture" item opens /dashboard?capture=1.
  // Auto-open the create dialog, then strip the query so reload doesn't
  // re-trigger.
  useEffect(() => {
    if (searchParams.get("capture") === "1") {
      openCreate();
      const next = new URLSearchParams(searchParams);
      next.delete("capture");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, openCreate]);

  // ---- Derived state ---------------------------------------------------

  // Tick every 30s so countdowns + overdue badges stay fresh.
  const nowDate = useTickingNow(30_000);
  const now = nowDate.getTime();

  const todayList = useMemo(
    () =>
      sortByTimeOfDay(
        tasks.filter((t) => t.status !== "done" && isToday(t.deadline))
      ),
    [tasks]
  );

  // The "next up" — closest upcoming undone task. Used to highlight the
  // first row visually (replaces the old standalone UP NEXT hero card —
  // that card was always duplicating the first agenda row).
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
    return upcoming[0] || null;
  }, [tasks, now]);

  // Build localized weekday labels once per language flip — buildWeekStrip
  // receives them as a 7-element array indexed by getDay().
  const dowLabels = useMemo(() => DOW_KEYS_SUN_FIRST.map((k) => t(k)), [t]);
  const weekStrip = useMemo(
    () => buildWeekStrip(tasks, dowLabels),
    [tasks, dowLabels]
  );

  // "Sắp tới · 7 ngày" — non-recurring deadlines after today, within the
  // next 7 days. Excludes recurring classes (those live in /calendar
  // grid; the dashboard's job is to surface deadlines that need
  // PREPARATION, not the weekly class schedule). Caps at 5 rows to
  // stay glanceable — full upcoming list lives in /tasks.
  const upcomingList = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const tomorrow = new Date(start);
    tomorrow.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 8); // exclusive bound: next 7 days
    return tasks
      .filter((task) => {
        if (task.status === "done" || !task.deadline) return false;
        if (isRecurringClass(task)) return false; // skip weekly classes
        const d = new Date(task.deadline);
        return d >= tomorrow && d < end;
      })
      .sort(
        (a, b) =>
          new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()
      )
      .slice(0, 5);
  }, [tasks]);

  // "Tiến độ tuần này" — completion progress through Mon-Sun of current
  // week. Both totals include recurring class instances (you do attend
  // them, they count as done when checked off). Drives the progress bar
  // above the 7-cell day strip.
  const weekProgress = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sundayEnd = new Date(monday);
    sundayEnd.setDate(monday.getDate() + 7);
    let total = 0;
    let done = 0;
    for (const task of tasks) {
      if (!task.deadline) continue;
      const d = new Date(task.deadline);
      if (d < monday || d >= sundayEnd) continue;
      total++;
      if (task.status === "done") done++;
    }
    return {
      total,
      done,
      pct: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  }, [tasks]);

  const summary = useMemo(() => {
    const undone = tasks.filter((t) => t.status !== "done");
    const overdue = undone.filter(
      (t) => t.deadline && isPast(t.deadline)
    ).length;
    const doneToday = tasks.filter(
      (t) => t.status === "done" && t.completedAt && isToday(t.completedAt)
    ).length;
    const totalToday = doneToday + todayList.length;
    // Month roll-up — total deadlines this month + done count. Used in
    // the "Tháng này" stat line so users see at a glance how the month
    // is shaping up without leaving the dashboard.
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    let monthTotal = 0;
    let monthDone = 0;
    for (const task of tasks) {
      if (!task.deadline) continue;
      const d = new Date(task.deadline);
      if (d.getMonth() !== thisMonth || d.getFullYear() !== thisYear) continue;
      monthTotal++;
      if (task.status === "done") monthDone++;
    }
    return { overdue, doneToday, totalToday, monthTotal, monthDone };
  }, [tasks, todayList, dayKey]);

  const dateLabel = nowDate.toLocaleDateString(
    lang === "en" ? "en-US" : "vi-VN",
    { weekday: "long", day: "2-digit", month: "long" }
  );

  // ---- Render ----------------------------------------------------------

  return (
    <div className="flex flex-col gap-6 pb-6">
      <FirstRunWelcome />

      {/* Heading — single focal point, no stat tiles taking up real estate.
          Two lines on desktop (date + greeting), three on mobile if there's
          an adaptive subline worth showing. */}
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {dateLabel}
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {greet(t)}
          {summary.overdue > 0 && <span className="text-destructive">.</span>}
        </h1>
        <p className="text-muted-foreground text-sm">
          {dashboardSubline(summary, t)}
        </p>
      </header>

      {/* Single column flow (was 2-col 2/3 + 1/3 in v7 but that left a
          large empty rectangle below the shorter main column at 1080p+
          since sidebar genuinely had more vertical content). v6 single
          column flows naturally — Things 3 / Linear "My Issues"
          pattern — and main-layout already caps width at 1600px so
          long content stays readable.

          Section order top-to-bottom matches the natural action
          narrative: priority → today → next-week deadlines → week
          load overview → month context. Each section is a sibling of
          the same wrapper so no column can "outgrow" the other. */}
      <div className="flex flex-col gap-6">
      {/* UP NEXT hero — the SINGLE most important card on the page. The
          one task the user should act on right now. Promotes priority +
          time + place + a Focus shortcut. Only renders when there's a
          non-done task to point at; otherwise the agenda list below
          carries the message. */}
      {nextUp && (
        <section
          className={cn(
            "relative overflow-hidden rounded-2xl border shadow-sm cursor-pointer transition-shadow hover:shadow-md",
            "bg-gradient-to-br from-card via-card to-primary/5",
            nextUp.priority === "high" && "border-destructive/30",
            isPast(nextUp.deadline) && "ring-1 ring-destructive/40"
          )}
          onClick={() => openEdit(nextUp.id)}
        >
          <div
            className={cn(
              "absolute left-0 top-0 bottom-0 w-1.5",
              subjectColor(nextUp.title).dot
            )}
          />
          <div className="pl-4 pr-4 sm:pl-5 sm:pr-5 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  {isPast(nextUp.deadline)
                    ? t("dash.upnextOverdue")
                    : t("dash.upnext")}
                </span>
                {nextUp.priority === "high" && (
                  <span className="text-[10px] font-bold uppercase text-destructive inline-flex items-center gap-0.5">
                    <Flame className="h-3 w-3" /> {t("priority.urgent")}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-2xl font-bold leading-tight tracking-tight line-clamp-2">
                {nextUp.title}
              </h2>
              <div className="flex items-center gap-x-3 gap-y-1 mt-2 text-xs sm:text-sm text-muted-foreground flex-wrap">
                {nextUp.deadline && (
                  <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                    <Clock className="h-3.5 w-3.5" />
                    {extractTimeLabel(nextUp.deadline) || ""}
                  </span>
                )}
                {nextUp.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {nextUp.location}
                  </span>
                )}
                <span className="text-xs">{t(`type.${nextUp.type}`)}</span>
              </div>
            </div>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                navigate("/focus");
              }}
              size="sm"
              className="gap-1.5 shrink-0 self-start sm:self-center"
            >
              <Play className="h-3.5 w-3.5" />
              {t("dash.focusStart")}
            </Button>
          </div>
        </section>
      )}

      {/* Today agenda — bare rows on the page surface. No Card wrapper,
          no internal scroll. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("dash.todayTitle")}
          </h2>
          {todayList.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("dash.todayCount", { n: todayList.length })}
            </span>
          )}
        </div>

        {todayList.length === 0 ? (
          <EmptyAgenda onCreate={() => openCreate()} />
        ) : (
          <div className="space-y-2">
            {todayList.map((task) => (
              <AgendaRow
                key={task.id}
                task={task}
                onClick={() => openEdit(task.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* "Sắp tới · 7 ngày" — non-recurring deadlines in the next 7 days
          (today excluded — that's the section above). Unique to the
          dashboard: /calendar's Agenda view mixes deadlines with weekly
          class instances; this list shows ONLY items needing preparation.
          Caps at 5 rows; the rest live in /tasks. */}
      {upcomingList.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("dash.upcomingTitle")}
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("dash.upcomingCount", { n: upcomingList.length })}
            </span>
          </div>
          <div className="space-y-2">
            {upcomingList.map((task) => (
              <UpcomingRow
                key={task.id}
                task={task}
                onClick={() => openEdit(task.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Tiến độ tuần này — week progress bar above the 7-cell load
          strip. The bar answers "how am I doing this week?" while the
          strip answers "where is the workload?" — together they're a
          backward + forward view of the week. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("dash.weekTitle")}
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {weekProgress.total > 0
              ? t("dash.weekProgress", {
                  done: weekProgress.done,
                  total: weekProgress.total,
                  pct: weekProgress.pct,
                })
              : t("dash.weekEmptyLong")}
          </span>
        </div>

        {/* Progress bar — primary fill, subtle muted track. Hidden when
            there are no week tasks to avoid showing a perpetually empty
            bar (less informative than the count text alone). */}
        {weekProgress.total > 0 && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${weekProgress.pct}%` }}
              role="progressbar"
              aria-valuenow={weekProgress.pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        )}



        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {weekStrip.map((d) => {
            const count = d.tasks.length;
            // Load buckets — primary tint deepens with workload so heavy
            // days stand out without needing a separate label.
            const tint =
              count === 0
                ? null
                : count <= 2
                  ? "bg-primary/15 text-primary"
                  : count <= 4
                    ? "bg-primary/25 text-primary"
                    : "bg-primary/40 text-primary";
            return (
              <Link
                key={d.iso}
                to={`/calendar?date=${d.iso}`}
                title={
                  count === 0
                    ? `${d.dowLabel} ${d.day} — ${t("dash.weekEmpty")}`
                    : `${d.dowLabel} ${d.day} — ${count} ${t("dash.weekUnit")}`
                }
                className={cn(
                  "group rounded-lg border bg-background/40 hover:bg-accent transition-all",
                  "flex flex-col items-center justify-center gap-1 py-2 px-1",
                  "min-h-[68px]",
                  d.isToday && "border-primary bg-primary/10 hover:bg-primary/15",
                  d.isPast && !d.isToday && "opacity-50"
                )}
              >
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider font-medium leading-none",
                    d.isToday ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {d.dowLabel}
                </span>
                <span
                  className={cn(
                    "text-base sm:text-lg font-bold tabular-nums leading-none",
                    d.isToday && "text-primary"
                  )}
                >
                  {d.day}
                </span>
                {tint ? (
                  <span
                    className={cn(
                      "text-[10px] font-semibold leading-none tabular-nums",
                      "px-1.5 py-0.5 rounded-full",
                      tint
                    )}
                  >
                    {count}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/40 leading-none">
                    ·
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Month one-line footer — single sentence stat with link to the
          Lịch tab. Replaces the previous mini-month grid which
          duplicated /calendar?view=month. Dashboard owns the ACTION
          horizon (today + next 7); /calendar owns the visual GRID
          horizon (whole semester). */}
      <section className="pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs text-muted-foreground">
        <span>
          {t("dash.monthFooter", {
            n: summary.monthTotal,
            done: summary.monthDone,
            remaining: summary.monthTotal - summary.monthDone,
          })}
        </span>
        <Link
          to="/calendar"
          className="text-primary hover:underline inline-flex items-center font-medium"
        >
          {t("dash.weekFull")} <ChevronRight className="h-3 w-3 ml-0.5" />
        </Link>
      </section>
      </div>
    </div>
  );
}

/* UpcomingRow — sibling to AgendaRow but optimized for items that are
   NOT today: the date is the primary visual key (instead of the time),
   the title is secondary, and there's no "Up Next" treatment. Used by
   the "Sắp tới · 7 ngày" section. */
const UpcomingRow = memo(function UpcomingRow({
  task,
  onClick,
}: {
  task: Task;
  onClick: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const { extractTimeLabel } = useDateFns();
  const time = extractTimeLabel(task.deadline);
  const color = subjectColor(task.title);
  const d = task.deadline ? new Date(task.deadline) : null;
  const dateChip = d
    ? d.toLocaleDateString(lang === "en" ? "en-US" : "vi-VN", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      })
    : "";
  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer",
        "bg-background/40 hover:bg-accent transition-colors",
        task.priority === "high" && "border-destructive/30"
      )}
    >
      <div className="w-20 sm:w-24 shrink-0 text-left">
        <span className="text-xs font-semibold uppercase tracking-wide tabular-nums text-muted-foreground">
          {dateChip}
        </span>
        {time && (
          <span className="block text-[11px] tabular-nums text-foreground/70 font-medium">
            {time}
          </span>
        )}
      </div>
      <div className={cn("w-1 h-9 rounded-full shrink-0", color.dot)} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm leading-tight line-clamp-2 sm:truncate">
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
          {task.priority === "high" && (
            <span className="font-semibold uppercase text-destructive inline-flex items-center gap-0.5">
              <Flame className="h-2.5 w-2.5" /> {t("priority.urgent")}
            </span>
          )}
          <span>{t(`type.${task.type}`)}</span>
          {task.location && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" />
                {task.location}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

/* ---------------- Sub-components ---------------- */

const AgendaRow = memo(function AgendaRow({
  task,
  isNext,
  onClick,
}: {
  task: Task;
  isNext?: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const { extractTimeLabel } = useDateFns();
  const time = extractTimeLabel(task.deadline);
  const overdue = isPast(task.deadline);
  const color = subjectColor(task.title);
  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer",
        "bg-background/40 hover:bg-accent transition-colors",
        task.priority === "high" && "border-destructive/30",
        overdue && "ring-1 ring-destructive/40 bg-destructive/5",
        isNext &&
          !overdue &&
          "ring-2 ring-primary/30 border-primary/40 bg-primary/5 hover:bg-primary/10"
      )}
    >
      {/* Time slot */}
      <div className="w-14 shrink-0 text-center">
        {time ? (
          <span className="text-base font-bold tabular-nums leading-none">
            {time}
          </span>
        ) : (
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              color.dot
            )}
            aria-hidden
          />
        )}
      </div>

      {/* Accent rail */}
      <div className={cn("w-1 h-9 rounded-full shrink-0", color.dot)} />

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm leading-tight line-clamp-2 sm:truncate">
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
          {overdue && (
            <span className="font-semibold uppercase text-destructive inline-flex items-center gap-0.5">
              <AlertCircle className="h-3 w-3" />
              {t("dash.upnextOverdue")}
            </span>
          )}
          {task.priority === "high" && !overdue && (
            <span className="font-semibold uppercase text-destructive inline-flex items-center gap-0.5">
              <Flame className="h-3 w-3" /> {t("priority.urgent")}
            </span>
          )}
          <span>{t(`type.${task.type}`)}</span>
          {task.location && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {task.location}
              </span>
            </>
          )}
        </div>
      </div>

      {/* "Next" badge — small visual reinforcement when isNext=true */}
      {isNext && !overdue && (
        <span className="hidden sm:inline-flex shrink-0 text-[10px] font-bold uppercase tracking-wider text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
          {t("dash.upnext")}
        </span>
      )}
    </div>
  );
});

function EmptyAgenda({ onCreate }: { onCreate: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center text-center gap-3 py-10 sm:py-14">
      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <div className="max-w-sm">
        <p className="font-semibold">{t("dashboard.emptyAgendaTitle")}</p>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {t("dashboard.emptyAgendaHint")}
        </p>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <Button
          onClick={onCreate}
          className="gap-1.5"
          size="sm"
          data-testid="empty-agenda-create"
        >
          <Sparkles className="h-3.5 w-3.5" /> {t("dashboard.emptyAgendaButton")}
        </Button>
        <Link
          to="/import"
          data-testid="empty-agenda-import"
          className="cm-press inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          {t("dashboard.emptyAgendaImport")}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
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

function buildWeekStrip(tasks: Task[], dowLabels: string[]): DayCell[] {
  const now = new Date();
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
  s: { totalToday: number; doneToday: number; overdue: number },
  t: T
): string {
  if (s.overdue > 0) return t("dash.subline.overdue", { n: s.overdue });
  if (s.totalToday === 0) return t("dash.subline.noDeadline");
  if (s.doneToday === s.totalToday) return t("dash.subline.allDone");
  return `${s.doneToday}/${s.totalToday}`;
}
