/**
 * End-to-end encryption for device-linking (#8).
 *
 * Threat model: a one-time, in-person (or near-real-time) transfer of a
 * Clearmind data snapshot between two devices owned by the same person, with
 * NO account and NO trusted server. The relay (cli/server.js or the Cloudflare
 * Pages Function) is treated as fully untrusted — it only ever sees ciphertext
 * keyed by a hash of the code, never the code or the plaintext.
 *
 * Scheme:
 *  - The sender generates a short human code (relay mode) or a random 128-bit
 *    key (offline QR-direct mode).
 *  - The AES-GCM-256 key is derived via PBKDF2-SHA256 (200k iterations) over
 *    the code + a random 16-byte salt. GCM gives confidentiality + integrity
 *    (a wrong code fails the auth tag → we surface "wrong code").
 *  - The snapshot JSON is gzip-compressed first (when the browser supports
 *    CompressionStream) so realistic task lists stay small enough to ride
 *    inside a single reliably-scannable QR in offline mode.
 *  - The relay storage key is SHA-256("clearmind-link-id|" + code), domain-
 *    separated from the encryption key so the relay can't derive it.
 *
 * Everything here is Web Crypto + standard browser APIs — no native deps, runs
 * identically in the browser, the Tauri WebView, and mobile.
 */

// Unambiguous alphabet for human-typed codes: no 0/O, 1/I/L, U. 30 symbols.
// CODE_LEN=8 → 30^8 ≈ 6.6e11 (~39 bits). Combined with one-time consume + a
// 5-minute TTL on the relay, brute-forcing the matching relayId before the
// legitimate device pulls (and deletes) the entry is infeasible.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN = 8;
const PBKDF2_ITERS = 200_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A fresh random link code, e.g. "A7K9PQ2M". Always in canonical form. */
export function generateCode(): string {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Strip separators/case so "a7k9-pq2m" and "A7K9PQ2M" hash identically. */
export function normalizeCode(input: string): string {
  return input.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

/** Group as ABCD-EFGH for display / readability. */
export function formatCode(code: string): string {
  const c = normalizeCode(code);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

// ---- base64url (no padding) — QR/URL safe -------------------------------

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64decode(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

// ---- compression (best-effort gzip via CompressionStream) ----------------

async function gzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const cs = new CompressionStream("gzip");
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---- key derivation ------------------------------------------------------

async function deriveKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode("clearmind-link|" + code),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Relay storage id for a code — SHA-256 with a DIFFERENT domain prefix than
 * the key derivation, so a relay that sees the id can't reconstruct the key.
 */
export async function relayId(code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    enc.encode("clearmind-link-id|" + code)
  );
  return hex(new Uint8Array(digest));
}

// ---- packed payload: ver(1) | flags(1) | salt(16) | iv(12) | ciphertext --

const VERSION = 1;
const FLAG_GZIP = 1;

/** Encrypt an arbitrary JSON-able object under `code`; returns base64url. */
export async function encryptSnapshot(obj: unknown, code: string): Promise<string> {
  const json = enc.encode(JSON.stringify(obj));
  // Explicit type: TextEncoder.encode() is `Uint8Array<ArrayBuffer>` but
  // gzip() returns the wider `Uint8Array<ArrayBufferLike>` — annotate so the
  // `body = gz` reassignment below typechecks under TS 6's typed-array generics.
  let body: Uint8Array = json;
  let flags = 0;
  const gz = await gzip(json);
  if (gz && gz.length < json.length) {
    body = gz;
    flags |= FLAG_GZIP;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, body as BufferSource)
  );
  const packed = new Uint8Array(2 + 16 + 12 + ct.length);
  packed[0] = VERSION;
  packed[1] = flags;
  packed.set(salt, 2);
  packed.set(iv, 18);
  packed.set(ct, 30);
  return b64encode(packed);
}

export class WrongCodeError extends Error {
  constructor() {
    super("WRONG_CODE");
    this.name = "WrongCodeError";
  }
}

/** Decrypt a base64url payload produced by encryptSnapshot. */
export async function decryptSnapshot(blob: string, code: string): Promise<unknown> {
  const packed = b64decode(blob);
  if (packed.length < 31 || packed[0] !== VERSION) {
    throw new Error("UNSUPPORTED_PAYLOAD");
  }
  const flags = packed[1];
  const salt = packed.slice(2, 18);
  const iv = packed.slice(18, 30);
  const ct = packed.slice(30);
  const key = await deriveKey(code, salt);
  let body: Uint8Array;
  try {
    body = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource)
    );
  } catch {
    // GCM auth-tag failure ⇒ wrong code or corrupt data.
    throw new WrongCodeError();
  }
  if (flags & FLAG_GZIP) body = await gunzip(body);
  return JSON.parse(dec.decode(body));
}

// ---- offline QR-direct: key embedded in the QR itself --------------------
// The QR is the secret channel (in-person scan). We still encrypt so the QR's
// raw text is opaque and integrity-checked, but the key rides alongside.

const DIRECT_SEP = "~";

export async function encryptDirect(obj: unknown): Promise<string> {
  const rawKey = b64encode(crypto.getRandomValues(new Uint8Array(16))); // 128-bit
  const blob = await encryptSnapshot(obj, rawKey);
  return blob + DIRECT_SEP + rawKey;
}

export async function decryptDirect(payload: string): Promise<unknown> {
  const i = payload.lastIndexOf(DIRECT_SEP);
  if (i < 0) throw new Error("UNSUPPORTED_PAYLOAD");
  const blob = payload.slice(0, i);
  const rawKey = payload.slice(i + 1);
  return decryptSnapshot(blob, rawKey);
}
