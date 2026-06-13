"use strict";

const path = require("node:path");
const { readIconBase64, ensureIcons } = require("./icon");

// Always regenerate icons on tray init — cheap (~5ms) and ensures users
// who updated from an older Clearmind version see the new brand icon
// instead of the placeholder they had baked into cli/assets/.
ensureIcons({ force: true });
const { openBrowser } = require("./open-browser");
const autostart = require("./autostart");
const server = require("./server");

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

// Stub placeholder; replaced after systray2 loads (we still need
// `SysTray.separator` available at module load for buildMenu).
let SysTray = {
  separator: {
    title: "<SEPARATOR>",
    tooltip: "",
    checked: false,
    enabled: true,
  },
};

/**
 * Tray menu strings, by language.
 *
 * Source of truth for the language comes from `cli/server.js`'s
 * `clearmind.lang` file — same file the SPA writes via PUT /api/locale,
 * same file `cli/notifications.js` reads for toast titles. When the SPA
 * changes language via Settings → Ngôn ngữ, server fires our locale
 * listener (registered below) and the menu re-renders.
 *
 * Why inline VI/EN strings here instead of importing from the SPA's
 * i18n dictionary: the tray is a Node process, the SPA dict is a TS
 * file resolved through the Vite bundler. Duplicating ~10 short
 * strings is cheaper than wiring a build step.
 */
const STRINGS = {
  vi: {
    statusPrefix: "●  Clearmind",
    dashboard: "Mở Dashboard",
    dashboardTip: "Mở Dashboard trong trình duyệt",
    focus: "Bắt đầu phiên Focus",
    focusTip: "Mở /focus và bắt đầu Pomodoro 25 phút",
    restart: "Khởi động lại",
    restartTip: "Restart CLI server (giữ nguyên tasks, settings)",
    autostart: "Khởi động cùng Windows",
    autostartTip:
      "Mỗi lần Windows khởi động, Clearmind tự chạy ngầm (--tray --no-browser)",
    langSwitch: "Switch to English",
    langSwitchTip: "Đổi ngôn ngữ Clearmind sang Tiếng Anh (đồng bộ với web)",
    quit: "Thoát",
    quitTip: "Tắt CLI server. Web UI sẽ ngừng truy cập được.",
    tooltip: "Clearmind · port {port}",
  },
  en: {
    statusPrefix: "●  Clearmind",
    dashboard: "Open Dashboard",
    dashboardTip: "Open Dashboard in your default browser",
    focus: "Start Focus session",
    focusTip: "Open /focus and start a 25-minute Pomodoro",
    restart: "Restart",
    restartTip: "Restart CLI server (keeps tasks, settings, autostart)",
    autostart: "Start with Windows",
    autostartTip: "Auto-launch Clearmind on Windows boot (--tray --no-browser)",
    langSwitch: "Chuyển sang Tiếng Việt",
    langSwitchTip: "Switch Clearmind language to Vietnamese (syncs with web)",
    quit: "Quit",
    quitTip: "Stop the CLI server. The web UI will become unreachable.",
    tooltip: "Clearmind · port {port}",
  },
};

function buildMenu(ctx, lang) {
  const s = STRINGS[lang] || STRINGS.vi;
  const isAuto = autostart.isEnabled();
  return {
    icon: readIconBase64(),
    isTemplateIcon: false,
    title: "Clearmind",
    tooltip: s.tooltip.replace("{port}", String(ctx.port)),
    items: [
      {
        title: `${s.statusPrefix} · :${ctx.port}`,
        tooltip: `http://localhost:${ctx.port}`,
        checked: false,
        enabled: false,
      },
      SysTray.separator,
      { title: s.dashboard, tooltip: s.dashboardTip, checked: false, enabled: true },
      { title: s.focus, tooltip: s.focusTip, checked: false, enabled: true },
      SysTray.separator,
      { title: s.restart, tooltip: s.restartTip, checked: false, enabled: true },
      { title: s.autostart, tooltip: s.autostartTip, checked: isAuto, enabled: true },
      { title: s.langSwitch, tooltip: s.langSwitchTip, checked: false, enabled: true },
      SysTray.separator,
      { title: s.quit, tooltip: s.quitTip, checked: false, enabled: true },
    ],
  };
}

// seq_id mapping for the menu above. Separators count toward sequence.
const ID = {
  // 0 status (disabled)
  // 1 separator
  DASHBOARD: 2,
  FOCUS: 3,
  // 4 separator
  RESTART: 5,
  AUTOSTART: 6,
  LANG_SWITCH: 7,
  // 8 separator
  QUIT: 9,
};

async function init(ctx) {
  const Lib = loadSysTray();
  if (!Lib) {
    console.warn(
      "[clearmind] systray2 chưa được cài. Bỏ qua tray. (npm install trong cli/)"
    );
    return null;
  }
  SysTray = Lib;
  if (!SysTray.separator)
    SysTray.separator = {
      title: "<SEPARATOR>",
      tooltip: "",
      checked: false,
      enabled: true,
    };

  // Current language — read from disk once at boot. Updated in-process
  // via the locale change listener below (no extra disk reads needed).
  let currentLang = server.readLocale(ctx.dataDir);

  const sys = new SysTray({
    menu: buildMenu(ctx, currentLang),
    debug: false,
    copyDir: true,
  });

  const dashboardUrl = (suffix = "") =>
    `http://localhost:${ctx.port}/dashboard${suffix}`;

  // Re-translate every menu item without re-creating the tray. systray2
  // doesn't expose a "swap full menu" op, so we update each item slot
  // individually. Same approach the autostart toggle has used since the
  // tray's first version — proven cheap (sub-ms per update).
  function applyLocale(lang) {
    currentLang = lang;
    const s = STRINGS[lang] || STRINGS.vi;
    const isAuto = autostart.isEnabled();
    const updates = [
      [
        0,
        { title: `${s.statusPrefix} · :${ctx.port}`, tooltip: `http://localhost:${ctx.port}`, checked: false, enabled: false },
      ],
      [ID.DASHBOARD, { title: s.dashboard, tooltip: s.dashboardTip, checked: false, enabled: true }],
      [ID.FOCUS, { title: s.focus, tooltip: s.focusTip, checked: false, enabled: true }],
      [ID.RESTART, { title: s.restart, tooltip: s.restartTip, checked: false, enabled: true }],
      [ID.AUTOSTART, { title: s.autostart, tooltip: s.autostartTip, checked: isAuto, enabled: true }],
      [ID.LANG_SWITCH, { title: s.langSwitch, tooltip: s.langSwitchTip, checked: false, enabled: true }],
      [ID.QUIT, { title: s.quit, tooltip: s.quitTip, checked: false, enabled: true }],
    ];
    for (const [seq_id, item] of updates) {
      sys.sendAction({ type: "update-item", item, seq_id });
    }
  }

  // Wire: SPA changes language via Settings → server fires this → menu
  // re-translates. Same wire fires when the tray's own toggle below
  // writes a new locale (server.writeLocale calls listeners).
  const unsubscribe = server.onLocaleChange((lang) => applyLocale(lang));

  sys.onClick((action) => {
    switch (action.seq_id) {
      case ID.DASHBOARD:
        openBrowser(dashboardUrl());
        break;
      case ID.FOCUS:
        openBrowser(`http://localhost:${ctx.port}/focus?auto=1`);
        break;

      case ID.RESTART:
        if (ctx.onRestart) ctx.onRestart();
        break;

      case ID.AUTOSTART: {
        const next = !autostart.isEnabled();
        if (next)
          autostart.enable(process.execPath, path.resolve(__dirname, "cli.js"));
        else autostart.disable();
        const s = STRINGS[currentLang] || STRINGS.vi;
        sys.sendAction({
          type: "update-item",
          item: {
            title: s.autostart,
            tooltip: s.autostartTip,
            checked: next,
            enabled: true,
          },
          seq_id: ID.AUTOSTART,
        });
        break;
      }

      case ID.LANG_SWITCH: {
        // Toggle VI ⇄ EN. `server.writeLocale` does two things at once:
        //   1. Fires in-process locale listeners — `applyLocale` above
        //      re-translates this menu's items immediately.
        //   2. Broadcasts a `locale-changed` SSE event so every open
        //      SPA tab mirrors the change in real time (the
        //      EventSource subscription lives in src/lib/i18n/index.tsx).
        // No reload needed on either side.
        const next = currentLang === "vi" ? "en" : "vi";
        server.writeLocale(ctx.dataDir, next);
        break;
      }

      case ID.QUIT:
        if (unsubscribe) unsubscribe();
        ctx.onQuit && ctx.onQuit();
        try {
          sys.kill(false);
        } catch (_) {
          /* ignore */
        }
        break;

      default:
        break;
    }
  });

  await sys.ready();
  return sys;
}

module.exports = { init };
