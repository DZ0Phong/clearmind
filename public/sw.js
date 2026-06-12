/* Clearmind self-destruct service worker.
 *
 * Previous versions cached `/` and `/index.html` aggressively (cache-first
 * with stale-while-revalidate). On a localhost-only app this gave zero
 * offline value but caused a real bug: after the user restarted the CLI
 * (which rebuilds dist/ on every release), the browser kept serving the
 * cached OLD shell with stale JS-chunk references, so the user saw the
 * pre-rebuild UI until they manually hit F5. Multiple users reported it.
 *
 * The fix is to remove service workers entirely. This file stays at the
 * same path so that any browser that registered the old SW receives this
 * replacement on next page load, then:
 *   1) takes control immediately (claim)
 *   2) wipes every cache it ever opened
 *   3) unregisters itself
 *   4) reloads every open Clearmind tab so the user gets a fresh shell
 *
 * `src/main.tsx` no longer calls navigator.serviceWorker.register, so
 * fresh installs never see this file at all.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      await self.clients.claim();
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const c of clients) {
        try { c.navigate(c.url); } catch (_) { /* ignore navigation errors */ }
      }
    } catch (_) {
      /* best-effort cleanup; nothing we can do if the cache API is gone */
    }
  })());
});

// Don't intercept fetches anymore — let the network handle everything.
