/**
 * Bounces an installed launch off the landing page and into the app.
 *
 * `manifest.ts` already sets `start_url: "/home"`, but that is not enough on
 * its own:
 *
 *  - iOS Safari ignores `start_url` entirely. "Add to Home Screen" bookmarks
 *    whatever URL is open at that moment — and the page a visitor is on when
 *    they decide to install is, by construction, the landing page (ADR-0007).
 *    So every iOS install points at "/".
 *  - On Android, an install made before `start_url` changed keeps the old
 *    value until the app is reinstalled, so existing users stay stuck too.
 *
 * Hence a guard on the page rather than a fix confined to the manifest: the
 * marketing page is a pitch to a stranger, and someone who already installed
 * the app is not a stranger. Browser tabs are untouched — a signed-in user who
 * navigates to "/" on purpose still sees the landing page.
 *
 * This is a blocking inline script, NOT a `useEffect`. An effect runs after
 * hydration, which is after the landing page has already painted: the user
 * sees a full frame of marketing before being thrown to /home. Inline and
 * synchronous, it runs while the parser is still above the page's own markup,
 * so the pitch never reaches the screen at all.
 */

/**
 * Serialized into the tag below via `toString()`, so this must stay
 * self-contained: no imports, no closure over anything in this module. Written
 * as a real function rather than a string literal so it is type-checked, and
 * so the test exercises the exact code that ships.
 */
export function redirectInstalledLaunch(): void {
  try {
    // Only the landing page. `/privacy` is legitimate to open while installed.
    if (location.pathname !== "/") return;

    // `display-mode` covers Android/desktop; `navigator.standalone` is iOS
    // Safari's older, pre-standard equivalent, which matchMedia misses there.
    const installed =
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;

    // `replace`, not `assign`: the shortcut's URL must not become a history
    // entry, or the standalone back gesture lands the user back on the pitch.
    if (installed) location.replace("/home");
  } catch {
    // A browser that throws on any of the above is a browser with no installed
    // launch to detect. Showing the landing page is the correct fallback.
  }
}

export function StandaloneRedirect() {
  return (
    <script
      // Safe by construction: no interpolated data, just this module's own
      // function body.
      dangerouslySetInnerHTML={{
        __html: `(${redirectInstalledLaunch.toString()})()`,
      }}
    />
  );
}
