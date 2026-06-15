/**
 * Cloudflare Pages Function — device-link relay (#8).
 *
 * Deploys automatically WITH the Pages site (no separate Worker), so the SPA's
 * same-origin `POST/GET /api/link` works on the deployed web exactly like it
 * does against the CLI host (cli/server.js). Zero-knowledge: it stores only the
 * opaque ciphertext the client sends, keyed by id = SHA-256(code), with a short
 * TTL, and deletes it on first read (one-time consume). It never sees the code
 * or the plaintext.
 *
 * Requires a KV namespace binding named `LINK_KV` on the Pages project
 * (Settings → Functions → KV namespace bindings). Without it, the relay
 * degrades to 503 and the SPA falls back to the offline QR-direct mode.
 * See DEPLOY.md.
 */

const ID_RE = /^[a-f0-9]{64}$/;
const MAX_BYTES = 2_000_000;

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.LINK_KV) return json(503, { ok: false, error: "Relay not configured" });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const data = typeof body.data === "string" ? body.data : "";
  if (!ID_RE.test(id)) return json(400, { ok: false, error: "Bad id" });
  if (!data || data.length > MAX_BYTES) return json(400, { ok: false, error: "Bad data" });

  // KV's minimum expirationTtl is 60s.
  const ttl = Math.min(Math.max(parseInt(body.ttl, 10) || 300, 60), 900);
  await env.LINK_KV.put("link:" + id, data, { expirationTtl: ttl });
  return json(200, { ok: true });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.LINK_KV) return json(503, { ok: false, error: "Relay not configured" });

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!ID_RE.test(id)) return json(400, { ok: false, error: "Bad id" });

  const key = "link:" + id;
  const data = await env.LINK_KV.get(key);
  if (data == null) return json(404, { ok: false, error: "Not found" });
  await env.LINK_KV.delete(key); // one-time consume
  return json(200, { ok: true, data });
}
