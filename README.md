# Clearmind

Bộ não phụ cho sinh viên — quản lý lịch học, deadline, lịch thi, bài tập, và phiên focus. Local-first (lưu hết vào `localStorage`), không tài khoản, không server.

## Tính năng chính

**Calendar — 4 view linh hoạt**
- **Tháng**: lưới truyền thống, event chip màu theo loại (🎓 Học / 💼 Việc / ✨ Cá nhân / 📌 Khác) + emoji prefix, môn học khác hue
- **Tuần**: time-grid 06:00–22:00 với event card adaptive theo độ dài (30 phút → 1 dòng, 60+ → title 2 dòng, 90+ → location)
- **Ngày**: split layout — timeline trái + **side panel** thông tin phải:
  - Hero card với progress bar `X/Y xong · N gấp`
  - "Sắp tới" với countdown động cập nhật mỗi phút
  - Danh sách task "chưa định giờ" — click để gán giờ
  - **Khung giờ rảnh tự tính** (gap ≥ 30 phút giữa các event, bỏ giờ đã qua) — click để tạo task vào khung đó
- **Agenda**: timeline dọc 14 ngày, mỗi event 1 thẻ đầy đủ — UX dễ đọc nhất khi nhiều việc

**Task management**
- 5 trường: title, mô tả, loại, ưu tiên, location, tags, deadline (date hoặc datetime), recurrence, notify
- Quick Capture với **NL parser tiếng Việt**: "thi Toán thứ 5 lúc 14h phòng A1.404" → tự đoán loại + giờ + tag
- Auto-classifier theo từ khoá (hoc/thi/họp/gym/...) → gợi ý type + priority
- Voice input (Web Speech API) cho title
- Tag system: autocomplete từ tag đã dùng, top tags ở sidebar, filter `?tag=` URL-driven, click bất cứ tag nào để lọc

**Focus & Review**
- Pomodoro 25/5, chọn 1 task, mỗi phiên cộng phút focus vào task
- Weekly Review: streak ngày liên tiếp, focus minutes, phân bố done theo loại, danh sách overdue

**Import lịch học**
- Paste lịch dạng text từ website trường
- Bookmarklet inject một cú vào trang lịch của trường
- ICS file (`.ics`)
- Hỗ trợ recurrence (hàng tuần) + end-date (cuối học kỳ)

**Header thông minh**
- Date + time pill tick mỗi phút
- Search bar mở Command Palette (`⌘K` / `Ctrl+K`)
- Badge "N quá hạn" đỏ chỉ hiện khi cần
- Quick Capture button luôn trong tầm tay

**Khác**
- Dark/light theme (system-aware)
- Local notifications cho deadline (5m / 15m / 1h / 1d trước)
- Recurrence: daily / weekday / weekly / monthly với end-date
- Roll-forward & dedupe cho task lặp đã quá hạn
- Subtask "bài tập" gắn với task academic

## Tech stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind v4** + **shadcn/ui**
- **FullCalendar 6** (dayGrid + timeGrid + interaction)
- **React Router 7**
- **Lucide React** icons
- **linkedom** cho HTML parsing (bookmarklet / paste)

## Chạy local

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # TS check + vite build → dist/
npm run lint     # eslint
```

## Chạy ngầm trên máy (Windows) — CLI mode

Đây là mode chạy như một dịch vụ ngầm: tray icon ở khay hệ thống (cạnh đồng hồ), data lưu ra ổ cứng (`%APPDATA%/Clearmind/clearmind.json`) thay vì `localStorage`. Cảm hứng cấu trúc lấy từ [decolua/9router](https://github.com/decolua/9router).

```bash
npm install              # cài deps SPA
npm run build            # build dist/
npm run cli:install      # cài systray2 + node-notifier trong cli/
npm run cli              # → mở dashboard + dựng tray
```

**Đăng ký `clearmind` thành lệnh toàn cục** (giống cách 9router làm — gõ `9router` ở bất cứ terminal nào):

```bash
cd cli
npm link                 # tạo shim clearmind.cmd trong %APPDATA%/npm
# từ giờ ở bất kỳ thư mục nào:
clearmind                # mở dashboard
clearmind --tray         # chạy nền
clearmind --help
```

`npm link` tạo symlink (không copy), nên mỗi lần `npm run build` tạo `dist/` mới, lệnh `clearmind` tự pick up. Để gỡ: `cd cli && npm unlink -g`.

Tray menu:
- **Mở Dashboard** — `http://localhost:20129/dashboard`
- **Thêm nhanh** — bật Quick Capture dialog ngay
- **Bắt đầu phiên Focus** — vào trang focus, timer chạy luôn
- **Khởi động cùng Windows** — toggle (ghi `Clearmind.vbs` vào Startup folder, hidden window)
- **Mở thư mục dữ liệu** — Explorer mở `%APPDATA%/Clearmind/`
- **Tạo backup ngay** — snapshot `backups/YYYY-MM-DD-HH-mm-ss.json` (giữ 14 bản gần nhất)
- **Thoát**

Khi chạy CLI:
- **Native OS notifications** — toast Windows bay lên cả khi browser đã đóng. Server schedule lại trên mỗi `PUT /api/tasks`, dùng `node-notifier` + SnoreToast.
- **Auto-backup mỗi 24h** — server tự snapshot vào `backups/` (giữ rolling 14 bản); nếu lần backup gần nhất > 12h trước, snapshot ngay khi start.
- **Safety net `previous.json`** — mỗi PUT lưu bản cũ làm previous; bấm **Khôi phục bản trước** trong Settings để rollback (swap được — bấm lần nữa là undo).

Một số args:
- `--no-tray` — chỉ server, không tray (debug)
- `--no-browser` — không tự mở browser
- `--port N` — đổi port (mặc định 20129; tự nhảy lên 20130, 20131… nếu bận)
- `--data-dir DIR` — đổi nơi lưu data
- `--tray` — bypass detach + foreground server (mode dùng cho autostart .vbs)

Lần đầu mở CLI mode, nếu trong `localStorage` đã có task → tự migrate lên on-disk, sau đó xoá khỏi browser. Bật lại `npm run dev` (vite 5173) thì lại quay về localStorage — 2 chế độ độc lập nhau.

Data path mặc định:
- Windows: `%APPDATA%\Clearmind\`
- macOS: `~/Library/Application Support/Clearmind/`
- Linux: `~/.config/clearmind/`

## Cấu trúc

```
cli/                       # Node CLI host (optional — for "chạy ngầm" mode)
├── cli.js                 # entry: arg parse + detached spawn + single-instance probe
├── server.js              # http: GET/PUT /api/tasks, /api/health, /api/backup, /api/recover, /api/autostart
├── storage.js             # atomic JSON write + previous.json safety net + rotating backups
├── notifications.js       # native OS toasts via node-notifier, re-scheduled on every PUT
├── tray.js                # systray2 menu (Open / Capture / Focus / Autostart / Backup / Quit)
├── autostart.js           # ghi VBS vào Startup folder (Win) / plist (Mac) / .desktop (Linux)
├── single-instance.js     # lockfile %APPDATA%/Clearmind/clearmind.lock + PID liveness probe
├── icon.js                # sinh icon.png + icon.ico tự động bằng zlib (16x16 indigo)
├── open-browser.js        # start / open / xdg-open + Explorer
└── package.json           # bin: clearmind → cli.js (deps: systray2 + node-notifier)

src/
├── pages/                 # 1 file / route
│   ├── dashboard.tsx      # hero + agenda + week strip + focus snapshot
│   ├── calendar.tsx       # wrapper cho CalendarView
│   ├── tasks.tsx          # bucketed list (Overdue/Today/This-week/Later/None) + tag filter
│   ├── focus.tsx          # pomodoro timer
│   ├── review.tsx         # weekly stats
│   ├── settings.tsx       # import/export, notification
│   ├── guide.tsx          # in-app help
│   └── import.tsx         # 3 cách import lịch học
├── components/
│   ├── calendar-view.tsx  # 4 view (month/week/day/agenda) + day side panel
│   ├── task-dialog.tsx    # create + edit task
│   ├── command-palette.tsx # ⌘K
│   ├── tag-input.tsx      # autocomplete từ tag đã dùng
│   ├── homework-dialog.tsx # subtask cho task academic
│   ├── quick-capture.tsx  # = TaskDialog kind=create
│   ├── voice-mic.tsx      # Web Speech API
│   ├── date-time-picker.tsx
│   ├── mini-calendar.tsx  # sidebar dot calendar
│   ├── layout/            # MainLayout + Sidebar + TopBar
│   └── ui/                # button, card, dialog, input (shadcn)
├── hooks/
│   └── use-tasks.tsx      # context + reducer + localStorage + reminders
└── lib/
    ├── utils.ts           # bucketByDate, subjectColor, tagStats, NL parser, auto-classifier
    ├── schedule-parser.ts # text/ICS/HTML → ParsedClass[]
    ├── ics.ts             # ICS exporter
    ├── cli-bridge.ts      # detect window.__CLEARMIND_CLI__ + REST helpers
    └── bookmarklet.ts
```

## Notable design decisions

- **Local-first**: tất cả state nằm trong `localStorage` (`clearmind_tasks`). Không backend, không sync. Settings page có export/import JSON để backup.
- **Subject colors hash**: tên môn (3 từ đầu) hash → 1 trong 8 màu palette. Cùng môn = cùng màu trên toàn app. Non-academic dùng màu fixed theo type.
- **Event color phân cấp**: trong calendar, academic = subject hash (Toán xanh, Lý cam, ...), còn lại = fixed type color. Vừa scan nhanh theo loại, vừa phân biệt môn trong cùng loại Học.
- **Day view tier system**: event card render theo độ dài event để tránh tràn nội dung (≤ 30 phút = 1 dòng compact, 31-75 = title 2 dòng + location/tags, ≥ 76 phút = + description).
- **Free-slots heuristic**: quét timed events trong ngày (default 1h mỗi event nếu thiếu end), tìm gap ≥ 30 phút trong khung 08:00–21:00, suggest top 4. Hôm nay bỏ giờ đã qua.
- **Recurrence policy**: complete một task lặp → spawn instance kế tiếp (nếu chưa qua `recurrenceEndAt` và chưa tồn tại — tránh nhân đôi khi user import lịch tuần sau). Roll-forward gom toàn bộ task lặp overdue về buổi kế tiếp.
- **Tag aggregation**: pure function `tagStats(tasks)` trả `{ name, count, openCount }`. Dùng chung bởi sidebar tag cloud, tasks page filter, calendar tag chip, TagInput autocomplete.
