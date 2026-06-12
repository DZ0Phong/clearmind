// Lightweight in-app error log. Persists the last 20 errors to localStorage
// so the user can show them later, and we can diagnose intermittent failures
// instead of guessing.

export interface ErrorEntry {
  at: string;
  url: string;
  source: "react" | "window" | "promise" | "manual";
  message: string;
  stack?: string;
  componentStack?: string;
  ua: string;
}

const KEY = "clearmind_error_log";
const MAX = 20;

export function readErrorLog(): ErrorEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function logError(
  source: ErrorEntry["source"],
  err: unknown,
  componentStack?: string
) {
  const e = err as Error | { message?: string; stack?: string } | null;
  const entry: ErrorEntry = {
    at: new Date().toISOString(),
    url:
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "",
    source,
    message:
      (e && (e as Error).message) ||
      (typeof e === "string" ? e : "Unknown error"),
    stack: e && (e as Error).stack ? (e as Error).stack : undefined,
    componentStack,
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
  try {
    const log = readErrorLog();
    log.unshift(entry);
    localStorage.setItem(KEY, JSON.stringify(log.slice(0, MAX)));
  } catch {
    /* storage full — ignore */
  }
  console.error(`[Clearmind:${source}]`, err, componentStack || "");
}

export function clearErrorLog() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// Hook up global handlers exactly once.
let installed = false;
export function installGlobalErrorHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    logError("window", e.error || { message: e.message, stack: undefined });
  });
  window.addEventListener("unhandledrejection", (e) => {
    logError("promise", e.reason);
  });
}
