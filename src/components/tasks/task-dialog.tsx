import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Sparkles,
  Calendar as CalendarIcon,
  Repeat,
  Bell,
  MapPin,
  Flame,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { TagInput } from "@/components/tasks/tag-input";
import { VoiceMic } from "@/components/tasks/voice-mic";
import { DateTimePicker } from "@/components/date-time-picker";
import { Select } from "@/components/ui/select";
import {
  useTasks,
  type Task,
  type TaskType,
  type TaskPriority,
  type RecurrenceRule,
  type ReminderPref,
} from "@/hooks/use-tasks";
import { classifyTitle, parseNlDeadline, suggestTags, cn } from "@/lib/utils";
import { useT, useDateFns } from "@/lib/i18n";

export interface CreatePrefill {
  deadline?: string; // local datetime "YYYY-MM-DDTHH:mm" or ISO
  type?: TaskType;
  title?: string;
  location?: string;
  tags?: string[];
}

type Mode =
  | {
      kind: "create";
      trigger?: React.ReactNode;
      defaultClassName?: string;
      open?: boolean;
      onOpenChange?: (b: boolean) => void;
      prefill?: CreatePrefill;
    }
  | {
      kind: "edit";
      task: Task;
      open: boolean;
      onOpenChange: (b: boolean) => void;
    };

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// Type/priority labels resolve through i18n at render time — see consumers
// below which read `t("type.${value}")` / `t("priority.${value}")`. The
// arrays only carry styling now (colors, icons, accents).
const TYPE_OPTIONS: Array<{ value: TaskType; color: string }> = [
  { value: "academic", color: "#6366f1" },
  { value: "work", color: "#f97316" },
  { value: "personal", color: "#10b981" },
  { value: "other", color: "#64748b" },
];

const PRIORITY_OPTIONS: Array<{
  value: TaskPriority;
  icon: typeof Flame;
  accent: string;
}> = [
  {
    value: "high",
    icon: Flame,
    accent:
      "data-[active=true]:bg-destructive/15 data-[active=true]:text-destructive data-[active=true]:border-destructive/40",
  },
  {
    value: "medium",
    icon: AlertTriangle,
    accent:
      "data-[active=true]:bg-orange-500/15 data-[active=true]:text-orange-600 dark:data-[active=true]:text-orange-400 data-[active=true]:border-orange-500/40",
  },
  {
    value: "low",
    icon: CheckCircle2,
    accent:
      "data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:border-primary/40",
  },
];

export function TaskDialog(props: Mode) {
  const { addTask, updateTask } = useTasks();
  const t = useT();
  const { formatDeadline } = useDateFns();
  const isEdit = props.kind === "edit";
  const existing = isEdit ? props.task : null;

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled =
    isEdit || (props.kind === "create" && props.open !== undefined);
  const open = isEdit
    ? props.open
    : props.open !== undefined
    ? props.open
    : internalOpen;
  const setOpen: (b: boolean) => void = isEdit
    ? props.onOpenChange
    : props.onOpenChange
    ? props.onOpenChange
    : setInternalOpen;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [deadline, setDeadline] = useState(toLocalInput(existing?.deadline));
  const [nlHint, setNlHint] = useState("");
  const [type, setType] = useState<TaskType>(existing?.type ?? "other");
  const [priority, setPriority] = useState<TaskPriority>(
    existing?.priority ?? "medium"
  );
  const [location, setLocation] = useState(existing?.location ?? "");
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | "">(
    existing?.recurrence ?? ""
  );
  const [recurrenceEndAt, setRecurrenceEndAt] = useState<string>(
    existing?.recurrenceEndAt ? existing.recurrenceEndAt.slice(0, 10) : ""
  );
  const [notify, setNotify] = useState<ReminderPref | "">(existing?.notify ?? "");
  const [autoApplied, setAutoApplied] = useState(false);
  // User clicked type/priority manually → never auto-override their choice.
  const [userPickedType, setUserPickedType] = useState(false);
  const [userPickedPriority, setUserPickedPriority] = useState(false);
  // Track whether we already auto-defaulted notify when a deadline appeared,
  // so we don't override a user who explicitly cleared it to "Không nhắc".
  const [notifyAutoApplied, setNotifyAutoApplied] = useState(false);

  // Reset on open (create mode) — apply prefill if provided
  const createPrefill = props.kind === "create" ? props.prefill : undefined;
  useEffect(() => {
    if (open && !isEdit) {
      setTitle(createPrefill?.title ?? "");
      setDescription("");
      setDeadline(createPrefill?.deadline ? toLocalInput(createPrefill.deadline) : "");
      setNlHint("");
      setType(createPrefill?.type ?? "other");
      setPriority("medium");
      setLocation(createPrefill?.location ?? "");
      setTags(createPrefill?.tags ?? []);
      setRecurrence("");
      setRecurrenceEndAt("");
      setNotify("");
      setAutoApplied(false);
      setUserPickedType(false);
      setUserPickedPriority(false);
      setNotifyAutoApplied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit]);

  const classification = useMemo(() => classifyTitle(title), [title]);
  useEffect(() => {
    if (!isEdit && !autoApplied && title.length > 6) {
      // Only push the classifier into fields the user hasn't manually set.
      if (!userPickedType) setType(classification.type);
      if (!userPickedPriority) setPriority(classification.priority);
      // Auto-suggest tag từ title + description: mã môn (PRN222 → prn222),
      // "bài tập" → bai-tap, "thi" → thi. Merge với tag user đã gõ, không
      // bao giờ xoá tag đã có.
      const suggested = suggestTags(title + " " + description, tags);
      if (suggested.length > tags.length) setTags(suggested);
      setAutoApplied(true);
    }
  }, [title, description, classification, isEdit, autoApplied, tags, userPickedType, userPickedPriority]);

  // NL deadline guess
  useEffect(() => {
    if (deadline) {
      setNlHint("");
      return;
    }
    const guess = parseNlDeadline(title + " " + description);
    if (guess) setNlHint(guess);
    else setNlHint("");
  }, [title, description, deadline]);

  // Auto-select "Đúng giờ" the FIRST time a deadline appears so users who
  // add a deadline get a reminder by default. After this fires once per
  // dialog session, manual edits (incl. clearing to "Không nhắc") are
  // respected — the flag prevents re-application.
  useEffect(() => {
    if (!isEdit && deadline && !notify && !notifyAutoApplied) {
      setNotify("at-time");
      setNotifyAutoApplied(true);
    }
  }, [deadline, notify, notifyAutoApplied, isEdit]);

  const applyNlHint = () => {
    if (!nlHint) return;
    setDeadline(toLocalInput(nlHint));
    setNlHint("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const isoDeadline = deadline
      ? new Date(deadline).toISOString()
      : nlHint || undefined;

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      priority,
      location: location.trim() || undefined,
      tags: tags.length ? tags : undefined,
      recurrence: (recurrence || null) as RecurrenceRule | null,
      recurrenceEndAt:
        recurrence && recurrenceEndAt
          ? new Date(recurrenceEndAt + "T23:59:59").toISOString()
          : null,
      notify: (notify || null) as ReminderPref | null,
    };

    if (isEdit && existing) {
      updateTask(existing.id, {
        ...payload,
        deadline: isoDeadline,
      });
    } else {
      addTask({
        ...payload,
        ...(isoDeadline ? { deadline: isoDeadline } : {}),
      });
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEdit && !isControlled && (
        <DialogTrigger asChild>
          {props.trigger ?? (
            <Button
              className={`h-14 rounded-xl shadow-sm hover:shadow-md transition-all gap-2 text-md font-medium ${
                props.defaultClassName ?? ""
              }`}
            >
              <Plus className="h-5 w-5" />
              {t("nav.quickCapture")}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] flex flex-col gap-0 p-0 cm-sheet-mobile">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {isEdit ? t("dialog.editTitle") : t("dialog.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? (t("dialog.editTitle") + ".")
              : (t("dialog.createTitle"))}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="grid gap-4 px-6 py-2 overflow-y-auto flex-1 min-h-0">
            {/* Title + Voice */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("dialog.label.title")}
              </label>
              <div className="flex items-start gap-2 mt-1.5">
                <Input
                  autoFocus
                  placeholder={t("dialog.placeholder.title")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="flex-1"
                />
                <VoiceMic
                  onText={(text, isFinal) => {
                    // Interim chunks repeat as user speaks — only commit on
                    // final to avoid stacking partial transcripts.
                    if (!isFinal) return;
                    const clean = text.trim();
                    if (!clean) return;
                    setTitle((prev) => (prev ? prev + " " + clean : clean));
                  }}
                />
              </div>
              {/* Classifier + NL parse preview — pill reflects ACTUAL state
                  (auto-applied or manually picked), not raw classifier guess. */}
              {(title.length > 3 || nlHint) && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {title.length > 3 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                      <Sparkles className="h-3 w-3" />
                      {t(`type.${type}`)} · {t(`priority.${priority}`)}
                    </span>
                  )}
                  {nlHint && (
                    <button
                      type="button"
                      onClick={applyNlHint}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                    >
                      <CalendarIcon className="h-3 w-3" />
                      {t("dialog.applyNl", { label: formatDeadline(nlHint) })}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("dialog.label.description")}
              </label>
              <AutoTextarea
                placeholder={t("dialog.placeholder.description")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 min-h-[68px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,height] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("dialog.label.type")}
              </label>
              <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                {TYPE_OPTIONS.map((opt) => {
                  const active = type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setType(opt.value);
                        setUserPickedType(true);
                      }}
                      className={cn(
                        "inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-colors",
                        active
                          ? "bg-accent border-input text-foreground"
                          : "border-input bg-background hover:bg-accent/50 text-muted-foreground"
                      )}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: opt.color, opacity: active ? 1 : 0.6 }}
                      />
                      {t(`type.${opt.value}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("dialog.label.priority")}
              </label>
              <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                {PRIORITY_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = priority === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      data-active={active}
                      onClick={() => {
                        setPriority(opt.value);
                        setUserPickedPriority(true);
                      }}
                      className={cn(
                        "flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium transition-all",
                        opt.accent,
                        !active &&
                          "border-input bg-background hover:bg-accent/50 text-muted-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t(`priority.${opt.value}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" /> {t("dialog.label.deadline")}
                </label>
                <DateTimePicker
                  value={deadline}
                  onChange={setDeadline}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {t("dialog.label.location")}
                </label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t("dialog.placeholder.location")}
                  className="mt-1.5 h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Repeat className="h-3 w-3" /> {t("dialog.label.recurrence")}
                </label>
                <div className="mt-1.5">
                  <Select
                    value={recurrence}
                    onChange={(v) => setRecurrence(v as RecurrenceRule | "")}
                    ariaLabel={t("dialog.label.recurrence")}
                    options={[
                      { value: "", label: t("recurrence.none") },
                      { value: "daily", label: t("recurrence.daily") },
                      { value: "weekday", label: t("recurrence.weekday") },
                      { value: "weekly", label: t("recurrence.weekly") },
                      { value: "monthly", label: t("recurrence.monthly") },
                    ]}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Bell className="h-3 w-3" /> {t("dialog.label.notify")}
                </label>
                <div className="mt-1.5">
                  <Select
                    value={notify}
                    onChange={(v) => setNotify(v as ReminderPref | "")}
                    ariaLabel={t("dialog.label.notify")}
                    options={[
                      { value: "", label: t("notify.none") },
                      { value: "at-time", label: t("notify.atTime") },
                      { value: "5m", label: t("notify.5m") },
                      { value: "15m", label: t("notify.15m") },
                      { value: "1h", label: t("notify.1h") },
                      { value: "1d", label: t("notify.1d") },
                    ]}
                  />
                </div>
              </div>
            </div>

            <NotifyPreview deadline={deadline} notify={notify} />

            {recurrence && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" /> {t("dialog.recurrenceEnd")}
                </label>
                <DateTimePicker
                  value={recurrenceEndAt}
                  onChange={setRecurrenceEndAt}
                  dateOnly
                  placeholder={t("dialog.recurrenceEndPicker")}
                  className="mt-1.5"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t("dialog.recurrenceEndHint")}
                </p>
              </div>
            )}

            {/* Tags */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("nav.tags")}
              </label>
              <TagInput value={tags} onChange={setTags} className="mt-1.5" />
            </div>
          </div>
          <DialogFooter className="gap-2 px-6 py-4 border-t bg-background shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {isEdit ? t("dialog.saveChanges") : t("dialog.createTask")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function QuickCapture({ className }: { className?: string }) {
  return <TaskDialog kind="create" defaultClassName={className} />;
}

const NOTIFY_OFFSET_MS: Record<ReminderPref, number> = {
  "at-time": 0,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

/**
 * Live preview under the "Nhắc trước" select. Shows exactly when the toast
 * will fire — or flags it red if deadline−offset is already in the past
 * (so the user knows changing notify won't help unless they push the
 * deadline forward).
 */
function NotifyPreview({
  deadline,
  notify,
}: {
  deadline: string;
  notify: ReminderPref | "";
}) {
  const t = useT();
  if (!notify || !deadline) return null;
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return null;
  const offset = NOTIFY_OFFSET_MS[notify];
  const fireAt = new Date(target.getTime() - offset);
  const inPast = fireAt.getTime() < Date.now();
  const time = `${fireAt.getHours().toString().padStart(2, "0")}:${fireAt
    .getMinutes()
    .toString()
    .padStart(2, "0")} ${t("dialog.notifyDay")} ${fireAt.getDate().toString().padStart(2, "0")}/${(fireAt.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
  return (
    <p
      className={cn(
        "text-[11px] flex items-center gap-1.5",
        inPast ? "text-destructive font-medium" : "text-muted-foreground"
      )}
    >
      <Bell className="h-3 w-3" />
      {inPast
        ? t("dialog.notifyPastHint", { time })
        : t("dialog.notifyPreview", { time })}
    </p>
  );
}
