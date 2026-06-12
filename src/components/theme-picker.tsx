import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", icon: Sun, key: "theme.light" },
  { value: "system", icon: Monitor, key: "theme.system" },
  { value: "dark", icon: Moon, key: "theme.dark" },
] as const;

// Segmented 3-way theme picker for Settings. Shares state with the topbar
// ModeToggle through ThemeProvider context.
export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t("settings.theme.label")}
      className="inline-flex items-center gap-1 p-1 rounded-xl border bg-muted/40"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(opt.value)}
            className={cn(
              "cm-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
              active
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <Icon className={cn("h-4 w-4 transition-transform duration-200", active && "scale-110")} />
            {t(opt.key)}
          </button>
        );
      })}
    </div>
  );
}
