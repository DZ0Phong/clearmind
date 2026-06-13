import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Globe,
  Monitor,
  Server,
  Search,
} from "lucide-react";
import { useI18n, type TimeZoneMode } from "@/lib/i18n";
import { isCliMode } from "@/lib/cli-bridge";
import { canonicalTimeZone, cn } from "@/lib/utils";

const TZ_GROUPS: Array<{ region: string; zones: string[] }> = [
  {
    region: "Asia",
    zones: [
      "Asia/Ho_Chi_Minh",
      "Asia/Bangkok",
      "Asia/Singapore",
      "Asia/Kuala_Lumpur",
      "Asia/Jakarta",
      "Asia/Manila",
      "Asia/Hong_Kong",
      "Asia/Taipei",
      "Asia/Shanghai",
      "Asia/Tokyo",
      "Asia/Seoul",
      "Asia/Kolkata",
      "Asia/Dubai",
    ],
  },
  {
    region: "Europe",
    zones: [
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Amsterdam",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Istanbul",
      "Europe/Moscow",
    ],
  },
  {
    region: "Americas",
    zones: [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Vancouver",
      "America/Toronto",
      "America/Mexico_City",
      "America/Sao_Paulo",
    ],
  },
  {
    region: "Oceania",
    zones: [
      "Australia/Sydney",
      "Australia/Melbourne",
      "Australia/Perth",
      "Pacific/Auckland",
      "Pacific/Honolulu",
    ],
  },
  { region: "UTC", zones: ["UTC"] },
];

/**
 * Render the current UTC offset for `tz` as "UTC+7", "UTC-5:30", "UTC".
 * Uses `timeZoneName: 'shortOffset'` which gives the actual offset (not
 * the city's abbreviated name) — and respects DST automatically.
 * Intl's raw output uses a historical prefix that we rewrite to "UTC"
 * so the whole picker speaks one consistent label.
 */
function getUtcOffset(tz: string): string {
  if (!tz) return "";
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = fmt.formatToParts(new Date());
    const raw = parts.find((p) => p.type === "timeZoneName")?.value || "";
    return raw.replace(/^GMT/, "UTC");
  } catch {
    return "";
  }
}

/**
 * Numeric UTC offset in minutes (e.g. 420 for UTC+7, -300 for UTC-5,
 * -210 for UTC-3:30). Used to sort the list by linear UTC offset so the
 * user sees a contiguous ordering instead of region-grouped chaos.
 */
function getUtcOffsetMinutes(tz: string): number {
  const off = getUtcOffset(tz);
  if (!off || off === "UTC") return 0;
  const m = off.match(/UTC([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "+" ? 1 : -1;
  const hours = parseInt(m[2], 10);
  const minutes = m[3] ? parseInt(m[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}

function deviceTimeZone(): string {
  try {
    const raw = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    // Windows + several browsers still report legacy IANA links
    // ("Asia/Saigon", "Europe/Kiev"). Normalise to the canonical name
    // so the preview matches the option list — see canonicalTimeZone
    // in utils.ts for the mapping table.
    return canonicalTimeZone(raw);
  } catch {
    return "";
  }
}

/**
 * Flat list of all timezones sorted by UTC offset ascending so the
 * dropdown reads as a contiguous timeline (UTC-12 → UTC+14) instead of
 * region-grouped clumps where +7 sits next to -5. Region is kept as a
 * trailing tag so the user can still scan by continent visually.
 *
 * Computed once at module load — DST flips don't move zones across the
 * sort boundary often enough to bother recomputing.
 */
const FLAT_TZ: Array<{ zone: string; region: string }> = TZ_GROUPS.flatMap(
  (g) => g.zones.map((zone) => ({ zone, region: g.region }))
).sort((a, b) => getUtcOffsetMinutes(a.zone) - getUtcOffsetMinutes(b.zone));

export function TimezonePicker() {
  const {
    timeZoneMode,
    setTimeZoneMode,
    timeZoneManual,
    setTimeZoneManual,
    cliTimeZone,
    t,
  } = useI18n();
  const cli = isCliMode();
  const device = deviceTimeZone();
  // Show the CLI-server option ONLY when it would actually differ from
  // the browser's tz — when they match (common case: CLI runs on the
  // same machine as the browser) the option is redundant and just adds
  // confusion. The real use case is a traveling laptop pointing at a
  // home machine's CLI.
  const cliMeaningful = cli && !!cliTimeZone && cliTimeZone !== device;
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");
  const rootRef = useRef<HTMLDivElement>(null);

  // When the popover opens, decide if it should drop down or flip up
  // based on actual room left in the viewport. Settings page is scroll-
  // able, so a picker rendered halfway down can easily lose 260px of
  // space below — flipping above prevents the user from having to
  // scroll down just to read the list.
  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    // ~330 covers the popover height (max 260 list + 40 search + 30 chrome).
    setPlacement(spaceBelow < 330 ? "top" : "bottom");
  }, [open]);

  // Close popover on outside click or ESC. Listeners only when open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Resolve the tz the preview line should show.
  const previewTz =
    timeZoneMode === "cli"
      ? cliTimeZone
      : timeZoneMode === "manual"
        ? timeZoneManual
        : device;
  const previewOffset = getUtcOffset(previewTz);

  const pickMode = (m: TimeZoneMode) => {
    setTimeZoneMode(m);
    // Opening the manual picker right when the user chooses Custom avoids
    // a dead-state where they pick "Custom" and the picker doesn't appear
    // until they hunt for a separate "Change" link.
    if (m === "manual") setOpen(true);
  };

  return (
    <div
      ref={rootRef}
      className="relative inline-flex flex-col items-end gap-1.5"
    >
      <div
        role="radiogroup"
        aria-label={t("settings.tz.label")}
        className="inline-flex items-center gap-1 p-1 rounded-xl border bg-muted/40"
      >
        <ModeButton
          icon={Monitor}
          label={t("settings.tz.modeDevice")}
          tooltip={t("settings.tz.modeDeviceHint")}
          active={timeZoneMode === "device"}
          onClick={() => pickMode("device")}
          data-testid="tz-mode-device"
        />
        {cliMeaningful && (
          <ModeButton
            icon={Server}
            label={t("settings.tz.modeCli")}
            tooltip={t("settings.tz.modeCliHint", { tz: cliTimeZone })}
            active={timeZoneMode === "cli"}
            onClick={() => pickMode("cli")}
            data-testid="tz-mode-cli"
          />
        )}
        <ModeButton
          icon={Globe}
          label={t("settings.tz.modeManual")}
          tooltip={t("settings.tz.modeManualHint")}
          active={timeZoneMode === "manual"}
          onClick={() => pickMode("manual")}
          data-testid="tz-mode-manual"
        />
      </div>

      <div
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums"
        data-testid="tz-preview"
      >
        {previewTz ? (
          <>
            <span className="font-mono font-semibold text-foreground">
              {previewOffset || "UTC"}
            </span>
            <span>·</span>
            <span>{previewTz.replace(/_/g, " ")}</span>
            {timeZoneMode === "manual" && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className={cn(
                  "ml-1 inline-flex items-center gap-0.5 text-foreground hover:text-primary",
                  "transition-colors"
                )}
              >
                {t("settings.tz.change")}
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    open && "rotate-180"
                  )}
                />
              </button>
            )}
          </>
        ) : timeZoneMode === "cli" ? (
          <span className="italic text-amber-600 dark:text-amber-400">
            {t("settings.tz.cliOffline")}
          </span>
        ) : null}
      </div>

      {open && timeZoneMode === "manual" && (
        <ManualPicker
          value={timeZoneManual}
          placement={placement}
          onPick={(tz) => {
            setTimeZoneManual(tz);
            setOpen(false);
          }}
          searchPlaceholder={t("settings.tz.searchPlaceholder")}
          emptyLabel={t("settings.tz.searchEmpty")}
        />
      )}
    </div>
  );
}

interface ModeButtonProps {
  icon: typeof Monitor;
  label: string;
  tooltip: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  "data-testid"?: string;
}

function ModeButton({
  icon: Icon,
  label,
  tooltip,
  active,
  onClick,
  disabled,
  ...rest
}: ModeButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      data-testid={rest["data-testid"]}
      className={cn(
        "cm-press inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg",
        "text-xs font-medium transition-all duration-150",
        active
          ? "bg-background shadow-sm text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-background/50",
        disabled &&
          "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ManualPicker({
  value,
  placement,
  onPick,
  searchPlaceholder,
  emptyLabel,
}: {
  value: string;
  placement: "top" | "bottom";
  onPick: (tz: string) => void;
  searchPlaceholder: string;
  emptyLabel: string;
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/_/g, " ");
    if (!q) return FLAT_TZ;
    return FLAT_TZ.filter((it) => {
      const z = it.zone.toLowerCase().replace(/_/g, " ");
      const o = getUtcOffset(it.zone).toLowerCase();
      return z.includes(q) || o.includes(q) || it.region.toLowerCase().includes(q);
    });
  }, [search]);

  return (
    <div
      className={cn(
        "absolute right-0 z-50 w-[300px]",
        "rounded-xl border bg-popover shadow-xl overflow-hidden",
        "animate-in fade-in duration-150",
        placement === "top"
          ? "bottom-full mb-2 slide-in-from-bottom-1"
          : "top-full mt-2 slide-in-from-top-1"
      )}
      data-testid="tz-popover"
    >
      <div className="relative border-b">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className={cn(
            "w-full h-9 pl-8 pr-3 text-xs bg-transparent",
            "border-0 outline-none placeholder:text-muted-foreground"
          )}
          data-testid="tz-search"
        />
      </div>
      <ul className="max-h-[260px] overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <li className="text-xs text-muted-foreground text-center py-6">
            {emptyLabel}
          </li>
        ) : (
          filtered.map(({ zone, region }) => {
            const offset = getUtcOffset(zone);
            const active = zone === value;
            return (
              <li key={zone}>
                <button
                  type="button"
                  onClick={() => onPick(zone)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs",
                    "transition-colors text-left",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent"
                  )}
                >
                  <span className="font-mono font-semibold tabular-nums w-12 shrink-0">
                    {offset || "UTC"}
                  </span>
                  <span className="flex-1 truncate">
                    {zone.replace(/_/g, " ")}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {region}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
