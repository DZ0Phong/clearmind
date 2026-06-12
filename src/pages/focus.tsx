import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn, subjectColor } from "@/lib/utils";

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

/**
 * Tibetan-bowl-style alarm loop. Each "strike" stacks 4 harmonic sines with
 * a long exponential decay (~4s) so the tone breathes like a real singing
 * bowl rather than a beep. The strike repeats every ~4.5s until stop() is
 * called — alarm-clock semantics, not a one-shot chime. Safety auto-stop
 * after 90s so a forgotten browser tab doesn't ring forever.
 */
function playAlarmLoop({ volume = 0.32 }: { volume?: number } = {}): {
  stop: () => void;
} {
  let active = true;
  let timeoutId: number | null = null;
  let safetyId: number | null = null;
  let ctx: AudioContext | null = null;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return { stop: () => {} };
    ctx = new Ctx();
  } catch {
    return { stop: () => {} };
  }

  const strike = () => {
    if (!active || !ctx) return;
    const t = ctx.currentTime;
    // Bowl-like harmonics: fundamental + perfect-fifth + octave + a touch of
    // higher partial for sparkle. Slight detune on partial 2 → subtle beat
    // that sounds organic instead of synthetic.
    const harmonics = [
      { freq: 523, gain: 0.5 },    // C5
      { freq: 783.5, gain: 0.28 }, // G5 (slightly detuned from perfect 5th)
      { freq: 1046, gain: 0.15 },  // C6 octave
      { freq: 1568, gain: 0.06 },  // G6 sparkle
    ];
    for (const h of harmonics) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = h.freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume * h.gain, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + 4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 4.1);
    }
    timeoutId = window.setTimeout(strike, 4500);
  };

  strike();
  safetyId = window.setTimeout(() => {
    active = false;
    if (timeoutId) clearTimeout(timeoutId);
    try { ctx?.close(); } catch (_) {}
  }, 90_000);

  return {
    stop: () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (safetyId) clearTimeout(safetyId);
      try { ctx?.close(); } catch (_) {}
    },
  };
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
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  // Alarm-clock mode: when timer hits 0 we start a looping Tibetan-bowl
  // strike every 4.5s and freeze on the "ringing" screen until the user
  // explicitly dismisses. No silent auto-advance — user always knows.
  const [ringing, setRinging] = useState(false);
  const alarmRef = useRef<{ stop: () => void } | null>(null);
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

  // Timer reached 0 OR user clicked Skip: credit elapsed minutes (not the
  // full planned duration — skip used to grant the full 25min after only
  // 3 seconds of focus), ring the bell loop, freeze on the ringing screen.
  // `viaSkip=true` from skip() suppresses the alarm sound (user already
  // pressed a button — no need for a bell).
  const handleComplete = useCallback(
    (viaSkip = false) => {
      setRunning(false);
      if (mode === "work") {
        // Actual elapsed seconds since session start, capped at the planned
        // total so a buggy ref doesn't credit forever.
        const plannedSec = settings.work * 60;
        const elapsedFromTimer = Math.max(0, plannedSec - remaining);
        const elapsedFromRef = startedAtRef.current
          ? Math.floor((Date.now() - startedAtRef.current) / 1000)
          : elapsedFromTimer;
        const elapsedSec = Math.min(
          plannedSec,
          Math.max(elapsedFromTimer, elapsedFromRef)
        );
        // Only log when the user actually focused >=60s — avoids inflating
        // stats when a session is created and immediately skipped.
        if (elapsedSec >= 60) {
          const minutes = Math.max(1, Math.round(elapsedSec / 60));
          if (taskId) incrementPomodoro(taskId, minutes);
          setSessions((prev) =>
            [...prev, { at: new Date().toISOString(), minutes }].slice(-100)
          );
        }
      }
      setRemaining(0);
      if (!viaSkip && settings.sound) {
        try { alarmRef.current?.stop(); } catch (_) { /* ignore */ }
        alarmRef.current = playAlarmLoop();
      }
      setRinging(!viaSkip);
    },
    [mode, settings, taskId, incrementPomodoro, remaining]
  );

  // Ref-mirror of handleComplete so the tick interval always calls the
  // freshest version. Without this, the interval captures handleComplete
  // at start time — if user edits settings/task/mode mid-run, the OLD
  // handleComplete fires with stale settings (wrong credit, wrong toast).
  const handleCompleteRef = useRef(handleComplete);
  useEffect(() => {
    handleCompleteRef.current = handleComplete;
  }, [handleComplete]);

  // User-explicit dismiss → stop the bell, advance to the next phase, and
  // surface a success toast summarising what just happened.
  const dismissAlarm = useCallback(() => {
    try { alarmRef.current?.stop(); } catch (_) {}
    alarmRef.current = null;
    setRinging(false);
    if (mode === "work") {
      const completedRound = round + 1;
      const isLong = completedRound >= settings.rounds;
      const nextMode: Mode = isLong ? "long-break" : "short-break";
      toast({
        title: isLong
          ? t("focus.toastLongBreak", { n: settings.rounds })
          : t("focus.toastWorkEnd"),
        description: t("focus.toastSummary", {
          n: settings.work,
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
  }, [mode, round, settings, activeTask, toast, t]);

  // Safety net: stop any lingering alarm on unmount (route change, F5…).
  useEffect(() => {
    return () => {
      try { alarmRef.current?.stop(); } catch (_) {}
    };
  }, []);

  // Tick — keep the setState updater pure and call handleComplete
  // OUTSIDE the updater. Previously the updater invoked handleComplete
  // directly, which double-fired in React 19 strict mode (the updater
  // runs twice to surface impurity) → minutes credited twice, two alarm
  // loops layered, double toast.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      let didComplete = false;
      setRemaining((r) => {
        if (r <= 1) {
          didComplete = true;
          return 0;
        }
        return r - 1;
      });
      if (didComplete) {
        window.clearInterval(id);
        handleCompleteRef.current();
      }
    }, 1000);
    return () => window.clearInterval(id);
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
    // viaSkip=true → credit elapsed time (not full duration) + suppress
    // alarm sound (user explicitly chose to skip; no bell needed).
    handleComplete(true);
  }, [handleComplete]);

  // Keyboard shortcuts — when ringing, ANY key dismisses (alarm-clock
  // semantics). Otherwise Space toggles, R resets, S skips.
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
      if (ringing) {
        e.preventDefault();
        dismissAlarm();
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
  }, [running, ringing, start, pause, reset, skip, dismissAlarm]);

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
    <div className="h-full flex flex-col gap-4 max-w-2xl mx-auto w-full">
      {/* Compact top bar: title left, today stats + sound toggle right */}
      <div className="shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">{t("focus.title")}</h2>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground inline-flex items-center gap-1.5 tabular-nums">
            <TrendingUp className="h-3.5 w-3.5" />
            {todayStats.minutes}m · {t("focus.sessionsCount", { n: todayStats.count })}
          </span>
          <button
            onClick={() => setSettings((s) => ({ ...s, sound: !s.sound }))}
            className="cm-press inline-flex items-center gap-1 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={settings.sound ? t("focus.soundOn") : t("focus.soundOff")}
            aria-label={settings.sound ? t("focus.soundOn") : t("focus.soundOff")}
          >
            {settings.sound ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Active task chip — minimal one-liner. Click to swap; × to clear. */}
      <div className="shrink-0 relative">
        {activeTask ? (
          <div className="inline-flex items-center gap-2 max-w-full px-3 py-1.5 rounded-full border bg-card/60 backdrop-blur-sm">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full shrink-0",
                subjectColor(activeTask.title).dot
              )}
              aria-hidden
            />
            <button
              onClick={() => setShowTaskPicker((v) => !v)}
              className="cm-press text-xs font-medium truncate hover:text-primary transition-colors text-left"
              title={activeTask.title}
            >
              {activeTask.title}
            </button>
            <button
              onClick={() => setTaskId(null)}
              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
              aria-label="Bỏ chọn task"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l6 6m0-6l-6 6"/></svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowTaskPicker((v) => !v)}
            className="cm-press inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3 w-3" />
            {t("focus.pickTask")}
          </button>
        )}
        {showTaskPicker && (
          <div className="absolute z-20 top-full mt-2 left-0 w-full max-w-md rounded-xl border bg-card shadow-lg p-2 max-h-[55vh] overflow-y-auto">
            <div className="flex items-center justify-between px-2 pb-2">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t("focus.pickTask")}
              </p>
              <button
                onClick={() => setShowTaskPicker(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
                aria-label={t("common.close")}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8m0-8l-8 8"/></svg>
              </button>
            </div>
            <button
              onClick={() => { setTaskId(null); setShowTaskPicker(false); }}
              className={cn(
                "cm-press w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                !taskId ? "bg-primary/10 text-primary" : "hover:bg-accent"
              )}
            >
              {t("focus.noTaskOpt")}
            </button>
            {undone.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {t("focus.inboxZero")}
              </p>
            ) : (
              undone.map((task) => {
                const col = subjectColor(task.title);
                return (
                  <button
                    key={task.id}
                    onClick={() => { setTaskId(task.id); setShowTaskPicker(false); }}
                    className={cn(
                      "cm-press w-full text-left px-3 py-2 rounded-md flex items-center gap-2 text-sm transition-colors",
                      taskId === task.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-accent"
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", col.dot)} aria-hidden />
                    <span className="truncate flex-1">{task.title}</span>
                    {(task.pomodoroMinutes || 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {task.pomodoroMinutes}m
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <Card
        className={cn(
          "bg-gradient-to-br border shadow-sm flex-1 transition-all duration-500",
          tone.bg
        )}
      >
        <CardContent className="flex flex-col items-center justify-center py-8 gap-5">
          {/* Mode + round dots */}
          <div className="flex items-center gap-3">
            <span className={cn("text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5", tone.text)}>
              {mode === "work" ? <Timer className="h-3.5 w-3.5" /> : <Coffee className="h-3.5 w-3.5" />}
              {t(MODE_I18N_KEY[mode])}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: settings.rounds }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-all duration-300",
                    i < round
                      ? "bg-primary"
                      : i === round && mode === "work"
                      ? "bg-primary/40 ring-2 ring-primary/30 scale-125"
                      : "bg-muted-foreground/20"
                  )}
                  title={`Round ${i + 1} / ${settings.rounds}`}
                />
              ))}
            </div>
          </div>

          {/* Timer circle */}
          <div
            className={cn(
              "relative h-64 w-64 rounded-full border-8 flex items-center justify-center transition-all duration-500",
              tone.ring,
              running && tone.glow,
              ringing && "cm-late-pulse border-primary/50"
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
                strokeDasharray={`${(ringing ? 1 : progress) * 289.03} 289.03`}
                strokeLinecap="round"
              />
            </svg>
            <div className="text-center">
              {ringing ? (
                <>
                  <p className={cn("text-5xl font-bold tracking-tight", tone.text)}>
                    ✓
                  </p>
                  <p className="text-sm font-semibold mt-1">
                    {mode === "work" ? t("focus.toastWorkEnd") : t("focus.toastBreakEnd")}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                    {t("focus.alarmRinging")}
                  </p>
                </>
              ) : (
                <>
                  <p
                    className={cn(
                      "text-6xl font-bold tracking-tight tabular-nums transition-colors",
                      running && tone.text
                    )}
                  >
                    {mm}:{ss}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2">
                    {running ? t("focus.running") : t(MODE_SHORT_KEY[mode])}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Control buttons — swap to big "Dừng chuông" when ringing */}
          {ringing ? (
            <Button
              onClick={dismissAlarm}
              size="lg"
              className="gap-2 cm-press text-base px-8"
              autoFocus
            >
              <VolumeX className="h-4 w-4" /> {t("focus.alarmDismiss")}
              <kbd className="ml-1 text-[10px] opacity-60 hidden md:inline">Space</kbd>
            </Button>
          ) : (
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
          )}

          {/* Presets row — hidden while ringing to keep focus on dismiss */}
          {!ringing && (
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
          )}

          {/* Custom adjustments — collapsed by default */}
          <div
            className={cn(
              "cm-collapse w-full max-w-md",
              showSettings && !ringing && "is-open"
            )}
          >
            <div>
              <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stepper
                  label={t("focus.label.work")}
                  value={settings.work}
                  min={1}
                  max={180}
                  onChange={(v) => setSettings((s) => ({ ...s, work: v }))}
                />
                <Stepper
                  label={t("focus.label.short")}
                  value={settings.shortBreak}
                  min={1}
                  max={60}
                  onChange={(v) => setSettings((s) => ({ ...s, shortBreak: v }))}
                />
                <Stepper
                  label={t("focus.label.long")}
                  value={settings.longBreak}
                  min={1}
                  max={90}
                  onChange={(v) => setSettings((s) => ({ ...s, longBreak: v }))}
                />
                <Stepper
                  label={t("focus.label.rounds")}
                  value={settings.rounds}
                  min={1}
                  max={10}
                  unit=""
                  onChange={(v) => setSettings((s) => ({ ...s, rounds: v }))}
                />
              </div>
              <div className="pt-3">
                <Toggle
                  checked={settings.autoStart}
                  onChange={(v) => setSettings((s) => ({ ...s, autoStart: v }))}
                  label={t("focus.autoStart")}
                  hint={t("focus.autoStartHint")}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
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
  const t = useT();
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
          aria-label={t("dtp.decreaseAria", { label })}
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
          aria-label={t("dtp.increaseAria", { label })}
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
