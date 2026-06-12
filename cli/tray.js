"use strict";

const path = require("node:path");
const { readIconBase64, ensureIcons } = require("./icon");

// Always regenerate icons on tray init — cheap (~5ms) and ensures users
// who updated from an older Clearmind version see the new brand icon
// instead of the placeholder they had baked into cli/assets/.
ensureIcons({ force: true });
const { openBrowser, openFolder } = require("./open-browser");
const autostart = require("./autostart");
const storage = require("./storage");

/**
 * Resolve systray2 lazily so a missing native binary doesn't crash CLI mode
 * (e.g. `--no-tray` should still work on a fresh checkout).
 */
function loadSysTray() {
  try {
    return require("systray2").default;
  } catch (e) {
    return null;
  }
}

function buildMenu(ctx) {
  const isAuto = autostart.isEnabled();
  return {
    icon: readIconBase64(),
    isTemplateIcon: false,
    title: "Clearmind",
    tooltip: `Clearmind · port ${ctx.port}`,
    items: [
      { title: `Clearmind · port ${ctx.port}`, tooltip: "", checked: false, enabled: false },
      { title: "Mở Dashboard", tooltip: "Open dashboard in browser", checked: false, enabled: true },
      { title: "Thêm nhanh (Quick Capture)", tooltip: "", checked: false, enabled: true },
      { title: "Bắt đầu phiên Focus", tooltip: "", checked: false, enabled: true },
      SysTray.separator,
      { title: isAuto ? "✓ Khởi động cùng Windows" : "Khởi động cùng Windows", tooltip: "", checked: isAuto, enabled: true },
      { title: "Mở thư mục dữ liệu", tooltip: "", checked: false, enabled: true },
      { title: "Tạo backup ngay", tooltip: "", checked: false, enabled: true },
      SysTray.separator,
      { title: "Thoát", tooltip: "", checked: false, enabled: true },
    ],
  };
}

// Stub placeholder; replaced after systray2 loads (we still need
// `SysTray.separator` available at module load for buildMenu).
let SysTray = { separator: { title: "<SEPARATOR>", tooltip: "", checked: false, enabled: true } };

async function init(ctx) {
  const Lib = loadSysTray();
  if (!Lib) {
    console.warn("[clearmind] systray2 chưa được cài. Bỏ qua tray. (npm install trong cli/)");
    return null;
  }
  SysTray = Lib;
  // systray2 exposes `separator` as a static on the class.
  if (!SysTray.separator) SysTray.separator = { title: "<SEPARATOR>", tooltip: "", checked: false, enabled: true };

  const sys = new SysTray({
    menu: buildMenu(ctx),
    debug: false,
    copyDir: true, // extract native binary out of node_modules so packagers don't break it
  });

  const dashboardUrl = (suffix = "") => `http://localhost:${ctx.port}/dashboard${suffix}`;

  sys.onClick((action) => {
    // Indices follow buildMenu(); separators count toward seq_id.
    switch (action.seq_id) {
      case 1: // Mở Dashboard
        openBrowser(dashboardUrl());
        break;
      case 2: // Thêm nhanh
        openBrowser(dashboardUrl("?capture=1"));
        break;
      case 3: // Focus
        openBrowser(`http://localhost:${ctx.port}/focus?auto=1`);
        break;
      case 5: { // Toggle autostart
        const next = !autostart.isEnabled();
        if (next) autostart.enable(process.execPath, path.resolve(__dirname, "cli.js"));
        else autostart.disable();
        // Reflect new state in the menu.
        sys.sendAction({
          type: "update-item",
          item: {
            title: next ? "✓ Khởi động cùng Windows" : "Khởi động cùng Windows",
            tooltip: "",
            checked: next,
            enabled: true,
          },
          seq_id: 5,
        });
        break;
      }
      case 6: // Mở data folder
        openFolder(ctx.dataDir);
        break;
      case 7: { // Backup
        const r = storage.makeBackup(ctx.dataDir);
        if (r.ok) console.log("[clearmind] Backup:", r.path);
        break;
      }
      case 9: // Quit
        ctx.onQuit && ctx.onQuit();
        try { sys.kill(false); } catch (_) { /* ignore */ }
        break;
      default:
        break;
    }
  });

  await sys.ready();
  return sys;
}

module.exports = { init };
