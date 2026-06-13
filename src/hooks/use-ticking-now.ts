import { useEffect, useState } from "react";

/**
 * Snap-to-boundary clock hook. Returns a `Date` that re-renders the
 * consumer at every `intervalMs` boundary (not just every interval since
 * mount), so a "every minute" clock changes exactly at :00 instead of
 * drifting up to 59s away from real time.
 *
 * Use 60_000 for a header clock, 30_000 for visible countdowns, 1_000
 * for second-by-second.
 */
export function useTickingNow(intervalMs: number = 60_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    let timeout: number | null = null;
    let interval: number | null = null;
    const tick = () => setNow(new Date());
    // Wait until the next boundary, then settle into a steady interval.
    const delay = intervalMs - (Date.now() % intervalMs);
    timeout = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, intervalMs);
    }, delay);
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      if (interval !== null) window.clearInterval(interval);
    };
  }, [intervalMs]);
  return now;
}
