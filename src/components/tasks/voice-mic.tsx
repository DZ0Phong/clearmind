import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, ChevronDown, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n, useT } from "@/lib/i18n";

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
  /** Full current dictation transcript (REPLACE semantics) — emitted live as
   *  the user speaks. Always the complete text since the mic was pressed, so
   *  the consumer sets rather than appends → no duplication. */
  onText: (text: string) => void;
  /** Fired when the user presses the mic to START a dictation, so the consumer
   *  can snapshot its base text (the value dictation should be added onto). */
  onStart?: () => void;
  /** Override lang (BCP-47). When set, the variant picker is hidden. */
  lang?: string;
  className?: string;
  title?: string;
}

/**
 * Recognition language variants for the Web Speech API (online STT, built
 * into Chrome/Edge). The offline Whisper engine was removed — it pulled in
 * @huggingface/transformers + a ~23MB WASM model the project didn't need.
 */
const VARIANTS: ReadonlyArray<{
  key: string;
  /** BCP-47 tag handed to SpeechRecognition.lang. */
  tag: string;
  labelKey: string;
  /** Short 2-3 char chip shown in the button. */
  short: string;
}> = [
  { key: "vi-VN", tag: "vi-VN", labelKey: "voice.variant.viVN", short: "VI" },
  { key: "en-US", tag: "en-US", labelKey: "voice.variant.enUS", short: "US" },
  { key: "en-GB", tag: "en-GB", labelKey: "voice.variant.enGB", short: "UK" },
  { key: "en-AU", tag: "en-AU", labelKey: "voice.variant.enAU", short: "AU" },
  { key: "en-IN", tag: "en-IN", labelKey: "voice.variant.enIN", short: "IN" },
];

const VOICE_VARIANT_KEY = "clearmind_voice_variant";

/**
 * Merge a freshly-finalized chunk into the committed transcript, tolerant of
 * Web Speech engines (esp. on Android Chrome) that re-report the WHOLE
 * utterance cumulatively after each restart instead of only the new words.
 *   - n extends c (cumulative re-emit) → take the longer (replace)
 *   - c already ends with n (duplicate tail) → keep c
 *   - suffix(c) overlaps prefix(n) → stitch without repeating the overlap
 *   - otherwise → append with a space
 * Without this, "alo 1234" on mobile became "alo alo alo 1 alo 1 2 …".
 */
function mergeFinal(committed: string, incoming: string): string {
  const c = committed.trim();
  const n = incoming.trim();
  if (!c) return n;
  if (!n) return c;
  if (n.toLowerCase().startsWith(c.toLowerCase())) return n;
  if (c.toLowerCase().endsWith(n.toLowerCase())) return c;
  const max = Math.min(c.length, n.length);
  for (let k = max; k > 3; k--) {
    if (c.slice(-k).toLowerCase() === n.slice(0, k).toLowerCase()) {
      return c + n.slice(k);
    }
  }
  return c + " " + n;
}

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

export function VoiceMic({ onText, onStart, lang, className, title }: Props) {
  const { lang: appLang } = useI18n();
  const t = useT();

  const [variantKey, setVariantKey] = useState(() => loadVariantKey(appLang));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  // Tracks whether the user *intended* to be listening. Web Speech engines
  // (Chrome ≈ 60s cap) and natural pauses cause `onend` to fire even while the
  // user is still mid-utterance. We auto-restart whenever onend fires AND this
  // ref is true (user hasn't clicked stop). Cleared in stop paths to avoid loops.
  const wantsListenRef = useRef(false);
  const onTextRef = useRef(onText);
  const onStartRef = useRef(onStart);
  useEffect(() => {
    onTextRef.current = onText;
    onStartRef.current = onStart;
  }, [onText, onStart]);
  // Running FINAL transcript since the mic was pressed (survives the engine's
  // onend→restart cycles) + how many results in the CURRENT engine session
  // were already folded in, so each final result is merged exactly once.
  const committedRef = useRef("");
  const sessionEmittedRef = useRef(0);

  const variant = VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[0];
  const wsLang = lang || variant.tag || (appLang === "vi" ? "vi-VN" : "en-US");

  /* --------------------------- Web Speech --------------------------- */

  useEffect(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.lang = wsLang;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      // Fold each NEW final result (by index, once per engine session) into the
      // committed transcript, then emit committed + current interim as ONE full
      // snapshot (replace semantics). resultIndex is unreliable on some mobile
      // engines, so we track our own per-session emitted-index counter.
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0]?.transcript ?? "";
        if (r.isFinal) {
          if (i >= sessionEmittedRef.current && txt.trim()) {
            committedRef.current = mergeFinal(committedRef.current, txt);
            sessionEmittedRef.current = i + 1;
          }
        } else {
          interim += txt;
        }
      }
      const snapshot = [committedRef.current, interim.trim()]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (snapshot) onTextRef.current(snapshot);
    };
    rec.onend = () => {
      // Chrome ends sessions after ~60s + some idle thresholds even with
      // continuous=true. Restart silently if the user still wants to listen
      // so the experience is "press once → record until press again".
      if (wantsListenRef.current) {
        try {
          // New engine session = fresh `results` list → reset the per-session
          // emitted-index counter. committedRef carries the text across.
          sessionEmittedRef.current = 0;
          rec.start();
          return;
        } catch {
          /* InvalidStateError mid-shutdown — fall through */
        }
      }
      setListening(false);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      const code = e.error || "unknown";
      // `no-speech`/`audio-capture` at session start are transient — if the
      // user still wants to listen, ignore + let onend's restart kick in.
      if (code === "no-speech" || code === "audio-capture") {
        if (wantsListenRef.current) return;
      }
      wantsListenRef.current = false;
      setListening(false);
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
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    };
  }, [wsLang, t]);

  const onMicClick = () => {
    setErrMsg(null);
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      // Clear intent FIRST so onend doesn't auto-restart.
      wantsListenRef.current = false;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      setListening(false);
    } else {
      // Fresh dictation press → reset accumulators + let the consumer snapshot
      // its base text so dictation REPLACES rather than appends duplicates.
      committedRef.current = "";
      sessionEmittedRef.current = 0;
      onStartRef.current?.();
      wantsListenRef.current = true;
      try {
        rec.start();
        setListening(true);
      } catch {
        /* already running */
      }
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

  const pickVariant = (key: string) => {
    setVariantKey(key);
    try {
      localStorage.setItem(VOICE_VARIANT_KEY, key);
    } catch {
      /* ignore */
    }
    setPickerOpen(false);
    if (listening) {
      // Clear intent before abort so onend doesn't auto-restart with the OLD lang.
      wantsListenRef.current = false;
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      setListening(false);
    }
  };

  // Unsupported (e.g. Firefox) — no offline fallback any more, so show a
  // disabled mic with an explanatory tooltip.
  if (!supported) {
    return (
      <Button
        type="button"
        size="icon"
        variant="outline"
        disabled
        title={t("voice.unsupported")}
        aria-label={t("voice.unsupported")}
        className={className}
      >
        <MicOff />
      </Button>
    );
  }

  /* --------------------------- Render UI -------------------------- */

  const tooltip =
    title || (listening ? t("voice.stop") : t("voice.start", { lang: wsLang }));
  const MicIcon = listening ? MicOff : Mic;

  // SINGLE-CONTAINER compound control: one inner <div> owns h-9 + border +
  // overflow-hidden (clip rounded corners across child hover); outer <div>
  // owns positioning so the dropdown + error toast escape the clip.
  const compoundIdle =
    "border-input bg-background hover:[&>button:hover]:bg-accent dark:border-input dark:bg-input/30";
  const compoundActive = "border-primary bg-primary text-primary-foreground";

  return (
    <div
      id="voice-variant-picker-root"
      className={cn("relative inline-block", className)}
    >
      <div
        className={cn(
          "inline-flex items-stretch h-9 rounded-md border overflow-hidden",
          "transition-colors shadow-xs",
          listening ? compoundActive : compoundIdle,
          listening &&
            "animate-pulse ring-2 ring-destructive/40 ring-offset-2 ring-offset-background"
        )}
      >
        {/* MIC half — square 36×36 to match h-9 wrapper. */}
        <button
          type="button"
          onClick={onMicClick}
          title={errMsg ?? tooltip}
          aria-label={tooltip}
          className={cn(
            "w-9 inline-flex items-center justify-center outline-none",
            "transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
            !listening && "hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <MicIcon className="h-4 w-4" />
        </button>

        {!lang && (
          <>
            {/* Divider — 1px line linking the two halves. */}
            <span
              aria-hidden
              className={cn(
                "w-px self-stretch",
                listening ? "bg-primary-foreground/30" : "bg-border"
              )}
            />
            {/* PICKER half — language selector. */}
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              title={t("voice.variantPicker.tooltip")}
              aria-label={t("voice.variantPicker.tooltip")}
              aria-expanded={pickerOpen}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 px-2.5",
                "text-xs font-bold tabular-nums outline-none transition-colors",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                !listening && "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Languages className="h-3.5 w-3.5 shrink-0 opacity-80" />
              <span className="leading-none">{variant.short}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 opacity-60 shrink-0 transition-transform duration-200",
                  pickerOpen && "rotate-180"
                )}
              />
            </button>
          </>
        )}
      </div>
      {pickerOpen && (
        <div className="absolute top-full mt-1.5 right-0 z-50 w-60 rounded-xl border bg-popover shadow-xl p-1.5 animate-in fade-in-0 zoom-in-95">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-1">
            {t("voice.variantPicker.header")}
          </p>
          {VARIANTS.map((v) => {
            const active = v.key === variantKey;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => pickVariant(v.key)}
                className={cn(
                  "cm-press w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between gap-2",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                <span>{t(v.labelKey)}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
                  {v.tag}
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
          className="absolute bottom-full mb-1 right-0 z-50 text-[10px] font-medium text-destructive bg-destructive/10 border border-destructive/30 rounded px-1.5 py-0.5 max-w-[260px] whitespace-normal break-words"
        >
          {errMsg}
        </span>
      )}
    </div>
  );
}
