import { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { ThemeProvider } from "@/components/theme-provider";
import { AccentProvider } from "@/components/accent-provider";
import { I18nProvider } from "@/lib/i18n";
import { TasksProvider } from "@/hooks/use-tasks";
import { ToastProvider } from "@/components/feedback/toast";
import { TaskCommandsProvider } from "@/components/tasks/task-commands";
import { DialogProvider } from "@/components/feedback/confirm-dialog";
import { MainLayout } from "@/components/layout/main-layout";
import { ErrorBoundary } from "@/components/feedback/error-boundary";
import { Dashboard } from "@/pages/dashboard";
import { WidgetView } from "@/components/widget/widget-view";
// Pages are imported EAGERLY (one bundle) rather than code-split. The desktop
// app's WebView loads the SPA over the local host, where dynamic import() of
// hashed chunks proved unreliable — every non-dashboard tab hung on an
// infinite Suspense spinner because the chunk fetch never settled. A single
// bundle is instant for a local-first app and rock-solid in every client
// (browser / mobile / desktop). (The i18n dictionary stays lazy — it has a
// graceful VI fallback, unlike a route.)
import { CalendarPage } from "@/pages/calendar";
import { ImportPage } from "@/pages/import";
import { TasksPage } from "@/pages/tasks";
import { FocusPage } from "@/pages/focus";
import { ReviewPage } from "@/pages/review";
import { SettingsPage } from "@/pages/settings";
import { GuidePage } from "@/pages/guide";

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

// The desktop app's floating widget window injects this global before the
// page loads (see src-tauri/src/lib.rs). When present we mount a minimal
// widget tree — no router, no full layout — on the SAME TasksProvider so it
// stays live + writes through to the shared store.
declare global {
  interface Window {
    __CLEARMIND_WIDGET__?: boolean;
  }
}
const isWidgetWindow =
  typeof window !== "undefined" && window.__CLEARMIND_WIDGET__ === true;

function App() {
  if (isWidgetWindow) {
    return (
      <ThemeProvider defaultTheme="system" storageKey="clearmind-theme">
        <AccentProvider>
          <I18nProvider>
            <ErrorBoundary>
              <ToastProvider>
                <TasksProvider>
                  <WidgetView />
                </TasksProvider>
              </ToastProvider>
            </ErrorBoundary>
          </I18nProvider>
        </AccentProvider>
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider defaultTheme="system" storageKey="clearmind-theme">
     <AccentProvider>
      <I18nProvider>
        <ErrorBoundary>
          <ToastProvider>
            <TasksProvider>
              <BrowserRouter>
                <TaskCommandsProvider>
                  <DialogProvider>
                    <MainLayout>
                      <RoutedShell />
                    </MainLayout>
                  </DialogProvider>
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
