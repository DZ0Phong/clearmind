import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * In-app replacement for `window.confirm()` and `window.prompt()`.
 *
 * The browser-native dialogs include "localhost:20129 cho biết" in their
 * chrome which is jarring and gives away the dev environment — also
 * they don't theme with the app, can't be styled, and break focus flow.
 * This provider renders shadcn-styled Dialogs and resolves a Promise
 * when the user picks an option, so the call-site stays nearly as
 * succinct as the native API:
 *
 *   const { confirm } = useDialog();
 *   if (!(await confirm({ title: "Delete?", variant: "destructive" }))) return;
 *
 *   const { prompt } = useDialog();
 *   const name = await prompt({ title: "Rename tag", defaultValue: "foo" });
 *   if (!name) return;
 */

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive recolors the confirm button red. */
  variant?: "default" | "destructive";
}

export interface PromptOptions {
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Empty string allowed? Defaults to false (cancel-equivalent). */
  allowEmpty?: boolean;
}

interface DialogApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | undefined>(undefined);

interface ConfirmState {
  opts: ConfirmOptions;
  resolve: (v: boolean) => void;
}

interface PromptState {
  opts: PromptOptions;
  resolve: (v: string | null) => void;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);

  const confirm = useCallback<DialogApi["confirm"]>(
    (opts) =>
      new Promise((resolve) => setConfirmState({ opts, resolve })),
    []
  );

  const prompt = useCallback<DialogApi["prompt"]>(
    (opts) =>
      new Promise((resolve) => setPromptState({ opts, resolve })),
    []
  );

  const api = useMemo<DialogApi>(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      <ConfirmDialog
        state={confirmState}
        onClose={() => setConfirmState(null)}
      />
      <PromptDialog
        state={promptState}
        onClose={() => setPromptState(null)}
      />
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog must be used within DialogProvider");
  }
  return ctx;
}

function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmState | null;
  onClose: () => void;
}) {
  const t = useT();
  if (!state) return null;
  const {
    title,
    description,
    confirmLabel,
    cancelLabel,
    variant = "default",
  } = state.opts;

  const handle = (value: boolean) => {
    state.resolve(value);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handle(false);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md cm-sheet-mobile"
        data-testid="confirm-dialog"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handle(false)}
            data-testid="confirm-dialog-cancel"
          >
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => handle(true)}
            data-testid="confirm-dialog-confirm"
            autoFocus
          >
            {confirmLabel ?? t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromptDialog({
  state,
  onClose,
}: {
  state: PromptState | null;
  onClose: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset + focus when a new prompt opens.
  useEffect(() => {
    if (!state) return;
    setValue(state.opts.defaultValue ?? "");
    // Defer focus until after Radix portal mounts.
    const id = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(id);
  }, [state]);

  if (!state) return null;

  const {
    title,
    description,
    placeholder,
    confirmLabel,
    cancelLabel,
    allowEmpty = false,
  } = state.opts;
  const trimmed = value.trim();
  const canSubmit = allowEmpty || trimmed.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    state.resolve(allowEmpty ? value : trimmed);
    onClose();
  };

  const cancel = () => {
    state.resolve(null);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md cm-sheet-mobile"
        data-testid="prompt-dialog"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            data-testid="prompt-dialog-input"
            className={cn(canSubmit ? "" : "border-input")}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={cancel}
              data-testid="prompt-dialog-cancel"
            >
              {cancelLabel ?? t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              data-testid="prompt-dialog-confirm"
            >
              {confirmLabel ?? t("common.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
