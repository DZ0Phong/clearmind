# Clearmind

A local-first task & calendar app for students. Single-page React app with an optional Node host that adds a system tray icon, native OS notifications, and on-disk persistence — same source, two storage adapters.

No account, no backend, no telemetry. Your data stays on your device.

---

## Highlights

- **Local-first.** Browser mode stores everything in `localStorage`. Desktop mode stores JSON on disk under `%APPDATA%/Clearmind/` (Windows) or its platform equivalent. Export anytime as JSON.
- **Two modes, one codebase.** The SPA detects the desktop host via an injected window marker and swaps to the on-disk adapter automatically. Run `npm run dev` for the browser-only flow, `clearmind` for the tray-resident flow.
- **Calendar with four views.** Month grid, week time-grid, focused day with side panel, vertical agenda. Drag-and-drop, recurrence (daily / weekday / weekly / monthly), full IANA timezone support.
- **Pomodoro & weekly review.** Focus sessions log per-task minutes. The review page surfaces streaks, focus minutes, a 12-week activity heatmap, and a completion split by task type.
- **Smart import.** Paste your school schedule as text, install the bookmarklet for one-click extraction, or drop in an `.ics` file. Parser handles subject codes, day-of-week, start/end times, and recurrence.
- **Voice capture.** Web Speech API for fast title entry online; offline Whisper (`@huggingface/transformers`) for mixed Vietnamese-English transcription — works fully offline once the model caches.
- **Theme.** Light / dark / system, 32-color accent picker (each pair tuned for both surfaces), full VI / EN UI synchronized across tabs.
- **Mobile-ready.** Bottom-tab navigation under `md`, sheet-style dialogs, safe-area handling for notched iPhones and Android gestural nav.

---

## Requirements

- Node.js **18+** (tested on 24)
- npm 9+

Windows is the primary target for desktop mode (native tray + WinRT toasts). macOS and Linux fall back to `node-notifier` for notifications and work otherwise.

---

## Quick start

### Browser mode (zero install beyond `npm install`)

```bash
git clone https://github.com/your-handle/clearmind.git
cd clearmind
npm install
npm run dev
```

Open <http://localhost:5173>. Data persists in browser `localStorage`.

### Desktop mode (tray icon, on-disk JSON, native notifications)

```bash
npm install              # SPA deps
npm run build            # bundles dist/
npm run cli:install      # tray + notifier deps in cli/

# Option 1 — run once from the repo
npm run cli

# Option 2 — register `clearmind` as a global command
cd cli
npm link
clearmind                # opens dashboard
clearmind --tray         # background only, no browser launch
clearmind --help
```

`npm link` symlinks the CLI entry into your npm global bin (`%APPDATA%/npm` on Windows), so every subsequent `npm run build` is picked up automatically. To remove: `cd cli && npm unlink -g`.

> **Notifications on Windows** are emitted via PowerShell + WinRT `ToastNotificationManager`, not `node-notifier`. The WinRT path renders the app icon, Vietnamese text without mangling, and three action buttons (snooze 10m / 1h / done). `node-notifier` is kept only as a Mac/Linux fallback.

---

## Features

### Tasks

- Full editor: title, description, type (academic / work / personal / other), priority, location, tags, deadline (date or datetime), recurrence, notification timing
- **Natural-language quick capture** — paste `thi Toán thứ 5 14h phòng A1.404` and the parser pulls type, time, location, and a `#thi` tag automatically
- **Voice capture** — Web Speech (online, fast) or Whisper (offline, accent-robust, handles VN + EN mixed)
- **Tag system** — autocomplete from used tags; the calendar legend doubles as a tinted per-type filter; deep-link via `?tag=` and `#overdue`
- **Command palette** (Cmd/Ctrl + K) — actions, task search by title, tag search (type two characters of any tag)

### Calendar (4 views)

| View   | Behaviour                                                                         |
| ------ | ---------------------------------------------------------------------------------- |
| Month  | Traditional grid, color-dotted chips, today highlighted as a pill                  |
| Week   | Time-grid 06:00–22:00, event cards adapt their content to duration                 |
| Day    | Timeline + side panel (progress bar, "next up" countdown, free-slot suggestions)   |
| Agenda | Vertical 14-day list paged ±14 days, sticky chrome stays visible while scrolling   |

- Drag-and-drop to reschedule
- Recurrence rendered via FullCalendar's native `daysOfWeek` + `startRecur` / `endRecur`
- Smart timezone fallback — uses `"local"` when the chosen IANA zone matches the browser's, falls back to the named zone otherwise (avoids the FullCalendar v6 quirk that drops named zones to UTC without the Luxon plugin)

### Focus

- Pomodoro 25/5 with custom durations
- Bind a task to log session minutes against it
- Looping Tibetan-bowl synth chime when the timer ends (until dismissed)

### Weekly review

- Streak ring with reactive copy
- Focus minutes for the week
- Completion split by task type (Academic / Work / Personal / Other)
- 12-week activity heatmap

### Import

- **Paste text** — any tabular schedule export from your school portal
- **Bookmarklet** — one click on the portal page extracts the schedule into Clearmind
- **ICS file** — drop in any standard `.ics`
- Deduplication via signature `(subject_code, day_of_week, time)` for weekly entries; date-based for one-offs

### Desktop-only extras

- **System tray** — open dashboard, quick capture, start focus session, toggle "start with Windows", open data folder, manual backup, quit
- **Auto-backup** — rolling 14 daily snapshots in `backups/`; if the last backup is older than 12 h on start, one fires immediately
- **Multi-slot recovery** — every save rotates the previous version into one of three numbered slots (`clearmind.previous-{1,2,3}.json`). The Settings → Data tab lets you swap any slot back into place (swap is reversible)
- **Single instance** — lockfile + port probe; if a stale PID is alive but doesn't respond to `/api/health`, the lock is reclaimed
- **Autostart** — writes `Clearmind.vbs` into the Windows Startup folder (hidden window). Toggle from Settings or the tray menu
- **Real-time sync** — multiple browser tabs stay in lockstep via Server-Sent Events from the host

---

## CLI reference

```
clearmind                    Open dashboard (auto-picks port from 20129)
clearmind --tray             Background mode, no browser launch
clearmind --no-tray          Foreground server, no tray (useful for SSH/debug)
clearmind --no-browser       Don't auto-open browser on start
clearmind --port N           Use port N (auto-bumps if busy)
clearmind --data-dir DIR     Override the data directory
clearmind --help
clearmind --version
```

Running `clearmind` in a TTY without flags opens an arrow-key TTY menu (Open / Restore / Autostart / Restart / Stop / Minimize) inspired by [decolua/9router](https://github.com/decolua/9router).

---

## Data location

| OS      | Path                                          |
| ------- | --------------------------------------------- |
| Windows | `%APPDATA%\Clearmind\`                        |
| macOS   | `~/Library/Application Support/Clearmind/`    |
| Linux   | `~/.config/clearmind/`                        |

Contents:

| File                          | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `clearmind.json`              | Current task list                        |
| `clearmind.previous-{1,2,3}.json` | Rolling history slots                |
| `backups/*.json`              | Daily snapshots (rolling 14)             |
| `clearmind.lock`              | Single-instance marker (pid + port)      |

Browser mode keeps everything under the localStorage key `clearmind_tasks` instead. Switching to desktop mode the first time migrates the browser data to disk and stashes a `clearmind_tasks_legacy` key as a safety net.

---

## Tech stack

- **React 19** + **TypeScript 6** + **Vite 8** (Rolldown)
- **Tailwind 4** + **shadcn/ui** on top of **Radix UI** primitives
- **FullCalendar 6** (dayGrid + timeGrid + interaction)
- **React Router 7** with lazy-loaded routes
- **Lucide React** icons
- **@huggingface/transformers** for offline Whisper STT (lazy `~23 MB` WASM, loaded only when picked)
- **linkedom** for HTML parsing in the import flow

Desktop host:

- Node 18+
- **systray2** — native Go binary tray
- **node-notifier** — Mac/Linux toast fallback
- Native PowerShell + WinRT for Windows toasts (UTF-16 env-var bridge for Vietnamese)

---

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  Browser (SPA)          │         │  Optional Node host      │
│  ─────────────────────  │  HTTP   │  ───────────────────     │
│  React 19               │ ◄─────► │  http server + REST      │
│  Tailwind 4             │  + SSE  │  Storage adapter         │
│  FullCalendar           │         │  Notifier (WinRT / node) │
│  i18n VI / EN           │         │  Systray2                │
│  Accent system          │         │  Single-instance lock    │
│  localStorage adapter   │         │  Rolling backups         │
└─────────────────────────┘         └──────────────────────────┘
         │                                  │
         │ Detect host via                  │ %APPDATA%/Clearmind/
         │ window.__CLEARMIND_CLI__         │ ├─ clearmind.json
         └ ▼                                │ ├─ clearmind.previous-{1,2,3}.json
            Same source, two                │ ├─ backups/*.json
            storage adapters                │ └─ clearmind.lock
                                            └────────────────────────────
```

Notable decisions:

- **Storage adapter pattern.** The SPA checks `window.__CLEARMIND_CLI__` at startup; the same hooks talk to either `localStorage` or the REST API behind a uniform interface. No code path duplicated.
- **Inline hydration.** On desktop mode, the host injects the current task array into the initial HTML alongside an mtime marker, so the SPA renders the real list at first paint with zero fetch.
- **SSE over polling.** The host pushes `tasks-updated` events on every PUT; the SPA reconciles by mtime and ignores echoes of its own writes.
- **Service Worker disabled.** `public/sw.js` is a self-destruct shim that unregisters any prior SW, clears caches, and reloads — Clearmind's main bundle is hash-busted by Vite already, and a SW kept serving stale shells after CLI rebuilds.
- **Vite manualChunks.** `node_modules` is split into seven vendor chunks (react-dom, router, radix, icons, whisper, fullcalendar, catch-all) so app-code edits don't bust dependency hashes.

---

## Project structure

```
src/
├── pages/                       one file per route
│   ├── dashboard.tsx            hero + agenda + week strip + focus snapshot
│   ├── calendar.tsx             wrapper for CalendarView
│   ├── tasks.tsx                3-view list (Tasks / Schedule / All) + filters
│   ├── focus.tsx                Pomodoro timer
│   ├── review.tsx               weekly stats + heatmap
│   ├── settings.tsx             tabbed Appearance / Notifications / Data / System / Advanced
│   ├── import.tsx               paste / bookmarklet / ICS
│   └── guide.tsx                in-app help
├── components/
│   ├── calendar-view.tsx        FullCalendar wrapper, 4 views, sticky chrome
│   ├── task-dialog.tsx          create / edit task
│   ├── homework-dialog.tsx      subtask under an academic task
│   ├── command-palette.tsx      Cmd/Ctrl+K with tag search
│   ├── accent-picker.tsx        32-color Theme Studio dialog
│   ├── theme-picker.tsx         light / dark / system segmented
│   ├── language-picker.tsx      VI / EN segmented
│   ├── timezone-picker.tsx      IANA dropdown with search
│   ├── voice-mic.tsx            Web Speech + Whisper compound mic
│   ├── tip-banner.tsx           rotating sticky tip strip
│   ├── duplicate-banner.tsx     auto-clean duplicate detector
│   ├── confirm-dialog.tsx       replaces window.confirm / prompt
│   ├── first-run-welcome.tsx    onboarding modal
│   ├── mini-calendar.tsx        sidebar dot-calendar
│   ├── layout/
│   │   ├── main-layout.tsx      topbar + sidebar + bottom tab bar
│   │   ├── sidebar.tsx          desktop primary nav
│   │   └── mobile-tab-bar.tsx   < md bottom navigation
│   └── ui/                      shadcn primitives
├── hooks/
│   └── use-tasks.tsx            context + reducer + storage adapter + reminders
├── lib/
│   ├── utils.ts                 tz-aware date helpers, subject color hash, NL parser
│   ├── i18n.tsx                 VI / EN dictionary (~1400 keys)
│   ├── schedule-parser.ts       text / ICS / HTML → ParsedClass[]
│   ├── ics.ts                   ICS exporter
│   ├── cli-bridge.ts            host detection + REST helpers + SSE client
│   ├── horizontal-wheel.ts      global vertical→horizontal wheel for tab strips
│   ├── error-log.ts             local error capture
│   └── whisper.ts               lazy Whisper worker manager
└── workers/
    └── whisper.worker.ts        offline STT via @huggingface/transformers

cli/                              Node host (optional)
├── cli.js                        entry: args + detached spawn + single-instance probe
├── menu.js                       9router-style arrow-key TTY menu
├── server.js                     HTTP server + REST + SSE + marker injection
├── storage.js                    atomic write + rolling history + sanitize + tmp suffix
├── notifications.js              PowerShell+WinRT on Windows, node-notifier elsewhere
├── toast.ps1                     Windows toast script (UTF-16 env-var bridge)
├── tray.js                       systray2 menu
├── autostart.js                  VBS hidden-window writer for Windows Startup
├── single-instance.js            lockfile + PID liveness + port probe
├── icon.js                       programmatic ICO generation (no asset shipped)
├── url-scheme.js                 register clearmind:// for toast snooze actions
├── url-handler.js                handle clearmind:// snooze / done callbacks
└── open-browser.js               cross-platform start / open / xdg-open
```

---

## Development scripts

| Command               | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `npm install`         | Install SPA dependencies                         |
| `npm run dev`         | Vite dev server at <http://localhost:5173>       |
| `npm run build`       | TypeScript check + production build              |
| `npm run lint`        | ESLint                                            |
| `npm run preview`     | Preview production build                         |
| `npm run cli:install` | Install desktop host dependencies                |
| `npm run cli`         | Run host (server + tray)                         |
| `npm run cli:tray`    | Host in background tray-only mode                |
| `npm run cli:dev`     | Host without tray (debug, foreground)            |

---

## Troubleshooting

**`clearmind: command not found` after `npm link`.** Make sure your npm global bin is on `PATH`. On Windows: `%APPDATA%\npm`. Run `npm prefix -g` to confirm the directory.

**Tray icon doesn't appear.** systray2 needs a GUI session. Headless / SSH sessions: use `--no-tray`.

**Toast notifications don't fire.** On Windows, check Settings → System → Notifications → Clearmind is allowed and Focus Assist is off. The host logs `Toast fired` only when PowerShell exits cleanly — it doesn't mean the user saw it (Focus Assist can silently swallow toasts).

**Browser keeps loading the old UI after a rebuild.** Hard refresh (`Ctrl+Shift+R`). The Service Worker has been removed; if you previously had one cached, the self-destruct shim should clean it up on next load. If not, clear site data once.

**Browser-mode (`npm run dev`) and desktop-mode data look different.** They are independent — localStorage at `localhost:5173` is a separate "universe" from disk JSON at `localhost:20129`. Use Settings → Data → Export to move between them.

---

## License

Not yet licensed. Treat as source-available for review purposes.
