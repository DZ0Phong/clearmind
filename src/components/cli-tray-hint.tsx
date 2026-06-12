import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { isCliMode } from "@/lib/cli-bridge";
import { useT } from "@/lib/i18n";

const STORAGE_KEY = "clearmind_tray_hint_seen";

/**
 * Small dismissable banner reminding Windows users that Clearmind lives in
 * the system tray. Shown only when (a) the SPA is hosted by the CLI (i.e.
 * there *is* a tray icon) and (b) the user is on Windows (Mac/Linux behave
 * differently). Persists dismissal via localStorage so it never re-appears.
 */
export function CliTrayHint() {
  const t = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isCliMode()) return;
    if (typeof navigator === "undefined") return;
    const plat = (navigator.platform || "").toLowerCase();
    const ua = (navigator.userAgent || "").toLowerCase();
    const isWindows = plat.includes("win") || ua.includes("windows");
    if (!isWindows) return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
    } catch {
      /* ignore */
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  if (!show) return null;
  return (
    <div
      data-testid="cli-tray-hint"
      className="bg-primary/8 border-b border-primary/15 px-4 py-2 flex items-center gap-3"
    >
      <Lightbulb className="h-4 w-4 text-primary shrink-0" />
      <p className="text-xs flex-1 leading-relaxed">
        <span className="font-semibold">{t("tray.hint.title")}</span>{" "}
        <span className="text-muted-foreground">{t("tray.hint.body")}</span>
      </p>
      <button
        type="button"
        onClick={dismiss}
        title={t("welcome.dismiss")}
        aria-label={t("welcome.dismiss")}
        className="text-muted-foreground hover:text-foreground p-1 rounded -m-1 shrink-0"
        data-testid="cli-tray-hint-dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
