import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { useAccent, ACCENTS, type Accent } from "@/components/accent-provider";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Inline pinned swatches — the original 6 (spread across the hue wheel so
// the inline row works as a "popular picks" preview). The full 16-color
// palette lives behind the More popover; this keeps the Settings row from
// turning into a 2-row block of dots that overwhelms the page.
const INLINE: Accent[] = [
  "indigo",
  "violet",
  "blue",
  "emerald",
  "rose",
  "orange",
];

// Full palette, hue-ordered, surfaced in the popover.
const ALL: Accent[] = [
  "red",
  "rose",
  "pink",
  "fuchsia",
  "purple",
  "violet",
  "indigo",
  "blue",
  "sky",
  "cyan",
  "teal",
  "emerald",
  "green",
  "amber",
  "orange",
  "slate",
];

export function AccentPicker() {
  const { accent, setAccent } = useAccent();
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Dismiss on click-outside + ESC. Bound only while the popover is open
  // so the rest of the time we're not paying for the listener.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeIsExtra = !INLINE.includes(accent);

  return (
    <div
      ref={rootRef}
      role="radiogroup"
      aria-label={t("settings.accent.label")}
      className="relative inline-flex items-center gap-1.5 p-1.5 rounded-xl border bg-muted/40"
    >
      {INLINE.map((a) => (
        <Swatch
          key={a}
          accent={a}
          active={accent === a}
          onPick={() => setAccent(a)}
        />
      ))}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("settings.accent.more")}
        aria-label={t("settings.accent.more")}
        aria-expanded={open}
        data-testid="accent-more"
        className={cn(
          "cm-press relative h-7 w-7 rounded-full flex items-center justify-center transition-all",
          "border border-input bg-background hover:bg-accent",
          // If the selected accent isn't in the inline row, surface it on
          // the More button as a small inset dot so the user can still see
          // their pick at a glance.
          activeIsExtra
            ? "ring-2 ring-offset-2 ring-foreground/40 ring-offset-background"
            : "hover:scale-110"
        )}
      >
        {activeIsExtra ? (
          <span
            aria-hidden
            style={{ background: ACCENTS[accent].light }}
            className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10 dark:ring-white/10"
          />
        ) : (
          <Palette className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div
          data-testid="accent-popover"
          className={cn(
            "absolute top-full mt-2 right-0 z-50",
            "w-[280px] p-2.5 rounded-xl border bg-popover shadow-xl",
            "animate-in fade-in slide-in-from-top-1 duration-150"
          )}
        >
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1 mb-2">
            {t("settings.accent.label")}
          </p>
          <div className="grid grid-cols-8 gap-1.5">
            {ALL.map((a) => (
              <Swatch
                key={a}
                accent={a}
                active={accent === a}
                onPick={() => {
                  setAccent(a);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Swatch({
  accent,
  active,
  onPick,
}: {
  accent: Accent;
  active: boolean;
  onPick: () => void;
}) {
  const t = useT();
  const color = ACCENTS[accent].light;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onPick}
      title={t(`accent.${accent}`)}
      style={{ background: color }}
      className={cn(
        "cm-press relative h-7 w-7 rounded-full transition-all duration-200",
        "hover:scale-110 hover:shadow-md",
        active
          ? "ring-2 ring-offset-2 ring-foreground/40 ring-offset-background scale-110 shadow-lg"
          : "ring-1 ring-black/10 dark:ring-white/10"
      )}
    >
      {active && (
        <Check
          className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow"
          strokeWidth={3}
        />
      )}
    </button>
  );
}
