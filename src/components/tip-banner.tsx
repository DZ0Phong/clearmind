import { useEffect, useMemo, useState } from "react";
import { Lightbulb, ChevronRight, X } from "lucide-react";
import { isCliMode } from "@/lib/cli-bridge";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Rotating did-you-know banner. Replaces the static tray-only hint with a
 * pool of 14 tips that auto-cycle every 8 seconds. Tips marked `cliOnly`
 * skip when the SPA isn't hosted by the CLI (they reference features only
 * the CLI provides — tray icon, autostart, native toast, history slots).
 * `winOnly` tips skip on Mac/Linux (system-tray copy is Windows-specific).
 *
 * Animation: keyed `<p>` re-mounts on tip change, picking up the tailwind
 * `animate-in fade-in slide-in-from-bottom-1 duration-300` keyframes for
 * a smooth swap-in. No fade-out — the swap is fast enough that a single
 * fade-in reads cleanly without the in/out flicker.
 *
 * Dismissable; the flag persists in localStorage so once the user clicks
 * the X they never see the banner again (unless they wipe storage).
 */

interface TipDef {
  key: string;
  cliOnly?: boolean;
  winOnly?: boolean;
}

// Order matters — first tip shown on initial mount. Trayhint stays first
// so the "look for Clearmind in the tray" hint remains the user's first
// impression on a CLI Windows install (where the icon really is the
// fastest path to Quick Capture / Focus / Backup).
const TIPS: TipDef[] = [
  { key: "tip.tray", cliOnly: true, winOnly: true },
  { key: "tip.cmdK" },
  { key: "tip.voiceMic" },
  { key: "tip.calendarDrag" },
  { key: "tip.focusMode" },
  { key: "tip.importPaste" },
  { key: "tip.tagFilter" },
  { key: "tip.whisper" },
  { key: "tip.notification", cliOnly: true },
  { key: "tip.review" },
  { key: "tip.darkMode" },
  { key: "tip.autostart", cliOnly: true },
  { key: "tip.bookmarklet" },
  { key: "tip.history", cliOnly: true },
];

const DISMISS_KEY = "clearmind_tip_banner_dismissed";
const ROTATION_MS = 8_000;

function isWindowsUA(): boolean {
  if (typeof navigator === "undefined") return false;
  const plat = (navigator.platform || "").toLowerCase();
  const ua = (navigator.userAgent || "").toLowerCase();
  return plat.includes("win") || ua.includes("windows");
}

export function TipBanner() {
  const t = useT();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Filter tips by environment. `useMemo` because navigator + isCliMode
  // are stable across renders — no need to recompute every tick.
  const filtered = useMemo(() => {
    const cli = isCliMode();
    const win = isWindowsUA();
    return TIPS.filter((tip) => {
      if (tip.cliOnly && !cli) return false;
      if (tip.winOnly && !win) return false;
      return true;
    });
  }, []);

  const [index, setIndex] = useState(0);

  // Auto-rotate. Pause when only one tip survives the filter so we don't
  // re-trigger the fade-in on the same content every 8 seconds.
  useEffect(() => {
    if (dismissed || filtered.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % filtered.length);
    }, ROTATION_MS);
    return () => window.clearInterval(id);
  }, [dismissed, filtered.length]);

  if (dismissed || filtered.length === 0) return null;

  const tip = filtered[index];

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const advance = () => setIndex((i) => (i + 1) % filtered.length);

  return (
    <div
      data-testid="tip-banner"
      className={cn(
        "border-b border-primary/15 bg-primary/8",
        "px-4 py-2 flex items-center gap-3"
      )}
    >
      <Lightbulb className="h-4 w-4 text-primary shrink-0" />
      {/* Keyed wrapper — index change drops/remounts so animate-in re-fires */}
      <p
        key={`${tip.key}-${index}`}
        data-testid="tip-banner-text"
        className={cn(
          "text-xs flex-1 leading-relaxed min-w-0",
          "animate-in fade-in slide-in-from-bottom-1 duration-300"
        )}
      >
        <span className="font-semibold text-foreground">
          {t("tip.label")}
        </span>{" "}
        <span className="text-muted-foreground">{t(tip.key)}</span>
      </p>
      {filtered.length > 1 && (
        <button
          type="button"
          onClick={advance}
          title={t("tip.nextTitle")}
          aria-label={t("tip.nextTitle")}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            "p-1 rounded -m-1 shrink-0",
            "transition-colors"
          )}
          data-testid="tip-banner-next"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        title={t("welcome.dismiss")}
        aria-label={t("welcome.dismiss")}
        className={cn(
          "text-muted-foreground hover:text-foreground",
          "p-1 rounded -m-1 shrink-0",
          "transition-colors"
        )}
        data-testid="tip-banner-dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
