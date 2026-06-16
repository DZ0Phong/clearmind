/**
 * Network client for continuous device sync (polling milestone).
 *
 * Talks to the shared backend (`/api/sync`, public when on localhost — see
 * relay.ts `apiBase`) using the same E2E crypto as device-link. The server only
 * ever holds an encrypted blob keyed by `syncId = hash(syncKey)`; the syncKey
 * (the pairing secret) never leaves the devices. Optimistic concurrency: a push
 * carries the version it last saw; a stale push comes back 409 with the current
 * doc so the caller can merge + retry.
 */
import { apiBase } from "./relay";
import { encryptSnapshot, decryptSnapshot } from "./crypto";
import type { SyncState } from "./sync";

const enc = new TextEncoder();

function hex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

/** Sync-doc id for a key — domain-separated ("clearmind-sync-id|") from both
 *  the encryption-key derivation and the device-link relay id, so a server that
 *  sees the id can't reconstruct the key. */
export async function syncId(syncKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode("clearmind-sync-id|" + syncKey));
  return hex(new Uint8Array(digest));
}

export class SyncUnavailableError extends Error {
  status?: number;
  constructor(status?: number) {
    super("SYNC_UNAVAILABLE");
    this.name = "SyncUnavailableError";
    this.status = status;
  }
}

async function withTimeout(url: string, init: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface PullResult {
  version: number;
  /** null when the server has nothing newer than `since`. */
  state: SyncState | null;
}

/** GET the cloud doc if it's newer than `since`. */
export async function syncPull(syncKey: string, since: number): Promise<PullResult> {
  const id = await syncId(syncKey);
  const res = await withTimeout(`${apiBase()}/api/sync?id=${id}&since=${since}`);
  if (!res.ok) throw new SyncUnavailableError(res.status);
  const j = (await res.json()) as { version: number; blob: string | null };
  if (!j.blob) return { version: j.version, state: null };
  const state = (await decryptSnapshot(j.blob, syncKey)) as SyncState;
  return { version: j.version, state };
}

export type PushResult =
  | { ok: true; version: number }
  | { ok: false; conflict: true; version: number; state: SyncState | null };

/** PUT the cloud doc with optimistic concurrency. On 409 returns the server's
 *  current state so the caller merges + retries with the new baseVersion. */
export async function syncPush(
  syncKey: string,
  state: SyncState,
  baseVersion: number
): Promise<PushResult> {
  const id = await syncId(syncKey);
  const blob = await encryptSnapshot(state, syncKey);
  const res = await withTimeout(`${apiBase()}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, blob, baseVersion }),
  });
  if (res.status === 409) {
    const j = (await res.json()) as { version: number; blob: string | null };
    const serverState = j.blob ? ((await decryptSnapshot(j.blob, syncKey)) as SyncState) : null;
    return { ok: false, conflict: true, version: j.version, state: serverState };
  }
  if (!res.ok) throw new SyncUnavailableError(res.status);
  const j = (await res.json()) as { version: number };
  return { ok: true, version: j.version };
}

/* ----------------------------- pairing key ------------------------------ */
// The shared pairing secret. Persisted per-device in localStorage; the SAME
// value lives on every paired device (it travels inside the device-link
// handshake). Its presence is what flips a device into "synced" mode.

const SYNC_KEY_STORAGE = "clearmind_sync_key";

/** A fresh strong pairing key (URL-safe base64, 256-bit). */
export function generateSyncKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function getSyncKey(): string | null {
  try {
    return localStorage.getItem(SYNC_KEY_STORAGE) || null;
  } catch {
    return null;
  }
}

export function setSyncKey(key: string): void {
  try {
    localStorage.setItem(SYNC_KEY_STORAGE, key);
  } catch {
    /* ignore */
  }
}

/** Ensure THIS device has a pairing key (generate one on first send). */
export function ensureSyncKey(): string {
  let k = getSyncKey();
  if (!k) {
    k = generateSyncKey();
    setSyncKey(k);
  }
  return k;
}

export function clearSyncKey(): void {
  try {
    localStorage.removeItem(SYNC_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}
