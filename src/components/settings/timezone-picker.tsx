import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Globe, Monitor, Server, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n, type TimeZoneMode } from "@/lib/i18n";
import { isCliMode } from "@/lib/cli-bridge";
import { canonicalTimeZone, cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-media-query";
import { useSheetSwipeDown } from "@/hooks/use-sheet-swipe-down";

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
      "Asia/Kathmandu",
      "Asia/Yangon",
      "Asia/Tehran",
      "Asia/Kabul",
      "Asia/Karachi",
      "Asia/Dubai",
      "Asia/Jerusalem",
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
      "Europe/Athens",
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
      "America/Buenos_Aires",
      "America/St_Johns",
    ],
  },
  {
    region: "Africa",
    zones: ["Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg", "Africa/Nairobi"],
  },
  {
    region: "Oceania",
    zones: [
      "Australia/Sydney",
      "Australia/Adelaide",
      "Australia/Perth",
      "Pacific/Auckland",
      "Pacific/Honolulu",
      "Pacific/Chatham",
    ],
  },
  { region: "UTC", zones: ["UTC"] },
];

/**
 * Render the current UTC offset for `tz` as "UTC+7", "UTC-5:30", "UTC".
 * Uses `timeZoneName: 'shortOffset'` — actual offset (not city
 * abbreviation), DST-aware. Rewrites the historical "GMT" prefix to
 * "UTC" so the whole picker speaks one consistent label.
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

/** Numeric offset in minutes, used for sort. */
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
    return canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  } catch {
    return "";
  }
}

/**
 * Flat list sorted by UTC offset ascending so the dialog reads as a
 * contiguous timeline (UTC-12 → UTC+14) instead of region-grouped
 * clumps where +7 sits next to -5. Region is kept as a trailing tag
 * so the user can still scan by continent visually.
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
  // same machine as the browser) the option is redundant.
  const cliMeaningful = cli && !!cliTimeZone && cliTimeZone !== device;
  const [open, setOpen] = useState(false);

  const previewTz =
    timeZoneMode === "cli"
      ? cliTimeZone
      : timeZoneMode === "manual"
        ? timeZoneManual
        : device;
  const previewOffset = getUtcOffset(previewTz);

  const pickMode = (m: TimeZoneMode) => {
    setTimeZoneMode(m);
    if (m === "manual") setOpen(true);
  };

  return (
    <div className="inline-flex flex-col items-start gap-1.5 lg:items-end">
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
            <span className="truncate max-w-[12rem]">
              {previewTz.replace(/_/g, " ")}
            </span>
          </>
        ) : timeZoneMode === "cli" ? (
          <span className="italic text-amber-600 dark:text-amber-400">
            {t("settings.tz.cliOffline")}
          </span>
        ) : null}
      </div>

      <TimezoneDialog
        open={open}
        onOpenChange={setOpen}
        value={timeZoneManual}
        onPick={setTimeZoneManual}
      />
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

/**
 * Timezone dialog (mobile sheet) — search-filtered IANA list.
 *
 * Picking a row commits the new tz IMMEDIATELY but does NOT close the
 * dialog — same as accent-picker's Theme Studio. Users can chain picks
 * (compare offsets, sample different cities) before closing via the
 * top-right X / Escape / swipe-down. This is the consistent pattern
 * across every "studio"-style picker dialog in the app.
 *
 * The earlier free-text UTC-offset input and stepper variant both
 * shipped here. Both were dropped on 06-18-r3: the free-text felt
 * laggy (heavy validation per keystroke), and the stepper was tossing
 * users into the "no IANA zone for this combo" wall when they dialled
 * exotic offsets like +9:45. The international IANA list with a few
 * extra half-hour cities (Kolkata, Kathmandu, Adelaide, Lord Howe,
 * Chatham, etc.) is enough — the curated set covers every offset a
 * user could realistically need, and the search makes find-by-name
 * one-click.
 */
function TimezoneDialog({
  open,
  onOpenChange,
  value,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: string;
  onPick: (tz: string) => void;
}) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const { sheetProps } = useSheetSwipeDown({
    enabled: isMobile,
    onDismiss: () => onOpenChange(false),
  });
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    window.setTimeout(() => searchInputRef.current?.focus(), 80);
  }, [open]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md cm-sheet-mobile"
        data-testid="tz-dialog"
        {...sheetProps}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            {t("settings.tz.dialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("settings.tz.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchInputRef}
              id="tz-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("settings.tz.searchPlaceholder")}
              className={cn(
                "w-full h-9 pl-8 pr-3 text-sm",
                "rounded-lg border bg-background outline-none",
                "focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              )}
              data-testid="tz-search"
            />
          </div>
          <ul className="max-h-[360px] overflow-y-auto rounded-lg border bg-background/50 divide-y divide-border/50">
            {filtered.length === 0 ? (
              <li className="text-xs text-muted-foreground text-center py-6">
                {t("settings.tz.searchEmpty")}
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
                        "w-full flex items-center gap-2 px-3 py-2 text-sm",
                        "transition-colors text-left",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-accent"
                      )}
                    >
                      <span className="font-mono font-semibold tabular-nums w-14 shrink-0 text-xs">
                        {offset || "UTC"}
                      </span>
                      <span className="flex-1 truncate">
                        {zone.replace(/_/g, " ")}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {region}
                      </span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
