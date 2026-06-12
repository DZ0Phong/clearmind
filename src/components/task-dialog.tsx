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
  ChevronDown,
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
import { TagInput } from "@/components/tag-input";
import { VoiceMic } from "@/components/voice-mic";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  useTasks,
  type Task,
  type TaskType,
  type TaskPriority,
  type RecurrenceRule,
  type ReminderPref,
} from "@/hooks/use-tasks";
import { classifyTitle, parseNlDeadline, formatDeadline, cn } from "@/lib/utils";

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

const TYPE_OPTIONS: Array<{ value: TaskType; label: string; emoji: string }> = [
  { value: "academic", label: "Học tập", emoji: "🎓" },
  { value: "work", label: "Công việc", emoji: "💼" },
  { value: "personal", label: "Cá nhân", emoji: "✨" },
  { value: "other", label: "Khác", emoji: "📌" },
];

const PRIORITY_OPTIONS: Array<{
  value: TaskPriority;
  label: string;
  icon: typeof Flame;
  accent: string;
}> = [
  {
    value: "high",
    label: "Cao",
    icon: Flame,
    accent:
      "data-[active=true]:bg-destructive/15 data-[active=true]:text-destructive data-[active=true]:border-destructive/40",
  },
  {
    value: "medium",
    label: "Vừa",
    icon: AlertTriangle,
    accent:
      "data-[active=true]:bg-orange-500/15 data-[active=true]:text-orange-600 dark:data-[active=true]:text-orange-400 data-[active=true]:border-orange-500/40",
  },
  {
    value: "low",
    label: "Thấp",
    icon: CheckCircle2,
    accent:
      "data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:border-primary/40",
  },
];

export function TaskDialog(props: Mode) {
  const { addTask, updateTask } = useTasks();
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
      setNotifyAutoApplied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit]);

  const classification = useMemo(() => classifyTitle(title), [title]);
  useEffect(() => {
    if (!isEdit && !autoApplied && title.length > 6) {
      setType(classification.type);
      setPriority(classification.priority);
      setAutoApplied(true);
    }
  }, [title, classification, isEdit, autoApplied]);

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
              Quick Capture
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {isEdit ? "Chỉnh sửa task" : "Tạo task mới"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật thông tin chi tiết của task."
              : 'Gõ tự nhiên — Clearmind sẽ đoán loại + ưu tiên. Thử "thi Toán thứ 5 lúc 14h phòng A1.404".'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-2">
            {/* Title + Voice */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Tiêu đề
              </label>
              <div className="flex items-start gap-2 mt-1.5">
                <Input
                  autoFocus
                  placeholder="VD: Ôn thi Giải tích 2 — chương 3"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="flex-1 h-10"
                />
                <VoiceMic
                  onText={(t) =>
                    setTitle((prev) => (prev ? prev + " " + t : t))
                  }
                  className="h-10 w-10"
                />
              </div>
              {/* Classifier + NL parse preview */}
              {(title.length > 3 || nlHint) && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {title.length > 3 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                      <Sparkles className="h-3 w-3" />
                      {classification.type} · {classification.priority}
                    </span>
                  )}
                  {nlHint && (
                    <button
                      type="button"
                      onClick={applyNlHint}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                    >
                      <CalendarIcon className="h-3 w-3" />
                      Dùng "{formatDeadline(nlHint)}"
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Mô tả
              </label>
              <textarea
                placeholder="Chi tiết, link tài liệu, lưu ý… (không bắt buộc)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 min-h-[68px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs resize-y outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            {/* Type pills */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Loại
              </label>
              <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all",
                      type === opt.value
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "border-input bg-background hover:bg-accent/50 text-muted-foreground"
                    )}
                  >
                    <span className="text-base leading-none">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority pills */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Mức ưu tiên
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
                      onClick={() => setPriority(opt.value)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium transition-all",
                        opt.accent,
                        !active &&
                          "border-input bg-background hover:bg-accent/50 text-muted-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Deadline (picker) + Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" /> Deadline
                </label>
                <DateTimePicker
                  value={deadline}
                  onChange={setDeadline}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Vị trí / Phòng
                </label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="VD: A1.404, lab E3"
                  className="mt-1.5 h-9"
                />
              </div>
            </div>

            {/* Recurrence + reminder */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Repeat className="h-3 w-3" /> Lặp lại
                </label>
                <div className="relative mt-1.5">
                  <select
                    value={recurrence}
                    onChange={(e) =>
                      setRecurrence(e.target.value as RecurrenceRule | "")
                    }
                    className="w-full h-9 rounded-md border border-input bg-background pl-3 pr-8 text-sm shadow-xs appearance-none cursor-pointer outline-none transition-[color,box-shadow] hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <option value="">Không lặp</option>
                    <option value="daily">Hàng ngày</option>
                    <option value="weekday">Ngày làm việc (T2–T6)</option>
                    <option value="weekly">Hàng tuần</option>
                    <option value="monthly">Hàng tháng</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Bell className="h-3 w-3" /> Nhắc trước
                </label>
                <div className="relative mt-1.5">
                  <select
                    value={notify}
                    onChange={(e) =>
                      setNotify(e.target.value as ReminderPref | "")
                    }
                    className="w-full h-9 rounded-md border border-input bg-background pl-3 pr-8 text-sm shadow-xs appearance-none cursor-pointer outline-none transition-[color,box-shadow] hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <option value="">Không nhắc</option>
                    <option value="at-time">Đúng giờ</option>
                    <option value="5m">5 phút trước</option>
                    <option value="15m">15 phút trước</option>
                    <option value="1h">1 giờ trước</option>
                    <option value="1d">1 ngày trước</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            <NotifyPreview deadline={deadline} notify={notify} />

            {recurrence && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" /> Kết thúc lặp (tuỳ chọn)
                </label>
                <DateTimePicker
                  value={recurrenceEndAt}
                  onChange={setRecurrenceEndAt}
                  dateOnly
                  placeholder="Chọn ngày kết thúc"
                  className="mt-1.5"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Hữu ích cho lịch học theo học kỳ — sau ngày này không sinh
                  phiên mới.
                </p>
              </div>
            )}

            {/* Tags */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Tags
              </label>
              <TagInput value={tags} onChange={setTags} className="mt-1.5" />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {isEdit ? "Lưu thay đổi" : "Tạo task"}
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
  if (!notify || !deadline) return null;
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return null;
  const offset = NOTIFY_OFFSET_MS[notify];
  const fireAt = new Date(target.getTime() - offset);
  const inPast = fireAt.getTime() < Date.now();
  const fmt = `${fireAt.getHours().toString().padStart(2, "0")}:${fireAt
    .getMinutes()
    .toString()
    .padStart(2, "0")} ngày ${fireAt.getDate().toString().padStart(2, "0")}/${(fireAt.getMonth() + 1)
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
      {inPast ? `Đã qua giờ nhắc (${fmt}) — sẽ không bay toast.` : `Sẽ nhắc lúc ${fmt}`}
    </p>
  );
}
