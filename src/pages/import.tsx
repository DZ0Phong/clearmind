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
  parseTimetableText,
  detectKind,
  computeFirstOccurrenceISO,
  DOW_LABEL_VI,
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
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { buildBookmarklet, getBookmarkletBody } from "@/lib/bookmarklet";

type Tab = "paste" | "bookmarklet" | "ics";

const SAMPLE_TEXT = `Thứ 2
07:00 - 09:30  Giải tích 2          A1.404  Thầy Nguyễn Văn A
09:35 - 11:30  Vật lý đại cương     B2.305  Cô Lê Thị B
Thứ 4
13:00 - 15:30  Lập trình hướng đối tượng  Lab C3.501  Thầy Trần C
Thứ 6
07:00 - 09:30  Tiếng Anh chuyên ngành  D4.201  Cô Phạm D`;

// Pull just the subject code (e.g. "PRU213") from a free-form title — the
// import parser may produce "PRU213" alone OR "PRU213 — Lý thuyết", and the
// existing weekly tasks may carry either form. Matching on the code keeps
// dedup + override stable regardless of suffix.
function extractSubjectCode(title: string): string | null {
  const m = title.match(/\b([A-Z]{3,4}\d{3,4}[a-z]{0,3})\b/);
  return m ? m[1] : null;
}

// Slot signature for a weekly class = subject-code (or title) + dow + time.
// Identifies the RECURRING SCHEDULE (Thu 12:50 PRU213), not a specific
// week. Used by displaced-slot detection ("school moved PRU213 to Tue").
function classSignature(title: string, dow: number, startTime: string): string {
  const code = extractSubjectCode(title);
  const key = code ? code.toLowerCase() : title.trim().toLowerCase();
  return `${dow}|${startTime}|${key}`;
}

// Per-occurrence signature: slot signature PLUS the deadline date. This is
// what dedup uses to decide "đã có / mới / đã đổi" — two parsed classes
// for the same subject on DIFFERENT weeks are not duplicates of each
// other. The old per-slot dedup wrongly skipped next week's import when a
// past instance still lived in the data at last week's date.
function classOccurrenceSignature(
  title: string,
  dow: number,
  startTime: string,
  dateYmd: string
): string {
  return `${classSignature(title, dow, startTime)}|${dateYmd}`;
}

function taskOccurrenceSignature(t: {
  title: string;
  deadline?: string;
  recurrence?: string | null;
}): string | null {
  if (t.recurrence !== "weekly" || !t.deadline) return null;
  const d = new Date(t.deadline);
  if (Number.isNaN(d.getTime())) return null;
  const dow = d.getDay();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ymd = t.deadline.slice(0, 10);
  return classOccurrenceSignature(t.title, dow, `${hh}:${mm}`, ymd);
}

function parsedOccurrenceSignature(c: ParsedClass): string {
  const iso = computeFirstOccurrenceISO(c);
  return classOccurrenceSignature(c.subject, c.dayOfWeek, c.startTime, iso.slice(0, 10));
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

export function ImportPage() {
  const { addTask, updateTask, removeTask, tasks } = useTasks();
  const { toast } = useToast();
  const navigate = useNavigate();
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
          attCount > 0 ? ` (${attCount} đã điểm danh sẽ skip)` : "";
        toast({
          title: `Đã nhận ${realCount} lớp${attSuffix}`,
          description: "Kiểm tra & chỉnh sửa trước khi import.",
          variant: "success",
        });
      } else if (tables === 0) {
        toast({
          title: "Trang nguồn không có bảng nào",
          description: `Bookmarklet đã chạy nhưng không tìm thấy <table>. Bạn có chắc đang ở trang timetable? (frames=${frames})`,
          variant: "destructive",
        });
      } else {
        toast({
          title: `Tìm thấy ${tables} bảng, parse thất bại`,
          description: `Score tốt nhất=${score}. Layout lạ — thử Paste mode (Ctrl+A → Ctrl+C ở trang trường).`,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Lỗi khi nhận data từ bookmarklet",
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
        title: "Không tìm thấy lịch học",
        description:
          "Thử format khác hoặc paste cả bảng HTML từ trang trường (Ctrl+A → Ctrl+C).",
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
            title: `Detected ${items.length} lớp từ HTML`,
            description: "Đã parse rich-text từ trang web.",
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
        title: `Đã đọc ${items.length} sự kiện`,
        description: `Từ file ${file.name}`,
        variant: "success",
      });
    } else {
      toast({
        title: "File ICS trống hoặc không hợp lệ",
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
      toast({ title: "Không copy được", variant: "destructive" });
    }
  };

  // ---- Per-row classification (new / exact / changed) -------------------
  // Index existing weekly tasks by per-OCCURRENCE signature (slot + date).
  // Skipping is only correct when the same week's instance already exists;
  // a stale instance from a prior week shouldn't block this week's import.
  const existingByOccurrence = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) {
      const sig = taskOccurrenceSignature(t);
      if (sig) m.set(sig, t);
    }
    return m;
  }, [tasks]);

  const rowMetas = useMemo(() => {
    const out: Record<string, RowMeta> = {};
    for (const c of parsed) {
      const sig = parsedOccurrenceSignature(c);
      const existing = existingByOccurrence.get(sig);
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
  }, [parsed, existingByOccurrence]);

  // All existing weekly tasks whose subject appears in the new import — i.e.
  // every recurring task that COULD potentially be affected. Used for two
  // purposes: (a) displaced detection (slot changed) and (b) the explicit
  // "xoá lịch cũ rồi import lại" wipe mode.
  const affectedExisting = useMemo(() => {
    if (!parsed.length) return [] as Task[];
    const importSubjects = new Set<string>();
    for (const c of parsed) {
      const code = extractSubjectCode(c.subject);
      if (code) importSubjects.add(code.toLowerCase());
    }
    return tasks.filter((t) => {
      if (t.recurrence !== "weekly" || !t.deadline) return false;
      const code = extractSubjectCode(t.title);
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
      const code = extractSubjectCode(c.subject);
      if (!code) continue;
      importSigs.add(`${code.toLowerCase()}|${c.dayOfWeek}|${c.startTime}`);
    }
    return affectedExisting.filter((t) => {
      const code = extractSubjectCode(t.title)!.toLowerCase();
      const d = new Date(t.deadline!);
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
    for (const t of toDelete) {
      removeTask(t.id);
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
      added++;
      actuallyAdded.push(c);
    }

    const parts: string[] = [];
    if (added > 0) parts.push(`thêm ${added}`);
    if (updated > 0) parts.push(`cập nhật ${updated}`);
    if (displaced > 0) parts.push(`xoá ${displaced} lớp cũ đã đổi slot`);
    if (exactSkipped > 0) parts.push(`bỏ qua ${exactSkipped} đã có`);
    if (userSkipped > 0) parts.push(`bỏ qua ${userSkipped} theo lựa chọn`);
    if (skippedAttended > 0) parts.push(`bỏ qua ${skippedAttended} đã điểm danh`);
    const didSomething = added > 0 || updated > 0 || displaced > 0;
    toast({
      title: didSomething
        ? `Import xong · ${parts.join(" · ")}`
        : "Không có gì thay đổi — tất cả đã có sẵn.",
      description: added > 0 ? "Đang chuyển sang Calendar để bạn xem." : undefined,
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
    { id: "paste", label: "Paste", icon: ClipboardPaste },
    { id: "bookmarklet", label: "Bookmarklet", icon: Bookmark },
    { id: "ics", label: "File ICS", icon: Upload },
  ];

  const inputKind = raw ? detectKind(raw) : null;

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="shrink-0">
        <h2 className="text-3xl font-bold tracking-tight">Import lịch học</h2>
        <p className="text-muted-foreground mt-1">
          Đẩy timetable từ web trường vào Clearmind. Dữ liệu sẽ tạo task lặp lại
          hàng tuần.
        </p>
      </div>

      {/* Tab strip */}
      <div className="shrink-0 flex items-center gap-1 p-1 rounded-lg bg-muted/50 w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
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
                  Paste bảng lịch học
                </CardTitle>
                <CardDescription>
                  Đăng nhập web trường, mở timetable, Ctrl+A → Ctrl+C, paste vào
                  ô bên dưới. Hỗ trợ cả text thuần và rich-text HTML.
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
                    {inputKind && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary capitalize">
                        <Info className="h-3 w-3" /> {inputKind}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setRaw(SAMPLE_TEXT)}
                      className="hover:text-foreground underline-offset-2 hover:underline"
                    >
                      Thử ví dụ mẫu
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
                      Xoá
                    </Button>
                    <Button
                      onClick={handleParse}
                      disabled={!raw.trim()}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      Parse
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
                  Bookmarklet 1-click
                </CardTitle>
                <CardDescription>
                  Lưu 1 lần, dùng mãi. Mỗi tuần chỉ cần bấm 1 nút trên trang
                  trường — Clearmind tự nhận lịch.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Big drag target */}
                <div className="relative">
                  <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary/40 via-fuchsia-400/30 to-primary/40 opacity-60 blur-md animate-pulse pointer-events-none" />
                  <div className="relative rounded-2xl border-2 border-dashed border-primary/50 bg-card p-5 flex flex-col items-center gap-3">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-primary inline-flex items-center gap-1">
                      <MousePointer2 className="h-3 w-3" />
                      Kéo nút này lên thanh bookmark ↑
                    </p>
                    <BookmarkletLink
                      href={bookmarklet}
                      className="group inline-flex items-center gap-2.5 px-5 py-3 bg-gradient-to-r from-primary to-indigo-600 text-primary-foreground rounded-xl font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 cursor-grab active:cursor-grabbing transition-all"
                      title="Kéo lên thanh bookmark, hoặc click chuột phải → Bookmark this link"
                    >
                      <Logo className="h-5 w-5 drop-shadow" withGlow={false} />
                      <span>Import vào Clearmind</span>
                      <Sparkles className="h-4 w-4 opacity-70 group-hover:rotate-12 transition-transform" />
                    </BookmarkletLink>
                    <p className="text-[11px] text-muted-foreground text-center max-w-[260px] leading-relaxed">
                      Không kéo được? <strong>Click chuột phải</strong> vào nút
                      → chọn <strong>"Bookmark this link…"</strong>
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
                      <p className="text-sm font-medium">Kiểm tra bookmarklet</p>
                      <p className="text-[11px] text-muted-foreground">
                        Chạy script ngay tại đây. Trang này không có lịch → sẽ
                        báo 0 tables — chứng tỏ bookmark đang work.
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
                            title: "Đã chạy script",
                            description:
                              "Một tab Clearmind mới sẽ mở với diagnostic. Không có tab → check popup blocker.",
                          });
                        } catch (e) {
                          toast({
                            title: "Script lỗi",
                            description: String(e),
                            variant: "destructive",
                          });
                        }
                      }}
                      className="gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Chạy thử ngay
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRaw(SAMPLE_TEXT);
                        setTab("paste");
                        setParsed(parseAny(SAMPLE_TEXT));
                        toast({
                          title: "Đã load data mẫu",
                          description: "Xem preview parser ở bên phải.",
                        });
                      }}
                      className="gap-1.5"
                    >
                      Hoặc thử với data mẫu
                    </Button>
                  </div>
                </div>

                {/* Step-by-step */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    4 bước, 30 giây
                  </p>
                  <div className="space-y-2.5">
                    {[
                      {
                        n: 1,
                        icon: Bookmark,
                        title: "Hiện thanh bookmark",
                        desc: "Bấm Ctrl+Shift+B (Windows / Linux) hoặc Cmd+Shift+B (Mac).",
                      },
                      {
                        n: 2,
                        icon: MousePointer2,
                        title: "Kéo nút ở trên lên thanh bookmark",
                        desc: 'Hoặc click chuột phải vào nút → "Bookmark this link".',
                      },
                      {
                        n: 3,
                        icon: Globe,
                        title: "Mở trang lịch của trường",
                        desc: "Đăng nhập, vào timetable (lịch tuần / kỳ).",
                      },
                      {
                        n: 4,
                        icon: Wand2,
                        title: "Bấm bookmark vừa lưu",
                        desc: "Clearmind mở tab mới với data đã scrape sẵn. Review → Import.",
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
                    Bookmark không có logo, hoặc cần code thô?
                  </summary>
                  <div className="px-3 pb-3 space-y-3 text-xs">
                    <div className="space-y-2 text-muted-foreground leading-relaxed">
                      <p>
                        <strong>about:blank#blocked khi bấm bookmark:</strong>{" "}
                        Bạn đã kéo bookmark từ phiên bản cũ — React 19 chặn{" "}
                        <code>javascript:</code> URL. Đã fix ở bản này, hãy{" "}
                        <strong>xoá bookmark cũ và kéo lại</strong> từ nút phía
                        trên.
                      </p>
                      <p>
                        <strong>Logo bookmark:</strong> Chrome / Edge không hiển
                        thị icon cho bookmark dạng <code>javascript:</code> —
                        đây là giới hạn trình duyệt, không sửa được. Đổi tên
                        bookmark thành <code>✨ Clearmind</code> để dễ nhận
                        biết.
                      </p>
                      <p>
                        <strong>Trang trường chặn:</strong> Một số trang có CSP
                        ngăn script chạy. Khi đó dùng tab "Paste" — copy nội
                        dung trang rồi paste.
                      </p>
                      <p>
                        <strong>Bookmark mở tab trắng:</strong> Popup blocker.
                        Confirm dialog sẽ hỏi mở trong tab hiện tại — đồng ý
                        rồi bấm Back để quay về trang trường.
                      </p>
                    </div>
                    <div className="relative">
                      <p className="text-[10px] uppercase font-bold tracking-wider mb-1">
                        Code thô
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
                            <Check className="h-3 w-3" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Copy
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
                  Upload file .ics
                </CardTitle>
                <CardDescription>
                  Nếu trường có export iCalendar, kéo thả file vào đây.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileDropZone onFile={handleIcsFile} />
                {raw && inputKind === "ics" && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Đã đọc file ICS hợp lệ.
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
                    Xem trước ({parsed.length})
                  </CardTitle>
                  <CardDescription>
                    Sửa lại nếu cần, sau đó "Import vào lịch" để tạo task lặp
                    lại hàng tuần.
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
                          ? "Tất cả đã có sẵn — không có gì để import."
                          : wipeMode
                          ? `Xoá ${affectedExisting.length} lớp cũ + tạo lại ${parsed.filter((c) => !c.attended).length} lớp mới`
                          : undefined
                      }
                    >
                      <CalendarPlus className="h-4 w-4" />
                      {willChange === 0
                        ? "Không có gì mới"
                        : wipeMode
                        ? `Xoá & tạo lại ${parsed.filter((c) => !c.attended).length} lớp`
                        : `Import ${willChange} thay đổi`}
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
                          {previewSummary.news} mới
                        </span>
                      )}
                      {previewSummary.changed > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-medium">
                          <AlertCircle className="h-3 w-3" />
                          {previewSummary.changed} đã đổi (sẽ cập nhật)
                        </span>
                      )}
                      {displacedExisting.length > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 font-medium"
                          title={displacedExisting
                            .map((t) => {
                              const d = t.deadline ? new Date(t.deadline) : null;
                              const dow = d ? DOW_LABEL_VI[d.getDay()] : "";
                              const hh = d ? d.getHours().toString().padStart(2, "0") : "";
                              const mm = d ? d.getMinutes().toString().padStart(2, "0") : "";
                              return `${t.title} · ${dow} ${hh}:${mm}`;
                            })
                            .join("\n")}
                        >
                          <X className="h-3 w-3" />
                          {displacedExisting.length} lớp cũ sẽ xoá (đã đổi slot)
                        </span>
                      )}
                      {previewSummary.exact > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border font-medium">
                          <Check className="h-3 w-3" />
                          {previewSummary.exact} đã có (bỏ qua)
                        </span>
                      )}
                      {skippedAttended > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          {skippedAttended} đã điểm danh
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
                            Xoá lịch cũ rồi import lại ({affectedExisting.length} task)
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                            Dùng khi lịch trường là nguồn duy nhất đúng — sẽ xoá hết task
                            lặp tuần cũ của các môn trong lần import này (kể cả task đã
                            done hoặc bài tập con đang treo), rồi tạo lại sạch.
                          </p>
                        </div>
                      </label>
                      <details className="text-[11px]">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          Xem {affectedExisting.length} task sẽ bị ảnh hưởng
                        </summary>
                        <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-1">
                          {affectedExisting.map((t) => {
                            const d = t.deadline ? new Date(t.deadline) : null;
                            const dow = d ? DOW_LABEL_VI[d.getDay()] : "";
                            const hh = d ? d.getHours().toString().padStart(2, "0") : "—";
                            const mm = d ? d.getMinutes().toString().padStart(2, "0") : "—";
                            const dateStr = d
                              ? `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`
                              : "";
                            const statusLabel =
                              t.status === "done"
                                ? "✓ done"
                                : t.status === "in-progress"
                                ? "đang làm"
                                : "todo";
                            return (
                              <li
                                key={t.id}
                                className="flex items-center gap-2 tabular-nums text-muted-foreground"
                              >
                                <span className="font-medium text-foreground truncate flex-1">
                                  {t.title}
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

                  {/* Semester end picker */}
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                    <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">
                        Học kỳ kết thúc ngày
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Sau ngày này không sinh phiên mới nữa.
                      </p>
                    </div>
                    <DateTimePicker
                      value={semesterEnd}
                      onChange={setSemesterEnd}
                      dateOnly
                      placeholder="Chọn ngày kết thúc"
                      className="w-[180px]"
                    />
                  </div>

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
      <p className="text-sm font-medium">Kéo thả file .ics vào đây</p>
      <p className="text-xs text-muted-foreground">hoặc click để chọn file</p>
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
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-12">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <CalendarPlus className="h-8 w-8 text-primary" />
      </div>
      <div className="max-w-sm">
        <p className="font-semibold">Chưa có dữ liệu</p>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Chọn 1 trong 3 cách ở bên trái: paste bảng, dùng bookmarklet, hoặc
          upload file .ics. Kết quả sẽ hiện ở đây.
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
  const grouped = useMemo(() => {
    const byDay: Record<number, ParsedClass[]> = {};
    for (const c of items) {
      (byDay[c.dayOfWeek] ??= []).push(c);
    }
    for (const k of Object.keys(byDay)) {
      byDay[+k].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return byDay;
  }, [items]);

  const orderedDays = [1, 2, 3, 4, 5, 6, 0];

  const updateItem = (id: string, patch: Partial<ParsedClass>) => {
    setItems(items.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeItem = (id: string) =>
    setItems(items.filter((c) => c.id !== id));

  return (
    <div className="space-y-4">
      {orderedDays
        .filter((d) => grouped[d]?.length)
        .map((d) => {
          const nextDate = previewDateForDay(grouped[d], d);
          const attendedCount = grouped[d].filter((c) => c.attended).length;
          return (
            <div key={d}>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2 flex-wrap">
                <CalendarRange className="h-3 w-3" />
                <span>{DOW_LABEL_VI[d]}</span>
                <span className="text-muted-foreground/70 font-normal normal-case tabular-nums">
                  · {fmtFullDate(nextDate)}
                </span>
                <span className="text-muted-foreground/70 font-normal">
                  ({grouped[d].length}
                  {attendedCount > 0 ? `, ${attendedCount} đã điểm danh` : ""})
                </span>
              </p>
              <div className="space-y-2">
                {grouped[d].map((c) => (
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
              Đã điểm danh
            </span>
          )}
          {isExact && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Check className="h-3 w-3" />
              Đã có — sẽ bỏ qua
            </span>
          )}
          {isChanged && (
            <>
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3 w-3" />
                {skipped ? "Bỏ qua thay đổi" : "Sẽ cập nhật"}
              </span>
              {meta?.changes?.map((c) => (
                <span
                  key={c.field}
                  className="inline-flex items-center gap-1 text-[10px] normal-case tracking-normal font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md"
                >
                  {c.field === "location" ? "Phòng" : "Giờ kết thúc"}:
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
                  {skipped ? "Cập nhật lại" : "Bỏ qua"}
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
          placeholder="Tên môn"
          className="h-8 text-sm px-2.5 flex-[2] min-w-0 max-w-[220px]"
        />
        {/* Time pair — fixed widths so HH:MM never crops. */}
        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          value={item.startTime}
          onChange={(e) => onChange({ startTime: e.target.value })}
          placeholder="HH:MM"
          className="h-8 text-xs tabular-nums w-[68px] px-1.5 text-center shrink-0"
        />
        <span className="text-muted-foreground text-xs shrink-0">–</span>
        <Input
          value={item.endTime ?? ""}
          onChange={(e) => onChange({ endTime: e.target.value })}
          placeholder="HH:MM"
          className="h-8 text-xs tabular-nums w-[68px] px-1.5 text-center shrink-0"
        />
        {/* Location — fills remaining space. */}
        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
        <Input
          value={item.location ?? ""}
          onChange={(e) => onChange({ location: e.target.value })}
          placeholder="Phòng"
          className="h-8 text-xs px-2 flex-1 min-w-0"
        />
        <button
          onClick={onRemove}
          className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors flex items-center justify-center"
          aria-label="Bỏ"
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {!valid && (
        <p className="text-[10px] text-destructive mt-1.5 inline-flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Chưa hợp lệ — kiểm tra title & giờ.
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

// Track usage to silence linter for unused parser fn (it's used via parseAny).
void parseTimetableText;

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

