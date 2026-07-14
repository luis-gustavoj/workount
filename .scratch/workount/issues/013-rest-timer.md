# 013 — Rest timer

**Blocked by:** 012 · **Blocks:** —

## Goal

A countdown between sets that is **still correct after the phone has been in your pocket for 90 seconds**.

## Scope

- Auto-starts when a set is logged.
- Duration = the exercise's **effective** rest (already resolved into the draft by 011; `rest_seconds ?? 90`).
- **−15s / +15s** buttons.
- Skip.
- On zero: **vibrate** (`navigator.vibrate`) and play a sound. The phone is in a pocket or face-down on a bench; a purely visual cue is useless.
- Visible from anywhere in the player — it must not vanish when the user scrolls to look at another exercise.

## The whole ticket, really

**Store the timer as an end timestamp — `restEndsAt: number` (epoch ms) — and derive the remaining seconds on each render.**

Do **not** store `secondsRemaining` and decrement it on an interval. That implementation is the obvious one and it is broken, because:

- `setInterval` is **throttled to ~1/second and then suspended entirely** when the tab is backgrounded or the phone locks the screen — which is *exactly* what happens during rest. The user pockets the phone, and the timer stops or drifts.
- Coming back, you'd have to reconcile against wall-clock time anyway — at which point you have re-derived `restEndsAt`, having first written a bug.

With an end timestamp, backgrounding is a non-event: the timer is a pure function of `restEndsAt - Date.now()`. Locking the phone for a minute and unlocking it shows the correct remaining time, or a finished timer, because *nothing was ever counting*. `setInterval` becomes a mere render tick, and if the browser throttles it, the number is still right the moment it does run.

±15s adjusts `restEndsAt` by ±15000. Persist it to the draft, so a browser kill mid-rest restores a still-correct timer.

## The notification caveat

Vibration and sound fire reliably only while the page is **foregrounded**. If the phone is locked, the browser will likely suppress them. This is a real platform limitation, not a bug to chase — do not try to defeat it with a service worker or a background sync hack. Make the timer *visually* obvious the moment the user looks at the screen (a finished timer should be unmistakable) and leave it there.

## Acceptance

- Log a set → timer starts at the exercise's rest value (90 by default, or the override).
- ±15s adjusts it.
- **Lock the phone for 60s. Unlock.** The timer shows the *correct* remaining time — not 60s too many.
- Kill the browser mid-rest and reopen: the timer is still correct (it was persisted, and it's a timestamp).
- Vibrates and sounds on zero, foregrounded.
- Unit-test the pure math (`remaining(restEndsAt, now)`) — including `now > restEndsAt`, which must clamp to 0, not go negative.
