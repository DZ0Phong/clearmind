"use strict";

const { spawn } = require("node:child_process");

function openBrowser(url) {
  try {
    if (process.platform === "win32") {
      // `start` is a cmd builtin; the empty string is the window title placeholder
      // so URLs with `&` don't get mis-parsed.
      spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
      return;
    }
    if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch (e) {
    console.warn("[clearmind] Không mở được browser:", e && e.message);
  }
}

function openFolder(dir) {
  try {
    if (process.platform === "win32") {
      spawn("explorer.exe", [dir], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    if (process.platform === "darwin") {
      spawn("open", [dir], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    spawn("xdg-open", [dir], { detached: true, stdio: "ignore" }).unref();
  } catch (e) {
    console.warn("[clearmind] Không mở được folder:", e && e.message);
  }
}

module.exports = { openBrowser, openFolder };
