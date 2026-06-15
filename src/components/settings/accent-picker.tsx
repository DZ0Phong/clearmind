import { useEffect, useRef, useState } from "react";
import { Check, Palette, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAccent, ACCENTS, type Accent } from "@/components/accent-provider";
import { useT } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-media-query";
import { useSheetSwipeDown } from "@/hooks/use-sheet-swipe-down";
import { cn } from "@/lib/utils";

// 6 popular picks pinned to the Settings row for one-click access. The
// rest of the palette lives behind the More button which opens a
// dedicated Theme Studio dialog.
const INLINE: Accent[] = [
  "indigo",
  "violet",
  "blue",
  "emerald",
  "rose",
  "orange",
];
const INLINE_SET = new Set<Accent>(INLINE);

// Grouped palette surfaced inside the dialog as tabs. Each section is
// one tab so the user only ever sees one category at a time — avoids
// the "wall of dots" feeling.
const SECTIONS: Array<{ key: string; accents: Accent[] }> = [
  {
    key: "classic",
    accents: [
      "red", "rose", "pink", "fuchsia",
      "purple", "violet", "indigo", "blue",
      "sky", "cyan", "teal", "emerald",
      "green", "amber", "orange", "slate",
    ],
  },
  { key: "pastel", accents: ["lavender", "mint", "peach", "blush"] },
  { key: "warm", accents: ["terracotta", "mustard", "rust", "olive"] },
  { key: "vibrant", accents: ["magenta", "lime", "aqua", "cobalt"] },
  { key: "accessible", accents: ["vermillion", "bluegray"] },
  { key: "neutral", accents: ["graphite", "mocha"] },
];

// Studio shows the FULL palette per section — no dedup against the inline
// strip. The previous "drop inline colors from dialog" behaviour created
// the "ô màu chạy ra 1 chỗ khác biệt" confusion: a user with indigo
// selected (visible in the inline strip) would open Studio and find that
// the Classic tab had been quietly stripped of indigo (and 5 other
// inline colors). They'd land on a tab where their current color simply
// wasn't, and the visible palette looked completely different from the
// row they just clicked "More" from. Showing the full set everywhere
// keeps the mental model consistent — inline = quick picks, Studio =
// the same picks plus the rest, with the current one highlighted.
const DIALOG_SECTIONS = SECTIONS;

function resolveAccentColor(accent: Accent): string {
  const isDark = document.documentElement.classList.contains("dark");
  return ACCENTS[accent][isDark ? "dark" : "light"];
}

/**
 * Paint the live `--primary` / `--ring` CSS variables. `null` (or
 * "indigo", the default) clears the inline override so `:root` /
 * `.dark` defaults from `index.css` take back over.
 */
function applyAccentVars(accent: Accent | null) {
  const root = document.documentElement;
  if (accent === null || accent === "indigo") {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--ring");
    return;
  }
  const color = resolveAccentColor(accent);
  root.style.setProperty("--primary", color);
  root.style.setProperty("--ring", color);
}

/**
 * Accent picker — Theme Studio pattern.
 *
 * Settings row stays compact: 6 popular swatches + a Palette button
 * that opens a dedicated dialog. The dialog uses tabbed categories
 * (Classic / Pastel / Warm / Vibrant / Accessible / Neutral) so the
 * user only sees one cluster at a time instead of a wall of dots,
 * and includes a live mini-preview pane (button + badge + link +
 * focus ring) that paints with the hovered or committed accent so
 * the user can see the impact before picking.
 *
 * Why dialog instead of inline expand / popover:
 *   - Inline expansion grew the Settings card so long that the page
 *     scrolled away from the rest of the controls — felt cluttered
 *     and the row's title vertically centred against the panel.
 *   - Popover had to choose "open up" or "open down" — neither
 *     worked once the palette outgrew the available viewport room.
 *   - A dialog is the standard escape hatch for "this needs its own
 *     space" and is what Linear / Notion / Apple Settings reach for
 *     when a control needs more canvas than its row provides.
 *
 * Live hover preview still works on the inline swatches *and* the
 * dialog swatches. Picking never auto-closes the dialog so users
 * can chain picks.
 */
export function AccentPicker() {
  const { accent, setAccent } = useAccent();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<Accent | null>(null);

  const activeIsExtra = !INLINE_SET.has(accent);

  // Paint --primary live from `hovered ?? accent`. The provider's own
  // effect runs only when `accent` changes, so we override directly
  // here while the picker is interactive. On close, repaint with the
  // committed accent to wipe any preview tint.
  useEffect(() => {
    applyAccentVars(hovered ?? accent);
  }, [hovered, accent]);

  useEffect(() => {
    if (!open) {
      applyAccentVars(accent);
      setHovered(null);
    }
  }, [open, accent]);

  return (
    <>
      <div
        role="radiogroup"
        aria-label={t("settings.accent.label")}
        className="inline-flex items-center gap-1.5 p-1.5 rounded-xl border bg-muted/40"
      >
        {INLINE.map((a) => (
          <Swatch
            key={a}
            accent={a}
            active={accent === a}
            onCommit={() => setAccent(a)}
            onHover={() => setHovered(a)}
            onHoverEnd={() => setHovered(null)}
          />
        ))}

        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t("settings.accent.more")}
          aria-label={t("settings.accent.more")}
          aria-haspopup="dialog"
          data-testid="accent-more"
          className={cn(
            "cm-press relative h-7 w-7 rounded-full flex items-center justify-center transition-all duration-200",
            "border border-input bg-background hover:bg-accent",
            // Surface the selected color on the More button when it
            // isn't one of the inline picks, so the row still hints
            // at the user's pick without opening the dialog.
            activeIsExtra
              ? "ring-2 ring-offset-2 ring-foreground/40 ring-offset-background"
              : "hover:scale-110"
          )}
        >
          {activeIsExtra ? (
            <span
              aria-hidden
              style={{ background: ACCENTS[accent].light }}
              className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10 dark:ring-white/10"
            />
          ) : (
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      <AccentStudio
        open={open}
        onOpenChange={setOpen}
        accent={accent}
        onCommit={setAccent}
        hovered={hovered}
        onHover={setHovered}
        onHoverEnd={() => setHovered(null)}
      />
    </>
  );
}

/**
 * Theme Studio dialog. Tab strip on top (one tab per category) + a
 * swatch grid for the active tab + a live preview pane underneath
 * showing how the hovered/committed accent paints the app's primary
 * surfaces. Stays open after picking so users can compare colors.
 */
function AccentStudio({
  open,
  onOpenChange,
  accent,
  onCommit,
  hovered,
  onHover,
  onHoverEnd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accent: Accent;
  onCommit: (a: Accent) => void;
  hovered: Accent | null;
  onHover: (a: Accent) => void;
  onHoverEnd: () => void;
}) {
  const t = useT();
  const isMobile = useIsMobile();
  // Mobile: swipe the sheet downward to dismiss. Pulled out into a
  // hook so the same gesture works on every cm-sheet-mobile we add
  // later (timezone picker, etc.).
  const { sheetProps } = useSheetSwipeDown({
    enabled: isMobile,
    onDismiss: () => onOpenChange(false),
  });

  // Find the section that contains the committed accent so the tab
  // strip opens on the right group. If the user is on an inline pick
  // (those were filtered out of DIALOG_SECTIONS), fall back to the
  // first available section.
  const defaultSection =
    DIALOG_SECTIONS.find((s) => s.accents.includes(accent))?.key ??
    DIALOG_SECTIONS[0]?.key;
  const [activeKey, setActiveKey] = useState<string>(defaultSection);
  const swatchStripRef = useRef<HTMLDivElement>(null);

  // Re-sync the tab when the committed accent moves into a different
  // group between opens (e.g. user picked from inline strip, then
  // re-opens dialog — would otherwise stick on the previous tab).
  useEffect(() => {
    if (!open) return;
    const sec = DIALOG_SECTIONS.find((s) => s.accents.includes(accent));
    if (sec) setActiveKey(sec.key);
  }, [open, accent]);

  // Wheel-to-horizontal scroll normaliser on the swatch strip — desktop
  // users with a mouse wheel can flick through long palettes without
  // grabbing the scrollbar. Vertical wheel deltaY converts to horizontal
  // scrollLeft. Trackpad horizontal swipe (deltaX) already works
  // natively; this only assists vertical-wheel hardware.
  useEffect(() => {
    const el = swatchStripRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      // Only intercept if there's actually horizontal overflow to scroll.
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [activeKey]);

  const activeSection = DIALOG_SECTIONS.find((s) => s.key === activeKey)
    ?? DIALOG_SECTIONS[0];

  // The accent powering the preview pane. Hover wins so the user can
  // preview without committing; falls back to the committed one when
  // the cursor leaves the swatch grid.
  const previewAccent = hovered ?? accent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl gap-4 cm-sheet-mobile"
        data-testid="accent-studio"
        {...sheetProps}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("settings.accent.label")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.accent.previewHint")}
          </DialogDescription>
        </DialogHeader>

        {/* Tab strip — one tab per category. Pill style matches the
            Settings page tab nav so the affordance reads the same.
            cm-scroll-x-visible: 8px-tall styled bar on desktop, fade-
            edge gradient on mobile (so user knows there's more). */}
        <div
          role="tablist"
          aria-label={t("settings.accent.label")}
          className="cm-seg-track cm-scroll-x-visible"
        >
          {DIALOG_SECTIONS.map((s) => {
            const active = activeKey === s.key;
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={active}
                data-active={active}
                onClick={() => setActiveKey(s.key)}
                data-testid={`accent-tab-${s.key}`}
                className="cm-seg-item cm-seg-item-sm cm-press shrink-0"
              >
                {t(`settings.accent.group.${s.key}`)}
              </button>
            );
          })}
        </div>

        {/* Swatch strip — single horizontal row per tab, scrolls when
            the active tab has more swatches than fit (Classic 16 → 4
            visible on a 375px viewport). Visible scrollbar on desktop;
            mouse wheel scrolls horizontally too (wheel normaliser
            above). min-h locks the strip height so the dialog doesn't
            jump as the user flips between tabs of different sizes. */}
        <div
          ref={swatchStripRef}
          className="cm-scroll-x-visible min-h-[72px] flex items-center gap-2.5 p-3 rounded-lg border bg-card"
        >
          {activeSection?.accents.map((a) => (
            <Swatch
              key={a}
              accent={a}
              active={accent === a}
              size="lg"
              onCommit={() => onCommit(a)}
              onHover={() => onHover(a)}
              onHoverEnd={onHoverEnd}
            />
          ))}
        </div>

        {/* Live preview pane — mini snapshot of how the accent paints
            the app. Updates instantly as the user hovers a swatch, so
            commitment isn't required to see impact. */}
        <PreviewPane accent={previewAccent} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mini preview of primary surfaces: a filled button, an outline
 * button, a link, and a badge. The accent name + UTC offset-style
 * hex chip sits to the side so the user can read what they're
 * previewing.
 */
function PreviewPane({ accent }: { accent: Accent }) {
  const t = useT();
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
          {t("settings.accent.preview.label")}
        </p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {t(`accent.${accent}`)}
          </span>
          <span
            aria-hidden
            style={{ background: ACCENTS[accent].light }}
            className="h-3 w-3 rounded-full ring-1 ring-black/10 dark:ring-white/10"
          />
          <span className="font-mono tabular-nums">
            {ACCENTS[accent].light}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="cm-press inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity pointer-events-none"
        >
          {t("settings.accent.preview.button")}
        </button>
        <button
          type="button"
          className="cm-press inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold border border-primary text-primary hover:bg-primary/10 transition-colors pointer-events-none"
        >
          {t("settings.accent.preview.outline")}
        </button>
        <a
          className="text-xs text-primary underline underline-offset-2 pointer-events-none"
          href="#"
        >
          {t("settings.accent.preview.link")}
        </a>
        <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {t("settings.accent.preview.badge")}
        </span>
      </div>
    </div>
  );
}

/**
 * Single colour dot. `size="lg"` is used in the dialog where there's
 * room to make each swatch bigger and easier to hit. `onCommit` runs
 * on click but doesn't close the dialog — the parent decides closure.
 */
function Swatch({
  accent,
  active,
  size = "sm",
  onCommit,
  onHover,
  onHoverEnd,
}: {
  accent: Accent;
  active: boolean;
  size?: "sm" | "lg";
  onCommit: () => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
}) {
  const t = useT();
  const color = ACCENTS[accent].light;
  const dim = size === "lg" ? "h-9 w-9" : "h-7 w-7";
  const checkDim = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onCommit}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onFocus={onHover}
      onBlur={onHoverEnd}
      title={t(`accent.${accent}`)}
      data-testid={`accent-swatch-${accent}`}
      style={{ background: color }}
      className={cn(
        "cm-press relative rounded-full transition-all duration-200 outline-none shrink-0",
        dim,
        "hover:scale-110 hover:shadow-md focus-visible:scale-110 focus-visible:shadow-md",
        active
          ? "ring-2 ring-offset-2 ring-foreground/40 ring-offset-background scale-110 shadow-lg"
          : "ring-1 ring-black/10 dark:ring-white/10"
      )}
    >
      {active && (
        <Check
          className={cn("absolute inset-0 m-auto text-white drop-shadow", checkDim)}
          strokeWidth={3}
        />
      )}
    </button>
  );
}
