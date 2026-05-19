import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useTasks } from "@/hooks/use-tasks"
import type { TaskType, TaskPriority } from "@/hooks/use-tasks"

export function QuickCapture() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const { addTask } = useTasks()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    // Simple auto-classification (can be improved later with AI)
    let type: TaskType = "other"
    let priority: TaskPriority = "medium"

    const lowerTitle = title.toLowerCase()
    if (lowerTitle.includes("học") || lowerTitle.includes("bài tập") || lowerTitle.includes("deadline")) {
      type = "academic"
      priority = "high"
    } else if (lowerTitle.includes("mua") || lowerTitle.includes("gửi") || lowerTitle.includes("sửa")) {
      type = "personal"
    }

    addTask({
      title,
      type,
      priority,
    })

    setTitle("")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="fixed bottom-8 right-8 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all z-50">
          <Plus className="h-6 w-6" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Quick Capture</DialogTitle>
          <DialogDescription>
            Dump what's on your mind. We'll sort it out.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <Input
              autoFocus
              id="title"
              placeholder="e.g. Gửi laptop về quê..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="col-span-3"
            />
          </div>
          <DialogFooter>
            <Button type="submit">Save to Inbox</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
