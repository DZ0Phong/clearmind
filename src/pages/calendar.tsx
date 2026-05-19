import { CalendarView } from "@/components/calendar-view"

export function CalendarPage() {
  return (
    <div className="h-full flex flex-col gap-6">
      <div className="shrink-0">
        <h2 className="text-3xl font-bold tracking-tight">Calendar</h2>
        <p className="text-muted-foreground mt-1">
          Manage your schedule and upcoming deadlines.
        </p>
      </div>
      <div className="flex-1 min-h-[500px] bg-card/50 backdrop-blur-xl rounded-2xl border shadow-sm p-4 flex flex-col">
        <div className="flex-1 min-h-0 h-full w-full">
          <CalendarView />
        </div>
      </div>
    </div>
  )
}
