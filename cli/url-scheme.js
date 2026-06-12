"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

/**
 * Two related Windows-registry registrations for Clearmind:
 *
 *   1) `clearmind://` URL scheme — so toast action buttons can invoke our
 *      local handler without bouncing through the browser.
 *   2) AppUserModelID `Clearmind` — required for Windows ToastGeneric to
 *      actually render the appLogoOverride icon + action buttons. Without
 *      this, ToastNotificationManager::CreateToastNotifier('Clearmind')
 *      fails silently and falls back to a generic notifier ('Microsoft.
 *      Windows.Explorer') which uses Explorer's icon and strips features.
 *
 * Both write to HKCU only — no admin needed.
 */

const SCHEME = "clearmind";
const AUM_ID = "Clearmind";

function registerUrlScheme({ nodeExe, handlerJs } = {}) {
  if (process.platform !== "win32") return { ok: false, reason: "non-win32" };

  const node = nodeExe || process.execPath;
  const handler = handlerJs || path.resolve(__dirname, "url-handler.js");

  // Use a .reg file rather than `reg.exe add` so we can safely embed paths
  // that contain spaces, backslashes, and quotes without per-arg quoting
  // gymnastics. regedit /s consumes it silently.
  const tmpReg = path.join(os.tmpdir(), `clearmind-url-scheme-${Date.now()}.reg`);
  const cmdLine = `\\"${node.replace(/\\/g, "\\\\")}\\" \\"${handler.replace(/\\/g, "\\\\")}\\" \\"%1\\"`;
  const content = [
    "Windows Registry Editor Version 5.00",
    "",
    `[HKEY_CURRENT_USER\\Software\\Classes\\${SCHEME}]`,
    `@="URL:Clearmind Protocol"`,
    `"URL Protocol"=""`,
    "",
    `[HKEY_CURRENT_USER\\Software\\Classes\\${SCHEME}\\DefaultIcon]`,
    `@="\\"${node.replace(/\\/g, "\\\\")}\\",1"`,
    "",
    `[HKEY_CURRENT_USER\\Software\\Classes\\${SCHEME}\\shell]`,
    "",
    `[HKEY_CURRENT_USER\\Software\\Classes\\${SCHEME}\\shell\\open]`,
    "",
    `[HKEY_CURRENT_USER\\Software\\Classes\\${SCHEME}\\shell\\open\\command]`,
    `@="${cmdLine}"`,
    "",
  ].join("\r\n");

  try {
    // UTF-16 LE w/ BOM is the canonical .reg encoding. ASCII works for our
    // content but we play safe — the cmdLine includes backslashes only.
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, "utf16le")]);
    fs.writeFileSync(tmpReg, buf);
    execFileSync("reg.exe", [
      "import", tmpReg,
    ], { windowsHide: true, stdio: "ignore" });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || String(e) };
  } finally {
    try { fs.unlinkSync(tmpReg); } catch (_) {}
  }
}

/** Verify the scheme is currently registered to our handler. Cheap check. */
function isRegistered() {
  if (process.platform !== "win32") return false;
  try {
    const out = execFileSync(
      "reg.exe",
      ["query", `HKCU\\Software\\Classes\\${SCHEME}\\shell\\open\\command`],
      { windowsHide: true, encoding: "utf8" }
    );
    return /url-handler\.js/i.test(out);
  } catch (_) {
    return false;
  }
}

/**
 * Register the Clearmind AppUserModelID with Windows so ToastNotificationManager
 * can find it. Writes:
 *   HKCU\Software\Classes\AppUserModelId\Clearmind
 *     DisplayName      = "Clearmind"
 *     IconUri          = absolute path to icon-256.png
 *     IconBackgroundColor = "#6366F1" (indigo brand)
 *
 * Without this entry, the ToastGeneric template's appLogoOverride image
 * never appears and action buttons may also be stripped — Windows decides
 * the notifier is "anonymous" and downgrades the toast template.
 */
function registerAumId({ iconPath } = {}) {
  if (process.platform !== "win32") return { ok: false, reason: "non-win32" };

  const icon = iconPath || path.resolve(__dirname, "assets", "icon-256.png");
  if (!fs.existsSync(icon)) {
    return { ok: false, reason: `Icon not found: ${icon}` };
  }
  // Backslashes in registry .reg-file values must be doubled.
  const iconEscaped = icon.replace(/\\/g, "\\\\");

  const tmpReg = path.join(os.tmpdir(), `clearmind-aum-${Date.now()}.reg`);
  const content = [
    "Windows Registry Editor Version 5.00",
    "",
    `[HKEY_CURRENT_USER\\Software\\Classes\\AppUserModelId\\${AUM_ID}]`,
    `"DisplayName"="${AUM_ID}"`,
    `"IconUri"="${iconEscaped}"`,
    `"IconBackgroundColor"="#6366F1"`,
    "",
  ].join("\r\n");

  try {
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(content, "utf16le"),
    ]);
    fs.writeFileSync(tmpReg, buf);
    execFileSync("reg.exe", ["import", tmpReg], {
      windowsHide: true,
      stdio: "ignore",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || String(e) };
  } finally {
    try { fs.unlinkSync(tmpReg); } catch (_) {}
  }
}

function isAumIdRegistered() {
  if (process.platform !== "win32") return false;
  try {
    const out = execFileSync(
      "reg.exe",
      ["query", `HKCU\\Software\\Classes\\AppUserModelId\\${AUM_ID}`, "/v", "IconUri"],
      { windowsHide: true, encoding: "utf8" }
    );
    return /icon-256\.png/i.test(out);
  } catch (_) {
    return false;
  }
}

module.exports = {
  registerUrlScheme,
  isRegistered,
  registerAumId,
  isAumIdRegistered,
  SCHEME,
  AUM_ID,
};
