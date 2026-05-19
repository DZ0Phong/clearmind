/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect, createContext, useContext } from "react";

export type TaskType = "academic" | "personal" | "work" | "other";
export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "in-progress" | "done";

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  deadline?: string;
  createdAt: string;
}

interface TasksContextType {
  tasks: Task[];
  addTask: (task: Omit<Task, "id" | "createdAt" | "status">) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
  updateTask: (id: string, updates: Partial<Omit<Task, "id">>) => void;
  removeTask: (id: string) => void;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

const STORAGE_KEY = "clearmind_tasks";

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setTasks(parsed);
        }
      } catch (e) {
        console.error("Failed to parse tasks from local storage", e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to local storage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }
  }, [tasks, isLoaded]);

  const addTask = (task: Omit<Task, "id" | "createdAt" | "status">) => {
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      status: "todo",
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [newTask, ...prev]);
  };

  const updateTaskStatus = (id: string, status: TaskStatus) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t))
    );
  };

  const updateTask = (id: string, updates: Partial<Omit<Task, "id">>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <TasksContext.Provider value={{ tasks, addTask, updateTaskStatus, updateTask, removeTask }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (context === undefined) {
    throw new Error("useTasks must be used within a TasksProvider");
  }
  return context;
}
