import { useEffect, useRef } from "react";
import { useTasks } from "@/hooks/use-tasks";
import { useToast } from "@/components/toast";
import { useT } from "@/lib/i18n";

/**
 * Silent duplicate-task auto-cleaner. On its first observation of
 * duplicate weekly slots (same subject + dow + time + room) it removes
 * the older copies and surfaces a toast with an Undo action — no buttons
 * to find. Subsequent task changes are ignored on purpose: if the user
 * Undoes the cleanup, we don't fight them; if new duplicates appear
 * during the session they can be cleared from /tasks (or by refreshing
 * the app, which re-mounts this component).
 *
 * Detection signature mirrors `clearDuplicates` in use-tasks.tsx so what
 * we count matches what actually gets removed.
 *
 * Renders nothing — the toast does the talking.
 */
function countDuplicates(
  tasks: ReadonlyArray<{
    title: string;
    deadline?: string;
    recurrence?: string | null;
    location?: string;
  }>
): number {
  const seen = new Set<string>();
  let dups = 0;
  for (const t of tasks) {
    if (!t.recurrence || !t.deadline) continue;
    const d = new Date(t.deadline);
    if (Number.isNaN(d.getTime())) continue;
    const dow = d.getDay();
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    const title = t.title.trim().toLowerCase();
    const loc = (t.location || "").trim().toLowerCase();
    const sig = `${t.recurrence}|${dow}|${hh}:${mm}|${title}|${loc}`;
    if (seen.has(sig)) dups++;
    else seen.add(sig);
  }
  return dups;
}

export function DuplicateBanner() {
  const { tasks, clearDuplicates } = useTasks();
  const { toast } = useToast();
  const t = useT();
  // Clean at most ONCE per mount. Without this, an Undo on the cleanup
  // toast would restore the dup, the effect would fire again, and we'd
  // delete it right back — Undo silently no-op'd from the user's side.
  const cleanedOnceRef = useRef(false);

  useEffect(() => {
    if (cleanedOnceRef.current) return;
    if (tasks.length === 0) return;
    const n = countDuplicates(tasks);
    if (n === 0) return;
    cleanedOnceRef.current = true;
    // Defer one tick so this auto-clean doesn't fight a load-time setter
    // that's still settling. Also keeps React from warning about setState
    // during render in dev.
    const id = setTimeout(() => {
      const { removed, removedNames, restore } = clearDuplicates();
      if (removed > 0) {
        // Show the actual task titles that were removed so the user
        // can verify the dedup matched their intent. Truncate at 5
        // names — beyond that the toast wraps awkwardly.
        const head = removedNames.slice(0, 5).join(" · ");
        const tail =
          removedNames.length > 5
            ? ` · +${removedNames.length - 5}`
            : "";
        toast({
          title: t("dup.toast.autoCleaned", { n: removed }),
          description: `${head}${tail}`,
          variant: "default",
          action: { label: t("common.undo"), onClick: restore },
        });
      }
    }, 250);
    return () => clearTimeout(id);
  }, [tasks, clearDuplicates, toast, t]);

  return null;
}
