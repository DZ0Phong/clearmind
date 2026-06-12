import { Check } from "lucide-react";
import { useAccent, ACCENTS, type Accent } from "@/components/accent-provider";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ORDER: Accent[] = ["indigo", "violet", "blue", "emerald", "rose", "orange"];

// Circular color swatches. Active one gets a ring + check. Wrapped in the
// same pill shell as ThemePicker/LanguagePicker so the three Settings rows
// share one vertical rhythm — `inline-flex items-center gap-2 p-1
// rounded-xl border bg-muted/40`.
export function AccentPicker() {
  const { accent, setAccent } = useAccent();
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t("settings.accent.label")}
      className="inline-flex items-center gap-2 p-1 rounded-xl border bg-muted/40 flex-wrap"
    >
      {ORDER.map((a) => {
        const color = ACCENTS[a].light;
        const active = accent === a;
        return (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setAccent(a)}
            title={t(`accent.${a}`)}
            style={{ background: color }}
            className={cn(
              "cm-press relative h-7 w-7 rounded-full transition-all duration-200",
              "hover:scale-110",
              active
                ? "ring-2 ring-offset-2 ring-foreground/40 ring-offset-background scale-110"
                : "ring-1 ring-black/10 dark:ring-white/10"
            )}
          >
            {active && (
              <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" strokeWidth={3} />
            )}
          </button>
        );
      })}
    </div>
  );
}
