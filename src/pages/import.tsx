import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Task } from "@/hooks/use-tasks";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/date-time-picker";
import { useTasks } from "@/hooks/use-tasks";
import { useToast } from "@/components/toast";
import {
  parseAny,
  parseICS,
  parseTimetableHTML,
  detectKind,
  computeFirstOccurrenceISO,
  type ParsedClass,
} from "@/lib/schedule-parser";
import {
  Upload,
  Bookmark,
  ClipboardPaste,
  CalendarPlus,
  CheckCircle2,
  Sparkles,
  Copy,
  Check,
  MapPin,
  Clock,
  AlertCircle,
  X,
  CalendarRange,
  Info,
  MousePointer2,
  Globe,
  Wand2,
  HelpCircle,
} from "lucide-react";
import { cn, extractSubjectCode } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { buildBookmarklet, getBookmarkletBody } from "@/lib/bookmarklet";
import { useT } from "@/lib/i18n";

type Tab = "paste" | "bookmarklet" | "ics";

// NOTE: SAMPLE_TEXT is intentionally Vietnamese — it mimics the timetable text
// a user would actually paste from a Vietnamese school portal. It feeds the
// parser as test input, NOT the UI, so leave it as-is regardless of UI locale.
const SAMPLE_TEXT = `Thứ 2
07:00 - 09:30  Giải tích 2          A1.404  Thầy Nguyễn Văn A
09:35 - 11:30  Vật lý đại cương     B2.305  Cô Lê Thị B
Thứ 4
13:00 - 15:30  Lập trình hướng đối tượng  Lab C3.501  Thầy Trần C
Thứ 6
07:00 - 09:30  Tiếng Anh chuyên ngành  D4.201  Cô Phạm D`;

// Slot signature for a weekly class = subject-code (or title) + dow + time.
// Identifies the RECURRING SCHEDULE (Thu 12:50 PRU213), regardless of week.
// One weekly task in the store = one slot, no matter how many weeks it spans.
function classSignature(title: string, dow: number, startTime: string): string {
  const code = extractSubjectCode(title);
  const key = code ? code.toLowerCase() : title.trim().toLowerCase();
  return `w|${dow}|${startTime}|${key}`;
}

// One-off event signature = date + time + title-key. Two events at the same
// time on different days are different. Two events same time, same day, same
// title = duplicate (e.g. user re-pastes same WC fixture list).
function eventSignature(title: string, dateYmd: string, startTime: string): string {
  const code = extractSubjectCode(title);
  const key = code ? code.toLowerCase() : title.trim().toLowerCase();
  return `e|${dateYmd}|${startTime}|${key}`;
}

/**
 * Slot signature for an existing weekly task. Returns null if:
 *   - task is not weekly-recurring
 *   - task's recurrenceEndAt has already passed (old semester — treat as
 *     "no longer covering this slot" so a fresh import creates new tasks
 *     for the new term)
 */
function taskSlotSignature(t: {
  title: string;
  deadline?: string;
  recurrence?: string | null;
  recurrenceEndAt?: string | null;
}): string | null {
  if (t.recurrence !== "weekly" || !t.deadline) return null;
  if (t.recurrenceEndAt) {
    const endAt = new Date(t.recurrenceEndAt).getTime();
    if (!Number.isNaN(endAt) && endAt < Date.now()) return null;
  }
  const d = new Date(t.deadline);
  if (Number.isNaN(d.getTime())) return null;
  const dow = d.getDay();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return classSignature(t.title, dow, `${hh}:${mm}`);
}

/**
 * Per-event signature for non-recurring tasks. Used by the one-off event
 * importer (sports fixtures, single meetings) to detect "đã có".
 */
function taskEventSignature(t: {
  title: string;
  deadline?: string;
  recurrence?: string | null;
}): string | null {
  if (t.recurrence || !t.deadline) return null;
  const d = new Date(t.deadline);
  if (Number.isNaN(d.getTime())) return null;
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return eventSignature(t.title, t.deadline.slice(0, 10), `${hh}:${mm}`);
}

function parsedSlotSignature(c: ParsedClass): string {
  return classSignature(c.subject, c.dayOfWeek, c.startTime);
}

function parsedEventSignature(c: ParsedClass): string {
  const iso = computeFirstOccurrenceISO(c);
  return eventSignature(c.subject, iso.slice(0, 10), c.startTime);
}

type RowKind = "new" | "exact" | "changed";
interface FieldChange { field: "location" | "endTime"; from: string; to: string }
interface RowMeta { kind: RowKind; existingId?: string; changes?: FieldChange[] }

function parseExistingEndTime(t: Task): string {
  const m = t.description?.match(/Kết thúc:\s*(\d{2}:\d{2})/);
  return m ? m[1] : "";
}

function diffParsedAgainst(c: ParsedClass, existing: Task): FieldChange[] {
  const out: FieldChange[] = [];
  const newLoc = (c.location || "").trim();
  const oldLoc = (existing.location || "").trim();
  if (newLoc.toLowerCase() !== oldLoc.toLowerCase()) {
    out.push({ field: "location", from: oldLoc || "—", to: newLoc || "—" });
  }
  const newEnd = (c.endTime || "").trim();
  const oldEnd = parseExistingEndTime(existing);
  if (newEnd && newEnd !== oldEnd) {
    out.push({ field: "endTime", from: oldEnd || "—", to: newEnd });
  }
  return out;
}

// Translated weekday names — replaces DOW_LABEL_VI which was VN-only.
// Index matches Date.getDay(): 0 = Sunday … 6 = Saturday. We pass through
// the existing short keys (review.dow.*) since import preview rows are
// dense and read better with compact labels.
const DOW_I18N_KEYS = [
  "review.dow.sun",
  "review.dow.mon",
  "review.dow.tue",
  "review.dow.wed",
  "review.dow.thu",
  "review.dow.fri",
  "review.dow.sat",
];

export function ImportPage() {
  const { addTask, updateTask, removeTask, tasks } = useTasks();
  const { toast } = useToast();
  const navigate = useNavigate();
  const t = useT();
  const dowLabel = (dow: number) => t(DOW_I18N_KEYS[dow] ?? "review.dow.sun");
  const [tab, setTab] = useState<Tab>("paste");
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedClass[]>([]);
  const [semesterEnd, setSemesterEnd] = useState<string>("");
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---- Hash-based handoff from bookmarklet -----------------------------
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const paste = params.get("paste");
    const tables = parseInt(params.get("tables") || "0", 10);
    const frames = parseInt(params.get("frames") || "0", 10);
    const score = parseInt(params.get("score") || "0", 10);
    if (!paste) return;

    try {
      setRaw(paste);
      setTab("paste");
      const items = parseAny(paste);
      setParsed(items);
      history.replaceState(null, "", window.location.pathname);

      if (items.length > 0) {
        const attCount = items.filter((c) => c.attended).length;
        const realCount = items.length - attCount;
        const attSuffix =
          attCount > 0 ? t("import.toast.attSuffix", { n: attCount }) : "";
        toast({
          title: t("import.toast.detectedClasses.title", { n: realCount, suffix: attSuffix }),
          description: t("import.toast.detectedClasses.desc"),
          variant: "success",
        });
      } else if (tables === 0) {
        toast({
          title: t("import.toast.noTables.title"),
          description: t("import.toast.noTables.desc", { n: frames }),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("import.toast.parseFailed.title", { n: tables }),
          description: t("import.toast.parseFailed.desc", { score }),
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: t("import.toast.bmReceiveErr.title"),
        description: String(e),
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Parse on demand --------------------------------------------------
  const handleParse = () => {
    const items = parseAny(raw);
    setParsed(items);
    if (!items.length) {
      toast({
        title: t("import.toast.noSchedule.title"),
        description: t("import.toast.noSchedule.desc"),
        variant: "destructive",
      });
    }
  };

  // Smart paste: capture HTML if available
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (html && html.includes("<")) {
      e.preventDefault();
      setRaw(html);
      setTimeout(() => {
        const items = parseTimetableHTML(html);
        if (items.length) {
          setParsed(items);
          toast({
            title: t("import.toast.htmlDetected.title", { n: items.length }),
            description: t("import.toast.htmlDetected.desc"),
            variant: "success",
          });
        }
      }, 50);
    }
  };

  // ---- ICS file upload --------------------------------------------------
  const handleIcsFile = async (file: File) => {
    const text = await file.text();
    setRaw(text);
    const items = parseICS(text);
    setParsed(items);
    if (items.length) {
      toast({
        title: t("import.toast.icsRead.title", { n: items.length }),
        description: t("import.toast.icsRead.desc", { name: file.name }),
        variant: "success",
      });
    } else {
      toast({
        title: t("import.toast.icsInvalid.title"),
        variant: "destructive",
      });
    }
  };

  // ---- Bookmarklet generation ------------------------------------------
  const bookmarklet = useMemo(() => buildBookmarklet(window.location.origin), []);

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setBookmarkletCopied(true);
      setTimeout(() => setBookmarkletCopied(false), 2000);
    } catch {
      toast({ title: t("import.toast.copyFailed.title"), variant: "destructive" });
    }
  };

  // ---- Per-row classification (new / exact / changed) -------------------
  // Two indexes:
  //   1. existingBySlot — weekly recurring tasks keyed by SLOT (subject-code
  //      + dow + time). A weekly task owns its slot indefinitely; re-importing
  //      the same school timetable should always find it and skip, not create
  //      a second copy at last-week's date (the original duplicate bug).
  //   2. existingByEvent — non-recurring tasks keyed by exact (date, time,
  //      title). Used for one-off events (WC fixtures, single calendar
  //      invites) so the user doesn't double-import them.
  const existingBySlot = useMemo(() => {
    const m = new Map<string, Task>();
    for (const task of tasks) {
      const sig = taskSlotSignature(task);
      if (sig) m.set(sig, task);
    }
    return m;
  }, [tasks]);

  const existingByEvent = useMemo(() => {
    const m = new Map<string, Task>();
    for (const task of tasks) {
      const sig = taskEventSignature(task);
      if (sig) m.set(sig, task);
    }
    return m;
  }, [tasks]);

  const rowMetas = useMemo(() => {
    const out: Record<string, RowMeta> = {};
    for (const c of parsed) {
      const sig = c.oneOff ? parsedEventSignature(c) : parsedSlotSignature(c);
      const existing = c.oneOff
        ? existingByEvent.get(sig)
        : existingBySlot.get(sig);
      if (!existing) {
        out[c.id] = { kind: "new" };
        continue;
      }
      const changes = diffParsedAgainst(c, existing);
      out[c.id] = changes.length === 0
        ? { kind: "exact", existingId: existing.id }
        : { kind: "changed", existingId: existing.id, changes };
    }
    return out;
  }, [parsed, existingBySlot, existingByEvent]);

  // All existing weekly tasks whose subject appears in the recurring portion
  // of the import. Used for (a) displaced-slot detection and (b) the explicit
  // wipe mode. One-off events don't participate — they're per-event, not
  // per-slot, so "affected" doesn't apply.
  const affectedExisting = useMemo(() => {
    const recurringParsed = parsed.filter((c) => !c.oneOff);
    if (!recurringParsed.length) return [] as Task[];
    const importSubjects = new Set<string>();
    for (const c of recurringParsed) {
      const code = extractSubjectCode(c.subject);
      if (code) importSubjects.add(code.toLowerCase());
    }
    return tasks.filter((task) => {
      if (task.recurrence !== "weekly" || !task.deadline) return false;
      const code = extractSubjectCode(task.title);
      return !!code && importSubjects.has(code.toLowerCase());
    });
  }, [parsed, tasks]);

  // Subset of affectedExisting whose (subject, dow, startTime) signature is
  // NOT in the parsed import — the school moved that subject to a different
  // slot. Removed automatically on normal import so old slots stop spawning.
  const displacedExisting = useMemo(() => {
    if (!affectedExisting.length) return [] as Task[];
    const importSigs = new Set<string>();
    for (const c of parsed) {
      if (c.oneOff) continue;
      const code = extractSubjectCode(c.subject);
      if (!code) continue;
      importSigs.add(`${code.toLowerCase()}|${c.dayOfWeek}|${c.startTime}`);
    }
    return affectedExisting.filter((task) => {
      const code = extractSubjectCode(task.title)!.toLowerCase();
      const d = new Date(task.deadline!);
      const dow = d.getDay();
      const hh = d.getHours().toString().padStart(2, "0");
      const mm = d.getMinutes().toString().padStart(2, "0");
      return !importSigs.has(`${code}|${dow}|${hh}:${mm}`);
    });
  }, [affectedExisting, parsed]);

  // Wipe mode: when true, commitImport deletes ALL affectedExisting (even
  // exact-match recurring tasks) and re-creates every parsed entry as new.
  // For users who want to discard old recurring tasks completely and treat
  // the school timetable as the single source of truth.
  const [wipeMode, setWipeMode] = useState(false);

  // Per-row decision for "changed" rows. true = skip update; default = update.
  const [skipChangedIds, setSkipChangedIds] = useState<Set<string>>(new Set());
  const toggleSkipChanged = (id: string) =>
    setSkipChangedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- Commit import ----------------------------------------------------
  const importable = useMemo(() => parsed.filter((c) => !c.attended), [parsed]);
  const skippedAttended = parsed.length - importable.length;

  const previewSummary = useMemo(() => {
    let news = 0, exact = 0, changed = 0;
    for (const c of importable) {
      const m = rowMetas[c.id];
      if (!m) continue;
      if (m.kind === "new") news++;
      else if (m.kind === "exact") exact++;
      else if (m.kind === "changed") changed++;
    }
    return { news, exact, changed };
  }, [importable, rowMetas]);

  const commitImport = () => {
    if (!importable.length) return;
    const semesterEndIso = semesterEnd
      ? new Date(semesterEnd + "T23:59:59").toISOString()
      : undefined;

    let added = 0;
    let updated = 0;
    let exactSkipped = 0;
    let userSkipped = 0;
    let displaced = 0;
    const actuallyAdded: ParsedClass[] = [];

    // Phase 1: delete recurring tasks the import is going to supersede.
    // - Wipe mode: every weekly task whose subject is in the import (clean slate).
    // - Normal mode: only those whose slot was moved (subject in import,
    //   exact dow/time signature not).
    const toDelete = wipeMode ? affectedExisting : displacedExisting;
    for (const task of toDelete) {
      removeTask(task.id);
      displaced++;
    }
    // In wipe mode, treat every parsed entry as new — the existing matches
    // are gone, so re-creating them from import is the desired behavior.
    const wipeOverride = wipeMode;

    for (const c of importable) {
      const meta = wipeOverride ? { kind: "new" as const } : rowMetas[c.id];
      if (meta?.kind === "exact") {
        exactSkipped++;
        continue;
      }
      if (meta?.kind === "changed") {
        if (skipChangedIds.has(c.id)) {
          userSkipped++;
          continue;
        }
        const desc = [c.endTime ? `Kết thúc: ${c.endTime}` : null, c.notes]
          .filter(Boolean)
          .join("\n");
        updateTask(meta.existingId!, {
          location: c.location || undefined,
          description: desc || undefined,
        });
        updated++;
        continue;
      }
      // new
      const firstOcc = computeFirstOccurrenceISO(c);
      const desc = [c.endTime ? `Kết thúc: ${c.endTime}` : null, c.notes]
        .filter(Boolean)
        .join("\n");
      if (c.oneOff) {
        // One-off event (sports match, calendar invite…) — no recurrence,
        // type default "other", neutral priority. User tags it via the
        // import-source toggle below if they want a custom default.
        addTask({
          title: c.subject,
          description: desc || undefined,
          type: "other",
          priority: "medium",
          location: c.location,
          deadline: new Date(firstOcc).toISOString(),
          recurrence: null,
          tags: ["su-kien"],
          notify: "15m",
        });
      } else {
        addTask({
          title: c.subject,
          description: desc || undefined,
          type: "academic",
          priority: "medium",
          location: c.location,
          deadline: new Date(firstOcc).toISOString(),
          recurrence: "weekly",
          recurrenceEndAt:
            semesterEndIso ??
            (c.endDate
              ? new Date(c.endDate + "T23:59:59").toISOString()
              : null),
          tags: ["lich-hoc"],
          notify: "15m",
        });
      }
      added++;
      actuallyAdded.push(c);
    }

    const parts: string[] = [];
    if (added > 0) parts.push(t("import.toast.commit.part.added", { n: added }));
    if (updated > 0) parts.push(t("import.toast.commit.part.updated", { n: updated }));
    if (displaced > 0) parts.push(t("import.toast.commit.part.displaced", { n: displaced }));
    if (exactSkipped > 0) parts.push(t("import.toast.commit.part.skippedExisting", { n: exactSkipped }));
    if (userSkipped > 0) parts.push(t("import.toast.commit.part.skippedByUser", { n: userSkipped }));
    if (skippedAttended > 0) parts.push(t("import.toast.commit.part.skippedAttended", { n: skippedAttended }));
    const didSomething = added > 0 || updated > 0 || displaced > 0;
    toast({
      title: didSomething
        ? t("import.toast.commit.doneTitle", { parts: parts.join(" · ") })
        : t("import.toast.commit.nothingTitle"),
      description: added > 0 ? t("import.toast.commit.gotoCalendar") : undefined,
      variant: didSomething ? "success" : "default",
    });

    // Find the earliest first-occurrence to jump the calendar there
    let earliest = "";
    for (const c of actuallyAdded) {
      const occ = computeFirstOccurrenceISO(c).slice(0, 10);
      if (!earliest || occ < earliest) earliest = occ;
    }

    setRaw("");
    setParsed([]);
    setSkipChangedIds(new Set());
    setWipeMode(false);
    setTab("paste");

    if (earliest) {
      setTimeout(() => navigate(`/calendar?date=${earliest}`), 300);
    }
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof Bookmark }> = [
    { id: "paste", label: t("import.tab.paste"), icon: ClipboardPaste },
    { id: "bookmarklet", label: t("import.tab.bookmarklet"), icon: Bookmark },
    { id: "ics", label: t("import.tab.ics"), icon: Upload },
  ];

  const inputKind = raw ? detectKind(raw) : null;
  const inputKindLabel =
    inputKind === "ics"
      ? t("import.kind.ics")
      : inputKind === "html"
      ? t("import.kind.html")
      : inputKind === "event-list"
      ? t("import.kind.event")
      : inputKind === "text"
      ? t("import.kind.text")
      : null;

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="shrink-0">
        <h2 className="text-3xl font-bold tracking-tight">{t("import.title")}</h2>
        <p className="text-muted-foreground mt-1">
          {t("import.subtitle")}
        </p>
      </div>

      {/* Tab strip */}
      <div className="shrink-0 flex items-center gap-1 p-1 rounded-lg bg-muted/50 w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              // Match Settings tab strip exactly: px-3 py-1.5 canonical for
              // pill-tab strips (also used by ThemePicker). Calendar view
              // toggle is intentionally denser at px-2.5 py-1.
              "cm-press flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap",
              "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              tab === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 min-h-0 overflow-hidden">
        {/* Left: source input */}
        <div className="lg:col-span-2 flex flex-col overflow-hidden">
          {tab === "paste" && (
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ClipboardPaste className="h-5 w-5 text-primary" />
                  {t("import.paste.title")}
                </CardTitle>
                <CardDescription>
                  {t("import.paste.desc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3 min-h-0">
                <textarea
                  ref={textareaRef}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  onPaste={handlePaste}
                  placeholder={SAMPLE_TEXT}
                  className="flex-1 min-h-[260px] rounded-md border border-input bg-background px-3 py-2 text-xs font-mono leading-relaxed shadow-xs resize-none outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {inputKindLabel && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary">
                        <Info className="h-3 w-3" /> {inputKindLabel}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setRaw(SAMPLE_TEXT)}
                      className="hover:text-foreground underline-offset-2 hover:underline"
                    >
                      {t("import.paste.tryExample")}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRaw("");
                        setParsed([]);
                      }}
                      disabled={!raw}
                    >
                      {t("import.paste.clear")}
                    </Button>
                    <Button
                      onClick={handleParse}
                      disabled={!raw.trim()}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      {t("import.paste.parse")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === "bookmarklet" && (
            <Card className="flex-1 overflow-y-auto">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Bookmark className="h-5 w-5 text-primary" />
                  {t("import.bm.title")}
                </CardTitle>
                <CardDescription>
                  {t("import.bm.desc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Big drag target */}
                <div className="relative">
                  <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary/40 via-fuchsia-400/30 to-primary/40 opacity-60 blur-md animate-pulse pointer-events-none" />
                  <div className="relative rounded-2xl border-2 border-dashed border-primary/50 bg-card p-5 flex flex-col items-center gap-3">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-primary inline-flex items-center gap-1">
                      <MousePointer2 className="h-3 w-3" />
                      {t("import.bm.dragHint")}
                    </p>
                    <BookmarkletLink
                      href={bookmarklet}
                      className="group inline-flex items-center gap-2.5 px-5 py-3 bg-gradient-to-r from-primary to-indigo-600 text-primary-foreground rounded-xl font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 cursor-grab active:cursor-grabbing transition-all"
                      title={t("import.bm.dragTitle")}
                    >
                      <Logo className="h-5 w-5 drop-shadow" withGlow={false} />
                      <span>{t("import.bm.button")}</span>
                      <Sparkles className="h-4 w-4 opacity-70 group-hover:rotate-12 transition-transform" />
                    </BookmarkletLink>
                    <p className="text-[11px] text-muted-foreground text-center max-w-[260px] leading-relaxed">
                      {t("import.bm.rightClick")}
                    </p>
                  </div>
                </div>

                {/* Live test panel */}
                <div className="rounded-xl border bg-muted/20 p-3 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Wand2 className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t("import.bm.testTitle")}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("import.bm.testDesc")}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        try {
                          const script = getBookmarkletBody(window.location.origin);
                          // eslint-disable-next-line @typescript-eslint/no-implied-eval
                          new Function(script)();
                          toast({
                            title: t("import.toast.scriptRan.title"),
                            description: t("import.toast.scriptRan.desc"),
                          });
                        } catch (e) {
                          toast({
                            title: t("import.toast.scriptErr.title"),
                            description: String(e),
                            variant: "destructive",
                          });
                        }
                      }}
                      className="gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> {t("import.bm.runNow")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRaw(SAMPLE_TEXT);
                        setTab("paste");
                        setParsed(parseAny(SAMPLE_TEXT));
                        toast({
                          title: t("import.toast.sampleLoaded.title"),
                          description: t("import.toast.sampleLoaded.desc"),
                        });
                      }}
                      className="gap-1.5"
                    >
                      {t("import.bm.trySample")}
                    </Button>
                  </div>
                </div>

                {/* Step-by-step */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    {t("import.bm.stepsHeader")}
                  </p>
                  <div className="space-y-2.5">
                    {[
                      {
                        n: 1,
                        icon: Bookmark,
                        title: t("import.bm.step1Title"),
                        desc: t("import.bm.step1Desc"),
                      },
                      {
                        n: 2,
                        icon: MousePointer2,
                        title: t("import.bm.step2Title"),
                        desc: t("import.bm.step2Desc"),
                      },
                      {
                        n: 3,
                        icon: Globe,
                        title: t("import.bm.step3Title"),
                        desc: t("import.bm.step3Desc"),
                      },
                      {
                        n: 4,
                        icon: Wand2,
                        title: t("import.bm.step4Title"),
                        desc: t("import.bm.step4Desc"),
                      },
                    ].map(({ n, icon: Icon, title, desc }) => (
                      <div
                        key={n}
                        className="flex gap-3 p-3 rounded-lg border bg-background/50"
                      >
                        <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center shrink-0">
                          {n}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium inline-flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-primary" />
                            {title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Troubleshooting + raw code */}
                <details className="rounded-lg border bg-muted/20">
                  <summary className="cursor-pointer text-xs font-semibold px-3 py-2 inline-flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5" />
                    {t("import.bm.helpSummary")}
                  </summary>
                  <div className="px-3 pb-3 space-y-3 text-xs">
                    <div className="space-y-2 text-muted-foreground leading-relaxed">
                      <p>
                        <strong>{t("import.bm.help.aboutBlankTitle")}</strong>{" "}
                        {t("import.bm.help.aboutBlankBody")}
                      </p>
                      <p>
                        <strong>{t("import.bm.help.logoTitle")}</strong>{" "}
                        {t("import.bm.help.logoBody")}
                      </p>
                      <p>
                        <strong>{t("import.bm.help.cspTitle")}</strong>{" "}
                        {t("import.bm.help.cspBody")}
                      </p>
                      <p>
                        <strong>{t("import.bm.help.blankTabTitle")}</strong>{" "}
                        {t("import.bm.help.blankTabBody")}
                      </p>
                    </div>
                    <div className="relative">
                      <p className="text-[10px] uppercase font-bold tracking-wider mb-1">
                        {t("import.bm.rawHeader")}
                      </p>
                      <textarea
                        readOnly
                        value={bookmarklet}
                        className="w-full h-20 rounded-md border border-input bg-card px-3 py-2 text-[10px] font-mono leading-relaxed resize-none"
                        onClick={(e) =>
                          (e.target as HTMLTextAreaElement).select()
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copyBookmarklet}
                        className="absolute top-6 right-1 h-7 gap-1.5"
                      >
                        {bookmarkletCopied ? (
                          <>
                            <Check className="h-3 w-3" /> {t("import.bm.copied")}
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> {t("import.bm.copy")}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
          )}

          {tab === "ics" && (
            <Card className="flex-1 overflow-y-auto">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Upload className="h-5 w-5 text-primary" />
                  {t("import.ics.title")}
                </CardTitle>
                <CardDescription>
                  {t("import.ics.desc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileDropZone onFile={handleIcsFile} />
                {raw && inputKind === "ics" && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {t("import.ics.valid")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: preview */}
        <div className="lg:col-span-3 flex flex-col overflow-hidden">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CalendarPlus className="h-5 w-5 text-primary" />
                    {t("import.preview.title", { n: parsed.length })}
                  </CardTitle>
                  <CardDescription>
                    {t("import.preview.desc")}
                  </CardDescription>
                </div>
                {parsed.length > 0 && (() => {
                  const willChange = wipeMode
                    ? affectedExisting.length + parsed.filter((c) => !c.attended).length
                    : previewSummary.news +
                      (previewSummary.changed - skipChangedIds.size) +
                      displacedExisting.length;
                  return (
                    <Button
                      onClick={commitImport}
                      className="gap-2 shrink-0"
                      variant={wipeMode ? "destructive" : "default"}
                      disabled={willChange === 0}
                      title={
                        willChange === 0
                          ? t("import.preview.btn.titleEmpty")
                          : wipeMode
                          ? t("import.preview.btn.titleWipe", {
                              n: affectedExisting.length,
                              m: parsed.filter((c) => !c.attended).length,
                            })
                          : undefined
                      }
                    >
                      <CalendarPlus className="h-4 w-4" />
                      {willChange === 0
                        ? t("import.preview.btn.empty")
                        : wipeMode
                        ? t("import.preview.btn.wipeRecreate", {
                            n: parsed.filter((c) => !c.attended).length,
                          })
                        : t("import.preview.btn.import", { n: willChange })}
                    </Button>
                  );
                })()}
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto">
              {parsed.length === 0 ? (
                <EmptyPreview />
              ) : (
                <>
                  {/* Status summary */}
                  {(previewSummary.news + previewSummary.exact + previewSummary.changed + displacedExisting.length) > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {previewSummary.news > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-medium">
                          <Sparkles className="h-3 w-3" />
                          {t("import.preview.status.new", { n: previewSummary.news })}
                        </span>
                      )}
                      {previewSummary.changed > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-medium">
                          <AlertCircle className="h-3 w-3" />
                          {t("import.preview.status.changed", { n: previewSummary.changed })}
                        </span>
                      )}
                      {displacedExisting.length > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 font-medium"
                          title={displacedExisting
                            .map((task) => {
                              const d = task.deadline ? new Date(task.deadline) : null;
                              const dow = d ? dowLabel(d.getDay()) : "";
                              const hh = d ? d.getHours().toString().padStart(2, "0") : "";
                              const mm = d ? d.getMinutes().toString().padStart(2, "0") : "";
                              return `${task.title} · ${dow} ${hh}:${mm}`;
                            })
                            .join("\n")}
                        >
                          <X className="h-3 w-3" />
                          {t("import.preview.status.displaced", { n: displacedExisting.length })}
                        </span>
                      )}
                      {previewSummary.exact > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border font-medium">
                          <Check className="h-3 w-3" />
                          {t("import.preview.status.exact", { n: previewSummary.exact })}
                        </span>
                      )}
                      {skippedAttended > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          {t("import.preview.status.attended", { n: skippedAttended })}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Wipe mode toggle — surfaces hidden recurring tasks the
                      user may have forgotten about, and lets them
                      forcibly replace those with the fresh school import. */}
                  {affectedExisting.length > 0 && (
                    <div
                      className={cn(
                        "rounded-lg border p-3 space-y-2 transition-colors",
                        wipeMode
                          ? "border-rose-500/40 bg-rose-500/5"
                          : "border-border bg-muted/30"
                      )}
                    >
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={wipeMode}
                          onChange={(e) => setWipeMode(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-input accent-rose-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold">
                            {t("import.wipe.title", { n: affectedExisting.length })}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                            {t("import.wipe.desc")}
                          </p>
                        </div>
                      </label>
                      <details className="text-[11px]">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          {t("import.wipe.viewAffected", { n: affectedExisting.length })}
                        </summary>
                        <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-1">
                          {affectedExisting.map((task) => {
                            const d = task.deadline ? new Date(task.deadline) : null;
                            const dow = d ? dowLabel(d.getDay()) : "";
                            const hh = d ? d.getHours().toString().padStart(2, "0") : "—";
                            const mm = d ? d.getMinutes().toString().padStart(2, "0") : "—";
                            const dateStr = d
                              ? `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`
                              : "";
                            const statusLabel =
                              task.status === "done"
                                ? t("import.row.statusDone")
                                : task.status === "in-progress"
                                ? t("import.row.statusInProgress")
                                : t("import.row.statusTodo");
                            return (
                              <li
                                key={task.id}
                                className="flex items-center gap-2 tabular-nums text-muted-foreground"
                              >
                                <span className="font-medium text-foreground truncate flex-1">
                                  {task.title}
                                </span>
                                <span>{dow}</span>
                                <span>{hh}:{mm}</span>
                                <span className="text-[10px] opacity-70">
                                  {dateStr} · {statusLabel}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    </div>
                  )}

                  {/* Semester end picker — only meaningful for weekly recurring
                      classes. Hidden when the import is entirely one-off events. */}
                  {parsed.some((c) => !c.oneOff) && (
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold">
                          {t("import.semester.title")}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t("import.semester.hint")}
                        </p>
                      </div>
                      <DateTimePicker
                        value={semesterEnd}
                        onChange={setSemesterEnd}
                        dateOnly
                        placeholder={t("import.semester.placeholder")}
                        className="w-[180px]"
                      />
                    </div>
                  )}

                  {/* Grouped preview */}
                  <PreviewList
                    items={parsed}
                    setItems={setParsed}
                    rowMetas={rowMetas}
                    skipChangedIds={skipChangedIds}
                    onToggleSkip={toggleSkipChanged}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---- File drop zone ------------------------------------------------------

function FileDropZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "rounded-xl border-2 border-dashed p-8 flex flex-col items-center gap-2 cursor-pointer transition-colors",
        dragging
          ? "border-primary bg-primary/10"
          : "border-input hover:border-primary/50 hover:bg-accent/30"
      )}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">{t("import.ics.dropHint")}</p>
      <p className="text-xs text-muted-foreground">{t("import.ics.clickHint")}</p>
      <input
        ref={inputRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function EmptyPreview() {
  const t = useT();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-12">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <CalendarPlus className="h-8 w-8 text-primary" />
      </div>
      <div className="max-w-sm">
        <p className="font-semibold">{t("import.preview.empty.title")}</p>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {t("import.preview.empty.hint")}
        </p>
      </div>
    </div>
  );
}

// ---- Preview list (editable) --------------------------------------------

function nextDateForDow(dow: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const diff = (dow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Prefer the date parsed from the timetable header (c.startDate) over a
 * computed "next dow from today" — when the user pastes next week's grid,
 * the header dates are the source of truth. Falling back to today-anchored
 * dow math collapses Wed–Sun onto the current week and creates false
 * "Đã có" duplicates against the recurring tasks already on those slots.
 */
function previewDateForDay(items: ParsedClass[], dow: number): Date {
  for (const c of items) {
    if (!c.startDate) continue;
    const d = new Date(`${c.startDate}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return nextDateForDow(dow);
}

function fmtFullDate(d: Date): string {
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function PreviewList({
  items,
  setItems,
  rowMetas,
  skipChangedIds,
  onToggleSkip,
}: {
  items: ParsedClass[];
  setItems: (next: ParsedClass[]) => void;
  rowMetas: Record<string, RowMeta>;
  skipChangedIds: Set<string>;
  onToggleSkip: (id: string) => void;
}) {
  const t = useT();
  // Group strategy depends on event shape:
  //  - All recurring (timetable): group by dayOfWeek — one row per slot.
  //  - Any one-off (event-list, ICS invites): group by exact startDate so two
  //    Mondays in different weeks don't collapse into one group.
  const hasOneOff = items.some((c) => c.oneOff);
  const grouped = useMemo(() => {
    const map = new Map<string, ParsedClass[]>();
    for (const c of items) {
      const key = hasOneOff
        ? c.startDate ?? `dow-${c.dayOfWeek}`
        : `dow-${c.dayOfWeek}`;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [items, hasOneOff]);

  const orderedKeys = useMemo(() => {
    if (hasOneOff) {
      // Sort by date ascending; fallback dow-X entries go last.
      return Array.from(grouped.keys()).sort((a, b) => {
        const aIsDate = !a.startsWith("dow-");
        const bIsDate = !b.startsWith("dow-");
        if (aIsDate && bIsDate) return a.localeCompare(b);
        if (aIsDate) return -1;
        if (bIsDate) return 1;
        return a.localeCompare(b);
      });
    }
    const orderedDays = [1, 2, 3, 4, 5, 6, 0];
    return orderedDays
      .map((d) => `dow-${d}`)
      .filter((k) => grouped.get(k)?.length);
  }, [grouped, hasOneOff]);

  const updateItem = (id: string, patch: Partial<ParsedClass>) => {
    setItems(items.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeItem = (id: string) =>
    setItems(items.filter((c) => c.id !== id));

  return (
    <div className="space-y-4">
      {orderedKeys.map((key) => {
        const group = grouped.get(key);
        if (!group?.length) return null;
        const isDateKey = !key.startsWith("dow-");
        const dow = isDateKey
          ? new Date(`${key}T00:00:00`).getDay()
          : parseInt(key.slice(4), 10);
        const dateForHeader = isDateKey
          ? new Date(`${key}T00:00:00`)
          : previewDateForDay(group, dow);
        const attendedCount = group.filter((c) => c.attended).length;
        return (
          <div key={key}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2 flex-wrap">
              <CalendarRange className="h-3 w-3" />
              <span>{t(DOW_I18N_KEYS[dow] ?? "review.dow.sun")}</span>
              <span className="text-muted-foreground/70 font-normal normal-case tabular-nums">
                · {fmtFullDate(dateForHeader)}
              </span>
              <span className="text-muted-foreground/70 font-normal">
                ({group.length}
                {attendedCount > 0 ? t("import.row.groupAttended", { n: attendedCount }) : ""})
              </span>
            </p>
            <div className="space-y-2">
              {group.map((c) => (
                <PreviewRow
                  key={c.id}
                  item={c}
                  meta={rowMetas[c.id]}
                  skipped={skipChangedIds.has(c.id)}
                  onToggleSkip={() => onToggleSkip(c.id)}
                  onChange={(patch) => updateItem(c.id, patch)}
                  onRemove={() => removeItem(c.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PreviewRow({
  item,
  meta,
  skipped,
  onToggleSkip,
  onChange,
  onRemove,
}: {
  item: ParsedClass;
  meta?: RowMeta;
  skipped?: boolean;
  onToggleSkip?: () => void;
  onChange: (patch: Partial<ParsedClass>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const valid = item.subject.trim().length >= 2 && /^\d{2}:\d{2}$/.test(item.startTime);
  const isExact = meta?.kind === "exact";
  const isChanged = meta?.kind === "changed";
  return (
    <div
      className={cn(
        "group rounded-lg border bg-background/50 p-3 hover:bg-accent/30 transition-colors",
        !valid && "border-destructive/40 bg-destructive/5",
        item.attended && "opacity-60 bg-muted/30",
        isExact && "opacity-60",
        isChanged && !skipped && "border-amber-500/40 bg-amber-500/5",
        skipped && "opacity-50 bg-muted/30"
      )}
    >
      {/* Status row */}
      {(meta && meta.kind !== "new") || item.attended ? (
        <div className="flex flex-wrap items-center gap-2 mb-2 text-[10px] font-semibold uppercase tracking-wider">
          {item.attended && (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              {t("import.row.attended")}
            </span>
          )}
          {isExact && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Check className="h-3 w-3" />
              {t("import.row.skipExisting")}
            </span>
          )}
          {isChanged && (
            <>
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3 w-3" />
                {skipped ? t("import.row.skipChange") : t("import.row.willUpdate")}
              </span>
              {meta?.changes?.map((c) => (
                <span
                  key={c.field}
                  className="inline-flex items-center gap-1 text-[10px] normal-case tracking-normal font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md"
                >
                  {c.field === "location" ? t("import.row.field.location") : t("import.row.field.endTime")}:
                  <span className="line-through opacity-60">{c.from}</span>
                  →
                  <span>{c.to}</span>
                </span>
              ))}
              {onToggleSkip && (
                <button
                  type="button"
                  onClick={onToggleSkip}
                  className="ml-auto text-[10px] normal-case tracking-normal underline-offset-2 hover:underline text-muted-foreground"
                >
                  {skipped ? t("import.row.toggleSkip.unskip") : t("import.row.toggleSkip.skip")}
                </button>
              )}
            </>
          )}
        </div>
      ) : null}
      <div className="flex items-center gap-1.5">
        {/* Subject — shrinks first, has a sane max so it doesn't push the
            time/location off-screen on wide rows. */}
        <Input
          value={item.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
          placeholder={t("import.row.subjectPh")}
          className="h-8 text-sm px-2.5 flex-[2] min-w-0 max-w-[220px]"
        />
        {/* Time pair — fixed widths so HH:MM never crops. */}
        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          value={item.startTime}
          onChange={(e) => onChange({ startTime: e.target.value })}
          placeholder={t("import.row.timePh")}
          className="h-8 text-xs tabular-nums w-[68px] px-1.5 text-center shrink-0"
        />
        <span className="text-muted-foreground text-xs shrink-0">–</span>
        <Input
          value={item.endTime ?? ""}
          onChange={(e) => onChange({ endTime: e.target.value })}
          placeholder={t("import.row.timePh")}
          className="h-8 text-xs tabular-nums w-[68px] px-1.5 text-center shrink-0"
        />
        {/* Location — fills remaining space. */}
        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
        <Input
          value={item.location ?? ""}
          onChange={(e) => onChange({ location: e.target.value })}
          placeholder={t("import.row.roomPh")}
          className="h-8 text-xs px-2 flex-1 min-w-0"
        />
        <button
          onClick={onRemove}
          className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors flex items-center justify-center"
          aria-label={t("import.row.removeAria")}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {!valid && (
        <p className="text-[10px] text-destructive mt-1.5 inline-flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {t("import.row.invalid")}
        </p>
      )}
      {item.raw && item.raw.length > 0 && (
        <p className="text-[10px] text-muted-foreground/70 mt-1 truncate font-mono">
          {item.raw}
        </p>
      )}
    </div>
  );
}

/**
 * React 19 sanitizes `javascript:` URLs out of href props as an XSS guard,
 * replacing them with `javascript:throw new Error(...)`. That breaks
 * bookmarklets — the bookmark stored when the user drags the link contains
 * the error string, not our script.
 *
 * Workaround: set the href via DOM `setAttribute` through a ref. React
 * never sees the URL in JSX, so it can't rewrite it.
 */
function BookmarkletLink({
  href,
  className,
  title,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.setAttribute("href", href);
  }, [href]);
  return (
    <a
      ref={ref}
      // Note: no `href` prop on JSX — that's the whole point. The ref above
      // attaches it via DOM. Without `href` here, React renders <a> with no
      // href; the effect then sets the real one.
      onClick={(e) => e.preventDefault()}
      draggable
      className={className}
      title={title}
    >
      {children}
    </a>
  );
}

