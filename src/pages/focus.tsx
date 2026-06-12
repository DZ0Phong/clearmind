import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTasks, type Task } from "@/hooks/use-tasks";
import { useToast } from "@/components/toast";
import { useT } from "@/lib/i18n";
import {
  Play,
  Pause,
  RotateCcw,
  Timer,
  SkipForward,
  Hourglass,
  MapPin,
  Flame,
  Minus,
  Plus,
  Coffee,
  Moon,
  Volume2,
  VolumeX,
  Zap,
  ChevronDown,
  TrendingUp,
} from "lucide-react";
import {
  cn,
  subjectColor,
  formatDeadline,
  extractTimeLabel,
} from "@/lib/utils";

type Mode = "work" | "short-break" | "long-break";

interface FocusSettings {
  work: number;
  shortBreak: number;
  longBreak: number;
  rounds: number;
  autoStart: boolean;
  sound: boolean;
}

interface SessionLog {
  at: string;
  minutes: number;
}

const DEFAULT_SETTINGS: FocusSettings = {
  work: 25,
  shortBreak: 5,
  longBreak: 15,
  rounds: 4,
  autoStart: false,
  sound: true,
};

const SETTINGS_KEY = "clearmind_focus_settings";
const SESSIONS_KEY = "clearmind_focus_sessions";

const PRESETS: { label: string; icon: typeof Timer; work: number; shortBreak: number; longBreak: number; rounds: number }[] = [
  { label: "Classic", icon: Timer, work: 25, shortBreak: 5, longBreak: 15, rounds: 4 },
  { label: "Deep", icon: Zap, work: 50, shortBreak: 10, longBreak: 20, rounds: 4 },
  { label: "Ultradian", icon: Moon, work: 90, shortBreak: 15, longBreak: 30, rounds: 2 },
];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function loadSettings(): FocusSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw);
    return {
      work: clamp(Number(p.work) || 25, 1, 180),
      shortBreak: clamp(Number(p.shortBreak) || 5, 1, 60),
      longBreak: clamp(Number(p.longBreak) || 15, 1, 90),
      rounds: clamp(Number(p.rounds) || 4, 1, 10),
      autoStart: !!p.autoStart,
      sound: p.sound !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadSessions(): SessionLog[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-100) : [];
  } catch {
    return [];
  }
}

function isSameDay(iso: string, day: Date) {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

// Two-note ascending chime via Web Audio API — no asset shipping.
function playChime(volume = 0.25) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const startAt = t + i * 0.15;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.7);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* AudioContext blocked — ignore */
  }
}

function modeMinutes(m: Mode, s: FocusSettings) {
  return m === "work" ? s.work : m === "short-break" ? s.shortBreak : s.longBreak;
}

const MODE_I18N_KEY: Record<Mode, string> = {
  work: "focus.mode.work",
  "short-break": "focus.mode.short",
  "long-break": "focus.mode.long",
};
const MODE_SHORT_KEY: Record<Mode, string> = {
  work: "focus.modeShortLabel.work",
  "short-break": "focus.modeShortLabel.short",
  "long-break": "focus.modeShortLabel.long",
};

const MODE_TONE: Record<Mode, { ring: string; stroke: string; text: string; bg: string; glow: string }> = {
  work: {
    ring: "border-primary/15",
    stroke: "stroke-primary",
    text: "text-primary",
    bg: "from-primary/5 to-primary/0",
    glow: "shadow-[0_0_60px_-10px_var(--primary)]",
  },
  "short-break": {
    ring: "border-emerald-500/15",
    stroke: "stroke-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "from-emerald-500/5 to-emerald-500/0",
    glow: "shadow-[0_0_60px_-10px_#10b981]",
  },
  "long-break": {
    ring: "border-sky-500/15",
    stroke: "stroke-sky-500",
    text: "text-sky-600 dark:text-sky-400",
    bg: "from-sky-500/5 to-sky-500/0",
    glow: "shadow-[0_0_60px_-10px_#0ea5e9]",
  },
};

export function FocusPage() {
  const { tasks, incrementPomodoro } = useTasks();
  const { toast } = useToast();
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState<FocusSettings>(() => loadSettings());
  const [sessions, setSessions] = useState<SessionLog[]>(() => loadSessions());
  const [taskId, setTaskId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("work");
  const [round, setRound] = useState(0);
  const [remaining, setRemaining] = useState(settings.work * 60);
  const [running, setRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(-100)));
  }, [sessions]);

  // When user adjusts a mode's duration while idle on that mode, sync the
  // displayed remaining — but only if the timer's been reset (not mid-run).
  const wasRunningRef = useRef(running);
  useEffect(() => {
    wasRunningRef.current = running;
  }, [running]);
  useEffect(() => {
    if (!wasRunningRef.current) {
      setRemaining(modeMinutes(mode, settings) * 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.work, settings.shortBreak, settings.longBreak, mode]);

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
          const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
          return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
        })
        .slice(0, 12),
    [tasks]
  );

  const handleComplete = useCallback(() => {
    setRunning(false);
    if (settings.sound) playChime();
    if (mode === "work") {
      const elapsedSec = settings.work * 60 - remaining;
      const minutes = Math.max(1, Math.round(elapsedSec / 60));
      if (taskId) incrementPomodoro(taskId, minutes);
      setSessions((prev) =>
        [...prev, { at: new Date().toISOString(), minutes }].slice(-100)
      );
      const completedRound = round + 1;
      const isLong = completedRound >= settings.rounds;
      const nextMode: Mode = isLong ? "long-break" : "short-break";
      toast({
        title: isLong
          ? t("focus.toastLongBreak", { n: settings.rounds })
          : t("focus.toastWorkEnd"),
        description: t("focus.toastSummary", {
          n: minutes,
          title: activeTask ? " · " + activeTask.title : "",
          b: modeMinutes(nextMode, settings),
        }),
        variant: "success",
      });
      setRound(isLong ? 0 : completedRound);
      setMode(nextMode);
      setRemaining(modeMinutes(nextMode, settings) * 60);
      if (settings.autoStart) {
        setRunning(true);
        startedAtRef.current = Date.now();
      }
    } else {
      toast({ title: t("focus.toastBreakEnd"), description: t("focus.toastReady") });
      setMode("work");
      setRemaining(settings.work * 60);
      if (settings.autoStart) {
        setRunning(true);
        startedAtRef.current = Date.now();
      }
    }
  }, [
    mode,
    remaining,
    taskId,
    settings,
    round,
    activeTask,
    incrementPomodoro,
    toast,
  ]);

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

  const start = useCallback(() => {
    setRunning(true);
    startedAtRef.current = Date.now();
  }, []);
  const pause = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => {
    setRunning(false);
    setRemaining(modeMinutes(mode, settings) * 60);
  }, [mode, settings]);
  const skip = useCallback(() => {
    setRunning(false);
    handleComplete();
  }, [handleComplete]);

  // Keyboard shortcuts — Space toggles, R resets, S skips.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (
        tgt &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.isContentEditable)
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (running) pause();
        else start();
      } else if (e.key.toLowerCase() === "r") {
        reset();
      } else if (e.key.toLowerCase() === "s") {
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, start, pause, reset, skip]);

  const mm = Math.floor(remaining / 60).toString().padStart(2, "0");
  const ss = (remaining % 60).toString().padStart(2, "0");
  const totalSec = modeMinutes(mode, settings) * 60;
  const progress = totalSec > 0 ? 1 - remaining / totalSec : 0;
  const tone = MODE_TONE[mode];

  const todayStats = useMemo(() => {
    const today = new Date();
    const todaySessions = sessions.filter((s) => isSameDay(s.at, today));
    const minutes = todaySessions.reduce((acc, s) => acc + s.minutes, 0);
    return { count: todaySessions.length, minutes };
  }, [sessions]);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setSettings((s) => ({
      ...s,
      work: p.work,
      shortBreak: p.shortBreak,
      longBreak: p.longBreak,
      rounds: p.rounds,
    }));
    if (!running) {
      setMode("work");
      setRound(0);
      setRemaining(p.work * 60);
    }
  };

  const matchingPreset = PRESETS.find(
    (p) =>
      p.work === settings.work &&
      p.shortBreak === settings.shortBreak &&
      p.longBreak === settings.longBreak &&
      p.rounds === settings.rounds
  );

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="shrink-0 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("focus.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("focus.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            {t("focus.today")}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {todayStats.minutes}m
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            · {t("focus.sessionsCount", { n: todayStats.count })}
          </span>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          <Card
            className={cn(
              "bg-gradient-to-br border shadow-sm flex-1 transition-all duration-500",
              tone.bg
            )}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
                <span className="inline-flex items-center gap-2">
                  {mode === "work" ? (
                    <Timer className={cn("h-5 w-5", tone.text)} />
                  ) : (
                    <Coffee className={cn("h-5 w-5", tone.text)} />
                  )}
                  {t(MODE_I18N_KEY[mode])}
                </span>
                {/* Round dots — full cycle of `rounds` work sessions */}
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: settings.rounds }).map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-2 w-2 rounded-full transition-all duration-300",
                        i < round
                          ? "bg-primary"
                          : i === round && mode === "work"
                          ? "bg-primary/40 ring-2 ring-primary/30 scale-110"
                          : "bg-muted-foreground/20"
                      )}
                      title={`Round ${i + 1} / ${settings.rounds}`}
                    />
                  ))}
                </div>
              </CardTitle>
              <CardDescription>
                {activeTask
                  ? t("focus.activePrefix") + activeTask.title
                  : mode === "work"
                  ? t("focus.descNoTaskWork")
                  : t("focus.descBreak")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-8 gap-6">
              <div
                className={cn(
                  "relative h-64 w-64 rounded-full border-8 flex items-center justify-center transition-all duration-500",
                  tone.ring,
                  running && tone.glow
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
                    className={cn(
                      tone.stroke,
                      "transition-[stroke-dasharray] duration-700"
                    )}
                    strokeDasharray={`${progress * 289.03} 289.03`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="text-center">
                  <p
                    className={cn(
                      "text-6xl font-bold tracking-tight tabular-nums transition-colors",
                      running && tone.text
                    )}
                  >
                    {mm}:{ss}
                  </p>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
                    {running ? t("focus.running") : t(MODE_SHORT_KEY[mode])}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!running ? (
                  <Button onClick={start} size="lg" className="gap-2 cm-press">
                    <Play className="h-4 w-4" /> {t("focus.start")}
                    <kbd className="ml-1 text-[10px] opacity-60 hidden md:inline">
                      Space
                    </kbd>
                  </Button>
                ) : (
                  <Button
                    onClick={pause}
                    size="lg"
                    variant="outline"
                    className="gap-2 cm-press"
                  >
                    <Pause className="h-4 w-4" /> {t("focus.pause")}
                    <kbd className="ml-1 text-[10px] opacity-60 hidden md:inline">
                      Space
                    </kbd>
                  </Button>
                )}
                <Button
                  onClick={reset}
                  size="lg"
                  variant="outline"
                  className="gap-2 cm-press"
                  title={t("focus.reset") + " (R)"}
                >
                  <RotateCcw className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("focus.reset")}</span>
                </Button>
                <Button
                  onClick={skip}
                  size="lg"
                  variant="ghost"
                  className="gap-2 cm-press"
                  title={t("focus.skip") + " (S)"}
                >
                  <SkipForward className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("focus.skip")}</span>
                </Button>
              </div>

              {/* Presets row */}
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                {PRESETS.map((p) => {
                  const Icon = p.icon;
                  const active = matchingPreset?.label === p.label;
                  return (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p)}
                      className={cn(
                        "cm-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200",
                        active
                          ? "bg-primary/10 border-primary/40 text-primary"
                          : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {p.label}
                      <span className="opacity-70 tabular-nums">
                        {p.work}/{p.shortBreak}
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setShowSettings((v) => !v)}
                  className={cn(
                    "cm-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200",
                    showSettings
                      ? "bg-muted border-border text-foreground"
                      : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {t("focus.tune")}
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform duration-200",
                      showSettings && "rotate-180"
                    )}
                  />
                </button>
              </div>

              {/* Custom adjustments — collapsible */}
              <div
                className={cn(
                  "cm-collapse w-full max-w-md",
                  showSettings && "is-open"
                )}
              >
                <div>
                  <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Stepper
                      label={t("focus.label.work")}
                      value={settings.work}
                      min={1}
                      max={180}
                      onChange={(v) =>
                        setSettings((s) => ({ ...s, work: v }))
                      }
                    />
                    <Stepper
                      label={t("focus.label.short")}
                      value={settings.shortBreak}
                      min={1}
                      max={60}
                      onChange={(v) =>
                        setSettings((s) => ({ ...s, shortBreak: v }))
                      }
                    />
                    <Stepper
                      label={t("focus.label.long")}
                      value={settings.longBreak}
                      min={1}
                      max={90}
                      onChange={(v) =>
                        setSettings((s) => ({ ...s, longBreak: v }))
                      }
                    />
                    <Stepper
                      label={t("focus.label.rounds")}
                      value={settings.rounds}
                      min={1}
                      max={10}
                      unit=""
                      onChange={(v) =>
                        setSettings((s) => ({ ...s, rounds: v }))
                      }
                    />
                  </div>
                  <div className="pt-3 flex items-center justify-between gap-3 flex-wrap">
                    <Toggle
                      checked={settings.autoStart}
                      onChange={(v) =>
                        setSettings((s) => ({ ...s, autoStart: v }))
                      }
                      label={t("focus.autoStart")}
                      hint={t("focus.autoStartHint")}
                    />
                    <button
                      onClick={() =>
                        setSettings((s) => ({ ...s, sound: !s.sound }))
                      }
                      className="cm-press inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={settings.sound ? "Tắt âm" : "Bật âm"}
                    >
                      {settings.sound ? (
                        <Volume2 className="h-3.5 w-3.5" />
                      ) : (
                        <VolumeX className="h-3.5 w-3.5" />
                      )}
                      {settings.sound ? t("focus.soundOn") : t("focus.soundOff")}
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border shadow-sm overflow-hidden">
          <CardHeader>
            <CardTitle>{t("focus.pickTask")}</CardTitle>
            <CardDescription>{t("focus.pickHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 overflow-y-auto max-h-[60vh]">
            <button
              onClick={() => setTaskId(null)}
              className={cn(
                "cm-press w-full text-left p-3 rounded-lg border transition-colors",
                !taskId
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-background/50 hover:bg-accent"
              )}
            >
              <p className="text-sm font-medium">{t("focus.noTaskOpt")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("focus.noTaskOptHint")}
              </p>
            </button>
            {undone.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("focus.inboxZero")}
              </p>
            ) : (
              undone.map((task, i) => {
                const col = subjectColor(task.title);
                const time = extractTimeLabel(task.deadline);
                return (
                  <button
                    key={task.id}
                    onClick={() => setTaskId(task.id)}
                    style={{
                      animationDelay: `${Math.min(i, 10) * 20}ms`,
                    }}
                    className={cn(
                      "cm-list-enter cm-press relative w-full text-left p-3 pl-4 rounded-lg border transition-colors overflow-hidden",
                      taskId === task.id
                        ? "bg-primary/10 border-primary/30"
                        : "bg-background/50 hover:bg-accent",
                      task.priority === "high" &&
                        taskId !== task.id &&
                        "border-destructive/30"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-0 top-0 bottom-0 w-1",
                        col.dot
                      )}
                      aria-hidden
                    />
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] text-muted-foreground">
                      <span>{t(`type.${task.type}`)}</span>
                      {task.priority === "high" && (
                        <span className="text-destructive font-semibold inline-flex items-center gap-0.5">
                          <Flame className="h-2.5 w-2.5" /> {t("priority.urgent")}
                        </span>
                      )}
                      {time && (
                        <span className="tabular-nums">
                          {time} · {formatDeadline(task.deadline)}
                        </span>
                      )}
                      {task.location && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="h-2.5 w-2.5" /> {task.location}
                        </span>
                      )}
                      {(task.pomodoroMinutes || 0) > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                          <Hourglass className="h-3 w-3" /> {task.pomodoroMinutes}m
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

function Stepper({
  label,
  value,
  min,
  max,
  unit = "p",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const dec = () => onChange(clamp(value - 1, min, max));
  const inc = () => onChange(clamp(value + 1, min, max));
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </span>
      <div className="flex items-center justify-between gap-1 px-1 py-1 rounded-md border bg-background/50">
        <button
          onClick={dec}
          className="cm-press h-6 w-6 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
          aria-label={`Giảm ${label}`}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="text-sm font-semibold tabular-nums">
          {value}
          {unit && (
            <span className="text-[10px] text-muted-foreground font-normal ml-0.5">
              {unit}
            </span>
          )}
        </span>
        <button
          onClick={inc}
          className="cm-press h-6 w-6 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
          aria-label={`Tăng ${label}`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="cm-press inline-flex items-center gap-2 text-xs"
      title={hint}
    >
      <span
        className={cn(
          "relative inline-block h-4 w-7 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-background shadow transition-transform duration-200",
            checked ? "translate-x-3.5" : "translate-x-0.5"
          )}
        />
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
