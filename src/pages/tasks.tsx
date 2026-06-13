import { memo, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTickingNow } from "@/hooks/use-ticking-now";
import { useTasks, type Task, type TaskStatus } from "@/hooks/use-tasks";
import { useTaskCommands } from "@/components/tasks/task-commands";
import { useToast } from "@/components/feedback/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckSquare,
  Trash2,
  ListTodo,
  CheckCircle2,
  Search,
  X,
  Hourglass,
  Repeat,
  Bell,
  MapPin,
  Flame,
  BookOpen,
  ChevronDown,
  Clock4,
  CalendarClock,
  AlarmClock,
  Wand2,
  ArrowUpDown,
  AlertCircle,
  CalendarRange,
  Sun,
  Hash,
  Layers,
  GraduationCap,
} from "lucide-react";
import { QuickCapture } from "@/components/tasks/task-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT, useDateFns, DOW_KEYS_SUN_FIRST } from "@/lib/i18n";
import { HomeworkDialog } from "@/components/tasks/homework-dialog";
import {
  formatTimeAgoShort,
  BUCKET_ORDER,
  subjectColor,
  tagStats,
  isRecurringClass,
  type DateBucket,
} from "@/lib/utils";
import { cn } from "@/lib/utils";

type Filter = "all" | "todo" | "done";
type SortMode = "deadline" | "priority" | "recent";
type ViewMode = "tasks" | "schedule" | "all";

const SORT_STORAGE_KEY = "clearmind_tasks_sort";
const COLLAPSED_STORAGE_KEY = "clearmind_tasks_collapsed";
const VIEW_STORAGE_KEY = "clearmind_tasks_view";

// `isRecurringClass` lives in @/lib/utils so topbar/dashboard/review share
// the same smart filter — buổi học không phải "việc cần làm quá hạn".

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

const BUCKET_ICON: Record<DateBucket, typeof CheckSquare> = {
  overdue: AlertCircle,
  today: Sun,
  "this-week": CalendarRange,
  later: CalendarClock,
  none: ListTodo,
};

function StatusCycler({
  status,
  onClick,
}: {
  status: TaskStatus;
  onClick: () => void;
}) {
  const t = useT();
  const label = status === "todo" ? t("status.todo")
    : status === "in-progress" ? t("status.inProgress")
    : t("status.done");
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={t("tooltip.toggleStatus", { label })}
      aria-label={t("tooltip.toggleStatus", { label })}
      className={cn(
        "cm-touch-44 h-5 w-5 rounded-full border-2 mt-0.5 shrink-0 relative transition-all duration-200 cm-press hover:scale-110",
        status === "todo" && "border-primary/50 hover:border-primary",
        status === "in-progress" &&
          "border-orange-500 bg-gradient-to-r from-orange-500 to-orange-500/0 from-50% to-50%",
        status === "done" && "border-primary bg-primary"
      )}
    >
      {status === "done" && (
        <CheckCircle2 className="absolute inset-0 m-auto h-3 w-3 text-primary-foreground cm-check-pop" />
      )}
    </button>
  );
}

const DAY_MS = 24 * 60 * 60_000;

const TaskRow = memo(function TaskRow({
  task,
  parent,
  onHomework,
  onTagClick,
  index = 0,
}: {
  task: Task;
  parent?: Task;
  onHomework?: () => void;
  onTagClick?: (tag: string) => void;
  index?: number;
}) {
  const { cycleStatus, removeTask, snoozeTask } = useTasks();
  const { openEdit } = useTaskCommands();
  const { formatDeadline } = useDateFns();
  const { toast } = useToast();
  const t = useT();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const { restore } = removeTask(task.id);
    toast({
      title: t("tasks.deletedToast"),
      description: task.title,
      action: { label: t("common.undo"), onClick: restore },
    });
  };

  const handleSnooze = (deltaMs: number, label: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    snoozeTask(task.id, deltaMs);
    toast({
      title: t("tasks.snoozedToast", { label }),
      description: task.title,
      variant: "success",
    });
  };

  const isAcademic = task.type === "academic";
  const accent = isAcademic ? subjectColor(task.title) : null;
  // Time-of-day overdue: deadline có giờ + đã qua giờ + chưa done. Date-only
  // (vd "2026-06-12") không tính — không có giờ cụ thể để "trễ".
  const hasTime = !!task.deadline && task.deadline.includes("T");
  const lateBy =
    hasTime && task.status !== "done"
      ? formatTimeAgoShort(task.deadline!)
      : null;
  const isLate = !!lateBy;

  // Stagger row entry — cap delay at 240ms so very long lists don't crawl.
  const enterDelay = `${Math.min(index, 12) * 20}ms`;
  return (
    <div
      onClick={() => openEdit(task.id)}
      style={{ animationDelay: enterDelay }}
      className={cn(
        "cm-list-enter cm-press group relative flex items-center justify-between gap-3 px-3.5 py-2.5 pl-4 rounded-lg border bg-background/50 hover:bg-accent/60 hover:brightness-[1.02] cursor-pointer overflow-hidden",
        task.priority === "high" &&
          task.status !== "done" &&
          "border-destructive/30 bg-destructive/5 hover:bg-destructive/10",
        isLate &&
          "ring-1 ring-destructive/40 border-destructive/40 bg-destructive/[0.06] hover:bg-destructive/[0.1]"
      )}
    >
      {accent && (
        <span
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1",
            accent.dot,
            task.status === "done" && "opacity-30"
          )}
          aria-hidden
        />
      )}
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <StatusCycler status={task.status} onClick={() => cycleStatus(task.id)} />
        <div className="min-w-0 flex-1">
          {parent && (
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold inline-flex items-center gap-1 mb-0.5">
              <BookOpen className="h-2.5 w-2.5" />
              {t("tasks.row.homeworkPrefix", { subject: parent.title })}
            </p>
          )}
          <p
            className={cn(
              "text-sm font-medium leading-tight line-clamp-2 sm:truncate",
              task.status === "done" && "line-through text-muted-foreground"
            )}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs">
            {isLate && (
              <span className="cm-late-pulse font-bold px-1.5 py-0.5 rounded-md bg-destructive text-destructive-foreground inline-flex items-center gap-1 uppercase text-[10px] tracking-wide">
                <AlertCircle className="h-3 w-3" />
                {t("tasks.lateBy", { time: lateBy! })}
              </span>
            )}
            {task.priority === "high" && task.status !== "done" && (
              <span className="font-semibold px-1.5 py-0.5 rounded-md bg-destructive/15 text-destructive inline-flex items-center gap-1">
                <Flame className="h-3 w-3" /> {t("priority.urgent")}
              </span>
            )}
            {task.deadline && (
              <span
                className={cn(
                  "font-medium tabular-nums",
                  isLate ? "text-destructive font-semibold" : "text-primary"
                )}
              >
                {formatDeadline(task.deadline)}
              </span>
            )}
            {task.location && (
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {task.location}
              </span>
            )}
            {task.recurrence && (
              <span
                className="text-muted-foreground inline-flex items-center"
                title={
                  task.notify
                    ? t("tasks.row.recurrenceWithNotify", {
                        rule: task.recurrence,
                        pref: task.notify,
                      })
                    : t("tasks.row.recurrenceTooltip", { rule: task.recurrence })
                }
              >
                <Repeat className="h-3 w-3" />
              </span>
            )}
            {task.notify && !task.recurrence && (
              <span
                className="text-muted-foreground inline-flex items-center"
                title={t("tasks.row.notifyTooltip", { pref: task.notify })}
              >
                <Bell className="h-3 w-3" />
              </span>
            )}
            {(task.pomodoroMinutes || 0) > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 tabular-nums">
                <Hourglass className="h-3 w-3" /> {task.pomodoroMinutes}m
              </span>
            )}
            {task.tags?.slice(0, 2).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(tag);
                }}
                className="font-medium px-1.5 py-0 rounded text-primary/80 hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                title={t("tasks.row.filterByTag", { tag })}
              >
                #{tag}
              </button>
            ))}
            {(task.tags?.length || 0) > 2 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(task.tags![2]);
                }}
                className="text-muted-foreground hover:text-foreground"
                title={task.tags!.slice(2).map((tag) => `#${tag}`).join(" ")}
              >
                +{task.tags!.length - 2}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {task.deadline && task.status !== "done" && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleSnooze(DAY_MS, t("tasks.snoozeDayLabel"))}
              className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
              title={t("tasks.snoozeDay")}
              aria-label={t("tasks.snoozeDay")}
            >
              <Clock4 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleSnooze(7 * DAY_MS, t("tasks.snoozeWeekLabel"))}
              className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
              title={t("tasks.snoozeWeek")}
              aria-label={t("tasks.snoozeWeek")}
            >
              <CalendarClock className="h-4 w-4" />
            </Button>
          </>
        )}
        {onHomework && task.type === "academic" && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              onHomework();
            }}
            className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
            title={t("tasks.addHomework")}
            aria-label={t("tasks.row.addHomeworkAria")}
          >
            <BookOpen className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleDelete}
          className="text-muted-foreground hover:text-destructive"
          title={t("tasks.row.deleteTooltip")}
          aria-label={t("tasks.row.deleteAria", { title: task.title })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});

export function TasksPage() {
  const { tasks, rollForwardOverdueRecurring, clearDuplicates } = useTasks();
  const { toast } = useToast();
  const t = useT();
  const { groupByBucket } = useDateFns();
  // Force re-render every 30s so the Overdue / Today / This-week buckets
  // re-classify tasks crossing midnight or going overdue without a manual
  // refresh. groupByBucket reads `new Date()` inline on each render.
  useTickingNow(30_000);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTag = searchParams.get("tag")?.toLowerCase() || null;
  // Default to "todo" — done tasks pile up over time and an "all" default
  // makes the list look infinitely scrolling after a few weeks of imports.
  const [filter, setFilter] = useState<Filter>("todo");
  const [query, setQuery] = useState("");
  const [homeworkParentId, setHomeworkParentId] = useState<string | null>(null);

  const setActiveTag = (tag: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tag) next.set("tag", tag);
        else next.delete("tag");
        return next;
      },
      { replace: true }
    );
  };

  const allTagStats = useMemo(() => tagStats(tasks).slice(0, 12), [tasks]);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    return saved === "priority" || saved === "recent" ? saved : "deadline";
  });
  const [view, setView] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === "schedule" || saved === "all" ? saved : "tasks";
  });
  useEffect(() => { localStorage.setItem(VIEW_STORAGE_KEY, view); }, [view]);
  const [collapsed, setCollapsed] = useState<Set<DateBucket>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (raw) return new Set(JSON.parse(raw) as DateBucket[]);
    } catch { /* fall through */ }
    // First-run default: collapse far-future + undated so the page focuses
    // on what's actionable now (today / this week).
    return new Set<DateBucket>(["later", "none"]);
  });

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, sortMode);
  }, [sortMode]);
  useEffect(() => {
    localStorage.setItem(
      COLLAPSED_STORAGE_KEY,
      JSON.stringify(Array.from(collapsed))
    );
  }, [collapsed]);

  const toggleCollapse = (b: DateBucket) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });

  const filterCounts = useMemo(() => {
    let todo = 0;
    let done = 0;
    for (const t of tasks) {
      if (t.status === "done") done++;
      else todo++;
    }
    return { all: tasks.length, todo, done };
  }, [tasks]);

  // Đếm cho tab strip — biết được view nào có bao nhiêu task open.
  const viewCounts = useMemo(() => {
    let cls = 0, work = 0;
    for (const t of tasks) {
      if (t.status === "done") continue;
      if (isRecurringClass(t)) cls++; else work++;
    }
    return { tasks: work, schedule: cls, all: work + cls };
  }, [tasks]);

  const taskById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const homeworkParent = homeworkParentId ? taskById.get(homeworkParentId) : null;

  const filtered = useMemo(() => {
    let xs = tasks;
    // View filter — chạy trước cùng để giảm sớm số lượng cần xử lý.
    if (view === "tasks") xs = xs.filter((t) => !isRecurringClass(t));
    else if (view === "schedule") xs = xs.filter(isRecurringClass);
    if (filter === "todo") xs = xs.filter((t) => t.status !== "done");
    else if (filter === "done") xs = xs.filter((t) => t.status === "done");
    if (activeTag) {
      xs = xs.filter((t) => (t.tags || []).includes(activeTag));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      xs = xs.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q) ||
          (t.location || "").toLowerCase().includes(q) ||
          (t.tags || []).some((tag) => tag.includes(q))
      );
    }
    return xs;
  }, [tasks, view, filter, query, activeTag]);

  // Lịch học hôm nay — strip compact đầu tab "Việc cần làm" để vẫn nắm được
  // mà không bị flood. Đếm từ FULL tasks (không qua filter).
  const todayClasses = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    return tasks
      .filter((t) => {
        if (!isRecurringClass(t) || !t.deadline || t.status === "done") return false;
        const dt = new Date(t.deadline);
        return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
      })
      .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || ""));
  }, [tasks]);

  // Schedule view — gộp các buổi cùng title (= mã môn) vào 1 card.
  const bySubject = useMemo(() => {
    if (view !== "schedule") return [];
    const m = new Map<string, Task[]>();
    for (const t of filtered) {
      const key = t.title.trim();
      const arr = m.get(key) ?? [];
      arr.push(t);
      m.set(key, arr);
    }
    return Array.from(m.entries())
      .map(([title, instances]) => ({
        title,
        instances: instances.sort((a, b) => (a.deadline || "").localeCompare(b.deadline || "")),
      }))
      // Sort các môn theo buổi gần nhất.
      .sort((a, b) => (a.instances[0]?.deadline || "").localeCompare(b.instances[0]?.deadline || ""));
  }, [filtered, view]);

  const grouped = useMemo(() => {
    const g = groupByBucket(filtered);
    if (sortMode === "deadline") return g; // groupByBucket already sorts by deadline asc
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const cmpPriority = (a: Task, b: Task) => {
      const ap = PRIORITY_RANK[a.priority] ?? 99;
      const bp = PRIORITY_RANK[b.priority] ?? 99;
      if (ap !== bp) return ap - bp;
      const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return ad - bd;
    };
    const cmpRecent = (a: Task, b: Task) => b.createdAt.localeCompare(a.createdAt);
    for (const k of BUCKET_ORDER) {
      g[k] = [...g[k]].sort(sortMode === "priority" ? cmpPriority : cmpRecent);
    }
    return g;
  }, [filtered, sortMode]);

  const overdueRecurringCount = useMemo(() => {
    // We intentionally read the clock here — count updates whenever `tasks`
    // changes (e.g., after roll-forward), which is the only signal that
    // matters for showing/hiding the toolbar button.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    return tasks.filter(
      (t) =>
        t.recurrence &&
        t.deadline &&
        t.status !== "done" &&
        new Date(t.deadline).getTime() < now
    ).length;
  }, [tasks]);

  const handleRollForward = () => {
    const { moved, restore } = rollForwardOverdueRecurring();
    // Roll-forward of older duplicate tasks often surfaces dupes against the
    // current-term copy. Offer the cleanup right inside the same toast.
    const dupesLikely = tasks.some((t, i) => {
      if (!t.recurrence || !t.deadline) return false;
      const sigA = `${new Date(t.deadline).getDay()}|${t.title.trim().toLowerCase()}`;
      for (let j = i + 1; j < tasks.length; j++) {
        const o = tasks[j];
        if (!o.recurrence || !o.deadline) continue;
        const sigB = `${new Date(o.deadline).getDay()}|${o.title.trim().toLowerCase()}`;
        if (sigA === sigB) return true;
      }
      return false;
    });
    toast({
      title: moved > 0 ? t("tasks.recurringCleared", { n: moved }) : t("tasks.noRecurringOverdue"),
      variant: moved > 0 ? "success" : "default",
      action:
        moved > 0
          ? dupesLikely
            ? { label: t("tasks.clearDuplicates"), onClick: handleClearDuplicates }
            : { label: t("common.undo"), onClick: restore }
          : undefined,
    });
  };

  const handleClearDuplicates = () => {
    const { removed, restore } = clearDuplicates();
    toast({
      title: removed > 0 ? t("tasks.duplicatesCleared", { n: removed }) : t("tasks.noDuplicates"),
      variant: removed > 0 ? "success" : "default",
      action: removed > 0 ? { label: t("common.undo"), onClick: restore } : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6 pb-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-3xl font-bold tracking-tight">
            {view === "schedule" ? t("tasks.viewSchedule") : view === "all" ? t("tasks.viewAll") : t("tasks.viewTasks")}
          </h2>
          <p className="text-muted-foreground mt-0.5 sm:mt-1 text-xs sm:text-base">
            {view === "schedule"
              ? t("tasks.subtitleSchedule", { subjects: bySubject.length, sessions: filtered.length })
              : t("tasks.subtitleCount", { n: filtered.length })}
          </p>
        </div>
        {/* Big "Thêm nhanh" CTA hides on mobile — the topbar Plus button
            does the same thing and the duplication wastes ~70px of
            vertical chrome before the user can even see a task row. */}
        <div className="hidden sm:block">
          <QuickCapture />
        </div>
      </div>

      <div
        className="cm-seg-track w-fit max-w-full overflow-x-auto"
        role="tablist"
        aria-label={t("tasks.viewSwitcher")}
      >
        <ViewTab active={view === "tasks"} onClick={() => setView("tasks")} icon={ListTodo} label={t("tasks.viewTasks")} count={viewCounts.tasks} />
        <ViewTab active={view === "schedule"} onClick={() => setView("schedule")} icon={GraduationCap} label={t("tasks.viewSchedule")} count={viewCounts.schedule} />
        <ViewTab active={view === "all"} onClick={() => setView("all")} icon={Layers} label={t("tasks.viewAll")} count={viewCounts.all} />
      </div>

      {/* Single consolidated control row — filter pills + sort + clean-dups
          + search on one line at sm+. Previously this was THREE rows
          (filter pills, search alone, then sort + xoá-trùng-lặp on a
          dedicated row) which ate ~120 px of vertical chrome before any
          task was visible. Sort + Wand2 collapse to icon-only on the
          right, search stretches into remaining width. */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
          className="rounded-full gap-1.5"
        >
          {t("tasks.filterAll")}
          <span className="text-[10px] tabular-nums opacity-70">{filterCounts.all}</span>
        </Button>
        <Button
          variant={filter === "todo" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("todo")}
          className="rounded-full gap-1.5"
        >
          <ListTodo className="h-4 w-4" /> {t("tasks.filterTodo")}
          <span className="text-[10px] tabular-nums opacity-70">{filterCounts.todo}</span>
        </Button>
        <Button
          variant={filter === "done" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("done")}
          className="rounded-full gap-1.5"
        >
          <CheckCircle2 className="h-4 w-4" /> {t("tasks.filterDone")}
          <span className="text-[10px] tabular-nums opacity-70">{filterCounts.done}</span>
        </Button>

        {/* Sort dropdown — collapses to icon-only on mobile so it never
            pushes the filter pills off-row. The select is invisible but
            still receives clicks (absolute inset-0). */}
        <div className="relative inline-flex items-center ml-auto sm:ml-0">
          <ArrowUpDown className="absolute left-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            aria-label={t("tasks.sortLabel")}
            className="h-8 pl-7 pr-7 rounded-md border border-input bg-background text-xs shadow-xs appearance-none cursor-pointer outline-none transition-[color,box-shadow] hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {(["deadline", "priority", "recent"] as SortMode[]).map((m) => (
              <option key={m} value={m}>
                {t(`tasks.sort.${m}`)}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>

        {/* Clean-duplicates — icon-only button. The DuplicateBanner runs
            once on mount automatically; this manual trigger covers the
            case where new dups appeared during the session (e.g. after
            an import). Tooltip explains. */}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={handleClearDuplicates}
          title={t("tasks.clearDuplicates")}
          aria-label={t("tasks.clearDuplicates")}
        >
          <Wand2 className="h-3.5 w-3.5" />
        </Button>

        <div className="relative w-full sm:w-[260px] sm:ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("tasks.searchPlaceholder")}
            className="pl-8 pr-8"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tag chip row — collapsed to "+N tags" toggle when there are
          more than 5, since heavy users of #tags can rack up dozens
          which would wrap to 3+ rows of chrome. Active tag always
          visible. */}
      {allTagStats.length > 0 && (
        <TagFilterStrip
          stats={allTagStats}
          active={activeTag}
          onPick={setActiveTag}
        />
      )}

      {homeworkParent && (
        <HomeworkDialog
          parentTask={homeworkParent}
          open
          onOpenChange={(b) => !b && setHomeworkParentId(null)}
        />
      )}

      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Hôm nay có buổi học — chỉ hiện ở view "Việc cần làm" để user
            vẫn nắm được lịch mà không phải mở list buổi lớp. */}
        {view === "tasks" && todayClasses.length > 0 && (
          <TodayClassesStrip tasks={todayClasses} onSwitch={() => setView("schedule")} />
        )}

        {/* Overdue compact alert — kept separate from the main list to
            reduce visual noise; expand inline to triage individual items. */}
        {grouped.overdue.length > 0 && (
          <OverdueAlert
            tasks={grouped.overdue}
            recurringCount={overdueRecurringCount}
            onRollForward={handleRollForward}
            taskById={taskById}
            onHomework={setHomeworkParentId}
            onTagClick={setActiveTag}
          />
        )}

        {/* Schedule view: gộp theo môn, không xài bucket. */}
        {view === "schedule" ? (
          <Card className="border-primary/10 shadow-sm bg-card min-h-[400px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                {t("tasks.bySubject")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bySubject.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="font-medium">{t("tasks.noScheduleEmpty")}</p>
                  <p className="text-xs mt-1">{t("tasks.noScheduleHint")}</p>
                </div>
              ) : (
                bySubject.map((s) => (
                  <SubjectGroup
                    key={s.title}
                    title={s.title}
                    instances={s.instances}
                    taskById={taskById}
                    onTagClick={setActiveTag}
                  />
                ))
              )}
            </CardContent>
          </Card>
        ) : (
        <Card className="border-primary/10 shadow-sm bg-card min-h-[400px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              {t("tasks.list")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {(() => {
              const nonOverdueCount =
                filtered.length - grouped.overdue.length;
              return nonOverdueCount === 0;
            })() ? (
              <div className="text-center py-12 text-muted-foreground space-y-2">
                {activeTag ? (
                  <>
                    <p className="font-medium">
                      {t("empty.noTagFiltered", {
                        tag: activeTag,
                        filter: filter === "todo" ? t("empty.noTagFiltered.todoSuffix") : "",
                      })}
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setActiveTag(null)}
                      className="text-xs h-auto p-0"
                    >
                      {t("empty.removeTagFilter")}
                    </Button>
                  </>
                ) : query ? (
                  <>
                    <p className="font-medium">{t("empty.searchEmpty", { q: query })}</p>
                    <p className="text-xs">{t("empty.searchHint")}</p>
                  </>
                ) : grouped.overdue.length > 0 ? (
                  <>
                    <p className="font-medium">{t("empty.onlyOverdueTitle")}</p>
                    <p className="text-xs">{t("empty.onlyOverdueHint")}</p>
                  </>
                ) : filter === "todo" ? (
                  <>
                    <p className="font-medium">{t("empty.noTodoTasks")}</p>
                    <p className="text-xs">{t("empty.noTodoHint")}</p>
                  </>
                ) : filter === "done" ? (
                  <>
                    <p className="font-medium">{t("empty.noDoneTasks")}</p>
                    <p className="text-xs">{t("empty.noDoneHint")}</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">{t("empty.noTasksTitle")}</p>
                    <p className="text-xs">{t("empty.noTasksHint")}</p>
                  </>
                )}
              </div>
            ) : (
              BUCKET_ORDER.filter((b) => b !== "overdue").map((bucket) => {
                const xs = grouped[bucket];
                if (!xs.length) return null;
                const isCollapsed = collapsed.has(bucket);
                const Icon = BUCKET_ICON[bucket];
                return (
                  <div key={bucket} className="space-y-3">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(bucket)}
                      className="w-full flex items-center gap-2.5 select-none text-left hover:opacity-80 transition-opacity"
                    >
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 text-muted-foreground transition-transform",
                          isCollapsed && "-rotate-90"
                        )}
                      />
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          bucket === "today" && "text-primary",
                          bucket === "this-week" && "text-orange-500",
                          bucket === "later" && "text-muted-foreground",
                          bucket === "none" && "text-muted-foreground"
                        )}
                      />
                      <span
                        className={cn(
                          "text-sm font-semibold tracking-tight",
                          bucket === "today" && "text-primary",
                          bucket === "this-week" && "text-orange-600 dark:text-orange-400"
                        )}
                      >
                        {t(bucket === "this-week" ? "bucket.thisWeek" : `bucket.${bucket}`)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted/60">
                        {xs.length}
                      </span>
                      <div className="flex-1 h-px bg-border ml-2" />
                    </button>
                    <div
                      className={cn(
                        "cm-collapse",
                        !isCollapsed && "is-open"
                      )}
                    >
                      <div>
                        <div className="space-y-2">
                          {xs.map((task, i) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              index={i}
                              parent={task.parentId ? taskById.get(task.parentId) : undefined}
                              onHomework={() => setHomeworkParentId(task.id)}
                              onTagClick={setActiveTag}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}

/* Tag filter chip strip — collapses to first 5 + "+N more" toggle when
   the user has many tags. Active tag always renders first. Power users
   running #lich-hoc + #bai-tap + #thi + ~6 subject codes were seeing
   3+ wrapped rows of chips before this collapsed view. */
function TagFilterStrip({
  stats,
  active,
  onPick,
}: {
  stats: Array<{ name: string; count: number; openCount: number }>;
  active: string | null;
  onPick: (t: string | null) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const VISIBLE = 5;
  // Active tag always shows; otherwise top by openCount.
  const ordered = [...stats].sort((a, b) => {
    if (a.name === active) return -1;
    if (b.name === active) return 1;
    return (b.openCount || b.count) - (a.openCount || a.count);
  });
  const visible = expanded ? ordered : ordered.slice(0, VISIBLE);
  const hidden = ordered.length - visible.length;
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1 inline-flex items-center gap-1">
        <Hash className="h-3 w-3" /> {t("palette.tags")}
      </span>
      {visible.map((s) => {
        const isActive = active === s.name;
        return (
          <button
            key={s.name}
            onClick={() => onPick(isActive ? null : s.name)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            )}
          >
            #{s.name}
            {isActive ? (
              <X className="h-3 w-3" />
            ) : (
              <span className="text-[10px] tabular-nums opacity-60">
                {s.openCount || s.count}
              </span>
            )}
          </button>
        );
      })}
      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          + {hidden}
        </button>
      )}
      {expanded && stats.length > VISIBLE && (
        <button
          onClick={() => setExpanded(false)}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("common.collapse")}
        </button>
      )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof ListTodo;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-active={active}
      onClick={onClick}
      className="cm-seg-item cm-press"
    >
      <Icon className={cn("h-4 w-4 transition-transform duration-200", active && "scale-110")} />
      {label}
      <span
        key={count}
        className={cn(
          "cm-count-pop text-[10px] tabular-nums px-1.5 rounded-full transition-colors",
          active ? "bg-primary/15 text-primary" : "opacity-60"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function TodayClassesStrip({ tasks, onSwitch }: { tasks: Task[]; onSwitch: () => void }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center gap-3 flex-wrap">
      <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
        <GraduationCap className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
        <span className="text-sm font-semibold text-primary">
          {t("tasks.todayClasses", { n: tasks.length })}
        </span>
        {tasks.map((task) => {
          const c = subjectColor(task.title);
          const hh = task.deadline ? new Date(task.deadline).getHours().toString().padStart(2, "0") : "";
          const mm = task.deadline ? new Date(task.deadline).getMinutes().toString().padStart(2, "0") : "";
          return (
            <span
              key={task.id}
              className={cn("inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border", c.border, c.bg, c.text)}
            >
              <span className="tabular-nums font-medium">{hh}:{mm}</span>
              <span className="font-semibold">{task.title}</span>
              {task.location && <span className="opacity-70">· {task.location}</span>}
            </span>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onSwitch}
        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 shrink-0"
      >
        {t("tasks.viewSchedule.link")} <ChevronDown className="h-3 w-3 -rotate-90" />
      </button>
    </div>
  );
}

function SubjectGroup({
  title,
  instances,
  taskById,
  onTagClick,
}: {
  title: string;
  instances: Task[];
  taskById: Map<string, Task>;
  onTagClick?: (tag: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = useT();
  const color = subjectColor(title);
  const next = instances.find((x) => x.status !== "done") || instances[0];
  // Tóm tắt: thứ + giờ + ngày của buổi kế tiếp. DOW pulled from i18n so
  // the label follows the app language toggle (was hardcoded VN).
  const summary = (() => {
    if (!next?.deadline) return null;
    const d = new Date(next.deadline);
    const dow = t(DOW_KEYS_SUN_FIRST[d.getDay()] ?? "review.dow.sun");
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    const dd = d.getDate().toString().padStart(2, "0");
    const mo = (d.getMonth() + 1).toString().padStart(2, "0");
    return `${dow} · ${hh}:${mm} · ${dd}/${mo}`;
  })();

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", color.border)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/40 transition-colors"
      >
        <span className={cn("h-9 w-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0", color.bg, color.text)}>
          {title.slice(0, 3)}
        </span>
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold leading-tight", color.text)}>{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {t("tasks.nextOccurrence", { label: summary || "—" })}
            {next?.location && <span className="ml-1.5 inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{next.location}</span>}
          </p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums px-2 py-0.5 rounded bg-muted/60 shrink-0">
          {t("tasks.subjectSessions", { n: instances.length })}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", !expanded && "-rotate-90")} />
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t bg-muted/10">
          {instances.map((inst) => (
            <TaskRow
              key={inst.id}
              task={inst}
              parent={inst.parentId ? taskById.get(inst.parentId) : undefined}
              onTagClick={onTagClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OverdueAlert({
  tasks,
  recurringCount,
  onRollForward,
  taskById,
  onHomework,
  onTagClick,
}: {
  tasks: Task[];
  recurringCount: number;
  onRollForward: () => void;
  taskById: Map<string, Task>;
  onHomework: (id: string) => void;
  onTagClick?: (tag: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = useT();
  const notDone = tasks.filter((task) => task.status !== "done").length;
  const showCount = notDone || tasks.length;
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-destructive/10 transition-colors rounded-xl"
      >
        <div className="h-9 w-9 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-destructive">
            {t("tasks.overdueTitle", { n: showCount })}
          </p>
          <p className="text-xs text-muted-foreground">
            {recurringCount > 0
              ? t("tasks.overdueHintRecurring", { n: recurringCount })
              : t("tasks.overdueHintGeneric")}
          </p>
        </div>
        {recurringCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onRollForward();
            }}
            className="h-8 gap-1.5 shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <AlarmClock className="h-3.5 w-3.5" />
            {t("tasks.rollForward")}
          </Button>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform shrink-0",
            !expanded && "-rotate-90"
          )}
        />
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-destructive/20 pt-3">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              parent={task.parentId ? taskById.get(task.parentId) : undefined}
              onHomework={() => onHomework(task.id)}
              onTagClick={onTagClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// re-export for type narrowing reuse if needed
export type { Filter as TaskFilter };
