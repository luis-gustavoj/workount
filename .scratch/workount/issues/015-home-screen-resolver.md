# 015 — Home screen resolver

**Blocked by:** 014 · **Blocks:** —

## Goal

The screen the user sees every time they open the app. It answers **one** question: *what do I do right now?*

## The resolver

A pure function, `resolveHome(state) → HomeState`, in `src/lib/home/resolve.ts`. Strict priority order:

1. **A draft exists in IndexedDB** → `{ kind: 'resume', startedAt }`. *"Session in progress — 34 min."* **Nothing else competes.** A user with a live session open does not need to see their streak.
2. **The active program has a workout for today's `day_of_week`, with no `completed` session for it today** → `{ kind: 'today', workout }`. *"Today: Push A"*, exercises previewed, **Start workout**.
3. **Otherwise** → `{ kind: 'rest', nextWorkout }`. *"Rest day"*, plus the next scheduled workout, plus a secondary **Start any workout**.

Below the fold (states 2 and 3 only): current streak, last 3 sessions.

## Edge cases — each one is a real state, not a theoretical one

- **No active program** (new user, or they archived it) → an empty state pointing at program creation. Not a blank screen, not a crash. This is the *first thing a new user ever sees*, so it's the most important empty state in the app.
- **Two workouts scheduled today** (allowed — see 007) → show both, let the user pick.
- **Today's workout already completed** → falls through to `rest`, but say *why*: *"Push A done today ✓"*, not a bare "Rest day", which reads as though the app forgot.
- **Today is unscheduled but the program has workouts** → `rest`, with the escape hatch prominent. People train off-schedule constantly; don't make them lie to the app.
- **A stale draft** (started >12h ago) → still `resume`, but offer *Finish / Discard* too. They probably forgot. See 020.

## Why a pure function

Because these five branches are exactly the kind of logic that rots into nested ternaries inside a component and then quietly shows the wrong thing on a Tuesday. Keep it pure, keep it out of the component, and **unit-test every branch** — this is the highest-traffic screen in the app and its logic is entirely date-dependent, which means you cannot test it by hand without changing your system clock.

## Acceptance

- Unit tests covering all six states above, with the clock injected (never call `Date.now()` inside the resolver — pass `now` in).
- With a Monday workout defined: on Monday it recommends it; once completed it says so; on Tuesday it doesn't.
- With a draft present, `resume` wins over everything, including a scheduled workout for today.
