import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { TaskType, TaskPriority, Task } from "@/hooks/use-tasks";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatDeadline = (isoString?: string) => {
  if (!isoString) return "";
  const currentYear = new Date().getFullYear();
  if (!isoString.includes("T")) {
    const [yearStr, month, day] = isoString.split("-");
    const y = parseInt(yearStr, 10);
    const ySuffix = y && y !== currentYear ? `/${(y % 100).toString().padStart(2, "0")}` : "";
    return `${day}/${month}${ySuffix}`;
  }
  const dateObj = new Date(isoString);
  const hours = dateObj.getHours().toString().padStart(2, "0");
  const minutes = dateObj.getMinutes().toString().padStart(2, "0");
  const day = dateObj.getDate().toString().padStart(2, "0");
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const y = dateObj.getFullYear();
  const ySuffix = y !== currentYear ? `/${(y % 100).toString().padStart(2, "0")}` : "";
  return `${hours}:${minutes} ${day}/${month}${ySuffix}`;
};

/* ----------------------------------------------------------------
   Date bucketing — Overdue / Today / This Week / Later / None
   ---------------------------------------------------------------- */

export type DateBucket = "overdue" | "today" | "this-week" | "later" | "none";

const BUCKET_ORDER: DateBucket[] = [
  "overdue",
  "today",
  "this-week",
  "later",
  "none",
];

export const BUCKET_LABEL: Record<DateBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  "this-week": "This Week",
  later: "Later",
  none: "No deadline",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function bucketByDate(deadline?: string, now: Date = new Date()): DateBucket {
  if (!deadline) return "none";
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return "none";
  const today0 = startOfDay(now);
  const today1 = endOfDay(now);
  if (target < today0) return "overdue";
  if (target <= today1) return "today";
  const weekEnd = endOfDay(new Date(today0.getTime() + 6 * 86_400_000));
  if (target <= weekEnd) return "this-week";
  return "later";
}

export function groupByBucket(tasks: Task[]): Record<DateBucket, Task[]> {
  const out: Record<DateBucket, Task[]> = {
    overdue: [],
    today: [],
    "this-week": [],
    later: [],
    none: [],
  };
  for (const t of tasks) out[bucketByDate(t.deadline)].push(t);
  for (const k of BUCKET_ORDER) {
    out[k].sort((a, b) => {
      const ad = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
      return ad - bd;
    });
  }
  return out;
}

export { BUCKET_ORDER };

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
  "chu nhat ": 0,
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

// Strip Vietnamese diacritics for keyword matching
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
export function isToday(deadline?: string, now: Date = new Date()): boolean {
  if (!deadline) return false;
  const d = new Date(deadline);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function isPast(deadline?: string, now: Date = new Date()): boolean {
  if (!deadline) return false;
  return new Date(deadline) < now;
}

/** Extract HH:mm from a deadline ISO string, or null if it's date-only. */
export function extractTimeLabel(deadline?: string): string | null {
  if (!deadline || !deadline.includes("T")) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

export function subjectColor(input: string): SubjectColor {
  // Hash first 3 words — typical "subject prefix" (e.g. "Giải tích 2" → "giải tích 2")
  const key = (input || "").toLowerCase().split(/\s+/).slice(0, 3).join(" ");
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
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
