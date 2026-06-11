"use strict";

// Interactive arrow-key menu for `clearmind`. Lấy cảm hứng 9router:
//   ↑/↓ chọn · Enter xác nhận · Esc/q thu nhỏ (giữ service chạy ngầm)

const readline = require("node:readline");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const { openBrowser } = require("./open-browser");
const singleInstance = require("./single-instance");
const storage = require("./storage");
const autostart = require("./autostart");

// ANSI
const R = "\x1b[0m", DIM = "\x1b[2m", B = "\x1b[1m";
const CYAN = "\x1b[36m", GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m";

const BANNER = `${CYAN}${B}╭──────────────────────────────────────╮
│            C L E A R M I N D         │
╰──────────────────────────────────────╯${R}`;

// ---- helpers ----

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => n.toString().padStart(2, "0");
const fmtTime = (ms) => {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

async function probeHealth(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ok ? j : null;
  } catch (_) { return null; }
}

async function detectRunning(dataDir) {
  const lock = singleInstance.readExisting(dataDir);
  if (!lock) return null;
  return await probeHealth(lock.port);
}

async function callApi(running, pathname, init) {
  const r = await fetch(`http://127.0.0.1:${running.port}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init && init.headers) },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function startServiceDetached(port, dataDir) {
  const args = [path.resolve(__dirname, "cli.js"), "--tray", "--skip-update", `--port=${port}`];
  if (dataDir) args.push(`--data-dir=${dataDir}`);
  const child = spawn(process.execPath, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

async function waitForRunning(dataDir, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await detectRunning(dataDir);
    if (r) return r;
    await sleep(250);
  }
  return null;
}

// ---- keyboard core ----

// Generic arrow-key picker. Returns chosen index, or -1 if Esc/q.
function pick({ title, subtitle, items, initial = 0 }) {
  return new Promise((resolve) => {
    let cursor = Math.max(0, Math.min(items.length - 1, initial));
    let active = true;

    const render = () => {
      console.clear();
      console.log(BANNER);
      if (subtitle) console.log("  " + subtitle);
      if (title) console.log(`\n  ${B}${title}${R}\n`);
      else console.log();
      items.forEach((it, i) => {
        const line = i === cursor
          ? `  ${CYAN}❯${R} ${B}${it.label}${R}${it.hint ? "  " + it.hint : ""}`
          : `    ${DIM}${it.label}${R}${it.hint ? "  " + DIM + it.hint + R : ""}`;
        console.log(line);
      });
      console.log(`\n  ${DIM}↑/↓ chọn · Enter xác nhận · Esc thu nhỏ${R}`);
    };

    const onKey = (_str, key) => {
      if (!active || !key) return;
      if (key.ctrl && key.name === "c") { cleanup(); process.exit(0); }
      if (key.name === "up" || key.name === "k") { cursor = (cursor - 1 + items.length) % items.length; render(); }
      else if (key.name === "down" || key.name === "j") { cursor = (cursor + 1) % items.length; render(); }
      else if (key.name === "return") { cleanup(); resolve(cursor); }
      else if (key.name === "escape" || key.name === "q") { cleanup(); resolve(-1); }
      // Number shortcut
      else if (/^[1-9]$/.test(key.sequence || "")) {
        const n = parseInt(key.sequence, 10) - 1;
        if (n < items.length) { cleanup(); resolve(n); }
      }
    };

    const cleanup = () => {
      active = false;
      process.stdin.off("keypress", onKey);
      try { process.stdin.setRawMode(false); } catch (_) {}
      process.stdin.pause();
    };

    process.stdin.resume();
    try { process.stdin.setRawMode(true); } catch (_) {}
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on("keypress", onKey);
    render();
  });
}

// Block until any key. Used after info screens.
function waitKey(prompt = "Enter để quay lại...") {
  return new Promise((resolve) => {
    process.stdout.write(`\n  ${DIM}${prompt}${R}`);
    const onKey = (_s, key) => {
      if (key && key.ctrl && key.name === "c") process.exit(0);
      cleanup(); resolve();
    };
    const cleanup = () => {
      process.stdin.off("keypress", onKey);
      try { process.stdin.setRawMode(false); } catch (_) {}
      process.stdin.pause();
    };
    process.stdin.resume();
    try { process.stdin.setRawMode(true); } catch (_) {}
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on("keypress", onKey);
  });
}

// ---- actions ----

// Gom history slots + backups recent thành danh sách để pick.
function listRecoverable(dataDir) {
  const entries = [];
  for (const s of storage.getHistoryInfo(dataDir)) {
    if (!s.exists) continue;
    entries.push({
      source: "history", version: s.version,
      label: `${B}slot ${s.version}${R}   ${fmtTime(s.mtime || 0)}   ${s.count || 0} task`,
      count: s.count || 0, mtime: s.mtime || 0,
    });
  }
  const backupDir = path.join(dataDir, "backups");
  if (fs.existsSync(backupDir)) {
    fs.readdirSync(backupDir).filter((n) => n.endsWith(".json")).map((n) => {
      const p = path.join(backupDir, n);
      const st = fs.statSync(p);
      let count = 0;
      try {
        const d = JSON.parse(fs.readFileSync(p, "utf8"));
        count = Array.isArray(d) ? d.length : (d && d.tasks ? d.tasks.length : 0);
      } catch (_) {}
      return { path: p, name: n, mtime: st.mtimeMs, count };
    }).sort((a, b) => b.mtime - a.mtime).slice(0, 8).forEach((b) => {
      entries.push({
        source: "backup", path: b.path,
        label: `${DIM}backup${R}   ${fmtTime(b.mtime)}   ${b.count} task`,
        count: b.count, mtime: b.mtime,
      });
    });
  }
  return entries;
}

async function actionRecover(running, dataDir) {
  const entries = listRecoverable(dataDir);
  if (!entries.length) {
    console.clear(); console.log(BANNER);
    console.log(`\n  ${DIM}Không có history hay backup để khôi phục.${R}`);
    await waitKey();
    return;
  }
  const idx = await pick({
    title: "Khôi phục dữ liệu",
    subtitle: `${DIM}Chọn nguồn để xem trước rồi xác nhận.${R}`,
    items: entries.map((e) => ({ label: e.label })),
  });
  if (idx < 0) return;
  const chosen = entries[idx];

  // Read selected payload
  let tasks = [];
  try {
    const file = chosen.source === "history"
      ? path.join(dataDir, `clearmind.previous-${chosen.version}.json`)
      : chosen.path;
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    tasks = Array.isArray(d) ? d : (d.tasks || []);
  } catch (e) {
    console.clear(); console.log(BANNER);
    console.log(`\n  ${RED}Không đọc được file: ${e.message}${R}`);
    await waitKey(); return;
  }

  // Preview + confirm
  console.clear(); console.log(BANNER);
  console.log(`\n  ${B}Preview${R}  ${DIM}(${tasks.length} task)${R}\n`);
  tasks.slice(0, 8).forEach((t, i) => {
    const due = t.deadline ? `${DIM} · ${t.deadline.slice(0, 16).replace("T", " ")}${R}` : "";
    console.log(`    ${DIM}${pad(i + 1)}.${R} ${t.title || "(no title)"}${due}`);
  });
  if (tasks.length > 8) console.log(`    ${DIM}…và ${tasks.length - 8} task nữa${R}`);

  const confirm = await pick({
    title: "Khôi phục bản này?",
    subtitle: `${DIM}Current sẽ được backup trước khi đè.${R}`,
    items: [{ label: `${GREEN}Đồng ý${R}` }, { label: "Huỷ" }],
    initial: 1,
  });
  if (confirm !== 0) return;

  // Always snapshot current first → restore itself is reversible.
  try { running ? await callApi(running, "/api/backup", { method: "POST" }) : storage.makeBackup(dataDir); }
  catch (_) {}

  let msg;
  try {
    if (chosen.source === "history") {
      if (running) {
        const r = await callApi(running, `/api/recover?version=${chosen.version}`, { method: "POST" });
        msg = r.ok ? `${GREEN}✓ Khôi phục ${r.count} task.${R}` : `${RED}✗ ${r.error}${R}`;
      } else {
        const r = storage.recover(dataDir, chosen.version);
        msg = r.ok ? `${GREEN}✓ Khôi phục ${r.count} task.${R}` : `${RED}✗ ${r.error}${R}`;
      }
    } else {
      if (running) await callApi(running, "/api/tasks", { method: "PUT", body: JSON.stringify({ tasks }) });
      else storage.writeTasks(dataDir, tasks);
      msg = `${GREEN}✓ Đã ghi ${tasks.length} task từ backup.${R}`;
    }
  } catch (e) { msg = `${RED}✗ ${e.message}${R}`; }

  console.clear(); console.log(BANNER);
  console.log(`\n  ${msg}`);
  await waitKey();
}

async function actionStart(port, dataDir) {
  console.clear(); console.log(BANNER);
  console.log(`\n  ${YELLOW}Đang khởi động service…${R}`);
  startServiceDetached(port, dataDir);
  const next = await waitForRunning(dataDir);
  console.log(next
    ? `  ${GREEN}✓ Service chạy trên port ${next.port}.${R}`
    : `  ${RED}✗ Không phát hiện service trong 8s.${R}`);
  await waitKey();
}

async function actionRestart(running, port, dataDir) {
  console.clear(); console.log(BANNER);
  console.log(`\n  ${YELLOW}Dừng service…${R}`);
  try { await callApi(running, "/api/quit", { method: "POST" }); } catch (_) {}
  await sleep(600);
  console.log(`  ${YELLOW}Khởi động lại…${R}`);
  startServiceDetached(port, dataDir);
  const next = await waitForRunning(dataDir);
  console.log(next
    ? `  ${GREEN}✓ Service chạy lại trên port ${next.port}.${R}`
    : `  ${RED}✗ Không phát hiện service trong 8s.${R}`);
  await waitKey();
}

async function actionStop(running) {
  const ok = await pick({
    title: "Dừng hoàn toàn service?",
    subtitle: `${DIM}Tray icon biến mất, deadline không bắn toast tới khi mở lại.${R}`,
    items: [{ label: `${RED}Dừng${R}` }, { label: "Huỷ" }],
    initial: 1,
  });
  if (ok !== 0) return false;
  try { await callApi(running, "/api/quit", { method: "POST" }); } catch (_) {}
  await sleep(500);
  return true;
}

function toggleAutostart() {
  const next = !autostart.isEnabled();
  if (next) autostart.enable(process.execPath, path.resolve(__dirname, "cli.js"));
  else autostart.disable();
  return next;
}

// ---- main loop ----

async function runMenu({ dataDir, port, version }) {
  // Cleanup on signals — leave terminal in cooked mode no matter how we exit.
  const restore = () => { try { process.stdin.setRawMode(false); } catch (_) {} };
  process.on("exit", restore);
  process.on("SIGINT", () => { restore(); process.exit(0); });

  while (true) {
    const running = await detectRunning(dataDir);
    const auto = autostart.isEnabled();

    const status = running
      ? `${GREEN}●${R} đang chạy  ${DIM}port ${running.port} · v${running.version}${R}`
      : `${RED}●${R} chưa chạy   ${DIM}v${version}${R}`;
    const subtitle = `  ${status}\n  ${DIM}${dataDir}${R}`;

    // Slim menu — chỉ giữ những gì cần
    const items = running
      ? [
          { id: "open",     label: "Mở Dashboard" },
          { id: "recover",  label: "Khôi phục dữ liệu" },
          { id: "auto",     label: `Khởi động cùng Windows  ${auto ? GREEN + "[BẬT]" + R : DIM + "[TẮT]" + R}` },
          { id: "restart",  label: "Khởi động lại service" },
          { id: "stop",     label: `${RED}Dừng service${R}` },
          { id: "minimize", label: `${DIM}Thu nhỏ (giữ chạy ngầm)${R}` },
        ]
      : [
          { id: "start",    label: `${GREEN}Khởi động service${R}` },
          { id: "recover",  label: "Khôi phục dữ liệu" },
          { id: "auto",     label: `Khởi động cùng Windows  ${auto ? GREEN + "[BẬT]" + R : DIM + "[TẮT]" + R}` },
          { id: "exit",     label: `${DIM}Thoát${R}` },
        ];

    const idx = await pick({ subtitle, items });
    if (idx < 0) { restore(); return; } // Esc = minimize

    const action = items[idx].id;
    if (action === "open" && running) openBrowser(`http://localhost:${running.port}/dashboard`);
    else if (action === "recover") await actionRecover(running, dataDir);
    else if (action === "auto") toggleAutostart();
    else if (action === "restart" && running) await actionRestart(running, port, dataDir);
    else if (action === "stop" && running) { if (await actionStop(running)) continue; }
    else if (action === "start") await actionStart(port, dataDir);
    else if (action === "minimize" || action === "exit") { restore(); return; }
  }
}

module.exports = { runMenu };
