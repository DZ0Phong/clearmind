"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

/**
 * Register the `clearmind://` URL scheme on Windows so toast action buttons
 * can invoke our local handler without bouncing through the browser.
 *
 * The handler script is `url-handler.js`; it runs in a hidden Node process
 * (windowsHide on the bundled launcher), bridges to the local CLI server,
 * and exits.
 *
 * Idempotent — re-registering on every startup also self-heals if the user
 * moved their node/clearmind install paths.
 */

const SCHEME = "clearmind";

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

module.exports = { registerUrlScheme, isRegistered, SCHEME };
