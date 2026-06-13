import { useEffect, useMemo, useState } from "react";
import { Lightbulb, ChevronRight, X } from "lucide-react";
import { isCliMode } from "@/lib/cli-bridge";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Did-you-know strip that renders as the second row of the page header —
 * `position: sticky` at `top-12 sm:top-14` so it pins directly under the
 * topbar while sharing the same scroll container. This solves three
 * issues that `position: fixed` could not:
 *   1. Pinch/pan-zoom on trackpads moves the visual viewport without
 *      touching the layout viewport. `fixed` anchors to the layout
 *      viewport and looks frozen in place while content slides under
 *      it. `sticky` rides along with the page like the topbar does.
 *   2. The strip occupies real layout height, so body content sits
 *      *below* it instead of being hidden behind it.
 *   3. Width tracks the main column automatically (no manual sidebar
 *      offset like `md:left-60`).
 *
 * Visually styled to match `<TopBar>` (same backdrop blur, padding,
 * border) so it reads as the topbar's tail row rather than a separate
 * surface.
 *
 * Pool of 14 tips auto-cycles every 8 seconds. Tips marked `cliOnly` skip
 * when the SPA isn't hosted by the CLI (tray icon, autostart, native
 * toast, history slots). `winOnly` tips skip on Mac/Linux.
 *
 * z-[15] sits above main content (z-10) but below the topbar (z-20) and
 * any popover/dialog/toast (z-50/90/100), so transient surfaces still
 * paint cleanly over it.
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
        // Pin to topbar's effective height (3.5rem visible + safe-area-inset-top
         // for notched / PWA standalone iOS). Matches the `style.height` calc
         // in main-layout.tsx's <header> exactly — change one, change both.
        "sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-[15] shrink-0",
        // Accent-tinted frosted surface — differentiates from the topbar
        // (which uses `bg-background/60`) and follows the user's accent
        // pick because the tint comes from `--primary`. Strong backdrop
        // blur + saturate occludes scrolling content below so text stays
        // legible without going fully opaque.
        "bg-primary/15 backdrop-blur-xl backdrop-saturate-150",
        "border-b border-primary/25",
        "px-3 sm:px-5 lg:px-6 py-2 flex items-center gap-3"
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
