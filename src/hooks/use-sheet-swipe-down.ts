import { useCallback, useEffect, useRef } from "react";

/**
 * Pointer-event powered "drag down to dismiss" gesture for mobile
 * bottom-sheet dialogs. Vanilla pointer events — no third-party
 * gesture library needed.
 *
 * Behaviour mirrors iOS / Material sheets:
 *   - Drag only initiates when the inner content is scrolled to top
 *     (scrollTop === 0). If the user has scrolled the sheet body down,
 *     pulling further down should let them scroll back, NOT dismiss.
 *   - Sheet follows the finger 1:1 while dragging.
 *   - Release at delta > 100px (or velocity > 0.6 px/ms) → dismiss.
 *   - Release below threshold → spring back to anchored position.
 *   - Up-drag (negative delta) is clamped to 0 — sheet cannot fly
 *     above its docked position.
 *
 * Wiring (caller decides if/when to enable, typically isMobile):
 *   const { sheetProps } = useSheetSwipeDown({
 *     enabled: isMobile,
 *     onDismiss: () => onOpenChange(false),
 *   });
 *   return <DialogContent {...sheetProps} className="...cm-sheet-mobile" />;
 *
 * The hook mutates a single CSS variable `--cm-sheet-drag-y` on the
 * sheet element instead of touching `transform` directly — that way
 * the open/close keyframe animation (which uses `transform`) and the
 * drag offset (which uses the individual `translate` property via
 * the CSS var) compose cleanly instead of fighting for the same
 * property. See `index.css` `.cm-sheet-mobile` rule.
 */

interface Options {
  enabled: boolean;
  onDismiss: () => void;
  /** Pixels of downward drag past which release dismisses. Default 100. */
  threshold?: number;
  /** px/ms; release with v above this dismisses regardless of distance. */
  flickVelocity?: number;
}

export function useSheetSwipeDown({
  enabled,
  onDismiss,
  threshold = 100,
  flickVelocity = 0.6,
}: Options) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const startTime = useRef<number>(0);
  const lastY = useRef<number>(0);
  const dragging = useRef<boolean>(false);

  // Clear inline var if the hook unmounts mid-drag (e.g. sheet closes
  // via outside-click while finger still down).
  useEffect(() => {
    return () => {
      if (sheetRef.current) {
        sheetRef.current.style.removeProperty("--cm-sheet-drag-y");
        sheetRef.current.style.transition = "";
      }
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      // Touch / pen only — mouse on desktop would steal text selection.
      if (e.pointerType === "mouse") return;
      const el = e.currentTarget;
      // If user has scrolled the sheet content down, treat further
      // down-drag as scroll-back, not dismiss. Native iOS pattern.
      if (el.scrollTop > 0) return;
      sheetRef.current = el;
      startY.current = e.clientY;
      lastY.current = e.clientY;
      startTime.current = performance.now();
      dragging.current = true;
      // Disable transition during drag so the sheet sticks to finger.
      el.style.transition = "none";
    },
    [enabled]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current || startY.current === null) return;
      const delta = e.clientY - startY.current;
      lastY.current = e.clientY;
      const clamped = Math.max(0, delta);
      sheetRef.current?.style.setProperty("--cm-sheet-drag-y", `${clamped}px`);
    },
    []
  );

  const finish = useCallback(
    (dismissed: boolean) => {
      const el = sheetRef.current;
      if (!el) return;
      // Re-enable transition for the spring-back / dismiss-slide.
      el.style.transition = "translate 220ms cubic-bezier(0.19, 1, 0.22, 1)";
      if (dismissed) {
        // Slide off-screen, then fire the dismiss callback. Sliding
        // first looks intentional; if we just call onDismiss the Radix
        // close animation runs from the snapshot mid-drag position
        // which jumps visually.
        el.style.setProperty("--cm-sheet-drag-y", "100vh");
        window.setTimeout(() => onDismiss(), 180);
      } else {
        el.style.setProperty("--cm-sheet-drag-y", "0px");
      }
      // After the spring-back animation settles, clear inline so the
      // next open starts fresh (CSS var defaults to 0px from rule).
      window.setTimeout(() => {
        if (!dismissed) {
          el.style.removeProperty("--cm-sheet-drag-y");
          el.style.transition = "";
        }
      }, 240);
      dragging.current = false;
      startY.current = null;
    },
    [onDismiss]
  );

  const onPointerUp = useCallback(() => {
    if (!dragging.current || startY.current === null) {
      dragging.current = false;
      return;
    }
    const delta = lastY.current - startY.current;
    const dt = performance.now() - startTime.current;
    const velocity = dt > 0 ? delta / dt : 0;
    const shouldDismiss = delta > threshold || velocity > flickVelocity;
    finish(shouldDismiss);
  }, [threshold, flickVelocity, finish]);

  const onPointerCancel = useCallback(() => {
    if (dragging.current) finish(false);
  }, [finish]);

  return {
    sheetProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
