"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

/**
 * Server-side native OS notification scheduler.
 *
 * Windows path uses PowerShell + the native WinRT ToastNotificationManager.
 * Title/message are passed via ENVIRONMENT VARIABLES (CM_TITLE/CM_MESSAGE/
 * CM_ICON) — never interpolated into the script string — because Windows
 * env blocks are natively UTF-16, so Vietnamese diacritics survive the hop
 * intact. The PS script itself lives in `toast.ps1` as a static file,
 * loaded via `-File`, so no cmdline encoding hop touches user text.
 *
 * Mac/Linux fall back to node-notifier (terminal-notifier and notify-send
 * respectively, both of which handle UTF-8 cleanly).
 */

let notifier = null;
try {
  notifier = require("node-notifier");
} catch (_) { /* optional */ }

// Small PNG (32×32) for non-Windows fallback (terminal-notifier / notify-send
// render it inline at standard size).
const ICON_PATH = path.join(__dirname, "assets", "icon.png");
// Large PNG (256×256) used as appLogoOverride on Windows ToastGeneric. The
// circle-crop default of older templates sliced the square logo; the new
// template requests hint-crop='none' and a 256px source so the indigo
// rounded-square + star renders crisp at any DPI.
const ICON_LARGE_PATH = path.join(__dirname, "assets", "icon-256.png");
const PS_SCRIPT = path.join(__dirname, "toast.ps1");

const timers = new Map(); // taskId → { handle, fireAt, title }
let portRef = null;
function setPort(p) { portRef = p; }

// Read user language preference từ %APPDATA%\Clearmind\clearmind.lang
// (SPA ghi qua PUT /api/locale). Default "vi" để khớp legacy behavior.
let dataDirRef = null;
function setDataDir(dir) { dataDirRef = dir; }
function getLang() {
  if (!dataDirRef) return "vi";
  try {
    const v = fs.readFileSync(path.join(dataDirRef, "clearmind.lang"), "utf8").trim();
    return v === "en" ? "en" : "vi";
  } catch (_) { return "vi"; }
}
const I18N = {
  vi: {
    reminderDefault: "Tới giờ rồi.",
    testTitle: "Toast thử",
    testBody: "Tiếng Việt: ờ ầ ã ô ư ạ ặ đ → encoding OK.",
    btnSnooze10: "Hoãn 10p",
    btnSnooze60: "Hoãn 1h",
    btnDone: "Xong",
  },
  en: {
    reminderDefault: "Time's up.",
    testTitle: "Test toast",
    testBody: "If you see this clearly, the notification system is working.",
    btnSnooze10: "Snooze 10m",
    btnSnooze60: "Snooze 1h",
    btnDone: "Done",
  },
};

function offsetMs(pref) {
  switch (pref) {
    case "at-time": return 0;
    case "5m":      return 5 * 60_000;
    case "15m":     return 15 * 60_000;
    case "1h":      return 60 * 60_000;
    case "1d":      return 24 * 60 * 60_000;
    default:        return null;
  }
}

function clearAll() {
  for (const entry of timers.values()) clearTimeout(entry.handle);
  timers.clear();
}

function fireWindowsToast({ title, message, icon, taskId }) {
  if (!fs.existsSync(PS_SCRIPT)) {
    console.warn("[clearmind] toast.ps1 not found at", PS_SCRIPT);
    fireFallback({ title, message, icon });
    return;
  }
  const lang = getLang();
  const i = I18N[lang];
  const proc = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-File", PS_SCRIPT,
    ],
    {
      env: {
        ...process.env,
        CM_TITLE: String(title || ""),
        CM_MESSAGE: String(message || ""),
        CM_ICON: icon ? String(icon) : "",
        CM_TASK_ID: taskId ? String(taskId) : "",
        CM_PORT: portRef ? String(portRef) : "",
        CM_BTN_SNOOZE10: i.btnSnooze10,
        CM_BTN_SNOOZE60: i.btnSnooze60,
        CM_BTN_DONE: i.btnDone,
      },
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    }
  );
  let stderr = "";
  proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  // Guard timer — if PowerShell hangs (AV scan, locked profile, slow
  // WinRT init), kill it after 15s so we don't accumulate orphan
  // children. Cleared on normal close.
  const killer = setTimeout(() => {
    try { proc.kill(); } catch (_) {}
    console.warn("[clearmind] toast.ps1 killed after 15s timeout");
  }, 15_000);
  proc.on("error", (e) => {
    clearTimeout(killer);
    console.warn("[clearmind] PowerShell toast spawn error:", e && e.message);
    fireFallback({ title, message, icon });
  });
  proc.on("close", (code) => {
    clearTimeout(killer);
    if (code !== 0) {
      console.warn(`[clearmind] toast.ps1 exit=${code}${stderr ? " · " + stderr.trim().slice(0, 200) : ""}`);
      fireFallback({ title, message, icon });
      return;
    }
    console.log(`[clearmind] Toast fired (PS): ${title}`);
  });
}

function fireFallback({ title, message, icon }) {
  if (!notifier) return;
  try {
    notifier.notify({
      title,
      message,
      icon: icon || ICON_PATH,
      sound: true,
      wait: false,
      appID: "Clearmind",
    });
    console.log(`[clearmind] Toast fired (fallback): ${title}`);
  } catch (e) {
    console.warn("[clearmind] Fallback notifier failed:", e && e.message);
  }
}

function fire(task) {
  const lang = getLang();
  const title = "Clearmind · " + (task.title || (lang === "en" ? "Reminder" : "Nhắc nhở"));
  const message = task.description || I18N[lang].reminderDefault;
  if (process.platform === "win32") {
    fireWindowsToast({
      title,
      message,
      icon: ICON_LARGE_PATH,
      taskId: task.id,
    });
  } else {
    fireFallback({ title, message, icon: ICON_PATH });
  }
}

function fireTest() {
  const lang = getLang();
  // Use sentinel id so /api/notification-action recognizes the test toast
  // and no-ops its action buttons. Without an id, toast.ps1 skips the
  // <actions> block entirely — user wouldn't see the new 3-button UI.
  fire({
    id: "__clearmind_test__",
    title: I18N[lang].testTitle,
    description: I18N[lang].testBody,
  });
}

function scheduledList() {
  const list = [];
  for (const entry of timers.values()) {
    list.push({ taskId: entry.taskId, title: entry.title, fireAt: entry.fireAt });
  }
  list.sort((a, b) => a.fireAt - b.fireAt);
  return list;
}

// Mirror of `nextRecurrence` in src/hooks/use-tasks.tsx — keep these two
// in sync. CommonJS port for the CLI side.
function nextRecurrence(deadline, rule) {
  const d = new Date(deadline);
  if (rule === "daily") d.setDate(d.getDate() + 1);
  else if (rule === "weekday") {
    do d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6);
  } else if (rule === "weekly") d.setDate(d.getDate() + 7);
  else if (rule === "monthly") d.setMonth(d.getMonth() + 1);
  return deadline.includes("T") ? d.toISOString() : d.toISOString().slice(0, 10);
}

function scheduleAll(tasks) {
  clearAll();
  if (!Array.isArray(tasks)) return;
  const now = Date.now();
  const WINDOW_MS = 25 * 60 * 60_000;
  const horizon = now + WINDOW_MS;
  let scheduled = 0;
  for (const t of tasks) {
    if (!t || !t.notify || !t.deadline || t.status === "done") continue;
    const offs = offsetMs(t.notify);
    if (offs === null) continue;
    // Walk occurrences forward from the stored deadline. For non-recurring
    // tasks the loop yields exactly one entry. For recurring tasks we
    // expand every occurrence whose fireAt falls in (now, horizon],
    // stopping at recurrenceEndAt or when the horizon is passed.
    const endAt = t.recurrenceEndAt ? new Date(t.recurrenceEndAt).getTime() : null;
    let cursor = t.deadline;
    let safety = 500; // bound for very-stale recurring rows
    while (safety-- > 0) {
      const occMs = new Date(cursor).getTime();
      if (Number.isNaN(occMs)) break;
      if (endAt !== null && occMs > endAt) break;
      const fireAt = occMs - offs;
      if (fireAt > horizon) break;
      if (fireAt > now) {
        const key = `${t.id}:${fireAt}`;
        const handle = setTimeout(() => {
          fire(t);
          timers.delete(key);
        }, fireAt - now);
        if (handle.unref) handle.unref();
        timers.set(key, { handle, fireAt, title: t.title, taskId: t.id });
        scheduled++;
      }
      if (!t.recurrence) break;
      cursor = nextRecurrence(cursor, t.recurrence);
    }
  }
  console.log(`[clearmind] Scheduled ${scheduled} native notification(s) in next 25h.`);
}

module.exports = { scheduleAll, clearAll, fire, fireTest, scheduledList, setDataDir, setPort };
