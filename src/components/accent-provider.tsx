/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Accent =
  | "red"
  | "rose"
  | "pink"
  | "fuchsia"
  | "purple"
  | "violet"
  | "indigo"
  | "blue"
  | "sky"
  | "cyan"
  | "teal"
  | "emerald"
  | "green"
  | "amber"
  | "orange"
  | "slate";

interface Pair {
  light: string;
  dark: string;
}

// Light/dark hex pairs — light shade is 500 (pops on white), dark shade
// is 400 (pops on near-black) from the Tailwind palette. Both variants
// were eyeballed against the actual app surface to avoid:
//   - too pale on light mode (sinks into the off-white card bg)
//   - too saturated on dark mode (vibrates against the slate-950 page)
// Order follows the visible hue wheel (red → orange) + slate at the end
// as a neutral option for users who want a quiet UI.
export const ACCENTS: Record<Accent, Pair> = {
  red: { light: "#ef4444", dark: "#f87171" },
  rose: { light: "#f43f5e", dark: "#fb7185" },
  pink: { light: "#ec4899", dark: "#f472b6" },
  fuchsia: { light: "#d946ef", dark: "#e879f9" },
  purple: { light: "#a855f7", dark: "#c084fc" },
  violet: { light: "#8b5cf6", dark: "#a78bfa" },
  indigo: { light: "#6366f1", dark: "#818cf8" },
  blue: { light: "#3b82f6", dark: "#60a5fa" },
  sky: { light: "#0ea5e9", dark: "#38bdf8" },
  cyan: { light: "#06b6d4", dark: "#22d3ee" },
  teal: { light: "#14b8a6", dark: "#2dd4bf" },
  emerald: { light: "#10b981", dark: "#34d399" },
  green: { light: "#22c55e", dark: "#4ade80" },
  amber: { light: "#f59e0b", dark: "#fbbf24" },
  orange: { light: "#f97316", dark: "#fb923c" },
  slate: { light: "#64748b", dark: "#94a3b8" },
};

const STORAGE_KEY = "clearmind-accent";

interface State {
  accent: Accent;
  setAccent: (a: Accent) => void;
}

const Ctx = createContext<State>({
  accent: "indigo",
  setAccent: () => {},
});

function isAccent(v: string | null): v is Accent {
  return !!v && v in ACCENTS;
}

export function AccentProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<Accent>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return isAccent(v) ? v : "indigo";
    } catch {
      return "indigo";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      // Indigo = default — let :root / .dark from index.css win, no override.
      if (accent === "indigo") {
        root.style.removeProperty("--primary");
        root.style.removeProperty("--ring");
        return;
      }
      const isDark = root.classList.contains("dark");
      const color = ACCENTS[accent][isDark ? "dark" : "light"];
      root.style.setProperty("--primary", color);
      root.style.setProperty("--ring", color);
    };
    apply();
    // Re-apply when the .light/.dark class flips (ThemeProvider mutation).
    const obs = new MutationObserver(apply);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [accent]);

  // Cross-tab sync: mirror accent picked in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (isAccent(e.newValue)) setAccentState(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setAccent = useCallback((a: Accent) => {
    try {
      localStorage.setItem(STORAGE_KEY, a);
    } catch {
      /* storage full / private mode — ignore */
    }
    setAccentState(a);
  }, []);

  const value = useMemo(() => ({ accent, setAccent }), [accent, setAccent]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccent() {
  return useContext(Ctx);
}
