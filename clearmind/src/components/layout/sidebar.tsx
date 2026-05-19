import { Calendar, CheckSquare, Home, LayoutDashboard, Settings } from "lucide-react"

export function Sidebar() {
  return (
    <aside className="w-64 border-r bg-muted/40 h-screen flex flex-col hidden md:flex">
      <div className="p-6">
        <h2 className="text-2xl font-bold tracking-tight text-primary">Clearmind</h2>
        <p className="text-sm text-muted-foreground mt-1">Your external brain</p>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-md bg-secondary text-secondary-foreground transition-colors">
          <LayoutDashboard className="h-5 w-5" />
          <span className="font-medium">Dashboard</span>
        </a>
        <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors">
          <Calendar className="h-5 w-5" />
          <span className="font-medium">Calendar</span>
        </a>
        <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors">
          <CheckSquare className="h-5 w-5" />
          <span className="font-medium">Tasks</span>
        </a>
      </nav>

      <div className="p-4 border-t">
        <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors">
          <Settings className="h-5 w-5" />
          <span className="font-medium">Settings</span>
        </a>
      </div>
    </aside>
  )
}
