import { useState } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { useTasks } from "@/hooks/use-tasks"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Trash2, AlignLeft } from "lucide-react"

export function CalendarView() {
  const { tasks, updateTask, removeTask } = useTasks()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const events = tasks
    .filter(t => t.deadline)
    .map(t => ({
      id: t.id,
      title: t.title,
      date: t.deadline, // Assuming deadline is ISO string like YYYY-MM-DD
      backgroundColor: t.type === "academic" ? "var(--primary)" : t.type === "work" ? "var(--secondary)" : "var(--muted)",
      extendedProps: {
        description: t.description,
        type: t.type,
        priority: t.priority,
        status: t.status
      }
    }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDrop = (info: any) => {
    const taskId = info.draggedEl.getAttribute('data-id');
    if (taskId) {
      updateTask(taskId, { deadline: info.dateStr });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventDrop = (info: any) => {
    const taskId = info.event.id;
    if (taskId) {
      updateTask(taskId, { deadline: info.event.startStr.split('T')[0] });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventReceive = (info: any) => {
    // Revert the event that FullCalendar automatically creates upon drop.
    // Our React state will update and render the event properly.
    info.revert();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDateClick = (info: any) => {
    setSelectedDate(info.dateStr)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventClick = (info: any) => {
    setSelectedEventId(info.event.id)
  }

  const selectedTask = selectedEventId ? tasks.find(t => t.id === selectedEventId) : null
  const dayTasks = selectedDate ? tasks.filter(t => t.deadline === selectedDate) : []

  return (
    <div className="h-full w-full relative">
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
        droppable={true}
        drop={handleDrop}
        editable={true}
        eventDrop={handleEventDrop}
        eventReceive={handleEventReceive}
        dateClick={handleDateClick}
        eventClick={handleEventClick}
      />

      {/* Event Details Modal */}
      <Dialog open={!!selectedEventId} onOpenChange={(open) => !open && setSelectedEventId(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedTask?.title}</DialogTitle>
            <div className="flex gap-2 mt-2">
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md font-medium capitalize">{selectedTask?.type}</span>
              <span className="text-xs bg-secondary px-2 py-1 rounded-md font-medium capitalize">{selectedTask?.priority} Priority</span>
            </div>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {selectedTask?.description ? (
              <div className="flex gap-3 text-muted-foreground bg-muted/30 p-3 rounded-lg border">
                <AlignLeft className="w-5 h-5 shrink-0" />
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{selectedTask.description}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description provided.</p>
            )}
            
            <div className="pt-4 flex items-center justify-between border-t border-border/50">
               <span className="text-sm font-medium">Status: <span className="capitalize">{selectedTask?.status}</span></span>
               <Button 
                variant="destructive" 
                size="sm" 
                className="gap-2"
                onClick={() => {
                  if (selectedTask?.id) {
                    removeTask(selectedTask.id);
                    setSelectedEventId(null);
                  }
                }}
              >
                <Trash2 className="w-4 h-4" /> Delete
               </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Day Overview Modal */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Events on {selectedDate}</DialogTitle>
            <DialogDescription>
              {dayTasks.length === 0 ? "Your schedule is clear for this day." : `You have ${dayTasks.length} event(s) scheduled.`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {dayTasks.length > 0 && (
              <div className="space-y-3">
                {dayTasks.map(task => (
                  <div key={task.id} className="p-3 border rounded-xl bg-card hover:bg-accent cursor-pointer transition-colors" onClick={() => {
                    setSelectedDate(null);
                    setSelectedEventId(task.id);
                  }}>
                    <p className="font-medium text-sm">{task.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{task.description || "No description"}</p>
                  </div>
                ))}
              </div>
            )}
            {/* Can add a quick add form here in the future */}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
