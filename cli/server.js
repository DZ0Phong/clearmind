"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const storage = require("./storage");
const autostart = require("./autostart");
const notifications = require("./notifications");
const { openFolder } = require("./open-browser");

// SSE clients hiện đang lắng nghe /api/events. Broadcast mỗi khi tasks đổi.
const sseClients = new Set();
function sseBroadcast(eventType, data) {
  const msg = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of [...sseClients]) {
    try { res.write(msg); } catch (_) { sseClients.delete(res); }
  }
}
function getMtime(dataDir) {
  try { return fs.statSync(storage.getDataFilePath(dataDir)).mtimeMs; }
  catch (_) { return 0; }
}

// Persist preferred UI language to clearmind.lang in dataDir. Notification
// đọc file này để chọn message "Tới giờ" / "Time's up". SPA gọi PUT khi user
// đổi ngôn ngữ qua toggle.
function localeFile(dataDir) {
  return path.join(dataDir, "clearmind.lang");
}
function readLocale(dataDir) {
  try {
    const v = fs.readFileSync(localeFile(dataDir), "utf8").trim();
    return v === "en" ? "en" : "vi";
  } catch (_) { return "vi"; }
}
function writeLocale(dataDir, lang) {
  const safe = lang === "en" ? "en" : "vi";
  try { fs.writeFileSync(localeFile(dataDir), safe, "utf8"); } catch (_) {}
  return safe;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".ico":  "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff":  "font/woff",
  ".woff2": "font/woff2",
  ".ttf":   "font/ttf",
  ".map":   "application/json",
  ".txt":   "text/plain; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(status, { "Content-Length": buf.length, ...headers });
  res.end(buf);
}

function sendJson(res, status, obj) {
  send(res, status, obj, { "Content-Type": "application/json; charset=utf-8" });
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let len = 0;
    const chunks = [];
    req.on("data", (c) => {
      len += c.length;
      if (len > limit) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeJoin(root, rel) {
  const target = path.normalize(path.join(root, rel));
  // Block escape via `..` — `target` must stay inside root.
  if (!target.startsWith(path.normalize(root))) return null;
  return target;
}

// Escape `</script` so a task title containing it can't break out of our tag.
function safeJson(value) {
  return JSON.stringify(value).replace(/<\/(script)/gi, "<\\/$1");
}

function injectMarker(html, ctx) {
  // Hydrate tasks inline + mtime → client biết version để so với SSE snapshot.
  let tasks = [];
  try { tasks = storage.readTasks(ctx.dataDir); } catch (_) {}
  const mtimeMs = getMtime(ctx.dataDir);
  const cli = { port: ctx.port, version: ctx.version, dataDir: ctx.dataDir, platform: process.platform };
  const tag = `<script>window.__CLEARMIND_CLI__=${safeJson(cli)};window.__CLEARMIND_TASKS__=${safeJson(tasks)};window.__CLEARMIND_MTIME__=${mtimeMs};</script>`;
  if (html.includes("</head>")) return html.replace("</head>", `${tag}</head>`);
  return tag + html;
}

function serveIndex(distDir, ctx, res) {
  const file = path.join(distDir, "index.html");
  if (!fs.existsSync(file)) {
    return send(res, 503, "Clearmind chưa build. Chạy `npm run build` ở thư mục gốc trước.", {
      "Content-Type": "text/plain; charset=utf-8",
    });
  }
  let html = fs.readFileSync(file, "utf8");
  html = injectMarker(html, ctx);
  send(res, 200, html, {
    "Content-Type": "text/html; charset=utf-8",
    // CLI rebuilds dist/ on every release → must never serve stale HTML
    // through a browser HTTP cache. Bundles have hashed filenames so any
    // referenced JS chunk will 404 unless the user reads the fresh HTML.
    "Cache-Control": "no-store, must-revalidate",
  });
}

function serveStatic(distDir, ctx, req, res, parsed) {
  // Map URL path to file. Strip leading `/` then safe-join.
  const rel = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!rel) return serveIndex(distDir, ctx, res);
  const file = safeJoin(distDir, rel);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // SPA fallback — let the React router handle unknown paths.
    return serveIndex(distDir, ctx, res);
  }
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const buf = fs.readFileSync(file);
  // index.html needs the marker too if user navigates there directly.
  if (ext === ".html") {
    return send(res, 200, injectMarker(buf.toString("utf8"), ctx), {
      "Content-Type": type,
      // no-store: ngăn browser cache HTML cũ qua CLI restart (root cause của
      // bug "load lại bản cũ" — SW cũ + browser HTTP cache giữ shell stale).
      "Cache-Control": "no-store, must-revalidate",
    });
  }
  // sw.js cần fetch fresh mỗi lần để browser detect được self-destruct
  // version mới ngay khi user F5. Mọi asset khác có hash filename → cache OK.
  const isSw = path.basename(file).toLowerCase() === "sw.js";
  send(res, 200, buf, {
    "Content-Type": type,
    "Cache-Control": isSw
      ? "no-store, must-revalidate"
      : "public, max-age=3600",
  });
}

function makeHandler({ distDir, dataDir, port, version }) {
  const ctx = { distDir, dataDir, port, version };
  return async function handler(req, res) {
    // WHATWG URL: req.url is relative, supply a dummy base.
    const parsed = new URL(req.url, "http://127.0.0.1");
    const p = parsed.pathname;
    try {
      // ---- API ----
      if (p === "/api/health" && req.method === "GET") {
        return sendJson(res, 200, {
          ok: true,
          port,
          version,
          dataDir,
          dataFile: storage.getDataFilePath(dataDir),
          autostart: autostart.isEnabled(),
          platform: process.platform,
        });
      }
      if (p === "/api/tasks" && req.method === "GET") {
        return sendJson(res, 200, { tasks: storage.readTasks(dataDir), mtimeMs: getMtime(dataDir) });
      }
      // SSE: server push tasks mỗi khi đĩa thay đổi → client sync real-time
      // không cần poll. Trên connect cũng gửi snapshot ngay → tab vừa mở
      // / vừa F5 đều có version mới nhất kể cả nếu inline payload stale.
      if (p === "/api/events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write(`event: snapshot\ndata: ${JSON.stringify({ tasks: storage.readTasks(dataDir), mtimeMs: getMtime(dataDir) })}\n\n`);
        sseClients.add(res);
        const hb = setInterval(() => { try { res.write(":hb\n\n"); } catch (_) {} }, 15000);
        req.on("close", () => { clearInterval(hb); sseClients.delete(res); });
        return;
      }
      if (p === "/api/tasks" && req.method === "PUT") {
        const body = await readBody(req);
        let parsedBody;
        try { parsedBody = JSON.parse(body); } catch (e) {
          return sendJson(res, 400, { ok: false, error: "Invalid JSON" });
        }
        const rawTasks = Array.isArray(parsedBody) ? parsedBody : parsedBody && parsedBody.tasks;
        if (!Array.isArray(rawTasks)) return sendJson(res, 400, { ok: false, error: "Expect {tasks:[]}" });
        // Validate + sanitize. Bad entries are dropped silently from disk
        // but reported back so the client can surface a warning.
        const { tasks, dropped } = storage.sanitizeTasksArray(rawTasks);
        if (dropped > 0) {
          console.warn(`[clearmind] PUT /api/tasks: dropped ${dropped} malformed task(s).`);
        }
        storage.writeTasks(dataDir, tasks);
        notifications.scheduleAll(tasks);
        const mtimeMs = getMtime(dataDir);
        sseBroadcast("tasks-updated", { tasks, mtimeMs });
        return sendJson(res, 200, { ok: true, count: tasks.length, dropped, mtimeMs });
      }
      if (p === "/api/migrate" && req.method === "POST") {
        const body = await readBody(req);
        let parsedBody;
        try { parsedBody = JSON.parse(body); } catch (e) {
          return sendJson(res, 400, { ok: false, error: "Invalid JSON" });
        }
        const tasks = Array.isArray(parsedBody) ? parsedBody : parsedBody && parsedBody.tasks;
        if (!Array.isArray(tasks)) return sendJson(res, 400, { ok: false, error: "Expect {tasks:[]}" });
        const r = storage.mergeTasks(dataDir, tasks);
        sseBroadcast("tasks-updated", { tasks: storage.readTasks(dataDir), mtimeMs: getMtime(dataDir) });
        return sendJson(res, 200, { ok: true, ...r });
      }
      if (p === "/api/backup" && req.method === "POST") {
        return sendJson(res, 200, storage.makeBackup(dataDir));
      }
      if (p === "/api/previous-info" && req.method === "GET") {
        return sendJson(res, 200, storage.getPreviousInfo(dataDir));
      }
      if (p === "/api/history-info" && req.method === "GET") {
        return sendJson(res, 200, { history: storage.getHistoryInfo(dataDir) });
      }
      if (p === "/api/recover" && req.method === "POST") {
        // Optional ?version=N (1-based). Defaults to 1 = most recent.
        const versionParam = parsed.searchParams.get("version");
        const version = versionParam ? parseInt(versionParam, 10) : 1;
        const r = storage.recover(dataDir, version);
        if (r.ok) sseBroadcast("tasks-updated", { tasks: storage.readTasks(dataDir), mtimeMs: getMtime(dataDir) });
        return sendJson(res, r.ok ? 200 : 404, r);
      }
      if (p === "/api/scheduled-notifications" && req.method === "GET") {
        return sendJson(res, 200, { scheduled: notifications.scheduledList() });
      }
      if (p === "/api/test-notification" && req.method === "POST") {
        notifications.fireTest();
        return sendJson(res, 200, { ok: true });
      }
      // Action endpoint cho toast buttons. Được gọi bởi url-handler.js
      // (qua clearmind:// URL scheme) khi user click "Hoãn 10p" / "Hoãn 1h"
      // / "Xong" trên toast. Cũng cho phép GET để fallback (browser mở trực
      // tiếp URL HTTP nếu scheme chưa register kịp).
      if (p === "/api/notification-action" &&
          (req.method === "POST" || req.method === "GET")) {
        const action = parsed.searchParams.get("action") || "";
        const id = parsed.searchParams.get("id") || "";
        if (!id || !action) {
          return sendJson(res, 400, { ok: false, error: "Missing action/id" });
        }
        const tasks = storage.readTasks(dataDir);
        const target = tasks.find((t) => t.id === id);
        if (!target) {
          return sendJson(res, 404, { ok: false, error: "Task không tìm thấy" });
        }
        let applied = "";
        if ((action === "snooze-10" || action === "snooze-60") && target.deadline) {
          const minutes = action === "snooze-10" ? 10 : 60;
          target.deadline = new Date(
            new Date(target.deadline).getTime() + minutes * 60_000
          ).toISOString();
          applied = `snoozed ${minutes}m`;
        } else if (action === "done") {
          target.status = "done";
          target.completedAt = new Date().toISOString();
          applied = "done";
        } else {
          return sendJson(res, 400, { ok: false, error: `Unknown action: ${action}` });
        }
        storage.writeTasks(dataDir, tasks);
        notifications.scheduleAll(tasks);
        const mtimeMs = getMtime(dataDir);
        sseBroadcast("tasks-updated", { tasks, mtimeMs });
        console.log(`[clearmind] notif-action ${action} on ${id} → ${applied}`);
        // Reply với auto-close HTML phòng case user bấm URL từ browser
        // (vd scheme chưa register, Windows fallback). Khi gọi từ
        // url-handler.js qua POST, response body bị bỏ qua.
        if (req.method === "GET") {
          return send(
            res,
            200,
            `<!doctype html><meta charset="utf-8"><title>Clearmind</title>` +
              `<style>body{font:14px system-ui;color:#666;padding:1.5em;text-align:center}</style>` +
              `<script>setTimeout(()=>window.close(),300)</script>` +
              `<body>✓ ${applied}. Bạn có thể đóng tab này.</body>`,
            { "Content-Type": "text/html; charset=utf-8" }
          );
        }
        return sendJson(res, 200, { ok: true, applied });
      }
      if (p === "/api/open-data-dir" && req.method === "POST") {
        openFolder(dataDir);
        return sendJson(res, 200, { ok: true });
      }
      if (p === "/api/locale" && req.method === "GET") {
        return sendJson(res, 200, { lang: readLocale(dataDir) });
      }
      if (p === "/api/locale" && req.method === "PUT") {
        const body = await readBody(req);
        let parsedBody;
        try { parsedBody = JSON.parse(body); } catch (_) {
          return sendJson(res, 400, { ok: false, error: "Invalid JSON" });
        }
        const lang = writeLocale(dataDir, parsedBody && parsedBody.lang);
        return sendJson(res, 200, { ok: true, lang });
      }
      if (p === "/api/quit" && req.method === "POST") {
        // Acknowledge first, then shut down a beat later so the client gets
        // a clean 200 instead of ECONNRESET. SIGTERM lets cli.js run its
        // shutdown(): tray.kill() + server.close() + lock release. On
        // Windows SIGTERM via process.kill(self) sometimes terminates
        // without running listeners, so we keep a hard-exit fallback.
        sendJson(res, 200, { ok: true });
        setTimeout(() => {
          try { process.kill(process.pid, "SIGTERM"); } catch (_) {}
          setTimeout(() => process.exit(0), 500);
        }, 100);
        return;
      }
      if (p === "/api/autostart" && req.method === "GET") {
        return sendJson(res, 200, { enabled: autostart.isEnabled() });
      }
      if (p === "/api/autostart" && req.method === "PUT") {
        const body = await readBody(req);
        let parsedBody;
        try { parsedBody = JSON.parse(body); } catch (e) {
          return sendJson(res, 400, { ok: false, error: "Invalid JSON" });
        }
        const want = !!parsedBody.enabled;
        if (want) autostart.enable(process.execPath, path.resolve(__dirname, "cli.js"));
        else autostart.disable();
        return sendJson(res, 200, { ok: true, enabled: autostart.isEnabled() });
      }
      // ---- Static ----
      if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJson(res, 405, { ok: false, error: "Method Not Allowed" });
      }
      return serveStatic(distDir, ctx, req, res, parsed);
    } catch (e) {
      console.error("[clearmind] server error:", e);
      sendJson(res, 500, { ok: false, error: (e && e.message) || "Server error" });
    }
  };
}

function tryListen(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const onErr = (e) => {
      server.off("listening", onOk);
      server.close();
      reject(e);
    };
    const onOk = () => {
      server.off("error", onErr);
      resolve(server);
    };
    server.once("error", onErr);
    server.once("listening", onOk);
    server.listen(port, "127.0.0.1");
  });
}

async function start({ distDir, dataDir, port, version, maxAttempts = 20 }) {
  const startPort = port;
  let lastErr = null;
  // Đăng ký dataDir cho notifications module → biết đọc clearmind.lang
  // ngay từ lần fire đầu tiên (kể cả khi SPA chưa kịp ghi locale).
  if (notifications.setDataDir) notifications.setDataDir(dataDir);
  for (let i = 0; i < maxAttempts; i++) {
    const tryPort = startPort + i;
    try {
      const server = await tryListen(tryPort);
      server.on("request", makeHandler({ distDir, dataDir, port: tryPort, version }));
      // Notifications cần biết port để toast action button đặt URL đúng
      // (clearmind://… handler bridge sang http://127.0.0.1:<port>).
      if (notifications.setPort) notifications.setPort(tryPort);
      // Schedule native notifications from whatever's already on disk —
      // covers the autostart case where the user never opens the browser
      // but still expects deadline pings.
      try { notifications.scheduleAll(storage.readTasks(dataDir)); } catch (_) {}
      startDailyBackup(dataDir);
      startPeriodicReschedule(dataDir);
      return { server, port: tryPort };
    } catch (e) {
      lastErr = e;
      if (!e || e.code !== "EADDRINUSE") throw e;
      // else: try next port
    }
  }
  throw lastErr || new Error(`Không tìm được port trống từ ${startPort}.`);
}

/**
 * Rolling 24h auto-backup. On startup, if the last backup is older than
 * 12h we snapshot immediately so a user who only opens Clearmind once in
 * a while still gets safety nets. Then every 24h on the dot.
 */
let backupInterval = null;
function startDailyBackup(dataDir) {
  if (backupInterval) clearInterval(backupInterval); // re-arming on restart
  const TWELVE_HOURS = 12 * 60 * 60_000;
  const DAY = 24 * 60 * 60_000;
  try {
    const last = storage.lastBackupAt(dataDir);
    if (Date.now() - last > TWELVE_HOURS) {
      const r = storage.makeBackup(dataDir);
      if (r.ok) console.log("[clearmind] Auto-backup on startup:", path.basename(r.path));
    }
  } catch (e) {
    console.warn("[clearmind] Auto-backup (startup) failed:", e && e.message);
  }
  backupInterval = setInterval(() => {
    try {
      const r = storage.makeBackup(dataDir);
      if (r.ok) console.log("[clearmind] Daily backup:", path.basename(r.path));
    } catch (e) {
      console.warn("[clearmind] Daily backup failed:", e && e.message);
    }
  }, DAY);
  if (backupInterval.unref) backupInterval.unref();
}

/**
 * Re-evaluate notifications every hour. The /api/tasks PUT handler is the
 * primary scheduling trigger, but if the user leaves the browser closed
 * for days, no PUT happens — and tasks whose deadlines slide into the
 * 25h window won't get scheduled. This interval covers that case.
 */
let rescheduleInterval = null;
function startPeriodicReschedule(dataDir) {
  if (rescheduleInterval) clearInterval(rescheduleInterval);
  const HOUR = 60 * 60_000;
  rescheduleInterval = setInterval(() => {
    try { notifications.scheduleAll(storage.readTasks(dataDir)); } catch (_) {}
  }, HOUR);
  if (rescheduleInterval.unref) rescheduleInterval.unref();
}

module.exports = { start };
