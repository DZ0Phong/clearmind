import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  className?: string;
  ariaLabel?: string;
  id?: string;
  size?: "sm" | "default";
  /** Optional leading icon inside the trigger (e.g. a sort glyph). */
  leftIcon?: ReactNode;
}

/**
 * Themed dropdown to replace native <select> (whose browser/OS default box
 * — a desktop menu, a mobile wheel — clashed with the app's design system and
 * differed across platforms). Matches the DateTimePicker popover aesthetic and
 * behaves identically on desktop + mobile. Hand-rolled (not Radix) to stay
 * consistent with the existing custom-popover pattern and to nest cleanly
 * inside the task Dialog without portal/focus-scope conflicts.
 */
export function Select({
  value,
  onChange,
  options,
  className,
  ariaLabel,
  id,
  size = "default",
  leftIcon,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  // Close on outside click. Escape is handled in the CAPTURE phase so it
  // closes only this dropdown and doesn't bubble up to also close a parent
  // Dialog (the task editor) the Select may live inside.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        e.stopPropagation();
        e.preventDefault();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Flip upward when there isn't room below (e.g. near the bottom of a
  // mobile sheet). Rough height estimate is fine — it only picks a side.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estH = Math.min(options.length * 38 + 10, 288);
    setOpenUpward(rect.bottom + estH > window.innerHeight - 12);
  }, [open, options.length]);

  const trigH = size === "sm" ? "h-8 text-xs" : "h-9 text-sm";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full inline-flex items-center justify-between gap-2 rounded-md border border-input bg-background pl-3 pr-2.5 outline-none transition-[color,box-shadow] hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          trigH,
          open && "border-ring ring-[3px] ring-ring/50"
        )}
      >
        {leftIcon && (
          <span className="shrink-0 inline-flex text-muted-foreground">
            {leftIcon}
          </span>
        )}
        <span className="truncate flex-1 text-left">{current?.label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute z-50 left-0 right-0 rounded-md border bg-popover shadow-lg p-1 max-h-[288px] overflow-y-auto animate-in fade-in-0 zoom-in-95",
            openUpward ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    active ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
