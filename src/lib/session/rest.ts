/**
 * Pure math for the rest timer (ticket 013, docs/CONTEXT.md "Rest timer").
 * Kept separate from the store and component so it's testable without
 * IndexedDB or a render clock — see player.ts for the sibling pattern.
 *
 * Everything here is a function of `restEndsAt` (epoch ms), never a
 * decrementing counter: a counter drifts or freezes exactly when the phone
 * locks, which is precisely when it's running.
 */

/**
 * Seconds remaining until `restEndsAt`, signed. Past zero this goes
 * negative — the timer counts up as "extra time rested" rather than
 * clamping, per ticket 013 — so callers must not clamp the result
 * themselves either.
 */
export function remaining(restEndsAt: number, now: number): number {
  return Math.round((restEndsAt - now) / 1000);
}

/** The end timestamp for a rest of `restSeconds` starting at `now`. */
export function restEndsAtFor(restSeconds: number, now: number): number {
  return now + restSeconds * 1000;
}

/**
 * Fraction of the rest elapsed, for the depleting ring — a redundant,
 * decorative encoding (DESIGN.md: "not the message"), so this only needs to
 * be *roughly* right, but computing it from `restStartedAt`/`restEndsAt`
 * (both persisted, both fixed for the life of one rest cycle) rather than a
 * currently-displayed exercise's `restSeconds` makes it exactly right too —
 * including across a superset auto-advance, where the on-screen exercise can
 * differ from the one the rest actually started for. Clamped to 1 once past
 * `restEndsAt` (a full ring reads as "done", matching the overtime state).
 */
export function elapsedFraction(restStartedAt: number, restEndsAt: number, now: number): number {
  if (now >= restEndsAt) return 1;
  const total = restEndsAt - restStartedAt;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (now - restStartedAt) / total));
}

/**
 * mm:ss readout (DESIGN.md's `readout-xl`, tabular-nums). A negative
 * (overtime) value is rendered as its positive elapsed magnitude with a
 * leading "+", e.g. -23 seconds → "+0:23".
 */
export function formatRestClock(seconds: number): string {
  const overtime = seconds < 0;
  const magnitude = Math.abs(seconds);
  const minutes = Math.floor(magnitude / 60);
  const secs = magnitude % 60;
  const clock = `${minutes}:${String(secs).padStart(2, "0")}`;
  return overtime ? `+${clock}` : clock;
}
