import { useEffect, useState } from "react";
import { Download, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import {
  isTauri,
  checkForUpdate,
  downloadAndInstallUpdate,
  type UpdateInfo,
} from "@/lib/desktop-bridge";

const SKIP_KEY = "clearmind_skip_update_version";

type Phase = "idle" | "available" | "downloading" | "error";

/**
 * Desktop-app launch-time update prompt. On mount it asks GitHub Releases
 * whether a newer signed build exists; if so (and the user hasn't *skipped*
 * that exact version) it pops a themed dialog with three choices:
 *   • Update now  → download + install + relaunch (with a progress bar)
 *   • Later       → dismiss; re-prompts on the next launch
 *   • Skip        → remember this version, never prompt for it again
 * Renders nothing on web / mobile / CLI. The manual checker lives in
 * Settings → Desktop app (DesktopAppCard).
 */
export function UpdatePrompt() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<UpdateInfo>({ available: false });
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    checkForUpdate().then((r) => {
      if (!alive || !r.available || !r.version) return;
      let skipped: string | null = null;
      try {
        skipped = localStorage.getItem(SKIP_KEY);
      } catch {
        /* ignore */
      }
      if (skipped === r.version) return;
      setInfo(r);
      setPhase("available");
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!isTauri() || phase === "idle") return null;

  const onUpdate = async () => {
    setPhase("downloading");
    setProgress(0);
    const ok = await downloadAndInstallUpdate(setProgress);
    // On success the app relaunches into the new build, so we usually never
    // get here. If we do, the install failed.
    if (!ok) setPhase("error");
  };

  const onLater = () => setPhase("idle");

  const onSkip = () => {
    try {
      if (info.version) localStorage.setItem(SKIP_KEY, info.version);
    } catch {
      /* ignore */
    }
    setPhase("idle");
  };

  const busy = phase === "downloading";

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 p-5 pb-3">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/15 grid place-items-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-lg leading-tight">
              {t("update.title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("update.body", { version: info.version ?? "" })}
            </p>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={onLater}
              aria-label={t("update.cta.later")}
              className="shrink-0 p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {info.notes && phase === "available" && (
          <div className="px-5 pb-2">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/70 mb-1">
              {t("update.notesLabel")}
            </p>
            <pre className="text-xs leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto rounded-lg border bg-background/50 p-2.5 text-muted-foreground">
              {info.notes}
            </pre>
          </div>
        )}

        {busy && (
          <div className="px-5 pb-2">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {progress >= 100 ? t("update.installing") : t("update.downloading")}
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="px-5 pb-2">
            <p className="text-sm text-destructive">{t("update.error")}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 p-4 pt-3 bg-muted/30 border-t">
          {phase !== "downloading" && (
            <>
              <Button variant="ghost" size="sm" onClick={onSkip}>
                {t("update.cta.skip")}
              </Button>
              <Button variant="outline" size="sm" onClick={onLater}>
                {t("update.cta.later")}
              </Button>
              <Button size="sm" onClick={onUpdate} className="gap-2">
                <Download className="h-4 w-4" />
                {t("update.cta.update")}
              </Button>
            </>
          )}
          {phase === "downloading" && (
            <Button size="sm" disabled className="gap-2">
              <Download className="h-4 w-4 animate-pulse" />
              {t("update.downloading")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
