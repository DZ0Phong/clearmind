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

const ICON_PATH = path.join(__dirname, "assets", "icon.png");
const PS_SCRIPT = path.join(__dirname, "toast.ps1");

const timers = new Map(); // taskId → { handle, fireAt, title }

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

function fireWindowsToast({ title, message, icon }) {
  if (!fs.existsSync(PS_SCRIPT)) {
    console.warn("[clearmind] toast.ps1 not found at", PS_SCRIPT);
    fireFallback({ title, message, icon });
    return;
  }
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
      },
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    }
  );
  let stderr = "";
  proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  proc.on("error", (e) => {
    console.warn("[clearmind] PowerShell toast spawn error:", e && e.message);
    fireFallback({ title, message, icon });
  });
  proc.on("close", (code) => {
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
  const title = "Clearmind · " + (task.title || "Reminder");
  const message = task.description || "Deadline đang tới.";
  if (process.platform === "win32") {
    fireWindowsToast({ title, message, icon: ICON_PATH });
  } else {
    fireFallback({ title, message, icon: ICON_PATH });
  }
}

function fireTest() {
  fire({
    title: "Test toast — tiếng Việt thử",
    description: "Nếu đọc được đầy đủ ờ ầ ã ô ư ạ ặ đ → encoding OK.",
  });
}

function scheduledList() {
  const list = [];
  for (const [taskId, entry] of timers.entries()) {
    list.push({ taskId, title: entry.title, fireAt: entry.fireAt });
  }
  list.sort((a, b) => a.fireAt - b.fireAt);
  return list;
}

function scheduleAll(tasks) {
  clearAll();
  if (!Array.isArray(tasks)) return;
  const now = Date.now();
  const WINDOW_MS = 25 * 60 * 60_000;
  let scheduled = 0;
  for (const t of tasks) {
    if (!t || !t.notify || !t.deadline || t.status === "done") continue;
    const offs = offsetMs(t.notify);
    if (offs === null) continue;
    const target = new Date(t.deadline).getTime() - offs;
    if (Number.isNaN(target)) continue;
    const delay = target - now;
    if (delay <= 0 || delay > WINDOW_MS) continue;
    const handle = setTimeout(() => {
      fire(t);
      timers.delete(t.id);
    }, delay);
    if (handle.unref) handle.unref();
    timers.set(t.id, { handle, fireAt: target, title: t.title });
    scheduled++;
  }
  console.log(`[clearmind] Scheduled ${scheduled} native notification(s) in next 25h.`);
}

module.exports = { scheduleAll, clearAll, fire, fireTest, scheduledList };
