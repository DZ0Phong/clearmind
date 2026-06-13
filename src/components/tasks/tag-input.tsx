import { useMemo, useState, type KeyboardEvent } from "react";
import { X, Hash } from "lucide-react";
import { useTasks } from "@/hooks/use-tasks";
import { tagStats } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  max?: number;
}

export function TagInput({
  value,
  onChange,
  placeholder,
  className,
  max = 10,
}: Props) {
  const t = useT();
  const resolvedPlaceholder = placeholder ?? t("tag.input.placeholder");
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const { tasks } = useTasks();

  const suggestions = useMemo(() => {
    const all = tagStats(tasks);
    const q = draft.trim().replace(/^#/, "").toLowerCase();
    return all
      .filter((s) => !value.includes(s.name))
      .filter((s) => (q ? s.name.includes(q) : true))
      .slice(0, 6);
  }, [draft, tasks, value]);

  const add = (raw: string) => {
    const t = raw.trim().replace(/^#/, "").toLowerCase();
    if (!t) return;
    if (value.includes(t)) return;
    if (value.length >= max) return;
    onChange([...value, t]);
    setDraft("");
    setActiveIdx(0);
  };

  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (suggestions[activeIdx] && draft) {
        add(suggestions[activeIdx].name);
      } else {
        add(draft);
      }
    } else if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setFocused(false);
    } else if (e.key === "Backspace" && !draft && value.length) {
      remove(value[value.length - 1]);
    }
  };

  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium"
          >
            #{tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="opacity-60 hover:opacity-100"
              aria-label={t("tag.input.removeAria", { tag })}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setActiveIdx(0);
          }}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // mousedown trên suggestion preventDefault → blur không fire khi
            // chọn gợi ý. Khi blur thật (click ngoài) thì đóng ngay, không
            // cần setTimeout race-prone.
            setFocused(false);
            if (draft) add(draft);
          }}
          placeholder={value.length ? "" : resolvedPlaceholder}
          className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-muted-foreground py-1"
        />
      </div>

      {showSuggestions && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border bg-popover shadow-md overflow-hidden max-h-[40vh] overflow-y-auto">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 pt-2 pb-1">
            {t("tag.input.usedHeader")}
          </p>
          <div className="pb-1.5">
            {suggestions.map((s, i) => (
              <button
                key={s.name}
                type="button"
                onMouseDown={(e) => {
                  // mousedown so the input's onBlur doesn't fire first and dismiss
                  e.preventDefault();
                  add(s.name);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left transition-colors",
                  i === activeIdx ? "bg-accent" : "hover:bg-accent/60"
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{s.name}</span>
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {s.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
