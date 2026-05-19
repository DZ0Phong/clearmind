import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTasks } from "@/hooks/use-tasks"
import { CheckCircle2, Clock } from "lucide-react"
import { CalendarView } from "@/components/calendar-view"

export function Dashboard() {
  const { tasks } = useTasks()

  const todayTasks = tasks.filter(t => t.status !== "done").slice(0, 3)
  const dueSoonTasks = tasks.filter(t => t.status !== "done" && t.deadline).slice(0, 5)

  return (
    <div className="space-y-8 h-full flex flex-col">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
        <p className="text-muted-foreground mt-2">
          Here's what you need to focus on today.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Today Lock */}
        <Card className="border-primary/20 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Today's Focus
            </CardTitle>
            <CardDescription>Your top 3 priorities for today</CardDescription>
          </CardHeader>
          <CardContent>
            {todayTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                You're all caught up for today!
              </p>
            ) : (
              <div className="space-y-4">
                {todayTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="h-5 w-5 rounded-full border-2 border-primary/50 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-sm leading-none">{task.title}</p>
                      <p className="text-xs text-muted-foreground mt-1.5 capitalize">{task.type} • {task.priority} priority</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Due Soon */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Due Soon
            </CardTitle>
            <CardDescription>Upcoming deadlines</CardDescription>
          </CardHeader>
          <CardContent>
             {dueSoonTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No upcoming deadlines.
              </p>
            ) : (
              <div className="space-y-4">
                 {dueSoonTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex flex-col gap-1">
                       <p className="font-medium text-sm leading-none">{task.title}</p>
                       <span className="text-xs text-muted-foreground">{task.deadline}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Calendar Area */}
      <div className="flex-1 mt-8 min-h-[400px]">
        <CalendarView />
      </div>
    </div>
  )
}
