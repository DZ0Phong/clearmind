# Deploy the Clearmind web

Clearmind's web is a **static, local-first SPA** — it runs entirely in the
browser and stores data in `localStorage`. **No database, no backend server,
and no login are required.** Deploying = serving the `dist/` build on a static
host. Any visitor count is fine; static files are cheap and cached at the edge.

## Recommended: Cloudflare Pages (free)

1. Push the repo to GitHub (already done).
2. Go to **dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git**.
3. Pick the `clearmind` repo. Set:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - (Framework preset: *None* / *Vite* — either works.)
4. **Save and Deploy.** The live site is **<https://clearmind-app.pages.dev>**
   (the bare `clearmind` project name was globally taken, so the project is
   `clearmind-app`). HTTPS, on Cloudflare's network → automatic DDoS protection
   + unlimited bandwidth.
5. Every `git push` to `main` redeploys automatically. Per-commit *preview*
   URLs look like `https://<hash>.clearmind-app.pages.dev`; the clean
   production URL is **<https://clearmind-app.pages.dev>**.

The `postbuild` script copies `dist/index.html` → `dist/404.html` so
client-side routes like `/calendar` and `/settings` resolve to the SPA instead
of a 404 on refresh (Cloudflare's Workers-assets validator rejects the
`_redirects` `/* /index.html 200` rule as an infinite loop, so we use the
404.html fallback, which works on both Pages and Workers).

## A nicer (still free) URL

`clearmind-app.pages.dev` is clean, free, and what the project uses. For a
custom domain later: **eu.org** gives free subdomains (slow manual approval;
you delegate it to Cloudflare's nameservers), or buy a cheap TLD
(`.xyz`/`.site` ~ a few $/yr, `.com` ~ $10/yr) at **Cloudflare Registrar**
(at-cost) and add it under Pages → Custom domains. Caveat: free subdomain
services whose DNS is itself on Cloudflare (js.org, is-a.dev) **can't** be
Cloudflare-Pages custom domains.

## Cross-device sync — "Link a device" (#8)

No login, end-to-end encrypted (AES-GCM, key from PBKDF2 over a one-time code).
One device shows a **QR + code**, the other **scans or types** it; works both
directions. The transfer rides a **zero-knowledge relay** that only ever stores
ciphertext, keyed by `SHA-256(code)`, for ~5 minutes, deleted on first read.

Two relay backends, picked automatically by origin — nothing to configure in
the SPA:

- **CLI host / LAN** (`localhost:20129`): the relay is built into
  `cli/server.js` (`/api/link`, in-memory). Works out of the box.
- **Deployed web** (Cloudflare Pages): the relay is the Pages Function at
  `functions/api/link.js`, which deploys automatically with the site. It needs
  a **KV namespace** for storage — a one-time setup:

  1. Cloudflare dashboard → **Workers & Pages → KV → Create namespace** (name it
     e.g. `clearmind-link`).
  2. Your Pages project → **Settings → Functions → KV namespace bindings → Add
     binding**. Variable name **`LINK_KV`**, bind it to the namespace above.
  3. Redeploy (any push). Done — `/api/link` is now live on your domain.

  Free-tier KV (100k reads + 1k writes/day) is far more than a personal sync
  feature needs. Until the binding exists, `/api/link` returns 503 and the app
  **falls back to offline QR-direct mode** (the encrypted snapshot rides inside
  the QR itself — no server, but the other device must *scan* it, and it only
  works while the data fits in a QR).

Found in **Settings → Data → Link a device**, and on the **Import** page.

## Notes

- **Each device starts with its own (empty) data** — it's local-first. Move
  data between devices via **Settings → Data → Export/Import JSON** for now;
  #8 will make this a QR/code tap.
- Native deadline notifications when the tab is closed are a **desktop-app /
  CLI** feature (the web can only notify while open). The deployed web is the
  universal viewer/editor; the desktop app + CLI are the always-on host.
