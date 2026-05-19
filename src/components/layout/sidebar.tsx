import { Calendar, CheckSquare, LayoutDashboard, Settings } from "lucide-react"

export function Sidebar() {
  return (
    <aside className="w-64 border-r bg-background/60 backdrop-blur-xl h-screen flex flex-col hidden md:flex z-10">
      <div className="p-6">
        <h2 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center shrink-0">
            <div className="w-3 h-3 rounded-full bg-primary" />
          </div>
          Clearmind
        </h2>
        <p className="text-sm text-muted-foreground mt-1 ml-8">Your external brain</p>
      </div>

      <nav className="flex-1 px-4 space-y-1.5 mt-4">
        <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary transition-colors font-medium">
          <LayoutDashboard className="h-4 w-4" />
          <span>Dashboard</span>
        </a>
        <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all duration-300 font-medium">
          <Calendar className="h-4 w-4" />
          <span>Calendar</span>
        </a>
        <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all duration-300 font-medium">
          <CheckSquare className="h-4 w-4" />
          <span>Tasks</span>
        </a>
      </nav>

      <div className="p-4 border-t border-border/50">
        <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all duration-300 font-medium">
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </a>
      </div>
    </aside>
  )
}
