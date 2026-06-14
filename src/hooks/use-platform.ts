import { useEffect, useState } from "react";
import { isCliMode } from "@/lib/cli-bridge";
import { useIsMobile } from "@/hooks/use-media-query";

/**
 * Aggregated runtime-environment flags for content that needs to
 * vary between desktop CLI host, plain web browser, and mobile web.
 *
 * `isCli`           — SPA hosted by the Node CLI (tray icon, native
 *                     toasts, autostart, backup folder all available).
 * `isMobile`        — viewport ≤ 767px (Tailwind md breakpoint).
 * `isMobileWeb`     — mobile-only and NOT CLI hosted.
 * `isWebDesktop`    — non-mobile and NOT CLI hosted.
 * `isStandalonePWA` — installed PWA, running in fullscreen mode.
 *                     Window.matchMedia('(display-mode: standalone)')
 *                     OR navigator.standalone (iOS Safari quirk).
 * `hasNotifAPI`     — `window.Notification` exists. False inside some
 *                     embedded webviews + http: origins (we host over
 *                     localhost so it's true in CLI mode too).
 * `notifPermission` — "default" | "granted" | "denied" | "unsupported".
 *                     Reactive: re-renders on focus so a user who
 *                     toggled the OS permission from another tab sees
 *                     the new state on return.
 */
export interface PlatformInfo {
  isCli: boolean;
  isMobile: boolean;
  isMobileWeb: boolean;
  isWebDesktop: boolean;
  isStandalonePWA: boolean;
  hasNotifAPI: boolean;
  notifPermission: "default" | "granted" | "denied" | "unsupported";
}

function readNotifPermission(): PlatformInfo["notifPermission"] {
  if (typeof window === "undefined" || !("Notification" in window))
    return "unsupported";
  return Notification.permission;
}

function readStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari pre-PWA puts the flag on `navigator`.
  const navAny = window.navigator as Navigator & { standalone?: boolean };
  return navAny.standalone === true;
}

export function usePlatform(): PlatformInfo {
  const cli = isCliMode();
  const isMobile = useIsMobile();
  const [permission, setPermission] = useState<PlatformInfo["notifPermission"]>(
    () => readNotifPermission()
  );
  const [standalone, setStandalone] = useState<boolean>(() => readStandalone());

  useEffect(() => {
    const refresh = () => {
      setPermission(readNotifPermission());
      setStandalone(readStandalone());
    };
    window.addEventListener("focus", refresh);
    // Permissions API can subscribe directly when available — saves
    // having to focus the tab to see the new state.
    let unsubscribe: (() => void) | undefined;
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "notifications" as PermissionName })
        .then((status) => {
          const handler = () => setPermission(readNotifPermission());
          status.addEventListener("change", handler);
          unsubscribe = () => status.removeEventListener("change", handler);
        })
        .catch(() => {
          /* permission name unsupported on some browsers; fall back to focus */
        });
    }
    return () => {
      window.removeEventListener("focus", refresh);
      unsubscribe?.();
    };
  }, []);

  return {
    isCli: cli,
    isMobile,
    isMobileWeb: isMobile && !cli,
    isWebDesktop: !isMobile && !cli,
    isStandalonePWA: standalone,
    hasNotifAPI: typeof window !== "undefined" && "Notification" in window,
    notifPermission: permission,
  };
}
