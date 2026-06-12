import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
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
  /** Override lang (BCP-47). Defaults to current app language. */
  lang?: string;
  className?: string;
  title?: string;
}

// Pick a BCP-47 tag the engine recognizes. Chrome accepts both "vi-VN" + "en-US".
function langTag(appLang: "vi" | "en", override?: string): string {
  if (override) return override;
  return appLang === "vi" ? "vi-VN" : "en-US";
}

export function VoiceMic({ onText, lang, className, title }: Props) {
  const { lang: appLang } = useI18n();
  const t = useT();
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  // Stash latest onText so we don't tear down recognition every render — the
  // dialog's inline arrow created a new function on each parent re-render,
  // which made the engine restart constantly and miss audio.
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  useEffect(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const rec = new Ctor();
    // continuous=true → recognize across natural pauses (mid-sentence breath
    // doesn't end the session). interimResults=true → caller sees partial
    // text while user is still speaking.
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = langTag(appLang, lang);

    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (text.trim()) onTextRef.current(text, r.isFinal);
      }
    };
    rec.onend = () => setListening(false);
    rec.onspeechend = () => {
      // Auto-stop after user finishes speaking (continuous=true would otherwise
      // run indefinitely). User can re-click to record another phrase.
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
    // Recreate only when language changes — onText is captured via ref.
  }, [appLang, lang, t]);

  // Render a disabled mic if the browser can't do speech recognition —
  // hiding the button confused users into thinking the feature failed.
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

  const tooltip =
    title ??
    (listening
      ? t("voice.stop")
      : t("voice.start", { lang: langTag(appLang, lang) }));

  return (
    <div className="relative inline-flex">
      <Button
        type="button"
        size="icon-sm"
        variant={listening ? "default" : "outline"}
        onClick={toggle}
        title={errMsg ?? tooltip}
        aria-label={tooltip}
        className={cn(
          listening &&
            "animate-pulse ring-2 ring-destructive/40 ring-offset-2 ring-offset-background",
          className
        )}
      >
        {listening ? <MicOff /> : <Mic />}
      </Button>
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
