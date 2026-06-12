import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTickingNow } from "@/lib/use-ticking-now";
import { useTasks, type Task, type TaskStatus } from "@/hooks/use-tasks";
import { useTaskCommands } from "@/components/task-commands";
import { useToast } from "@/components/toast";
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
} from "lucide-react";
import { QuickCapture } from "@/components/quick-capture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HomeworkDialog } from "@/components/homework-dialog";
import {
  formatDeadline,
  groupByBucket,
  BUCKET_LABEL,
  BUCKET_ORDER,
  bucketByDate,
  subjectColor,
  tagStats,
  type DateBucket,
} from "@/lib/utils";
import { cn } from "@/lib/utils";

type Filter = "all" | "todo" | "done";
type SortMode = "deadline" | "priority" | "recent";

const SORT_LABEL: Record<SortMode, string> = {
  deadline: "Deadline",
  priority: "Ưu tiên",
  recent: "Mới nhất",
};

const SORT_STORAGE_KEY = "clearmind_tasks_sort";
const COLLAPSED_STORAGE_KEY = "clearmind_tasks_collapsed";

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
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`Status: ${status}`}
      className={cn(
        "h-5 w-5 rounded-full border-2 mt-0.5 shrink-0 transition-all relative",
        status === "todo" && "border-primary/50 hover:border-primary",
        status === "in-progress" &&
          "border-orange-500 bg-gradient-to-r from-orange-500 to-orange-500/0 from-50% to-50%",
        status === "done" && "border-primary bg-primary"
      )}
    >
      {status === "done" && (
        <CheckCircle2 className="absolute inset-0 m-auto h-3 w-3 text-primary-foreground" />
      )}
    </button>
  );
}

const DAY_MS = 24 * 60 * 60_000;

function TaskRow({
  task,
  parent,
  onHomework,
  onTagClick,
}: {
  task: Task;
  parent?: Task;
  onHomework?: () => void;
  onTagClick?: (tag: string) => void;
}) {
  const { cycleStatus, removeTask, snoozeTask } = useTasks();
  const { openEdit } = useTaskCommands();
  const { toast } = useToast();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const { restore } = removeTask(task.id);
    toast({
      title: "Đã xoá task",
      description: task.title,
      action: { label: "Hoàn tác", onClick: restore },
    });
  };

  const handleSnooze = (deltaMs: number, label: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    snoozeTask(task.id, deltaMs);
    toast({
      title: `Đẩy lùi · ${label}`,
      description: task.title,
      variant: "success",
    });
  };

  const isAcademic = task.type === "academic";
  const accent = isAcademic ? subjectColor(task.title) : null;

  return (
    <div
      onClick={() => openEdit(task.id)}
      className={cn(
        "group relative flex items-center justify-between gap-3 px-3.5 py-2.5 pl-4 rounded-lg border bg-background/50 hover:bg-accent/60 cursor-pointer transition-all duration-200 overflow-hidden",
        task.priority === "high" &&
          task.status !== "done" &&
          "border-destructive/30 bg-destructive/5 hover:bg-destructive/10"
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
              Bài tập · {parent.title}
            </p>
          )}
          <p
            className={cn(
              "text-sm font-medium leading-tight truncate",
              task.status === "done" && "line-through text-muted-foreground"
            )}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs">
            {task.priority === "high" && task.status !== "done" && (
              <span className="font-semibold px-1.5 py-0.5 rounded-md bg-destructive/15 text-destructive inline-flex items-center gap-1">
                <Flame className="h-3 w-3" /> Gấp
              </span>
            )}
            {task.deadline && (
              <span className="font-medium text-primary tabular-nums">
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
                title={`Lặp ${task.recurrence}${task.notify ? ` · nhắc ${task.notify}` : ""}`}
              >
                <Repeat className="h-3 w-3" />
              </span>
            )}
            {task.notify && !task.recurrence && (
              <span
                className="text-muted-foreground inline-flex items-center"
                title={`Nhắc trước: ${task.notify}`}
              >
                <Bell className="h-3 w-3" />
              </span>
            )}
            {(task.pomodoroMinutes || 0) > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 tabular-nums">
                <Hourglass className="h-3 w-3" /> {task.pomodoroMinutes}m
              </span>
            )}
            {task.tags?.slice(0, 2).map((t) => (
              <button
                key={t}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(t);
                }}
                className="font-medium px-1.5 py-0 rounded text-primary/80 hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                title={`Lọc theo #${t}`}
              >
                #{t}
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
                title={task.tags!.slice(2).map((t) => `#${t}`).join(" ")}
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
              size="icon"
              onClick={handleSnooze(DAY_MS, "+1 ngày")}
              className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
              title="Đẩy lùi 1 ngày"
            >
              <Clock4 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSnooze(7 * DAY_MS, "+1 tuần")}
              className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
              title="Đẩy lùi 1 tuần"
            >
              <CalendarClock className="h-4 w-4" />
            </Button>
          </>
        )}
        {onHomework && task.type === "academic" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onHomework();
            }}
            className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
            title="Thêm bài tập"
          >
            <BookOpen className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          className="text-muted-foreground hover:text-destructive"
          title="Xoá"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function TasksPage() {
  const { tasks, rollForwardOverdueRecurring, clearDuplicates } = useTasks();
  const { toast } = useToast();
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

  const taskById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const homeworkParent = homeworkParentId ? taskById.get(homeworkParentId) : null;

  const filtered = useMemo(() => {
    let xs = tasks;
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
  }, [tasks, filter, query, activeTag]);

  const grouped = useMemo(() => {
    const g = groupByBucket(filtered);
    if (sortMode === "deadline") return g; // groupByBucket already sorts by deadline asc
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
      title:
        moved > 0
          ? `Đẩy ${moved} task lặp lại lên buổi tiếp theo`
          : "Không có task lặp lại nào quá hạn",
      description:
        moved > 0 && dupesLikely
          ? "Có thể có task trùng — bấm dọn dẹp để gộp."
          : undefined,
      variant: moved > 0 ? "success" : "default",
      action:
        moved > 0
          ? dupesLikely
            ? { label: "Dọn trùng", onClick: handleClearDuplicates }
            : { label: "Hoàn tác", onClick: restore }
          : undefined,
    });
  };

  const handleClearDuplicates = () => {
    const { removed, restore } = clearDuplicates();
    toast({
      title: removed > 0 ? `Đã xoá ${removed} task trùng lặp` : "Không có task trùng",
      variant: removed > 0 ? "success" : "default",
      action: removed > 0 ? { label: "Hoàn tác", onClick: restore } : undefined,
    });
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">All Tasks</h2>
          <p className="text-muted-foreground mt-1">
            {filtered.length} task{filtered.length === 1 ? "" : "s"} · grouped by deadline
          </p>
        </div>
        <QuickCapture />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
          className="rounded-full gap-1.5"
        >
          All Tasks
          <span className="text-[10px] tabular-nums opacity-70">
            {filterCounts.all}
          </span>
        </Button>
        <Button
          variant={filter === "todo" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("todo")}
          className="rounded-full gap-1.5"
        >
          <ListTodo className="h-4 w-4" /> To Do
          <span className="text-[10px] tabular-nums opacity-70">
            {filterCounts.todo}
          </span>
        </Button>
        <Button
          variant={filter === "done" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("done")}
          className="rounded-full gap-1.5"
        >
          <CheckCircle2 className="h-4 w-4" /> Done
          <span className="text-[10px] tabular-nums opacity-70">
            {filterCounts.done}
          </span>
        </Button>

        <div className="relative ml-auto w-full sm:w-[260px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo title, tag, phòng…"
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

      {/* Tag chip row — appears only when there are tags to filter by */}
      {allTagStats.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1 inline-flex items-center gap-1">
            <Hash className="h-3 w-3" /> Tags
          </span>
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2.5 py-1 font-medium hover:bg-primary/90 transition-colors"
            >
              #{activeTag}
              <X className="h-3 w-3" />
            </button>
          )}
          {allTagStats
            .filter((s) => s.name !== activeTag)
            .map((s) => (
              <button
                key={s.name}
                onClick={() => setActiveTag(s.name)}
                className="inline-flex items-center gap-1 rounded-full border bg-background hover:border-primary/40 hover:bg-primary/5 hover:text-primary px-2.5 py-1 font-medium text-muted-foreground transition-colors"
              >
                #{s.name}
                <span className="text-[10px] tabular-nums opacity-60">
                  {s.openCount || s.count}
                </span>
              </button>
            ))}
        </div>
      )}

      {/* Bulk-action toolbar + sort */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearDuplicates}
          className="h-8 gap-1.5"
          title="Tìm task có cùng title + giờ + dow và giữ bản mới nhất"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Xoá trùng lặp
        </Button>

        <div className="ml-auto relative inline-flex items-center">
          <ArrowUpDown className="absolute left-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="h-8 pl-7 pr-7 rounded-md border border-input bg-background text-xs shadow-xs appearance-none cursor-pointer outline-none transition-[color,box-shadow] hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            title="Sắp xếp trong mỗi nhóm"
          >
            {(Object.keys(SORT_LABEL) as SortMode[]).map((m) => (
              <option key={m} value={m}>
                {SORT_LABEL[m]}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {homeworkParent && (
        <HomeworkDialog
          parentTask={homeworkParent}
          open
          onOpenChange={(b) => !b && setHomeworkParentId(null)}
        />
      )}

      <div className="flex-1 overflow-y-auto space-y-4">
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

        <Card className="border-primary/10 shadow-sm bg-card min-h-[400px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Your Tasks
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
                      Không có task nào gắn #{activeTag}{filter === "todo" ? " còn mở" : ""}.
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setActiveTag(null)}
                      className="text-xs h-auto p-0"
                    >
                      Bỏ lọc tag
                    </Button>
                  </>
                ) : query ? (
                  <>
                    <p className="font-medium">
                      Không thấy task nào khớp "{query}"
                    </p>
                    <p className="text-xs">
                      Thử bỏ filter hoặc tìm từ khoá khác.
                    </p>
                  </>
                ) : grouped.overdue.length > 0 ? (
                  <>
                    <p className="font-medium">
                      Chỉ còn task quá hạn — xem khung đỏ ở trên.
                    </p>
                    <p className="text-xs">
                      Bấm "Đẩy → buổi tiếp" để chuyển sang tuần tới.
                    </p>
                  </>
                ) : filter === "todo" ? (
                  <>
                    <p className="text-3xl">🎉</p>
                    <p className="font-medium">Inbox zero — không còn task nào!</p>
                    <p className="text-xs">Tạo task mới bằng Quick Capture ở trên.</p>
                  </>
                ) : filter === "done" ? (
                  <>
                    <p className="font-medium">Chưa có task nào hoàn thành.</p>
                    <p className="text-xs">Tick task xong sẽ hiện ở đây.</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Welcome 👋</p>
                    <p className="text-xs">
                      Bắt đầu bằng Quick Capture, hoặc import lịch học từ trang trường.
                    </p>
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
                        {BUCKET_LABEL[bucket]}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted/60">
                        {xs.length}
                      </span>
                      <div className="flex-1 h-px bg-border ml-2" />
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-2">
                        {xs.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            parent={task.parentId ? taskById.get(task.parentId) : undefined}
                            onHomework={() => setHomeworkParentId(task.id)}
                            onTagClick={setActiveTag}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
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
  const notDone = tasks.filter((t) => t.status !== "done").length;
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
            {showCount} task quá hạn
          </p>
          <p className="text-xs text-muted-foreground">
            {recurringCount > 0
              ? `${recurringCount} task lặp lại có thể tự đẩy lên buổi tiếp theo.`
              : "Snooze hoặc xoá để dọn dẹp."}
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
            Đẩy → buổi tiếp
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
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              parent={t.parentId ? taskById.get(t.parentId) : undefined}
              onHomework={() => onHomework(t.id)}
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
// keep imports clean
void bucketByDate;
