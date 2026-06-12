import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, ChevronDown } from "lucide-react";
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
  /** Called whenever a final or interim transcript chunk is ready. */
  onText: (text: string, isFinal: boolean) => void;
  /** Override lang (BCP-47). When set, the variant picker is hidden. */
  lang?: string;
  className?: string;
  title?: string;
}

/**
 * Recognition variants the user can switch between. Web Speech API doesn't
 * support mid-sentence code-switching (one BCP-47 tag per session), so the
 * best we can do is let the user pick the variant closest to their accent
 * + the language they intend to speak. Google Cloud Speech (Chrome backend)
 * has per-variant trained models — picking `en-GB` over `en-US` for a UK
 * speaker measurably improves accuracy.
 *
 * Vietnamese only has a single canonical variant (vi-VN); regional dialects
 * (Mienf Tây / Trung) currently use the same model and may be less accurate
 * — that's a Google-side limitation we cannot fix from the browser.
 */
const VARIANTS: ReadonlyArray<{ tag: string; labelKey: string; short: string }> = [
  { tag: "vi-VN", labelKey: "voice.variant.viVN", short: "VI" },
  { tag: "en-US", labelKey: "voice.variant.enUS", short: "US" },
  { tag: "en-GB", labelKey: "voice.variant.enGB", short: "UK" },
  { tag: "en-AU", labelKey: "voice.variant.enAU", short: "AU" },
  { tag: "en-IN", labelKey: "voice.variant.enIN", short: "IN" },
];

const VOICE_VARIANT_KEY = "clearmind_voice_variant";

// Default variant follows app language — VI app → vi-VN, EN → en-US.
function defaultVariant(appLang: "vi" | "en"): string {
  return appLang === "vi" ? "vi-VN" : "en-US";
}

function loadVariant(appLang: "vi" | "en"): string {
  try {
    const saved = localStorage.getItem(VOICE_VARIANT_KEY);
    if (saved && VARIANTS.some((v) => v.tag === saved)) return saved;
  } catch {
    /* localStorage unavailable */
  }
  return defaultVariant(appLang);
}

export function VoiceMic({ onText, lang, className, title }: Props) {
  const { lang: appLang } = useI18n();
  const t = useT();
  const [variant, setVariant] = useState(() => loadVariant(appLang));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  // Active language = explicit `lang` prop override > saved variant.
  const activeLang = lang || variant;

  useEffect(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    // Bump alternatives so we surface higher confidence transcripts when the
    // top-1 is misheard (e.g. accent ambiguity). We still emit only the best
    // alternative — but the engine internally re-ranks with more candidates.
    rec.maxAlternatives = 3;
    rec.lang = activeLang;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (text.trim()) onTextRef.current(text, r.isFinal);
      }
    };
    rec.onend = () => setListening(false);
    rec.onspeechend = () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setListening(false);
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
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    };
  }, [activeLang, t]);

  // Close picker on outside click.
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

  if (!supported) {
    return (
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        disabled
        title={t("voice.unsupported")}
        className={className}
      >
        <MicOff />
      </Button>
    );
  }

  const toggle = () => {
    const rec = recRef.current;
    if (!rec) return;
    setErrMsg(null);
    if (listening) {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      setListening(false);
    } else {
      try {
        rec.start();
        setListening(true);
      } catch {
        /* already running — guard against InvalidStateError */
      }
    }
  };

  const pickVariant = (tag: string) => {
    setVariant(tag);
    try {
      localStorage.setItem(VOICE_VARIANT_KEY, tag);
    } catch {
      /* ignore */
    }
    setPickerOpen(false);
    // Restart recognition with the new lang if user was mid-record.
    if (listening) {
      try {
        recRef.current?.abort();
      } catch { /* ignore */ }
      setListening(false);
    }
  };

  const tooltip =
    title ??
    (listening ? t("voice.stop") : t("voice.start", { lang: activeLang }));

  const currentVariant =
    VARIANTS.find((v) => v.tag === activeLang) ?? VARIANTS[0];

  return (
    <div id="voice-variant-picker-root" className="relative inline-flex items-center gap-0">
      <Button
        type="button"
        size="icon-sm"
        variant={listening ? "default" : "outline"}
        onClick={toggle}
        title={errMsg ?? tooltip}
        aria-label={tooltip}
        className={cn(
          "rounded-r-none border-r-0",
          listening &&
            "animate-pulse ring-2 ring-destructive/40 ring-offset-2 ring-offset-background",
          className
        )}
      >
        {listening ? <MicOff /> : <Mic />}
      </Button>
      {!lang && (
        <Button
          type="button"
          size="icon-sm"
          variant={listening ? "default" : "outline"}
          onClick={() => setPickerOpen((v) => !v)}
          title={t("voice.variantPicker.tooltip")}
          aria-label={t("voice.variantPicker.tooltip")}
          className={cn(
            "rounded-l-none gap-0.5 w-auto px-1.5 text-[10px] font-bold tabular-nums",
            listening && "animate-pulse"
          )}
        >
          {currentVariant.short}
          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
        </Button>
      )}
      {pickerOpen && (
        <div className="absolute top-full mt-1.5 right-0 z-50 w-56 rounded-xl border bg-popover shadow-xl p-1.5 animate-in fade-in-0 zoom-in-95">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-1">
            {t("voice.variantPicker.header")}
          </p>
          {VARIANTS.map((v) => {
            const active = v.tag === activeLang;
            return (
              <button
                key={v.tag}
                type="button"
                onClick={() => pickVariant(v.tag)}
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
          className="absolute top-full mt-1 right-0 z-50 text-[10px] font-medium text-destructive bg-destructive/10 border border-destructive/30 rounded px-1.5 py-0.5 whitespace-nowrap"
        >
          {errMsg}
        </span>
      )}
    </div>
  );
}
