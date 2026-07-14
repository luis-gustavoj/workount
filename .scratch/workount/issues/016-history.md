# 016 — Session history

**Blocked by:** 014 · **Blocks:** —

## Goal

Look back at what you actually did.

## Scope

- **`/history`** — reverse-chronological list of `completed` sessions: date, workout name, duration, total volume, set count. Paginated (a year of training is ~150 sessions).
- **`/history/[id]`** — the detail: every exercise, every set (weight × reps), warmups visually distinguished, PRs badged. Show the **snapshotted rep range** alongside what was achieved — *"prescribed 8–10, you hit 11"* — which is the whole payoff of [ADR-0002](../../../docs/adr/0002-sessions-snapshot-their-prescription.md).
- Volume and set counts come from the `v_session_summary` view, not from JS aggregation over the raw sets ([ADR-0004](../../../docs/adr/0004-analytics-are-scoped-to-a-program.md)).

## Details that matter

- **Warmups are excluded from the volume figure** but still shown in the set list, marked. If a warmup silently vanished from history the user would think the app dropped a set.
- A session whose `workout_id` is now `NULL` (the workout was deleted) must still render — fall back to the exercise list. Deleting a plan does not erase the past. Test this explicitly; it's the assertion that proves the snapshotting works.
- Show the date in the user's locale and, for recent sessions, a relative hint ("Yesterday", "3 days ago"). People navigate history by "the one where I hit 100" and "last Tuesday", not by ISO dates.

## Acceptance

- Complete a session → it appears in `/history` with the correct duration and volume (hand-check the volume against `Σ weight × reps` of the working sets only).
- Delete the workout it came from → the session still renders in full.
- Warmup sets appear in the detail but are not in the volume total.
