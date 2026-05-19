import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ModeToggle } from "@/components/mode-toggle"
import { Settings } from "lucide-react"

export function SettingsPage() {
  return (
    <div className="h-full flex flex-col gap-6">
      <div className="shrink-0">
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground mt-1">
          Manage your app preferences and configurations.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto max-w-3xl">
        <div className="grid gap-6">
          <Card className="border-primary/10 shadow-sm backdrop-blur-xl bg-card/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Appearance
              </CardTitle>
              <CardDescription>
                Customize how Clearmind looks on your device.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border bg-background/50">
                <div>
                  <h3 className="font-medium">Theme Preference</h3>
                  <p className="text-sm text-muted-foreground">Select between light, dark, or system default themes.</p>
                </div>
                <ModeToggle />
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/10 shadow-sm backdrop-blur-xl bg-card/80">
            <CardHeader>
              <CardTitle>Data & Storage</CardTitle>
              <CardDescription>
                Manage your local data. Currently, all tasks are stored in your browser's LocalStorage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border bg-destructive/10 border-destructive/20 text-destructive">
                <div>
                  <h3 className="font-medium text-destructive">Clear All Data</h3>
                  <p className="text-sm opacity-90">Permanently delete all tasks from this browser.</p>
                </div>
                <button 
                  onClick={() => {
                    if(confirm("Are you sure you want to delete all data? This cannot be undone.")) {
                      localStorage.removeItem("clearmind-tasks")
                      window.location.reload()
                    }
                  }}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
                >
                  Clear Data
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
