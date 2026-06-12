import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { TasksProvider } from "@/hooks/use-tasks";
import { ToastProvider } from "@/components/toast";
import { TaskCommandsProvider } from "@/components/task-commands";
import { MainLayout } from "@/components/layout/main-layout";
import { Dashboard } from "@/pages/dashboard";
import { TasksPage } from "@/pages/tasks";
import { FocusPage } from "@/pages/focus";
import { ReviewPage } from "@/pages/review";
import { SettingsPage } from "@/pages/settings";
import { GuidePage } from "@/pages/guide";

// FullCalendar (Calendar) and the import wizard (parsers + linkedom) are the
// two largest dependency clusters in the app. Code-split them so the initial
// dashboard load doesn't drag them down.
const CalendarPage = lazy(() =>
  import("@/pages/calendar").then((m) => ({ default: m.CalendarPage }))
);
const ImportPage = lazy(() =>
  import("@/pages/import").then((m) => ({ default: m.ImportPage }))
);

function PageFallback() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="clearmind-theme">
      <ToastProvider>
        <TasksProvider>
          <BrowserRouter>
            <TaskCommandsProvider>
              <MainLayout>
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/focus" element={<FocusPage />} />
                    <Route path="/review" element={<ReviewPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/guide" element={<GuidePage />} />
                    <Route path="/import" element={<ImportPage />} />
                  </Routes>
                </Suspense>
              </MainLayout>
            </TaskCommandsProvider>
          </BrowserRouter>
        </TasksProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
