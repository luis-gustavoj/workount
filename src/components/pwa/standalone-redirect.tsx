"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { isStandalone } from "@/lib/pwa/is-standalone";

/**
 * Bounces an installed launch off the landing page and into the app.
 *
 * `manifest.ts` already sets `start_url: "/home"`, but that is not enough on
 * its own:
 *
 *  - iOS Safari ignores `start_url` entirely. "Add to Home Screen" bookmarks
 *    whatever URL is open at that moment — and the page a visitor is on when
 *    they decide to install is, by construction, the landing page (ADR-0007).
 *    So every iOS install points at `/`.
 *  - On Android, an install made before `start_url` changed keeps the old
 *    value until the app is reinstalled, so existing users stay stuck too.
 *
 * Hence a client-side guard rather than a fix confined to the manifest: the
 * marketing page is a pitch to a stranger, and someone who already installed
 * the app is not a stranger. Browser tabs are untouched — a signed-in user who
 * navigates to `/` on purpose still sees the landing page.
 */
export function StandaloneRedirect() {
  const router = useRouter();

  useEffect(() => {
    // `replace`, not `push`: the shortcut's URL must not become a history entry,
    // or the standalone back gesture lands the user right back on the pitch.
    if (isStandalone()) router.replace("/home");
  }, [router]);

  return null;
}
