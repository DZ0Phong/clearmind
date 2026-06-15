# Clearmind — Implementation Notes

> **Lần sau session mới: bảo Claude "đọc `NOTES.md` rồi tiếp tục".** Toàn bộ context kiến trúc + bug đã fix + quyết định đều ở đây.

## TL;DR

Clearmind là một **Vite + React SPA** quản lý task cho sinh viên (calendar, focus, weekly review). Mode mặc định là **local-first qua `localStorage`** (không backend). Mode nâng cao là **CLI mode** — Node host chạy ngầm cùng Windows, system tray icon, data lưu vào `%APPDATA%\Clearmind\` qua HTTP API. Cảm hứng từ [decolua/9router](https://github.com/decolua/9router).

```
clearmind --tray       # chạy ngầm, autostart cùng Windows
clearmind              # mở dashboard ở localhost:20129
```

## Cấu trúc thư mục

```
src/                     # SPA source (React 19 + TS + Vite + Tailwind 4)
├── pages/               # 1 file / route
├── components/
│   ├── calendar-view.tsx   # FullCalendar wrapper (4 view + day sidebar)
│   ├── task-dialog.tsx     # create + edit task
│   ├── date-time-picker.tsx
│   ├── command-palette.tsx # ⌘K
│   └── layout/             # MainLayout + Sidebar + TopBar + CliStatusBadge
├── hooks/
│   └── use-tasks.tsx    # CRUD + reducer + localStorage/API bridge
└── lib/
    ├── cli-bridge.ts        # detect CLI mode + REST helpers
    ├── use-ticking-now.ts   # snap-to-boundary clock hook
    ├── use-cli-health.ts    # /api/health polling for status badge
    ├── utils.ts             # bucketByDate, subjectColor, NL parser, classifier
    ├── schedule-parser.ts   # text/ICS/HTML → ParsedClass[]
    └── ics.ts               # ICS exporter

cli/                     # Node CLI host (chạy ngầm)
├── cli.js               # entry: args + detached spawn + single-instance probe
├── menu.js              # 9router-style arrow-key menu (mặc định cho `clearmind` ở TTY)
├── server.js            # http server + REST API + SSE + marker injection + daily backup
├── storage.js           # atomic JSON write + multi-level history + sanitize/validate
├── notifications.js     # toast via PowerShell + WinRT (env vars, UTF-16 native)
├── toast.ps1            # PS script firing toast — title/message từ env vars
├── tray.js              # systray2 menu (Open / Capture / Focus / Autostart / Backup / Quit)
├── autostart.js         # VBS file writer cho Windows Startup folder (hidden window)
├── single-instance.js   # lockfile + PID liveness probe
├── icon.js              # draws indigo rounded-square + 4-point star (multi-size ICO)
├── open-browser.js      # cross-platform start/open/xdg-open + Explorer
├── package.json         # bin: "clearmind": "./cli.js" (deps: systray2 + node-notifier)
└── assets/
    ├── icon.png         # 32×32 sinh tự động khi tray init
    └── icon.ico         # multi-size (16+32) cho Windows tray

dist/                    # SPA build output
public/                  # favicon.svg, manifest, sw.js
```

## Data layout — `%APPDATA%\Clearmind\`

| File | Mục đích |
|---|---|
| `clearmind.json` | Source of truth — tasks hiện tại |
| `clearmind.previous-1.json` | History slot 1 (mới nhất) |
| `clearmind.previous-2.json` | History slot 2 |
| `clearmind.previous-3.json` | History slot 3 (cũ nhất) |
| `clearmind.lock` | Single-instance lockfile (`{pid, port, startedAt}`) |
| `backups/YYYY-MM-DD-HH-mm-ss.json` | Daily snapshots (rolling 14) |

**Safety rules:**
- Mỗi PUT: shift history-1→2, history-2→3, current→history-1
- Nếu PUT mới là rỗng AND có slot non-empty → **không shift** (chống wipe→wipe ăn hết history)
- Auto-backup: server start → check `lastBackupAt`; nếu > 12h → snapshot ngay. Sau đó `setInterval` 24h.

## REST API surface (CLI mode, `localhost:20129`)

| Method | Path | Mục đích |
|---|---|---|
| GET | `/api/health` | port/version/dataDir/autostart/platform |
| GET | `/api/tasks` | trả `{tasks: []}` |
| PUT | `/api/tasks` | save full array (sanitize trước, trả `{ok, count, dropped}`) |
| POST | `/api/migrate` | merge incoming tasks (skip dup id) |
| POST | `/api/backup` | snapshot ngay vào `backups/` |
| GET | `/api/history-info` | trả 3 slots: `[{version, exists, mtime, count}]` |
| GET | `/api/previous-info` | legacy = history slot 1 |
| POST | `/api/recover?version=N` | swap current ↔ slot N (1-3, default 1) |
| GET | `/api/scheduled-notifications` | list timer đang chờ trong 25h |
| POST | `/api/test-notification` | fire toast NGAY (Test button) |
| GET/PUT | `/api/autostart` | toggle VBS shortcut ở Startup folder |
| POST | `/api/open-data-dir` | mở Explorer `%APPDATA%\Clearmind\` |
| POST | `/api/link` | **device-link relay** (#8) — lưu ciphertext dưới `id=SHA-256(code)`, TTL 5p, in-memory Map, one-time |
| GET | `/api/link?id=` | pull + xoá ciphertext (consume 1 lần); 404 nếu hết hạn/đã dùng |
| POST | `/api/quit` | graceful shutdown (menu Stop/Restart) — ack 200 rồi SIGTERM |
| GET | `/api/events` | **SSE stream** — server push `snapshot` lúc connect + `tasks-updated` mỗi khi đĩa đổi |
| GET/HEAD | `/*` | static `dist/` + inject `window.__CLEARMIND_CLI__` + `__CLEARMIND_TASKS__` + `__CLEARMIND_MTIME__` |

## SPA ↔ CLI bridge

- Server inject 3 globals vào `<head>` mỗi lần serve `index.html`:
  - `window.__CLEARMIND_CLI__ = {port, version, dataDir, platform}` — marker phát hiện CLI mode
  - `window.__CLEARMIND_TASKS__ = [...]` — **inline hydration**, SPA render thẳng task thật ở first paint (zero fetch)
  - `window.__CLEARMIND_MTIME__ = mtimeMs` — version stamp để so với SSE snapshot
- `isCliMode()` check marker → quyết định mọi flow:
  - Có: dùng REST API + SSE qua `cli-bridge.ts`
  - Không: dùng `localStorage` thuần (giữ tương thích `npm run dev`)
- Migration tự động: load lần đầu CLI mode, nếu server rỗng và `localStorage` có data → POST `/api/migrate`, rename `clearmind_tasks` → `clearmind_tasks_legacy` (giữ làm safety, không xoá hẳn).

## Real-time sync (SSE)

Mọi client kết nối `/api/events` (EventSource). Server giữ Set `sseClients`.
Mỗi PUT/migrate/recover → `sseBroadcast("tasks-updated", {tasks, mtimeMs})`.
Lúc connect, server gửi `snapshot` ngay → tab vừa mở / vừa F5 luôn có version mới nhất kể cả khi inline payload stale (race với PUT đang xử lý).

Client logic (`use-tasks.tsx`):
- `lastSyncedRef` = JSON snapshot ta biết đã trên đĩa
- `lastMtimeRef` = version stamp cuối nhận được
- SSE event đến: bỏ qua nếu `mtime ≤ lastMtimeRef` (stale), bỏ qua nếu echo của chính ta (serialized match), bỏ qua nếu state dirty (user đang edit)
- PUT debounce **80ms** (giảm từ 400ms) + `keepalive: true` → survive F5/đóng tab giữa chừng
- Focus/visibility refetch giữ làm safety net khi EventSource bị extension/proxy chặn

## Lifecycle: save flow trong CLI mode

```
User edit → setTasks(prev → updated)
    → useEffect [tasks, loadState, cli] fires
    → if loadState !== "loaded": SKIP (guard against wipe-on-fetch-fail)
    → if JSON.stringify(tasks) === lastSyncedRef: SKIP (no-op write)
    → setTimeout(400ms) → cliPutTasks(tasks)
        → server sanitize → writeTasks (rotate history) → scheduleAll(tasks)
        → lastSyncedRef = new JSON
```

`beforeunload`: nếu dirty (tasks ≠ lastSynced) → `fetch(PUT, keepalive: true)` flush trước khi page unload.

## Notifications — Windows toast

**Approach hiện tại** (sau khi đã trải qua 2 lần fix encoding):
1. Server giữ `Map<taskId, {handle, fireAt, title}>` cho timer
2. Mỗi PUT → `scheduleAll(tasks)`: clear + schedule lại trong window 25h
3. Khi timer fire → `fire(task)` → spawn `powershell.exe -File cli/toast.ps1`
4. Title/message/icon truyền qua **env vars** `CM_TITLE/CM_MESSAGE/CM_ICON` (Windows env block native UTF-16 → tiếng Việt OK)
5. PS script dùng `Windows.UI.Notifications.ToastNotificationManager` (WinRT), template `ToastImageAndText02`, AppUserModelID `Clearmind` (fallback `Microsoft.Windows.Explorer` nếu chưa register)
6. PS process detached, exit code != 0 → fallback `node-notifier` (Mac/Linux dùng cái này luôn)

**Periodic re-schedule** mỗi 1h: server tự `scheduleAll(readTasks())` để cover case browser đóng nhiều ngày, task slide vào 25h window mà không có PUT mới nào trigger.

**SPA tự động set notify=`at-time`** khi user vừa set deadline lần đầu (chỉ create mode, user vẫn có thể chọn "Không nhắc" sau).

## Device linking — "Liên kết thiết bị" (#8)

Cross-device sync **không cần login**, end-to-end encrypted, qua **QR + mã code**,
hai chiều. Code ở `src/lib/device-link/` + UI `src/components/device-link/`.

- **Crypto** (`crypto.ts`): mã `code` 8 ký tự alphabet không nhập nhằng (bỏ
  0/O/1/I/L/U). Key = **PBKDF2-SHA256(code, salt, 200k iters) → AES-GCM-256**.
  Snapshot JSON được **gzip (CompressionStream)** trước khi mã hoá → list task
  thực tế đủ nhỏ để nhét vào 1 QR. `relayId = SHA-256("clearmind-link-id|"+code)`
  — **domain-separated** với key derivation nên relay thấy id cũng không suy ra
  được key. Payload đóng gói `ver|flags|salt(16)|iv(12)|ciphertext` → base64url.
  GCM auth-tag fail = sai code → `WrongCodeError`.
- **2 transport** (`index.ts`), tự chọn theo origin:
  - **Relay** (mặc định): push ciphertext lên `${origin}/api/link`, QR chỉ chứa
    `clearmind-link:<code>` (luôn quét được dù data lớn). Bên kia pull bằng
    QR/nhập-mã. Relay **zero-knowledge** (chỉ giữ bản mã, 5p TTL, xoá khi đọc).
  - **QR-direct** (offline fallback khi relay down): blob mã hoá nằm thẳng
    trong QR `clearmind-data:<blob>` (key ngẫu nhiên nhúng kèm — QR LÀ bí mật).
    Zero infra nhưng chỉ nhận được bằng QUÉT + phải vừa QR.
- **2 backend relay** cùng contract: `cli/server.js` `/api/link` (in-memory, cho
  CLI host/LAN) + **Cloudflare Pages Function** `functions/api/link.js` (KV, cho
  web đã deploy — auto-deploy cùng Pages, **cần bind KV namespace `LINK_KV`**,
  xem DEPLOY.md; chưa bind → 503 → SPA tự fallback QR-direct).
- **UI** (`device-link-dialog.tsx`): 1 dialog, 2 tab **Gửi/Nhận**, có ở MỌI thiết
  bị. Gửi = QR + code + đếm ngược 5p. Nhận = camera (`BarcodeDetector` →
  `jsqr` fallback) + ô nhập mã. Vào từ **Settings → Data** + trang **Import**.
- **Apply**: `useTasks().receiveSnapshot(tasks, "merge"|"replace")` — merge =
  cộng dồn theo id (không đè edit local), replace = ghi đè toàn bộ (có confirm).
- **Deps**: `qrcode` (gen) + `jsqr` (decode), static-import (dynamic import
  unreliable trong desktop WebView). Bundle main +~? KB (≈415KB tổng).
- **Validated**: crypto round-trip 15/15, relay HTTP 8/8, UI smoke 7/7, full
  send→receive 2-context e2e 6/6 (Playwright headless, text-only).

## Bug & fix catalog (chronological)

| # | Bug | Fix |
|---|---|---|
| 1 | Server wipe khi initial fetch fail (loadFromLocal → tasks=[] → save effect PUT[]) | `loadState: "loading"\|"loaded"\|"error"`; save effect chỉ chạy khi `"loaded"`; thêm `lastSyncedRef` skip no-op PUT |
| 2 | `localStorage.removeItem` trong migration chạy bất kể migrate thành công | Chỉ remove SAU KHI verify server.length ≥ local.length; backup vào `_legacy` thay vì xoá hẳn |
| 3 | previous.json bị wipe→wipe nuốt mất snapshot tốt | Không overwrite previous nếu current rỗng VÀ previous có data |
| 4 | Tray icon ô vuông tím trơn | Vẽ programmatic: rounded square indigo + 4-point star trắng (point-in-polygon scan). Multi-size ICO (16+32) cho HiDPI. `tray.js` force regenerate trên mỗi start. |
| 5 | TimeStepper `slice(0,2)` cắt 2 chữ ĐẦU → gõ "15" ra "01" | Đổi `.slice(-2)` lấy 2 chữ CUỐI |
| 6 | Dashboard `now = Date.now()` inline, không tick → countdown đứng yên | Tạo `useTickingNow(intervalMs)` snap-to-boundary, áp Dashboard (30s) + TopBar (60s) + Tasks page (30s) + Calendar |
| 7 | Native notifications không fire / không thấy UI Test button | Thêm `/api/test-notification`, `/api/scheduled-notifications`, panel Settings với Test button + list scheduled |
| 8 | Tiếng Việt bị mangle trong toast (SnoreToast cmdline encoding) | Thay backend Windows: PowerShell + WinRT direct API, title/message qua **env vars** (CreateProcessW native UTF-16), script ở file `toast.ps1` (không cmdline) |
| 9 | Task tạo qua UI mặc định notify=null → server skip schedule | TaskDialog auto-set notify="at-time" lần đầu deadline xuất hiện. Thêm `<NotifyPreview>` hiện "Sẽ nhắc lúc HH:MM ngày DD/MM" + warning đỏ nếu deadline đã qua giờ nhắc |
| 10 | Bundle 783KB warning | Lazy-load Calendar (291KB) + Import (41KB) qua React.lazy + Suspense. Main giờ 447KB |
| 11 | Dynamic import `@fullcalendar/interaction` ở dashboard "INEFFECTIVE" | Xoá drag-to-calendar setup (feature half-baked) → cảnh báo hết |
| 12 | Server runs nhiều ngày không có PUT → schedule mới không fire | `startPeriodicReschedule(dataDir)` mỗi 1h `scheduleAll(readTasks())` |
| 13 | Client push junk data → server lưu nguyên | `sanitizeTasksArray()`: validate enums + required fields, drop entries thiếu title, trả `dropped: N` |
| 14 | User không biết CLI có connect hay không | TopBar pill `● CLI` (xanh) / `CLI offline` (đỏ pulse). Poll `/api/health` 30s + refetch on focus |
| 15 | Chỉ 1 level previous.json | Rolling 3 slots `previous-1/2/3.json`. Migrate legacy `clearmind.previous.json` → slot 1. Settings UI list cả 3 với count + thời gian, pick slot để recover |
| 16 | `clearmind` không chạy global, phải `npm run cli` | `cli/package.json` đã có `bin`. Chạy `cd cli && npm link` tạo `clearmind.cmd/.ps1/*` shim trong `%APPDATA%\npm\`. Path resolve robust (4 candidates). |
| 17 | `clearmind` chỉ mở browser, không có menu kiểu 9router | `cli/menu.js` mới — arrow-key UI (↑/↓ + Enter + Esc thu nhỏ + Ctrl+C exit). Mặc định cho terminal TTY. `--tray` / `--no-menu` bỏ qua menu. Items: Mở Dashboard / Khôi phục / Autostart / Restart / Stop / Thu nhỏ. |
| 18 | Rotation kéo current rỗng vào slot[0] → mất slot tốt sau vài edit | `writeTasks`: skip rotation khi `currentCount === 0 && anySlotHasData`. Cũng auto-snapshot vào `backups/` mỗi khi PUT giảm task count → mất data luôn có cứu. |
| 19 | F5 sau edit → đôi khi UI revert về cũ vài giây rồi mới đúng (race với PUT) | SSE `/api/events` + inline payload mtime + PUT keepalive + debounce 80ms. Server push mọi thay đổi real-time, snapshot bù ngay khi tab connect. |
| 20 | Trang Tasks list flat 19+ task gồm cả buổi học lặp → noise | View tabs: `Việc cần làm` (ẩn recurring academic) / `Lịch học` (gộp theo môn, mỗi card "PRN222 · 6 buổi" expandable) / `Tất cả`. Strip "Hôm nay X buổi" pill ở đầu tab default. |
| 21 | Command palette + tasks page còn label tiếng Anh ("New task", "All Tasks"...) | Dịch hết sang VN nhất quán. Map task type → "Học tập/Cá nhân/Công việc/Khác" trong palette hint. ActiveIdx chỉ reset khi query empty↔non-empty (hết flicker). |
| 22 | Autostart VBS chạy lúc boot nhưng Clearmind không lên — sau reboot Windows recycle PID cũ trong `clearmind.lock` cho process khác (CrossDeviceService.exe), `acquire()` chỉ `isPidAlive` → tưởng instance đang chạy → exit silent | `single-instance.js: acquire()` thành **async**, sau `isPidAlive` thêm bước `probeHealth(existingPort)` (timeout 800ms). PID alive nhưng probe fail = lock stale → overwrite. `cli.js: runForeground` `await` cả 2 lần gọi acquire. `checkExisting` không đổi (đã có probe sẵn). `menu.js` không đổi (đường này không tự lock). |
| 23 | Import lịch tuần này trùng sang tuần trước — dedup per-occurrence (`slot+date`) làm recurring weekly task tuần sau bị mark "new" → tạo duplicate | Đổi sang per-slot dedup `(subject_code+dow+time)` cho weekly. recurrenceEndAt đã qua → treat expired, tạo mới (HK mới). Thêm `parseEventList` cho one-off events (WC fixture, GG Calendar). |
| 24 | Test toast không hiện logo 256 + 3 button mới dù đã rewrite ToastGeneric XML | (a) `fireTest()` build fake task không có id → CM_TASK_ID='' → toast.ps1 if(taskId) skip <actions>. Fix: pass `id='__clearmind_test__'` sentinel; server endpoint /api/notification-action no-op cho sentinel. (b) AppUserModelID 'Clearmind' chưa register với Windows → fallback Explorer notifier mất features. Fix: `registerAumId()` write HKCU\Software\Classes\AppUserModelId\Clearmind với DisplayName + IconUri + IconBackgroundColor. |
| 25 | Sau restart CLI → browser load bản UI cũ (thiếu accent picker etc.), phải F5 mới đúng | Service Worker `public/sw.js` cache `/index.html` cache-first → stale shell sau rebuild dist/. Localhost app không cần SW. Fix: sw.js thành self-destruct (claim+clear+unregister+reload tabs). main.tsx bỏ register + cleanup block. HTML Cache-Control no-store. |
| 26 | Bật EN nhưng Calendar vẫn VN ("tháng 6 năm 2026", "Thứ 2 Thứ 3", "07 giờ") | FullCalendar có locale system riêng, không qua useT(). Hardcode `locale="vi"`. Fix: import `enGbLocale` + `viLocale`, pass `locales={[...]} + locale={fcLocale}` với fcLocale theo `useI18n().lang`. Cả 2 FC instance + key thêm fcLocale → force re-mount. |
| 27 | Date.toLocaleDateString(undefined, ...) đọc navigator.language (OS) không phải app lang → date format VN dù app EN | Add `useLocaleTag()` hook ở i18n.tsx trả về "en-US"/"vi-VN" theo app lang. Replace tất cả `undefined` locale arg ở calendar-view, mini-calendar, date-time-picker, review, settings. |
| 28 | Mic voice-mic effect deps={[t]} re-create SpeechRecognition mỗi parent render → audio drop mid-utterance | I18nProvider memoize: `t = useMemo(...)` per [lang], `setLang = useCallback`, `value = useMemo`. Cascade fix: Theme/Accent/Tasks/Toast/Commands providers cùng pattern. Voice-mic effect deps stabilize tự động. |
| 29 | Focus Skip credits full duration: bấm skip sau 3s vẫn log 25 phút | `handleComplete` tính `elapsedSec = min(planned, max(plannedSec - remaining, Date.now() - startedAtRef))`. Chỉ log session khi `elapsedSec >= 60`. skip() gọi `handleComplete(true)` → suppress alarm sound. |
| 30 | Focus tick interval capture stale handleComplete: edit settings/mode mid-run → fire dùng snapshot cũ | `handleCompleteRef` mirror handleComplete mỗi render. Tick gọi `handleCompleteRef.current()` thay vì closure. Setstate updater giữ pure (`r => r-1`), detect boundary OUTSIDE updater → fix React 19 strict-mode double-fire. |
| 31 | SSE mtime=0 snapshot có thể overwrite in-memory edits silently | applyServer thêm guard `if (mtime===0 && lastMtimeRef.current > 0) return` — sau khi đã sync 1 lần, mtime=0 là stale/buggy server bug, không apply. + wrap JSON.parse SSE handlers trong try/catch. |
| 32 | Web Speech ngắt nghỉ từng quãng cắt session mid-sentence | Bỏ `onspeechend` auto-stop. Thêm `wantsListenRef` intent flag. `onend` auto-restart nếu user vẫn want listen → Chrome 60s cap không cắt. `onerror "no-speech"/"audio-capture"` ignore khi vẫn listening. |
| 33 | Voice mic + variant picker height mismatch (picker thấp hơn mic) — qua 3 commit vẫn lệch | Architecture problem: per-sibling height sync luôn có gap (border-r-0 vs border-l, twmerge collisions size-8/w-auto). Fix triệt để: single parent `<div h-9 items-stretch border>` + 2 raw button children + 1px divider span. Parent owns dimensions, items-stretch → children fill parent height EXACTLY. Pixel-perfect parity by architecture. |
| 34 | safeJoin path traversal: `target.startsWith(root)` accept `C:\dist-evil` khi root=`C:\dist` | Replace với `path.relative` + reject if result starts với `..` hoặc absolute. |
| 35 | PowerShell toast spawn no timeout → AV scan / WinRT hang → orphan child processes accumulate | Add 15s setTimeout(proc.kill()) guard; clearTimeout trên close/error. |
| 36 | SSE heartbeat interval chỉ clear trên req.close → half-open TCP socket leak | Cleanup also on res.close/error. TCP keepalive 30s. Pre-check writableEnded/destroyed trước mỗi write. |
| 37 | /api/migrate trust raw input, /api/tasks PUT sanitize → trust gap | sanitizeTasksArray ở /api/migrate cũng. Return dropped count. |
| 38 | storage.js tmp filename `tmp-<pid>` collide khi 2 PUT concurrent từ cùng Node process → corrupt mid-rename | Per-call random suffix: `tmp-<pid>-<base36 time>-<base36 random6>`. |

## Architectural decisions

1. **JSON file thay vì SQLite**: data Clearmind nhỏ (vài trăm KB max), schema khớp `ExportShape` sẵn có, backup = copy file, không cần native binary. 9router dùng SQLite vì data lớn hơn nhiều.

2. **PowerShell + WinRT thay vì node-notifier trên Windows**: node-notifier bundle SnoreToast (Go binary) — cmdline encoding mangle tiếng Việt. WinRT native UTF-16 + env vars = an toàn 100%.

3. **No-build CLI**: cli/ là Node thuần (CommonJS), không TS/bundler. Cài deps + chạy thẳng. Đỡ phức tạp build chain.

4. **Single-instance qua lockfile + port probe**: lockfile có PID + port. Mới start: read lock → if PID alive → ping `/api/health` → if 200 → existing instance, mở browser thôi. Tránh false positive khi PID bị recycle.

5. **Detached spawn cho tray mode**: `clearmind` mặc định spawn child `--tray --skip-update` rồi exit. Terminal user gõ trả về prompt ngay, không chiếm process. Tray icon sống ngầm.

6. **VBS thay vì registry cho autostart** (giống 9router): viết `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Clearmind.vbs` chạy `node cli.js --tray` trong hidden window. Không touch registry, dễ debug, user xoá file là xong.

7. **Storage adapter pattern**: SPA detect CLI mode qua `window.__CLEARMIND_CLI__`. Cùng bộ code chạy cả 2 mode (dev localStorage + CLI on-disk). Không cần fork code path.

## Commands cheat sheet

```bash
# Dev (browser localStorage, no CLI)
npm run dev                # vite ở localhost:5173

# CLI mode (on-disk + tray + autostart)
npm install                # SPA deps (1 lần)
npm run cli:install        # cli/ deps: systray2, node-notifier (1 lần)
npm run build              # build dist/
cd cli && npm link         # đăng ký clearmind global (1 lần)

clearmind                  # MENU (arrow-key, 9router style) — mặc định ở terminal TTY
clearmind --no-menu        # legacy: detach service + mở dashboard ngay
clearmind --tray           # nền + tray, không mở browser (cho VBS autostart)
clearmind --no-browser     # không tự mở browser
clearmind --no-tray        # debug: foreground server, không tray
clearmind --port 30000     # đổi port
clearmind --data-dir DIR   # đổi nơi lưu data
clearmind --help / --version

# Restart sau khi sửa cli/* — CLI process KHÔNG hot-reload
# 1) Right-click tray icon → Thoát   (hoặc)
taskkill /F /IM node.exe    # kill all node, bao gồm CLI
rm -f "%APPDATA%\Clearmind\clearmind.lock"   # nếu lockfile leak
clearmind                    # restart
```

## Gotchas / nhớ kỹ

- **CLI process không hot-reload**: mỗi lần sửa `cli/*.js` phải kill CLI + chạy lại. SPA thì rebuild dist là đủ (server đọc index.html fresh mỗi request).
- **Browser cache**: sau rebuild dist, browser có thể giữ JS cũ. `Ctrl+Shift+R` để hard refresh. HTML có `no-cache`, JS hash trong filename nên không cần busting tay.
- **localStorage theo origin**: `localhost:5173` (vite dev) ≠ `localhost:20129` (CLI) ≠ `localhost:4173` (preview). Mỗi port = vũ trụ data riêng. Cross-origin browser cấm đọc.
- **Tiếng Việt trong console**: server log in `?` thay vì dấu là do bash/cmd console codepage. Data thực tế disk + toast vẫn đúng UTF-8/UTF-16. Đừng nhầm log với data.
- **`Toast fired` log có nghĩa PowerShell exit 0** — không có nghĩa user thấy toast (có thể bị Focus Assist nuốt hoặc Action Center silent). Để debug: Win+A xem Action Center.
- **systray2 cần GUI session**: SSH/headless không chạy được tray. Bypass bằng `--no-tray`.
- **Bundle warnings về `[INEFFECTIVE_DYNAMIC_IMPORT]` đã xử lý**, không còn xuất hiện. Nếu thấy lại → kiểm tra có ai static import lại FullCalendar không.

## Open / known issues

- **Win11 toast attribution**: nếu user thấy toast hiện nhưng tên app là "PowerShell" thay vì "Clearmind", cần register Start menu shortcut với AppUserModelID. Hiện tại WinRT auto-fallback `Microsoft.Windows.Explorer`. Có thể cải tiến sau.
- **Multi-tab race**: 2 browser tab cùng mở localhost:20129, edit khác nhau → last-write-wins. Acceptable cho single-user; nếu cần lock thì thêm version field + optimistic concurrency.
- **ESLint `react-hooks/set-state-in-effect`**: 21 cảnh báo trong codebase (command-palette, task-dialog, date-time-picker, ...). Hầu hết là pattern sync prop→state hợp lệ. False positives của rule mới React 19. Không phải bug runtime, không fix.
- **No node-notifier UTF-8 fix**: trên Mac/Linux dùng node-notifier (terminal-notifier / notify-send xử tốt UTF-8). Chỉ Windows path mới phải dùng PowerShell.
- **Tray icon refresh**: nếu sửa `icon.js`, force regenerate qua `tray.js` (`ensureIcons({force: true})` ở module load). Bypass bằng cách xoá `cli/assets/icon.{png,ico}` tay nếu cần.

## Stack & versions

- Node ≥ 18 (test trên v24)
- React 19.2 + TypeScript 6 + Vite 8 + Rolldown
- Tailwind 4
- FullCalendar 6 (dayGrid + timeGrid + interaction)
- shadcn/ui + Radix
- systray2 ^2.1 (Go binary native tray)
- node-notifier ^10 (fallback only on Windows)
- Windows 11 / PowerShell 5+ (default trên Win10+)

## User context

- Tên git: DZ0Phong, Windows 11
- Tiếng Việt là ngôn ngữ chính
- Thích update concise, code clean, không over-engineer
- Để Claude tự verify + commit nhiều bước; trao đổi khi có quyết định kiến trúc lớn
