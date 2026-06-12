import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTasks } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function MiniCalendar() {
  const navigate = useNavigate();
  const { tasks } = useTasks();
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Build a set of dayKeys that have any tasks + map to the highest-priority bucket
  const dayMeta = useMemo(() => {
    const meta = new Map<string, { count: number; urgent: boolean }>();
    for (const t of tasks) {
      if (!t.deadline || t.status === "done") continue;
      const k = dayKey(new Date(t.deadline));
      const prev = meta.get(k) ?? { count: 0, urgent: false };
      meta.set(k, {
        count: prev.count + 1,
        urgent: prev.urgent || t.priority === "high",
      });
    }
    return meta;
  }, [tasks]);

  // Build calendar grid
  const grid = useMemo(() => {
    const start = new Date(viewMonth);
    const firstDow = start.getDay();
    const daysInMonth = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth() + 1,
      0
    ).getDate();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
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
          {viewMonth.toLocaleDateString("vi-VN", {
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
            aria-label="Tháng trước"
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
            Hôm nay
          </button>
          <button
            onClick={() =>
              setViewMonth(
                new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
              )
            }
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            aria-label="Tháng sau"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-0.5">
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
            ? `${meta.count} việc${meta.urgent ? " (có việc gấp)" : ""}`
            : undefined;
          return (
            <button
              key={i}
              onClick={() =>
                navigate("/calendar?date=" + encodeURIComponent(k))
              }
              title={tip}
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
