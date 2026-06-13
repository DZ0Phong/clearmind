import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTasks } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";
import { useT, useLocaleTag, useDateFns } from "@/lib/i18n";

export function MiniCalendar() {
  const navigate = useNavigate();
  const { tasks } = useTasks();
  const t = useT();
  const localeTag = useLocaleTag();
  const { dayKey } = useDateFns();
  // Mon-first week ordering matches the rest of the app (Vietnamese & most
  // European calendars start on Monday). The shifted index keeps Sunday at
  // the end so the heatmap visually matches the FullCalendar week view.
  const DOW = [
    t("review.dow.mon"),
    t("review.dow.tue"),
    t("review.dow.wed"),
    t("review.dow.thu"),
    t("review.dow.fri"),
    t("review.dow.sat"),
    t("review.dow.sun"),
  ];
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Build a set of dayKeys that have any tasks + map to the highest-priority
  // bucket. Recurring tasks (weekly/daily/weekday/monthly) are EXPANDED
  // into the visible month — previously only the stored `deadline` got a
  // dot, so a weekly class showed up on its first Monday and the four
  // other Mondays were blank, defeating the heatmap's whole purpose.
  const dayMeta = useMemo(() => {
    const meta = new Map<string, { count: number; urgent: boolean }>();
    const monthStart = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth(),
      1
    );
    const monthEnd = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth() + 1,
      0
    );
    monthEnd.setHours(23, 59, 59, 999);
    const renderCap = new Date();
    renderCap.setMonth(renderCap.getMonth() + 6); // matches calendar-view fallback

    const addOcc = (date: Date, urgent: boolean) => {
      const k = dayKey(date);
      const prev = meta.get(k) ?? { count: 0, urgent: false };
      meta.set(k, { count: prev.count + 1, urgent: prev.urgent || urgent });
    };

    for (const task of tasks) {
      if (!task.deadline || task.status === "done") continue;
      const first = new Date(task.deadline);
      if (Number.isNaN(first.getTime())) continue;
      const urgent = task.priority === "high";

      if (!task.recurrence) {
        if (first >= monthStart && first <= monthEnd) addOcc(first, urgent);
        continue;
      }
      const endCap = task.recurrenceEndAt
        ? new Date(task.recurrenceEndAt)
        : renderCap;
      const cursor = new Date(first);
      let safety = 200;
      while (safety-- > 0 && cursor <= monthEnd && cursor <= endCap) {
        if (cursor >= monthStart) addOcc(cursor, urgent);
        if (task.recurrence === "daily") {
          cursor.setDate(cursor.getDate() + 1);
        } else if (task.recurrence === "weekday") {
          do cursor.setDate(cursor.getDate() + 1);
          while (cursor.getDay() === 0 || cursor.getDay() === 6);
        } else if (task.recurrence === "weekly") {
          cursor.setDate(cursor.getDate() + 7);
        } else if (task.recurrence === "monthly") {
          cursor.setMonth(cursor.getMonth() + 1);
        } else {
          break;
        }
      }
    }
    return meta;
  }, [tasks, viewMonth]);

  // Build Mon-start calendar grid.
  const grid = useMemo(() => {
    const start = new Date(viewMonth);
    const dow0 = start.getDay(); // 0=Sun, 1=Mon...
    const firstSlot = (dow0 + 6) % 7; // shift so Mon = 0
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
    return cells;
  }, [viewMonth]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayK = dayKey(today);

  return (
    <div className="px-4 pb-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold capitalize text-foreground/80">
          {viewMonth.toLocaleDateString(localeTag, {
            month: "long",
            year: "numeric",
          })}
        </p>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() =>
              setViewMonth(
                new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
              )
            }
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            aria-label={t("calendar.prevMonth")}
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            onClick={() => {
              const d = new Date();
              setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
            className="text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground font-semibold px-1"
          >
            {t("calendar.today")}
          </button>
          <button
            onClick={() =>
              setViewMonth(
                new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
              )
            }
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            aria-label={t("calendar.nextMonth")}
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div
        role="grid"
        aria-label={viewMonth.toLocaleDateString(localeTag, { month: "long", year: "numeric" })}
        className="grid grid-cols-7 gap-0.5"
      >
        {DOW.map((d) => (
          <div
            key={d}
            className="text-center text-[9px] font-semibold text-muted-foreground/70 uppercase pb-1"
          >
            {d}
          </div>
        ))}
        {grid.map((d, i) => {
          if (!d) return <div key={i} className="h-7" />;
          const k = dayKey(d);
          const meta = dayMeta.get(k);
          const isToday = k === todayK;
          const tip = meta
            ? t("calendar.dayTasksWithUrgent", {
                n: meta.count,
                urgent: meta.urgent ? t("calendar.urgentSuffix") : "",
              })
            : undefined;
          return (
            <button
              key={i}
              onClick={() =>
                navigate("/calendar?date=" + encodeURIComponent(k))
              }
              title={tip}
              aria-label={`${d.toLocaleDateString(localeTag, { weekday: "long", day: "numeric", month: "long" })}${tip ? ", " + tip : ""}`}
              className={cn(
                "h-7 w-full rounded-md text-[11px] font-medium transition-colors flex flex-col items-center justify-center relative tabular-nums",
                isToday && "bg-primary text-primary-foreground",
                !isToday && meta && "hover:bg-accent",
                !isToday && !meta && "hover:bg-accent/50 text-muted-foreground"
              )}
            >
              <span className="leading-none">{d.getDate()}</span>
              {meta && !isToday && (
                <div className="flex items-center gap-0.5 mt-0.5">
                  {Array.from({ length: Math.min(meta.count, 3) }).map((_, j) => (
                    <span
                      key={j}
                      className={cn(
                        "h-1 w-1 rounded-full",
                        meta.urgent ? "bg-destructive" : "bg-primary"
                      )}
                    />
                  ))}
                </div>
              )}
              {meta && isToday && (
                <span className="h-1 w-1 rounded-full mt-0.5 bg-primary-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
