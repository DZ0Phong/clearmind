/**
 * Device-linking orchestration (#8) — no-login, end-to-end-encrypted transfer
 * of a Clearmind snapshot between two devices, via QR + code.
 *
 * Two transports, chosen automatically:
 *   - RELAY (default): ciphertext is pushed to the same-origin relay; the QR
 *     carries only a tiny `clearmind-link:<code>` token, so it always scans
 *     reliably regardless of data size. The other device pulls by code/QR.
 *   - DIRECT (offline fallback): when the relay is unreachable, the encrypted
 *     snapshot rides INSIDE the QR (`clearmind-data:<blob>`). Works with zero
 *     infrastructure, but only if it fits in a scannable QR, and can only be
 *     received by scanning (a manual code can't carry the payload).
 *
 * See ./crypto for the encryption scheme and ./relay for the wire contract.
 */
import type { Task } from "@/hooks/use-tasks";
import {
  generateCode,
  normalizeCode,
  relayId,
  encryptSnapshot,
  encryptDirect,
  decryptSnapshot,
  decryptDirect,
} from "./crypto";
import { relayPut, relayGet } from "./relay";

export { formatCode, normalizeCode, WrongCodeError } from "./crypto";

export const QR_LINK_PREFIX = "clearmind-link:";
export const QR_DATA_PREFIX = "clearmind-data:";

// Conservative cap on what we'll embed directly in a QR. Past this, a phone
// camera struggles to lock on. gzip keeps typical task lists well under it.
const QR_DIRECT_MAX = 1800;

export const RELAY_TTL_SEC = 300;

export interface DeviceSnapshot {
  kind: "clearmind-snapshot";
  v: 1;
  exportedAt: string;
  tasks: Task[];
}

export function buildSnapshot(tasks: Task[]): DeviceSnapshot {
  return {
    kind: "clearmind-snapshot",
    v: 1,
    exportedAt: new Date().toISOString(),
    tasks,
  };
}

export function isSnapshot(x: unknown): x is DeviceSnapshot {
  return (
    !!x &&
    typeof x === "object" &&
    (x as DeviceSnapshot).kind === "clearmind-snapshot" &&
    Array.isArray((x as DeviceSnapshot).tasks)
  );
}

export type SendMode = "relay" | "direct";

export interface SendSession {
  /** Human code (relay mode only — empty string in direct mode). */
  code: string;
  /** Exact text the QR encodes. */
  qrText: string;
  mode: SendMode;
  /** Epoch ms when the relay entry expires (null in direct mode). */
  expiresAt: number | null;
}

export class RelayUnavailableError extends Error {
  constructor() {
    super("RELAY_UNAVAILABLE");
    this.name = "RelayUnavailableError";
  }
}

/**
 * Create a send session for the given snapshot. Tries the relay first; on
 * failure, falls back to embedding the encrypted blob in the QR when it fits.
 */
export async function createSendSession(snapshot: DeviceSnapshot): Promise<SendSession> {
  const code = generateCode();
  try {
    const blob = await encryptSnapshot(snapshot, code);
    const id = await relayId(code);
    await relayPut(id, blob, RELAY_TTL_SEC);
    return {
      code,
      qrText: QR_LINK_PREFIX + code,
      mode: "relay",
      expiresAt: Date.now() + RELAY_TTL_SEC * 1000,
    };
  } catch {
    // Relay down / unconfigured → offline QR-direct if the payload fits.
    const direct = await encryptDirect(snapshot);
    const qrText = QR_DATA_PREFIX + direct;
    if (qrText.length <= QR_DIRECT_MAX) {
      return { code: "", qrText, mode: "direct", expiresAt: null };
    }
    throw new RelayUnavailableError();
  }
}

export class CodeNotFoundError extends Error {
  constructor() {
    super("NOT_FOUND");
    this.name = "CodeNotFoundError";
  }
}

/** Pull + decrypt a snapshot for a manually-entered (or scanned) code. */
export async function receiveByCode(rawCode: string): Promise<unknown> {
  const code = normalizeCode(rawCode);
  const id = await relayId(code);
  const blob = await relayGet(id);
  if (!blob) throw new CodeNotFoundError();
  return decryptSnapshot(blob, code);
}

export class UnknownQrError extends Error {
  constructor() {
    super("UNKNOWN_QR");
    this.name = "UnknownQrError";
  }
}

/** Resolve a scanned QR string to a snapshot (relay token or direct blob). */
export async function receiveFromQr(text: string): Promise<unknown> {
  const trimmed = text.trim();
  if (trimmed.startsWith(QR_LINK_PREFIX)) {
    return receiveByCode(trimmed.slice(QR_LINK_PREFIX.length));
  }
  if (trimmed.startsWith(QR_DATA_PREFIX)) {
    return decryptDirect(trimmed.slice(QR_DATA_PREFIX.length));
  }
  throw new UnknownQrError();
}
