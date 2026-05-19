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

export function QuickCapture({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
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
      description,
      type,
      priority,
    })

    setTitle("")
    setDescription("")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={`h-14 rounded-xl shadow-sm hover:shadow-md transition-all gap-2 text-md font-medium ${className || ""}`}>
          <Plus className="h-5 w-5" />
          Quick Capture
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
            <textarea
              id="description"
              placeholder="Details or location (optional)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3 min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
