import { useEffect, useState } from "react";

/**
 * React hook that returns the current truth-value of a CSS media query
 * and re-renders the consumer whenever the match flips. Default SSR
 * fallback is `false` so server-rendered code stays in the "non-match"
 * branch (we don't ship SSR but the hook stays universal).
 *
 * Use for layout choices that genuinely need JS-side knowledge of the
 * breakpoint — e.g. swapping FullCalendar config props between desktop
 * and mobile, conditionally hiding entire views. For CSS-only branches
 * keep using Tailwind responsive utilities; this hook costs a render.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    // Set immediately in case the query changed between the initial
    // useState lazy init and the effect attach.
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Convenience helper — Tailwind's `md` breakpoint is 768px. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
