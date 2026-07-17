export type InstallPlatform = "ios" | "other";

/**
 * iOS Safari never fires `beforeinstallprompt` and has no programmatic
 * install API — "Add to Home Screen" is a manual Share-sheet action. So it
 * gets its own branch: instructions instead of a button.
 */
export function detectPlatform(userAgent: string): InstallPlatform {
  return /iphone|ipad|ipod/i.test(userAgent) ? "ios" : "other";
}

export type ShouldShowInstallBannerInput = {
  platform: InstallPlatform;
  isStandalone: boolean;
  dismissed: boolean;
  /** Whether a `beforeinstallprompt` event has been captured this visit. */
  hasInstallEvent: boolean;
};

/**
 * Ticket 019: shown non-annoyingly — once, dismissible, never again. Already
 * running standalone or previously dismissed both mean "never show". iOS has
 * no event to gate on (see `detectPlatform`); every other platform waits for
 * the browser to actually offer installation.
 */
export function shouldShowInstallBanner({
  platform,
  isStandalone,
  dismissed,
  hasInstallEvent,
}: ShouldShowInstallBannerInput): boolean {
  if (isStandalone || dismissed) return false;
  return platform === "ios" ? true : hasInstallEvent;
}
