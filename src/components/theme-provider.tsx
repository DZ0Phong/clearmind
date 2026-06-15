import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  isCliMode,
  inlineSettings,
  cliPutSettings,
  subscribeSettings,
} from "@/lib/cli-bridge"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "clearmind-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      // CLI mode: the server-injected settings are the shared source of
      // truth (synced across the desktop app, browser, and mobile). Fall
      // back to localStorage, then the default.
      if (isCliMode()) {
        const t = inlineSettings()?.theme;
        if (t === "light" || t === "dark" || t === "system") return t;
      }
      return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
    } catch {
      return defaultTheme;
    }
  })

  useEffect(() => {
    const root = window.document.documentElement
    const apply = () => {
      root.classList.remove("light", "dark")
      if (theme === "system") {
        const sys = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        root.classList.add(sys)
      } else {
        root.classList.add(theme)
      }
    }
    apply()
    if (theme !== "system") return
    // Live-track OS color scheme change while user sits on "system".
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const listener = () => apply()
    mq.addEventListener("change", listener)
    return () => mq.removeEventListener("change", listener)
  }, [theme])

  // Cross-tab sync: when another browser tab flips the theme, mirror it
  // here. `storage` event fires on every other tab when localStorage is
  // written, so this gives near-instant propagation without needing a
  // separate channel.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return
      const next = e.newValue as Theme | null
      if (next === "light" || next === "dark" || next === "system") {
        setTheme(next)
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [storageKey])

  // CLI mode: mirror theme changes from other clients (desktop app ↔
  // browser ↔ mobile) over the shared settings SSE.
  useEffect(() => {
    return subscribeSettings((s) => {
      const next = s.theme
      if (next === "light" || next === "dark" || next === "system") {
        setTheme(next)
      }
    })
  }, [])

  // Memoize so consumers don't re-render on every parent update. Storage
  // write wrapped in try/catch — private mode + quota.
  const setThemeStable = useCallback(
    (next: Theme) => {
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        /* ignore */
      }
      // Push to the shared store so every other client mirrors it.
      if (isCliMode()) cliPutSettings({ theme: next }).catch(() => {})
      setTheme(next)
    },
    [storageKey]
  )
  const value = useMemo(
    () => ({ theme, setTheme: setThemeStable }),
    [theme, setThemeStable]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
