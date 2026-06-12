import { memo, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTickingNow } from "@/lib/use-ticking-now";
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
  AlertCircle,
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
  Flame,
  Hash,
  List,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HomeworkDialog } from "@/components/homework-dialog";
import { useTaskCommands } from "@/components/task-commands";
import { useTasks, type Task, type TaskType } from "@/hooks/use-tasks";
import {
  cn,
  extractTimeLabel,
  formatDeadline,
  subjectColor,
  tagStats,
} from "@/lib/utils";
import { useT, useI18n, useLocaleTag } from "@/lib/i18n";

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

const pad = (n: number) => n.toString().padStart(2, "0");
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Academic events vary by subject; everything else uses its fixed type color.
function eventColor(task: Task): string {
  if (task.status === "done") return "var(--muted)";
  if (task.type === "academic") return subjectColor(task.title).raw;
  return TYPE_COLOR[task.type];
}

function loadStoredView(): ViewMode {
  if (typeof window === "undefined") return "week";
  const v = localStorage.getItem(VIEW_STORAGE_KEY);
  return v === "month" || v === "week" || v === "day" || v === "agenda"
    ? v
    : "week";
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
  view: { type: string };
}

/* ───── Main component ──────────────────────────────────────────── */

export function CalendarView({ initialDate }: CalendarViewProps = {}) {
  const { tasks, updateTask, removeTask, snoozeTask } = useTasks();
  const { openEdit, openCreate } = useTaskCommands();
  const navigate = useNavigate();
  const t = useT();
  const { lang } = useI18n();
  // FullCalendar locale: 'vi' for Vietnamese (day names, month titles,
  // "X giờ" hour suffix, "8 – 14 thg 6" range); 'en-gb' for neutral
  // English (Mon-start week, 24h time, "8 – 14 Jun" range).
  const fcLocale = lang === "en" ? "en-gb" : "vi";

  const [view, setView] = useState<ViewMode>(loadStoredView);
  const [hiddenTypes, setHiddenTypes] = useState<Set<TaskType>>(new Set());
  const [hideDone, setHideDone] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [homeworkParent, setHomeworkParent] = useState<string | null>(null);
  // Tracks the day currently shown by timeGridDay so the side panel stays in sync.
  const [dayDateIso, setDayDateIso] = useState<string>(
    () => initialDate ?? dayKey(new Date())
  );

  const persistView = (v: ViewMode) => {
    setView(v);
    localStorage.setItem(VIEW_STORAGE_KEY, v);
  };

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

  const filteredTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.deadline &&
          !hiddenTypes.has(t.type) &&
          !(hideDone && t.status === "done") &&
          (!activeTag || (t.tags || []).includes(activeTag))
      ),
    [tasks, hiddenTypes, hideDone, activeTag]
  );

  const fcEvents = useMemo(
    () =>
      filteredTasks.map((t) => {
        const color = eventColor(t);
        // Chip tint mạnh hơn (mix 24% với background) — không bị "chìm".
        // textColor = màu chủ đề (đọc rõ trên tint cùng tông).
        const bg = `color-mix(in srgb, ${color} 24%, var(--background))`;
        return {
          id: t.id,
          title: t.title,
          start: t.deadline,
          allDay: t.deadline ? !t.deadline.includes("T") : true,
          backgroundColor: bg,
          borderColor: color,
          textColor: color,
          extendedProps: {
            type: t.type,
            priority: t.priority,
            status: t.status,
            location: t.location,
            description: t.description,
            tags: t.tags,
            recurrence: t.recurrence ?? null,
          },
        };
      }),
    [filteredTasks]
  );

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
    if (info.view.type !== "timeGridDay") return;
    const iso = info.startStr.slice(0, 10);
    if (iso !== dayDateIso) setDayDateIso(iso);
  };

  const createForSelectedDate = () => {
    if (!selectedDate) return;
    const iso = `${selectedDate}T09:00`;
    setSelectedDate(null);
    setTimeout(() => openCreate({ deadline: iso }), 50);
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

  /* ----- Render ------------------------------------------------- */

  return (
    <div className="h-full w-full flex flex-col gap-3">
      <CalendarToolbar
        view={view}
        onViewChange={persistView}
        hiddenTypes={hiddenTypes}
        onToggleType={toggleType}
        hideDone={hideDone}
        onToggleDone={() => setHideDone((v) => !v)}
      />

      {topTags.length > 0 && (
        <TagFilterRow
          tags={topTags.map((s) => ({ name: s.name, count: s.openCount }))}
          active={activeTag}
          onPick={setActiveTag}
        />
      )}

      <div className="flex-1 min-h-0">
        {view === "agenda" ? (
          <AgendaView
            tasks={filteredTasks}
            anchorDate={initialDate ?? dayKey(new Date())}
            onPickEvent={setSelectedEventId}
            onCreate={(iso) => openCreate({ deadline: iso })}
          />
        ) : view === "day" ? (
          <div className="h-full grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4 min-h-0">
            <div className="min-h-0 lg:order-1 order-2">
              <FullCalendar
                key={`day-${fcLocale}`}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="timeGridDay"
                initialDate={initialDate}
                locales={[enGbLocale, viLocale]}
                locale={fcLocale}
                firstDay={1}
                buttonText={{ today: t("calendar.today") }}
                headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
                events={fcEvents}
                height="100%"
                expandRows
                stickyHeaderDates
                nowIndicator
                slotMinTime="06:00:00"
                slotMaxTime="22:00:00"
                scrollTime="07:00:00"
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
            </div>
            <div className="lg:order-2 order-1 lg:min-h-0">
              <DaySidePanel
                dateIso={dayDateIso}
                tasks={filteredTasks}
                onPickEvent={setSelectedEventId}
                onCreate={(iso) => openCreate({ deadline: iso })}
              />
            </div>
          </div>
        ) : (
          <FullCalendar
            key={`${view}-${fcLocale}`}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={FC_VIEW[view as Exclude<ViewMode, "agenda">]}
            initialDate={initialDate}
            locales={[enGbLocale, viLocale]}
            locale={fcLocale}
            firstDay={1}
            buttonText={{ today: t("calendar.today") }}
            allDayText={t("common.allDay")}
            headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
            events={fcEvents}
            height="100%"
            expandRows
            stickyHeaderDates
            nowIndicator
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            scrollTime="07:00:00"
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
            dayMaxEvents={view === "month" ? 3 : false}
            moreLinkText={(n) => t("calendar.moreLinkText", { n })}
            eventContent={renderFcEvent}
          />
        )}
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
    </div>
  );
}

/* ───── Toolbar (view switcher + type filters) ──────────────────── */

interface CalendarToolbarProps {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  hiddenTypes: Set<TaskType>;
  onToggleType: (t: TaskType) => void;
  hideDone: boolean;
  onToggleDone: () => void;
}

function CalendarToolbar({
  view,
  onViewChange,
  hiddenTypes,
  onToggleType,
  hideDone,
  onToggleDone,
}: CalendarToolbarProps) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 shrink-0">
      <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
        {VIEWS.map(({ key, labelKey, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onViewChange(key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              view === key
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-1 flex-wrap">
        {(Object.keys(TYPE_COLOR) as TaskType[]).map((typeKey) => {
          const hidden = hiddenTypes.has(typeKey);
          const label = t(`type.${typeKey}`);
          return (
            <button
              key={typeKey}
              onClick={() => onToggleType(typeKey)}
              title={
                hidden
                  ? t("calendar.showType", { label })
                  : t("calendar.hideType", { label })
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors",
                hidden
                  ? "border-input text-muted-foreground/60 line-through bg-transparent"
                  : "border-input bg-background hover:bg-accent text-foreground"
              )}
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
          onClick={onToggleDone}
          title={t("calendar.hideDoneTitle")}
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ml-1",
            hideDone
              ? "border-input text-muted-foreground bg-muted"
              : "border-input text-muted-foreground/70 bg-background hover:bg-accent"
          )}
        >
          {t("calendar.hideDone")}
        </button>
      </div>
    </div>
  );
}

/* ───── Tag filter row ──────────────────────────────────────────── */

interface TagFilterRowProps {
  tags: Array<{ name: string; count: number }>;
  active: string | null;
  onPick: (t: string | null) => void;
}

function TagFilterRow({ tags, active, onPick }: TagFilterRowProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap shrink-0 text-xs">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1 inline-flex items-center gap-1">
        <Hash className="h-3 w-3" /> Tag
      </span>
      {active && (
        <button
          onClick={() => onPick(null)}
          className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2.5 py-1 font-medium hover:bg-primary/90 transition-colors"
        >
          #{active} ×
        </button>
      )}
      {tags
        .filter((t) => t.name !== active)
        .map((t) => (
          <button
            key={t.name}
            onClick={() => onPick(t.name)}
            className="inline-flex items-center gap-1 rounded-full border bg-background hover:border-primary/40 hover:bg-primary/5 hover:text-primary px-2.5 py-1 font-medium text-muted-foreground transition-colors"
          >
            #{t.name}
            <span className="text-[10px] tabular-nums opacity-60">
              {t.count}
            </span>
          </button>
        ))}
    </div>
  );
}

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
  return (
    <Dialog open={open} onOpenChange={(b) => !b && onClose()}>
      <DialogContent className="sm:max-w-[460px] max-h-[92vh] flex flex-col gap-0 p-0">
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
      <DialogContent className="sm:max-w-[460px] max-h-[92vh] flex flex-col gap-0 p-0">
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
  anchorDate: string;
  onPickEvent: (id: string) => void;
  onCreate: (deadlineIso: string) => void;
}

function AgendaView({
  tasks,
  anchorDate,
  onPickEvent,
  onCreate,
}: AgendaViewProps) {
  const t = useT();
  const localeTag = useLocaleTag();
  // Window of 14 days, paged by ±14 from the anchor week's Monday.
  const [offset, setOffset] = useState(0);

  const start = useMemo(() => {
    const d = new Date(anchorDate || new Date());
    if (Number.isNaN(d.getTime())) return new Date();
    const diff = (d.getDay() + 6) % 7; // back to Monday
    d.setDate(d.getDate() - diff + offset * 14);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [anchorDate, offset]);

  const days = useMemo(() => {
    const out: Array<{ date: Date; iso: string; items: Task[] }> = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = dayKey(d);
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
  }, [start, tasks]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayK = dayKey(today);
  const total = days.reduce((n, d) => n + d.items.length, 0);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setOffset((o) => o - 1)}
            title={t("calendar.prev14days")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(0)}
          >
            {t("calendar.today")}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setOffset((o) => o + 1)}
            title={t("calendar.next14days")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm font-semibold text-foreground/80">
          {start.toLocaleDateString(localeTag, { day: "2-digit", month: "short" })}{" "}
          —{" "}
          {days[13]?.date.toLocaleDateString(localeTag, {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            {t("calendar.eventCount", { n: total })}
          </span>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
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
      </div>
    </div>
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

  return (
    <aside className="h-full lg:overflow-y-auto pr-1 space-y-3">
      <DayHeroCard
        date={date}
        isToday={isToday}
        stats={stats}
      />

      {overdueToday.length > 0 && (
        <SidePanelCard
          icon={AlertCircle}
          title={t("calendar.overdueTitle")}
          count={overdueToday.length}
          variant="destructive"
          hint={t("calendar.overdueHint")}
        >
          <div className="space-y-1">
            {overdueToday.map((task) => {
              const tMs = new Date(task.deadline!).getTime();
              const diffMin = Math.max(1, Math.floor((now.getTime() - tMs) / 60_000));
              const ago =
                diffMin < 60
                  ? `${diffMin}p`
                  : `${Math.floor(diffMin / 60)}h${diffMin % 60 ? ` ${diffMin % 60}p` : ""}`;
              return (
                <button
                  key={task.id}
                  onClick={() => onPickEvent(task.id)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-sm hover:bg-destructive/10 transition-colors flex items-center gap-2"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      subjectColor(task.title).dot
                    )}
                  />
                  <span className="truncate flex-1">{task.title}</span>
                  <span className="text-[10px] font-semibold text-destructive tabular-nums shrink-0">
                    {t("tasks.lateBy", { time: ago })}
                  </span>
                </button>
              );
            })}
          </div>
        </SidePanelCard>
      )}

      {nextUp && <NextUpCard task={nextUp} onPick={() => onPickEvent(nextUp.id)} />}

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
  stats: { done: number; total: number; urgent: number; progress: number };
}

function DayHeroCard({ date, isToday, stats }: DayHeroCardProps) {
  const t = useT();
  const localeTag = useLocaleTag();
  const weekday = date.toLocaleDateString(localeTag, { weekday: "long" });
  const main = date.toLocaleDateString(localeTag, {
    day: "numeric",
    month: "long",
  });
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3.5",
        isToday && "border-primary/40 ring-1 ring-primary/30 bg-primary/5"
      )}
    >
      <p
        className={cn(
          "text-[10px] uppercase tracking-wider font-semibold",
          isToday ? "text-primary" : "text-muted-foreground"
        )}
      >
        {weekday}
        {isToday && t("calendar.todayBadge")}
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

function NextUpCard({ task, onPick }: { task: Task; onPick: () => void }) {
  const t = useT();
  const now = useTickingNow();
  const start = new Date(task.deadline!);
  const time = extractTimeLabel(task.deadline);
  return (
    <button
      onClick={onPick}
      className="w-full text-left rounded-xl border bg-card p-3.5 hover:bg-accent/40 hover:border-primary/30 transition-all group"
    >
      <p className="text-[10px] uppercase tracking-wider font-semibold text-primary inline-flex items-center gap-1">
        <Zap className="h-3 w-3" /> {t("calendar.nextUp")}
      </p>
      <p className="font-semibold mt-1 leading-snug">{task.title}</p>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
        <span className="font-medium tabular-nums">{time}</span>
        <span>·</span>
        <span className="text-primary font-medium">{countdown(start, now, t)}</span>
        {task.location && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3" /> {task.location}
            </span>
          </>
        )}
      </div>
    </button>
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

function countdown(
  target: Date,
  now: Date,
  t: ReturnType<typeof useT>
): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return t("calendar.happening");
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return t("calendar.countdownMin", { n: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return t("calendar.countdownHourMin", { h, m });
  return t("calendar.countdownDays", { n: Math.round(h / 24) });
}

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
