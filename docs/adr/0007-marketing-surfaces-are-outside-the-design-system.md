# ADR-0007 — Marketing surfaces are outside the design system

**Status:** Accepted · 2026-08-19

## Context

Until now the app had one door: `/` redirected a signed-out visitor to `/sign-in`, a screen with a wordmark and one Google button. That is the correct door for someone who was sent a link by a friend and already knows what Workount is. It is the wrong door for a stranger, who is asked to hand over a Google account before being told what the thing does.

PRODUCT.md has always said the intent is to open this to strangers eventually. A landing page is what that sentence costs.

The problem is that DESIGN.md is written *against* the landing page a landing page needs to be. Its "What this system refuses" list names, by name:

- Cards with soft wide shadows on a tinted background.
- Gradient text, glassmorphism, backdrop blur as decoration.
- A stat-tile hero row.

PRODUCT.md's anti-references say the same thing louder: "The generic SaaS dashboard … the default output of every design tool, and the exact shape this must not take."

Those rules are right, and they are right for a reason: the app is an instrument used one-handed, mid-set, in bad light, by someone whose attention is a scarce resource. None of that describes a person deciding whether to sign up, on a couch, with a browser tab and no particular urgency. The two surfaces have different jobs, different users-in-the-moment, and therefore want different rules.

The alternative — a landing page built strictly in the app's system — was considered. It would be a handsome page. It would also read as austere and unfinished to a visitor with no context for the austerity, because the restraint only signifies once you know what it is restraint *from*.

## Decision

**DESIGN.md governs the product. Marketing surfaces are outside it.**

A marketing surface may use cards, borders, shadows, gradients, and decorative motion — all of which remain forbidden everywhere else in the app.

The exemption is bounded. Marketing surfaces still:

- Use **IBM Plex Sans / IBM Plex Mono**. Already loaded by the root layout, so this costs nothing and is the strongest thread of continuity.
- Use the **azure signal** `oklch(0.696 0.17 245)` as their accent, never a different hue. The SaaS-template reflex is a purple gradient; using the app's own indicator colour is what keeps the page recognisably this product's.
- Sit on the **dark chassis** (`--bg`, `#070707`), so clicking through to the app is continuous rather than a jolt.
- Meet **WCAG 2.2 AA** and honour `prefers-reduced-motion` with a real static alternative. Accessibility is a PRODUCT.md commitment about people, not a design-system preference, and the exemption does not reach it.

**What counts as a marketing surface:** everything under `src/app/(marketing)/` — today `/` and `/privacy`. Nothing in `(app)` or `/sign-in` is exempt, ever.

**Home moved from `/` to `/home`** so the landing page can own the bare domain.

## Consequences

**Good.** A stranger can find out what this is before being asked for an account. The bare domain is a shareable URL. The app's own screens are untouched — the exemption is additive, not a relaxation of anything already built.

**The design system and the code now visibly disagree in one directory.** This ADR is the answer to "did someone forget DESIGN.md existed?" A reader who finds a gradient in `(marketing)` and no explanation would reasonably conclude the system had lapsed.

**Two visual languages to maintain.** Accepted, and deliberately kept cheap: the marketing surface shares fonts and one colour, and is small enough (two pages) that drift is a cosmetic problem rather than a structural one. If it grows, this ADR should be revisited rather than stretched.

**Accepted cost: a visitor experiences a discontinuity on sign-in**, from a designed marketing page to a deliberately plain instrument. The shared type, accent and background reduce it; they do not remove it. This is the price of the decision and it was made knowingly.

**Routing consequences of the move**, recorded because each one is a silent failure if missed:

- `manifest.ts` `start_url` is `/home`. An installed PWA opening onto marketing would be a bug.
- `sw.js` precaches `/home`, not `/`. This matters more than it looks: the service worker deliberately skips redirects so the shell cache can never hold the wrong page, and that guarantee only holds while the precached URLs are the *guarded* ones. A public 200 at `/` in `APP_SHELL_URLS` would let a stranger's cache poison an installed user's offline launch.
- `isPublicPath` special-cases `/` to an exact match. A prefix test against `/` matches every path in the app and opens the guard entirely.
- `auth/callback` redirects to `/home`. Sending a user who just authenticated back to the marketing page is the kind of thing nobody notices until they do.
