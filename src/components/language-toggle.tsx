import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Toggle 2 chiều EN ↔ VI. Pill style giống các badge khác trong topbar.
export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "vi" ? "en" : "vi")}
      title={t("tooltip.languageToggle")}
      aria-label={t("tooltip.languageToggle")}
      className={cn(
        "inline-flex items-center h-9 px-2.5 rounded-md text-xs font-semibold tracking-wide",
        "border border-input bg-background hover:bg-accent text-foreground transition-colors",
        "tabular-nums"
      )}
    >
      <span className={cn(lang === "vi" ? "text-foreground" : "text-muted-foreground/50")}>VI</span>
      <span className="mx-1 text-muted-foreground/40">/</span>
      <span className={cn(lang === "en" ? "text-foreground" : "text-muted-foreground/50")}>EN</span>
    </button>
  );
}
