import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTasks, type Task, type TaskType } from "@/hooks/use-tasks";
import {
  CheckCircle2,
  Flame,
  Hourglass,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Trophy,
  Star,
  Sparkles,
  Target,
  BookOpen,
  ArrowRight,
  Minus,
} from "lucide-react";
import { cn, formatDeadline, isPast, isRecurringClass } from "@/lib/utils";

const TYPE_COLOR: Record<TaskType, string> = {
  academic: "bg-primary",
  personal: "bg-emerald-500",
  work: "bg-orange-500",
  other: "bg-muted-foreground",
};

/* ----------------------------------------------------------------
   Stats helpers — pure functions over the tasks array.
   ---------------------------------------------------------------- */

function startOfWeekAgo(now: Date, weeksAgo: number): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 7 * weeksAgo);
  return d;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

interface DayCell {
  date: Date;
  count: number;
}

/** Build a 12-week (84-day) activity heatmap, oldest first, sliced to today. */
function buildHeatmap(tasks: Task[], now: Date): DayCell[][] {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (t.status !== "done" || !t.completedAt) continue;
    const k = dayKey(new Date(t.completedAt));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const weeks: DayCell[][] = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  // Roll back to Monday of the current week (Vietnamese week starts on Mon).
  const dow = (start.getDay() + 6) % 7; // 0=Mon
  start.setDate(start.getDate() - dow - 7 * 11); // 11 full weeks before this Mon
  for (let w = 0; w < 12; w++) {
    const week: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      week.push({ date: day, count: counts.get(dayKey(day)) ?? 0 });
    }
    weeks.push(week);
  }
  return weeks;
}

function intensityClass(count: number, max: number): string {
  if (count === 0) return "bg-muted/40";
  const ratio = max > 0 ? count / max : 0;
  if (ratio < 0.25) return "bg-primary/20";
  if (ratio < 0.5) return "bg-primary/40";
  if (ratio < 0.75) return "bg-primary/60";
  return "bg-primary/90";
}

interface Achievement {
  key: string;
  label: string;
  sublabel: string;
  icon: typeof Trophy;
  tint: string; // tailwind classes for chip background + icon color
}

/**
 * Compute which achievements the user has unlocked. We rank these from
 * most-prized to entry-level so the row reads as a "wall of fame" — the
 * heavy badges (10-day streak, marathon focus) sit before the light ones
 * (first done today). Only unlocked badges get rendered.
 */
function computeAchievements(
  tasks: Task[],
  streak: number,
  doneThisWeek: number,
  focusHoursThisWeek: number,
  now: Date
): Achievement[] {
  const out: Achievement[] = [];
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  const doneToday = tasks.filter(
    (t) =>
      t.status === "done" &&
      t.completedAt &&
      new Date(t.completedAt) >= today0
  ).length;

  // Subject-finished detection: an academic task with `recurrenceEndAt` in
  // the past AND status=done OR a non-recurring task that has 5+ sibling
  // tasks (children) all done. Simple heuristic — surface if any subject
  // shows ≥5 done tasks sharing the same first word.
  const academicDone = tasks.filter(
    (t) => t.status === "done" && t.type === "academic"
  );
  const subjectCounts = new Map<string, number>();
  for (const t of academicDone) {
    const subject = (t.title.split(/\s+/)[0] || "").toLowerCase();
    if (subject.length < 3) continue;
    subjectCounts.set(subject, (subjectCounts.get(subject) ?? 0) + 1);
  }
  const finishedSubject = [...subjectCounts.entries()].find(([, n]) => n >= 5);

  if (streak >= 10) {
    out.push({
      key: "streak-10",
      label: "Streak 10+ ngày",
      sublabel: `${streak} ngày liên tiếp`,
      icon: Trophy,
      tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    });
  } else if (streak >= 7) {
    out.push({
      key: "streak-7",
      label: "Streak 7 ngày",
      sublabel: `${streak} ngày liên tiếp`,
      icon: Flame,
      tint: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
    });
  } else if (streak >= 3) {
    out.push({
      key: "streak-3",
      label: "3 ngày liên tiếp",
      sublabel: "Đà tốt — giữ nhịp",
      icon: Flame,
      tint: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
    });
  }

  if (focusHoursThisWeek >= 10) {
    out.push({
      key: "focus-10h",
      label: "10h focus tuần",
      sublabel: `${focusHoursThisWeek.toFixed(1)}h tổng`,
      icon: Hourglass,
      tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    });
  } else if (focusHoursThisWeek >= 5) {
    out.push({
      key: "focus-5h",
      label: "5h focus tuần",
      sublabel: `${focusHoursThisWeek.toFixed(1)}h tổng`,
      icon: Hourglass,
      tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    });
  }

  if (doneThisWeek >= 20) {
    out.push({
      key: "done-20",
      label: "20+ task tuần này",
      sublabel: "Productivity beast",
      icon: Sparkles,
      tint: "bg-primary/10 text-primary border-primary/30",
    });
  } else if (doneThisWeek >= 10) {
    out.push({
      key: "done-10",
      label: "10+ task tuần này",
      sublabel: "Nhịp đều",
      icon: Target,
      tint: "bg-primary/10 text-primary border-primary/30",
    });
  }

  if (finishedSubject) {
    const [name, n] = finishedSubject;
    out.push({
      key: `subject-${name}`,
      label: `${name.toUpperCase()} done`,
      sublabel: `${n} task đã xong`,
      icon: BookOpen,
      tint: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30",
    });
  }

  if (doneToday >= 1 && out.length === 0) {
    // Entry-level — only show if no heavier badges already exist (avoid
    // crowding the row with a "first done today" when streak is 10+).
    out.push({
      key: "first-today",
      label: "Đã start hôm nay",
      sublabel: `${doneToday} task xong`,
      icon: Star,
      tint: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
    });
  }

  return out;
}

/**
 * Compose a one-line encouragement based on this week's data. Returns
 * (mood, message) where mood drives the hero card accent color.
 */
function encouragement(
  doneThisWeek: number,
  delta: number,
  streak: number
): { mood: "great" | "good" | "ok" | "low"; message: string } {
  if (doneThisWeek >= 10 && delta > 0) {
    return { mood: "great", message: "Tuần ấn tượng — vượt cả tuần trước. Cứ giữ đà." };
  }
  if (doneThisWeek >= 10) {
    return { mood: "great", message: "Tuần đậm task — bạn đang ở phong độ cao." };
  }
  if (doneThisWeek >= 5 && delta > 0) {
    return { mood: "good", message: "Đang đi lên — nhịp này gọn gàng." };
  }
  if (doneThisWeek >= 5) {
    return { mood: "good", message: "Vẫn duy trì — không có gì phải gấp." };
  }
  if (streak >= 3) {
    return { mood: "ok", message: `Streak ${streak} ngày — số task nhỏ nhưng đều.` };
  }
  if (doneThisWeek > 0) {
    return { mood: "ok", message: "Tuần nhẹ — vài task nhỏ cũng đáng kể." };
  }
  return { mood: "low", message: "Tuần chậm — không sao, thêm 1 task nhỏ là khởi đầu." };
}

const MOOD_BG: Record<"great" | "good" | "ok" | "low", string> = {
  great:
    "bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border-primary/30",
  good:
    "bg-gradient-to-br from-emerald-500/8 via-emerald-500/4 to-transparent border-emerald-500/30",
  ok: "bg-card border-border",
  low: "bg-card border-border",
};

const MOOD_TEXT: Record<"great" | "good" | "ok" | "low", string> = {
  great: "text-primary",
  good: "text-emerald-600 dark:text-emerald-400",
  ok: "text-foreground",
  low: "text-muted-foreground",
};

function DeltaChip({ value, suffix }: { value: number; suffix?: string }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground tabular-nums">
        <Minus className="h-3 w-3" />
        bằng
      </span>
    );
  }
  const positive = value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full",
        positive
          ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
          : "text-rose-600 dark:text-rose-400 bg-rose-500/10"
      )}
    >
      {positive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {positive ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}

const DOW_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function ReviewPage() {
  const { tasks } = useTasks();

  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeekAgo(now, 0);
    const lastWeekStart = startOfWeekAgo(now, 1);

    const doneThisWeek = tasks.filter(
      (t) =>
        t.status === "done" &&
        t.completedAt &&
        new Date(t.completedAt) >= weekStart
    );
    const doneLastWeek = tasks.filter(
      (t) =>
        t.status === "done" &&
        t.completedAt &&
        new Date(t.completedAt) >= lastWeekStart &&
        new Date(t.completedAt) < weekStart
    );
    const overdue = tasks.filter(
      (t) =>
        t.status !== "done" &&
        t.deadline &&
        isPast(t.deadline, now) &&
        !isRecurringClass(t)
    );

    const focusMinThisWeek = tasks.reduce((sum, t) => {
      if (!t.pomodoroMinutes) return sum;
      // We don't track when minutes were logged — best-effort attribute
      // to "this week" if the task was completed/touched this week.
      if (t.completedAt && new Date(t.completedAt) >= weekStart) {
        return sum + t.pomodoroMinutes;
      }
      return sum;
    }, 0);
    const focusMinTotal = tasks.reduce(
      (sum, t) => sum + (t.pomodoroMinutes || 0),
      0
    );

    const byType: Record<TaskType, number> = {
      academic: 0,
      personal: 0,
      work: 0,
      other: 0,
    };
    for (const t of doneThisWeek) byType[t.type]++;

    const completedDays = new Set(
      tasks
        .filter((t) => t.status === "done" && t.completedAt)
        .map((t) => dayKey(new Date(t.completedAt!)))
    );
    let streak = 0;
    const cursor = new Date(now);
    while (completedDays.has(dayKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    const heatmap = buildHeatmap(tasks, now);
    const heatmapMax = Math.max(
      1,
      ...heatmap.flat().map((c) => c.count)
    );

    const focusHoursThisWeek = focusMinThisWeek / 60;
    const achievements = computeAchievements(
      tasks,
      streak,
      doneThisWeek.length,
      focusHoursThisWeek,
      now
    );

    const delta = doneThisWeek.length - doneLastWeek.length;
    const mood = encouragement(doneThisWeek.length, delta, streak);

    return {
      doneThisWeek,
      doneLastWeek,
      overdue,
      focusMinThisWeek,
      focusMinTotal,
      byType,
      streak,
      heatmap,
      heatmapMax,
      achievements,
      delta,
      mood,
    };
  }, [tasks]);

  const maxType = Math.max(1, ...Object.values(stats.byType));

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="shrink-0">
        <h2 className="text-3xl font-bold tracking-tight">Tổng kết</h2>
        <p className="text-muted-foreground mt-1">
          Bạn đã làm gì 7 ngày qua, đâu là việc bị bỏ — và những gì đáng ghi nhận.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        {/* Hero card — reactive encouragement copy */}
        <Card className={cn("border shadow-sm", MOOD_BG[stats.mood.mood])}>
          <CardContent className="pt-6 pb-6">
            <div className="flex items-start gap-5 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Tuần này
                </p>
                <div className="flex items-baseline gap-3 mt-1 flex-wrap">
                  <p
                    className={cn(
                      "text-5xl font-bold tracking-tight tabular-nums",
                      MOOD_TEXT[stats.mood.mood]
                    )}
                  >
                    {stats.doneThisWeek.length}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    task hoàn thành
                  </p>
                  <DeltaChip value={stats.delta} suffix=" vs tuần trước" />
                </div>
                <p className={cn("text-sm mt-3 leading-relaxed", MOOD_TEXT[stats.mood.mood])}>
                  {stats.mood.message}
                </p>
              </div>

              {stats.streak > 0 && (
                <div className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl bg-card/60 border">
                  <Flame
                    className={cn(
                      "h-5 w-5",
                      stats.streak >= 7
                        ? "text-orange-500"
                        : "text-orange-400/70"
                    )}
                  />
                  <p className="text-2xl font-bold tabular-nums">
                    {stats.streak}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    ngày streak
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Achievement strip — only renders if any unlocked */}
        {stats.achievements.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 inline-flex items-center gap-1.5">
              <Trophy className="h-3 w-3" />
              Đáng ghi nhận
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {stats.achievements.map((a) => {
                const Icon = a.icon;
                return (
                  <div
                    key={a.key}
                    className={cn(
                      "inline-flex items-center gap-2.5 px-3 py-2 rounded-xl border",
                      a.tint
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-tight">
                        {a.label}
                      </p>
                      <p className="text-[10px] opacity-70 leading-tight">
                        {a.sublabel}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Heatmap — 12 weeks × 7 days, GitHub-style */}
        <Card className="bg-card border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Hoạt động 12 tuần
            </CardTitle>
            <CardDescription>
              Mỗi ô = một ngày. Đậm hơn = nhiều task done hơn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-2 overflow-x-auto">
              <div className="flex flex-col gap-[3px] text-[9px] text-muted-foreground/70 mr-1 pt-[2px]">
                {DOW_LABELS.map((label, i) => (
                  <span
                    key={label}
                    className={cn(
                      "h-3 leading-3 tabular-nums",
                      i % 2 === 1 ? "opacity-0" : "" // show alternating to reduce noise
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="flex gap-[3px]">
                {stats.heatmap.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {week.map((cell) => (
                      <div
                        key={cell.date.getTime()}
                        className={cn(
                          "h-3 w-3 rounded-[2px] transition-colors",
                          intensityClass(cell.count, stats.heatmapMax)
                        )}
                        title={`${cell.date.toLocaleDateString("vi-VN")} · ${cell.count} task`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
              <span>Ít</span>
              {[0, 0.2, 0.4, 0.6, 0.9].map((r) => (
                <span
                  key={r}
                  className={cn(
                    "h-2.5 w-2.5 rounded-[2px]",
                    intensityClass(Math.round(r * stats.heatmapMax), stats.heatmapMax)
                  )}
                />
              ))}
              <span>Nhiều</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat cards with Δ chips */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Done tuần này"
            value={stats.doneThisWeek.length}
            delta={stats.delta}
            icon={CheckCircle2}
            iconClass="text-primary"
          />
          <StatCard
            label="Done tuần trước"
            value={stats.doneLastWeek.length}
            icon={ArrowRight}
            iconClass="text-muted-foreground"
          />
          <StatCard
            label="Focus tuần này"
            value={Math.round(stats.focusMinThisWeek / 60)}
            unit="h"
            icon={Hourglass}
            iconClass="text-emerald-500"
          />
          <StatCard
            label="Overdue"
            value={stats.overdue.length}
            icon={AlertCircle}
            iconClass={
              stats.overdue.length > 0 ? "text-destructive" : "text-muted-foreground"
            }
            valueClass={stats.overdue.length > 0 ? "text-destructive" : undefined}
            cardClass={
              stats.overdue.length > 0
                ? "border-destructive/30 bg-destructive/5"
                : undefined
            }
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" />
                Phân bố theo loại
              </CardTitle>
              <CardDescription>Tỷ lệ task done tuần này.</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.doneThisWeek.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Tuần này chưa có task done.
                </p>
              ) : (
                <div className="space-y-3">
                  {(Object.entries(stats.byType) as [TaskType, number][]).map(
                    ([type, n]) => (
                      <div key={type}>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="capitalize">{type}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {n}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              TYPE_COLOR[type]
                            )}
                            style={{ width: `${(n / maxType) * 100}%` }}
                          />
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertCircle className="h-4 w-4" />
                Đang quá hạn
              </CardTitle>
              <CardDescription>
                Cân nhắc hoãn lại hoặc bỏ đi, đừng để treo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.overdue.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Sạch — không có task overdue.
                </p>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {stats.overdue.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-background/50"
                    >
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-destructive/10 text-destructive shrink-0">
                        {formatDeadline(t.deadline)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Hoàn thành gần đây</CardTitle>
            <CardDescription>10 task done mới nhất.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.doneThisWeek.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Chưa có task done.
              </p>
            ) : (
              <div className="space-y-2">
                {stats.doneThisWeek
                  .sort(
                    (a, b) =>
                      new Date(b.completedAt!).getTime() -
                      new Date(a.completedAt!).getTime()
                  )
                  .slice(0, 10)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-background/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        <p className="text-sm truncate">{t.title}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {new Date(t.completedAt!).toLocaleString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  delta,
  icon: Icon,
  iconClass,
  valueClass,
  cardClass,
}: {
  label: string;
  value: number;
  unit?: string;
  delta?: number;
  icon: typeof CheckCircle2;
  iconClass?: string;
  valueClass?: string;
  cardClass?: string;
}) {
  return (
    <Card className={cn("bg-card border shadow-sm", cardClass)}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <Icon className={cn("h-4 w-4", iconClass)} />
        </div>
        <div className="flex items-baseline gap-2 mt-2 flex-wrap">
          <p
            className={cn(
              "text-4xl font-bold tracking-tight tabular-nums",
              valueClass
            )}
          >
            {value}
            {unit && (
              <span className="text-base text-muted-foreground font-normal ml-0.5">
                {unit}
              </span>
            )}
          </p>
          {delta !== undefined && delta !== 0 && (
            <DeltaChip value={delta} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
