import { useEffect, useState } from "react";
import { isCliMode, cliHealth } from "@/lib/cli-bridge";

export type CliHealthStatus = "checking" | "online" | "offline" | "n/a";

/**
 * Polls /api/health every `intervalMs`. Returns:
 *   "n/a"      → not in CLI mode (server marker absent), nothing to ping
 *   "checking" → first probe in flight
 *   "online"   → last probe succeeded
 *   "offline"  → last probe failed (network/CORS/server crash)
 *
 * Use this to surface a visible connection badge so the user knows when
 * their edits aren't reaching disk (e.g. they Quit the tray but left the
 * browser tab open).
 */
export function useCliHealth(intervalMs: number = 30_000): {
  status: CliHealthStatus;
  port?: number;
} {
  const [status, setStatus] = useState<CliHealthStatus>(() =>
    isCliMode() ? "checking" : "n/a"
  );
  const [port, setPort] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!isCliMode()) return;
    let cancelled = false;
    let timer: number | null = null;

    const probe = async () => {
      try {
        const h = await cliHealth();
        if (cancelled) return;
        setStatus("online");
        setPort(h.port);
      } catch (_e) {
        if (cancelled) return;
        setStatus("offline");
      }
    };

    probe();
    timer = window.setInterval(probe, intervalMs);

    // Also re-probe when the tab regains focus — the server might have been
    // bounced while the tab was backgrounded; user expects an instant signal
    // when they switch back, not a 30s delay.
    const onFocus = () => probe();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs]);

  return { status, port };
}
