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
//
// Concurrency: read-then-write of the lockfile used to leave a TOCTOU window
// where two simultaneous starts (double-click + VBS autostart firing at
// boot) could both pass the existing-check and both writeFileSync — last
// write wins, corrupting the recorded pid/port. We close that window with
// `flag: "wx"` (exclusive create — fails atomically if the file exists).
// Loser of the race observes EEXIST, re-reads the lock, and returns the
// winner's port/pid as if it had been there all along.
async function acquire(dataDir, port) {
  require("./storage").ensureDir(dataDir);
  const existing = readLock(dataDir);
  if (existing && isPidAlive(existing.pid) && await probeHealth(existing.port)) {
    return { acquired: false, existingPort: existing.port, existingPid: existing.pid };
  }
  // Stale lockfile (pid dead, recycled, or probe failed) — unlink so wx can
  // create. If two processes both reach here, only one's unlink+wx pair
  // succeeds; the other's wx hits EEXIST below.
  if (existing) {
    try { fs.unlinkSync(lockPath(dataDir)); } catch { /* already gone — race ok */ }
  }
  const data = { pid: process.pid, port, startedAt: new Date().toISOString() };
  try {
    fs.writeFileSync(lockPath(dataDir), JSON.stringify(data, null, 2), { encoding: "utf8", flag: "wx" });
    return { acquired: true };
  } catch (e) {
    if (e && e.code === "EEXIST") {
      const winner = readLock(dataDir);
      if (winner) {
        return { acquired: false, existingPort: winner.port, existingPid: winner.pid };
      }
      // Winner unlinked between our wx and our re-read — extremely rare.
      // Treat as a transient lock state and let caller retry/exit.
      return { acquired: false, existingPort: null, existingPid: null };
    }
    throw e;
  }
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
