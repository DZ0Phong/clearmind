/**
 * Cloudflare Pages Function — continuous device-sync doc (polling milestone).
 *
 * Stores ONE opaque, E2E-encrypted blob per pairing, keyed by id = hash(syncKey)
 * (the client derives it; the server never sees the key or the plaintext). This
 * is the shared "document" every paired device pushes to and pulls from.
 *
 * Optimistic concurrency via a monotonic `version`:
 *   GET  /api/sync?id=<64hex>&since=<n>  → { version, blob }  (blob null if not newer)
 *   POST /api/sync { id, blob, baseVersion } →
 *        200 { version }                  on success (version = baseVersion+1)
 *        409 { conflict, version, blob }   if someone else wrote first — the
 *                                          client merges the returned blob and
 *                                          retries with the new baseVersion.
 *
 * Requires a D1 binding named `SYNC_DB` on the Pages project (Settings →
 * Bindings → D1). Without it the endpoint 503s and the SPA stays local-only.
 * See DEPLOY.md.
 */

const ID_RE = /^[a-f0-9]{64}$/;
const MAX_BYTES = 1_500_000; // generous for an encrypted task list

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// Worker isolates persist across requests, so create the table at most once per
// isolate rather than on every call.
let tableReady = false;
async function ensureTable(db) {
  if (tableReady) return;
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS docs (id TEXT PRIMARY KEY, blob TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
    )
    .run();
  tableReady = true;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_DB) return json(503, { ok: false, error: "Sync not configured" });
  await ensureTable(env.SYNC_DB);

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;
  if (!ID_RE.test(id)) return json(400, { ok: false, error: "Bad id" });

  const row = await env.SYNC_DB.prepare(
    "SELECT blob, version FROM docs WHERE id = ?"
  )
    .bind(id)
    .first();

  if (!row) return json(200, { ok: true, version: 0, blob: null });
  if (row.version <= since)
    return json(200, { ok: true, version: row.version, blob: null });
  return json(200, { ok: true, version: row.version, blob: row.blob });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_DB) return json(503, { ok: false, error: "Sync not configured" });
  await ensureTable(env.SYNC_DB);

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const blob = typeof body.blob === "string" ? body.blob : "";
  const baseVersion = parseInt(body.baseVersion, 10) || 0;
  if (!ID_RE.test(id)) return json(400, { ok: false, error: "Bad id" });
  if (!blob || blob.length > MAX_BYTES)
    return json(400, { ok: false, error: "Bad blob" });

  const row = await env.SYNC_DB.prepare(
    "SELECT blob, version FROM docs WHERE id = ?"
  )
    .bind(id)
    .first();
  const current = row ? row.version : 0;

  // Stale push — someone wrote between this client's last pull and now. Hand
  // back the current doc so the client merges + retries.
  if (current !== baseVersion) {
    return json(409, {
      ok: false,
      conflict: true,
      version: current,
      blob: row ? row.blob : null,
    });
  }

  const nextVersion = current + 1;
  await env.SYNC_DB.prepare(
    "INSERT INTO docs (id, blob, version, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET blob = excluded.blob, version = excluded.version, updated_at = excluded.updated_at"
  )
    .bind(id, blob, nextVersion, Date.now())
    .run();

  return json(200, { ok: true, version: nextVersion });
}
