import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTasks } from "@/hooks/use-tasks"
import { CheckCircle2, Clock } from "lucide-react"
import { CalendarView } from "@/components/calendar-view"

export function Dashboard() {
  const { tasks } = useTasks()

  const todayTasks = tasks.filter(t => t.status !== "done").slice(0, 3)
  const dueSoonTasks = tasks.filter(t => t.status !== "done" && t.deadline).slice(0, 5)

  return (
    <div className="h-full flex-1 flex flex-col gap-6">
      <div className="shrink-0">
        <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
        <p className="text-muted-foreground mt-1">
          Here's what you need to focus on today.
        </p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        {/* Left Column: Tasks */}
        <div className="flex flex-col gap-6 overflow-y-auto pr-2 pb-2">
          {/* Today Lock */}
          <Card className="border-primary/20 shadow-sm backdrop-blur-xl bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Today's Focus
              </CardTitle>
              <CardDescription>Your top priorities</CardDescription>
            </CardHeader>
            <CardContent>
              {todayTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  You're all caught up for today!
                </p>
              ) : (
                <div className="space-y-3">
                  {todayTasks.map((task) => (
                    <div key={task.id} className="group flex items-start gap-3 p-3 rounded-xl border bg-background/50 hover:bg-accent hover:-translate-y-0.5 hover:shadow-md transition-all duration-300">
                      <div className="h-5 w-5 rounded-full border-2 border-primary/50 mt-0.5 shrink-0 group-hover:border-primary transition-colors" />
                      <div>
                        <p className="font-medium text-sm leading-none">{task.title}</p>
                        <p className="text-xs text-muted-foreground mt-1.5 capitalize">{task.type} • {task.priority}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Due Soon */}
          <Card className="shadow-sm backdrop-blur-xl bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
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
                <div className="space-y-3">
                   {dueSoonTasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-3 rounded-xl border bg-background/50 hover:bg-accent transition-colors duration-300">
                      <div className="flex flex-col gap-1.5">
                         <p className="font-medium text-sm leading-tight">{task.title}</p>
                         <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 w-fit">{task.deadline}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Right Column: Calendar Area */}
        <div className="lg:col-span-2 h-full min-h-[500px] lg:min-h-0 bg-card/50 backdrop-blur-xl rounded-2xl border shadow-sm p-4 flex flex-col">
          <div className="flex-1 min-h-0 h-full w-full">
            <CalendarView />
          </div>
        </div>
      </div>
    </div>
  )
}
