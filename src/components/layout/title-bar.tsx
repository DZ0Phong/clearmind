import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { useT } from "@/lib/i18n";
import {
  isTauri,
  winMinimize,
  winToggleMaximize,
  winClose,
  winIsMaximized,
} from "@/lib/desktop-bridge";

/**
 * Custom window titlebar for the desktop app (main window is frameless — see
 * src-tauri/src/lib.rs `decorations(false)`). The whole bar is a Tauri drag
 * region so the window moves with it; the three controls on the right
 * (minimize / maximize-restore / close) are themed to match the app instead
 * of the bare default Windows chrome. Renders nothing on web / mobile / CLI.
 */
export function TitleBar() {
  const t = useT();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    winIsMaximized().then((m) => {
      if (alive) setMaximized(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!isTauri()) return null;

  const onToggleMax = async () => {
    await winToggleMaximize();
    setMaximized(await winIsMaximized());
  };

  return (
    <div
      data-tauri-drag-region
      className="cm-titlebar shrink-0 h-9 flex items-stretch justify-between bg-card/80 backdrop-blur border-b border-border/60 select-none"
    >
      {/* Brand — also a drag handle. */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 pl-3 min-w-0"
      >
        <Logo className="h-4 w-4 pointer-events-none" />
        <span className="text-xs font-semibold tracking-tight text-foreground/80 pointer-events-none">
          Clearmind
        </span>
      </div>

      {/* Window controls — NOT drag regions so they stay clickable. */}
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={winMinimize}
          title={t("titlebar.minimize")}
          aria-label={t("titlebar.minimize")}
          className="w-11 grid place-items-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleMax}
          title={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
          aria-label={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
          className="w-11 grid place-items-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {maximized ? (
            <Copy className="h-3.5 w-3.5 -scale-x-100" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={winClose}
          title={t("titlebar.close")}
          aria-label={t("titlebar.close")}
          className="w-11 grid place-items-center text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
