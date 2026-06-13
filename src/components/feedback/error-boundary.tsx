import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw, RefreshCw, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logError } from "@/lib/error-log";

/**
 * Lang resolver that doesn't depend on the i18n context. ErrorBoundary is
 * a class component (must be, for React's error-catching API) so it can't
 * use the useT() hook. We read localStorage directly — the same source the
 * I18nProvider hydrates from on mount.
 */
function readLang(): "en" | "vi" {
  if (typeof localStorage === "undefined") return "vi";
  return localStorage.getItem("clearmind_lang") === "en" ? "en" : "vi";
}

const COPY = {
  vi: {
    title: "Có lỗi khi render trang",
    unknown: "Lỗi không xác định",
    retry: "Thử lại",
    reload: "Reload trang",
    details: "Chi tiết kỹ thuật",
    savedHint: 'Đã lưu vào log nội bộ — vào Settings → "Nhật ký lỗi" để xem.',
  },
  en: {
    title: "Error rendering this page",
    unknown: "Unknown error",
    retry: "Retry",
    reload: "Reload page",
    details: "Technical details",
    savedHint: 'Saved to internal log — open Settings → "Error log" to view.',
  },
};

interface State {
  err: Error | null;
  info: ErrorInfo | null;
}

interface Props {
  children: ReactNode;
  // Reset key — when this prop changes, the boundary clears its error state.
  // Useful for wrapping route children so error doesn't stick when navigating.
  resetKey?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null, info: null };

  static getDerivedStateFromError(err: Error): Partial<State> {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    this.setState({ info });
    logError("react", err, info.componentStack ?? undefined);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.err && prev.resetKey !== this.props.resetKey) {
      this.setState({ err: null, info: null });
    }
  }

  reset = () => this.setState({ err: null, info: null });

  render() {
    const { err, info } = this.state;
    if (!err) return this.props.children;

    const c = COPY[readLang()];

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center min-h-0">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{c.title}</h2>
          <p className="text-sm text-muted-foreground max-w-md break-words [overflow-wrap:anywhere]">
            {err.message || c.unknown}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-center">
          <Button onClick={this.reset} variant="outline" className="gap-2 cm-press">
            <RotateCw className="h-4 w-4" />
            {c.retry}
          </Button>
          <Button
            onClick={() => window.location.reload()}
            className="gap-2 cm-press"
          >
            <RefreshCw className="h-4 w-4" />
            {c.reload}
          </Button>
        </div>
        <details className="text-xs text-muted-foreground max-w-2xl w-full mt-2">
          <summary className="cursor-pointer hover:text-foreground inline-flex items-center gap-1.5">
            <Bug className="h-3 w-3" /> {c.details}
          </summary>
          <pre className="mt-2 p-3 rounded-md bg-muted text-left overflow-auto max-h-72 whitespace-pre-wrap text-[11px] leading-relaxed">
            {err.stack || err.message}
            {info?.componentStack
              ? "\n\nComponent stack:" + info.componentStack
              : ""}
          </pre>
          <p className="mt-2 text-[11px] opacity-70">
            {c.savedHint}
          </p>
        </details>
      </div>
    );
  }
}
