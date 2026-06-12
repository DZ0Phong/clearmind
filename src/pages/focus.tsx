import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTasks, type Task } from "@/hooks/use-tasks";
import { useToast } from "@/components/toast";
import { Play, Pause, RotateCcw, Timer, SkipForward, Hourglass, MapPin, Flame } from "lucide-react";
import { cn, subjectColor, formatDeadline, extractTimeLabel } from "@/lib/utils";

type Mode = "work" | "break";

const WORK_MIN = 25;
const BREAK_MIN = 5;

export function FocusPage() {
  const { tasks, incrementPomodoro } = useTasks();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("work");
  const [remaining, setRemaining] = useState(WORK_MIN * 60);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  // Tray "Bắt đầu phiên Focus" sends /focus?auto=1 — kick the timer immediately
  // and strip the query so refresh doesn't auto-restart later.
  useEffect(() => {
    if (searchParams.get("auto") === "1") {
      setRunning(true);
      startedAtRef.current = Date.now();
      const next = new URLSearchParams(searchParams);
      next.delete("auto");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const activeTask: Task | null = useMemo(
    () => (taskId ? tasks.find((t) => t.id === taskId) ?? null : null),
    [taskId, tasks]
  );

  const undone = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== "done")
        .sort((a, b) => {
          const at = a.deadline ? new Date(a.deadline).getTime() : Infinity;
          const bt = b.deadline ? new Date(b.deadline).getTime() : Infinity;
          if (at !== bt) return at - bt;
          // priority tiebreaker
          const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
          return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
        })
        .slice(0, 12),
    [tasks]
  );

  // Tick
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id);
          handleComplete();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function handleComplete() {
    setRunning(false);
    if (mode === "work") {
      const elapsedSec = WORK_MIN * 60 - remaining;
      const minutes = Math.max(1, Math.round(elapsedSec / 60));
      if (taskId) incrementPomodoro(taskId, minutes);
      toast({
        title: "Hết phiên focus",
        description: `+${minutes}p${activeTask ? " · " + activeTask.title : ""}. Nghỉ ${BREAK_MIN}p.`,
        variant: "success",
      });
      setMode("break");
      setRemaining(BREAK_MIN * 60);
    } else {
      toast({ title: "Hết giờ nghỉ", description: "Sẵn sàng phiên mới." });
      setMode("work");
      setRemaining(WORK_MIN * 60);
    }
  }

  const start = () => {
    setRunning(true);
    startedAtRef.current = Date.now();
  };
  const pause = () => setRunning(false);
  const reset = () => {
    setRunning(false);
    setRemaining(mode === "work" ? WORK_MIN * 60 : BREAK_MIN * 60);
  };
  const skip = () => {
    setRunning(false);
    handleComplete();
  };

  const mm = Math.floor(remaining / 60).toString().padStart(2, "0");
  const ss = (remaining % 60).toString().padStart(2, "0");
  const totalSec = (mode === "work" ? WORK_MIN : BREAK_MIN) * 60;
  const progress = 1 - remaining / totalSec;

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="shrink-0">
        <h2 className="text-3xl font-bold tracking-tight">Focus</h2>
        <p className="text-muted-foreground mt-1">
          Chọn 1 task, chạy 25 phút, log thời gian focus.
        </p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        <div className="lg:col-span-2">
          <Card className="bg-card border shadow-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-5 w-5 text-primary" />
                {mode === "work" ? "Phiên Focus" : "Nghỉ ngắn"}
              </CardTitle>
              <CardDescription>
                {activeTask
                  ? `Đang focus: ${activeTask.title}`
                  : "Chưa chọn task — vẫn chạy timer được, nhưng minutes sẽ không log vào task nào."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-8">
              <div
                className={cn(
                  "relative h-64 w-64 rounded-full border-8 flex items-center justify-center transition-colors",
                  mode === "work" ? "border-primary/20" : "border-emerald-500/20"
                )}
              >
                <svg
                  className="absolute inset-0 -rotate-90"
                  viewBox="0 0 100 100"
                  aria-hidden
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    strokeWidth="8"
                    className={mode === "work" ? "stroke-primary" : "stroke-emerald-500"}
                    strokeDasharray={`${progress * 289.03} 289.03`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="text-center">
                  <p className="text-6xl font-bold tracking-tight tabular-nums">
                    {mm}:{ss}
                  </p>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
                    {mode === "work" ? "Focus" : "Break"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!running ? (
                  <Button onClick={start} size="lg" className="gap-2">
                    <Play className="h-4 w-4" /> Bắt đầu
                  </Button>
                ) : (
                  <Button onClick={pause} size="lg" variant="outline" className="gap-2">
                    <Pause className="h-4 w-4" /> Tạm dừng
                  </Button>
                )}
                <Button onClick={reset} size="lg" variant="outline" className="gap-2">
                  <RotateCcw className="h-4 w-4" /> Reset
                </Button>
                <Button onClick={skip} size="lg" variant="ghost" className="gap-2">
                  <SkipForward className="h-4 w-4" /> Skip
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border shadow-sm overflow-hidden">
          <CardHeader>
            <CardTitle>Pick a task</CardTitle>
            <CardDescription>Mọi phút focus sẽ log vào task được chọn.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 overflow-y-auto max-h-[60vh]">
            <button
              onClick={() => setTaskId(null)}
              className={cn(
                "w-full text-left p-3 rounded-lg border transition-colors",
                !taskId
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-background/50 hover:bg-accent"
              )}
            >
              <p className="text-sm font-medium">Không chọn task</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cứ chạy timer, không gán phút.
              </p>
            </button>
            {undone.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Inbox zero. Không có task để focus.
              </p>
            ) : (
              undone.map((t) => {
                const col = subjectColor(t.title);
                const time = extractTimeLabel(t.deadline);
                return (
                  <button
                    key={t.id}
                    onClick={() => setTaskId(t.id)}
                    className={cn(
                      "relative w-full text-left p-3 pl-4 rounded-lg border transition-colors overflow-hidden",
                      taskId === t.id
                        ? "bg-primary/10 border-primary/30"
                        : "bg-background/50 hover:bg-accent",
                      t.priority === "high" && taskId !== t.id && "border-destructive/30"
                    )}
                  >
                    <span
                      className={cn("absolute left-0 top-0 bottom-0 w-1", col.dot)}
                      aria-hidden
                    />
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] text-muted-foreground">
                      <span className="capitalize">{t.type}</span>
                      {t.priority === "high" && (
                        <span className="text-destructive font-semibold inline-flex items-center gap-0.5">
                          <Flame className="h-2.5 w-2.5" /> Gấp
                        </span>
                      )}
                      {time && (
                        <span className="tabular-nums">{time} · {formatDeadline(t.deadline)}</span>
                      )}
                      {t.location && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="h-2.5 w-2.5" /> {t.location}
                        </span>
                      )}
                      {(t.pomodoroMinutes || 0) > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                          <Hourglass className="h-3 w-3" /> {t.pomodoroMinutes}m
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
