import { useI18n, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "vi" as const, label: "Tiếng Việt", short: "VI" },
  { value: "en" as const, label: "English", short: "EN" },
];

// Segmented language picker for Settings. Shares state with the topbar
// LanguageToggle through I18nProvider context — set sync to localStorage
// + PUT /api/locale so CLI notifications use the right language too.
export function LanguagePicker() {
  const { lang, setLang } = useI18n();
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t("settings.language.label")}
      className="inline-flex items-center gap-1 p-1 rounded-xl border bg-muted/40"
    >
      {OPTIONS.map((opt) => {
        const active = lang === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLang(opt.value)}
            className={cn(
              "cm-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
              active
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <span className="font-bold tabular-nums">{opt.short}</span>
            <span className="opacity-70 hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
