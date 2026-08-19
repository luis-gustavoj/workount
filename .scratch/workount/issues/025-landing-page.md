# 025 — A landing page, so a stranger meets the product before the login screen

**Blocked by:** 022, 024 · **Blocks:** —

## Goal

`/` currently redirects a signed-out visitor to `/sign-in`: a wordmark, a tagline, and a Google button. Anyone who wasn't told what Workount is by a friend is being asked for an account before being told what the account is for.

Give `/` a public landing page. Move home to `/home`.

## Context for whoever picks this up

Read [ADR-0007](../../../docs/adr/0007-marketing-surfaces-are-outside-the-design-system.md) first. It exists because this ticket knowingly builds cards, borders and gradients — all of which [DESIGN.md](../../../DESIGN.md) refuses by name. That exemption applies **only** under `src/app/(marketing)/`, and is bounded: IBM Plex, the azure signal as the sole accent, the dark chassis, WCAG 2.2 AA, and a real `prefers-reduced-motion` path.

The app's own screens are not in scope and must not change appearance.

## Scope

### 1. Home moves to `/home`

Mechanical, but every one of these is a silent failure if missed:

| File | Change |
|---|---|
| `src/app/(app)/page.tsx` → `(app)/home/page.tsx` | plus `home-screen.tsx` / its test |
| `src/app/(app)/loading.tsx` | **stays put** — it is also the fallback boundary for `/session`, which has none of its own |
| `src/lib/nav/routes.ts` | `TABS[0].href`, `isTabActive`, `PUBLIC_PATHS` |
| `src/components/nav/tab-bar.tsx` | the `ICONS` map is keyed by href |
| `src/app/manifest.ts` | `start_url` |
| `public/sw.js` | `APP_SHELL_URLS` |
| `src/app/sign-in/page.tsx` | the signed-in bounce |
| `src/app/auth/callback/route.ts` | the post-exchange redirect |

**Watch for:** `isPublicPath` must match `/` **exactly**, not by prefix. `isUnder("/settings", "/")` is true — a prefix test opens the entire guard to anonymous requests. This is the one line in the ticket that is a security bug rather than a cosmetic one.

**Watch for:** `sw.js` precaches the app shell and skips redirects so it can never cache the wrong page under a URL's key. That guarantee depends on the precached URLs being redirect-guarded. `/` is now a public 200 and must not appear in `APP_SHELL_URLS`.

### 2. The `(marketing)` route group

`src/app/(marketing)/layout.tsx` — its own scroll container, mirroring what `(app)/layout.tsx` does (`overflow-y-auto` inside the fixed-height body; the root layout's `svh` sizing is load-bearing for the player and is not touched).

It deliberately does **not** render `PwaShell` or `InstallPrompt`. A stranger who hasn't signed in should not be offered "Install Workount", and there is no reason to register a service worker for someone who is about to bounce.

### 3. The page

Nav (sticky) · hero · benefits bento · how it works · FAQ · closing CTA · footer.

**No fabricated social proof.** The reference layouts this was drawn from carry a user counter, a partner logo wall, and testimonials. There are no users to count, no partners, and no quotes. All three are omitted rather than invented. **No pricing section** — nothing is sold; "Is it free?" is answered in the FAQ.

- **Hero.** *"See what you lifted last time. Then beat it."* Primary CTA is the existing `GoogleSignInButton`, reused verbatim, with `SignIn.passwordless` beneath it. Secondary is an anchor to how-it-works.
- **Hero visual.** The session player rebuilt in HTML/CSS inside a 390px phone frame — not a screenshot. Animates one honest cycle: a set logs and settles, the rest ring depletes. Under `prefers-reduced-motion` it renders a static frame with the same information.
- **Benefits.** Six tiles, two wide: the network is optional · last time, beside every set · warmups never count · a timer that survives a locked screen · numbers, per program · the plan and the performance never touch.
- **How it works.** Three steps. **Step 1 says plainly that you type your program in once, and that it takes about ten minutes.** See the open question below — this copy is doing real work.
- **FAQ.** Six. Including *"Does it track running or cardio?" — No.* Telling a wrong-fit visitor to leave is cheaper than a bad first session.

### 4. Everything a public page needs

- `/privacy` — a real page. Google OAuth plus stored training data, opened to strangers, from Brazil: LGPD and GDPR are in play.
- Page metadata, `opengraph-image.tsx` (generated, so the share card is versioned with the code), `robots.ts`, `sitemap.ts`.
- `NEXT_PUBLIC_SITE_URL`, falling back to Vercel's env and then localhost, because all four of the above need an absolute origin and none existed.
- Vercel Web Analytics, mounted in the marketing layout only — cookieless, so no consent banner, and nowhere near the offline session player.
- Copy goes through a `Landing` namespace in **both** catalogs. `catalog.test.ts` asserts identical key structure, so English-only would go red.

## Open question, deliberately not answered here

**There are no starter programs.** A visitor converts on "see what you lifted last time" and lands in an empty app that requires a full multi-day program to be typed in before anything happens — and the last-time reference cannot appear until their *second* session of it.

This ticket handles it with honest copy (step 1 sets the expectation; step 3 says when last-time starts appearing). That is a mitigation, not a fix. The fix is ticket 026.

## Acceptance

- A signed-out visit to `/` returns 200 and renders the landing page.
- `/home`, `/session`, `/programs`, `/history`, `/settings` still redirect a signed-out visitor to `/sign-in`.
- `/privacy` is reachable signed-out.
- Signing in from the landing page lands on `/home`.
- The installed PWA opens on `/home`, and an offline cold launch still works.
- The app's own screens are pixel-identical to before.
- `prefers-reduced-motion: reduce` renders the hero mock static, with nothing lost.
