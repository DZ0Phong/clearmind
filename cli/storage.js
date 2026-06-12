"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const APP_NAME = "Clearmind";
const DATA_FILE = "clearmind.json";
// Rolling history: HISTORY_FILES[0] = most recent prior save,
// HISTORY_FILES[N-1] = oldest. Every successful writeTasks shifts the
// chain one slot down (the oldest is discarded). Gives the user 3
// undo levels for accidental wipes/edits.
const HISTORY_FILES = [
  "clearmind.previous-1.json",
  "clearmind.previous-2.json",
  "clearmind.previous-3.json",
];
// Legacy single-level filename from earlier versions — migrated to slot 1
// on first write so users upgrading don't lose their last-known-good.
const LEGACY_PREV = "clearmind.previous.json";
const BACKUP_DIR = "backups";
const MAX_BACKUPS = 14;

function defaultDataDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", APP_NAME);
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, APP_NAME.toLowerCase());
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readTasks(dataDir) {
  const file = path.join(dataDir, DATA_FILE);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.tasks)) return parsed.tasks;
    return [];
  } catch (e) {
    // Corrupted file — keep a sidecar copy and start fresh so the user doesn't lose forever.
    try {
      fs.copyFileSync(file, file + ".corrupt-" + Date.now());
    } catch (_) { /* best-effort */ }
    return [];
  }
}

const VALID_TYPES = new Set(["academic", "personal", "work", "other"]);
const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const VALID_STATUSES = new Set(["todo", "in-progress", "done"]);
const VALID_RECURRENCES = new Set(["daily", "weekday", "weekly", "monthly"]);
const VALID_NOTIFY = new Set(["at-time", "5m", "15m", "1h", "1d"]);

/**
 * Normalize a single task. Returns the cleaned object, or null if it's
 * missing required fields. Loose validation — we want to import the user's
 * data even if it came from an older version of the schema — so unknown
 * enum values fall back to safe defaults instead of dropping the row.
 */
function sanitizeTask(t) {
  if (!t || typeof t !== "object") return null;
  if (typeof t.title !== "string" || !t.title.trim()) return null;
  const out = {
    id: typeof t.id === "string" && t.id ? t.id : cryptoRandomId(),
    title: t.title.trim(),
    type: VALID_TYPES.has(t.type) ? t.type : "other",
    priority: VALID_PRIORITIES.has(t.priority) ? t.priority : "medium",
    status: VALID_STATUSES.has(t.status) ? t.status : "todo",
    createdAt:
      typeof t.createdAt === "string" && !Number.isNaN(Date.parse(t.createdAt))
        ? t.createdAt
        : new Date().toISOString(),
  };
  if (typeof t.description === "string") out.description = t.description;
  if (typeof t.location === "string") out.location = t.location;
  if (Array.isArray(t.tags)) {
    const tags = t.tags.filter((x) => typeof x === "string" && x.trim());
    if (tags.length) out.tags = tags;
  }
  if (typeof t.deadline === "string") {
    // accept "YYYY-MM-DD" or full ISO
    if (/^\d{4}-\d{2}-\d{2}(T.+)?$/.test(t.deadline) && !Number.isNaN(Date.parse(t.deadline))) {
      out.deadline = t.deadline;
    }
  }
  if (t.parentId === null || typeof t.parentId === "string") out.parentId = t.parentId;
  if (VALID_RECURRENCES.has(t.recurrence)) out.recurrence = t.recurrence;
  else if (t.recurrence === null) out.recurrence = null;
  if (typeof t.recurrenceEndAt === "string" && !Number.isNaN(Date.parse(t.recurrenceEndAt))) {
    out.recurrenceEndAt = t.recurrenceEndAt;
  } else if (t.recurrenceEndAt === null) {
    out.recurrenceEndAt = null;
  }
  if (VALID_NOTIFY.has(t.notify)) out.notify = t.notify;
  else if (t.notify === null) out.notify = null;
  if (typeof t.pomodoroMinutes === "number" && Number.isFinite(t.pomodoroMinutes) && t.pomodoroMinutes >= 0) {
    out.pomodoroMinutes = t.pomodoroMinutes;
  }
  if (typeof t.completedAt === "string" && !Number.isNaN(Date.parse(t.completedAt))) {
    out.completedAt = t.completedAt;
  }
  return out;
}

function sanitizeTasksArray(incoming) {
  if (!Array.isArray(incoming)) return { tasks: [], dropped: 0 };
  let dropped = 0;
  const tasks = [];
  for (const t of incoming) {
    const clean = sanitizeTask(t);
    if (clean) tasks.push(clean);
    else dropped++;
  }
  return { tasks, dropped };
}

function countTasksInFile(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(data)) return data.length;
    return data && data.tasks ? data.tasks.length : 0;
  } catch (_) {
    return 0;
  }
}

function writeTasks(dataDir, tasks) {
  if (!Array.isArray(tasks)) throw new Error("tasks must be an array");
  ensureDir(dataDir);
  const file = path.join(dataDir, DATA_FILE);
  const tmp = file + ".tmp-" + process.pid;
  const payload = JSON.stringify(
    { version: 2, exportedAt: new Date().toISOString(), tasks },
    null,
    2
  );

  // One-shot migration of the legacy single-file previous → slot 1.
  const legacy = path.join(dataDir, LEGACY_PREV);
  const slot1 = path.join(dataDir, HISTORY_FILES[0]);
  if (fs.existsSync(legacy) && !fs.existsSync(slot1)) {
    try { fs.renameSync(legacy, slot1); } catch (_) { /* best-effort */ }
  }

  // Rotate history. Safety guard: if the new write is empty AND we already
  // have ANY non-empty slot, do NOT shift — that would let a wipe→wipe
  // sequence push the good snapshots out of the chain. We only shift when
  // the new state is real progress (or there's no real progress to lose).
  if (fs.existsSync(file)) {
    let shouldRotate = true;
    const newCount = tasks.length;
    if (newCount === 0) {
      const anySlotHasData = HISTORY_FILES.some((name) => {
        const p = path.join(dataDir, name);
        return fs.existsSync(p) && countTasksInFile(p) > 0;
      });
      const currentCount = countTasksInFile(file);
      if (anySlotHasData && currentCount === 0) shouldRotate = false;
    }
    if (shouldRotate) {
      try {
        // Shift from oldest to newest: slot[N-2] → slot[N-1], ..., slot[0] → slot[1]
        for (let i = HISTORY_FILES.length - 1; i > 0; i--) {
          const src = path.join(dataDir, HISTORY_FILES[i - 1]);
          const dst = path.join(dataDir, HISTORY_FILES[i]);
          if (fs.existsSync(src)) {
            try { fs.copyFileSync(src, dst); } catch (_) { /* best-effort */ }
          }
        }
        // Current → slot 0
        fs.copyFileSync(file, path.join(dataDir, HISTORY_FILES[0]));
      } catch (_) { /* non-fatal */ }
    }
  }

  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, file); // atomic on same FS
}

/**
 * Restore from history slot N (1 = most recent, 3 = oldest). Swaps slot N
 * with current — so user can undo by recovering the same slot again.
 */
function recover(dataDir, version = 1) {
  const file = path.join(dataDir, DATA_FILE);
  const slotIdx = Math.max(1, Math.min(HISTORY_FILES.length, version)) - 1;
  const slotFile = path.join(dataDir, HISTORY_FILES[slotIdx]);
  if (!fs.existsSync(slotFile)) {
    return { ok: false, error: `Không có bản previous-${slotIdx + 1} để khôi phục.` };
  }
  try {
    let current = null;
    if (fs.existsSync(file)) current = fs.readFileSync(file, "utf8");
    const restored = fs.readFileSync(slotFile, "utf8");
    if (current !== null) fs.writeFileSync(slotFile, current, "utf8");
    fs.writeFileSync(file, restored, "utf8");
    const parsed = JSON.parse(restored);
    const tasks = Array.isArray(parsed) ? parsed : (parsed && parsed.tasks) || [];
    return { ok: true, version: slotIdx + 1, tasks, count: tasks.length };
  } catch (e) {
    return { ok: false, error: (e && e.message) || "Recover failed." };
  }
}

function getHistoryInfo(dataDir) {
  return HISTORY_FILES.map((name, i) => {
    const p = path.join(dataDir, name);
    if (!fs.existsSync(p)) return { version: i + 1, exists: false };
    try {
      const stat = fs.statSync(p);
      return { version: i + 1, exists: true, mtime: stat.mtimeMs, count: countTasksInFile(p) };
    } catch {
      return { version: i + 1, exists: true, mtime: 0, count: 0 };
    }
  });
}

// Kept for backward compatibility with /api/previous-info — returns slot 1.
function getPreviousInfo(dataDir) {
  const h = getHistoryInfo(dataDir);
  return h[0];
}

function mergeTasks(dataDir, incoming) {
  const existing = readTasks(dataDir);
  const byId = new Map(existing.map((t) => [t.id, t]));
  let added = 0;
  for (const t of incoming) {
    if (!t || typeof t !== "object") continue;
    if (!t.id) t.id = cryptoRandomId();
    if (!t.createdAt) t.createdAt = new Date().toISOString();
    if (!t.status) t.status = "todo";
    if (!byId.has(t.id)) {
      byId.set(t.id, t);
      added++;
    }
  }
  const merged = Array.from(byId.values());
  writeTasks(dataDir, merged);
  return { added, total: merged.length };
}

function cryptoRandomId() {
  try {
    return require("node:crypto").randomUUID();
  } catch {
    return "t_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function makeBackup(dataDir) {
  const file = path.join(dataDir, DATA_FILE);
  if (!fs.existsSync(file)) return { ok: false, error: "Chưa có data để backup." };
  const dir = path.join(dataDir, BACKUP_DIR);
  ensureDir(dir);
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const dest = path.join(dir, `${stamp}.json`);
  fs.copyFileSync(file, dest);
  rotateBackups(dir);
  return { ok: true, path: dest };
}

function lastBackupAt(dataDir) {
  const dir = path.join(dataDir, BACKUP_DIR);
  if (!fs.existsSync(dir)) return 0;
  const files = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => fs.statSync(path.join(dir, n)).mtimeMs);
  return files.length ? Math.max(...files) : 0;
}

function rotateBackups(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => ({ name: n, time: fs.statSync(path.join(dir, n)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const old of files.slice(MAX_BACKUPS)) {
    try {
      fs.unlinkSync(path.join(dir, old.name));
    } catch (_) { /* swallow */ }
  }
}

function getDataFilePath(dataDir) {
  return path.join(dataDir, DATA_FILE);
}

module.exports = {
  APP_NAME,
  defaultDataDir,
  ensureDir,
  readTasks,
  writeTasks,
  mergeTasks,
  makeBackup,
  lastBackupAt,
  getDataFilePath,
  recover,
  getHistoryInfo,
  getPreviousInfo,
  sanitizeTasksArray,
};
