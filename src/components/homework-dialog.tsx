import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { DateTimePicker } from "@/components/date-time-picker";
import { useTasks, type Task } from "@/hooks/use-tasks";
import { useT, useDateFns } from "@/lib/i18n";
import {
  BookOpen,
  Clock,
  CalendarRange,
  Calendar,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { cn, extractSubjectCode } from "@/lib/utils";

interface Props {
  parentTask: Task;
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

type Choice = "next-session" | "next-week" | "this-week-end" | "custom";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toLocalDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/**
 * Group key for sessions of the same course. Uses canonical
 * {@link extractSubjectCode} when title carries a FPT-style code; otherwise
 * falls back to the first whitespace/dash-separated word lowercased so
 * non-course parents (one-off events) still group sanely.
 */
function subjectKey(title: string): string {
  const code = extractSubjectCode(title);
  if (code) return code;
  return title.toLowerCase().split(/[\s—-]/)[0];
}

export function HomeworkDialog({ parentTask, open, onOpenChange }: Props) {
  const { tasks, addTask } = useTasks();
  const t = useT();
  const { formatDeadline } = useDateFns();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [choice, setChoice] = useState<Choice>("next-week");
  const [customDeadline, setCustomDeadline] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setChoice("next-week");
      setCustomDeadline("");
    }
  }, [open]);

  // Find the next session of the SAME subject — any future task tagged
  // #lich-hoc with matching subject key. After the one-off import switch
  // each class meeting is its own task with deadline=that specific day,
  // so the candidate set is just "future class meetings of the same
  // subject" — no recurrence walking required.
  const nextSessionDate = useMemo<Date | null>(() => {
    if (!parentTask.deadline) return null;
    const subjPrefix = subjectKey(parentTask.title);
    const parentDate = new Date(parentTask.deadline);
    const candidates: Date[] = [];
    for (const t of tasks) {
      if (t.id === parentTask.id) continue;
      if (!t.deadline) continue;
      if (!(t.tags || []).includes("lich-hoc")) continue;
      if (subjectKey(t.title) !== subjPrefix) continue;
      const d = new Date(t.deadline);
      if (d <= parentDate) continue;
      candidates.push(d);
    }
    // Fallback: same task one week later (covers users who haven't
    // imported next week yet but want to pin homework to that slot).
    const selfNext = new Date(parentDate);
    selfNext.setDate(selfNext.getDate() + 7);

    candidates.sort((a, b) => a.getTime() - b.getTime());
    const inWeek = candidates.find((d) => d.getTime() < selfNext.getTime());
    return inWeek || null;
  }, [tasks, parentTask]);

  const nextWeekDate = useMemo<Date | null>(() => {
    if (!parentTask.deadline) return null;
    const d = new Date(parentTask.deadline);
    d.setDate(d.getDate() + 7);
    return d;
  }, [parentTask]);

  const thisWeekEndDate = useMemo<Date | null>(() => {
    const d = new Date();
    // End of Sunday (0=Sunday, treat Monday as week start: end-of-week = Sunday)
    const today = d.getDay(); // 0..6
    const diff = today === 0 ? 0 : 7 - today;
    d.setDate(d.getDate() + diff);
    d.setHours(23, 59, 0, 0);
    return d;
  }, []);

  // Resolve the deadline based on current choice
  const computedDeadline = useMemo<string>(() => {
    if (choice === "custom") return customDeadline;
    let d: Date | null = null;
    if (choice === "next-session") d = nextSessionDate;
    else if (choice === "next-week") d = nextWeekDate;
    else if (choice === "this-week-end") d = thisWeekEndDate;
    if (!d) return "";
    return toLocalDateTime(d);
  }, [choice, customDeadline, nextSessionDate, nextWeekDate, thisWeekEndDate]);

  const canSave = title.trim().length >= 2 && computedDeadline.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    addTask({
      title: title.trim(),
      description: description.trim() || undefined,
      type: "academic",
      priority: "medium",
      parentId: parentTask.id,
      deadline: new Date(computedDeadline).toISOString(),
      tags: Array.from(
        new Set([...(parentTask.tags || []), "bai-tap"])
      ),
      notify: "1d",
    });
    onOpenChange(false);
  };

  const choices: Array<{
    id: Choice;
    label: string;
    sublabel: string | null;
    icon: typeof Clock;
    available: boolean;
  }> = [
    {
      id: "next-session",
      label: t("homework.choice.nextSession"),
      sublabel: nextSessionDate
        ? formatDeadline(toLocalDateTime(nextSessionDate))
        : t("homework.choice.nextSession.empty"),
      icon: Clock,
      available: !!nextSessionDate,
    },
    {
      id: "next-week",
      label: t("homework.choice.nextWeek"),
      sublabel: nextWeekDate
        ? formatDeadline(toLocalDateTime(nextWeekDate))
        : null,
      icon: CalendarRange,
      available: !!nextWeekDate,
    },
    {
      id: "this-week-end",
      label: t("homework.choice.thisWeekEnd"),
      sublabel: thisWeekEndDate
        ? formatDeadline(toLocalDateTime(thisWeekEndDate))
        : null,
      icon: Calendar,
      available: !!thisWeekEndDate,
    },
    {
      id: "custom",
      label: t("homework.choice.custom"),
      sublabel: customDeadline
        ? formatDeadline(customDeadline)
        : t("homework.choice.custom.empty"),
      icon: Sparkles,
      available: true,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[92vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            {t("homework.title")}
          </DialogTitle>
          <DialogDescription>
            {t("homework.parentOf")}{" "}
            <span className="font-medium">{parentTask.title}</span>
            {parentTask.location && ` (${parentTask.location})`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="grid gap-4 px-6 py-2 overflow-y-auto flex-1 min-h-0">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("homework.contentLabel")}
              </label>
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("homework.contentPh")}
                className="mt-1.5 h-10"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("homework.notesLabel")}
              </label>
              <AutoTextarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("homework.notesPh")}
                className="mt-1.5 min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,height] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("homework.deadlineLabel")}
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {choices.map((c) => {
                  const Icon = c.icon;
                  const active = choice === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setChoice(c.id)}
                      disabled={!c.available}
                      className={cn(
                        "flex flex-col items-start gap-0.5 p-3 rounded-lg border text-left transition-all",
                        active
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-input bg-background hover:bg-accent/40 text-muted-foreground",
                        !c.available && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                        <Icon className="h-3.5 w-3.5" />
                        {c.label}
                      </span>
                      {c.sublabel && (
                        <span
                          className={cn(
                            "text-[11px] tabular-nums",
                            active ? "text-primary" : "text-muted-foreground/70"
                          )}
                        >
                          {c.sublabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {choice === "custom" && (
                <div className="mt-2">
                  <DateTimePicker
                    value={customDeadline}
                    onChange={setCustomDeadline}
                    placeholder={t("homework.customPickerPh")}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 px-6 py-4 border-t bg-background shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSave} className="gap-2">
              <CheckCircle2 className="h-4 w-4" /> {t("homework.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
