import { useEffect, useRef, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  Minus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT, useLocaleTag, DOW_KEYS_MON_FIRST } from "@/lib/i18n";

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  /** Date-only mode: hide time controls, emit "YYYY-MM-DD". */
  dateOnly?: boolean;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function parseValue(v: string): { date: Date | null; h: number; m: number } {
  if (!v) return { date: null, h: 9, m: 0 };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { date: null, h: 9, m: 0 };
  return { date: d, h: d.getHours(), m: d.getMinutes() };
}

function toLocalDateTime(d: Date, h: number, m: number): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(h)}:${pad(m)}`;
}

function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type T = ReturnType<typeof useT>;

function fmtDisplayDateOnly(d: Date, t: T): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dCopy = new Date(d);
  dCopy.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dCopy.getTime() === today.getTime()) return t("dtp.displayTodayDateOnly");
  if (dCopy.getTime() === tomorrow.getTime()) return t("dtp.displayTomorrowDateOnly");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtDisplay(d: Date, t: T): string {
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay) return t("dtp.displayToday", { time });
  if (isTomorrow) return t("dtp.displayTomorrow", { time });
  return `${time} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

interface TimeStepperProps {
  value: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}

function TimeStepper({ value, max, step, onChange, ariaLabel }: TimeStepperProps) {
  const t = useT();
  const wrap = (n: number) => ((n % (max + 1)) + (max + 1)) % (max + 1);
  const dec = () => onChange(wrap(value - step));
  const inc = () => onChange(wrap(value + step));

  const handleInput = (raw: string) => {
    // Keep the LAST 2 digits, not the first 2 — otherwise the controlled
    // input keeps prepending the padded zero ("01") and typing "5" gives
    // "015" → first-2 = "01" → discards the actual digit the user just
    // typed. slice(-2) takes "15", the intent.
    const cleaned = raw.replace(/\D/g, "").slice(-2);
    if (cleaned === "") {
      onChange(0);
      return;
    }
    const n = parseInt(cleaned, 10);
    if (Number.isFinite(n)) onChange(Math.max(0, Math.min(max, n)));
  };

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    if (document.activeElement !== e.currentTarget) return;
    e.preventDefault();
    if (e.deltaY < 0) inc();
    else dec();
  };

  return (
    <div className="inline-flex items-stretch h-8 rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-ring transition-all">
      <button
        type="button"
        onClick={dec}
        aria-label={t("dtp.decreaseAria", { label: ariaLabel })}
        className="w-8 flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground active:bg-primary/15 active:text-primary transition-colors border-r border-input"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={pad(value)}
        onChange={(e) => handleInput(e.target.value)}
        onWheel={handleWheel}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={ariaLabel}
        className="w-10 text-center text-sm font-semibold tabular-nums bg-transparent focus:outline-none"
      />
      <button
        type="button"
        onClick={inc}
        aria-label={t("dtp.increaseAria", { label: ariaLabel })}
        className="w-8 flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground active:bg-primary/15 active:text-primary transition-colors border-l border-input"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function DateTimePicker({
  value,
  onChange,
  className,
  placeholder,
  id,
  dateOnly = false,
}: Props) {
  const t = useT();
  const localeTag = useLocaleTag();
  const DOW_LABELS = DOW_KEYS_MON_FIRST.map((k) => t(k));
  const TIME_PRESETS: Array<[number, number, string]> = [
    [8, 0, t("dtp.timePresetMorning")],
    [12, 0, t("dtp.timePresetNoon")],
    [14, 0, t("dtp.timePresetAfternoon")],
    [19, 0, t("dtp.timePresetEvening")],
  ];
  const resolvedPlaceholder =
    placeholder ?? t(dateOnly ? "dtp.placeholderDate" : "dtp.placeholderDateTime");
  const initial = parseValue(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = initial.date || new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Date | null>(initial.date);
  const [hour, setHour] = useState(initial.h);
  const [minute, setMinute] = useState(initial.m);
  const [alignRight, setAlignRight] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Sync from external value
  useEffect(() => {
    const { date, h, m } = parseValue(value);
    setSelected(date);
    setHour(h);
    setMinute(m);
    if (date) setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }, [value]);

  // Close on outside click / ESC
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Auto-flip when popover would overflow viewport edges
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const POPOVER_W = 300;
    const POPOVER_H = dateOnly ? 320 : 420;
    const MARGIN = 12;
    // Subtract the mobile tab-bar height so the picker flips upward when
    // opening down would underlap the 56px bottom nav. --mobile-tabbar-h
    // resolves to 0 at md+ so desktop behaviour is unchanged.
    const rootStyle = getComputedStyle(document.documentElement);
    const tabBarRem = parseFloat(rootStyle.getPropertyValue("--mobile-tabbar-h") || "0");
    const fontSize = parseFloat(rootStyle.fontSize) || 16;
    const tabBarPx = Number.isFinite(tabBarRem) ? tabBarRem * fontSize : 0;
    const effectiveBottom = window.innerHeight - tabBarPx;
    const rect = triggerRef.current.getBoundingClientRect();
    setAlignRight(rect.left + POPOVER_W > window.innerWidth - MARGIN);
    setOpenUpward(rect.bottom + POPOVER_H > effectiveBottom - MARGIN);
  }, [open, dateOnly]);

  function commit(d: Date | null, h: number, m: number) {
    if (!d) {
      onChange("");
      return;
    }
    onChange(dateOnly ? toLocalDate(d) : toLocalDateTime(d, h, m));
  }

  function pickDate(d: Date) {
    setSelected(d);
    commit(d, hour, minute);
  }

  function setTime(h: number, m: number) {
    const safeH = Math.max(0, Math.min(23, h));
    const safeM = Math.max(0, Math.min(59, m));
    setHour(safeH);
    setMinute(safeM);
    if (selected) commit(selected, safeH, safeM);
  }

  // Calendar grid — Mon-start (matches mini-calendar + most non-US locales).
  const startOfMonth = viewMonth;
  const dow0 = startOfMonth.getDay(); // 0=Sun
  const firstSlot = (dow0 + 6) % 7; // shift so Mon=0
  const daysInMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0
  ).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstSlot; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayK = today.getTime();
  const selectedK = selected
    ? new Date(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate()
      ).getTime()
    : -1;

  const presets: Array<{ label: string; build: () => Date }> = [
    { label: t("dtp.preset.today"), build: () => new Date() },
    {
      label: t("dtp.preset.tomorrow"),
      build: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d;
      },
    },
    {
      label: t("dtp.preset.weekend"),
      build: () => {
        const d = new Date();
        const diff = ((6 - d.getDay()) + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        return d;
      },
    },
    {
      label: t("dtp.preset.nextWeek"),
      build: () => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d;
      },
    },
  ];

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center justify-between gap-2 w-full h-9 px-3 rounded-md border border-input bg-background text-sm transition-all hover:bg-accent/40",
          open && "ring-2 ring-ring/40 border-ring"
        )}
      >
        <span
          className={cn(
            "flex items-center gap-2 truncate",
            !selected && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {selected
            ? dateOnly
              ? fmtDisplayDateOnly(selected, t)
              : fmtDisplay(selected, t)
            : resolvedPlaceholder}
        </span>
        {selected && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(null);
              commit(null, hour, minute);
            }}
            className="opacity-60 hover:opacity-100 shrink-0 rounded p-0.5 hover:bg-muted"
            aria-label={t("dtp.clearAria")}
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          className={cn(
            "absolute z-50 w-[300px] rounded-xl border bg-popover shadow-2xl p-3 animate-in fade-in-0 zoom-in-95",
            alignRight ? "right-0" : "left-0",
            openUpward ? "bottom-full mb-1.5" : "top-full mt-1.5"
          )}
        >
          {/* Presets */}
          <div className="flex flex-wrap gap-1 mb-3">
            {presets.map(({ label, build }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  const d = build();
                  setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                  pickDate(d);
                }}
                className="text-xs px-2.5 py-1 rounded-full bg-secondary hover:bg-primary/15 hover:text-primary transition-colors font-medium"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() =>
                setViewMonth(
                  new Date(
                    viewMonth.getFullYear(),
                    viewMonth.getMonth() - 1,
                    1
                  )
                )
              }
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
              aria-label={t("calendar.prevMonth")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold capitalize">
              {viewMonth.toLocaleDateString(localeTag, {
                month: "long",
                year: "numeric",
              })}
            </p>
            <button
              type="button"
              onClick={() =>
                setViewMonth(
                  new Date(
                    viewMonth.getFullYear(),
                    viewMonth.getMonth() + 1,
                    1
                  )
                )
              }
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
              aria-label={t("calendar.nextMonth")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1 mb-3">
            {DOW_LABELS.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-semibold text-muted-foreground uppercase pb-1"
              >
                {d}
              </div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const k = d.getTime();
              const isToday = k === todayK;
              const isSelected = k === selectedK;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDate(d)}
                  className={cn(
                    "h-8 w-full rounded-md text-sm font-medium transition-colors flex items-center justify-center tabular-nums",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : isToday
                      ? "border border-primary/70 text-primary hover:bg-primary/10"
                      : isWeekend
                      ? "text-muted-foreground/70 hover:bg-accent"
                      : "hover:bg-accent"
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Time row — hidden in dateOnly mode */}
          {!dateOnly && (
          <div className="border-t pt-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <TimeStepper
                value={hour}
                max={23}
                step={1}
                onChange={(v) => setTime(v, minute)}
                ariaLabel={t("dtp.hourLabel")}
              />
              <span className="font-bold text-muted-foreground select-none">:</span>
              <TimeStepper
                value={minute}
                max={59}
                step={5}
                onChange={(v) => setTime(hour, v)}
                ariaLabel={t("dtp.minuteLabel")}
              />
              <span className="text-[11px] text-muted-foreground ml-auto tabular-nums font-medium">
                {pad(hour)}:{pad(minute)}
              </span>
            </div>
            <div className="flex gap-1">
              {TIME_PRESETS.map(([h, m, label]) => {
                const active = hour === h && minute === m;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setTime(h, m)}
                    className={cn(
                      "flex-1 text-[10px] px-1 py-1.5 rounded-md border transition-colors font-medium",
                      active
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-transparent bg-secondary hover:bg-primary/10 hover:text-primary"
                    )}
                  >
                    <span className="block tabular-nums text-[11px]">
                      {pad(h)}:{pad(m)}
                    </span>
                    <span className={cn(
                      "block text-[9px]",
                      active ? "text-primary/80" : "text-muted-foreground"
                    )}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          )}

          <div className="flex justify-end gap-2 mt-3 pt-3 border-t">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(null);
                commit(null, hour, minute);
                setOpen(false);
              }}
            >
              {t("common.delete")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!selected) {
                  const d = new Date();
                  pickDate(d);
                }
                setOpen(false);
              }}
            >
              {t("common.done")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
