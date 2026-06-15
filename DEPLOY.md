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
4. **Save and Deploy.** You get `https://clearmind.pages.dev` (HTTPS, on
   Cloudflare's network → automatic DDoS protection, unlimited bandwidth).
5. Every `git push` to `main` redeploys automatically. Per-commit *preview*
   URLs look like `https://<hash>.clearmind.pages.dev`; the clean production
   URL is `https://clearmind.pages.dev`.

`public/_redirects` (already in the repo) makes client-side routes like
`/calendar` and `/settings` resolve to `index.html` instead of 404 on refresh.

## Alternative: Vercel (free, easiest one-click)

Import the repo at **vercel.com** — it auto-detects Vite (`npm run build` →
`dist`). SPA routing needs `vercel.json` (not committed; add this if you use
Vercel):

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

## A nicer (still free) URL

`*.pages.dev` / `*.vercel.app` are fine. For something that reads like a real
domain **without paying**:

- **`clearmind.js.org`** — free, request via a PR to `github.com/js-org/js.org`.
- **`clearmind.is-a.dev`** — free, PR to `github.com/is-a-dev/register`.

Point either at the Pages site (CNAME). For a *real* domain, buy a cheap TLD
(`.xyz`/`.site` ~ a few $ first year, `.com` ~ $10/yr) at **Cloudflare
Registrar** (at-cost, no markup) and add it in Pages → Custom domains.

## What about cross-device sync (#8)?

Still no login. The device-pairing relay (QR + code, end-to-end encrypted)
will run as a **Cloudflare Worker + KV** (free tier) alongside Pages, or fully
offline via the QR-direct mode. Documented when that lands.

## Notes

- **Each device starts with its own (empty) data** — it's local-first. Move
  data between devices via **Settings → Data → Export/Import JSON** for now;
  #8 will make this a QR/code tap.
- Native deadline notifications when the tab is closed are a **desktop-app /
  CLI** feature (the web can only notify while open). The deployed web is the
  universal viewer/editor; the desktop app + CLI are the always-on host.
