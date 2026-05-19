import React from "react"
import { Sidebar } from "./sidebar"
import { ModeToggle } from "@/components/mode-toggle"

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 border-b flex items-center justify-between px-6 shrink-0">
          <h1 className="text-xl font-semibold md:hidden">Clearmind</h1>
          <div className="hidden md:block"></div> {/* Spacer */}
          <div className="flex items-center gap-4">
            <ModeToggle />
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
