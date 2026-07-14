# 003 — Schema migration with RLS on every table

**Blocked by:** 002 · **Blocks:** 004, 005, 006, 010

## Goal

The full data model, with row-level security enabled on **every table in the same migration that creates it**.

## Scope

One migration, `supabase/migrations/0001_init.sql`, creating exactly the tables in [SPEC.md §2](../../../docs/SPEC.md): `profiles`, `exercises`, `programs`, `workouts`, `workout_exercises`, `sessions`, `session_sets`. Copy the column definitions, types, and CHECK constraints from the spec — it is precise, follow it literally.

Plus the indexes listed there.

### RLS policies

- `profiles` → `id = auth.uid()`.
- `programs`, `sessions` → `user_id = auth.uid()`, all commands.
- `workouts`, `workout_exercises`, `session_sets` → gate via a join up to the owning parent.
- `exercises` → `SELECT` where `user_id IS NULL OR user_id = auth.uid()`; write commands only where `user_id = auth.uid()`.

### RLS test

A script (`scripts/test-rls.ts`, runnable via `npm run test:rls`) that creates two users, has each insert a program with a workout and a session, and asserts **user A gets zero rows** when selecting every one of user B's tables. This is not optional — an RLS policy you haven't tried to break is a policy you haven't tested.

## The three traps

1. **`session_sets` must gate through `sessions`, not through `exercises`.** A set references an exercise, and global exercises (`user_id IS NULL`) are readable by *everyone* — gate through that and you have just made every user's training history world-readable. Join to `sessions` and check `sessions.user_id = auth.uid()`.

2. **`exercises` needs `UNIQUE NULLS NOT DISTINCT (user_id, lower(name))`.** Postgres treats `NULL`s as distinct in a unique index by default, so without `NULLS NOT DISTINCT` (PG15+) the global catalog could hold twenty rows called "Bench Press". Verify the Supabase Postgres version supports it; if not, use a partial unique index instead — one `WHERE user_id IS NULL`, one `WHERE user_id IS NOT NULL`.

3. **`exercise_id` on `session_sets` and `workout_exercises` is `ON DELETE RESTRICT`, deliberately.** An exercise that has been performed must not be deletable — deleting it would destroy history ([ADR-0002](../../../docs/adr/0002-sessions-snapshot-their-prescription.md)). The UI should offer *archive*, never *delete*, for an exercise that's been used.

## Acceptance

- `supabase db reset` applies cleanly from scratch.
- `npm run test:rls` passes — user A sees **zero** of user B's rows, on every table.
- Types regenerate: `supabase gen types typescript --linked > src/lib/types/database.ts`.
