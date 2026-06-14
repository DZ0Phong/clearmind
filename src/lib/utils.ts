import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { TaskType, TaskPriority, Task } from "@/hooks/use-tasks";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Map legacy IANA aliases to their canonical names so the picker preview
 * and the option list agree. Windows browsers commonly resolve a device
 * to "Asia/Saigon" / "Asia/Calcutta" / "Europe/Kiev" — those are still
 * valid IANA links but they're deprecated forms of the modern names
 * ("Asia/Ho_Chi_Minh", "Asia/Kolkata", "Europe/Kyiv"). Normalising on
 * read keeps user-facing copy consistent regardless of which form the
 * device returns.
 *
 * Functionally identical zones — same UTC offset, same DST rules, same
 * everything — just a name swap.
 */
const TZ_ALIASES: Record<string, string> = {
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Calcutta": "Asia/Kolkata",
  "Europe/Kiev": "Europe/Kyiv",
  "Asia/Rangoon": "Asia/Yangon",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "US/Pacific": "America/Los_Angeles",
  "US/Eastern": "America/New_York",
  "US/Central": "America/Chicago",
  "US/Mountain": "America/Denver",
  "US/Hawaii": "Pacific/Honolulu",
};

export function canonicalTimeZone(tz: string): string {
  if (!tz) return tz;
  return TZ_ALIASES[tz] ?? tz;
}

/**
 * Extract calendar parts (year/month/day/hour/minute) of a Date in a
 * specific IANA timezone. When `tz` is empty/undefined the browser's
 * system tz is used (matches the historical `getHours/getMinutes/...`
 * behaviour). All callers below funnel through this so flipping the
 * picker in Settings (Múi giờ) cascades end-to-end.
 *
 * Uses `Intl.DateTimeFormat.formatToParts` — the only correct way to
 * extract calendar fields in an arbitrary tz from a JS Date object.
 */
export function tzDateParts(
  d: Date,
  tz?: string
): { year: string; month: string; day: string; hour: string; minute: string } {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = fmt.formatToParts(d);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "00";
    return {
      year: get("year"),
      // hourCycle h23 returns "00".."23". Intl returns "24" for midnight
      // on some engines — coerce to "00" so dayKey rolls cleanly.
      hour: get("hour") === "24" ? "00" : get("hour"),
      month: get("month"),
      day: get("day"),
      minute: get("minute"),
    };
  } catch {
    // tz invalid? Fall back to system tz via direct Date methods.
    const pad = (n: number) => n.toString().padStart(2, "0");
    return {
      year: d.getFullYear().toString(),
      month: pad(d.getMonth() + 1),
      day: pad(d.getDate()),
      hour: pad(d.getHours()),
      minute: pad(d.getMinutes()),
    };
  }
}

export const formatDeadline = (isoString?: string, tz?: string): string => {
  if (!isoString) return "";
  const now = new Date();
  const nowYearStr = tzDateParts(now, tz).year;
  if (!isoString.includes("T")) {
    // Date-only — no tz applies; preserve the literal YYYY-MM-DD slicing.
    const [yearStr, month, day] = isoString.split("-");
    const ySuffix =
      yearStr && yearStr !== nowYearStr
        ? `/${yearStr.slice(-2)}`
        : "";
    return `${day}/${month}${ySuffix}`;
  }
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const p = tzDateParts(d, tz);
  const ySuffix = p.year !== nowYearStr ? `/${p.year.slice(-2)}` : "";
  return `${p.hour}:${p.minute} ${p.day}/${p.month}${ySuffix}`;
};

/* ----------------------------------------------------------------
   Date bucketing — Overdue / Today / This Week / Later / None
   ---------------------------------------------------------------- */

export type DateBucket = "overdue" | "today" | "this-week" | "later" | "none";

export const BUCKET_ORDER: DateBucket[] = [
  "overdue",
  "today",
  "this-week",
  "later",
  "none",
];

// (BUCKET_LABEL removed — consume t(`bucket.${name}`) via useT() instead.)

/** System-tz start-of-day. Kept for the NL deadline parser where the
 * user is typing in their own present-tense ("hôm nay", "ngày mai") and
 * the system tz is the right anchor. NOT used by the tz-aware bucketing
 * below — that one compares YYYY-MM-DD keys instead. */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Date-bucketing in a specified tz. Compares YYYY-MM-DD strings instead
 * of timestamp ranges — that's the only way to honor a chosen IANA tz
 * without "yesterday in UTC" leaking into "today" rendering.
 */
export function bucketByDate(
  deadline?: string,
  now: Date = new Date(),
  tz?: string
): DateBucket {
  if (!deadline) return "none";
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return "none";
  const todayKey = dayKey(now, tz);
  const targetKey = dayKey(target, tz);
  if (targetKey < todayKey) return "overdue";
  if (targetKey === todayKey) return "today";
  // "This-week" = today + next 6 days in the chosen tz.
  const sixDaysLater = new Date(now);
  sixDaysLater.setDate(sixDaysLater.getDate() + 6);
  const weekEndKey = dayKey(sixDaysLater, tz);
  if (targetKey <= weekEndKey) return "this-week";
  return "later";
}

export function groupByBucket(
  tasks: Task[],
  now: Date = new Date(),
  tz?: string
): Record<DateBucket, Task[]> {
  const out: Record<DateBucket, Task[]> = {
    overdue: [],
    today: [],
    "this-week": [],
    later: [],
    none: [],
  };
  for (const t of tasks) out[bucketByDate(t.deadline, now, tz)].push(t);
  for (const k of BUCKET_ORDER) {
    out[k].sort((a, b) => {
      const ad = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
      return ad - bd;
    });
  }
  return out;
}

/* ----------------------------------------------------------------
   Tiny helpers used across components — consolidated here to avoid
   the same one-liner being redefined in 7+ files.
   ---------------------------------------------------------------- */

/** Pad a number to 2 chars with leading zero. */
export const pad2 = (n: number) => n.toString().padStart(2, "0");

/** YYYY-MM-DD key in the given tz (or system tz when omitted). Used
 * heavily by calendar grids + bucketing — when the user picks a
 * different tz in Settings the daily boundaries shift everywhere. */
export function dayKey(d: Date, tz?: string): string {
  const p = tzDateParts(d, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Canonical subject code regex — single source of truth.
 *  Matches FPT-style codes (PRU213, EXE101g) plus 2-letter variants
 *  (AI201, CS201) so `extractSubjectCode` and `suggestTags` no longer
 *  disagree on the same input. Caller picks no-flag (single match) or
 *  the g-flag companion below for tag harvesting. */
export const SUBJECT_CODE_PATTERN = /\b([A-Z]{2,4}\d{2,4}[a-z]{0,3})\b/;
export const SUBJECT_CODE_PATTERN_G = new RegExp(SUBJECT_CODE_PATTERN.source, "g");

/** Pull the FPT-style subject code (e.g. "PRU213", "EXE101g") from a free-form
 *  title. Returns null if not found. Used by the importer, the homework
 *  dialog, and dedup logic — keep this the single source of truth. */
export function extractSubjectCode(title: string): string | null {
  const m = title.match(SUBJECT_CODE_PATTERN);
  return m ? m[1] : null;
}

/* ----------------------------------------------------------------
   Vietnamese natural-language deadline parser
   ----------------------------------------------------------------
   Accepts: "ngày mai 9h", "thứ 5 lúc 6h tối", "tối nay 8h", "30 phút nữa",
            "2 tiếng nữa", "tuần sau", "21/12", "21/12 lúc 14h30",
            "T5 tuần sau", "mai sáng", "chiều mai 3h", ...
   Returns ISO string (with time if known) or null.
   ---------------------------------------------------------------- */

const VI_DOW: Record<string, number> = {
  "chu nhat": 0,
  cn: 0,
  "thu hai": 1,
  "thu 2": 1,
  t2: 1,
  "thu ba": 2,
  "thu 3": 2,
  t3: 2,
  "thu tu": 3,
  "thu 4": 3,
  t4: 3,
  "thu nam": 4,
  "thu 5": 4,
  t5: 4,
  "thu sau": 5,
  "thu 6": 5,
  t6: 5,
  "thu bay": 6,
  "thu 7": 6,
  t7: 6,
};

// Strip Vietnamese diacritics for keyword matching. The character class
// targets Unicode combining marks U+0300..U+036F (the "Combining Diacritical
// Marks" block) — written as explicit codepoints because the inline literals
// rendered as an empty range in many editors.
function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function nextDow(base: Date, dow: number, allowSameDay: boolean): Date {
  const d = new Date(base);
  let diff = (dow - d.getDay() + 7) % 7;
  if (diff === 0 && !allowSameDay) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

interface ExtractedTime {
  h: number;
  m: number;
  raw: string;
}

function extractTime(text: string): ExtractedTime | null {
  // "9h", "9 giờ", "9h30", "14:30", "14h30", "9 giờ tối"
  const re =
    /(\d{1,2})\s*(?:h|g|gio|giờ|:)\s*(\d{1,2})?\s*(sang|trua|chieu|toi|dem)?/i;
  const m = text.match(re);
  if (!m) {
    // standalone tối/sáng/trưa/chiều → default time of day
    if (/\bsang\b/.test(text)) return { h: 8, m: 0, raw: "sáng" };
    if (/\btrua\b/.test(text)) return { h: 12, m: 0, raw: "trưa" };
    if (/\bchieu\b/.test(text)) return { h: 15, m: 0, raw: "chiều" };
    if (/\btoi\b/.test(text)) return { h: 20, m: 0, raw: "tối" };
    if (/\bdem\b/.test(text)) return { h: 22, m: 0, raw: "đêm" };
    return null;
  }
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const part = m[3];
  if (part === "toi" || part === "dem") {
    if (h < 12) h += 12;
  } else if (part === "chieu") {
    if (h < 12) h += 12;
  } else if (part === "trua") {
    if (h < 6) h += 12;
  } // sáng: keep as is
  if (h >= 24) h -= 24;
  return { h, m: min, raw: m[0] };
}

function extractRelativeOffset(text: string): Date | null {
  // "30 phút nữa", "2 tiếng nữa", "3 ngày nữa", "1 tuần nữa"
  const m = text.match(
    /(\d{1,3})\s*(phut|tieng|gio|ngay|tuan|thang)\s*(nua|sau|toi)?/i
  );
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const d = new Date();
  if (unit === "phut") d.setMinutes(d.getMinutes() + n);
  else if (unit === "tieng" || unit === "gio") d.setHours(d.getHours() + n);
  else if (unit === "ngay") d.setDate(d.getDate() + n);
  else if (unit === "tuan") d.setDate(d.getDate() + 7 * n);
  else if (unit === "thang") d.setMonth(d.getMonth() + n);
  return d;
}

function extractDate(text: string, now: Date): Date | null {
  // 1. "21/12" or "21/12/2026"
  const dm = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (dm) {
    const day = parseInt(dm[1], 10);
    const month = parseInt(dm[2], 10) - 1;
    const year = dm[3] ? parseInt(dm[3], 10) : now.getFullYear();
    const d = new Date(year, month, day);
    if (!dm[3] && d < startOfDay(now)) d.setFullYear(year + 1);
    return d;
  }

  const nextWeek = /\btuan (sau|toi)\b/.test(text);
  const thisWeek = /\btuan nay\b/.test(text);

  // 2. day-of-week
  for (const [key, dow] of Object.entries(VI_DOW)) {
    const re = new RegExp(`\\b${key.replace(/ /g, "\\s+")}\\b`);
    if (re.test(text)) {
      const base = nextWeek ? new Date(now.getTime() + 7 * 86_400_000) : now;
      return nextDow(base, dow, !nextWeek);
    }
  }

  // 3. relative day words
  if (/\bhom nay\b/.test(text) || /\btoi nay\b/.test(text) || /\bsang nay\b/.test(text) || /\btrua nay\b/.test(text) || /\bchieu nay\b/.test(text)) {
    return new Date(now);
  }
  if (/\bngay mai\b/.test(text) || /\bmai\b/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (/\bngay kia\b/.test(text) || /\bmot\b/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return d;
  }
  if (nextWeek) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (thisWeek) {
    // Friday of this week
    return nextDow(now, 5, true);
  }
  return null;
}

export function parseNlDeadline(input: string, now: Date = new Date()): string | null {
  if (!input || !input.trim()) return null;
  const text = stripDiacritics(input);

  const rel = extractRelativeOffset(text);
  if (rel) return rel.toISOString();

  const time = extractTime(text);
  const date = extractDate(text, now);
  if (!date && !time) return null;

  const merged = date ? new Date(date) : new Date(now);
  if (time) {
    merged.setHours(time.h, time.m, 0, 0);
  } else {
    merged.setHours(9, 0, 0, 0);
  }
  // If only time was given and it's already past → bump to tomorrow
  if (!date && time && merged < now) {
    merged.setDate(merged.getDate() + 1);
  }
  return merged.toISOString();
}

/* ----------------------------------------------------------------
   Stronger VN auto-classifier — type + priority from title
   ---------------------------------------------------------------- */

const TYPE_KEYWORDS: Record<TaskType, string[]> = {
  academic: [
    "hoc",
    "bai tap",
    "bai kiem tra",
    "kiem tra",
    "de thi",
    "thi",
    "deadline",
    "luan van",
    "luan",
    "do an",
    "mon ",
    "lop",
    "thay",
    "co ",
    "on tap",
    "on thi",
    "tieu luan",
    "assignment",
    "homework",
    "exam",
    "lecture",
    "lab",
  ],
  personal: [
    "mua",
    "gui",
    "sua",
    "gap ",
    "an ",
    "an com",
    "sinh nhat",
    "dam ",
    "le ",
    "du lich",
    "don dep",
    "tap the duc",
    "gym",
    "yoga",
    "bac si",
    "kham",
    "thuoc",
    "nau",
    "giat",
    "uong",
  ],
  work: [
    "hop",
    "meeting",
    "deploy",
    "release",
    "gui mail",
    "email",
    "bao cao",
    "report",
    "du an",
    "client",
    "khach hang",
    "okr",
    "sprint",
    "review",
    "pr ",
    "ticket",
    "stand-up",
    "standup",
    "1-on-1",
    "1on1",
  ],
  other: [],
};

const HIGH_PRIORITY_KEYWORDS = [
  "gap",
  "khan",
  "urgent",
  "asap",
  "ngay lap tuc",
  "lien",
  "quan trong",
  "important",
  "critical",
  "blocker",
];
const LOW_PRIORITY_KEYWORDS = [
  "khi nao ranh",
  "luc ranh",
  "som hay muon",
  "tuy",
  "noneed",
  "nice to have",
];

export interface Classification {
  type: TaskType;
  priority: TaskPriority;
}

// Enum labels live in src/lib/i18n.tsx now — consume via t(`type.${task.type}`),
// t(`priority.${priority}`), t(`status.${status}`). The static maps that used
// to live here were a sync bug: they shipped Vietnamese strings regardless of
// the user's selected language.

/**
 * Auto-suggest tags từ title + description khi user tạo task mới.
 * Phát hiện 3 pattern phổ biến nhất của sinh viên:
 *   1. Mã môn học (PRN222, MLN111, EXE101g) → tag chính mã môn lowercase
 *   2. "bài tập" / homework / btvn / asm → tag "bai-tap"
 *   3. "thi" / "kiểm tra" / "exam" / "midterm" / "final" → tag "thi"
 * Existing tags được preserve; chỉ thêm tag mới, không bao giờ xoá tag user.
 */
const BAITAP_RE = /\b(bai tap|homework|assignment|btvn|asm)\b/;
const THI_RE = /\b(thi|kiem tra|de thi|exam|test|midterm|final|quiz)\b/;

export function suggestTags(input: string, existing: string[] = []): string[] {
  const text = " " + stripDiacritics(input).toLowerCase() + " ";
  const out = new Set(existing.map((t) => t.toLowerCase()));
  // Subject codes — giữ chữ in để dễ đọc nhưng lowercase trong tag store.
  // Use the canonical g-flag pattern so suggestTags and extractSubjectCode
  // never disagree on whether something is a code.
  const codes = input.match(SUBJECT_CODE_PATTERN_G);
  if (codes) for (const c of codes) out.add(c.toLowerCase());
  if (BAITAP_RE.test(text)) out.add("bai-tap");
  if (THI_RE.test(text)) out.add("thi");
  return Array.from(out);
}

export function classifyTitle(input: string): Classification {
  const text = " " + stripDiacritics(input) + " ";
  const best = (Object.keys(TYPE_KEYWORDS) as TaskType[]).reduce<{
    type: TaskType;
    score: number;
  }>(
    (acc, tp) => {
      let score = 0;
      for (const kw of TYPE_KEYWORDS[tp]) if (text.includes(kw)) score++;
      return score > acc.score ? { type: tp, score } : acc;
    },
    { type: "other", score: 0 }
  );

  let priority: TaskPriority = "medium";
  if (HIGH_PRIORITY_KEYWORDS.some((kw) => text.includes(kw))) priority = "high";
  else if (LOW_PRIORITY_KEYWORDS.some((kw) => text.includes(kw))) priority = "low";
  else if (best.type === "academic") priority = "high";

  return { type: best.type, priority };
}

/* ----------------------------------------------------------------
   "isToday" helper for dashboard
   ---------------------------------------------------------------- */
export function isToday(
  deadline?: string,
  now: Date = new Date(),
  tz?: string
): boolean {
  if (!deadline) return false;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return false;
  return dayKey(d, tz) === dayKey(now, tz);
}

export function isPast(deadline?: string, now: Date = new Date()): boolean {
  if (!deadline) return false;
  return new Date(deadline) < now;
}

// Recurring academic class meeting — buổi lên lớp, không phải "việc cần làm".
// Bài tập / bài thi có tag override vẫn ra ngoài để báo deadline bình thường.
const RECURRING_CLASS_OVERRIDE_TAGS = new Set([
  "bai-tap",
  "bai_tap",
  "thi",
  "thi-fe",
  "homework",
  "exam",
]);
// Tags the importer attaches to school-timetable rows. Any of these
// identifies a "class meeting" — a regular lecture/lab session that the
// user shouldn't see in the overdue badge once it's past, and that lives
// in the Schedule tab instead of the personal To-do tab.
const CLASS_MEETING_TAGS = new Set(["lich-hoc"]);

/**
 * Detect a class-meeting task — used to split the Tasks page into
 * "Việc cần làm" vs "Lịch học", to exclude class slots from the overdue
 * badge (they're not a deadline you missed, they're the timetable), and
 * to drive the homework dialog's "next session" finder.
 *
 * Pre-2026-06-13 this checked `t.recurrence === "weekly"`. After the
 * switch to one-off-per-week imports every class has `recurrence: null`,
 * which made the check return `false` for everything — Schedule tab
 * went empty, topbar over-counted overdues, today's-classes strip
 * disappeared. Now we identify class meetings by the importer's
 * `#lich-hoc` tag instead, which survives the recurrence flattening.
 *
 * Override tags (#bai-tap / #thi / #thi-fe / #homework / #exam) demote
 * a row back to "personal task" — they describe work that came FROM a
 * class but needs the user's attention as a deadline.
 */
export function isRecurringClass(t: Task): boolean {
  if (t.type !== "academic") return false;
  const tags = (t.tags || []).map((x) => x.toLowerCase());
  if (tags.some((tag) => RECURRING_CLASS_OVERRIDE_TAGS.has(tag))) return false;
  if (tags.some((tag) => CLASS_MEETING_TAGS.has(tag))) return true;
  // Legacy fallback: pre-migration tasks still carry recurrence === "weekly"
  // and may not have a #lich-hoc tag. Keep them classified as classes so
  // existing backups continue to read correctly until the user re-imports.
  return t.recurrence === "weekly";
}

/** "30p" / "5h" / "2d" — short relative-past suffix, null if not past.
 *
 * The duration itself is timestamp-arithmetic and tz-agnostic, but we
 * accept a `tz` parameter anyway (currently unused inside the body) so
 * the React `useDateFns()` hook can pre-bind it alongside everything
 * else — every consumer of this helper passes a value that flips with
 * the user's tz choice, and accepting tz here lets the hook return a
 * single stable shape rather than special-casing one duration function. */
export function formatTimeAgoShort(
  deadline: string,
  now: Date = new Date(),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _tz?: string
): string | null {
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = now.getTime() - d.getTime();
  if (diffMs <= 0) return null;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}p`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Extract HH:mm from a deadline ISO string in the given tz; null if
 * it's date-only. */
export function extractTimeLabel(deadline?: string, tz?: string): string | null {
  if (!deadline || !deadline.includes("T")) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const p = tzDateParts(d, tz);
  return `${p.hour}:${p.minute}`;
}

/** Sort tasks ascending by deadline time-of-day; tasks without time go last. */
export function sortByTimeOfDay<T extends { deadline?: string }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const at = a.deadline && a.deadline.includes("T") ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
    const bt = b.deadline && b.deadline.includes("T") ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
    return at - bt;
  });
}

/* ----------------------------------------------------------------
   Subject color hash — stable color per subject across the app.
   Used to visually differentiate academic subjects (Toán vs Lý vs ...)
   ---------------------------------------------------------------- */

const COLOR_PALETTE = [
  { bg: "bg-indigo-500/15", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-500/30", dot: "bg-indigo-500", raw: "#6366f1" },
  { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30", dot: "bg-emerald-500", raw: "#10b981" },
  { bg: "bg-orange-500/15", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/30", dot: "bg-orange-500", raw: "#f97316" },
  { bg: "bg-rose-500/15", text: "text-rose-600 dark:text-rose-400", border: "border-rose-500/30", dot: "bg-rose-500", raw: "#f43f5e" },
  { bg: "bg-cyan-500/15", text: "text-cyan-600 dark:text-cyan-400", border: "border-cyan-500/30", dot: "bg-cyan-500", raw: "#06b6d4" },
  { bg: "bg-violet-500/15", text: "text-violet-600 dark:text-violet-400", border: "border-violet-500/30", dot: "bg-violet-500", raw: "#8b5cf6" },
  { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30", dot: "bg-amber-500", raw: "#f59e0b" },
  { bg: "bg-teal-500/15", text: "text-teal-600 dark:text-teal-400", border: "border-teal-500/30", dot: "bg-teal-500", raw: "#14b8a6" },
] as const;

export type SubjectColor = (typeof COLOR_PALETTE)[number];

// Memo cache. Called in every TaskRow / AgendaItem / DayTaskRow / calendar
// chip render — with 200+ tasks in a calendar week view, that's 200+ string
// hashes per render. Cache by input-string-derived key. Cap at 256 to bound
// memory; clear oldest on overflow (FIFO via insertion order).
const SUBJECT_COLOR_CACHE = new Map<string, SubjectColor>();

export function subjectColor(input: string): SubjectColor {
  // Hash first 3 words — typical "subject prefix" (e.g. "Giải tích 2" → "giải tích 2")
  const key = (input || "").toLowerCase().split(/\s+/).slice(0, 3).join(" ");
  const cached = SUBJECT_COLOR_CACHE.get(key);
  if (cached) return cached;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  const color = COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
  if (SUBJECT_COLOR_CACHE.size >= 256) {
    const firstKey = SUBJECT_COLOR_CACHE.keys().next().value;
    if (firstKey !== undefined) SUBJECT_COLOR_CACHE.delete(firstKey);
  }
  SUBJECT_COLOR_CACHE.set(key, color);
  return color;
}

/* ----------------------------------------------------------------
   Tag stats — aggregate tag usage across all tasks. Used by the
   tag filter chips, sidebar tag cloud, and TagInput autocomplete.
   ---------------------------------------------------------------- */

export interface TagStat {
  name: string;
  count: number;
  /** Count of *undone* tasks bearing this tag — for "open work" hints. */
  openCount: number;
}

export function tagStats(tasks: Task[]): TagStat[] {
  const map = new Map<string, { count: number; openCount: number }>();
  for (const t of tasks) {
    if (!t.tags?.length) continue;
    for (const raw of t.tags) {
      const tag = raw.trim().toLowerCase();
      if (!tag) continue;
      const prev = map.get(tag) ?? { count: 0, openCount: 0 };
      prev.count++;
      if (t.status !== "done") prev.openCount++;
      map.set(tag, prev);
    }
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
