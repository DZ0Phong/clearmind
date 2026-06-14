import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTickingNow } from "@/hooks/use-ticking-now";
import { useIsMobile } from "@/hooks/use-media-query";
import { useSwipeNav } from "@/hooks/use-swipe-nav";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
// FullCalendar has its own locale system (day names, month titles, "hour"
// suffix, week range formatting). Without the locale prop it falls back to
// en-US-ish defaults; with locale="vi" we get Vietnamese formatting. Import
// both so we can swap by language toggle. en-gb is closer to "neutral
// English" than the implicit en-US default (Mon-start week, 24h time).
import enGbLocale from "@fullcalendar/core/locales/en-gb";
import viLocale from "@fullcalendar/core/locales/vi";
import {
  AlignLeft,
  BookOpen,
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock4,
  Coffee,
  Filter as FilterIcon,
  Flame,
  List,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HomeworkDialog } from "@/components/tasks/homework-dialog";
import { useTaskCommands } from "@/components/tasks/task-commands";
import { useTasks, type Task, type TaskType } from "@/hooks/use-tasks";
import {
  canonicalTimeZone,
  cn,
  dayKey,
  pad2,
  subjectColor,
  tagStats,
} from "@/lib/utils";
import {
  useT,
  useI18n,
  useLocaleTag,
  useTimeZone,
  useDateFns,
} from "@/lib/i18n";

/* ───── Types & constants ───────────────────────────────────────── */

interface CalendarViewProps {
  initialDate?: string;
}

type ViewMode = "month" | "week" | "day" | "agenda";

// Type-to-color map only. Labels resolve through i18n at render time
// (t("type.academic") etc.) so language toggle propagates everywhere.
// Academic uses subjectColor() so different subjects (Math/Physics/...)
// stand out from each other; other types use the fixed colors below.
const TYPE_COLOR: Record<TaskType, string> = {
  academic: "#6366f1",
  work: "#f97316",
  personal: "#10b981",
  other: "#64748b",
};

const VIEWS: ReadonlyArray<{
  key: ViewMode;
  /** i18n key — resolved with t() at render time. */
  labelKey: string;
  icon: typeof Calendar;
}> = [
  { key: "month", labelKey: "calendar.view.month", icon: Calendar },
  { key: "week", labelKey: "calendar.view.week", icon: CalendarRange },
  { key: "day", labelKey: "calendar.view.day", icon: CalendarDays },
  { key: "agenda", labelKey: "calendar.view.agenda", icon: List },
];

const FC_VIEW: Record<Exclude<ViewMode, "agenda">, string> = {
  month: "dayGridMonth",
  week: "timeGridWeek",
  day: "timeGridDay",
};

const VIEW_STORAGE_KEY = "clearmind_calendar_view";

/* ───── Pure helpers ────────────────────────────────────────────── */

// `pad` aliases the canonical `pad2` from @/lib/utils so the rest of this
// file's date-string construction stays terse. `dayKey` is intentionally
// NOT redeclared here — the canonical tz-aware `dayKey(d, tz)` from utils
// is imported above and called with the user's resolved tz inside the
// component (was a silent bug before: local dayKey ignored user tz, so
// switching tz left bucket boundaries on the system clock).
const pad = pad2;

// Academic events vary by subject; everything else uses its fixed type color.
// Done state is NOT folded in here — earlier we returned `var(--muted)` for
// done, but that gave the chip a background that mixed muted with the page
// background (≈ near-bg) AND set textColor to muted too → on light mode the
// label vanished into the chip, on dark mode the chip looked solid black
// with no readable text. Done styling now lives in `cm-done` CSS class
// (opacity + strikethrough) applied via FC's `classNames` so the chip
// keeps its real color, just dimmed.
function eventColor(task: Task): string {
  if (task.type === "academic") return subjectColor(task.title).raw;
  return TYPE_COLOR[task.type];
}

// Parse the trailing "Kết thúc: HH:MM" the importer appends to the task
// description so FullCalendar can render the event as a duration block
// instead of a 0-minute point in time-grid views. Returns "HH:MM" or null.
function extractEndTime(description?: string): string | null {
  if (!description) return null;
  const m = description.match(/K[ếe]t th[úu]c:\s*(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

// Default cap for recurring events without explicit recurrenceEndAt —
// six months ahead of today. Without a cap, FullCalendar will render
// every Monday from June 2026 to the heat death of the universe; the
// calendar view turns into a wall of "PRN222 15:20" forever.
function renderHorizonIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function loadStoredView(): ViewMode {
  if (typeof window === "undefined") return "week";
  const v = localStorage.getItem(VIEW_STORAGE_KEY);
  if (v === "month" || v === "week" || v === "day" || v === "agenda") return v;
  // First-time mobile users default to Agenda — Month and Week time-grids
  // are unreadable at 375px-wide (7 columns at ~50px each leaves no room
  // for event chip text) while Agenda is naturally vertical-flow and
  // works at any width. Desktop keeps "week" as the most info-dense view.
  if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches) {
    return "agenda";
  }
  return "week";
}

/* ───── FullCalendar callback arg shapes (minimal narrowing) ────── */

interface FcDateLikeArg {
  dateStr: string;
  view?: { type?: string };
}
interface FcSelectArg {
  start: Date;
  view?: { type?: string };
}
interface FcEventDropArg {
  event: { id: string; startStr: string };
}
interface FcEventClickArg {
  event: { id: string };
}
interface FcDropArg {
  draggedEl: HTMLElement;
  dateStr: string;
}
interface FcEventReceiveArg {
  revert: () => void;
}
interface FcDatesSetArg {
  startStr: string;
  start: Date;
  end: Date;
  view: { type: string; title: string };
}
interface FcMoreLinkArg {
  date: Date;
}

/* ───── Main component ──────────────────────────────────────────── */

export function CalendarView({ initialDate }: CalendarViewProps = {}) {
  const { tasks, updateTask, removeTask, snoozeTask } = useTasks();
  const { openEdit, openCreate } = useTaskCommands();
  const navigate = useNavigate();
  const t = useT();
  const localeTag = useLocaleTag();
  const { lang } = useI18n();
  // Mobile detection — drives FC config (column header format, title
  // format, max events per cell) and hides the Tuần/Week view button.
  // Time-grid week at 375px is unusable (7 cols × ~50px each, hour rows
  // pushed off-screen), so we steer the user toward Day / Agenda.
  const isMobile = useIsMobile();
  // FullCalendar locale: 'vi' for Vietnamese (day names, month titles,
  // "X giờ" hour suffix, "8 – 14 thg 6" range); 'en-gb' for neutral
  // English (Mon-start week, 24h time, "8 – 14 Jun" range).
  const fcLocale = lang === "en" ? "en-gb" : "vi";
  // FullCalendar tz selection. This is subtle: FC 6 only honours named
  // timezones ("Asia/Ho_Chi_Minh", "America/New_York", …) when the
  // optional `@fullcalendar/luxon3` plugin is installed. WITHOUT that
  // plugin (we don't ship it — adds ~30KB for an edge case) FC silently
  // treats every named tz as UTC, which makes timed events display
  // shifted by the local offset (a 14:00 Vietnam event lands at 07:00,
  // a 12:00 event at 05:00 → clipped below slotMinTime → invisible).
  //
  // Strategy:
  //   1. Canonicalise the chosen tz (Asia/Saigon → Asia/Ho_Chi_Minh)
  //      so the comparison below catches legacy aliases.
  //   2. If the canonicalised choice matches the browser's own tz, pass
  //      "local" — that branch FC handles natively and gives identical
  //      results. Covers the 99% case (user on the same machine that
  //      hosts the CLI; CLI mode = device mode behaviour-wise).
  //   3. If the choice differs (e.g. travelling laptop wants to see
  //      CLI-server time), still pass the named zone so the picker has
  //      *some* effect — accepting the UTC fallback is preferable to
  //      silently ignoring the user's pick.
  const rawTz = useTimeZone();
  const fcTimeZone = useMemo(() => {
    if (!rawTz) return "local";
    const canonical = canonicalTimeZone(rawTz);
    try {
      const browser = canonicalTimeZone(
        Intl.DateTimeFormat().resolvedOptions().timeZone || ""
      );
      if (canonical === browser) return "local";
    } catch {
      /* fall through to named-zone */
    }
    return canonical;
  }, [rawTz]);

  const [view, setView] = useState<ViewMode>(loadStoredView);
  const [hiddenTypes, setHiddenTypes] = useState<Set<TaskType>>(new Set());
  const [hideDone, setHideDone] = useState(false);
  // Sticky calendar chrome used to stack three rows of pills (type
  // chips + tag chips + Hide done) which the user reported as "too
  // many things". Collapse them all behind a single Filters button.
  // Default closed; active filter pills still show inline next to the
  // button so the user always sees WHAT is filtered without expanding.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Auto-redirect off Week view when shrinking to mobile — Tuần is hidden
  // from the switcher on mobile; if the user had it open on desktop and
  // resized down (or rotated portrait), bump them to Agenda so the view
  // doesn't break silently. Doesn't fight: only triggers WHEN crossing
  // into mobile; user can switch back on desktop.
  useEffect(() => {
    if (isMobile && view === "week") setView("agenda");
  }, [isMobile, view]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // Day picked in month view — by clicking a day cell OR a "+N more" link.
  // Both open the clean DayOverviewDialog listing that day's tasks. (The user
  // wants this popup; what they disliked was FC's native half-popover that the
  // more-link used to trigger — so we suppress that and reuse this dialog.)
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Current FullCalendar period title (e.g. "tháng 6 năm 2026", "15 – 21 thg
  // 6, 2026"), captured from datesSet so the unified toolbar can render it in
  // place of FC's own (now-disabled) header toolbar.
  const [fcTitle, setFcTitle] = useState("");
  // Visible date range of the mounted time-grid (week/day), captured from
  // datesSet. Drives dynamic slotMinTime/slotMaxTime so the grid trims empty
  // leading/trailing hours and reveals events outside the old fixed 06–22h
  // window.
  const [gridRange, setGridRange] = useState<{ start: Date; end: Date } | null>(
    null
  );
  const [homeworkParent, setHomeworkParent] = useState<string | null>(null);
  // Tracks the day currently shown by timeGridDay so the side panel stays in sync.
  const [dayDateIso, setDayDateIso] = useState<string>(
    () => initialDate ?? dayKey(new Date(), rawTz)
  );
  // Agenda offset (lifted from AgendaView) so the prev/next/today buttons
  // can sit in the sticky chrome stack alongside the view switcher. ±1 per
  // click shifts the 14-day window by ±14 days; 0 = current week's Monday.
  const [agendaOffset, setAgendaOffset] = useState(0);

  // ── FullCalendar instance refs ────────────────────────────────────
  // Two FC instances live in this component (one for month/week, one
  // for day's time-grid). Refs let the swipe-nav handlers call
  // .getApi().next() / .prev() / .gotoDate() without round-tripping
  // through React state. Day view's mobile branch has no FC instance
  // (the time-grid is hidden < md); that branch updates dayDateIso
  // state directly.
  const monthWeekFcRef = useRef<FullCalendar | null>(null);
  const dayFcRef = useRef<FullCalendar | null>(null);
  // Swipe container — wraps all three view branches (month/week, day,
  // agenda). Single stable element so useSwipeNav's effect doesn't have
  // to re-bind listeners when the user flips between views.
  const swipeBodyRef = useRef<HTMLDivElement>(null);

  // Direction-aware slide animation. Each navigation bumps `navTick`;
  // `navDirRef` records which way to animate. The useEffect below uses
  // the classic reflow-trick to re-fire the keyframe each time even
  // though the class name on the wrapper stays the same shape.
  const [navTick, setNavTick] = useState(0);
  const navDirRef = useRef<"prev" | "next" | null>(null);
  const triggerNavAnim = useCallback((dir: "prev" | "next") => {
    navDirRef.current = dir;
    setNavTick((t) => t + 1);
  }, []);
  useEffect(() => {
    if (navTick === 0) return;
    const el = swipeBodyRef.current;
    if (!el) return;
    const cls =
      navDirRef.current === "next" ? "cm-cal-flip-next" : "cm-cal-flip-prev";
    el.classList.remove("cm-cal-flip-next", "cm-cal-flip-prev");
    // Force a reflow so the browser re-evaluates the animation
    // declaration even though we're toggling the same set of classes.
    void el.offsetWidth;
    el.classList.add(cls);
  }, [navTick]);

  // Day navigation helper — used by both swipe gestures and the
  // prev/next-day buttons on DayHeroCard. Updates dayDateIso state
  // and, when the desktop FC time-grid is mounted, mirrors via
  // gotoDate so the rendering matches the side panel.
  // Multi-step jumps (e.g. "Quay về hôm nay" from +5 days) collapse
  // into a single anim direction — positive delta = "next" slide.
  const navigateDay = useCallback(
    (delta: number) => {
      if (delta === 0) return;
      const cur = new Date(dayDateIso + "T12:00:00");
      cur.setDate(cur.getDate() + delta);
      const iso = dayKey(cur, rawTz);
      setDayDateIso(iso);
      const api = dayFcRef.current?.getApi();
      if (api) api.gotoDate(iso);
      triggerNavAnim(delta > 0 ? "next" : "prev");
    },
    [dayDateIso, rawTz, triggerNavAnim]
  );
  const navigateMonthWeek = useCallback(
    (delta: number) => {
      const api = monthWeekFcRef.current?.getApi();
      if (!api) return;
      if (delta > 0) api.next();
      else api.prev();
      triggerNavAnim(delta > 0 ? "next" : "prev");
    },
    [triggerNavAnim]
  );
  const navigateAgenda = useCallback(
    (delta: number) => {
      setAgendaOffset((o) => o + delta);
      triggerNavAnim(delta > 0 ? "next" : "prev");
    },
    [triggerNavAnim]
  );

  // Signed whole-day offset of the day-view date from today (negative = past).
  // Drives the "back to today" jump and the day's relative chip.
  const daysFromToday = useMemo(() => {
    const d = new Date(dayDateIso + "T12:00:00");
    const now = new Date();
    const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((a - b) / 86_400_000);
  }, [dayDateIso]);

  // Unified prev / next / today, dispatched to the active view's own
  // navigation primitive. The single top toolbar drives every view, so FC's
  // built-in header toolbar (and the separate agenda toolbar) are gone.
  const goPrev = useCallback(() => {
    if (view === "agenda") navigateAgenda(-1);
    else if (view === "day") navigateDay(-1);
    else navigateMonthWeek(-1);
  }, [view, navigateAgenda, navigateDay, navigateMonthWeek]);
  const goNext = useCallback(() => {
    if (view === "agenda") navigateAgenda(1);
    else if (view === "day") navigateDay(1);
    else navigateMonthWeek(1);
  }, [view, navigateAgenda, navigateDay, navigateMonthWeek]);
  const goToday = useCallback(() => {
    if (view === "agenda") {
      if (agendaOffset !== 0) {
        triggerNavAnim(agendaOffset > 0 ? "prev" : "next");
        setAgendaOffset(0);
      }
    } else if (view === "day") {
      if (daysFromToday !== 0) navigateDay(-daysFromToday);
    } else {
      monthWeekFcRef.current?.getApi().today();
    }
  }, [view, agendaOffset, daysFromToday, navigateDay, triggerNavAnim]);

  // Swipe gestures on touch viewports. Skips mouse pointers (would
  // steal text-selection on desktop), so this stays a mobile-only
  // affordance even though we don't gate it on `isMobile` — the hook
  // self-filters by pointerType. Each view dispatches to its own
  // navigation primitive (which now also triggers the slide anim).
  useSwipeNav(swipeBodyRef, {
    onNext: () => {
      if (view === "agenda") navigateAgenda(1);
      else if (view === "day") navigateDay(1);
      else navigateMonthWeek(1);
    },
    onPrev: () => {
      if (view === "agenda") navigateAgenda(-1);
      else if (view === "day") navigateDay(-1);
      else navigateMonthWeek(-1);
    },
  });

  // ── Scroll preservation ────────────────────────────────────────────
  // The card body is the single scroll container. Saving scrollTop on
  // every scroll and restoring it after a filter-state change prevents
  // the browser from clamping scrollTop to 0 when content shrinks
  // (e.g. user toggles off "Học tập" → half the events vanish → total
  // scrollHeight drops → browser would otherwise reset scrollTop).
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef(0);
  const onBodyScroll = useCallback(() => {
    if (scrollRef.current) {
      savedScrollTopRef.current = scrollRef.current.scrollTop;
    }
  }, []);

  // Identity of the active filter set. When this changes, restore the
  // saved scrollTop after layout commits.
  const filterKey = useMemo(
    () =>
      `${[...hiddenTypes].sort().join(",")}|${hideDone ? 1 : 0}|${activeTag ?? ""}`,
    [hiddenTypes, hideDone, activeTag]
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && savedScrollTopRef.current > 0) {
      el.scrollTop = savedScrollTopRef.current;
    }
  }, [filterKey]);

  // ── FullCalendar's internal time-grid scroll ──────────────────────
  // For month/week/day, the OUTER scrollRef container doesn't scroll
  // (FC fills it exactly via height="100%"). The scroll the user
  // actually moves is the time-grid scroller INSIDE FC (`.fc-scroller`
  // elements). FC happens to reset that scroller back to `scrollTime`
  // whenever events change — which, on a filter chip click, looks like
  // "the calendar jumped back to 07:00". We can't disable that from the
  // FC props (`scrollTimeReset` only covers date-range changes), so we
  // snapshot the user's scrollTop on every scroll and restore it after
  // each filter-driven re-render.
  const fcScrollTopRef = useRef(0);

  useEffect(() => {
    if (view === "agenda") return;
    const root = scrollRef.current;
    if (!root) return;
    // FC builds its scrollers async after mount/view change. Defer the
    // listener setup a tick so they exist by the time we querySelector.
    let cleanups: Array<() => void> = [];
    const t1 = setTimeout(() => {
      const scrollers = root.querySelectorAll<HTMLElement>(".fc-scroller");
      scrollers.forEach((s) => {
        // Only the actually-scrollable scroller (time-grid body) matters;
        // header / time-axis scrollers stay at 0.
        if (s.scrollHeight <= s.clientHeight + 1) return;
        const onScroll = () => {
          fcScrollTopRef.current = s.scrollTop;
        };
        s.addEventListener("scroll", onScroll, { passive: true });
        cleanups.push(() => s.removeEventListener("scroll", onScroll));
      });
    }, 80);
    return () => {
      clearTimeout(t1);
      cleanups.forEach((fn) => fn());
      cleanups = [];
    };
  }, [view, fcLocale]);

  // Restore FC scroll after a filter-driven re-render. requestAnimationFrame
  // gives FC a frame to finish its own internal layout pass first; setting
  // scrollTop before that pass would be overwritten.
  useLayoutEffect(() => {
    if (view === "agenda") return;
    const root = scrollRef.current;
    if (!root || fcScrollTopRef.current === 0) return;
    const target = fcScrollTopRef.current;
    const id = requestAnimationFrame(() => {
      const scrollers = root.querySelectorAll<HTMLElement>(".fc-scroller");
      scrollers.forEach((s) => {
        if (s.scrollHeight > s.clientHeight + 1) {
          s.scrollTop = target;
        }
      });
    });
    return () => cancelAnimationFrame(id);
  }, [filterKey, view]);

  // Switching the view fundamentally changes the content (month grid vs
  // week time-grid vs 14-day list), so saved scrollTops no longer make
  // sense — start fresh at the top. FC will mount fresh and apply its
  // own scrollTime ("07:00") for Week/Day.
  useLayoutEffect(() => {
    savedScrollTopRef.current = 0;
    fcScrollTopRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [view]);

  const persistView = (v: ViewMode) => {
    setView(v);
    localStorage.setItem(VIEW_STORAGE_KEY, v);
  };

  // Agenda anchor (Monday of the current week, paged by agendaOffset).
  // Lifted out of AgendaView so the AgendaToolbar in the sticky chrome
  // and the day list rendered in the body can share the same window.
  const agendaAnchor = useMemo(
    () => initialDate ?? dayKey(new Date(), rawTz),
    [initialDate, rawTz]
  );
  const agendaStart = useMemo(() => {
    const d = new Date(agendaAnchor);
    if (Number.isNaN(d.getTime())) return new Date();
    const diff = (d.getDay() + 6) % 7; // back to Monday
    d.setDate(d.getDate() - diff + agendaOffset * 14);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [agendaAnchor, agendaOffset]);

  // Last day in the 14-day window (inclusive) — used for the date-range
  // label "22 thg 6 — 05 thg 7, 2026" in the AgendaToolbar.
  const agendaEnd = useMemo(() => {
    const d = new Date(agendaStart);
    d.setDate(agendaStart.getDate() + 13);
    return d;
  }, [agendaStart]);

  const toggleType = (t: TaskType) =>
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const topTags = useMemo(
    () => tagStats(tasks).filter((s) => s.openCount > 0).slice(0, 8),
    [tasks]
  );

  // Month view skips recurring tasks on purpose. A weekly class otherwise
  // turns into 4-5 identical rows across the month grid (PRN222 Mon 15:20,
  // PRN222 Mon 15:20, ...) drowning out the one-off items that actually
  // need attention (exams, homework deadlines, ad-hoc meetings). Week/Day/
  // Agenda views still show the full schedule. No user-facing toggle —
  // the previous opt-in pill was felt as clutter, so the default is just
  // "show what changes" in month view.
  const filteredTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.deadline &&
          !hiddenTypes.has(t.type) &&
          !(hideDone && t.status === "done") &&
          !(view === "month" && t.recurrence) &&
          (!activeTag || (t.tags || []).includes(activeTag))
      ),
    [tasks, hiddenTypes, hideDone, view, activeTag]
  );

  // Event count inside the agenda window — used as a "9 sự kiện" badge in
  // the AgendaToolbar. Only computed for agenda view to avoid wasted work
  // when the user is on month/week/day. Recurring tasks aren't counted
  // here on purpose: agenda treats one-off events as the relevant unit.
  const agendaTotal = useMemo(() => {
    if (view !== "agenda") return 0;
    let n = 0;
    for (let i = 0; i < 14; i++) {
      const d = new Date(agendaStart);
      d.setDate(agendaStart.getDate() + i);
      const iso = dayKey(d, rawTz);
      n += filteredTasks.filter(
        (t) => t.deadline && t.deadline.slice(0, 10) === iso
      ).length;
    }
    return n;
  }, [view, filteredTasks, agendaStart, rawTz]);

  const fcEvents = useMemo(
    () =>
      filteredTasks.flatMap((t) => {
        const color = eventColor(t);
        // Chip tint mạnh hơn (mix 24% với background) — không bị "chìm".
        // textColor = màu chủ đề (đọc rõ trên tint cùng tông).
        const bg = `color-mix(in srgb, ${color} 24%, var(--background))`;
        const isTimed = !!t.deadline && t.deadline.includes("T");
        const baseExtended = {
          type: t.type,
          priority: t.priority,
          status: t.status,
          location: t.location,
          description: t.description,
          tags: t.tags,
          recurrence: t.recurrence ?? null,
        };
        // `cm-done` is applied via classNames so the chip dims as a whole
        // (opacity + strikethrough in index.css). The inline styles stay
        // pointing at the task's natural color — without that, dark mode
        // ended up with black-on-black done chips.
        const doneClass = t.status === "done" ? ["cm-done"] : undefined;
        const baseStyle = {
          backgroundColor: bg,
          borderColor: color,
          textColor: color,
          classNames: doneClass,
        };

        // Non-recurring (one-off) — render as single event at its deadline.
        if (!t.recurrence) {
          return [
            {
              id: t.id,
              title: t.title,
              start: t.deadline,
              allDay: !isTimed,
              ...baseStyle,
              extendedProps: baseExtended,
            },
          ];
        }

        // Recurring — use FullCalendar's native daysOfWeek + startTime/
        // endTime + startRecur/endRecur so every visible week renders the
        // event automatically. Without this the recurring task only
        // showed up at the stored `deadline` week, leaving every future
        // week visually empty even though the data model said "weekly
        // forever". `endRecur` is EXCLUSIVE in FullCalendar, so we add
        // one day to the user-facing semesterEnd to include that day's
        // occurrence.
        if (!t.deadline) return [];
        const start = new Date(t.deadline);
        if (Number.isNaN(start.getTime())) return [];
        const dow = start.getDay();
        const hh = pad(start.getHours());
        const mm = pad(start.getMinutes());
        const startTime = isTimed ? `${hh}:${mm}:00` : undefined;
        const endTimeStr = isTimed ? extractEndTime(t.description) : null;
        const startRecur = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
        // endRecur cap. If task has `recurrenceEndAt` use it (+1 day, FC
        // exclusive). Otherwise fall back to 6 months from today so old
        // imports that skipped semester-end don't spawn occurrences into
        // the next decade. Visual only — does not mutate task data.
        let endRecur: string;
        if (t.recurrenceEndAt) {
          const end = new Date(t.recurrenceEndAt);
          if (!Number.isNaN(end.getTime())) {
            end.setDate(end.getDate() + 1);
            endRecur = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(
              end.getDate()
            )}`;
          } else {
            endRecur = renderHorizonIso();
          }
        } else {
          endRecur = renderHorizonIso();
        }
        const daysOfWeek =
          t.recurrence === "daily"
            ? [0, 1, 2, 3, 4, 5, 6]
            : t.recurrence === "weekday"
              ? [1, 2, 3, 4, 5]
              : t.recurrence === "weekly"
                ? [dow]
                : null;

        if (daysOfWeek) {
          return [
            {
              id: t.id,
              title: t.title,
              daysOfWeek,
              startTime,
              endTime: endTimeStr ? `${endTimeStr}:00` : undefined,
              startRecur,
              endRecur,
              allDay: !isTimed,
              ...baseStyle,
              extendedProps: baseExtended,
            },
          ];
        }

        // Monthly — FullCalendar core has no native monthly recurrence.
        // Generate occurrences manually within a ±12-month window from
        // now (capped by recurrenceEndAt). Each occurrence is a separate
        // event sharing the same task id so click handlers still find
        // the underlying task. 12 months covers a full year on either
        // side of today — enough for typical calendar navigation.
        if (t.recurrence === "monthly") {
          const out: Array<Record<string, unknown>> = [];
          const cursor = new Date(start);
          const horizonStart = new Date();
          horizonStart.setMonth(horizonStart.getMonth() - 12);
          const horizonEnd = new Date();
          horizonEnd.setMonth(horizonEnd.getMonth() + 12);
          const endCap = t.recurrenceEndAt
            ? new Date(t.recurrenceEndAt)
            : horizonEnd;
          for (let i = 0; i < 48; i++) {
            if (cursor > endCap) break;
            if (cursor >= horizonStart) {
              const ymd = `${cursor.getFullYear()}-${pad(
                cursor.getMonth() + 1
              )}-${pad(cursor.getDate())}`;
              out.push({
                id: `${t.id}::${ymd}`,
                title: t.title,
                start: isTimed ? `${ymd}T${hh}:${mm}` : ymd,
                allDay: !isTimed,
                ...baseStyle,
                extendedProps: { ...baseExtended, taskId: t.id },
              });
            }
            cursor.setMonth(cursor.getMonth() + 1);
          }
          return out;
        }

        return [];
      }),
    [filteredTasks]
  );

  // ── Dynamic time-grid bounds ───────────────────────────────────────
  // Week/Day time-grids used a fixed 06:00–22:00 window, which both wasted
  // vertical space (empty morning/evening rows) AND silently hid events
  // outside it (a 23:00 match, a 02:00 fixture). Instead, scan the events
  // that actually fall in the currently-visible range and fit the grid to
  // them: first event's hour → last event's end hour. `count` lets the body
  // show an empty-state hint when a whole week/day has no timed events.
  const rangeInfo = useMemo(() => {
    if ((view !== "week" && view !== "day") || !gridRange)
      return { min: null as number | null, max: null as number | null, count: 0 };
    const rs = gridRange.start.getTime();
    const re = gridRange.end.getTime();
    let min = 24;
    let max = -1;
    let count = 0;
    for (const tk of filteredTasks) {
      if (!tk.deadline) continue;
      const d = new Date(tk.deadline);
      if (Number.isNaN(d.getTime())) continue;
      let active: boolean;
      if (!tk.recurrence) {
        const tt = d.getTime();
        active = tt >= rs && tt < re;
      } else {
        // Recurring: active if its recurrence window overlaps the range. The
        // time-of-day (and thus the hour bound it contributes) is constant
        // across occurrences, so the first occurrence's hours suffice.
        const sT = d.getTime();
        const eT = tk.recurrenceEndAt
          ? new Date(tk.recurrenceEndAt).getTime()
          : Infinity;
        active = sT < re && eT >= rs;
      }
      if (!active) continue;
      count++;
      if (!tk.deadline.includes("T")) continue; // all-day → no hour bound
      const sh = d.getHours();
      if (sh < min) min = sh;
      const endStr = extractEndTime(tk.description);
      let eh: number;
      if (endStr) {
        const [eH, eM] = endStr.split(":").map(Number);
        eh = eH + (eM > 0 ? 1 : 0);
      } else {
        eh = sh + 1;
      }
      if (eh > max) max = eh;
    }
    return { min: max < 0 ? null : min, max: max < 0 ? null : max, count };
  }, [view, gridRange, filteredTasks]);

  // When events exist, fit tightly; when the range is empty fall back to a
  // compact daytime window (so an empty week isn't a wall of blank hours).
  const slotMinTime =
    rangeInfo.min != null ? `${pad(Math.max(0, rangeInfo.min))}:00:00` : "08:00:00";
  const slotMaxTime =
    rangeInfo.max != null ? `${pad(Math.min(24, rangeInfo.max))}:00:00` : "18:00:00";

  /* ----- Interaction handlers ----------------------------------- */

  const handleDrop = (info: FcDropArg) => {
    const id = info.draggedEl.getAttribute("data-id");
    if (id) updateTask(id, { deadline: info.dateStr });
  };

  const handleEventDrop = (info: FcEventDropArg) =>
    updateTask(info.event.id, { deadline: info.event.startStr });

  const handleEventReceive = (info: FcEventReceiveArg) => info.revert();

  const handleDateClick = (info: FcDateLikeArg) => {
    if (info.view?.type === "dayGridMonth") setSelectedDate(info.dateStr);
  };

  const handleSelect = (info: FcSelectArg) => {
    if (!info.view?.type?.startsWith("timeGrid")) return;
    const s = info.start;
    const local = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(
      s.getDate()
    )}T${pad(s.getHours())}:${pad(s.getMinutes())}`;
    openCreate({ deadline: local });
  };

  const handleEventClick = (info: FcEventClickArg) =>
    setSelectedEventId(info.event.id);

  const handleDatesSet = (info: FcDatesSetArg) => {
    // GUARD every setState: datesSet fires on each FC render, and changing
    // slotMinTime/slotMaxTime (derived from gridRange) makes FC re-fire it.
    // Returning the previous value when nothing changed lets React bail out,
    // breaking what would otherwise be an infinite render loop (React #185).
    setFcTitle((prev) => (prev === info.view.title ? prev : info.view.title));
    setGridRange((prev) =>
      prev &&
      prev.start.getTime() === info.start.getTime() &&
      prev.end.getTime() === info.end.getTime()
        ? prev
        : { start: info.start, end: info.end }
    );
    if (info.view.type === "timeGridDay") {
      const iso = info.startStr.slice(0, 10);
      if (iso !== dayDateIso) setDayDateIso(iso);
    }
  };

  /* ----- Derived selections ------------------------------------- */

  const selectedTask = selectedEventId
    ? tasks.find((t) => t.id === selectedEventId) ?? null
    : null;
  const homeworkParentTask = homeworkParent
    ? tasks.find((t) => t.id === homeworkParent) ?? null
    : null;
  const dayTasks = selectedDate
    ? tasks.filter(
        (t) =>
          t.deadline && t.deadline.slice(0, 10) === selectedDate.slice(0, 10)
      )
    : [];

  const createForSelectedDate = () => {
    if (!selectedDate) return;
    const iso = `${selectedDate}T09:00`;
    setSelectedDate(null);
    setTimeout(() => openCreate({ deadline: iso }), 50);
  };

  // Period title for the unified toolbar. Month/week/desktop-day read FC's
  // computed title (via datesSet); agenda shows its 14-day range; mobile day
  // has no FC instance so we format the date directly.
  const periodTitle = useMemo(() => {
    if (view === "agenda") {
      const s = agendaStart.toLocaleDateString(localeTag, {
        day: "2-digit",
        month: "short",
      });
      const e = agendaEnd.toLocaleDateString(localeTag, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      return `${s} — ${e}`;
    }
    if (view === "day" && isMobile) {
      const d = new Date(dayDateIso + "T12:00:00");
      return d.toLocaleDateString(localeTag, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    return fcTitle;
  }, [view, isMobile, dayDateIso, fcTitle, agendaStart, agendaEnd, localeTag]);

  // True when the visible range already contains today. Drives the "today"
  // button: lit (primary) when you've navigated AWAY to another period,
  // disabled when you're already on the current one.
  const atCurrentPeriod = useMemo(() => {
    if (view === "agenda") return agendaOffset === 0;
    if (!gridRange) return true;
    const now = Date.now();
    return now >= gridRange.start.getTime() && now < gridRange.end.getTime();
  }, [view, agendaOffset, gridRange]);

  /* ----- Render ------------------------------------------------- */

  return (
    <>
      {/*
        Single-scroll architecture. The card body (this div) is the only
        scroll container — chrome inside it sticks at top:0 via
        `position: sticky`, content flows below. For agenda the day list
        flows naturally and this div scrolls. For month/week/day the
        nested FullCalendar takes the remaining height via `flex-1
        min-h-0` and engages its own internal time-grid scroll, so this
        outer scroll stays inert (content fits).

        Fragment-as-root so the scroll container is a direct flex child
        of the card (`flex flex-col overflow-hidden`). An intermediate
        `h-full` wrapper made the height chain ambiguous in some
        viewports — flex-1 + min-h-0 here lets flexbox compute a
        definite height every time, which is what sticky needs to lock
        onto. Dialogs portal out, so they don't fight the flex slot.
       */}
      <div
        ref={scrollRef}
        onScroll={onBodyScroll}
        className="flex flex-col md:flex-1 md:min-h-0 md:overflow-y-auto"
      >
        {/* Sticky chrome — view switcher + type chips + Hide Done,
            tag filter row, agenda paging bar (agenda only). bg-card
            so the scrolling content behind reads cleanly.
            On desktop the chrome sticks inside the card's own scroll
            container; on mobile the card itself doesn't scroll (the
            page does via main-layout), so the chrome scrolls with
            content. Letting it scroll on mobile costs ~150px of
            chrome visibility for the user, but they get to it again
            with one scroll-up — a worthwhile trade for not having to
            offset the sticky-top by the topbar+tipbanner height. */}
        <div className="cm-cal-chrome relative md:sticky md:top-0 z-20 shrink-0 bg-card/95 backdrop-blur-sm border-b border-border/60 px-3 md:px-4 py-2.5 flex flex-col gap-2.5">
          <CalendarToolbar
            view={view}
            onViewChange={persistView}
            isMobile={isMobile}
            title={periodTitle}
            todayLabel={todayButtonLabel(view, t)}
            agendaCount={view === "agenda" ? agendaTotal : undefined}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            atCurrent={atCurrentPeriod}
            filtersOpen={filtersOpen}
            onToggleFilters={() => setFiltersOpen((v) => !v)}
            activeFilters={{
              types: Array.from(hiddenTypes),
              hideDone,
              activeTag,
            }}
            onRemoveTypeFilter={(typeKey) => {
              setHiddenTypes((prev) => {
                const next = new Set(prev);
                next.delete(typeKey);
                return next;
              });
            }}
            onRemoveTag={() => setActiveTag(null)}
            onRemoveHideDone={() => setHideDone(false)}
          />

          {filtersOpen && (
            <FiltersPanel
              hiddenTypes={hiddenTypes}
              onToggleType={toggleType}
              hideDone={hideDone}
              onToggleDone={() => setHideDone((v) => !v)}
              tags={topTags}
              activeTag={activeTag}
              onPickTag={setActiveTag}
              onClearAll={() => {
                setHiddenTypes(new Set());
                setHideDone(false);
                setActiveTag(null);
              }}
            />
          )}

        </div>

        {/* Body. Agenda flows in this scroll container; month/week/day
            occupy the remaining height and let FullCalendar own the
            internal scroll.

            The wrapping `<div ref>` is a layout-passthrough container
            for the swipe-nav listener — same flex direction as the
            parent so it doesn't introduce a new sizing constraint.
            (An earlier `display: contents` variant ate touch events
            on some Chromium builds — pointer events need a hit-test
            box. Plain block wrapper avoids that.) */}
        <div ref={swipeBodyRef} className="flex flex-col md:flex-1 md:min-h-0">
        {view === "agenda" ? (
          <div className="px-3 md:px-4 py-3 space-y-3">
            <AgendaView
              tasks={filteredTasks}
              start={agendaStart}
              onPickEvent={setSelectedEventId}
              onCreate={(iso) => openCreate({ deadline: iso })}
            />
          </div>
        ) : view === "day" ? (
          isMobile ? (
            // Mobile day view: the hour-by-hour time-grid is unreadable at
            // 375px, so render the vertical schedule list instead. Day
            // navigation now lives in the unified top toolbar.
            <div className="px-3 py-3">
              <DaySidePanel
                dateIso={dayDateIso}
                tasks={filteredTasks}
                onPickEvent={setSelectedEventId}
                onCreate={(iso) => openCreate({ deadline: iso })}
              />
            </div>
          ) : (
            // Desktop day view: time-grid + a contextual right rail (date +
            // progress, next-up highlight, free-slot suggestions, untimed
            // reminders). The rail's old date-nav strip is gone — the unified
            // toolbar owns nav now — so the redundancy is removed while the
            // genuinely useful info comes back (the view no longer feels bare).
            <div className="px-3 md:px-4 py-3 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4 md:flex-1 md:min-h-0">
              <div className="relative min-w-0 min-h-0">
              <FullCalendar
                ref={dayFcRef}
                key={`day-${fcLocale}`}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="timeGridDay"
                initialDate={dayDateIso}
                locales={[enGbLocale, viLocale]}
                locale={fcLocale}
                timeZone={fcTimeZone}
                firstDay={1}
                headerToolbar={false}
                allDayText={t("common.allDay")}
                titleFormat={{ day: "numeric", month: "long", year: "numeric" }}
                events={fcEvents}
                height="100%"
                expandRows
                stickyHeaderDates
                nowIndicator
                slotMinTime={slotMinTime}
                slotMaxTime={slotMaxTime}
                scrollTime={slotMinTime}
                droppable
                drop={handleDrop}
                editable
                eventDrop={handleEventDrop}
                eventReceive={handleEventReceive}
                dateClick={handleDateClick}
                eventClick={handleEventClick}
                slotEventOverlap={false}
                defaultTimedEventDuration="01:00"
                selectable
                select={handleSelect}
                eventContent={renderFcEvent}
                datesSet={handleDatesSet}
              />
              {rangeInfo.count === 0 && (
                <EmptyGridHint label={t("calendar.emptyRangeHint")} />
              )}
              </div>
              <DaySidePanel
                dateIso={dayDateIso}
                tasks={filteredTasks}
                onPickEvent={setSelectedEventId}
                onCreate={(iso) => openCreate({ deadline: iso })}
              />
            </div>
          )
        ) : (
          // Week (desktop, xl+) gets a right rail (week summary + upcoming);
          // Month stays full-width. The inner wrapper is `contents` for month
          // (FC fills the flex-1 parent directly) and a real grid cell for
          // week (stretches alongside the rail).
          <div
            className={cn(
              "px-3 md:px-4 py-3 md:flex-1 md:min-h-0",
              view === "week"
                ? "grid xl:grid-cols-[minmax(0,1fr)_300px] gap-4"
                : "relative"
            )}
          >
            <div className={view === "week" ? "relative min-w-0 min-h-0" : "contents"}>
            <FullCalendar
              ref={monthWeekFcRef}
              key={`${view}-${fcLocale}-${isMobile ? "m" : "d"}`}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView={FC_VIEW[view as Exclude<ViewMode, "agenda">]}
              initialDate={initialDate}
              locales={[enGbLocale, viLocale]}
              locale={fcLocale}
              timeZone={fcTimeZone}
              firstDay={1}
              headerToolbar={false}
              allDayText={t("common.allDay")}
              // Compact column header on mobile — "narrow" gives single
              // letters (M T W T F S S) instead of "Th 2 / Th 3" which
              // wrapped to 2 lines per cell at 375px. Desktop keeps
              // "short" weekday for full readability.
              dayHeaderFormat={
                isMobile ? { weekday: "narrow" } : { weekday: "short" }
              }
              // Compact title on mobile — "Th6 2026" / "Jun 2026" instead
              // of "tháng 6 năm 2026" / "June 2026" which also wrapped to
              // 2 lines next to the prev/next buttons.
              titleFormat={
                isMobile
                  ? { month: "short", year: "numeric" }
                  : view === "month"
                    ? { month: "long", year: "numeric" }
                    : { month: "short", day: "numeric", year: "numeric" }
              }
              events={fcEvents}
              // On desktop, height="100%" fills the flex-1 parent so
              // the time-grid scrolls inside the card. On mobile the
              // parent has no defined height (page-level scroll
              // strategy), so FC sizes to its own content — Month
              // renders ~6 rows naturally, Week is hidden anyway via
              // the toolbar's mobile filter.
              height={isMobile ? "auto" : "100%"}
              expandRows
              stickyHeaderDates
              nowIndicator
              slotMinTime={slotMinTime}
              slotMaxTime={slotMaxTime}
              scrollTime={slotMinTime}
              droppable
              drop={handleDrop}
              editable
              eventDrop={handleEventDrop}
              eventReceive={handleEventReceive}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              slotEventOverlap={false}
              defaultTimedEventDuration="01:00"
              selectable
              select={handleSelect}
              // Drop event chips on mobile month view — at 375px they
              // truncate to single letters / crossed-out time strings
              // and carry no info. CSS (.fc-daygrid-event-harness display
              // none + :has() presence dot) does the visual. dayMaxEvents
              // = 0 also skips the "+N more" link FC would otherwise add.
              dayMaxEvents={
                isMobile && view === "month" ? 0 : view === "month" ? 3 : false
              }
              moreLinkText={(n) => t("calendar.moreLinkText", { n })}
              moreLinkClick={(arg: FcMoreLinkArg) => {
                // "+N more" → open the clean day-overview dialog (same as a
                // day-cell click). Returning nothing suppresses FC's native
                // half-popover (the behaviour the user disliked).
                setSelectedDate(dayKey(arg.date, rawTz));
              }}
              eventContent={renderFcEvent}
              datesSet={handleDatesSet}
            />
            {view === "week" && rangeInfo.count === 0 && (
              <EmptyGridHint label={t("calendar.emptyRangeHint")} />
            )}
            </div>
            {view === "week" && gridRange && (
              <aside className="hidden xl:block xl:min-h-0 xl:overflow-y-auto">
                <WeekRail
                  tasks={filteredTasks}
                  start={gridRange.start}
                  end={gridRange.end}
                  onPickEvent={setSelectedEventId}
                />
              </aside>
            )}
          </div>
        )}
        </div>
      </div>

      <EventDetailDialog
        task={selectedTask}
        onClose={() => setSelectedEventId(null)}
        onEdit={() => {
          if (!selectedTask) return;
          const id = selectedTask.id;
          setSelectedEventId(null);
          setTimeout(() => openEdit(id), 50);
        }}
        onDelete={() => {
          if (!selectedTask) return;
          removeTask(selectedTask.id);
          setSelectedEventId(null);
        }}
        onHomework={() => {
          if (!selectedTask) return;
          setHomeworkParent(selectedTask.id);
          setSelectedEventId(null);
        }}
        onSnooze={(ms) => {
          if (!selectedTask) return;
          snoozeTask(selectedTask.id, ms);
          setSelectedEventId(null);
        }}
        onTagClick={(tag) => {
          setSelectedEventId(null);
          setTimeout(
            () => navigate(`/tasks?tag=${encodeURIComponent(tag)}`),
            40
          );
        }}
      />

      <DayOverviewDialog
        date={selectedDate}
        tasks={dayTasks}
        onClose={() => setSelectedDate(null)}
        onPick={(id) => {
          setSelectedDate(null);
          setSelectedEventId(id);
        }}
        onCreate={createForSelectedDate}
      />

      {homeworkParentTask && (
        <HomeworkDialog
          parentTask={homeworkParentTask}
          open={!!homeworkParent}
          onOpenChange={(b) => !b && setHomeworkParent(null)}
        />
      )}
    </>
  );
}

/* ───── Toolbar (view switcher + filters button) ──────────────────── */

interface CalendarToolbarProps {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  isMobile: boolean;
  title: string;
  todayLabel: string;
  agendaCount?: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  atCurrent: boolean;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  activeFilters: {
    types: TaskType[]; // hidden types
    hideDone: boolean;
    activeTag: string | null;
  };
  onRemoveTypeFilter: (t: TaskType) => void;
  onRemoveTag: () => void;
  onRemoveHideDone: () => void;
}

function CalendarToolbar({
  view,
  onViewChange,
  isMobile,
  title,
  todayLabel,
  agendaCount,
  onPrev,
  onNext,
  onToday,
  atCurrent,
  filtersOpen,
  onToggleFilters,
  activeFilters,
  onRemoveTypeFilter,
  onRemoveTag,
  onRemoveHideDone,
}: CalendarToolbarProps) {
  const t = useT();
  const visibleViews = isMobile
    ? VIEWS.filter((v) => v.key !== "week")
    : VIEWS;
  const activeCount =
    activeFilters.types.length +
    (activeFilters.activeTag ? 1 : 0) +
    (activeFilters.hideDone ? 1 : 0);
  return (
    // ONE control row, two groups. LEFT = prev/next/today + period title;
    // RIGHT = view switcher + active filter pills + Bộ lọc. justify-between
    // spreads them across one line when they fit; when the window narrows they
    // wrap to two lines and BOTH align left — no orphaned bottom-right cluster.
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onPrev}
            aria-label={t("calendar.navPrev")}
            title={t("calendar.navPrev")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNext}
            aria-label={t("calendar.navNext")}
            title={t("calendar.navNext")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {/* Lights up (primary) when the visible range is NOT the current
              period; disabled when you're already on it — mirrors FC's
              convention + the app's active-state styling. */}
          <Button
            variant="outline"
            size="sm"
            onClick={onToday}
            disabled={atCurrent}
            className={cn(
              "h-8",
              !atCurrent &&
                "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
            )}
          >
            {todayLabel}
          </Button>
        </div>

        <h2 className="text-base sm:text-lg font-bold tracking-tight capitalize leading-tight min-w-0 truncate">
          {title}
          {typeof agendaCount === "number" && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {t("calendar.eventCount", { n: agendaCount })}
            </span>
          )}
        </h2>
      </div>

      {/* Right cluster — view switcher + active filter pills + Bộ lọc. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <div
          className="cm-seg-track max-w-full overflow-x-auto"
          role="tablist"
          aria-label={t("calendar.viewSwitcher")}
        >
          {visibleViews.map(({ key, labelKey, icon: Icon }) => {
            const active = view === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                data-active={active}
                onClick={() => onViewChange(key)}
                className="cm-seg-item cm-seg-item-sm cm-press"
              >
                <Icon className="h-3.5 w-3.5" />
                {t(labelKey)}
              </button>
            );
          })}
        </div>

        {activeFilters.types.map((typeKey) => {
          const label = t(`type.${typeKey}`);
          return (
            <button
              key={typeKey}
              type="button"
              onClick={() => onRemoveTypeFilter(typeKey)}
              title={t("calendar.showType", { label })}
              className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs font-medium hover:bg-primary/25 transition-colors"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: TYPE_COLOR[typeKey] }}
              />
              {t("calendar.activeFilterHidden", { label })}
              <X className="h-3 w-3" />
            </button>
          );
        })}
        {activeFilters.hideDone && (
          <button
            type="button"
            onClick={onRemoveHideDone}
            className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs font-medium hover:bg-primary/25 transition-colors"
          >
            {t("calendar.hideDone")}
            <X className="h-3 w-3" />
          </button>
        )}
        {activeFilters.activeTag && (
          <button
            type="button"
            onClick={onRemoveTag}
            className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            #{activeFilters.activeTag}
            <X className="h-3 w-3" />
          </button>
        )}

        <button
          type="button"
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
          aria-label={t("calendar.filtersLabel")}
          title={t("calendar.filtersLabel")}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-md border text-xs font-medium transition-colors",
            "cm-press shrink-0",
            filtersOpen
              ? "bg-accent border-input"
              : "bg-background hover:bg-accent border-input"
          )}
        >
          <FilterIcon className="h-3.5 w-3.5" />
          {/* Text hidden on mobile to keep the button compact next to
              the view tabs. Visible from sm+ where horizontal room
              allows. Icon alone is fine — the button has an
              aria-label + title for accessibility. */}
          <span className="hidden sm:inline">
            {t("calendar.filtersLabel")}
          </span>
          {activeCount > 0 && (
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
              {activeCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * "Hôm Nay" button text adapts to the current view:
 *   - month → "Tháng này"
 *   - week  → "Tuần này"
 *   - day   → "Hôm nay"
 *   - agenda → "Hôm nay"
 *
 * FullCalendar's `today` button always jumps the visible range to the
 * one containing `new Date()`; the label was previously hard-coded as
 * "Hôm Nay" regardless of view, which read awkwardly on Tháng/Tuần
 * (you're not "jumping to today" so much as "jumping to this period").
 */
function todayButtonLabel(view: ViewMode, t: ReturnType<typeof useT>): string {
  if (view === "month") return t("calendar.thisMonth");
  if (view === "week") return t("calendar.thisWeek");
  return t("calendar.todayJump");
}

/* Centered overlay shown over an empty week/day time-grid so a range with no
   timed events reads as intentional, not broken/blank. pointer-events-none so
   clicks still reach the grid beneath (drag-create a slot). */
function EmptyGridHint({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center px-4">
      <div className="rounded-xl border bg-card/90 px-4 py-3 text-center text-sm text-muted-foreground shadow-sm backdrop-blur-sm">
        {label}
      </div>
    </div>
  );
}

/* ───── Filters panel (collapsed by default) ────────────────────── */

interface FiltersPanelProps {
  hiddenTypes: Set<TaskType>;
  onToggleType: (t: TaskType) => void;
  hideDone: boolean;
  onToggleDone: () => void;
  tags: Array<{ name: string; count: number; openCount: number }>;
  activeTag: string | null;
  onPickTag: (t: string | null) => void;
  onClearAll: () => void;
}

function FiltersPanel({
  hiddenTypes,
  onToggleType,
  hideDone,
  onToggleDone,
  tags,
  activeTag,
  onPickTag,
  onClearAll,
}: FiltersPanelProps) {
  const t = useT();
  const hasActive =
    hiddenTypes.size > 0 || hideDone || activeTag !== null;
  return (
    <div className="rounded-xl border bg-card/50 p-3 sm:p-4 space-y-4 shrink-0">
      {/* Type filter section */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {t("calendar.filtersTypeLabel")}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.keys(TYPE_COLOR) as TaskType[]).map((typeKey) => {
            const hidden = hiddenTypes.has(typeKey);
            const label = t(`type.${typeKey}`);
            return (
              <button
                key={typeKey}
                type="button"
                aria-pressed={!hidden}
                data-hidden={hidden}
                onClick={() => onToggleType(typeKey)}
                title={
                  hidden
                    ? t("calendar.showType", { label })
                    : t("calendar.hideType", { label })
                }
                className="cm-chip-cat cm-press"
                style={{ ["--chip-color" as string]: TYPE_COLOR[typeKey] }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: TYPE_COLOR[typeKey],
                    opacity: hidden ? 0.35 : 1,
                  }}
                />
                {label}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={hideDone}
            data-active={hideDone}
            onClick={onToggleDone}
            title={t("calendar.hideDoneTitle")}
            className="cm-chip cm-press"
          >
            {t("calendar.hideDone")}
          </button>
        </div>
      </div>

      {/* Tag filter section */}
      {tags.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t("calendar.filtersTagLabel")}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {tags.map((tag) => {
              const isActive = activeTag === tag.name;
              return (
                <button
                  key={tag.name}
                  type="button"
                  onClick={() => onPickTag(isActive ? null : tag.name)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  )}
                >
                  #{tag.name}
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      isActive ? "opacity-80" : "opacity-60"
                    )}
                  >
                    {tag.openCount || tag.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasActive && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
          >
            <X className="h-3 w-3" />
            {t("calendar.filtersClearAll")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ───── Tag filter row ──────────────────────────────────────────── */

/* ───── FullCalendar event renderer ─────────────────────────────── */

interface FcEventProps {
  type: TaskType;
  priority: string;
  status: string;
  location?: string;
  description?: string;
  tags?: string[];
  recurrence?: string | null;
}

interface RenderArg {
  event: {
    title: string;
    start: Date | null;
    end: Date | null;
    allDay: boolean;
    extendedProps: FcEventProps;
  };
  view: { type: string };
}

function fmtHm(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderFcEvent(arg: RenderArg) {
  const { event, view } = arg;
  if (view.type === "dayGridMonth") return <MonthEvent event={event} />;
  if (view.type === "timeGridDay") return <DayEvent event={event} />;
  return <WeekEvent event={event} />;
}

/* Layout chuẩn cho mọi event: time LEFT (tabular-nums, mảnh), title bên cạnh,
 * không emoji không icon. Trạng thái done strikethrough + mờ. High priority
 * đã ăn vào borderColor (destructive) ngoài CSS — không cần icon thêm. */
function MonthEvent({ event }: { event: RenderArg["event"] }) {
  const p = event.extendedProps;
  const isDone = p.status === "done";
  const time = !event.allDay && event.start ? fmtHm(event.start) : "";
  return (
    <div
      className={cn(
        "flex items-baseline gap-1.5 px-2 py-0.5 w-full overflow-hidden text-[12px] leading-snug",
        isDone && "line-through opacity-50"
      )}
    >
      {time && (
        <span className="font-semibold tabular-nums shrink-0 opacity-70 text-[11px]">
          {time}
        </span>
      )}
      <span className="font-medium truncate flex-1 tracking-tight">{event.title}</span>
    </div>
  );
}

/* Week: 1 layout duy nhất. Short → no description; long → multi-line title. */
function WeekEvent({ event }: { event: RenderArg["event"] }) {
  const p = event.extendedProps;
  const isDone = p.status === "done";
  const time = !event.allDay && event.start ? fmtHm(event.start) : "";
  const durMin =
    event.end && event.start
      ? (event.end.getTime() - event.start.getTime()) / 60_000
      : 60;
  const compact = durMin <= 45;
  const showLocation = durMin >= 75 && !!p.location;

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-baseline gap-1.5 px-1.5 h-full w-full overflow-hidden text-[11px] leading-tight",
          isDone && "line-through opacity-50"
        )}
      >
        {time && (
          <span className="font-semibold tabular-nums shrink-0 opacity-80">{time}</span>
        )}
        <span className="font-medium truncate flex-1 tracking-tight">{event.title}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col h-full w-full px-1.5 py-1 overflow-hidden leading-tight gap-0.5",
        isDone && "line-through opacity-50"
      )}
    >
      {time && (
        <span className="font-semibold tabular-nums shrink-0 text-[11px] opacity-80">
          {time}
        </span>
      )}
      <p className="font-semibold leading-snug text-[12.5px] line-clamp-2 tracking-tight">
        {event.title}
      </p>
      {showLocation && (
        <p className="text-[10.5px] opacity-75 truncate mt-auto">
          {p.location}
        </p>
      )}
    </div>
  );
}

/* Day: deepest zoom. Tiered by event duration so content always fits the
 * rendered height (no half-clipped lines). Slot height = 2.5rem per 30 min:
 *   tier  | dur     | px    | layout
 *   ----- | ------- | ----- | -------------------------------------------
 *   tiny  | ≤ 30m   | 40px  | single inline row
 *   med   | 31-75m  | ≥80px | time + title 2 lines + bottom row
 *   long  | ≥ 76m   | ≥120px| + description
 */
function DayEvent({ event }: { event: RenderArg["event"] }) {
  const t = useT();
  const p = event.extendedProps;
  const isDone = p.status === "done";
  const startStr = event.start ? fmtHm(event.start) : "";
  const endStr = event.end ? fmtHm(event.end) : "";
  const allDayLabel = t("common.allDay");
  const timeRange = event.allDay
    ? allDayLabel
    : endStr
    ? `${startStr} – ${endStr}`
    : startStr;

  if (event.allDay) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 h-full overflow-hidden text-[12px]",
          isDone && "line-through opacity-50"
        )}
      >
        <span className="font-semibold tabular-nums shrink-0 opacity-70 text-[11px]">{allDayLabel}</span>
        <span className="font-medium truncate flex-1 tracking-tight">{event.title}</span>
      </div>
    );
  }

  const durMin =
    event.end && event.start
      ? (event.end.getTime() - event.start.getTime()) / 60_000
      : 60;

  if (durMin <= 30) {
    return (
      <div
        className={cn(
          "flex items-baseline gap-1.5 px-2 h-full overflow-hidden text-[12px] leading-tight",
          isDone && "line-through opacity-50"
        )}
      >
        <span className="font-semibold tabular-nums shrink-0 opacity-80">{startStr}</span>
        <span className="font-medium truncate flex-1 tracking-tight">{event.title}</span>
      </div>
    );
  }

  const isLong = durMin >= 76;
  const showDesc = isLong && !!p.description;
  const tagLimit = isLong ? 5 : 3;

  return (
    <div
      className={cn(
        "flex flex-col h-full w-full px-2 py-1 overflow-hidden gap-0.5",
        isDone && "line-through opacity-50"
      )}
    >
      <span className="font-semibold tabular-nums shrink-0 text-[11px] opacity-80">
        {timeRange}
      </span>

      <p
        className="font-semibold text-[13px] line-clamp-2 tracking-tight"
        style={{ lineHeight: 1.15 }}
      >
        {event.title}
      </p>

      {showDesc && (
        <p
          className="text-[10.5px] opacity-75 line-clamp-2"
          style={{ lineHeight: 1.3 }}
        >
          {p.description}
        </p>
      )}

      {(p.location || p.tags?.length) && (
        <div className="flex items-center gap-1.5 flex-wrap text-[10px] opacity-80 mt-auto pt-0.5">
          {p.location && <span className="font-medium">{p.location}</span>}
          {p.tags?.slice(0, tagLimit).map((t) => (
            <span key={t} className="opacity-80">#{t}</span>
          ))}
          {(p.tags?.length || 0) > tagLimit && (
            <span className="opacity-60">+{p.tags!.length - tagLimit}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ───── Event detail dialog ─────────────────────────────────────── */

interface EventDetailDialogProps {
  task: Task | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onHomework: () => void;
  onSnooze: (ms: number) => void;
  onTagClick: (tag: string) => void;
}

// Labels resolved with t() at render time; the "1w" entry uses a localized
// key because EN reads "1w" awkwardly compared to "1 week".
const SNOOZE_OPTS: ReadonlyArray<{ label?: string; labelKey?: string; ms: number }> = [
  { label: "1h", ms: 60 * 60_000 },
  { label: "1d", ms: 24 * 60 * 60_000 },
  { labelKey: "calendar.snoozeWeek", ms: 7 * 24 * 60 * 60_000 },
];

// Auto-link URL trong text — task description hay có link Drive/Google Doc.
// String.split với capture group → parts xen kẽ plain/match/plain/match…
function RichText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-primary underline underline-offset-2 hover:text-primary/80 [overflow-wrap:anywhere]"
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function EventDetailDialog({
  task,
  onClose,
  onEdit,
  onDelete,
  onHomework,
  onSnooze,
  onTagClick,
}: EventDetailDialogProps) {
  const open = !!task;
  const t = useT();
  const { extractTimeLabel, formatDeadline } = useDateFns();
  return (
    <Dialog open={open} onOpenChange={(b) => !b && onClose()}>
      <DialogContent className="sm:max-w-[460px] max-h-[92vh] flex flex-col gap-0 p-0 cm-sheet-mobile">
        {task && (
          <>
            <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
              <DialogTitle className="text-xl pr-8 leading-snug">
                <span className="min-w-0 break-words">{task.title}</span>
              </DialogTitle>
              <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: TYPE_COLOR[task.type] }} />
                  {t(`type.${task.type}`)}
                </span>
                {task.priority === "high" && (
                  <span className="text-xs font-medium text-destructive">{t("calendar.urgentInline")}</span>
                )}
                {task.tags && task.tags.length > 0 && (
                  <span className="text-xs text-muted-foreground">·</span>
                )}
                {task.tags?.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => onTagClick(tag)}
                    title={t("calendar.viewAllTag", { tag })}
                    className="text-xs text-muted-foreground hover:text-primary font-medium transition-colors"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </DialogHeader>

            <div className="px-6 py-2 space-y-3 flex-1 min-h-0 overflow-y-auto">
              <div className="grid gap-2">
                {task.deadline && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium tabular-nums">
                      {extractTimeLabel(task.deadline) ?? t("common.allDay")} ·{" "}
                      {formatDeadline(task.deadline)}
                    </span>
                  </div>
                )}
                {task.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">{task.location}</span>
                  </div>
                )}
              </div>

              {task.description && (
                <div className="flex gap-3 text-muted-foreground bg-muted/40 p-3 rounded-lg border">
                  <AlignLeft className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-sm whitespace-pre-wrap leading-relaxed flex-1 min-w-0 break-words [overflow-wrap:anywhere]">
                    <RichText text={task.description} />
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t bg-background shrink-0 space-y-3">
              {task.status !== "done" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Clock4 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{t("calendar.snooze")}:</span>
                  {SNOOZE_OPTS.map((opt, i) => {
                    const label = opt.labelKey ? t(opt.labelKey) : opt.label!;
                    return (
                      <button
                        key={i}
                        onClick={() => onSnooze(opt.ms)}
                        className="text-xs px-2 py-0.5 rounded-full bg-secondary hover:bg-primary/15 hover:text-primary transition-colors font-medium"
                      >
                        +{label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-medium">
                  {t("calendar.statusLabel")}:{" "}
                  <span className="text-muted-foreground">
                    {t(task.status === "todo" ? "status.todo" : task.status === "in-progress" ? "status.inProgress" : "status.done")}
                  </span>
                </span>
                <div className="flex gap-2 flex-wrap">
                  {task.type === "academic" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={onHomework}
                    >
                      <BookOpen className="w-3.5 h-3.5" /> {t("tasks.addHomework")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={onEdit}
                  >
                    <Pencil className="w-3.5 h-3.5" /> {t("common.edit")}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={onDelete}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {t("common.delete")}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ───── Day overview dialog ─────────────────────────────────────── */

interface DayOverviewDialogProps {
  date: string | null;
  tasks: Task[];
  onClose: () => void;
  onPick: (id: string) => void;
  onCreate: () => void;
}

// Clean per-day task list, opened by clicking a day cell OR a "+N more" link
// in month view. Replaces FullCalendar's native more-link popover (which the
// user disliked — it half-overlapped the grid and expanded oddly).
function DayOverviewDialog({
  date,
  tasks,
  onClose,
  onPick,
  onCreate,
}: DayOverviewDialogProps) {
  const t = useT();
  const localeTag = useLocaleTag();
  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const at = a.deadline ? new Date(a.deadline).getTime() : 0;
        const bt = b.deadline ? new Date(b.deadline).getTime() : 0;
        return at - bt;
      }),
    [tasks]
  );

  return (
    <Dialog open={!!date} onOpenChange={(b) => !b && onClose()}>
      <DialogContent className="sm:max-w-[460px] max-h-[92vh] flex flex-col gap-0 p-0 cm-sheet-mobile">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle className="capitalize">
            {date &&
              new Date(date).toLocaleDateString(localeTag, {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
          </DialogTitle>
          <DialogDescription>
            {sorted.length === 0
              ? t("calendar.emptyDayDescription")
              : t("calendar.tasksInDayDescription", { n: sorted.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-1 flex-1 min-h-0 overflow-y-auto">
          {sorted.length > 0 ? (
            <div className="space-y-2">
              {sorted.map((task) => (
                <DayTaskRow
                  key={task.id}
                  task={task}
                  onClick={() => onPick(task.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center text-center py-6 gap-2">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Plus className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("calendar.noTasksInDay")}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-background shrink-0">
          <Button
            onClick={onCreate}
            className="w-full gap-2"
            variant={sorted.length === 0 ? "default" : "outline"}
          >
            <Plus className="h-4 w-4" />
            {t("calendar.createTaskForDay")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const DayTaskRow = memo(function DayTaskRow({
  task,
  onClick,
}: {
  task: Task;
  onClick: () => void;
}) {
  const t = useT();
  const { extractTimeLabel } = useDateFns();
  const time = extractTimeLabel(task.deadline);
  const col = subjectColor(task.title);
  return (
    <div
      onClick={onClick}
      className={cn(
        "p-3 border rounded-xl bg-card hover:bg-accent cursor-pointer transition-colors flex items-start gap-3 relative overflow-hidden",
        task.priority === "high" && "border-destructive/30 bg-destructive/5"
      )}
    >
      <span
        className={cn("absolute left-0 top-0 bottom-0 w-1", col.dot)}
        aria-hidden
      />
      <div className="w-12 shrink-0 text-center pl-1">
        {time ? (
          <p className="text-sm font-bold tabular-nums">{time}</p>
        ) : (
          <p className="text-[10px] text-muted-foreground uppercase">
            {t("common.allDay")}
          </p>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-medium text-sm break-words",
            task.status === "done" && "line-through text-muted-foreground"
          )}
        >
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: TYPE_COLOR[task.type] }} />
            {t(`type.${task.type}`)}
          </span>
          {task.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {task.location}
            </span>
          )}
          {task.priority === "high" && (
            <span className="text-destructive font-semibold inline-flex items-center gap-0.5">
              <Flame className="h-3 w-3" /> {t("priority.urgent")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

/* ───── Agenda view (vertical timeline) ─────────────────────────── */

interface AgendaViewProps {
  tasks: Task[];
  start: Date;
  onPickEvent: (id: string) => void;
  onCreate: (deadlineIso: string) => void;
}

// Pure presentation: renders 14 day groups starting from `start`. No
// internal scroll — the day groups stack in the parent scroll container
// (the card body) so the user-visible scrollbar is the card's, not a
// nested one. Used to have its own paging state + inner overflow div
// before; both lifted out so the AgendaToolbar above can sit in the
// sticky chrome stack and share the window calculation.
function AgendaView({
  tasks,
  start,
  onPickEvent,
  onCreate,
}: AgendaViewProps) {
  // Pull the user's resolved tz so day bucketing matches the bucket
  // boundaries the rest of the app uses. Without this, a user on
  // Asia/Ho_Chi_Minh viewing the app on a UTC machine would see events
  // shift by a day around midnight in Vietnam time.
  const tz = useTimeZone();
  const days = useMemo(() => {
    const out: Array<{ date: Date; iso: string; items: Task[] }> = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = dayKey(d, tz);
      const items = tasks
        .filter((t) => t.deadline && t.deadline.slice(0, 10) === iso)
        .sort((a, b) => {
          const at = a.deadline ? new Date(a.deadline).getTime() : 0;
          const bt = b.deadline ? new Date(b.deadline).getTime() : 0;
          return at - bt;
        });
      out.push({ date: d, iso, items });
    }
    return out;
  }, [start, tasks, tz]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayK = dayKey(today, tz);

  return (
    <>
      {days.map(({ date, iso, items }) => (
        <AgendaDayGroup
          key={iso}
          date={date}
          iso={iso}
          items={items}
          isToday={iso === todayK}
          isPast={date < today}
          onCreate={() => onCreate(`${iso}T09:00`)}
          onPickEvent={onPickEvent}
        />
      ))}
    </>
  );
}

interface AgendaDayGroupProps {
  date: Date;
  iso: string;
  items: Task[];
  isToday: boolean;
  isPast: boolean;
  onCreate: () => void;
  onPickEvent: (id: string) => void;
}

function AgendaDayGroup({
  date,
  items,
  isToday,
  isPast,
  onCreate,
  onPickEvent,
}: AgendaDayGroupProps) {
  const t = useT();
  const localeTag = useLocaleTag();
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card/30 overflow-hidden",
        isToday && "border-primary/40 ring-1 ring-primary/30",
        isPast && !isToday && "opacity-70"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2 border-b",
          isToday && "bg-primary/5",
          isWeekend && !isToday && "bg-muted/30"
        )}
      >
        <div className="flex items-baseline gap-2.5">
          <span
            className={cn(
              "text-2xl font-bold tabular-nums leading-none",
              isToday && "text-primary"
            )}
          >
            {date.getDate()}
          </span>
          <div className="leading-tight">
            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-wider",
                isToday ? "text-primary" : "text-muted-foreground"
              )}
            >
              {date.toLocaleDateString(localeTag, { weekday: "long" })}
              {isToday && t("calendar.todayBadge")}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {date.toLocaleDateString(localeTag, {
                day: "2-digit",
                month: "long",
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {t("calendar.taskCountBadge", { n: items.length })}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onCreate}
            title={t("calendar.addTaskToday")}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <button
          onClick={onCreate}
          className="w-full text-left px-4 py-3 text-xs text-muted-foreground hover:bg-accent/40 transition-colors flex items-center gap-2 group"
        >
          <Sparkles className="h-3 w-3 opacity-50 group-hover:opacity-100" />
          {t("calendar.emptySlot")}
        </button>
      ) : (
        <div className="divide-y">
          {items.map((task) => (
            <AgendaItem
              key={task.id}
              task={task}
              onPick={() => onPickEvent(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const AgendaItem = memo(function AgendaItem({
  task,
  onPick,
}: {
  task: Task;
  onPick: () => void;
}) {
  const t = useT();
  const { extractTimeLabel } = useDateFns();
  const time = extractTimeLabel(task.deadline);
  const col = subjectColor(task.title);
  const isDone = task.status === "done";
  const isUrgent = task.priority === "high" && !isDone;

  return (
    <button
      onClick={onPick}
      className={cn(
        "w-full text-left flex items-stretch gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors relative",
        isUrgent && "bg-destructive/5"
      )}
    >
      <span className={cn("w-1 rounded-full shrink-0", col.dot)} aria-hidden />
      <div className="w-14 shrink-0 flex flex-col items-start justify-center pt-0.5">
        {time ? (
          <span
            className={cn(
              "text-sm font-semibold tabular-nums leading-none",
              isDone && "line-through text-muted-foreground"
            )}
          >
            {time}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {t("common.allDay")}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          {isUrgent && (
            <Flame className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
          )}
          <p
            className={cn(
              "text-sm font-semibold leading-snug",
              isDone && "line-through text-muted-foreground"
            )}
          >
            {task.title}
          </p>
        </div>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 break-words">
            {task.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-muted-foreground">
          {task.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {task.location}
            </span>
          )}
          {task.tags?.slice(0, 3).map((tag) => (
            <span key={tag} className="text-primary/80 font-medium">
              #{tag}
            </span>
          ))}
          {(task.tags?.length || 0) > 3 && (
            <span className="opacity-60">+{task.tags!.length - 3}</span>
          )}
        </div>
      </div>
    </button>
  );
});

/* ───── Week view side rail ─────────────────────────────────────── */

interface WeekRailProps {
  tasks: Task[];
  start: Date; // week start (Monday)
  end: Date; // exclusive end (next Monday)
  onPickEvent: (id: string) => void;
}

// Contextual companion to the week time-grid — fills what used to be empty
// space with info the grid DOESN'T surface well: a week-level progress
// summary and a scannable upcoming/this-week list. Concrete-date (one-off)
// events only, matching AgendaView's "events are the unit" model; recurring
// classes still render in the grid itself.
function WeekRail({ tasks, start, end, onPickEvent }: WeekRailProps) {
  const t = useT();
  const localeTag = useLocaleTag();
  const now = useTickingNow();

  const weekEvents = useMemo(() => {
    const s = start.getTime();
    const e = end.getTime();
    return tasks
      .filter((tk) => tk.deadline)
      .map((tk) => ({ tk, d: new Date(tk.deadline!) }))
      .filter(
        ({ d }) => !Number.isNaN(d.getTime()) && d.getTime() >= s && d.getTime() < e
      )
      .sort((a, b) => a.d.getTime() - b.d.getTime());
  }, [tasks, start, end]);

  const stats = useMemo(() => {
    const total = weekEvents.length;
    const done = weekEvents.filter(({ tk }) => tk.status === "done").length;
    const urgent = weekEvents.filter(
      ({ tk }) => tk.priority === "high" && tk.status !== "done"
    ).length;
    return { total, done, urgent, progress: total ? done / total : 0 };
  }, [weekEvents]);

  const isCurrentWeek =
    now.getTime() >= start.getTime() && now.getTime() < end.getTime();
  const list = useMemo(() => {
    const base = isCurrentWeek
      ? weekEvents.filter(
          ({ d, tk }) => d.getTime() >= now.getTime() && tk.status !== "done"
        )
      : weekEvents;
    return base.slice(0, 8);
  }, [weekEvents, isCurrentWeek, now]);

  return (
    <aside className="h-full lg:overflow-y-auto pr-1 space-y-3">
      <div className="rounded-xl border bg-card p-3.5">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          {t("calendar.weekSummary")}
        </p>
        <h3 className="text-2xl font-bold tracking-tight mt-0.5">
          {t("calendar.eventCount", { n: stats.total })}
        </h3>
        {stats.total > 0 ? (
          <>
            <div className="flex items-center justify-between text-xs mt-3">
              <span className="text-muted-foreground">
                {t("calendar.tasksComplete", { n: `${stats.done}/${stats.total}` })}
                {stats.urgent > 0 && (
                  <span className="ml-1.5 text-destructive font-semibold">
                    {t("calendar.urgentCount", { n: stats.urgent })}
                  </span>
                )}
              </span>
              <span className="font-bold tabular-nums">
                {Math.round(stats.progress * 100)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${stats.progress * 100}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">
            {t("calendar.weekEmpty")}
          </p>
        )}
      </div>

      {list.length > 0 && (
        <SidePanelCard
          icon={Clock}
          title={isCurrentWeek ? t("calendar.upcomingTitle") : t("calendar.weekEventsTitle")}
          count={list.length}
        >
          <div className="space-y-1.5">
            {list.map(({ tk, d }) => {
              const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
              const day = d.toLocaleDateString(localeTag, { weekday: "short" });
              const isDone = tk.status === "done";
              const color = subjectColor(tk.title);
              return (
                <button
                  key={tk.id}
                  onClick={() => onPickEvent(tk.id)}
                  className="w-full text-left px-2.5 py-2 rounded-lg flex items-center gap-2.5 border bg-background/40 hover:bg-accent transition-colors"
                >
                  <span className="w-11 shrink-0 leading-none">
                    <span className="block text-[10px] font-semibold capitalize text-muted-foreground">
                      {day}
                    </span>
                    <span className="block text-xs font-bold tabular-nums mt-0.5">
                      {time}
                    </span>
                  </span>
                  <span
                    className={cn("w-0.5 h-7 rounded-full shrink-0", color.dot)}
                  />
                  <span
                    className={cn(
                      "flex-1 min-w-0 text-sm font-medium leading-tight truncate",
                      isDone && "line-through text-muted-foreground"
                    )}
                  >
                    {tk.title}
                  </span>
                  {tk.priority === "high" && !isDone && (
                    <Flame className="h-3 w-3 text-destructive shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </SidePanelCard>
      )}
    </aside>
  );
}

/* ───── Day view side panel ─────────────────────────────────────── */

interface DaySidePanelProps {
  dateIso: string;
  tasks: Task[];
  onPickEvent: (id: string) => void;
  onCreate: (deadlineIso: string) => void;
}

function DaySidePanel({
  dateIso,
  tasks,
  onPickEvent,
  onCreate,
}: DaySidePanelProps) {
  const t = useT();
  const now = useTickingNow();

  const date = useMemo(() => {
    const d = new Date(dateIso);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [dateIso]);

  const dayTasks = useMemo(
    () => tasks.filter((t) => t.deadline?.slice(0, 10) === dateIso),
    [tasks, dateIso]
  );

  const timed = useMemo(
    () =>
      dayTasks.filter(
        (t) => t.deadline?.includes("T") && t.status !== "done"
      ),
    [dayTasks]
  );
  const untimed = useMemo(
    () =>
      dayTasks.filter(
        (t) => t.deadline && !t.deadline.includes("T") && t.status !== "done"
      ),
    [dayTasks]
  );

  const stats = useMemo(() => {
    const done = dayTasks.filter((t) => t.status === "done").length;
    const total = dayTasks.length;
    const urgent = dayTasks.filter(
      (t) => t.priority === "high" && t.status !== "done"
    ).length;
    return { done, total, urgent, progress: total ? done / total : 0 };
  }, [dayTasks]);

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const isPastDate =
    !isToday && date.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // Whole-day offset from today, in calendar days. UTC midnight comparison
  // avoids DST creep around the boundary. Drives DayHeroCard's contextual
  // label ("Hôm qua", "Ngày mai", "3 ngày sau", etc.).
  const daysFromToday = useMemo(() => {
    const a = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((a - b) / 86_400_000);
  }, [date, now]);

  const nextUp = useMemo(() => {
    if (!isToday) return null;
    const tNow = now.getTime();
    return [...timed]
      .filter((t) => new Date(t.deadline!).getTime() > tNow)
      .sort(
        (a, b) =>
          new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()
      )[0] ?? null;
  }, [timed, isToday, now]);

  // Past-time tasks today that user hasn't done. Hidden from "Next up" since
  // they're behind clock, but easy to miss on the timeline — surface them.
  const overdueToday = useMemo(() => {
    if (!isToday) return [];
    const tNow = now.getTime();
    return timed
      .filter(
        (t) =>
          t.status !== "done" && new Date(t.deadline!).getTime() < tNow
      )
      .sort(
        (a, b) =>
          new Date(b.deadline!).getTime() - new Date(a.deadline!).getTime()
      );
  }, [timed, isToday, now]);

  const freeSlots = useMemo(
    () => computeFreeSlots(timed, date, isToday, now).slice(0, 4),
    [timed, date, isToday, now]
  );

  // Sort timed tasks chronologically — same order the FC time-grid
  // would render them. This is the "full day schedule" used by the new
  // Lịch ngày section on mobile (where FC time-grid is hidden).
  const timedAll = useMemo(
    () =>
      [...dayTasks]
        .filter((t) => t.deadline?.includes("T"))
        .sort(
          (a, b) =>
            new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()
        ),
    [dayTasks]
  );

  return (
    <aside className="h-full lg:overflow-y-auto pr-1 space-y-3">
      <DayHeroCard
        date={date}
        isToday={isToday}
        daysFromToday={daysFromToday}
        stats={stats}
      />

      {/* Lịch ngày — full chronological list of timed tasks. Each row
          carries inline state: ring/tint highlight for "next up", red
          stripe + "X late" badge for overdue, strikethrough for done.
          Replaces the separate NextUp / OverdueToday cards on mobile so
          the user sees the entire day's flow in one scroll-able list
          rather than fragmented across multiple panels. */}
      {timedAll.length > 0 && (
        <SidePanelCard
          icon={Clock}
          title={t("calendar.dayScheduleTitle")}
          count={timedAll.length}
        >
          <div className="space-y-1.5">
            {timedAll.map((task) => {
              const time = task.deadline
                ? `${pad2(new Date(task.deadline).getHours())}:${pad2(new Date(task.deadline).getMinutes())}`
                : "";
              const isNext = nextUp?.id === task.id;
              const isLate = overdueToday.some((o) => o.id === task.id);
              const isDone = task.status === "done";
              const color = subjectColor(task.title);
              return (
                <button
                  key={task.id}
                  onClick={() => onPickEvent(task.id)}
                  className={cn(
                    "w-full text-left px-2.5 py-2 rounded-lg flex items-center gap-2.5 transition-colors",
                    "border bg-background/40 hover:bg-accent",
                    isNext &&
                      !isLate &&
                      "ring-2 ring-primary/30 border-primary/40 bg-primary/5 hover:bg-primary/10",
                    isLate && "ring-1 ring-destructive/40 border-destructive/40 bg-destructive/5",
                    isDone && "opacity-60"
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-bold tabular-nums w-10 shrink-0",
                      isLate && "text-destructive",
                      isNext && !isLate && "text-primary"
                    )}
                  >
                    {time}
                  </span>
                  <span
                    className={cn("w-0.5 h-7 rounded-full shrink-0", color.dot)}
                  />
                  <span
                    className={cn(
                      "flex-1 min-w-0 text-sm font-medium leading-tight truncate",
                      isDone && "line-through text-muted-foreground"
                    )}
                  >
                    {task.title}
                  </span>
                  {isLate && (
                    <span className="text-[10px] font-bold uppercase text-destructive shrink-0">
                      {t("dash.upnextOverdue")}
                    </span>
                  )}
                  {isNext && !isLate && (
                    <span className="text-[10px] font-bold uppercase text-primary shrink-0">
                      {t("dash.upnext")}
                    </span>
                  )}
                  {task.priority === "high" && !isDone && !isLate && !isNext && (
                    <Flame className="h-3 w-3 text-destructive shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </SidePanelCard>
      )}

      {untimed.length > 0 && (
        <SidePanelCard
          icon={Clock4}
          title={t("calendar.untimed")}
          count={untimed.length}
          hint={t("calendar.untimedHint")}
        >
          <div className="space-y-1">
            {untimed.map((task) => (
              <button
                key={task.id}
                onClick={() => onPickEvent(task.id)}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-sm hover:bg-accent transition-colors flex items-center gap-2"
              >
                <span
                  className={cn("h-1.5 w-1.5 rounded-full shrink-0", subjectColor(task.title).dot)}
                />
                <span className="truncate flex-1">{task.title}</span>
                {task.priority === "high" && (
                  <Flame className="h-3 w-3 text-destructive shrink-0" />
                )}
              </button>
            ))}
          </div>
        </SidePanelCard>
      )}

      {!isPastDate && stats.total > 0 && freeSlots.length > 0 && (
        <SidePanelCard
          icon={Coffee}
          title={t("calendar.freeSlots")}
          hint={isToday ? t("calendar.freeSlotsHint") : undefined}
        >
          <div className="space-y-1">
            {freeSlots.map((slot, i) => (
              <FreeSlotRow
                key={i}
                slot={slot}
                onSchedule={() =>
                  onCreate(toLocalIso(slot.start))
                }
              />
            ))}
          </div>
        </SidePanelCard>
      )}

      {stats.total === 0 && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          {t("calendar.dayEmptyTimeline")}
        </div>
      )}
    </aside>
  );
}

/* ───── Side panel sub-cards ────────────────────────────────────── */

interface DayHeroCardProps {
  date: Date;
  isToday: boolean;
  daysFromToday: number;
  stats: { done: number; total: number; urgent: number; progress: number };
}

function DayHeroCard({
  date,
  isToday,
  daysFromToday,
  stats,
}: DayHeroCardProps) {
  const t = useT();
  const localeTag = useLocaleTag();
  const weekday = date.toLocaleDateString(localeTag, { weekday: "long" });
  const main = date.toLocaleDateString(localeTag, {
    day: "numeric",
    month: "long",
  });

  // Contextual relative-time chip — adapts as user swipes / steps
  // through days. "Hôm nay", "Hôm qua", "Ngày mai", or "N ngày
  // trước/sau" for anything further out. The chip's tone shifts too:
  // primary for today, muted for past, foreground for future — so a
  // glance at the colour tells the user where they are in time.
  const relativeLabel = useMemo(() => {
    if (daysFromToday === 0) return t("calendar.relative.today");
    if (daysFromToday === -1) return t("calendar.relative.yesterday");
    if (daysFromToday === 1) return t("calendar.relative.tomorrow");
    if (daysFromToday < 0)
      return t("calendar.relative.daysAgo", { n: Math.abs(daysFromToday) });
    return t("calendar.relative.daysAhead", { n: daysFromToday });
  }, [daysFromToday, t]);
  const relativeTone = isToday
    ? "text-primary"
    : daysFromToday < 0
      ? "text-muted-foreground"
      : "text-foreground";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3.5",
        isToday && "border-primary/40 ring-1 ring-primary/30 bg-primary/5"
      )}
    >
      <p className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-2">
        <span className={isToday ? "text-primary" : "text-muted-foreground"}>
          {weekday}
        </span>
        <span className={cn("font-bold", relativeTone)}>· {relativeLabel}</span>
      </p>
      <h3 className="text-xl font-bold tracking-tight mt-0.5">{main}</h3>

      {stats.total > 0 ? (
        <>
          <div className="flex items-center justify-between text-xs mt-3">
            <span className="text-muted-foreground">
              {t("calendar.tasksComplete", { n: `${stats.done}/${stats.total}` })}
              {stats.urgent > 0 && (
                <span className="ml-1.5 text-destructive font-semibold">
                  {t("calendar.urgentCount", { n: stats.urgent })}
                </span>
              )}
            </span>
            <span className="font-bold tabular-nums">
              {Math.round(stats.progress * 100)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${stats.progress * 100}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground mt-2">
          {t("calendar.dayEmpty")}
        </p>
      )}
    </div>
  );
}

interface SidePanelCardProps {
  icon: typeof Clock;
  title: string;
  count?: number;
  hint?: string;
  variant?: "default" | "destructive";
  children: React.ReactNode;
}

function SidePanelCard({
  icon: Icon,
  title,
  count,
  hint,
  variant = "default",
  children,
}: SidePanelCardProps) {
  const destructive = variant === "destructive";
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3",
        destructive && "border-destructive/40 bg-destructive/5 ring-1 ring-destructive/20"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <p
          className={cn(
            "text-xs font-semibold inline-flex items-center gap-1.5",
            destructive && "text-destructive"
          )}
        >
          <Icon
            className={cn(
              "h-3.5 w-3.5",
              destructive ? "text-destructive" : "text-muted-foreground"
            )}
          />
          {title}
          {typeof count === "number" && (
            <span
              className={cn(
                "text-[10px] tabular-nums",
                destructive ? "text-destructive font-bold" : "text-muted-foreground"
              )}
            >
              ({count})
            </span>
          )}
        </p>
      </div>
      {children}
      {hint && (
        <p className="text-[10px] text-muted-foreground/80 mt-2 leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}

function FreeSlotRow({
  slot,
  onSchedule,
}: {
  slot: FreeSlot;
  onSchedule: () => void;
}) {
  const fmt = (d: Date) =>
    `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const minutes = Math.round((slot.end.getTime() - slot.start.getTime()) / 60_000);
  const durLabel =
    minutes >= 60
      ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}p` : ""}`
      : `${minutes}p`;
  return (
    <button
      onClick={onSchedule}
      className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-primary/5 transition-colors flex items-center gap-2 group"
    >
      <span className="text-sm font-semibold tabular-nums">
        {fmt(slot.start)} – {fmt(slot.end)}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {durLabel}
      </span>
      <Plus className="h-3 w-3 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

/* ───── Day helpers ─────────────────────────────────────────────── */

interface FreeSlot {
  start: Date;
  end: Date;
}

const FREE_WINDOW_START_H = 8;
const FREE_WINDOW_END_H = 21;
const FREE_MIN_MS = 30 * 60_000;
const DEFAULT_EVENT_MS = 60 * 60_000;

function computeFreeSlots(
  timedTasks: Task[],
  date: Date,
  isToday: boolean,
  now: Date = new Date()
): FreeSlot[] {
  const dayStart = new Date(date);
  dayStart.setHours(FREE_WINDOW_START_H, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(FREE_WINDOW_END_H, 0, 0, 0);

  // For today, skip past time so the suggestion is actionable.
  const cursorStart =
    isToday && now.getTime() > dayStart.getTime() ? now : dayStart;

  const events = timedTasks
    .filter((t) => t.deadline)
    .map((t) => {
      const s = new Date(t.deadline!);
      return { start: s, end: new Date(s.getTime() + DEFAULT_EVENT_MS) };
    })
    .filter((ev) => ev.end > cursorStart && ev.start < dayEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: FreeSlot[] = [];
  let cursor = cursorStart;
  for (const ev of events) {
    if (ev.start.getTime() - cursor.getTime() >= FREE_MIN_MS) {
      slots.push({ start: new Date(cursor), end: new Date(ev.start) });
    }
    if (ev.end > cursor) cursor = ev.end;
  }
  if (dayEnd.getTime() - cursor.getTime() >= FREE_MIN_MS) {
    slots.push({ start: new Date(cursor), end: dayEnd });
  }
  return slots;
}

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
