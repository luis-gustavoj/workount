import { Analytics } from "@vercel/analytics/next";

import "./marketing.css";

/**
 * The public shell — the landing page and the privacy policy (ADR-0007).
 *
 * Two things it deliberately does NOT render, both inherited from the root
 * layout by every other route:
 *
 *  - `PwaShell`, which registers the service worker. A stranger who is about to
 *    bounce has no use for an offline app shell, and registering one for them
 *    warms a cache for an app they never signed into.
 *  - `InstallPrompt`, which would offer "Install Workount" to someone who has
 *    not yet been told what Workount is.
 *
 * The scroll container mirrors `(app)/layout.tsx`: the root layout's `body` is
 * a fixed-height flex column (`max-h-dvh overflow-hidden`) because the session
 * player's three-band layout depends on it, and that sizing is not something to
 * relax for a marketing page. So marketing scrolls inside its own region, the
 * same way the app does.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth motion-reduce:scroll-auto"
      // The root layout renders under the status bar (`viewportFit: cover`), so
      // without this the sticky nav sits beneath the notch when someone opens
      // the landing page from an installed shortcut.
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {children}
      {/* Cookieless, no persistent identifier — hence no consent banner, and
          hence mounted here rather than in the root layout: there is no reason
          for a third-party script to exist anywhere near the session player. */}
      <Analytics />
    </div>
  );
}
