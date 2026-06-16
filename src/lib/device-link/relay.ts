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

/** Same-origin base — wherever the SPA is served from already proxies /api. */
function relayBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

/** Store ciphertext under `id`. Throws if the relay is unreachable/unconfigured. */
export async function relayPut(id: string, data: string, ttlSec = PUT_TTL): Promise<void> {
  const res = await fetch(`${relayBase()}/api/link`, {
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
  const res = await fetch(`${relayBase()}/api/link?id=${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new RelayHttpError(res.status);
  const j = (await res.json()) as { data?: string };
  return typeof j.data === "string" ? j.data : null;
}
