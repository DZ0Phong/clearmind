import React from "react"
import { Sidebar } from "./sidebar"
import { ModeToggle } from "@/components/mode-toggle"

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background relative selection:bg-primary/30">
      {/* Background gradients for premium feel */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-accent/20 via-transparent to-transparent pointer-events-none" />
      
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative z-10">
        <header className="h-16 border-b border-border/50 bg-background/40 backdrop-blur-md flex items-center justify-between px-6 shrink-0 sticky top-0 z-20">
          <h1 className="text-xl font-semibold md:hidden flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            </div>
            Clearmind
          </h1>
          <div className="hidden md:block"></div> {/* Spacer */}
          <div className="flex items-center gap-4">
            <ModeToggle />
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 flex flex-col">
          <div className="max-w-[1600px] w-full mx-auto flex-1 flex flex-col">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
