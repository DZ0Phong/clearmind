#!/usr/bin/env node
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const storage = require("./storage");
const singleInstance = require("./single-instance");
const { openBrowser } = require("./open-browser");
const server = require("./server");

const VERSION = require("./package.json").version;
const DEFAULT_PORT = 20129;

/**
 * Resolve the location of the built SPA (`dist/`). We try several places so
 * `clearmind` works whether invoked from the project, via `npm link`, or
 * via `npm install -g` (which copies cli/ into a global path far from the
 * original dist/).
 */
function findDistDir() {
  const candidates = [
    process.env.CLEARMIND_DIST_DIR,
    path.resolve(__dirname, "..", "dist"),  // repo: cli/ next to dist/
    path.resolve(__dirname, "dist"),         // bundled: cli/dist/
    path.resolve(process.cwd(), "dist"),     // invoked from project root
  ];
  for (const dir of candidates) {
    if (!dir) continue;
    try {
      if (fs.existsSync(path.join(dir, "index.html"))) return dir;
    } catch (_) { /* ignore */ }
  }
  // Fall through to the most likely-correct one for diagnostic error msg.
  return path.resolve(__dirname, "..", "dist");
}
const DIST_DIR = findDistDir();

function parseArgs(argv) {
  const opts = {
    port: DEFAULT_PORT,
    noBrowser: false,
    noTray: false,
    tray: false,
    skipUpdate: false,
    help: false,
    version: false,
    dataDir: null,
    menu: false,
    noMenu: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--version" || a === "-v") opts.version = true;
    else if (a === "--no-browser") opts.noBrowser = true;
    else if (a === "--no-tray") opts.noTray = true;
    else if (a === "--tray") opts.tray = true;
    else if (a === "--skip-update") opts.skipUpdate = true;
    else if (a === "--menu") opts.menu = true;
    else if (a === "--no-menu") opts.noMenu = true;
    else if (a === "--port") opts.port = parseInt(argv[++i], 10) || DEFAULT_PORT;
    else if (a.startsWith("--port=")) opts.port = parseInt(a.slice(7), 10) || DEFAULT_PORT;
    else if (a === "--data-dir") opts.dataDir = argv[++i];
    else if (a.startsWith("--data-dir=")) opts.dataDir = a.slice(11);
  }
  return opts;
}

function printHelp() {
  console.log(`Clearmind v${VERSION} — chạy ngầm bộ não phụ trên máy bạn.

Cách dùng:
  clearmind                 Mở menu tương tác (đề xuất)
  clearmind --no-menu       Mở dashboard ngay (legacy, không hiện menu)
  clearmind --tray          Chạy nền + system tray icon (dùng cho autostart)
  clearmind --no-browser    Không tự mở browser
  clearmind --no-tray       Không khởi động tray
  clearmind --port N        Đổi port (mặc định ${DEFAULT_PORT})
  clearmind --data-dir DIR  Lưu data ở folder khác (mặc định %APPDATA%/Clearmind)
  clearmind --help          Hiển thị help này
  clearmind --version       In version

Dashboard:   http://localhost:${DEFAULT_PORT}/dashboard
Data:        ${storage.defaultDataDir()}
`);
}

async function checkExisting(dataDir) {
  const lock = singleInstance.readExisting(dataDir);
  if (!lock) return null;
  // Probe /api/health to confirm it's actually serving (not a stale lockfile
  // pointing at a recycled PID that happens to live).
  try {
    const r = await fetch(`http://127.0.0.1:${lock.port}/api/health`, {
      signal: AbortSignal.timeout(800),
    });
    if (r.ok) {
      const j = await r.json();
      if (j && j.ok) return lock;
    }
  } catch (_) { /* not actually serving */ }
  return null;
}

async function runForeground(opts, dataDir) {
  storage.ensureDir(dataDir);

  // Generate icon assets up-front so toast notifications + tray both find
  // them. tray.js does this on its own require(), but with --no-tray
  // (autostart of toast-only mode) we'd otherwise miss the 256px PNG.
  try { require("./icon").ensureIcons(); } catch (_) {}

  // Acquire single-instance lock so a second `clearmind --tray` boot-launch
  // can't race against a manually-started one.
  const acq = await singleInstance.acquire(dataDir, opts.port);
  if (!acq.acquired) {
    console.log(`[clearmind] Đã có instance chạy ở port ${acq.existingPort}. Mở dashboard.`);
    if (!opts.noBrowser) openBrowser(`http://localhost:${acq.existingPort}/dashboard`);
    return;
  }

  // Register Windows bits:
  //   1) `clearmind://` URL scheme — so toast action buttons can invoke our
  //      local handler silently (no browser flash).
  //   2) AppUserModelID `Clearmind` — without this, ToastGeneric template
  //      logo + actions don't render (Windows can't resolve the notifier).
  // Both are HKCU writes, idempotent, self-heal on path changes.
  try {
    const { registerUrlScheme, registerAumId } = require("./url-scheme");
    const r1 = registerUrlScheme();
    if (!r1.ok && r1.reason !== "non-win32") {
      console.warn("[clearmind] URL scheme register skipped:", r1.reason);
    }
    const r2 = registerAumId();
    if (!r2.ok && r2.reason !== "non-win32") {
      console.warn("[clearmind] AUM ID register skipped:", r2.reason);
    }
  } catch (e) {
    console.warn("[clearmind] Windows registry setup failed:", e && e.message);
  }

  let { server: httpServer, port: actualPort } = await server.start({
    distDir: DIST_DIR,
    dataDir,
    port: opts.port,
    version: VERSION,
  });

  // Update lock with the port we actually got (port retry may have shifted it).
  singleInstance.release(dataDir);
  await singleInstance.acquire(dataDir, actualPort);

  console.log(`[clearmind] http://localhost:${actualPort}/dashboard  (data: ${dataDir})`);

  let trayHandle = null;
  if (!opts.noTray) {
    try {
      const tray = require("./tray");
      trayHandle = await tray.init({
        port: actualPort,
        dataDir,
        onQuit: () => shutdown("tray"),
        onRestart: () => restart("tray"),
      });
    } catch (e) {
      console.warn("[clearmind] Tray không init được:", e && e.message);
    }
  }

  // Restart from tray — detached-spawn a new tray child with the same
  // resolved port + data dir, then graceful-shutdown self. The child is
  // unrefed so it survives our exit.
  function restart(reason) {
    console.log(`[clearmind] Đang khởi động lại (${reason})...`);
    const cliJs = path.resolve(__dirname, "cli.js");
    const childArgs = [
      cliJs,
      "--tray",
      "--skip-update",
      "--no-browser",
      `--port=${actualPort}`,
    ];
    if (opts.dataDir) childArgs.push(`--data-dir=${opts.dataDir}`);
    const child = spawn(process.execPath, childArgs, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    // Brief gap so the child binds its lockfile + http server before we
    // release ours. Without this the child might race and find the lock
    // still held, then exit early as "already running".
    setTimeout(() => shutdown("restart"), 350);
  }

  if (!opts.noBrowser && !opts.tray) {
    // When foreground (i.e. user typed `clearmind` directly), open the browser.
    // When --tray (boot-launched), do NOT auto-open — user just wants the icon.
    openBrowser(`http://localhost:${actualPort}/dashboard`);
  }

  let shuttingDown = false;
  function shutdown(reason) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[clearmind] Đang dừng (${reason})...`);
    try { trayHandle && trayHandle.kill && trayHandle.kill(false); } catch (_) {}
    try { httpServer.close(); } catch (_) {}
    singleInstance.release(dataDir);
    setTimeout(() => process.exit(0), 200);
  }
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGHUP",  () => shutdown("SIGHUP"));
  process.on("exit",    () => singleInstance.release(dataDir));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return printHelp();
  if (opts.version) return console.log(VERSION);

  const dataDir = opts.dataDir ? path.resolve(opts.dataDir) : storage.defaultDataDir();

  // Default UX: when user runs `clearmind` from a terminal with no flags,
  // show the interactive menu (instead of force-opening browser + exiting).
  // Skip menu when: --tray (VBS autostart), --no-menu (legacy), or stdout
  // isn't a TTY (piped, GUI launcher, etc.).
  const wantsMenu =
    opts.menu || (!opts.tray && !opts.noMenu && process.stdin.isTTY && process.stdout.isTTY);

  if (wantsMenu) {
    storage.ensureDir(dataDir);
    const menu = require("./menu");
    await menu.runMenu({ dataDir, port: opts.port, version: VERSION });
    return;
  }

  // 1) If something is already serving, just open the browser & exit.
  const existing = await checkExisting(dataDir);
  if (existing) {
    console.log(
      opts.noBrowser
        ? `[clearmind] Đã chạy ở port ${existing.port}.`
        : `[clearmind] Đã chạy ở port ${existing.port}. Mở dashboard.`
    );
    if (!opts.noBrowser) openBrowser(`http://localhost:${existing.port}/dashboard`);
    return;
  }

  // 2) If user invoked WITHOUT --tray on Win/Linux, detach a tray child and exit.
  //    macOS keeps the foreground process because NSStatusItem doesn't survive detach.
  if (!opts.tray && !opts.noTray && process.platform !== "darwin") {
    const cliJs = path.resolve(__dirname, "cli.js");
    const childArgs = [cliJs, "--tray", "--skip-update", `--port=${opts.port}`];
    if (opts.dataDir) childArgs.push(`--data-dir=${opts.dataDir}`);
    if (opts.noBrowser) childArgs.push("--no-browser");
    const child = spawn(process.execPath, childArgs, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    // Give the child a beat to bind, then open the browser ourselves so the
    // user gets instant feedback even before the tray icon shows up.
    if (!opts.noBrowser) {
      setTimeout(() => openBrowser(`http://localhost:${opts.port}/dashboard`), 1200);
    }
    console.log(`[clearmind] Đã khởi động ngầm trên port ${opts.port}.`);
    // Don't exit immediately — let the openBrowser timer fire first.
    setTimeout(() => process.exit(0), 1500);
    return;
  }

  // 3) Foreground mode: serve + tray (the actual workhorse).
  await runForeground(opts, dataDir);
}

main().catch((e) => {
  console.error("[clearmind] FATAL:", e && (e.stack || e.message || e));
  process.exit(1);
});
