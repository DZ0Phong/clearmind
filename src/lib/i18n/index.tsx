/* eslint-disable react-refresh/only-export-components */
import {
  bucketByDate as utilsBucketByDate,
  canonicalTimeZone,
  dayKey as utilsDayKey,
  extractTimeLabel as utilsExtractTimeLabel,
  formatDeadline as utilsFormatDeadline,
  formatTimeAgoShort as utilsFormatTimeAgoShort,
  groupByBucket as utilsGroupByBucket,
  isToday as utilsIsToday,
  tzDateParts as utilsTzDateParts,
} from "@/lib/utils";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { VI } from "./dict-vi";
// English strings are lazy-loaded (see I18nProvider) so a VI-default user —
// the common case here — never downloads the EN table at all. VI stays
// eager: it's both the default language AND the universal fallback inside
// t(), so it must always be present synchronously.
import type { Dict, Lang, TimeZoneMode } from "./types";

export type { Lang, TimeZoneMode } from "./types";

const LANG_STORAGE_KEY = "clearmind_lang";

/** Replace {name} placeholders. params giữ nguyên nếu key vắng. */
function format(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /**
   * Resolved IANA tz that consumers should pass to `toLocaleString` /
   * `Intl.DateTimeFormat` / FullCalendar. Empty string means "use device"
   * (Intl treats `undefined` the same way — see `useTimeZoneOption`).
   */
  timeZone: string;
  timeZoneMode: TimeZoneMode;
  setTimeZoneMode: (m: TimeZoneMode) => void;
  /** IANA name used when mode === "manual". */
  timeZoneManual: string;
  setTimeZoneManual: (tz: string) => void;
  /** CLI server's tz (live from /api/health). Empty if not CLI mode / probe failed. */
  cliTimeZone: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const TZ_MODE_KEY = "clearmind_tz_mode";
const TZ_MANUAL_KEY = "clearmind_tz_manual";

function deviceTimeZone(): string {
  try {
    // Windows + several browsers still hand back legacy IANA links
    // ("Asia/Saigon", "Asia/Calcutta", "Europe/Kiev") even though those
    // were superseded by the canonical names ("Asia/Ho_Chi_Minh", …)
    // years ago. Normalise here so every consumer downstream — clock,
    // calendar, manual-picker preview, stored localStorage entry — sees
    // a single canonical spelling. Was the source of the "Saigon vs
    // Ho_Chi_Minh inconsistency" UI bug reported on 06-18.
    return canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  } catch {
    return "";
  }
}

/** Day-of-week i18n key arrays — single source of truth.
 *  `DOW_KEYS_SUN_FIRST` lines up with JavaScript's `Date.getDay()` (0=Sun)
 *  so consumers iterating over a week can index directly. `DOW_KEYS_MON_FIRST`
 *  matches the Vietnamese convention used by the date picker and review
 *  heatmap (week starts Monday). Use the one that matches your index source;
 *  don't redeclare them per file (was duplicated in 5 places before). */
export const DOW_KEYS_SUN_FIRST = [
  "review.dow.sun",
  "review.dow.mon",
  "review.dow.tue",
  "review.dow.wed",
  "review.dow.thu",
  "review.dow.fri",
  "review.dow.sat",
] as const;

export const DOW_KEYS_MON_FIRST = [
  "review.dow.mon",
  "review.dow.tue",
  "review.dow.wed",
  "review.dow.thu",
  "review.dow.fri",
  "review.dow.sat",
  "review.dow.sun",
] as const;

export type DowKey = (typeof DOW_KEYS_SUN_FIRST)[number];

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      return saved === "en" ? "en" : "vi";
    } catch {
      return "vi";
    }
  });
  const [timeZoneMode, setTimeZoneModeState] = useState<TimeZoneMode>(() => {
    try {
      const v = localStorage.getItem(TZ_MODE_KEY);
      if (v === "device" || v === "cli" || v === "manual") return v;
    } catch {
      /* ignore */
    }
    return "device";
  });
  const [timeZoneManual, setTimeZoneManualState] = useState<string>(() => {
    try {
      // Canonicalise on read too — old installs may have stored a
      // legacy alias before deviceTimeZone() / setTimeZoneManual were
      // both made alias-aware. Cheap one-shot normalisation.
      const raw = localStorage.getItem(TZ_MANUAL_KEY);
      if (raw) return canonicalTimeZone(raw);
      return deviceTimeZone();
    } catch {
      return deviceTimeZone();
    }
  });
  const [cliTimeZone, setCliTimeZone] = useState<string>("");
  // English dictionary, lazy-loaded on first switch to EN (see the import
  // note at the top of this file). null until then — t() falls back to VI.
  const [enDict, setEnDict] = useState<Dict | null>(null);

  // Fetch the CLI host's tz once at mount. Normalise through the alias
  // map so a server reporting the legacy "Asia/Saigon" matches the
  // canonical "Asia/Ho_Chi_Minh" the picker UI uses.
  useEffect(() => {
    let alive = true;
    const probe = async () => {
      try {
        const r = await fetch("/api/health", { signal: AbortSignal.timeout(2000) });
        if (!r.ok) return;
        const j = (await r.json()) as { tz?: string };
        if (alive && j.tz) setCliTimeZone(canonicalTimeZone(j.tz));
      } catch {
        /* CLI offline — leave blank */
      }
    };
    probe();
    return () => {
      alive = false;
    };
  }, []);

  // Compute resolved tz from mode. "device" returns "" so the formatter
  // picks up the browser's own tz; the others return an IANA name.
  const timeZone = (() => {
    if (timeZoneMode === "cli") return cliTimeZone;
    if (timeZoneMode === "manual") return timeZoneManual;
    return "";
  })();

  useEffect(() => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* private mode / quota — silently ignore */
    }
    document.documentElement.setAttribute("lang", lang);
    // Sync sang CLI để notification dùng đúng ngôn ngữ. Bỏ qua lỗi
    // (chạy dev hay CLI tắt → tiếp tục bình thường).
    fetch("/api/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    }).catch(() => {});
  }, [lang]);

  // Lazy-load the English string table the first time EN is selected. VI
  // users never trigger this. Until it resolves t() falls back to VI, so
  // the worst case is a single-frame VI flash on the very first EN switch.
  useEffect(() => {
    if (lang !== "en" || enDict) return;
    let alive = true;
    import("./dict-en").then((m) => {
      if (alive) setEnDict(m.EN);
    });
    return () => {
      alive = false;
    };
  }, [lang, enDict]);

  // Cross-tab sync: when the user flips language in another tab, mirror
  // the change here so every open Clearmind window reflects the same
  // language without a manual reload.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LANG_STORAGE_KEY) return;
      if (e.newValue === "en" || e.newValue === "vi") {
        setLangState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // CLI ↔ SPA locale sync: when the tray's own "Switch to English /
  // Tiếng Việt" toggle flips the language, the CLI broadcasts a
  // `locale-changed` SSE event. Mirror it here so the open web tabs
  // catch up without a reload. Note: when SPA itself flipped via
  // Settings, we already updated state — re-applying on the echo is a
  // no-op because setLangState bails when the value matches.
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/events");
    } catch {
      return;
    }
    const onLocale = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { lang?: string };
        if (data.lang === "en" || data.lang === "vi") {
          setLangState(data.lang);
        }
      } catch {
        /* ignore malformed payload */
      }
    };
    es.addEventListener("locale-changed", onLocale as EventListener);
    return () => {
      es?.removeEventListener("locale-changed", onLocale as EventListener);
      es?.close();
    };
  }, []);

  // Memoize t + setLang + provider value so consumers don't re-render on
  // every parent update. Previously `t` was a fresh fn each render, which
  // (a) broke memoization in components like VoiceMic (effect deps={[t]}
  // tore down SpeechRecognition mid-utterance) and (b) caused cascading
  // re-renders through every useT() / useI18n() consumer.
  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const setTimeZoneMode = useCallback((m: TimeZoneMode) => {
    try {
      localStorage.setItem(TZ_MODE_KEY, m);
    } catch {
      /* ignore */
    }
    setTimeZoneModeState(m);
  }, []);
  const setTimeZoneManual = useCallback((tz: string) => {
    // Canonicalise on write so the stored value never contains the
    // legacy "Asia/Saigon" form, even if the caller (timezone-picker's
    // list, an ICS import, …) hands one in.
    const canonical = tz ? canonicalTimeZone(tz) : tz;
    try {
      if (canonical) localStorage.setItem(TZ_MANUAL_KEY, canonical);
    } catch {
      /* ignore */
    }
    setTimeZoneManualState(canonical);
  }, []);
  const t = useMemo(
    () => (key: string, params?: Record<string, string | number>): string => {
      const dict = lang === "en" ? enDict ?? VI : VI;
      const raw = dict[key] ?? VI[key] ?? key;
      return format(raw, params);
    },
    [lang, enDict]
  );
  const value = useMemo(
    () => ({
      lang,
      setLang,
      timeZone,
      timeZoneMode,
      setTimeZoneMode,
      timeZoneManual,
      setTimeZoneManual,
      cliTimeZone,
      t,
    }),
    [
      lang,
      setLang,
      timeZone,
      timeZoneMode,
      setTimeZoneMode,
      timeZoneManual,
      setTimeZoneManual,
      cliTimeZone,
      t,
    ]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

/** Shortcut hook khi component chỉ cần t(). */
export function useT() {
  return useI18n().t;
}

/**
 * BCP-47 locale tag matching the app's selected language, for use with
 * `toLocaleDateString` / `toLocaleTimeString` / `Intl.*`. Important:
 * passing `undefined` to these APIs reads `navigator.language` (the OS),
 * which can differ from the user's choice inside Clearmind. Always pass
 * this tag instead to keep date formatting in lockstep with the app
 * language toggle.
 */
export function useLocaleTag(): string {
  return useI18n().lang === "en" ? "en-US" : "vi-VN";
}

/**
 * IANA time-zone override (empty string = device default). Use the return
 * value as the `timeZone` option in `toLocaleString` / `Intl.DateTimeFormat`,
 * or as the `timeZone` prop on FullCalendar.
 */
export function useTimeZone(): string {
  return useI18n().timeZone;
}

/**
 * Spread-friendly variant: returns `{ timeZone: "X" }` when an override is
 * set, `{}` when not. Use like:
 *   now.toLocaleTimeString(locale, { hour: "2-digit", ...tzOpt })
 */
export function useTimeZoneOption(): { timeZone?: string } {
  const tz = useI18n().timeZone;
  return tz ? { timeZone: tz } : {};
}

/**
 * Date helpers pre-bound with the user's chosen tz. Use this everywhere
 * instead of importing `isToday` / `dayKey` / etc. directly from
 * `@/lib/utils` — bare imports stay system-tz, which only matches the
 * user's chosen tz when they're in Auto mode.
 */
export function useDateFns() {
  const tz = useI18n().timeZone;
  return useMemo(
    () => ({
      tz,
      dayKey: (d: Date) => utilsDayKey(d, tz),
      isToday: (deadline?: string, now?: Date) => utilsIsToday(deadline, now, tz),
      bucketByDate: (deadline?: string, now?: Date) =>
        utilsBucketByDate(deadline, now, tz),
      groupByBucket: (tasks: Parameters<typeof utilsGroupByBucket>[0]) =>
        utilsGroupByBucket(tasks, new Date(), tz),
      extractTimeLabel: (deadline?: string) => utilsExtractTimeLabel(deadline, tz),
      formatDeadline: (iso?: string) => utilsFormatDeadline(iso, tz),
      formatTimeAgoShort: (deadline: string, now?: Date) =>
        utilsFormatTimeAgoShort(deadline, now, tz),
      tzDateParts: (d: Date) => utilsTzDateParts(d, tz),
    }),
    [tz]
  );
}
