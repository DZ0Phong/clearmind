import { lazy, Suspense, type ComponentType } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useDocumentTitle } from "@/lib/use-document-title";
import { ThemeProvider } from "@/components/theme-provider";
import { AccentProvider } from "@/components/accent-provider";
import { I18nProvider } from "@/lib/i18n";
import { TasksProvider } from "@/hooks/use-tasks";
import { ToastProvider } from "@/components/toast";
import { TaskCommandsProvider } from "@/components/task-commands";
import { MainLayout } from "@/components/layout/main-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { Dashboard } from "@/pages/dashboard";
import { TasksPage } from "@/pages/tasks";
import { FocusPage } from "@/pages/focus";
import { ReviewPage } from "@/pages/review";
import { SettingsPage } from "@/pages/settings";
import { GuidePage } from "@/pages/guide";

// Wrap React.lazy() with a one-shot retry: after a deploy the SPA shell can
// still reference a chunk hash that no longer exists, which throws a generic
// "Loading chunk failed" → white screen. Reload once to grab the fresh manifest;
// after that, propagate so the ErrorBoundary catches it instead of looping.
function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (e) {
      const key = "clearmind_chunk_retry";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        // Reload is async — return a never-resolving promise so React stays
        // in Suspense fallback until the page actually reloads.
        return new Promise<never>(() => {});
      }
      throw e;
    }
  });
}

// FullCalendar (Calendar) and the import wizard (parsers + linkedom) are the
// two largest dependency clusters in the app. Code-split them so the initial
// dashboard load doesn't drag them down.
const CalendarPage = lazyWithRetry(() =>
  import("@/pages/calendar").then((m) => ({ default: m.CalendarPage }))
);
const ImportPage = lazyWithRetry(() =>
  import("@/pages/import").then((m) => ({ default: m.ImportPage }))
);

function PageFallback() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );
}

// Re-keys children on path change so the page-enter animation replays.
// ErrorBoundary wraps inside so a thrown render error shows a recovery UI
// instead of blanking the whole app, and resets when the user navigates away.
function RoutedShell() {
  const location = useLocation();
  useDocumentTitle();
  return (
    <div
      key={location.pathname}
      className="cm-page-enter h-full flex flex-col min-h-0"
    >
      <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<PageFallback />}>
          <Routes location={location}>
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
      </ErrorBoundary>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="clearmind-theme">
     <AccentProvider>
      <I18nProvider>
        <ErrorBoundary>
          <ToastProvider>
            <TasksProvider>
              <BrowserRouter>
                <TaskCommandsProvider>
                  <MainLayout>
                    <RoutedShell />
                  </MainLayout>
                </TaskCommandsProvider>
              </BrowserRouter>
            </TasksProvider>
          </ToastProvider>
        </ErrorBoundary>
      </I18nProvider>
     </AccentProvider>
    </ThemeProvider>
  );
}

export default App;
