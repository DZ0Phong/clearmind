import { useTasks } from "@/hooks/use-tasks"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckSquare, Trash2 } from "lucide-react"
import { QuickCapture } from "@/components/quick-capture"
import { Button } from "@/components/ui/button"

export function TasksPage() {
  const { tasks, removeTask, updateTaskStatus } = useTasks()

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">All Tasks</h2>
          <p className="text-muted-foreground mt-1">
            Manage your entire workload across all categories.
          </p>
        </div>
        <QuickCapture />
      </div>

      <div className="flex-1 overflow-y-auto">
        <Card className="border-primary/10 shadow-sm backdrop-blur-xl bg-card/80 min-h-[500px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Your Tasks
            </CardTitle>
            <CardDescription>
              {tasks.length} total tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>Inbox zero! You have no tasks.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="group flex items-center justify-between gap-4 p-4 rounded-xl border bg-background/50 hover:bg-accent transition-all duration-300">
                    <div className="flex items-start gap-4 flex-1">
                      <button 
                        onClick={() => updateTaskStatus(task.id, task.status === 'done' ? 'todo' : 'done')}
                        className={`h-5 w-5 rounded-full border-2 mt-0.5 shrink-0 transition-colors ${
                          task.status === 'done' 
                            ? 'bg-primary border-primary' 
                            : 'border-primary/50 group-hover:border-primary'
                        }`}
                      />
                      <div>
                        <p className={`font-medium leading-none ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-muted-foreground capitalize bg-secondary px-2 py-0.5 rounded-md">
                            {task.type}
                          </span>
                          <span className={`text-xs capitalize font-medium ${
                            task.priority === 'high' ? 'text-destructive' : 
                            task.priority === 'medium' ? 'text-orange-500' : 
                            'text-primary'
                          }`}>
                            {task.priority} Priority
                          </span>
                          {task.deadline && (
                            <span className="text-xs text-muted-foreground">
                              Due: {task.deadline}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => removeTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
