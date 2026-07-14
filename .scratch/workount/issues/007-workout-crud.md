# 007 — Workout CRUD within a program

**Blocked by:** 006 · **Blocks:** 008

## Goal

Add training days to a program: "Push A", Monday. Still no exercises in them — that's 008/009.

Remember the vocabulary: a **workout** is the *plan* for a day, not something you performed. See [CONTEXT.md](../../../docs/CONTEXT.md).

## Scope

- On `/programs/[id]`: list workouts in `position` order, create/rename/delete, drag to reorder.
- Each workout: a `name` and an optional `day_of_week` (0=Sun…6=Sat).
- `/programs/[id]/workouts/[workoutId]` — the workout page (exercise list is empty until 009).
- Actions + Zod schemas alongside the program ones.

## Two design points

**`day_of_week` is nullable and that's important.** `NULL` means *unscheduled — do it whenever*. Plenty of people run a program as a rotation ("A, B, C, repeat") rather than a fixed weekly calendar, and forcing them to pick a day would make them lie to the app. The home screen simply won't auto-recommend an unscheduled workout; the user starts it manually.

**Two workouts may share a day of week.** Don't add a unique constraint. A user might have "Push A" and "Conditioning" both on Monday, or be mid-restructure. If today has two, home shows both and lets the user pick — see 015.

## Acceptance

- Add three workouts to a program, one per day; reorder them; the order persists across a reload.
- A workout with no day of week saves fine.
- Two workouts on the same day save fine.
- Deleting a workout does **not** touch any `sessions` performed from it — `sessions.workout_id` is `ON DELETE SET NULL`, and history must survive intact ([ADR-0002](../../../docs/adr/0002-sessions-snapshot-their-prescription.md)). Add a test for this; it's the invariant most likely to be broken by a careless cascade.
