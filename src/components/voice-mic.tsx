import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, ChevronDown, Zap, Brain, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n, useT } from "@/lib/i18n";
import {
  loadWhisper,
  transcribe as whisperTranscribe,
  unloadWhisper,
  onWhisperState,
  onWhisperProgress,
  type WhisperState,
} from "@/lib/whisper";
import { startMicCapture, type AudioCaptureHandle } from "@/lib/audio-capture";

// Web Speech API typings — Chrome/Edge expose webkitSpeechRecognition.
interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionResultItem;
  length: number;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResult };
}
interface SpeechRecognitionErrorEvent extends Event {
  error?: string;
  message?: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onaudiostart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

interface Props {
  /** Called whenever a final or interim transcript chunk is ready. */
  onText: (text: string, isFinal: boolean) => void;
  /** Override lang (BCP-47). When set, the variant picker is hidden. */
  lang?: string;
  className?: string;
  title?: string;
}

type Engine = "web-speech" | "whisper";

/**
 * Recognition variants. The Web Speech API hardcodes BCP-47 tags per
 * recognition session; Whisper supports auto-detect (empty tag) plus
 * 2-letter language codes (whisper.cpp / transformers.js convention).
 *
 * `whisperLang` is the value we hand to Whisper. `tag` is what Web Speech
 * wants. The two diverge for "auto" which Web Speech can't do.
 */
const VARIANTS: ReadonlyArray<{
  /** Stable picker key. */
  key: string;
  /** BCP-47 tag for Web Speech (empty = not supported on this engine). */
  tag: string;
  /** Whisper language code (e.g. 'vi', 'en', '' for auto). */
  whisperLang: string;
  /** i18n key for display label. */
  labelKey: string;
  /** Short 2-3 char chip in the button. */
  short: string;
  /** Only enabled on Whisper engine. */
  whisperOnly?: boolean;
}> = [
  { key: "auto", tag: "", whisperLang: "", labelKey: "voice.variant.auto", short: "AUTO", whisperOnly: true },
  { key: "vi-VN", tag: "vi-VN", whisperLang: "vi", labelKey: "voice.variant.viVN", short: "VI" },
  { key: "en-US", tag: "en-US", whisperLang: "en", labelKey: "voice.variant.enUS", short: "US" },
  { key: "en-GB", tag: "en-GB", whisperLang: "en", labelKey: "voice.variant.enGB", short: "UK" },
  { key: "en-AU", tag: "en-AU", whisperLang: "en", labelKey: "voice.variant.enAU", short: "AU" },
  { key: "en-IN", tag: "en-IN", whisperLang: "en", labelKey: "voice.variant.enIN", short: "IN" },
];

const VOICE_VARIANT_KEY = "clearmind_voice_variant";
const VOICE_ENGINE_KEY = "clearmind_voice_engine";

function defaultVariantKey(appLang: "vi" | "en"): string {
  return appLang === "vi" ? "vi-VN" : "en-US";
}

function loadVariantKey(appLang: "vi" | "en"): string {
  try {
    const saved = localStorage.getItem(VOICE_VARIANT_KEY);
    if (saved && VARIANTS.some((v) => v.key === saved)) return saved;
  } catch {
    /* ignore */
  }
  return defaultVariantKey(appLang);
}

function loadEngine(): Engine {
  try {
    const saved = localStorage.getItem(VOICE_ENGINE_KEY);
    if (saved === "whisper" || saved === "web-speech") return saved;
  } catch {
    /* ignore */
  }
  return "web-speech";
}

export function VoiceMic({ onText, lang, className, title }: Props) {
  const { lang: appLang } = useI18n();
  const t = useT();

  const [engine, setEngine] = useState<Engine>(() => loadEngine());
  const [variantKey, setVariantKey] = useState(() => loadVariantKey(appLang));
  const [pickerOpen, setPickerOpen] = useState(false);

  // Web Speech state ----------------------------------------------------
  const [wsListening, setWsListening] = useState(false);
  const [wsSupported, setWsSupported] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  // Whisper state -------------------------------------------------------
  const [whisperState, setWhisperState] = useState<WhisperState>("idle");
  const [whisperPercent, setWhisperPercent] = useState<number | null>(null);
  const [recordingSec, setRecordingSec] = useState(0);
  const captureRef = useRef<AudioCaptureHandle | null>(null);

  const variant = VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[1];

  // For "auto" + web-speech (not supported), fall back to user's default.
  const wsLang =
    lang ||
    (variant.tag || (appLang === "vi" ? "vi-VN" : "en-US"));

  /* --------------------------- Web Speech --------------------------- */

  useEffect(() => {
    if (engine !== "web-speech") return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setWsSupported(false);
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.lang = wsLang;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (text.trim()) onTextRef.current(text, r.isFinal);
      }
    };
    rec.onend = () => setWsListening(false);
    rec.onspeechend = () => {
      try { rec.stop(); } catch { /* ignore */ }
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setWsListening(false);
      const code = e.error || "unknown";
      if (code === "not-allowed" || code === "service-not-allowed") {
        setErrMsg(t("voice.errPermission"));
      } else if (code === "no-speech") {
        setErrMsg(t("voice.errNoSpeech"));
      } else if (code === "network") {
        setErrMsg(t("voice.errNetwork"));
      } else if (code !== "aborted") {
        setErrMsg(t("voice.errGeneric", { code }));
      }
    };
    recRef.current = rec;
    return () => {
      try { rec.abort(); } catch { /* ignore */ }
      recRef.current = null;
    };
  }, [engine, wsLang, t]);

  /* ---------------------------- Whisper ---------------------------- */

  // Subscribe to manager state on first mount.
  useEffect(() => {
    const offState = onWhisperState((s) => setWhisperState(s));
    const offProgress = onWhisperProgress((p) => {
      if (typeof p.progress === "number") {
        // transformers.js reports progress as 0..100 in current versions
        // but historically used 0..1 — normalize defensively.
        const pct = p.progress > 1 ? p.progress : p.progress * 100;
        setWhisperPercent(Math.min(100, Math.round(pct)));
      } else if (
        typeof p.loaded === "number" &&
        typeof p.total === "number" &&
        p.total > 0
      ) {
        setWhisperPercent(Math.round((p.loaded / p.total) * 100));
      } else if (p.status === "done" || p.status === "ready") {
        setWhisperPercent(100);
      }
    });
    return () => {
      offState();
      offProgress();
    };
  }, []);

  // Stop capture cleanly on unmount.
  useEffect(() => {
    return () => {
      captureRef.current?.abort();
      captureRef.current = null;
    };
  }, []);

  /* --------------------- Click handling per engine ----------------- */

  const onMicClick = async () => {
    setErrMsg(null);
    if (engine === "web-speech") {
      const rec = recRef.current;
      if (!rec) return;
      if (wsListening) {
        try { rec.stop(); } catch { /* ignore */ }
        setWsListening(false);
      } else {
        try {
          rec.start();
          setWsListening(true);
        } catch {
          /* already running */
        }
      }
      return;
    }

    // Whisper path.
    if (captureRef.current) {
      // Stop + transcribe.
      const handle = captureRef.current;
      captureRef.current = null;
      try {
        const pcm = await handle.stop();
        // 150ms is shorter than a typical short word ("có"/"no"/"ok").
        // Below that we likely captured only the mousedown click sound.
        if (pcm.length < 16000 * 0.15) {
          setErrMsg(t("voice.errNoSpeech"));
          return;
        }
        const text = await whisperTranscribe(pcm, variant.whisperLang || undefined);
        if (text) onTextRef.current(text, true);
        else setErrMsg(t("voice.errNoSpeech"));
      } catch (err) {
        setErrMsg(t("voice.whisper.errTranscribe", { err: (err as Error).message }));
      }
      return;
    }

    // Start: ensure model loaded, then capture.
    try {
      if (whisperState !== "ready") {
        await loadWhisper();
      }
    } catch (err) {
      setErrMsg(t("voice.whisper.errLoad", { err: (err as Error).message }));
      return;
    }
    try {
      const handle = await startMicCapture();
      captureRef.current = handle;
      setRecordingSec(0);
      handle.onTick((ms) => setRecordingSec(Math.floor(ms / 1000)));
    } catch (err) {
      setErrMsg(t("voice.whisper.errMic", { err: (err as Error).message }));
    }
  };

  /* ------------------------- Variant picker ------------------------ */

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const root = document.getElementById("voice-variant-picker-root");
      if (root && !root.contains(target)) setPickerOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [pickerOpen]);

  const pickEngine = (next: Engine) => {
    setEngine(next);
    try {
      localStorage.setItem(VOICE_ENGINE_KEY, next);
    } catch {
      /* ignore */
    }
    // If switching away from Whisper mid-record, release resources.
    if (next === "web-speech") {
      captureRef.current?.abort();
      captureRef.current = null;
      setRecordingSec(0);
      // Don't unload Whisper here — leave it cached in case user toggles back.
    } else if (variant.key === "auto") {
      // Auto only works on whisper — keep variant as-is.
    }
    // If switching to web-speech and current variant is "auto", reset to default.
    if (next === "web-speech" && variant.whisperOnly) {
      const defKey = defaultVariantKey(appLang);
      setVariantKey(defKey);
      try { localStorage.setItem(VOICE_VARIANT_KEY, defKey); } catch { /* ignore */ }
    }
    if (wsListening) {
      try { recRef.current?.abort(); } catch { /* ignore */ }
      setWsListening(false);
    }
  };

  const pickVariant = (key: string) => {
    setVariantKey(key);
    try {
      localStorage.setItem(VOICE_VARIANT_KEY, key);
    } catch {
      /* ignore */
    }
    setPickerOpen(false);
    if (wsListening) {
      try { recRef.current?.abort(); } catch { /* ignore */ }
      setWsListening(false);
    }
  };

  // Unsupported state — Web Speech missing + no Whisper yet.
  const fullyUnsupported = engine === "web-speech" && !wsSupported;
  if (fullyUnsupported) {
    return (
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        onClick={() => pickEngine("whisper")}
        title={t("voice.unsupported")}
        className={className}
      >
        <MicOff />
      </Button>
    );
  }

  /* --------------------------- Render UI -------------------------- */

  const isRecording =
    engine === "web-speech" ? wsListening : captureRef.current != null;
  const isBusy =
    engine === "whisper" &&
    (whisperState === "loading" || whisperState === "transcribing");
  const isPulsing = isRecording || isBusy;

  let tooltip: string = title ?? "";
  if (!tooltip) {
    if (engine === "whisper") {
      if (whisperState === "loading") {
        tooltip = t("voice.whisper.loading", {
          percent: whisperPercent ?? 0,
        });
      } else if (whisperState === "transcribing") {
        tooltip = t("voice.whisper.transcribing");
      } else if (isRecording) {
        tooltip = t("voice.whisper.recording", { seconds: recordingSec });
      } else {
        tooltip = t("voice.start", { lang: variant.key });
      }
    } else {
      tooltip = isRecording ? t("voice.stop") : t("voice.start", { lang: wsLang });
    }
  }

  // Choose the icon. Loader during model download or active transcribe.
  const MicIcon =
    engine === "whisper" && isBusy
      ? Loader2
      : isRecording
      ? MicOff
      : Mic;

  return (
    <div
      id="voice-variant-picker-root"
      className="relative inline-flex items-center gap-0"
    >
      <Button
        type="button"
        size="icon-sm"
        variant={isRecording || isBusy ? "default" : "outline"}
        onClick={onMicClick}
        disabled={engine === "whisper" && whisperState === "transcribing"}
        title={errMsg ?? tooltip}
        aria-label={tooltip}
        className={cn(
          "rounded-r-none border-r-0",
          isPulsing && !isBusy &&
            "animate-pulse ring-2 ring-destructive/40 ring-offset-2 ring-offset-background",
          className
        )}
      >
        <MicIcon className={cn(isBusy && "animate-spin")} />
      </Button>
      {!lang && (
        <Button
          type="button"
          size="icon-sm"
          variant={isRecording || isBusy ? "default" : "outline"}
          onClick={() => setPickerOpen((v) => !v)}
          title={t("voice.variantPicker.tooltip")}
          aria-label={t("voice.variantPicker.tooltip")}
          className={cn(
            "rounded-l-none gap-0.5 w-auto px-1.5 text-[10px] font-bold tabular-nums",
            isPulsing && !isBusy && "animate-pulse"
          )}
        >
          {engine === "whisper" ? (
            <Brain className="h-2.5 w-2.5" />
          ) : (
            <Zap className="h-2.5 w-2.5" />
          )}
          {variant.short}
          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
        </Button>
      )}
      {pickerOpen && (
        <div className="absolute top-full mt-1.5 right-0 z-50 w-64 rounded-xl border bg-popover shadow-xl p-1.5 animate-in fade-in-0 zoom-in-95">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-1">
            {t("voice.engine.header")}
          </p>
          <div className="grid grid-cols-2 gap-1 px-1 pb-1.5">
            <button
              type="button"
              onClick={() => pickEngine("web-speech")}
              className={cn(
                "cm-press text-left px-2 py-1.5 rounded-md border transition-all",
                engine === "web-speech"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-input hover:bg-accent"
              )}
            >
              <div className="text-xs font-semibold inline-flex items-center gap-1">
                <Zap className="h-3 w-3" /> {t("voice.engine.webSpeech")}
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                {t("voice.engine.webSpeechHint")}
              </p>
            </button>
            <button
              type="button"
              onClick={() => pickEngine("whisper")}
              className={cn(
                "cm-press text-left px-2 py-1.5 rounded-md border transition-all",
                engine === "whisper"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-input hover:bg-accent"
              )}
            >
              <div className="text-xs font-semibold inline-flex items-center gap-1">
                <Brain className="h-3 w-3" /> {t("voice.engine.whisper")}
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                {t("voice.engine.whisperHint")}
              </p>
            </button>
          </div>

          {engine === "whisper" && whisperState === "idle" && (
            <p className="text-[10px] text-muted-foreground px-2 pb-1 leading-relaxed border-b">
              {t("voice.whisper.firstLoad")}
            </p>
          )}
          {engine === "whisper" && whisperState === "loading" &&
            whisperPercent !== null && (
            <div className="px-2 pb-2 border-b">
              <div className="flex items-center justify-between text-[10px]">
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  {t("voice.whisper.loading", { percent: whisperPercent })}
                </span>
                <span className="tabular-nums font-semibold">
                  {whisperPercent}%
                </span>
              </div>
              <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${whisperPercent}%` }}
                />
              </div>
            </div>
          )}

          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-1 mt-1">
            {t("voice.variantPicker.header")}
          </p>
          {VARIANTS.map((v) => {
            const disabled = v.whisperOnly && engine !== "whisper";
            const active = v.key === variantKey;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => !disabled && pickVariant(v.key)}
                disabled={disabled}
                className={cn(
                  "cm-press w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between gap-2",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent",
                  disabled && "opacity-40 cursor-not-allowed hover:bg-transparent"
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  {v.whisperOnly && <Brain className="h-3 w-3" />}
                  {t(v.labelKey)}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
                  {v.tag || "auto"}
                </span>
              </button>
            );
          })}
          <p className="text-[10px] text-muted-foreground px-2 pt-1 pb-0.5 leading-relaxed">
            {t("voice.variantPicker.hint")}
          </p>
        </div>
      )}
      {errMsg && (
        <span
          role="alert"
          className="absolute top-full mt-1 right-0 z-50 text-[10px] font-medium text-destructive bg-destructive/10 border border-destructive/30 rounded px-1.5 py-0.5 max-w-[260px] whitespace-normal break-words"
        >
          {errMsg}
        </span>
      )}
    </div>
  );
}

// Re-export unload for app-level cleanup (e.g. settings "Clear cache").
export { unloadWhisper };
