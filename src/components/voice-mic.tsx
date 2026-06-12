import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Browser-only Web Speech API typings (Chrome/Edge ship webkitSpeechRecognition).
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
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: Event) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

interface Props {
  onText: (text: string) => void;
  lang?: string;
  className?: string;
  title?: string;
}

export function VoiceMic({ onText, lang = "vi-VN", className, title }: Props) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = lang;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const last = e.results[e.results.length - 1];
      if (last && last[0]) onText(last[0].transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    };
  }, [lang, onText]);

  if (!supported) return null;

  const toggle = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      try {
        rec.start();
        setListening(true);
      } catch {
        /* already running */
      }
    }
  };

  return (
    <Button
      type="button"
      size="icon-sm"
      variant={listening ? "default" : "outline"}
      onClick={toggle}
      title={title || (listening ? "Dừng ghi âm" : "Nói để nhập (tiếng Việt)")}
      className={cn(listening && "animate-pulse", className)}
    >
      {listening ? <MicOff /> : <Mic />}
    </Button>
  );
}
