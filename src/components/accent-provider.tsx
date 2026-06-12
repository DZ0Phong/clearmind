/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Accent =
  | "indigo"
  | "violet"
  | "blue"
  | "emerald"
  | "rose"
  | "orange";

interface Pair {
  light: string;
  dark: string;
}

// Light/dark hex pairs — light shade is 500, dark shade is 400, matching
// the default indigo treatment baked into index.css.
export const ACCENTS: Record<Accent, Pair> = {
  indigo: { light: "#6366f1", dark: "#818cf8" },
  violet: { light: "#8b5cf6", dark: "#a78bfa" },
  blue: { light: "#3b82f6", dark: "#60a5fa" },
  emerald: { light: "#10b981", dark: "#34d399" },
  rose: { light: "#f43f5e", dark: "#fb7185" },
  orange: { light: "#f97316", dark: "#fb923c" },
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

  const setAccent = (a: Accent) => {
    try {
      localStorage.setItem(STORAGE_KEY, a);
    } catch {
      /* storage full — ignore */
    }
    setAccentState(a);
  };

  return <Ctx.Provider value={{ accent, setAccent }}>{children}</Ctx.Provider>;
}

export function useAccent() {
  return useContext(Ctx);
}
