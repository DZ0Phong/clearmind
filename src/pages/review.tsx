import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTasks, type TaskType } from "@/hooks/use-tasks";
import {
  CheckCircle2,
  Flame,
  Hourglass,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { cn, formatDeadline, isPast, isRecurringClass } from "@/lib/utils";

const TYPE_COLOR: Record<TaskType, string> = {
  academic: "bg-primary",
  personal: "bg-emerald-500",
  work: "bg-orange-500",
  other: "bg-muted-foreground",
};

export function ReviewPage() {
  const { tasks } = useTasks();

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const doneThisWeek = tasks.filter(
      (t) => t.status === "done" && t.completedAt && new Date(t.completedAt) >= weekAgo
    );
    const overdue = tasks.filter(
      (t) =>
        t.status !== "done" &&
        t.deadline &&
        isPast(t.deadline, now) &&
        !isRecurringClass(t)
    );
    const focusMin = tasks.reduce((sum, t) => sum + (t.pomodoroMinutes || 0), 0);

    // by-type breakdown of done-this-week
    const byType: Record<TaskType, number> = {
      academic: 0,
      personal: 0,
      work: 0,
      other: 0,
    };
    for (const t of doneThisWeek) byType[t.type]++;

    // streak — consecutive days back from today with ≥1 completion
    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
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

    return { doneThisWeek, overdue, focusMin, byType, streak };
  }, [tasks]);

  const maxType = Math.max(1, ...Object.values(stats.byType));

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="shrink-0">
        <h2 className="text-3xl font-bold tracking-tight">Weekly Review</h2>
        <p className="text-muted-foreground mt-1">
          Bạn đã làm gì 7 ngày qua, và đâu là việc bị bỏ.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card border shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Done this week
                </p>
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </div>
              <p className="text-4xl font-bold tracking-tight mt-2 tabular-nums">
                {stats.doneThisWeek.length}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Streak
                </p>
                <Flame className="h-4 w-4 text-orange-500" />
              </div>
              <p className="text-4xl font-bold tracking-tight mt-2 tabular-nums">
                {stats.streak}
                <span className="text-base text-muted-foreground font-normal ml-1">
                  ngày
                </span>
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Focus
                </p>
                <Hourglass className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-4xl font-bold tracking-tight mt-2 tabular-nums">
                {Math.floor(stats.focusMin / 60)}
                <span className="text-base text-muted-foreground font-normal">
                  h
                </span>
                {stats.focusMin % 60 > 0 && (
                  <>
                    {" "}
                    {stats.focusMin % 60}
                    <span className="text-base text-muted-foreground font-normal">
                      m
                    </span>
                  </>
                )}
              </p>
            </CardContent>
          </Card>
          <Card
            className={cn(
              "bg-card border shadow-sm",
              stats.overdue.length > 0 && "border-destructive/30 bg-destructive/5"
            )}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Overdue
                </p>
                <AlertCircle
                  className={cn(
                    "h-4 w-4",
                    stats.overdue.length > 0 ? "text-destructive" : "text-muted-foreground"
                  )}
                />
              </div>
              <p
                className={cn(
                  "text-4xl font-bold tracking-tight mt-2 tabular-nums",
                  stats.overdue.length > 0 && "text-destructive"
                )}
              >
                {stats.overdue.length}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Phân bố hoàn thành 7 ngày
              </CardTitle>
              <CardDescription>Tỷ lệ task done theo loại.</CardDescription>
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
                            className={cn("h-full rounded-full transition-all", TYPE_COLOR[type])}
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
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Đang quá hạn
              </CardTitle>
              <CardDescription>
                Cân nhắc hoãn lại hoặc bỏ đi, đừng để treo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.overdue.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Tốt — không có task overdue.
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
            <CardTitle>Hoàn thành gần đây</CardTitle>
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
