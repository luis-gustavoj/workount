# 024 — Bottom tab bar, start-from-home, and the latency that made the app feel broken

**Blocked by:** 015, 019, 022 · **Blocks:** —

## Goal

Three complaints from using the app, which turned out to share one cause more than they looked like they would:

1. **There is no way to reach the programs list.** The top header linked Home, History and Settings. Programs — the thing the whole app is organised around — was reachable only by guessing a URL or going through a rest-day card.
2. **"Start workout" doesn't start a workout.** On Home it linked to the workout *builder*, where a second button actually started the session. Two screens and two taps for the action pressed every training day.
3. **Navigation feels unresponsive.** Tapping between sections did nothing visible, then the screen jumped — "it loads the data first and then redirects me".

## Context for whoever picks this up

Read [DESIGN.md](../../../DESIGN.md) before touching the nav. Two of its rules bite here and both are easy to violate by reflex:

- **The signal (azure) is never decorative** — "not on headings, not on icons, not on borders for emphasis". It marks the active set, the running timer, and a new PR. An active tab is none of those. Selection is carried by luminance and weight.
- **Colour is never the only carrier of any state.** So the active tab also gets a rule above it.

## Scope

### 1. Bottom tab bar, and no top header at all

`src/components/nav/tab-bar.tsx` — Home · Programs · History · Settings. Icons **and** labels, ≥44px targets, `env(safe-area-inset-bottom)` padding, solid `bg-bg` (DESIGN.md refuses backdrop blur as decoration).

The bar is at the bottom because this is a phone held one-handed in a gym: the thumb reaches the bottom of the screen, not the top.

Delete the global header. Identity and Sign out move to the Settings page — they are things you go looking for occasionally, not things worth ~110px of every screen. `(app)/layout.tsx` becomes the auth guard plus the bar, and its `env(safe-area-inset-top)` moves to the scroll container so content still clears the notch when installed as a PWA.

Tapping a tab lights it **immediately**, before the route resolves, via Next 16's `useLinkStatus`. The destination is already known; waiting for the server to confirm it is what made the app feel unresponsive.

Hide the bar on `/session`: the player owns the bottom of the screen with its fixed entry deck, and a stray tap would abandon a set mid-log.

**Watch for:** the PWA install prompt is `fixed bottom-0` and will cover the bar outright. It has to offset itself above it. Both read `hasTabBar` from `src/lib/nav/routes.ts` — one predicate, so they cannot disagree.

### 2. Start the workout from Home

Home's Start button calls `startSession` and pushes `/session` directly. It owns a **pending** state ("Starting…") and an **inline error** on failure, because the bundle fetch is a real round trip (ADR-0001) and gym wifi is gym wifi — on failure the user stays on Home. A small **View plan** link below it still reaches the builder.

**The edge case that must be handled:** a workout with **zero exercises**. Starting it lands the user in a player whose empty state reads *"No session in progress"* — a confusing lie moments after they started one. Home therefore needs each workout's exercise count, and shows **Add exercises** instead of Start when it is zero.

**Watch for:** Home resolves before the IndexedDB draft read lands, so for a few milliseconds it does not know a session is already in progress. The Start button must stay disabled until that read completes, or a fast tap clobbers a live draft.

### 3. The latency

**Auth was three sequential round trips per navigation** — proxy, layout, page each called `auth.getUser()`, which asks the auth server to confirm the token. Replaced with `getClaims()` (local ES256 verification; the project publishes a JWKS) behind one request-cached `getCurrentUser()`. See [ADR-0006](../../../docs/adr/0006-local-jwt-verification.md).

**Nothing painted during any of it.** There was no `loading.tsx` anywhere, so Next held the previous screen on the display until the next route's server render finished. Every route gets a route-shaped skeleton. Not `/session` — it reads IndexedDB and is already instant.

**Home was the worst screen.** `getHomeData` was a `profiles` query *then* workouts and sessions, since both need `active_program_id` — a waterfall on the landing screen. New `get_home_data` RPC (migration 0007) returns the program, the workouts *with their exercise counts*, and the recent sessions in one round trip. CLAUDE.md: aggregation lives in Postgres.

**Home also rendered a second loading state.** After the route skeleton it showed the word "Loading…" until IndexedDB answered. Now the server-derived answer renders immediately and the resume card replaces it a beat later if a draft turns up.

**`src/middleware.ts` → `src/proxy.ts`.** Next 16 deprecated the `middleware` file convention; the build warns. Export a function named `proxy`; `export const config = { matcher }` is unchanged.

## Acceptance

- Programs is reachable in one tap from anywhere.
- Home's Start button starts the session and lands on the player, with a pending state and an inline error path.
- A zero-exercise workout offers "Add exercises", never a Start that dead-ends.
- Every route paints a skeleton immediately on tap; no screen waits with the old view still showing.
- `npm run build` reports `Proxy (Middleware)` with no deprecation warning.
- `npm run test:home-data` passes against a local stack — including a zero-exercise workout surviving the join, and RLS isolating the call.
- Both message catalogs stay at parity (the drift test enforces it).
