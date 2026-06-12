#!/usr/bin/env node
"use strict";

/**
 * Tiny entry point invoked by Windows when a `clearmind://action?...` URL
 * is opened — e.g. when the user clicks an action button on a Clearmind
 * toast notification. We parse the URL, bridge to the running CLI server
 * via HTTP, and exit. No console, no browser.
 *
 * Registered as the protocol handler by `url-scheme.js`.
 *
 * URL shape:
 *   clearmind://<action>?id=<taskId>
 *
 * Known actions: snooze-10, snooze-60, done.
 */

const url = process.argv[2] || "";
const m = url.match(/^clearmind:\/\/([^?]+)(?:\?(.*))?$/);
if (!m) process.exit(0);

const action = decodeURIComponent(m[1]);
const params = new URLSearchParams(m[2] || "");
const id = params.get("id") || "";
// Port preference: URL param (set by toast at fire time so we hit the same
// instance that scheduled the toast) → env var → default.
const port =
  params.get("port") || process.env.CLEARMIND_PORT || "20129";

const endpoint = `http://127.0.0.1:${port}/api/notification-action?action=${encodeURIComponent(action)}&id=${encodeURIComponent(id)}`;

(async () => {
  try {
    await fetch(endpoint, { method: "POST" });
  } catch (_) {
    // CLI server not running — silently exit. User won't see anything,
    // which is the right call: clicking a stale notification shouldn't
    // throw a popup.
  } finally {
    process.exit(0);
  }
})();
