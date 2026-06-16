/**
 * Zero-knowledge relay client for device-linking (#8).
 *
 * The relay only ever stores opaque ciphertext under an id = SHA-256(code),
 * with a short TTL, deleted on first read (one-time consume). The same wire
 * contract is implemented by two backends, picked automatically by origin:
 *   - cli/server.js          → when served by the CLI host (localhost / LAN)
 *   - functions/api/link.js  → the Cloudflare Pages Function (deployed web)
 *
 * Outside both (e.g. `npm run dev` on :5173), POST/GET simply fail and the
 * caller falls back to the offline QR-direct mode.
 */

const PUT_TTL = 300; // seconds — matches the relay default; KV min is 60.

/** Carries the HTTP status so callers can distinguish 503 (relay not
 * configured — e.g. LINK_KV unbound on Cloudflare Pages) from other failures. */
export class RelayHttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`relay HTTP ${status}`);
    this.name = "RelayHttpError";
    this.status = status;
  }
}

// The public deploy that hosts the Cloudflare relay (KV) + sync (D1). When the
// SPA runs from a loopback origin (CLI host / desktop app / `npm run dev`) its
// OWN /api can't be reached by other devices, so we route device-link + sync to
// this shared public backend instead. A deployed / custom-domain origin uses
// itself. The backend only ever sees E2E ciphertext, so cross-origin is safe.
const PUBLIC_ORIGIN = "https://clearmind-app.pages.dev";

function isLoopbackHost(): boolean {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]" ||
    h.endsWith(".localhost")
  );
}

/** Base URL for the shared /api backend (relay + sync). Public when local so
 *  the desktop app / CLI host reach the SAME store every other device does. */
export function apiBase(): string {
  if (typeof window === "undefined") return "";
  return isLoopbackHost() ? PUBLIC_ORIGIN : window.location.origin;
}

/** fetch with a hard timeout so a stalled/black-holed relay can never hang the
 *  UI forever — that was the "Nhận về cứ xoay mãi" symptom. On timeout it
 *  aborts → throws → the caller surfaces an error instead of an infinite spin. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 12000
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Store ciphertext under `id`. Throws if the relay is unreachable/unconfigured. */
export async function relayPut(id: string, data: string, ttlSec = PUT_TTL): Promise<void> {
  const res = await fetchWithTimeout(`${apiBase()}/api/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, data, ttl: ttlSec }),
  });
  if (!res.ok) throw new RelayHttpError(res.status);
}

/**
 * Pull (and consume) ciphertext for `id`. Returns null when the entry is
 * absent — expired or already consumed. Throws on transport/relay errors.
 */
export async function relayGet(id: string): Promise<string | null> {
  const res = await fetchWithTimeout(`${apiBase()}/api/link?id=${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new RelayHttpError(res.status);
  const j = (await res.json()) as { data?: string };
  return typeof j.data === "string" ? j.data : null;
}
