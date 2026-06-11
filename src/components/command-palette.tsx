import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  CheckSquare,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  Timer,
  TrendingUp,
  CalendarPlus,
  Sparkles,
} from "lucide-react";
import { useTasks } from "@/hooks/use-tasks";
import { cn, TYPE_LABEL } from "@/lib/utils";

interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
  onPickTask: (id: string) => void;
}

export function CommandPalette({ open, onOpenChange, onCreate, onPickTask }: Props) {
  const navigate = useNavigate();
  const { tasks } = useTasks();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global Ctrl+K / Cmd+K toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const actions: CommandAction[] = useMemo(
    () => [
      {
        id: "new",
        label: "Tạo task mới",
        hint: "⌘N",
        icon: <Plus className="h-4 w-4" />,
        run: () => { onOpenChange(false); onCreate(); },
      },
      {
        id: "dashboard",
        label: "Mở Dashboard",
        icon: <LayoutDashboard className="h-4 w-4" />,
        run: () => { onOpenChange(false); navigate("/dashboard"); },
      },
      {
        id: "calendar",
        label: "Mở Lịch",
        icon: <Calendar className="h-4 w-4" />,
        run: () => { onOpenChange(false); navigate("/calendar"); },
      },
      {
        id: "tasks",
        label: "Mở danh sách Task",
        icon: <CheckSquare className="h-4 w-4" />,
        run: () => { onOpenChange(false); navigate("/tasks"); },
      },
      {
        id: "focus",
        label: "Vào chế độ Focus (Pomodoro)",
        icon: <Timer className="h-4 w-4" />,
        run: () => { onOpenChange(false); navigate("/focus"); },
      },
      {
        id: "review",
        label: "Tổng kết tuần",
        icon: <TrendingUp className="h-4 w-4" />,
        run: () => { onOpenChange(false); navigate("/review"); },
      },
      {
        id: "import",
        label: "Import lịch học",
        hint: "Paste / ICS",
        icon: <CalendarPlus className="h-4 w-4" />,
        run: () => { onOpenChange(false); navigate("/import"); },
      },
      {
        id: "guide",
        label: "Hướng dẫn",
        icon: <Sparkles className="h-4 w-4" />,
        run: () => { onOpenChange(false); navigate("/guide"); },
      },
      {
        id: "settings",
        label: "Cài đặt",
        icon: <Settings className="h-4 w-4" />,
        run: () => { onOpenChange(false); navigate("/settings"); },
      },
    ],
    [navigate, onCreate, onOpenChange]
  );


  const q = query.trim().toLowerCase();
  const filteredActions = actions.filter((a) =>
    q ? a.label.toLowerCase().includes(q) : true
  );
  const filteredTasks =
    q.length >= 2
      ? tasks
          .filter((t) => t.title.toLowerCase().includes(q))
          .slice(0, 8)
      : [];

  const all = [
    ...filteredActions,
    ...filteredTasks.map<CommandAction>((t) => ({
      id: "task:" + t.id,
      label: t.title,
      hint: TYPE_LABEL[t.type] || t.type,
      icon: <CheckSquare className="h-4 w-4 text-muted-foreground" />,
      run: () => {
        onOpenChange(false);
        onPickTask(t.id);
      },
    })),
  ];

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, all.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      all[activeIdx]?.run();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-[560px] rounded-xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              const prev = query;
              setQuery(e.target.value);
              // Chỉ reset cursor khi vừa bắt đầu / vừa xoá hết — không reset
              // mỗi keystroke (sẽ làm hover nhảy lung tung).
              if (!prev !== !e.target.value) setActiveIdx(0);
            }}
            onKeyDown={handleKey}
            placeholder="Gõ lệnh hoặc tìm task…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5 font-mono">
            ESC
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {all.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Không có gợi ý nào.
            </p>
          ) : (
            <>
              {filteredActions.length > 0 && (
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                  Lệnh
                </p>
              )}
              {filteredActions.map((a, i) => (
                <button
                  key={a.id}
                  onClick={a.run}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left transition-colors",
                    activeIdx === i ? "bg-accent" : "hover:bg-accent/50"
                  )}
                >
                  {a.icon}
                  <span className="flex-1">{a.label}</span>
                  {a.hint && (
                    <span className="text-xs text-muted-foreground">{a.hint}</span>
                  )}
                </button>
              ))}
              {filteredTasks.length > 0 && (
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 mt-2">
                  Task
                </p>
              )}
              {filteredTasks.map((t, i) => {
                const idx = i + filteredActions.length;
                return (
                  <button
                    key={"task:" + t.id}
                    onClick={() => {
                      onOpenChange(false);
                      onPickTask(t.id);
                    }}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left transition-colors",
                      activeIdx === idx ? "bg-accent" : "hover:bg-accent/50"
                    )}
                  >
                    <CheckSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{t.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {TYPE_LABEL[t.type] || t.type}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
