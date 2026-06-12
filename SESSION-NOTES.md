# Session Notes — 2026-06-12

Tóm tắt mọi thay đổi trong session sau commit `a09abff`. File tạm để
review trước khi xoá / merge vào NOTES.md.

## 1. Bugfix gốc — overdue/late visual

| Layer | Vấn đề | Fix |
|---|---|---|
| Topbar / dashboard / review | Đếm overdue bao gồm cả buổi học recurring đã quá hạn (semester cũ chưa xoá) → tab "Việc cần làm" không show làm user confused | Export `isRecurringClass()` lên `lib/utils.ts`, loại khỏi overdue count ở topbar/dashboard/review |
| Tasks page row | Task hôm nay với deadline đã qua giờ vẫn nằm "Today" bucket mà không có visual cue | Chip đỏ `TRỄ Xh` UPPERCASE (giống dashboard "Quá hạn") + ring destructive + time label destructive |
| Calendar day sidebar | Chỉ có "Sắp tới", không show task đã qua giờ trong ngày | `OverdueCard` mới với variant destructive, sort newest-overdue-first, label "trễ Xh Xp" |

## 2. Motion polish (Linear/Things 3 vibe)

CSS tokens + keyframes trong `index.css` — gated bằng `prefers-reduced-motion`:

- `cm-page-enter` — fade-up 6px khi đổi route (qua `RoutedShell` re-keyed)
- `cm-list-enter` — stagger 20ms/row, cap 12 → 240ms max
- `cm-check-pop` — scale 0.4 → 1.08 → 1 khi StatusCycler done
- `cm-late-pulse` — soft glow infinite cho chip "trễ" + topbar overdue badge
- `cm-collapse` — grid-rows trick cho smooth height (bucket headers, focus settings panel)
- `cm-press` — `active:scale-0.985` press feedback
- `cm-nav-rail` — sidebar active rail 3px slide-in

## 3. Focus page rewrite

Thêm:
- **3 presets**: Classic 25/5, Deep 50/10, Ultradian 90/15
- **Custom stepper**: focus / short / long / rounds — Tinh chỉnh panel collapsible
- **3 modes** (work/short/long-break) — mỗi mode 1 màu (indigo/emerald/sky)
- **Round dots**: visual cycle progress, dot hiện tại có ring + scale
- **Stats hôm nay**: tổng phút + số phiên từ `localStorage.clearmind_focus_sessions` (giữ 100)
- **Auto-advance toggle**: tự chạy phiên kế khi xong
- **Sound chime**: Web Audio API 2-note sine sweep, toggleable
- **Keyboard**: Space play/pause, R reset, S skip (skip input/textarea)
- **Visual**: ring `shadow-[0_0_60px_-10px_color]` glow khi running

## 4. Dialog UX fixes

| File | Fix |
|---|---|
| `ui/auto-textarea.tsx` (mới) | Textarea grow theo content, shrink khi xoá, `maxRows` optional (omit = no cap) |
| `task-dialog.tsx` | Restructure `<DialogContent>` thành **flex column** + body scroll + footer sticky → nút "Tạo task" KHÔNG còn bị cut |
| `homework-dialog.tsx` | Same restructure |
| `calendar-view.tsx` `EventDetailDialog` + `DayOverviewDialog` | Same — body scroll, action footer sticky |

Plus task-dialog:
- `userPickedType` + `userPickedPriority` flags — auto-classifier **không override** field user đã chọn
- Pill hiện state THẬT (`{t(type)} · {t(priority)}`) — không phải classifier raw guess

## 5. Error handling (chống white-screen)

4 lớp phòng vệ:

1. **`ErrorBoundary` per-route** (`RoutedShell`) — page lỗi → recovery UI tại page, sidebar/topbar vẫn còn; `resetKey={location.pathname}` auto-reset khi nav
2. **`ErrorBoundary` root** — phòng layout/provider crash
3. **Global handlers** (`installGlobalErrorHandlers` trong main.tsx) — bắt `window.error` + `unhandledrejection`
4. **`lazyWithRetry`** — chunk load fail reload 1 lần qua sessionStorage flag

Diagnostic:
- Tất cả lỗi log vào `localStorage.clearmind_error_log` (20 entries gần nhất)
- Settings → card "Nhật ký lỗi" với refresh/copy JSON/clear

Files mới: `lib/error-log.ts`, `components/error-boundary.tsx`

## 6. Theme + Language + Accent sync

| Component | Role |
|---|---|
| `ThemePicker` (Settings) | 3-way segmented: Sáng / Hệ thống / Tối |
| `LanguagePicker` (Settings) | 2-way: VI / EN |
| `AccentPicker` (Settings) | 6 màu — Indigo (mặc định) / Violet / Blue / Emerald / Rose / Orange |
| `ModeToggle` (Topbar) | **2-way** light↔dark only (system chỉ qua Settings). Dùng `MutationObserver` trên `<html>` để biết effective mode khi đang ở "system" |
| `ThemeProvider` | Subscribe `matchMedia("(prefers-color-scheme: dark)")` change khi theme === "system" — OS đổi runtime app cũng đổi theo |
| `AccentProvider` | Apply CSS var `--primary` + `--ring` lên `<html>` qua `style.setProperty`. Indigo (default) → remove style để fall-back về CSS gốc. Live-track theme class flip |

Persist: `localStorage.clearmind-theme`, `clearmind_lang`, `clearmind-accent`.

## 7. Voice mic rewrite

**Bug gốc**: `onText` truyền inline arrow → `useEffect` re-run mỗi render → engine khởi tạo lại liên tục → audio không capture.

Fix:
- Stash `onText` qua `useRef` — engine chỉ recreate khi `lang` đổi
- `continuous: true` + `interimResults: true` + auto-stop khi user dừng nói → bắt câu dài không cắt
- Lang auto sync với i18n: VI → `vi-VN`, EN → `en-US`
- Error tooltip rõ ràng: permission / no-speech / network / generic
- Unsupported state: mic disabled (trước hide khiến tưởng broken)
- Caller `task-dialog`: chỉ commit final transcript, trim, không stack interim

## 8. Tag management

Settings → card "Quản lý tag":
- List tag với count (`tagStats(tasks)`)
- 3 action hover: **Đổi tên** / **Gộp** / **Xoá**
  - Rename: prompt → update mọi task chứa tag → dedupe
  - Merge: prompt tag đích → swap mọi instance
  - Delete: confirm count → xoá khỏi mọi task (nếu task không còn tag → undefined)

## 9. Navigation + tab title

- Sidebar Logo "Clearmind · Your external brain" → `<NavLink to="/dashboard">` với hover bg + cm-press
- `useDocumentTitle()` hook trong `RoutedShell` — `document.title = "{Page} · Clearmind"` reactive theo lang
- Re-key `RoutedShell` bằng `location.pathname` → page-enter animation replay mỗi route

## 10. i18n sweep + UI cleanup

**Translate đầy đủ** (VI + EN, ~140 keys mới):
- Dashboard: greeting, stats, today/week/focus/inbox/recent cards, UpNextHero, AgendaRow, subline, timeAgo, insight
- Focus: title/subtitle, mode labels, toasts, stepper labels, sound on/off, task picker, all helper strings
- Settings: notifications, shortcuts, error log, tags, theme/language/accent cards
- Voice mic: tooltips + error messages
- Theme labels: Sáng / Tối / Hệ thống

**Dashboard cleanup**: hide zero-value stat tiles (streak/focus/today progress) → new user vào màn hình sạch.

## Còn pending (chưa xử lý do scope)

- Review page — VN hardcoded
- Guide page — VN hardcoded
- Import page — VN hardcoded
- Settings còn vài toast message chưa translate (export/import/auto-start)
- FullCalendar event styling cho overdue (sidebar đã đủ surface, FC chip chưa style riêng)
- Document title cho lazy-loaded routes có thể flicker "Clearmind" lúc Suspense fallback

## Files thêm mới

```
src/components/accent-picker.tsx
src/components/accent-provider.tsx
src/components/error-boundary.tsx
src/components/language-picker.tsx
src/components/theme-picker.tsx
src/components/ui/auto-textarea.tsx
src/lib/error-log.ts
src/lib/use-document-title.ts
```

## Files sửa lớn

```
src/index.css                   +124   (motion tokens, keyframes, reduced-motion guard)
src/lib/i18n.tsx               +284   (~140 keys cho dashboard/focus/settings/voice/theme/accent)
src/pages/focus.tsx            +700   (rewrite gần như toàn bộ)
src/pages/settings.tsx         +280   (theme/lang/accent pickers, tag manager, error log card)
src/pages/dashboard.tsx        ±180   (i18n sweep, zero-hide stats)
src/components/calendar-view.tsx +190 (OverdueCard, dialog restructure, SidePanelCard variant)
src/components/voice-mic.tsx   ±150   (rewrite + i18n)
src/components/task-dialog.tsx ±53    (AutoTextarea, dialog flex column, userPicked flags, pill fix)
src/App.tsx                    ±103   (ErrorBoundary wrap, RoutedShell, lazyWithRetry, AccentProvider)
```

## Build status

```
dist/assets/index-*.css     ~99 KB │ gzip:  15 KB
dist/assets/import-*.js     ~41 KB │ gzip:  14 KB
dist/assets/calendar-*.js  ~292 KB │ gzip:  83 KB
dist/assets/index-*.js     ~512 KB │ gzip: 153 KB
```

Bundle main +30KB gzipped so với baseline a09abff (acceptable cho lượng feature thêm).
