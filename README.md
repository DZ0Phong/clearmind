# Clearmind

A local-first task & calendar app for students — a small **synced ecosystem** you can use as a **website**, from the **terminal (CLI)**, or as a **native desktop app**, all sharing the same data.

No account, no cloud backend, no telemetry. Your data stays on your device.

---

## The ecosystem

| Client          | What it is                                                                                  | Data                                                     |
| --------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Web**         | The React SPA in any browser (`npm run dev`, or served by the CLI / desktop host)           | `localStorage` solo, or the shared store when a host runs |
| **Mobile web**  | The same SPA, responsive — bottom tabs, sheet dialogs, safe-area handling                   | same as web                                              |
| **CLI**         | A Node host (`clearmind`) — background server + system tray + native notifications          | the **hub**: serves `localhost:20129` (REST + SSE), JSON on disk |
| **Desktop app** | A native **Tauri** `.exe` (~2 MB installer, uses the OS WebView2 — no bundled Chromium)      | loads the CLI host when present → **fully synced**; standalone otherwise |

Every client that reaches the host (`localhost:20129`) shares one store under `%APPDATA%/Clearmind/` and they update each other **live** over Server-Sent Events.

---

## Download

- **Desktop app (Windows):** grab the latest `Clearmind_x.y.z_x64-setup.exe` (or `.msi`) from **[Releases](https://github.com/DZ0Phong/clearmind/releases)**. ~2 MB, installs per-user (no admin).
- **From source:** see [Quick start](#quick-start).

---

## Highlights

- **Local-first.** Browser mode stores everything in `localStorage`; host mode stores JSON under `%APPDATA%/Clearmind/`. Export anytime as JSON.
- **One codebase, every surface.** The SPA detects its host (browser / CLI / desktop app) via an injected window marker and adapts storage + chrome automatically.
- **Calendar with four views.** Month grid, week time-grid, focused day with side panel, vertical agenda. Drag-and-drop, recurrence (daily / weekday / weekly / monthly), full IANA timezone support.
- **Pomodoro & weekly review.** Focus sessions log per-task minutes; the review page shows streaks, focus minutes, a 12-week heatmap, and a completion split by task type.
- **Smart import.** Paste a schedule as text, use the bookmarklet, or drop in an `.ics` file.
- **Voice capture.** Web Speech API with a VI / EN language picker for fast title entry.
- **Theme.** Light / dark / system, 32-color accent picker, full VI / EN UI synchronized across tabs.
- **Mobile-ready.** Bottom-tab navigation under `md`, sheet-style dialogs, safe-area handling for notched phones.

---

## Desktop app (Tauri)

A real native window built on the OS WebView2 — light (**~2 MB installer**, ~9 MB installed; no bundled browser engine) and a first-class member of the ecosystem:

- **Synced by default.** On launch it probes the CLI host (`localhost:20129`). If it's up, the window loads it → same data + live SSE as web / mobile / CLI. If nothing is serving, it falls back to the bundled SPA (standalone, `localStorage`), so a freshly-downloaded copy still opens and works.
- **Floating "today" widget.** A frameless, always-on-top mini-window pinned to the top-right corner that lists today's tasks; click one to complete it (writes through to the shared store, so the change shows up everywhere). Toggle it from the tray or with **Ctrl+Alt+C**.
- **System tray.** Open the app, show / hide the widget, or quit. Left-click the icon to surface the main window.
- **Native behaviours.** Single-instance (a second launch focuses the running window instead of opening a duplicate), close-to-tray (closing the main window keeps the app + widget alive in the tray — quit explicitly from the tray), and remembered window size / position.

**Build & release are automated.** Pushing a `v*` git tag runs [GitHub Actions](.github/workflows/release.yml), which builds the `.exe` + `.msi` on a Windows runner (Rust + MSVC live there) and publishes them to a GitHub Release — **no local Rust toolchain required**.

---

## Requirements

- Node.js **18+** (tested on 24), npm 9+
- Windows is the primary target: host mode uses a native tray + WinRT toasts, and the desktop app uses WebView2 (preinstalled on Windows 10/11). macOS / Linux fall back to `node-notifier` and work otherwise.
- Building the desktop app from source additionally needs the **Rust** toolchain + a C/C++ linker (MSVC on Windows). CI handles this for releases.

---

## Quick start

### Browser mode (zero install beyond `npm install`)

```bash
git clone https://github.com/DZ0Phong/clearmind.git
cd clearmind
npm install
npm run dev
```

Open <http://localhost:5173>. Data persists in browser `localStorage`.

### CLI / host mode (tray icon, on-disk JSON, native notifications)

```bash
npm install              # SPA deps
npm run build            # bundles dist/
npm run cli:install      # tray + notifier deps in cli/

npm run cli              # serve + tray, opens dashboard
# or register a global command:
cd cli && npm link
clearmind                # opens dashboard
clearmind --tray         # background only, no browser launch
clearmind --help
```

> **Windows notifications** are emitted via PowerShell + WinRT `ToastNotificationManager` (renders the app icon, Vietnamese text, and snooze / done action buttons). `node-notifier` is the Mac / Linux fallback.

### Desktop app from source

```bash
npm install
npm install -D @tauri-apps/cli
npm run build
npm run tauri build      # needs the Rust toolchain + MSVC; outputs src-tauri/target/release/bundle
```

…or just download the prebuilt installer from [Releases](https://github.com/DZ0Phong/clearmind/releases).

---

## Features

### Tasks

- Full editor: title, description, type (academic / work / personal / other), priority, location, tags, deadline (date or datetime), recurrence, notification timing
- **Natural-language quick capture** — paste `thi Toán thứ 5 14h phòng A1.404` and the parser pulls type, time, location, and a `#thi` tag automatically
- **Voice capture** — Web Speech API with a VI / EN language picker
- **Tag system** — autocomplete from used tags; the calendar legend doubles as a tinted per-type filter; deep-link via `?tag=` and `#overdue`
- **Command palette** (Cmd / Ctrl + K) — actions, task search by title, tag search

### Calendar (4 views)

| View   | Behaviour                                                                          |
| ------ | ---------------------------------------------------------------------------------- |
| Month  | Traditional grid, color-dotted chips, today highlighted as a pill                  |
| Week   | Time-grid with dynamic hours, event cards adapt their content to duration          |
| Day    | Timeline + side panel (progress bar, "next up" countdown, free-slot suggestions)   |
| Agenda | Vertical 14-day list paged ±14 days, sticky chrome stays visible while scrolling   |

Drag-and-drop to reschedule; recurrence via FullCalendar's native `daysOfWeek` + `startRecur` / `endRecur`; smart timezone fallback for the FullCalendar v6 named-zone quirk.

### Focus

- Pomodoro 25 / 5 with custom durations, bind a task to log session minutes, looping chime when the timer ends.

### Weekly review

- Streak ring, focus minutes, completion split by task type, 12-week activity heatmap.

### Import

- **Paste text** — any tabular schedule export • **Bookmarklet** — one-click extraction on a portal page • **ICS file** — drop in any standard `.ics`. Deduplicated by signature for weekly entries, by date for one-offs.

### Host & desktop extras

- **System tray** — quick access from the CLI host and/or the desktop app
- **Auto-backup** — rolling 14 daily snapshots; fires on start if the last is > 12 h old
- **Multi-slot recovery** — every save rotates the previous version into one of three numbered slots, swappable from Settings → Data
- **Single instance**, **autostart**, and **real-time SSE sync** across every open client
- **Desktop app only:** floating today-widget, global hotkey, close-to-tray, remembered window state

---

## CLI reference

```
clearmind                    Open dashboard (auto-picks port from 20129)
clearmind --tray             Background mode, no browser launch
clearmind --no-tray          Foreground server, no tray (SSH / debug / desktop-app host)
clearmind --no-browser       Don't auto-open browser on start
clearmind --port N           Use port N (auto-bumps if busy)
clearmind --data-dir DIR     Override the data directory
clearmind --help / --version
```

Running `clearmind` in a TTY without flags opens an arrow-key menu (Open / Restore / Autostart / Restart / Stop / Minimize).

---

## Data location

| OS      | Path                                       |
| ------- | ------------------------------------------ |
| Windows | `%APPDATA%\Clearmind\`                     |
| macOS   | `~/Library/Application Support/Clearmind/` |
| Linux   | `~/.config/clearmind/`                     |

| File                              | Purpose                             |
| --------------------------------- | ----------------------------------- |
| `clearmind.json`                  | Current task list                   |
| `clearmind.previous-{1,2,3}.json` | Rolling history slots               |
| `backups/*.json`                  | Daily snapshots (rolling 14)        |
| `clearmind.lock`                  | Single-instance marker (pid + port) |

Browser mode keeps everything under the `localStorage` key `clearmind_tasks`. The desktop app, when loading the CLI host, shares the on-disk store above; in standalone fallback it uses the WebView's own `localStorage`.

---

## Tech stack

- **React 19** + **TypeScript 6** + **Vite 8** (Rolldown)
- **Tailwind 4** on **Radix UI** primitives
- **FullCalendar 6** (dayGrid + timeGrid + interaction), **React Router 7** (lazy routes), **Lucide** icons
- **linkedom** for HTML parsing in the import flow
- **Tauri 2** (Rust + OS WebView2) for the desktop app, with the single-instance, global-shortcut, and window-state plugins
- **Node host:** systray2 (native tray), node-notifier (Mac / Linux), PowerShell + WinRT (Windows toasts)

The English UI dictionary is **lazy-loaded** (split into its own chunk) so the default Vietnamese audience never downloads it.

---

## Architecture

```
        Web (browser)      Mobile web        Desktop app (Tauri .exe)
             │                  │                      │
             │   HTTP + SSE     │      HTTP + SSE      │  (loads host if up,
             └──────────────────┴──────────┬──────────┘   else bundled SPA)
                                            ▼
                              CLI host  (localhost:20129)
                              ─────────────────────────────
                              http server + REST + SSE
                              storage adapter (atomic write)
                              notifier (WinRT / node-notifier)
                              systray2 · single-instance lock
                              rolling backups
                                            │
                                            ▼
                                 %APPDATA%/Clearmind/
                                 ├─ clearmind.json
                                 ├─ clearmind.previous-{1,2,3}.json
                                 ├─ backups/*.json
                                 └─ clearmind.lock
```

Notable decisions:

- **Storage adapter pattern.** The SPA checks `window.__CLEARMIND_CLI__` at startup; the same hooks talk to either `localStorage` or the REST API behind one interface.
- **Window-marker views.** The desktop app injects `window.__CLEARMIND_WIDGET__` into its floating widget window so the SPA mounts a compact "today" view instead of the full app — same bundle, no separate build.
- **SSE over polling.** The host pushes `tasks-updated` events on every write; clients reconcile by mtime and ignore echoes of their own writes.
- **Service Worker disabled.** `public/sw.js` is a self-destruct shim — Vite already hash-busts the bundle, and a SW kept serving stale shells after host rebuilds.

---

## Project structure

```
src/
├── pages/            one file per route (dashboard, calendar, tasks, focus, review, settings, import, guide)
├── components/
│   ├── calendar/     FullCalendar wrapper + day/overview dialogs
│   ├── tasks/        task dialog, command palette, voice mic
│   ├── settings/     theme / accent / language / timezone pickers
│   ├── widget/       desktop floating-widget view
│   ├── feedback/     toasts, confirm dialog, tip banner, onboarding
│   ├── layout/       topbar + sidebar + mobile tab bar
│   └── ui/           shared primitives (Select, DateTimePicker, …)
├── hooks/            use-tasks (context + storage adapter + reminders), media queries
└── lib/
    ├── i18n/         index.tsx + dict-vi.ts + dict-en.ts (EN lazy-loaded)
    ├── cli-bridge.ts host detection + REST + SSE client
    ├── schedule-parser.ts · ics.ts · utils.ts

cli/                  Node host — cli.js, server.js, storage.js, tray.js, notifications.js,
                      autostart.js, single-instance.js, icon.js, url-scheme.js, …

src-tauri/            Tauri desktop shell — src/lib.rs (windows + tray + hotkey), tauri.conf.json,
                      Cargo.toml, icons/ (generated from cli/icon.js)

.github/workflows/    release.yml — tag-triggered Tauri build + GitHub Release
```

---

## Development scripts

| Command               | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `npm install`         | Install SPA dependencies                     |
| `npm run dev`         | Vite dev server at <http://localhost:5173>   |
| `npm run build`       | TypeScript check + production build          |
| `npm run lint`        | ESLint                                       |
| `npm run tauri`       | Tauri CLI (`npm run tauri build` / `dev` / `icon`) |
| `npm run cli`         | Run the Node host (server + tray)            |
| `npm run cli:tray`    | Host in background tray-only mode            |
| `npm run cli:dev`     | Host without tray (debug, foreground)        |

---

## Troubleshooting

**`clearmind: command not found` after `npm link`.** Ensure your npm global bin is on `PATH` (`%APPDATA%\npm` on Windows; `npm prefix -g` to confirm).

**Tray icon doesn't appear.** systray2 needs a GUI session; on headless / SSH use `--no-tray`.

**Toast notifications don't fire (Windows).** Check Settings → System → Notifications → Clearmind is allowed and Focus Assist is off.

**Desktop app opens but shows no data.** It only syncs when the CLI host is running (`clearmind --tray`). Without a host it runs standalone on its own `localStorage`.

**Browser-mode and host-mode data differ.** They're independent universes (`localhost:5173` localStorage vs the on-disk store at `localhost:20129`). Use Settings → Data → Export to move between them.

---

## License

Not yet licensed. Treat as source-available for review purposes.
