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
import { relayPut, relayGet, RelayHttpError } from "./relay";

export { formatCode, normalizeCode, WrongCodeError } from "./crypto";

export const QR_LINK_PREFIX = "clearmind-link:";
export const QR_DATA_PREFIX = "clearmind-data:";

// Cap on what we'll embed directly in a QR. Past this a phone camera struggles
// to lock onto the dense pattern. gzip keeps typical task lists well under it;
// anything larger needs the relay (deployed web + LINK_KV).
const QR_DIRECT_MAX = 2200;

export const RELAY_TTL_SEC = 300;

export interface DeviceSnapshot {
  kind: "clearmind-snapshot";
  v: 1;
  exportedAt: string;
  tasks: Task[];
  /** Persistent pairing key — its presence turns the one-shot transfer into a
   *  continuous link: the receiver adopts it and both devices then sync via the
   *  shared cloud doc. Omitted only for a pure one-shot (legacy) snapshot. */
  syncKey?: string;
}

export function buildSnapshot(tasks: Task[], syncKey?: string): DeviceSnapshot {
  return {
    kind: "clearmind-snapshot",
    v: 1,
    exportedAt: new Date().toISOString(),
    tasks,
    ...(syncKey ? { syncKey } : {}),
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

/** Why a send session couldn't be created — drives the UI's guidance. */
export type SendFailReason =
  | "localTooBig" // on localhost (no internet-reachable relay) + too big for a QR
  | "relayUnconfigured" // deployed, but relay returned 503 (LINK_KV unbound)
  | "relayError"; // relay unreachable/erroring + too big for a QR

export class RelayUnavailableError extends Error {
  reason: SendFailReason;
  constructor(reason: SendFailReason) {
    super("RELAY_UNAVAILABLE");
    this.name = "RelayUnavailableError";
    this.reason = reason;
  }
}

/** Pack the encrypted snapshot straight into the QR, or fail with `reason`. */
async function directSession(
  snapshot: DeviceSnapshot,
  reason: SendFailReason
): Promise<SendSession> {
  const direct = await encryptDirect(snapshot);
  const qrText = QR_DATA_PREFIX + direct;
  if (qrText.length <= QR_DIRECT_MAX) {
    return { code: "", qrText, mode: "direct", expiresAt: null };
  }
  throw new RelayUnavailableError(reason);
}

/**
 * Create a send session. RELAY-FIRST: the encrypted snapshot is pushed to the
 * shared backend (public when on localhost — see relay.ts `apiBase`, so the
 * desktop app / CLI host hit the SAME relay as the deployed web), giving a tiny
 * easy-to-scan QR AND a typeable code that any device can pull. Falls back to
 * an offline QR-direct (scan-only) when the relay is unreachable / unconfigured.
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
  } catch (e) {
    // Relay unreachable / not configured (503) → offline QR, tagged for the UI.
    const reason: SendFailReason =
      e instanceof RelayHttpError && e.status === 503
        ? "relayUnconfigured"
        : "relayError";
    return directSession(snapshot, reason);
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
