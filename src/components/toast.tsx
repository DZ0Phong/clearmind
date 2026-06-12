/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "default" | "success" | "destructive";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastEntry extends ToastOptions {
  id: string;
}

interface ToastContextType {
  toast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Variant-aware defaults so callers don't need to pass `durationMs` ad-hoc.
// Errors get longer reading time by default.
const DEFAULT_DURATION_MS: Record<ToastVariant, number> = {
  default: 4500,
  success: 4500,
  destructive: 7000,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = crypto.randomUUID();
      const variant = opts.variant ?? "default";
      const durationMs = opts.durationMs ?? DEFAULT_DURATION_MS[variant];
      const entry: ToastEntry = { id, ...opts, durationMs };
      setToasts((prev) => [...prev, entry]);
      window.setTimeout(() => dismiss(id), durationMs);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto rounded-xl border bg-card shadow-lg px-4 py-3 flex items-start gap-3 animate-in slide-in-from-bottom-2 fade-in-0",
              t.variant === "success" && "border-emerald-500/30 bg-emerald-500/5",
              t.variant === "destructive" && "border-destructive/30 bg-destructive/5"
            )}
          >
            <div className="flex-1 min-w-0">
              {t.title && <p className="text-sm font-medium leading-tight">{t.title}</p>}
              {t.description && (
                <p className="text-xs text-muted-foreground mt-1 leading-snug">
                  {t.description}
                </p>
              )}
            </div>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="text-xs font-medium text-primary hover:underline shrink-0"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
