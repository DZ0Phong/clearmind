import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { useTasks } from "@/hooks/use-tasks"

export function CalendarView() {
  const { tasks } = useTasks()

  const events = tasks
    .filter(t => t.deadline)
    .map(t => ({
      id: t.id,
      title: t.title,
      date: t.deadline, // Assuming deadline is ISO string like YYYY-MM-DD
      backgroundColor: t.type === "academic" ? "var(--primary)" : t.type === "work" ? "var(--secondary)" : "var(--muted)",
    }))

  return (
    <div className="h-full w-full">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek"
        }}
        events={events}
        height="100%"
        expandRows={true}
        stickyHeaderDates={true}
      />
    </div>
  )
}
