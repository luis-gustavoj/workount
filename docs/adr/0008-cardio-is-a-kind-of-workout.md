# ADR-0008 — Cardio is a kind of workout, logged after the fact

**Status:** Accepted · 2026-11-12

## Context

A hybrid program (lifting Mon/Wed/Fri, running Tue/Sat) had nowhere to put the runs. The model was strength-only: a workout's prescription is `workout_exercises` (sets × rep range), and a session's performance is `session_sets` (weight × reps). A run has neither.

Three scopes were on the table: (a) show the run in the plan only; (b) plan + a simple log — duration, distance, RPE, notes; (c) structured intervals with a guided timer, pace and running analytics. Chosen: **(b)**. It makes the week honest (adherence counts five days, history shows the runs) at the cost of one extra session shape. (c) is a different app, and road runs are already recorded by a watch.

Then: where does it live? A separate `cardio_workouts` / `cardio_sessions` pair, or the existing tables with a discriminator?

## Decision

**Cardio is a `kind` of workout and of session**, not a parallel entity.

- `workouts.kind` ∈ `strength | cardio`, fixed at creation. A cardio workout has no `workout_exercises`; its prescription is free text in `workouts.notes`, which every workout now has.
- `sessions.kind` is a **snapshot** (ADR-0002): a session must not learn what it was by following `workout_id`, which goes `NULL` when the workout is deleted.
- A cardio session stores `duration_seconds`, `distance_m` (meters, always), `rpe` and `notes`, and has no `session_sets`. It is written by the same `commit_session` RPC with an empty `sets` array — still one write path.
- It is logged **after the fact** from a form on the workout page, by a Server Action — not through the offline player (ADR-0001). There is no in-progress state to protect, so there is nothing for IndexedDB to hold.
- **Week-by-week progression** (the run grows from 5×(4'+1') to a 5 km test) is text in the prescription. There is no week/phase concept in the model; the strength side doesn't have one either.

## Consequences

**Good.** Home's "Today", adherence, the streak and history pick cardio up with no new joins: a cardio day is a workout, a run is a session. Strength analytics stay correct with no filtering, because volume, e1RM, PRs and last performance all read `session_sets`, which a cardio session has none of — except `get_program_volume`, which lists sessions and now filters to `kind = 'strength'` so runs don't plot as fake zeros.

**Accepted costs.**
- `kind` checks appear in the UI (Home card, workout page, history rows).
- No running analytics (pace, weekly km). The columns exist to add them later.
- Distance is always shown in km, even for a user whose `weight_unit` is lb.
- A prescription that changes by week is read, not enforced: the app doesn't know it's week 6.
