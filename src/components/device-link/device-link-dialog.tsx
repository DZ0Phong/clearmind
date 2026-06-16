import { useCallback, useEffect, useState } from "react";
import {
  Upload,
  Download,
  RefreshCw,
  Copy,
  Check,
  Camera,
  ShieldCheck,
  WifiOff,
  Smartphone,
  Plus,
  Trash2,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTasks } from "@/hooks/use-tasks";
import { useToast } from "@/components/feedback/toast";
import { useDialog } from "@/components/feedback/confirm-dialog";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { QrCode } from "./qr-code";
import { QrScanner } from "./qr-scanner";
import {
  buildSnapshot,
  createSendSession,
  receiveByCode,
  receiveFromQr,
  isSnapshot,
  formatCode,
  normalizeCode,
  RelayUnavailableError,
  CodeNotFoundError,
  WrongCodeError,
  UnknownQrError,
  type DeviceSnapshot,
  type SendSession,
} from "@/lib/device-link";

type LinkTab = "send" | "receive";
type SendState = "idle" | "working" | "ready" | "error";
type SendErr = "localTooBig" | "relayUnconfigured" | "relayError" | "error";
type RxState = "idle" | "pulling" | "error";
type RxErr = "notFound" | "wrongCode" | "unknownQr" | "camera" | "error";

function rxErrFor(e: unknown): RxErr {
  if (e instanceof CodeNotFoundError) return "notFound";
  if (e instanceof WrongCodeError) return "wrongCode";
  if (e instanceof UnknownQrError) return "unknownQr";
  return "error";
}

export function DeviceLinkDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useT();
  const { tasks, receiveSnapshot } = useTasks();
  const { toast } = useToast();
  const { confirm } = useDialog();

  const [tab, setTab] = useState<LinkTab>("send");

  // --- Send state ---
  const [sendState, setSendState] = useState<SendState>("idle");
  const [session, setSession] = useState<SendSession | null>(null);
  const [sendErr, setSendErr] = useState<SendErr | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // --- Receive state ---
  const [scanning, setScanning] = useState(false);
  const [rxState, setRxState] = useState<RxState>("idle");
  const [rxErr, setRxErr] = useState<RxErr | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [pending, setPending] = useState<DeviceSnapshot | null>(null);

  const generate = useCallback(async () => {
    setSendState("working");
    setSession(null);
    setSendErr(null);
    setCopied(false);
    try {
      const s = await createSendSession(buildSnapshot(tasks));
      setSession(s);
      setSendState("ready");
    } catch (e) {
      setSendErr(e instanceof RelayUnavailableError ? e.reason : "error");
      setSendState("error");
    }
  }, [tasks]);

  // Auto-create the first session when the Send tab opens — one fewer click.
  useEffect(() => {
    if (open && tab === "send" && sendState === "idle") void generate();
  }, [open, tab, sendState, generate]);

  // Tick the relay-expiry countdown.
  useEffect(() => {
    if (!session?.expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session?.expiresAt]);

  // Full reset whenever the dialog closes so a re-open starts clean (and the
  // camera/relay session never leaks across opens).
  useEffect(() => {
    if (open) return;
    setTab("send");
    setSendState("idle");
    setSession(null);
    setSendErr(null);
    setCopied(false);
    setScanning(false);
    setRxState("idle");
    setRxErr(null);
    setCodeInput("");
    setPending(null);
  }, [open]);

  const secondsLeft = session?.expiresAt
    ? Math.max(0, Math.round((session.expiresAt - now) / 1000))
    : null;
  const expired = secondsLeft === 0;

  const copyCode = async () => {
    if (!session?.code) return;
    try {
      await navigator.clipboard.writeText(formatCode(session.code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the code is on screen anyway */
    }
  };

  const handleSnapshot = (raw: unknown) => {
    if (!isSnapshot(raw)) {
      setRxErr("wrongCode");
      setRxState("error");
      return;
    }
    setPending(raw);
    setRxState("idle");
    setRxErr(null);
  };

  const onScanResult = useCallback((text: string) => {
    setScanning(false);
    setRxState("pulling");
    setRxErr(null);
    receiveFromQr(text)
      .then(handleSnapshot)
      .catch((e) => {
        setRxErr(rxErrFor(e));
        setRxState("error");
      });
    // handleSnapshot is stable enough (only setState); deliberately not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScanError = useCallback(() => {
    setScanning(false);
    setRxErr("camera");
    setRxState("error");
  }, []);

  const pullByCode = async () => {
    const code = normalizeCode(codeInput);
    if (code.length < 4) return;
    setRxState("pulling");
    setRxErr(null);
    try {
      handleSnapshot(await receiveByCode(code));
    } catch (e) {
      setRxErr(rxErrFor(e));
      setRxState("error");
    }
  };

  const applyMerge = () => {
    if (!pending) return;
    const { added, total } = receiveSnapshot(pending.tasks, "merge");
    toast({
      title: t("deviceLink.apply.doneMerge", { added, total }),
      variant: "success",
    });
    onOpenChange(false);
  };

  const applyReplace = async () => {
    if (!pending) return;
    const ok = await confirm({
      title: t("deviceLink.apply.replaceConfirmTitle"),
      description: t("deviceLink.apply.replaceConfirmBody", {
        n: tasks.length,
        m: pending.tasks.length,
      }),
      confirmLabel: t("deviceLink.apply.replaceConfirmCta"),
      variant: "destructive",
    });
    if (!ok) return;
    const { total } = receiveSnapshot(pending.tasks, "replace");
    toast({
      title: t("deviceLink.apply.doneReplace", { total }),
      variant: "success",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            {t("deviceLink.title")}
          </DialogTitle>
          <DialogDescription>{t("deviceLink.desc")}</DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="cm-seg-track w-full" role="tablist">
          {(["send", "receive"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-active={tab === id}
              onClick={() => setTab(id)}
              className="cm-seg-item cm-press flex-1 justify-center"
            >
              {id === "send" ? (
                <Upload className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {id === "send" ? t("deviceLink.tab.send") : t("deviceLink.tab.receive")}
            </button>
          ))}
        </div>

        {tab === "send" ? (
          <SendPanel
            sendState={sendState}
            session={session}
            sendErr={sendErr}
            secondsLeft={secondsLeft}
            expired={expired}
            copied={copied}
            taskCount={tasks.length}
            onCopy={copyCode}
            onRegenerate={generate}
          />
        ) : (
          <ReceivePanel
            pending={pending}
            scanning={scanning}
            rxState={rxState}
            rxErr={rxErr}
            codeInput={codeInput}
            currentCount={tasks.length}
            setScanning={setScanning}
            setCodeInput={setCodeInput}
            onScanResult={onScanResult}
            onScanError={onScanError}
            onPull={pullByCode}
            onMerge={applyMerge}
            onReplace={applyReplace}
            onCancelPending={() => setPending(null)}
          />
        )}

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          {t("deviceLink.e2eNote")}
        </p>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Send ---------------- */

function SendPanel({
  sendState,
  session,
  sendErr,
  secondsLeft,
  expired,
  copied,
  taskCount,
  onCopy,
  onRegenerate,
}: {
  sendState: SendState;
  session: SendSession | null;
  sendErr: SendErr | null;
  secondsLeft: number | null;
  expired: boolean;
  copied: boolean;
  taskCount: number;
  onCopy: () => void;
  onRegenerate: () => void;
}) {
  const t = useT();

  if (sendState === "working") {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <div className="h-7 w-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground">{t("deviceLink.send.working")}</p>
      </div>
    );
  }

  if (sendState === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <AlertCircle className="h-7 w-7 text-destructive" />
        <p className="text-sm text-muted-foreground leading-relaxed px-2">
          {t(`deviceLink.send.fail.${sendErr ?? "error"}`)}
        </p>
        <Button variant="outline" onClick={onRegenerate} className="gap-2">
          <RefreshCw className="h-4 w-4" /> {t("deviceLink.send.regenerate")}
        </Button>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-center text-xs text-muted-foreground leading-relaxed px-2">
        {t("deviceLink.send.scanHint")}
      </p>

      <div className={cn("transition-opacity", expired && "opacity-30")}>
        {/* Direct mode packs the whole encrypted blob into the QR → render it
            bigger so a phone camera can still lock onto the denser pattern. */}
        <QrCode text={session.qrText} size={session.mode === "direct" ? 288 : 232} />
      </div>

      {session.mode === "relay" ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              {t("deviceLink.send.codeLabel")}
            </span>
            <code className="text-lg font-bold font-mono tracking-[0.2em] tabular-nums">
              {formatCode(session.code)}
            </code>
            <button
              type="button"
              onClick={onCopy}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={t("deviceLink.send.copyCode")}
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {expired
              ? t("deviceLink.send.expired")
              : t("deviceLink.send.expiresIn", { s: fmtMMSS(secondsLeft ?? 0) })}
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-1.5 px-2">
          <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
            <WifiOff className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {t("deviceLink.send.offlineNote")}
          </p>
          {/* Explains WHY there's no typeable code here + how to get one. */}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t("deviceLink.send.noCodeHint")}
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <span className="text-[11px] text-muted-foreground">
          {t("deviceLink.send.taskCount", { n: taskCount })}
        </span>
        <Button variant="ghost" size="sm" onClick={onRegenerate} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> {t("deviceLink.send.regenerate")}
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Receive ---------------- */

function ReceivePanel({
  pending,
  scanning,
  rxState,
  rxErr,
  codeInput,
  currentCount,
  setScanning,
  setCodeInput,
  onScanResult,
  onScanError,
  onPull,
  onMerge,
  onReplace,
  onCancelPending,
}: {
  pending: DeviceSnapshot | null;
  scanning: boolean;
  rxState: RxState;
  rxErr: RxErr | null;
  codeInput: string;
  currentCount: number;
  setScanning: (v: boolean) => void;
  setCodeInput: (v: string) => void;
  onScanResult: (text: string) => void;
  onScanError: () => void;
  onPull: () => void;
  onMerge: () => void;
  onReplace: () => void;
  onCancelPending: () => void;
}) {
  const t = useT();

  if (pending) {
    return (
      <div className="flex flex-col gap-3 py-2">
        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums">{pending.tasks.length}</p>
          <p className="text-sm text-muted-foreground">{t("deviceLink.apply.title")}</p>
        </div>
        <button
          type="button"
          onClick={onMerge}
          className="flex items-center gap-3 p-3 rounded-xl border bg-background/50 hover:border-primary/50 hover:bg-accent/30 transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Plus className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{t("deviceLink.apply.merge")}</p>
            <p className="text-[11px] text-muted-foreground">{t("deviceLink.apply.mergeHint")}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={onReplace}
          className="flex items-center gap-3 p-3 rounded-xl border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
            <Trash2 className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{t("deviceLink.apply.replace")}</p>
            <p className="text-[11px] text-muted-foreground">
              {t("deviceLink.apply.replaceHint", { n: currentCount })}
            </p>
          </div>
        </button>
        <Button variant="ghost" size="sm" onClick={onCancelPending} className="self-center">
          {t("deviceLink.apply.cancel")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xs text-muted-foreground px-2">
        {t("deviceLink.receive.intro")}
      </p>

      {scanning ? (
        <>
          <QrScanner onResult={onScanResult} onError={onScanError} />
          <Button variant="outline" size="sm" onClick={() => setScanning(false)}>
            {t("deviceLink.receive.stopScan")}
          </Button>
        </>
      ) : (
        <Button onClick={() => setScanning(true)} className="gap-2" disabled={rxState === "pulling"}>
          <Camera className="h-4 w-4" /> {t("deviceLink.receive.scanButton")}
        </Button>
      )}

      {!scanning && (
        <>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("deviceLink.receive.orEnterCode")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="flex gap-2">
            <Input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onPull();
              }}
              placeholder={t("deviceLink.receive.codePlaceholder")}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="font-mono tracking-[0.15em] uppercase text-center"
              disabled={rxState === "pulling"}
            />
            <Button
              onClick={onPull}
              disabled={rxState === "pulling" || normalizeCode(codeInput).length < 4}
              className="gap-2 shrink-0"
            >
              {rxState === "pulling" ? (
                <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t("deviceLink.receive.pull")}
            </Button>
          </div>
        </>
      )}

      {rxState === "error" && rxErr && (
        <p className="flex items-start gap-1.5 text-xs text-destructive leading-relaxed">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {t(`deviceLink.receive.${rxErr}`)}
        </p>
      )}
    </div>
  );
}

function fmtMMSS(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
