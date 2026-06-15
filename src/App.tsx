import { lazy, Suspense, type ComponentType } from "react";
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
// Dashboard stays eager — it's the default route and the user's first
// paint. Every other page is lazy so initial bundle stays small.
import { Dashboard } from "@/pages/dashboard";
import { WidgetView } from "@/components/widget/widget-view";

// Wrap React.lazy() with a one-shot retry: after a deploy the SPA shell can
// still reference a chunk hash that no longer exists, which throws a generic
// "Loading chunk failed" → white screen. Reload once to grab the fresh manifest;
// after that, propagate so the ErrorBoundary catches it instead of looping.
//
// sessionStorage access is wrapped in try/catch — Safari private mode + some
// strict tracking-protection setups throw SecurityError on storage access,
// and the retry path is the WORST place for a secondary failure.
function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (e) {
      const key = "clearmind_chunk_retry";
      let already = false;
      try {
        already = !!sessionStorage.getItem(key);
      } catch {
        /* storage blocked */
      }
      if (!already) {
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          /* ignore */
        }
        window.location.reload();
        // Reload is async — return a never-resolving promise so React stays
        // in Suspense fallback until the page actually reloads.
        return new Promise<never>(() => {});
      }
      throw e;
    }
  });
}

// Code-split every page below the dashboard. FullCalendar (Calendar) +
// import wizard (linkedom + parsers) are the heaviest; pages like Settings
// (1k+ lines) + Review (heatmap synthesis) + Focus (audio synth) also
// benefit. Result: main bundle ~30-40% smaller, dashboard paint faster on
// first load.
const CalendarPage = lazyWithRetry(() =>
  import("@/pages/calendar").then((m) => ({ default: m.CalendarPage }))
);
const ImportPage = lazyWithRetry(() =>
  import("@/pages/import").then((m) => ({ default: m.ImportPage }))
);
const TasksPage = lazyWithRetry(() =>
  import("@/pages/tasks").then((m) => ({ default: m.TasksPage }))
);
const FocusPage = lazyWithRetry(() =>
  import("@/pages/focus").then((m) => ({ default: m.FocusPage }))
);
const ReviewPage = lazyWithRetry(() =>
  import("@/pages/review").then((m) => ({ default: m.ReviewPage }))
);
const SettingsPage = lazyWithRetry(() =>
  import("@/pages/settings").then((m) => ({ default: m.SettingsPage }))
);
const GuidePage = lazyWithRetry(() =>
  import("@/pages/guide").then((m) => ({ default: m.GuidePage }))
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
