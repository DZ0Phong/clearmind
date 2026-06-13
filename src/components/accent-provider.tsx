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
  // Classic — Tailwind hue wheel (16). These were the original palette and
  // remain the safe defaults for users who want a familiar tint.
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
  | "slate"
  // Pastel — softer mid-saturation tones that read as calm/study-friendly.
  | "lavender"
  | "mint"
  | "peach"
  | "blush"
  // Earthy/Warm — rich organic tones for warm-leaning users.
  | "terracotta"
  | "mustard"
  | "rust"
  | "olive"
  // Vibrant/Trendy — saturated picks for high-energy UIs.
  | "magenta"
  | "lime"
  | "aqua"
  | "cobalt"
  // Accessible — picks designed around the Okabe-Ito colorblind-safe
  // palette so deuteranopic / protanopic users get a tint that doesn't
  // collide with semantic green/red elsewhere in the UI.
  | "vermillion"
  | "bluegray"
  // Neutral / professional — quiet tones for focus-mode aesthetics.
  | "graphite"
  | "mocha";

interface Pair {
  light: string;
  dark: string;
}

// Light/dark hex pairs — light shade pops on white (off-white card bg),
// dark shade pops on near-black (slate-950 page). Each pair was tuned
// to avoid:
//   - too pale on light mode (sinks into the surface)
//   - too saturated on dark mode (vibrates / hurts the eye)
//
// Categorisation is encoded in [[accent-picker]]'s SECTIONS array so the
// popover can group by mood. The raw record below stays flat for O(1)
// lookup at runtime.
export const ACCENTS: Record<Accent, Pair> = {
  // --- Classic (Tailwind 500/400) ---
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
  // --- Pastel ---
  lavender: { light: "#8e7bd9", dark: "#b8a8ec" },
  mint: { light: "#4eb89c", dark: "#7dd9bc" },
  peach: { light: "#f08862", dark: "#f9a98a" },
  blush: { light: "#e07a98", dark: "#f0a8be" },
  // --- Earthy / Warm ---
  terracotta: { light: "#c0563d", dark: "#df7e62" },
  mustard: { light: "#c79a36", dark: "#dcb55a" },
  rust: { light: "#9c4422", dark: "#c46b48" },
  olive: { light: "#7a8a36", dark: "#a5b556" },
  // --- Vibrant / Trendy ---
  magenta: { light: "#d028a8", dark: "#e84cb4" },
  lime: { light: "#65a30d", dark: "#a3e635" },
  aqua: { light: "#08bda0", dark: "#36dbb9" },
  cobalt: { light: "#1d4ed8", dark: "#4f7be7" },
  // --- Accessible (Okabe-Ito derived) ---
  vermillion: { light: "#d55e00", dark: "#f08549" },
  bluegray: { light: "#5e7d9d", dark: "#86a3c2" },
  // --- Neutral / Professional ---
  graphite: { light: "#404555", dark: "#6e7689" },
  mocha: { light: "#6b4a2f", dark: "#a37553" },
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
