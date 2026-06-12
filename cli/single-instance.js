"use strict";

const fs = require("node:fs");
const path = require("node:path");

const LOCK_FILE = "clearmind.lock";

function lockPath(dataDir) {
  return path.join(dataDir, LOCK_FILE);
}

function isPidAlive(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0); // signal 0: probe only
    return true;
  } catch (e) {
    return e && e.code === "EPERM"; // EPERM = exists, just can't signal
  }
}

async function probeHealth(port) {
  if (!port) return false;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(800),
    });
    if (!r.ok) return false;
    const j = await r.json();
    return !!(j && j.ok);
  } catch (_) {
    return false;
  }
}

function readLock(dataDir) {
  const file = lockPath(dataDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// PID-alive alone isn't enough: after reboot Windows can recycle our old PID
// to an unrelated process (CrossDeviceService.exe, etc.) and we'd refuse to
// start. Confirm the lock by hitting /api/health on the recorded port.
async function acquire(dataDir, port) {
  require("./storage").ensureDir(dataDir);
  const existing = readLock(dataDir);
  if (existing && isPidAlive(existing.pid) && await probeHealth(existing.port)) {
    return { acquired: false, existingPort: existing.port, existingPid: existing.pid };
  }
  const data = { pid: process.pid, port, startedAt: new Date().toISOString() };
  fs.writeFileSync(lockPath(dataDir), JSON.stringify(data, null, 2), "utf8");
  return { acquired: true };
}

function release(dataDir) {
  const file = lockPath(dataDir);
  try {
    const lock = readLock(dataDir);
    if (lock && lock.pid === process.pid) fs.unlinkSync(file);
  } catch (_) { /* swallow */ }
}

function readExisting(dataDir) {
  const lock = readLock(dataDir);
  if (lock && isPidAlive(lock.pid)) return lock;
  return null;
}

module.exports = { acquire, release, readExisting };
