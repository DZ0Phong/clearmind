import { useI18n, useT } from "@/lib/i18n";

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
      className="cm-seg-track"
    >
      {OPTIONS.map((opt) => {
        const active = lang === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active}
            onClick={() => setLang(opt.value)}
            className="cm-seg-item cm-press"
          >
            <span className="font-bold tabular-nums">{opt.short}</span>
            <span className="opacity-70 hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
