import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { ThemeProvider } from "@/components/theme-provider"
import { TasksProvider } from "@/hooks/use-tasks"
import { MainLayout } from "@/components/layout/main-layout"
import { Dashboard } from "@/pages/dashboard"
import { CalendarPage } from "@/pages/calendar"
import { TasksPage } from "@/pages/tasks"
import { SettingsPage } from "@/pages/settings"

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="clearmind-theme">
      <TasksProvider>
        <BrowserRouter>
          <MainLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </MainLayout>
        </BrowserRouter>
      </TasksProvider>
    </ThemeProvider>
  )
}

export default App
