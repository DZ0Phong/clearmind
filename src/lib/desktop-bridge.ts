/**
 * Bridge between the Clearmind SPA and the native Tauri desktop shell.
 *
 * The SAME SPA runs on the web, in the CLI host, on mobile, and inside the
 * desktop app — so every function here MUST be a safe no-op (or sensible
 * default) when `window.__TAURI_INTERNALS__` is absent. We never throw in a
 * plain browser.
 *
 * Design choice: we use ONLY core-window + first-party plugin commands
 * (window controls, app version, updater, autostart). These are gated by
 * explicit capability permissions (see src-tauri/capabilities/default.json)
 * that are known to work from the app's REMOTE host URL
 * (http://localhost:20129) as well as the bundled `tauri://` fallback — unlike
 * app-defined custom commands, whose remote-IPC behaviour is murky. Zero
 * custom Rust commands are needed.
 */
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  enable as autoEnable,
  disable as autoDisable,
  isEnabled as autoIsEnabled,
} from "@tauri-apps/plugin-autostart";
import { inlineSettings, isCliMode, cliPutSettings } from "@/lib/cli-bridge";

/** True only inside the Tauri desktop app (any window). */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

async function safeWindow(label: string): Promise<Window | null> {
  if (!isTauri()) return null;
  try {
    return (await Window.getByLabel(label)) ?? null;
  } catch {
    return null;
  }
}

/* ----------------------------- Window chrome ---------------------------- */
// Used by the custom titlebar (main window) and the widget controls.

export async function winMinimize(): Promise<void> {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().minimize();
  } catch {
    /* ignore */
  }
}

export async function winToggleMaximize(): Promise<void> {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().toggleMaximize();
  } catch {
    /* ignore */
  }
}

/** Close the current window — Rust intercepts CloseRequested and hides it to
 *  the tray, so the app keeps running in the background (matches the X). */
export async function winClose(): Promise<void> {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().close();
  } catch {
    /* ignore */
  }
}

export async function winIsMaximized(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await getCurrentWindow().isMaximized();
  } catch {
    return false;
  }
}

/* ------------------------------- Widget --------------------------------- */

/** Pin / unpin the CURRENT window on top (called from inside the widget). */
export async function setCurrentAlwaysOnTop(pin: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().setAlwaysOnTop(pin);
  } catch {
    /* ignore */
  }
}

/** Hide the CURRENT window (the widget's "minimize" = tuck away to tray). */
export async function hideCurrent(): Promise<void> {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().hide();
  } catch {
    /* ignore */
  }
}

/** Show the CURRENT window (the widget reveals itself on mount per its pref). */
export async function showCurrent(): Promise<void> {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().show();
  } catch {
    /* ignore */
  }
}

/** Bring the MAIN app window to the front (the widget's "open app" button). */
export async function openMainWindow(): Promise<void> {
  const w = await safeWindow("main");
  if (!w) return;
  try {
    await w.show();
    await w.unminimize();
    await w.setFocus();
  } catch {
    /* ignore */
  }
}

/** Show / hide the WIDGET window from the main app (Settings toggle, tray). */
export async function setWidgetVisible(visible: boolean): Promise<void> {
  const w = await safeWindow("widget");
  if (!w) return;
  try {
    if (visible) {
      await w.show();
      await w.setFocus();
    } else {
      await w.hide();
    }
  } catch {
    /* ignore */
  }
}

export async function isWidgetVisible(): Promise<boolean> {
  const w = await safeWindow("widget");
  if (!w) return false;
  try {
    return await w.isVisible();
  } catch {
    return false;
  }
}

/** Pin / unpin the WIDGET on top from the main app (Settings toggle). */
export async function setWidgetAlwaysOnTop(pin: boolean): Promise<void> {
  const w = await safeWindow("widget");
  if (!w) return;
  try {
    await w.setAlwaysOnTop(pin);
  } catch {
    /* ignore */
  }
}

/* --------------------------- Version + updater -------------------------- */

/** Installed app version (e.g. "0.9.0"). Empty string outside the app. */
export async function appVersion(): Promise<string> {
  if (!isTauri()) return "";
  try {
    return await getVersion();
  } catch {
    return "";
  }
}

export interface UpdateInfo {
  available: boolean;
  /** The newer version, when one is available. */
  version?: string;
  /** Release notes / changelog body, when provided. */
  notes?: string;
}

/** Ask GitHub Releases (via the signed `latest.json`) whether a newer build
 *  exists. Never throws — returns `{ available: false }` on any error. */
export async function checkForUpdate(): Promise<UpdateInfo> {
  if (!isTauri()) return { available: false };
  try {
    const update = await check();
    if (update) {
      return { available: true, version: update.version, notes: update.body };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

/** Download + install the available update, then relaunch into it.
 *  `onProgress` reports 0–100. Returns true if it kicked off install. */
export async function downloadAndInstallUpdate(
  onProgress?: (pct: number) => void
): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const update = await check();
    if (!update) return false;
    let total = 0;
    let downloaded = 0;
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? 0;
          onProgress?.(0);
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          if (total > 0) onProgress?.(Math.min(100, Math.round((downloaded / total) * 100)));
          break;
        case "Finished":
          onProgress?.(100);
          break;
      }
    });
    await relaunch();
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------ Autostart ------------------------------- */
// The app's OWN "start with Windows" (distinct from the CLI host's autostart,
// which Settings still exposes separately when running under the CLI).

export async function getAppAutostart(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await autoIsEnabled();
  } catch {
    return false;
  }
}

export async function setAppAutostart(enabled: boolean): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    if (enabled) await autoEnable();
    else await autoDisable();
    return await autoIsEnabled();
  } catch {
    return false;
  }
}

/* --------------------------- Widget preferences ------------------------- */
// Persisted through the shared CLI settings store (so they survive restarts
// and stay consistent between the widget window and the main window's Settings
// card), with a localStorage fallback for standalone/bundled mode.

export const WIDGET_PINNED_KEY = "widgetPinned";
export const WIDGET_SHOW_ON_STARTUP_KEY = "widgetShowOnStartup";

export function getWidgetPref(key: string, fallback: boolean): boolean {
  try {
    if (isCliMode()) {
      const v = inlineSettings()?.[key];
      if (typeof v === "boolean") return v;
    }
    const ls = localStorage.getItem(key);
    if (ls === "true") return true;
    if (ls === "false") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function setWidgetPref(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
  if (isCliMode()) cliPutSettings({ [key]: value }).catch(() => {});
}
