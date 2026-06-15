/**
 * Bridge between the Clearmind SPA and the optional Node CLI host (cli/).
 *
 * When the SPA is served by `clearmind` (the Node CLI), the server injects
 * `window.__CLEARMIND_CLI__ = { port, version, dataDir, platform }` into
 * `index.html` before `</head>`. The presence of that marker is how we
 * detect that data should live in the Node filesystem (atomic JSON in
 * `%APPDATA%/Clearmind/`) instead of `localStorage`.
 *
 * Outside CLI mode (e.g. `npm run dev`), every helper here is a no-op /
 * unavailable, and callers fall back to localStorage.
 */
import type { Task } from "@/hooks/use-tasks";

export interface CliInfo {
  port: number;
  version: string;
  dataDir: string;
  platform: string;
}

declare global {
  interface Window {
    __CLEARMIND_CLI__?: CliInfo;
    __CLEARMIND_TASKS__?: Task[];
    __CLEARMIND_MTIME__?: number;
    __CLEARMIND_SETTINGS__?: Record<string, unknown>;
  }
}

export function cliInfo(): CliInfo | null {
  if (typeof window === "undefined") return null;
  return window.__CLEARMIND_CLI__ || null;
}

export function isCliMode(): boolean {
  return !!cliInfo();
}

// Inline-hydrated tasks injected by the CLI server into index.html.
// Returns null when running outside CLI mode (dev, static build).
export function inlineTasks(): Task[] | null {
  if (typeof window === "undefined") return null;
  const t = window.__CLEARMIND_TASKS__;
  return Array.isArray(t) ? t : null;
}
export function inlineMtime(): number {
  if (typeof window === "undefined") return 0;
  return window.__CLEARMIND_MTIME__ || 0;
}

/** Same-origin fetch — the CLI server binds 127.0.0.1 and serves the SPA. */
async function apiJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`API ${input} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function cliFetchTasks(): Promise<{ tasks: Task[]; mtimeMs: number }> {
  const j = await apiJson<{ tasks: Task[]; mtimeMs?: number }>("/api/tasks");
  return { tasks: Array.isArray(j.tasks) ? j.tasks : [], mtimeMs: j.mtimeMs || 0 };
}

// keepalive: true → browser tiếp tục gửi nếu user F5/đóng tab giữa chừng.
// Giới hạn 64KB body (đủ cho vài trăm task) — đổi lại không mất edit nào.
export async function cliPutTasks(tasks: Task[]): Promise<number> {
  const r = await fetch("/api/tasks", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks }),
    keepalive: true,
  });
  if (!r.ok) throw new Error(`PUT /api/tasks → HTTP ${r.status}`);
  const j = (await r.json()) as { mtimeMs?: number };
  return j.mtimeMs || 0;
}

/** Merge localStorage tasks into the on-disk store. Skips IDs that already exist. */
export async function cliMigrate(tasks: Task[]): Promise<{ added: number; total: number }> {
  const j = await apiJson<{ ok: boolean; added: number; total: number }>(
    "/api/migrate",
    { method: "POST", body: JSON.stringify({ tasks }) }
  );
  return { added: j.added, total: j.total };
}

export async function cliBackup(): Promise<{ ok: boolean; path?: string; error?: string }> {
  return apiJson("/api/backup", { method: "POST" });
}

export async function cliOpenDataDir(): Promise<void> {
  await apiJson("/api/open-data-dir", { method: "POST" });
}

export async function cliGetAutostart(): Promise<boolean> {
  const j = await apiJson<{ enabled: boolean }>("/api/autostart");
  return !!j.enabled;
}

export async function cliSetAutostart(enabled: boolean): Promise<boolean> {
  const j = await apiJson<{ enabled: boolean }>("/api/autostart", {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
  return !!j.enabled;
}

export async function cliHealth(): Promise<
  CliInfo & { dataFile: string; autostart: boolean; tz?: string }
> {
  return apiJson("/api/health");
}

export interface PreviousInfo {
  exists: boolean;
  mtime?: number;
  count?: number;
}

export async function cliPreviousInfo(): Promise<PreviousInfo> {
  return apiJson("/api/previous-info");
}

export interface HistorySlot {
  version: number; // 1-based, 1 = most recent
  exists: boolean;
  mtime?: number;
  count?: number;
}

export async function cliHistoryInfo(): Promise<HistorySlot[]> {
  const j = await apiJson<{ history: HistorySlot[] }>("/api/history-info");
  return Array.isArray(j.history) ? j.history : [];
}

export async function cliRecover(version: number = 1): Promise<{ ok: boolean; tasks?: Task[]; count?: number; version?: number; error?: string }> {
  const res = await fetch(`/api/recover?version=${version}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export interface ScheduledNotification {
  taskId: string;
  title: string;
  fireAt: number;
}

export async function cliScheduledNotifications(): Promise<ScheduledNotification[]> {
  const j = await apiJson<{ scheduled: ScheduledNotification[] }>("/api/scheduled-notifications");
  return Array.isArray(j.scheduled) ? j.scheduled : [];
}

export async function cliTestNotification(): Promise<void> {
  await apiJson("/api/test-notification", { method: "POST" });
}

// ---- Cross-client UI settings (theme, accent, timezone) ----
// localStorage is per browser engine, so the desktop app's WebView, Chrome
// and Edge each keep their own theme/accent. These route the shared ones
// through the CLI host (a JSON file on disk + an SSE fan-out) so a pick on
// one client shows up live on every other. No-ops outside CLI mode — callers
// keep their localStorage fallback.

/** Settings the CLI injected inline into index.html (read at first paint, no flash). */
export function inlineSettings(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const s = window.__CLEARMIND_SETTINGS__;
  return s && typeof s === "object" ? s : null;
}

/** Merge-write a partial settings patch to the shared store. */
export async function cliPutSettings(partial: Record<string, unknown>): Promise<void> {
  await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
    keepalive: true,
  });
}

// One shared EventSource for `settings-changed`, fanned out to every
// subscribing provider (theme, accent, timezone) so we don't open three.
let settingsES: EventSource | null = null;
const settingsHandlers = new Set<(s: Record<string, unknown>) => void>();
export function subscribeSettings(
  fn: (s: Record<string, unknown>) => void
): () => void {
  if (!isCliMode() || typeof window === "undefined") return () => {};
  settingsHandlers.add(fn);
  if (!settingsES) {
    try {
      settingsES = new EventSource("/api/events");
      settingsES.addEventListener("settings-changed", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as Record<string, unknown>;
          for (const h of settingsHandlers) h(data);
        } catch {
          /* ignore malformed payload */
        }
      });
    } catch {
      settingsES = null;
    }
  }
  return () => {
    settingsHandlers.delete(fn);
  };
}
