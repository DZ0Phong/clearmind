/**
 * Global wheel-scroll normaliser.
 *
 * The browser default is "vertical wheel scrolls the page vertically".
 * That's wrong for horizontally-overflowing containers (tab strips,
 * chip rows, calendar week strips) — the user's intent when wheeling
 * over a horizontal scrollbar is "move this row left/right", not
 * "scroll the page underneath".
 *
 * This module installs ONE delegated wheel listener on `document`
 * that walks up from the event target, finds the nearest ancestor
 * with `overflow-x: auto | scroll` that's horizontally overflowing
 * AND can't scroll vertically, and translates `deltaY` into
 * `scrollLeft`. Vertical scrollers (lists, dialogs, etc.) are
 * untouched, so wheel keeps doing what users expect everywhere else.
 *
 * Why one delegated listener instead of per-component hooks:
 *   - Components don't need to opt in. New horizontal scrollers get
 *     wheel support automatically as long as they use `overflow-x`.
 *   - Single listener, single cost. No teardown to manage.
 *   - Survives portals / dialogs / popovers — the document handler
 *     sees every wheel event no matter where it originates.
 */
const FLAG = "__cm_horizontal_wheel_installed__";

function isHorizontalOnlyScroller(node: HTMLElement): boolean {
  // Tolerate ~1px rounding from sub-pixel layout when deciding "no
  // vertical overflow" — without this guard, devices with retina
  // scaling occasionally fall through with 0.5px diff.
  const verticalFlat = node.scrollHeight <= node.clientHeight + 1;
  const horizontallyOverflowing = node.scrollWidth > node.clientWidth + 1;
  if (!verticalFlat || !horizontallyOverflowing) return false;
  const style = getComputedStyle(node);
  return style.overflowX === "auto" || style.overflowX === "scroll";
}

export function installGlobalWheelNormaliser() {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (w[FLAG]) return;
  w[FLAG] = true;

  document.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      // Skip when the user is already wheeling sideways (trackpad
      // two-finger horizontal) — the browser handles that natively.
      if (e.deltaX !== 0) return;
      if (e.deltaY === 0) return;

      let node = e.target as HTMLElement | null;
      while (node && node !== document.body) {
        if (isHorizontalOnlyScroller(node)) {
          e.preventDefault();
          // Combine deltaY + any (unlikely) deltaX so both axes
          // accumulate even if the user's mouse fires mixed events.
          node.scrollLeft += e.deltaY + e.deltaX;
          return;
        }
        node = node.parentElement;
      }
    },
    { passive: false }
  );
}
