/**
 * What the app's chrome looks like at a given pathname, and who may reach it.
 *
 * This module is deliberately dependency-free — no Supabase, no `next/server`,
 * no React. Both the proxy (server, edge-ish) and the tab bar / install prompt
 * (client) need these answers, and a shared module is the only way they can
 * agree without one of them dragging the other's dependencies into its bundle.
 */

/**
 * Paths an unauthenticated visitor is allowed to reach. Everything else in the
 * app requires a session and is redirected to `/sign-in`.
 *
 * - `/` — the landing page (ADR-0007). The whole point of it is that a stranger
 *   reaches it without an account, which is why home moved to `/home`.
 * - `/privacy` — the privacy policy, linked from the landing footer.
 * - `/sign-in` — the one-button Google sign-in screen (ADR-0003).
 * - `/auth` — the OAuth callback (`/auth/callback`) that exchanges the code for
 *   a session; it must be reachable while still signed out.
 *
 * `/` is matched exactly rather than as a prefix — see `isPublicPath`.
 */
const PUBLIC_PATHS = ["/", "/privacy", "/sign-in", "/auth"];

/**
 * Routes inside the app shell that render without the tab bar.
 *
 * `/session` is the only one: the player owns the bottom of the screen with its
 * fixed entry deck (DESIGN.md's three-band layout), so a tab bar there would
 * both collide with the deck and offer a one-tap way to abandon a set mid-log.
 * A session is a focused mode; its own Finish strip is the way out.
 */
const CHROMELESS_PATHS = ["/session"];

/**
 * Whether `pathname` equals `base` or sits nested under it. The trailing-slash
 * boundary is deliberate: it stops `/sign-in-later` from matching `/sign-in`,
 * and `/settings-export` from matching `/settings`.
 */
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Whether an unauthenticated request to `pathname` is allowed through.
 * `/auth` also covers `/auth/callback`.
 *
 * `/` is special-cased to an exact match. Running it through `isUnder` would
 * make every path in the app start with a public base and open the entire
 * guard — the same trap `isTabActive` used to document below, except here it
 * would be a security hole rather than a lit-up tab.
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.filter((base) => base !== "/").some((base) =>
    isUnder(pathname, base),
  );
}

/**
 * Whether the bottom tab bar is on screen at `pathname`.
 *
 * The bar lives in the `(app)` layout, so it is absent on the public routes as
 * well as in the player. Anything anchored to the bottom of the viewport —
 * the PWA install prompt — has to consult this or it will cover the bar.
 */
export function hasTabBar(pathname: string): boolean {
  if (isPublicPath(pathname)) return false;
  return !CHROMELESS_PATHS.some((base) => isUnder(pathname, base));
}

/**
 * The tab bar's rendered height, including its safe-area padding.
 *
 * Exported because it is not only the bar's own business: anything anchored to
 * the bottom of the viewport (the PWA install prompt) has to clear it, and a
 * second hand-written copy of this expression is exactly the kind of thing
 * that silently drifts. `3.5rem` matches the `min-h-14` on each tab.
 */
export const TAB_BAR_HEIGHT = "calc(3.5rem + env(safe-area-inset-bottom))";

/**
 * The four destinations in the bottom tab bar, in display order.
 *
 * `href` doubles as the identity of a tab — there is exactly one tab per
 * top-level section. `labelKey` is a key in the `Shell` message namespace; the
 * bar is rendered by a client component, so translation happens there.
 */
export const TABS = [
  { href: "/home", labelKey: "home" },
  { href: "/programs", labelKey: "programs" },
  { href: "/history", labelKey: "history" },
  { href: "/settings", labelKey: "settings" },
] as const;

export type Tab = (typeof TABS)[number];

/**
 * Whether `pathname` belongs to the section a tab owns.
 *
 * Every tab matches its own path and anything nested under it, so the workout
 * builder deep inside `/programs/…` still reads as "you are in Programs".
 *
 * Home used to live at `/` and needed an exact-match special case here, because
 * a prefix test against `/` lights up the Home tab on every route in the app.
 * Moving it to `/home` (ADR-0007) removed that hazard from this function — but
 * not from `isPublicPath`, where the same shape is a security bug.
 */
export function isTabActive(href: string, pathname: string): boolean {
  return isUnder(pathname, href);
}
