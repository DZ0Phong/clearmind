import { useEffect, useRef } from "react";

/**
 * Horizontal swipe-to-navigate hook for touch viewports. Attach via a
 * ref to any element; the hook listens for `pointer*` events and calls
 * `onPrev` / `onNext` when the user swipes ≥ threshold px horizontally
 * within ~600ms (a confident swipe, not an accidental drag).
 *
 * Heuristics:
 *   - Skips mouse pointers — desktop users navigate via prev/next
 *     buttons, swiping with a mouse would steal text-selection.
 *   - Aborts the gesture mid-move if the user drifts more vertically
 *     than horizontally (1.5× ratio). That preserves the page's
 *     natural vertical scroll on a touch device — we don't hijack
 *     every horizontal tilt.
 *   - 60px default threshold so an accidental finger jiggle doesn't
 *     paginate the view. Bumpable per call site (e.g. tab strips
 *     might want 80px to reduce false fires).
 *
 * Callback identities don't need to be stable — they're proxied
 * through a ref so the effect can carry stable [enabled, threshold]
 * deps without re-binding listeners on every parent render.
 */
interface SwipeOpts {
  /** Fires on right→left swipe (next month, next page, …). */
  onNext: () => void;
  /** Fires on left→right swipe (previous month, previous page, …). */
  onPrev: () => void;
  /** Default true. Pass `false` to suspend listeners (e.g. when a dialog is open). */
  enabled?: boolean;
  /** Minimum horizontal distance in px before a release counts as a swipe. Default 60. */
  threshold?: number;
}

export function useSwipeNav(
  ref: React.RefObject<HTMLElement | null>,
  opts: SwipeOpts
) {
  // Funnel handlers through a ref so the effect's deps don't include
  // the inline onPrev / onNext fns (which would re-bind listeners on
  // every parent render, fighting the touch interaction).
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (opts.enabled === false) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let dragging = false;
    const threshold = opts.threshold ?? 60;

    // Touch-only implementation. Pointer events were the obvious
    // unified path but Chromium fires `pointercancel` the moment it
    // decides a finger drag is "really" a scroll — which kills the
    // pointermove stream mid-swipe. Touch events keep flowing under
    // the same condition, so we read directly from them and let the
    // browser do its own scroll thing via touch-action CSS hints.
    // Mouse swipe is intentionally NOT supported here — desktop has
    // prev/next buttons and dragging the mouse on FC would drag text
    // selection or events.
    const onTouchStart = (e: TouchEvent) => {
      const t0 = e.touches[0];
      if (!t0) return;
      startX = t0.clientX;
      startY = t0.clientY;
      startT = Date.now();
      dragging = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging) return;
      const t0 = e.touches[0];
      if (!t0) return;
      const dy = t0.clientY - startY;
      const dx = t0.clientX - startX;
      // If the drift becomes mostly vertical, the user is scrolling
      // the page — drop this gesture so we don't fire later on a
      // touchend whose dx happens to clear the threshold.
      if (Math.abs(dy) > Math.abs(dx) * 1.5 && Math.abs(dy) > 18) {
        dragging = false;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!dragging) return;
      dragging = false;
      const t0 = e.changedTouches[0];
      if (!t0) return;
      const dx = t0.clientX - startX;
      const dt = Date.now() - startT;
      if (Math.abs(dx) < threshold) return;
      if (dt > 600) return;
      if (dx > 0) optsRef.current.onPrev();
      else optsRef.current.onNext();
    };
    const onTouchCancel = () => {
      dragging = false;
    };

    // Capture phase — fire on the way DOWN to the target so descendant
    // listeners (FC drag handlers) can't silence us via stopPropagation.
    // Passive — we never preventDefault, so the browser's native
    // vertical scroll keeps working unimpeded.
    const opts3 = { capture: true, passive: true } as const;
    el.addEventListener("touchstart", onTouchStart, opts3);
    el.addEventListener("touchmove", onTouchMove, opts3);
    el.addEventListener("touchend", onTouchEnd, opts3);
    el.addEventListener("touchcancel", onTouchCancel, opts3);
    return () => {
      el.removeEventListener("touchstart", onTouchStart, opts3);
      el.removeEventListener("touchmove", onTouchMove, opts3);
      el.removeEventListener("touchend", onTouchEnd, opts3);
      el.removeEventListener("touchcancel", onTouchCancel, opts3);
    };
  }, [ref, opts.enabled, opts.threshold]);
}
