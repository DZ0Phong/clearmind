import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Bell, Power, Upload, Check, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useTasks } from "@/hooks/use-tasks";
import { isCliMode, cliGetAutostart, cliSetAutostart } from "@/lib/cli-bridge";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "clearmind_welcome_seen";

/**
 * First-run welcome modal. Shown on dashboard mount when `STORAGE_KEY` is
 * unset. Three CTA tiles let user (1) grant notification permission, (2)
 * toggle Windows autostart (CLI mode only), (3) jump to import flow. Dismiss
 * sets the flag so the modal never reappears.
 *
 * Placed by Dashboard so it overlays the empty agenda on a clean install.
 */
export function FirstRunWelcome() {
  const t = useT();
  const { notificationsEnabled, requestNotifications } = useTasks();
  const [open, setOpen] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const cli = isCliMode();

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      /* private-mode etc. — skip welcome */
    }
  }, []);

  // Pre-load current autostart state so the CTA reflects reality (e.g. user
  // already toggled via tray menu before opening dashboard).
  useEffect(() => {
    if (!open || !cli) return;
    cliGetAutostart()
      .then(setAutostartEnabled)
      .catch(() => {
        /* server down — leave default */
      });
  }, [open, cli]);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const handleNotify = async () => {
    setNotifBusy(true);
    try {
      await requestNotifications();
    } finally {
      setNotifBusy(false);
    }
  };

  const handleAutostart = async () => {
    if (!cli) return;
    setAutostartBusy(true);
    try {
      const next = !autostartEnabled;
      const ok = await cliSetAutostart(next);
      setAutostartEnabled(ok);
    } catch {
      /* ignore — toast would be noise here */
    } finally {
      setAutostartBusy(false);
    }
  };

  if (!open) return null;

  // Portal to body so the backdrop reaches the real viewport edge
  // regardless of any ancestor stacking context (was being clipped by
  // <main>'s former z-10 — even after that fix, portaling is the
  // future-proof guarantee). z-[110] sits between modals (z-50/100)
  // and toasts (z-[120]) so confirmation toasts fired by the welcome's
  // CTAs remain visible above the welcome.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      data-testid="first-run-welcome"
      className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md bg-card rounded-2xl border shadow-2xl p-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <Logo className="h-9 w-9 shrink-0" />
            <div>
              <p id="welcome-title" className="font-semibold text-base leading-tight">
                {t("welcome.title")}
              </p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                {t("welcome.subtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            title={t("welcome.dismiss")}
            aria-label={t("welcome.dismiss")}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted -m-1 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          {t("welcome.intro")}
        </p>

        <div className="space-y-2">
          <CtaTile
            icon={Bell}
            done={notificationsEnabled}
            busy={notifBusy}
            doneLabel={t("welcome.notify.granted")}
            label={t("welcome.notify.cta")}
            hint={t("welcome.notify.hint")}
            onClick={handleNotify}
            data-testid="welcome-notify"
          />

          {cli && (
            <CtaTile
              icon={Power}
              done={autostartEnabled}
              busy={autostartBusy}
              doneLabel={t("welcome.autostart.enabled")}
              label={t("welcome.autostart.cta")}
              hint={t("welcome.autostart.hint")}
              onClick={handleAutostart}
              data-testid="welcome-autostart"
            />
          )}

          <Link
            to="/import"
            onClick={dismiss}
            data-testid="welcome-import"
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-left"
          >
            <div className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
              <Upload className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">
                {t("welcome.import.cta")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                {t("welcome.import.hint")}
              </p>
            </div>
          </Link>
        </div>

        <div className="flex justify-end gap-2 mt-5 pt-3 border-t">
          <Button
            type="button"
            onClick={dismiss}
            size="sm"
            variant="ghost"
            data-testid="welcome-skip"
          >
            {t("welcome.skip")}
          </Button>
          <Button
            type="button"
            onClick={dismiss}
            size="sm"
            data-testid="welcome-done"
          >
            {t("welcome.done")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface CtaProps {
  icon: typeof Bell;
  done: boolean;
  busy: boolean;
  doneLabel: string;
  label: string;
  hint: string;
  onClick: () => void;
  "data-testid"?: string;
}

function CtaTile({
  icon: Icon,
  done,
  busy,
  doneLabel,
  label,
  hint,
  onClick,
  ...rest
}: CtaProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid={rest["data-testid"]}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-lg border border-input bg-background",
        "hover:bg-accent hover:text-accent-foreground transition-colors text-left",
        "disabled:opacity-60 disabled:cursor-not-allowed"
      )}
    >
      <div
        className={cn(
          "h-9 w-9 shrink-0 rounded-lg flex items-center justify-center transition-colors",
          done ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"
        )}
      >
        {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">
          {done ? doneLabel : label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
          {hint}
        </p>
      </div>
    </button>
  );
}
