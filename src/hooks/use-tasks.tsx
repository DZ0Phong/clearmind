/* eslint-disable react-refresh/only-export-components */
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  createContext,
  useContext,
} from "react";
import { isCliMode, cliFetchTasks, cliPutTasks, cliMigrate, inlineTasks, inlineMtime } from "@/lib/cli-bridge";

export type TaskType = "academic" | "personal" | "work" | "other";
export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "in-progress" | "done";
export type RecurrenceRule = "daily" | "weekday" | "weekly" | "monthly";
export type ReminderPref = "at-time" | "5m" | "15m" | "1h" | "1d";

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  deadline?: string;
  location?: string;
  tags?: string[];
  parentId?: string | null;
  recurrence?: RecurrenceRule | null;
  /** Optional end-date (ISO) for recurrence — e.g. end of semester. Stops spawning when next > end. */
  recurrenceEndAt?: string | null;
  notify?: ReminderPref | null;
  pomodoroMinutes?: number;
  createdAt: string;
  completedAt?: string;
}

export interface ExportShape {
  version: 2;
  exportedAt: string;
  tasks: Task[];
}

interface TasksContextType {
  tasks: Task[];
  addTask: (
    task: Omit<Task, "id" | "createdAt" | "status"> & { status?: TaskStatus }
  ) => string;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
  cycleStatus: (id: string) => void;
  updateTask: (id: string, updates: Partial<Omit<Task, "id">>) => void;
  removeTask: (id: string) => { restore: () => void };
  snoozeTask: (id: string, deltaMs: number) => void;
  clearAll: () => void;
  exportJson: () => string;
  importJson: (raw: string) => { ok: boolean; added: number; error?: string };
  incrementPomodoro: (id: string, minutes: number) => void;
  /** Roll any overdue recurring weekly task to its next future occurrence.
   *  Returns { moved, restore } for an undoable toast. */
  rollForwardOverdueRecurring: () => { moved: number; restore: () => void };
  /** Dedupe tasks sharing the same signature (title+dow+startTime+location+recurrence).
   *  Keeps the newest createdAt. Returns { removed, restore } for undo. */
  clearDuplicates: () => {
    removed: number;
    removedNames: string[];
    restore: () => void;
  };
  notificationsEnabled: boolean;
  requestNotifications: () => Promise<boolean>;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

const STORAGE_KEY = "clearmind_tasks";

function nextRecurrence(deadline: string, rule: RecurrenceRule): string {
  const d = new Date(deadline);
  if (rule === "daily") d.setDate(d.getDate() + 1);
  else if (rule === "weekday") {
    do d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6);
  } else if (rule === "weekly") d.setDate(d.getDate() + 7);
  else if (rule === "monthly") d.setMonth(d.getMonth() + 1);
  return deadline.includes("T") ? d.toISOString() : d.toISOString().slice(0, 10);
}

// Detect whether a future-week instance of this recurring task already
// exists. Prevents the complete-flow from spawning a duplicate when the
// user has already imported next week's schedule manually.
function nextInstanceAlreadyExists(
  prev: Task[],
  target: Task,
  nextDeadline: string
): boolean {
  const nextD = new Date(nextDeadline);
  if (Number.isNaN(nextD.getTime())) return false;
  const nextYmd = nextDeadline.slice(0, 10);
  const nextHh = nextD.getHours().toString().padStart(2, "0");
  const nextMm = nextD.getMinutes().toString().padStart(2, "0");
  const targetTitle = target.title.trim().toLowerCase();
  // Location matters: two lectures of the same subject can legitimately
  // share dow + time across different rooms (lab + theory). Without this
  // check, the spawn-next-occurrence flow used to skip creating one of
  // them under the assumption the other was "already" there.
  const targetLoc = (target.location || "").trim().toLowerCase();
  return prev.some((t) => {
    if (t.id === target.id) return false;
    if (t.recurrence !== target.recurrence) return false;
    if (!t.deadline) return false;
    if (t.title.trim().toLowerCase() !== targetTitle) return false;
    if (t.deadline.slice(0, 10) !== nextYmd) return false;
    if ((t.location || "").trim().toLowerCase() !== targetLoc) return false;
    const td = new Date(t.deadline);
    if (Number.isNaN(td.getTime())) return false;
    const hh = td.getHours().toString().padStart(2, "0");
    const mm = td.getMinutes().toString().padStart(2, "0");
    return hh === nextHh && mm === nextMm;
  });
}

function reminderOffsetMs(pref: ReminderPref): number {
  switch (pref) {
    case "at-time":
      return 0;
    case "5m":
      return 5 * 60_000;
    case "15m":
      return 15 * 60_000;
    case "1h":
      return 60 * 60_000;
    case "1d":
      return 24 * 60 * 60_000;
  }
}

type LoadState = "loading" | "loaded" | "error";

export function TasksProvider({ children }: { children: React.ReactNode }) {
  // Hydrate from the inline payload injected by the CLI server (if any).
  // This makes first paint render real tasks — no fetch round-trip needed.
  const hydrated = isCliMode() ? inlineTasks() : null;
  const [tasks, setTasks] = useState<Task[]>(hydrated ?? []);
  // CRITICAL: guard against the data-wipe bug. We MUST NOT save until the
  // store is known-good. With inline hydration we start "loaded" instantly;
  // otherwise we wait for the fetch (or localStorage read) to succeed.
  const [loadState, setLoadState] = useState<LoadState>(hydrated ? "loaded" : "loading");
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );
  const timersRef = useRef<Map<string, number>>(new Map());
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;
  // Last serialized snapshot we know is on disk. We skip PUTs when current
  // tasks already match this — prevents a no-op flush after initial load
  // from overwriting the file with a possibly-different shape.
  const lastSyncedRef = useRef<string | null>(null);
  // Version stamp từ server. SSE event nào có mtime ≤ này thì bỏ qua (stale).
  const lastMtimeRef = useRef<number>(0);
  const cli = isCliMode();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cli) {
        // Fast path: inline payload hydrated trong useState init. Set ref +
        // chạy migration nếu có. SSE effect bên dưới sẽ tự reconcile nếu
        // inline stale (vd vừa F5 lúc PUT chưa landed).
        const inline = inlineTasks();
        if (inline) {
          lastSyncedRef.current = JSON.stringify(inline);
          lastMtimeRef.current = inlineMtime();
          const local = localStorage.getItem(STORAGE_KEY);
          if (local && inline.length === 0) {
            try {
              const parsed = JSON.parse(local);
              const localTasks: Task[] = Array.isArray(parsed) ? parsed : [];
              if (localTasks.length) {
                await cliMigrate(localTasks);
                const { tasks: after, mtimeMs } = await cliFetchTasks();
                if (after.length >= localTasks.length) {
                  localStorage.setItem(STORAGE_KEY + "_legacy", local);
                  localStorage.removeItem(STORAGE_KEY);
                  if (!cancelled) {
                    setTasks(after);
                    lastSyncedRef.current = JSON.stringify(after);
                    lastMtimeRef.current = mtimeMs;
                  }
                }
              }
            } catch (e) {
              console.warn("[clearmind] localStorage migration skipped:", e);
            }
          }
          return;
        }

        // Slow path (no inline marker — shouldn't happen in CLI mode).
        try {
          const { tasks: serverTasks, mtimeMs } = await cliFetchTasks();
          if (!cancelled) {
            setTasks(serverTasks);
            lastSyncedRef.current = JSON.stringify(serverTasks);
            lastMtimeRef.current = mtimeMs;
            setLoadState("loaded");
          }
        } catch (e) {
          console.error("[clearmind] CLI initial fetch FAILED:", e);
          if (!cancelled) setLoadState("error");
        }
      } else {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && !cancelled) setTasks(parsed);
          } catch (e) {
            console.error("Failed to parse tasks", e);
          }
        }
        if (!cancelled) {
          lastSyncedRef.current = saved ?? "[]";
          setLoadState("loaded");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [cli]);

  // Real-time sync qua Server-Sent Events. Server push mọi thay đổi tasks
  // tới mọi client kết nối — không cần poll, không cần focus. EventSource
  // tự reconnect khi server restart hoặc network blip.
  useEffect(() => {
    if (!cli) return;
    const es = new EventSource("/api/events");

    const applyServer = (incoming: Task[], mtimeMs: number) => {
      // mtime=0 sentinel ('no data yet'): server emits 0 when the data
      // file doesn't exist yet. AFTER we've successfully synced once
      // (lastMtimeRef > 0), a fresh 0 means stale/buggy — never apply,
      // it would silently wipe in-memory edits.
      if (mtimeMs === 0 && lastMtimeRef.current > 0) return;
      // Bỏ qua nếu version cũ hơn cái ta đang có (chống echo lệch order).
      if (mtimeMs > 0 && mtimeMs < lastMtimeRef.current) return;
      const serialized = JSON.stringify(incoming);
      // Echo của chính ta vừa PUT → chỉ cập nhật mtime, không re-render.
      if (serialized === lastSyncedRef.current) {
        if (mtimeMs > lastMtimeRef.current) lastMtimeRef.current = mtimeMs;
        return;
      }
      // Có edit chưa save? Drop event NHƯNG warn + lưu payload trong window
      // global để debug. Audit flagged this as critical: nếu tab khác edit
      // task khác trong cùng debounce window (80ms), edit đó có thể mất vì
      // PUT là full-array replace (last-write-wins). Full merge cần per-task
      // version + diff — defer. Console warning ít nhất giúp tracer được
      // payload bị mất từ devtools.
      if (lastSyncedRef.current !== JSON.stringify(tasksRef.current)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__CLEARMIND_DROPPED_SSE__ = { tasks: incoming, mtimeMs, at: Date.now() };
        console.warn(
          "[clearmind] SSE update dropped — local has uncommitted edits. " +
            "If another tab edited the SAME 80ms window, that edit may be lost. " +
            "Payload stashed at window.__CLEARMIND_DROPPED_SSE__."
        );
        return;
      }
      setTasks(incoming);
      lastSyncedRef.current = serialized;
      lastMtimeRef.current = mtimeMs;
    };

    // Both handlers wrap JSON.parse in try/catch — a malformed SSE
    // event (network corruption, future protocol change) shouldn't
    // bubble as Uncaught and pollute the global error log.
    es.addEventListener("snapshot", (ev) => {
      try {
        const { tasks: t, mtimeMs } = JSON.parse((ev as MessageEvent).data);
        applyServer(t, mtimeMs);
      } catch (e) {
        console.warn("[clearmind] SSE snapshot parse failed:", e);
      }
    });
    es.addEventListener("tasks-updated", (ev) => {
      try {
        const { tasks: t, mtimeMs } = JSON.parse((ev as MessageEvent).data);
        applyServer(t, mtimeMs);
      } catch (e) {
        console.warn("[clearmind] SSE tasks-updated parse failed:", e);
      }
    });

    return () => es.close();
  }, [cli]);

  // Persist on change. Only fires when the initial load succeeded AND the
  // current snapshot actually differs from what we last persisted.
  useEffect(() => {
    if (loadState !== "loaded") return;
    const serialized = JSON.stringify(tasks);
    if (serialized === lastSyncedRef.current) return; // no-op — nothing to save

    if (!cli) {
      localStorage.setItem(STORAGE_KEY, serialized);
      lastSyncedRef.current = serialized;
      return;
    }
    // Debounce ngắn (80ms) — coalesce rapid edits trong cùng tick, nhưng
    // window race với F5/unload nhỏ. keepalive trong cliPutTasks lo phần
    // còn lại nếu user navigate giữa chừng.
    const handle = window.setTimeout(async () => {
      try {
        const mtimeMs = await cliPutTasks(tasks);
        lastSyncedRef.current = serialized;
        if (mtimeMs > lastMtimeRef.current) lastMtimeRef.current = mtimeMs;
      } catch (e) {
        console.warn("[clearmind] PUT /api/tasks failed:", e);
      }
    }, 80);
    return () => window.clearTimeout(handle);
  }, [tasks, loadState, cli]);

  // Flush pending edits on page unload — but ONLY if dirty AND loaded.
  // `keepalive: true` lets the request finish after the document is gone.
  useEffect(() => {
    if (!cli) return;
    const handler = () => {
      if (loadState !== "loaded") return;
      const serialized = JSON.stringify(tasksRef.current);
      if (serialized === lastSyncedRef.current) return;
      try {
        fetch("/api/tasks", {
          method: "PUT",
          body: JSON.stringify({ tasks: tasksRef.current }),
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        });
      } catch (_) { /* best-effort */ }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [cli, loadState]);

  // Fallback refetch khi focus/online — SSE thường lo việc này, nhưng nếu
  // EventSource bị block (extension, proxy, etc) thì đây là safety net.
  useEffect(() => {
    if (!cli) return;
    if (loadState !== "loaded") return;

    let inFlight = false;
    const refetch = async () => {
      if (inFlight) return;
      if (JSON.stringify(tasksRef.current) !== lastSyncedRef.current) return;
      inFlight = true;
      try {
        const { tasks: server, mtimeMs } = await cliFetchTasks();
        if (mtimeMs > 0 && mtimeMs <= lastMtimeRef.current) return;
        const serialized = JSON.stringify(server);
        if (serialized !== lastSyncedRef.current) {
          setTasks(server);
          lastSyncedRef.current = serialized;
          lastMtimeRef.current = mtimeMs;
        }
      } catch (_) {}
      finally { inFlight = false; }
    };

    const onFocus = () => refetch();
    const onVisible = () => { if (document.visibilityState === "visible") refetch(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onFocus);
    window.addEventListener("pageshow", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("pageshow", onFocus);
    };
  }, [cli, loadState]);

  // Schedule local Notifications for tasks with notify + future deadline within 24h.
  // In CLI mode the Node server fires native OS toasts instead — running both
  // would double-fire, so we skip the browser side entirely.
  useEffect(() => {
    if (cli) return;
    if (!notificationsEnabled) return;
    const timers = timersRef.current;
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();

    const now = Date.now();
    for (const t of tasks) {
      if (!t.notify || !t.deadline || t.status === "done") continue;
      const target = new Date(t.deadline).getTime() - reminderOffsetMs(t.notify);
      const delay = target - now;
      if (delay > 0 && delay < 24 * 60 * 60_000) {
        const handle = window.setTimeout(() => {
          try {
            // Resolve lang at fire time — user may have flipped EN/VI
            // between scheduling and firing.
            const lang =
              typeof localStorage !== "undefined" &&
              localStorage.getItem("clearmind_lang") === "en"
                ? "en"
                : "vi";
            const fallbackBody =
              lang === "en" ? "Deadline approaching." : "Deadline đang tới.";
            new Notification("Clearmind · " + t.title, {
              body: t.description || fallbackBody,
              tag: "clearmind-" + t.id,
            });
          } catch (e) {
            console.warn("Notification failed", e);
          }
        }, delay);
        timers.set(t.id, handle);
      }
    }
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, [tasks, notificationsEnabled, cli]);

  const addTask: TasksContextType["addTask"] = useCallback((t) => {
    const id = crypto.randomUUID();
    setTasks((prev) => [
      {
        status: "todo",
        ...t,
        id,
        createdAt: new Date().toISOString(),
      } as Task,
      ...prev,
    ]);
    return id;
  }, []);

  const updateTaskStatus = useCallback((id: string, status: TaskStatus) => {
    setTasks((prev) => {
      const target = prev.find((t) => t.id === id);
      if (!target) return prev;
      const justCompleted = status === "done" && target.status !== "done";
      const next = prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              completedAt: justCompleted
                ? new Date().toISOString()
                : t.completedAt,
            }
          : t
      );
      // recurrence: spawn a new occurrence (unless past recurrenceEndAt
      // OR the next instance was already created — e.g. via a fresh import)
      if (justCompleted && target.recurrence && target.deadline) {
        const nextDeadline = nextRecurrence(target.deadline, target.recurrence);
        const stopBy = target.recurrenceEndAt
          ? new Date(target.recurrenceEndAt).getTime()
          : Number.POSITIVE_INFINITY;
        if (
          new Date(nextDeadline).getTime() <= stopBy &&
          !nextInstanceAlreadyExists(prev, target, nextDeadline)
        ) {
          const spawn: Task = {
            ...target,
            id: crypto.randomUUID(),
            status: "todo",
            deadline: nextDeadline,
            createdAt: new Date().toISOString(),
            completedAt: undefined,
            pomodoroMinutes: 0,
          };
          return [spawn, ...next];
        }
      }
      return next;
    });
  }, []);

  const cycleStatus = useCallback((id: string) => {
    setTasks((prev) => {
      const target = prev.find((t) => t.id === id);
      if (!target) return prev;
      const order: TaskStatus[] = ["todo", "in-progress", "done"];
      const next = order[(order.indexOf(target.status) + 1) % order.length];
      const justCompleted = next === "done" && target.status !== "done";
      const updated = prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: next,
              completedAt: justCompleted
                ? new Date().toISOString()
                : t.completedAt,
            }
          : t
      );
      if (justCompleted && target.recurrence && target.deadline) {
        const nextDeadline = nextRecurrence(target.deadline, target.recurrence);
        const stopBy = target.recurrenceEndAt
          ? new Date(target.recurrenceEndAt).getTime()
          : Number.POSITIVE_INFINITY;
        if (
          new Date(nextDeadline).getTime() <= stopBy &&
          !nextInstanceAlreadyExists(prev, target, nextDeadline)
        ) {
          const spawn: Task = {
            ...target,
            id: crypto.randomUUID(),
            status: "todo",
            deadline: nextDeadline,
            createdAt: new Date().toISOString(),
            completedAt: undefined,
            pomodoroMinutes: 0,
          };
          return [spawn, ...updated];
        }
      }
      return updated;
    });
  }, []);

  const updateTask = useCallback(
    (id: string, updates: Partial<Omit<Task, "id">>) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    },
    []
  );

  const removeTask = useCallback((id: string) => {
    let snapshot: Task[] | null = null;
    setTasks((prev) => {
      snapshot = prev;
      return prev.filter((t) => t.id !== id);
    });
    return {
      restore: () => {
        if (snapshot) setTasks(snapshot);
      },
    };
  }, []);

  const snoozeTask = useCallback((id: string, deltaMs: number) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const base = t.deadline ? new Date(t.deadline) : new Date();
        const shifted = new Date(base.getTime() + deltaMs);
        const hadTime = !t.deadline || t.deadline.includes("T");
        return {
          ...t,
          deadline: hadTime
            ? shifted.toISOString()
            : `${shifted.getFullYear()}-${(shifted.getMonth() + 1)
                .toString()
                .padStart(2, "0")}-${shifted.getDate().toString().padStart(2, "0")}`,
        };
      })
    );
  }, []);

  const clearAll = useCallback(() => setTasks([]), []);

  const rollForwardOverdueRecurring = useCallback(() => {
    let snapshot: Task[] | null = null;
    let moved = 0;
    setTasks((prev) => {
      snapshot = prev;
      const now = Date.now();
      return prev.map((t) => {
        if (!t.recurrence || !t.deadline || t.status === "done") return t;
        let next = t.deadline;
        let target = new Date(next).getTime();
        if (target >= now) return t;
        let safety = 200; // bound the loop
        while (target < now && safety-- > 0) {
          next = nextRecurrence(next, t.recurrence);
          target = new Date(next).getTime();
        }
        if (t.recurrenceEndAt && target > new Date(t.recurrenceEndAt).getTime()) {
          // Past semester end — leave it for the user to delete manually.
          return t;
        }
        moved++;
        return { ...t, deadline: next };
      });
    });
    return {
      moved,
      restore: () => {
        if (snapshot) setTasks(snapshot);
      },
    };
  }, []);

  const clearDuplicates = useCallback(() => {
    // Read snapshot via the ref so this works whether the caller is in an
    // event handler (where setState updaters run sync) or in useEffect
    // (where they're deferred). The previous form populated `snapshot`
    // inside the setTasks updater and returned it from the outer scope —
    // outside event handlers that closure was still null when `restore`
    // got captured, so Undo silently no-op'd.
    const snapshot = tasksRef.current;
    const sig = (t: Task): string | null => {
      if (!t.recurrence || !t.deadline) return null;
      const d = new Date(t.deadline);
      if (Number.isNaN(d.getTime())) return null;
      const dow = d.getDay();
      const hh = d.getHours().toString().padStart(2, "0");
      const mm = d.getMinutes().toString().padStart(2, "0");
      const title = t.title.trim().toLowerCase();
      const loc = (t.location || "").trim().toLowerCase();
      return `${t.recurrence}|${dow}|${hh}:${mm}|${title}|${loc}`;
    };
    // Newest-first ordering so we keep the latest createdAt per signature.
    const sorted = [...snapshot].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    const seen = new Set<string>();
    const keepIds = new Set<string>();
    for (const t of sorted) {
      const k = sig(t);
      if (k && seen.has(k)) continue;
      if (k) seen.add(k);
      keepIds.add(t.id);
    }
    const next = snapshot.filter((t) => keepIds.has(t.id));
    const removed = snapshot.length - next.length;
    // Surface the titles of the tasks we're about to remove so the
    // caller can show users *what* was deduplicated. Without this the
    // banner toast just said "Đã xoá 4 task" and users had no way to
    // verify the cleanup matched their mental model.
    const removedNames = snapshot
      .filter((t) => !keepIds.has(t.id))
      .map((t) => t.title);
    if (removed > 0) setTasks(next);
    return {
      removed,
      removedNames,
      restore: () => setTasks(snapshot),
    };
  }, []);

  const exportJson = useCallback(() => {
    const payload: ExportShape = {
      version: 2,
      exportedAt: new Date().toISOString(),
      tasks,
    };
    return JSON.stringify(payload, null, 2);
  }, [tasks]);

  const importJson = useCallback<TasksContextType["importJson"]>((raw) => {
    try {
      const parsed = JSON.parse(raw);
      const incoming: Task[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.tasks)
        ? parsed.tasks
        : [];
      if (!incoming.length) {
        const lang =
          typeof localStorage !== "undefined" &&
          localStorage.getItem("clearmind_lang") === "en"
            ? "en"
            : "vi";
        return {
          ok: false,
          added: 0,
          error:
            lang === "en"
              ? "No tasks found in file."
              : "Không thấy task nào trong file.",
        };
      }

      let added = 0;
      setTasks((prev) => {
        const byId = new Map(prev.map((t) => [t.id, t]));
        for (const incomingTask of incoming) {
          // Build a fresh object so we never mutate the caller's payload
          // — JSON.parse output may be retained by integration tests or
          // future ndjson stream readers.
          //
          // Force recurrence: null on import. Restoring from a backup that
          // was taken before the switch to one-off-per-week imports used
          // to drag every weekly task back, which then triggered the
          // auto-spawn-on-complete flow + dumped a wall of repeating
          // events back onto the calendar. User explicitly wants "tuần
          // nào import tuần đó" — strip the recurrence so backups behave
          // the same as fresh paste imports.
          const safe: Task = {
            ...incomingTask,
            id: incomingTask.id || crypto.randomUUID(),
            createdAt: incomingTask.createdAt || new Date().toISOString(),
            status: incomingTask.status || "todo",
            recurrence: null,
            recurrenceEndAt: null,
          };
          if (!byId.has(safe.id)) {
            byId.set(safe.id, safe);
            added++;
          }
        }
        return Array.from(byId.values());
      });
      return { ok: true, added };
    } catch (e) {
      return { ok: false, added: 0, error: (e as Error).message };
    }
  }, []);

  const incrementPomodoro = useCallback((id: string, minutes: number) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, pomodoroMinutes: (t.pomodoroMinutes || 0) + minutes }
          : t
      )
    );
  }, []);

  const requestNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") {
      setNotificationsEnabled(true);
      return true;
    }
    if (Notification.permission === "denied") return false;
    const res = await Notification.requestPermission();
    const ok = res === "granted";
    setNotificationsEnabled(ok);
    return ok;
  }, []);

  // Memoize the context value so consumers (Dashboard, Tasks, Calendar,
  // Topbar overdue badge…) don't re-render on every TasksProvider update.
  // Most actions are useCallback'd; tasks + notificationsEnabled are the
  // real change drivers.
  const value = useMemo(
    () => ({
      tasks,
      addTask,
      updateTaskStatus,
      cycleStatus,
      updateTask,
      removeTask,
      snoozeTask,
      clearAll,
      exportJson,
      importJson,
      incrementPomodoro,
      rollForwardOverdueRecurring,
      clearDuplicates,
      notificationsEnabled,
      requestNotifications,
    }),
    [
      tasks,
      addTask,
      updateTaskStatus,
      cycleStatus,
      updateTask,
      removeTask,
      snoozeTask,
      clearAll,
      exportJson,
      importJson,
      incrementPomodoro,
      rollForwardOverdueRecurring,
      clearDuplicates,
      notificationsEnabled,
      requestNotifications,
    ]
  );

  return (
    <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (context === undefined)
    throw new Error("useTasks must be used within a TasksProvider");
  return context;
}
