import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

// Single-button 2-way toggle: light ↔ dark. When theme is "system", we pick
// the opposite of the current OS-effective scheme. For 3-way (incl. system)
// see <ThemePicker /> in Settings.
export function ModeToggle() {
  const { theme, setTheme } = useTheme()
  const [effectiveDark, setEffectiveDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  )

  // Mirror the live theme class so the icon flips when the user picks
  // "system" elsewhere and the OS scheme changes.
  useEffect(() => {
    const root = document.documentElement
    const update = () => setEffectiveDark(root.classList.contains("dark"))
    update()
    const obs = new MutationObserver(update)
    obs.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [theme])

  const Icon = effectiveDark ? Sun : Moon
  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={() => setTheme(effectiveDark ? "light" : "dark")}
      className="rounded-full cm-press"
      title={effectiveDark ? "Sáng" : "Tối"}
    >
      <Icon className="h-4 w-4 transition-transform duration-200" />
      <span className="sr-only">Toggle light/dark</span>
    </Button>
  )
}
