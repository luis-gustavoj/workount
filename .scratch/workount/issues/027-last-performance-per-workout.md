# 027 — Last performance is scoped to the workout, not the program

**Blocked by:** 010, 011 · **Blocks:** —

## Goal

The "Last time: 80×8, 80×8" reference currently comes from the most recent completed session **in the program** that included the exercise — whichever workout that session was. In a PPL program with heavy bench on Push A (5×3–5) and light bench on Push B (3×10–12), starting Push B shows last Tuesday's heavy triples. That's the wrong reference: it's the prescription that decides what "add a rep or add weight" means, and the prescription belongs to the workout.

Last performance becomes **per workout + exercise**. See the updated **Last performance** entry in [docs/CONTEXT.md](../../../docs/CONTEXT.md).

## Decisions (from a grilling session, 2026-10-19)

1. **Workout scope, not slot scope.** Keyed on `sessions.workout_id` + `session_sets.exercise_id`. Not on `workout_exercise_id` — that link is convenience-only and breaks whenever an exercise is removed and re-added ([ADR-0002](../../../docs/adr/0002-sessions-snapshot-their-prescription.md)). The same exercise twice in one workout shares one reference; rare, accepted.
2. **No fallback.** An exercise never performed in *this* workout shows "no history", even if it was done in another workout of the program. A cross-workout fallback would reintroduce the exact mismatch this ticket removes, in the case with the least context.
3. **Replace the RPC, don't overload it.** The session player is the only caller.
4. **The RPC drops `p_exercise_ids`.** Keyed on the workout, it already knows which exercises the workout contains. Passing them in forced `startSession` to wait for `listWorkoutExercises` before calling it; without them the call joins the first `Promise.all` and session start loses a sequential round trip.

Program scope still holds implicitly — a workout belongs to exactly one program.

## What it does

```sql
get_last_performance(p_workout_id uuid)
  → (exercise_id uuid, set_number int, weight numeric, reps int, performed_at timestamptz)
```

For **each exercise currently in the workout**, the working sets from the most recent `completed` session **of that workout** that included a working set of it. Everything else from ticket 010 stands: per-exercise independence (`DISTINCT ON`), warmups excluded both when picking the session and when returning sets, `set_number` order, `SECURITY INVOKER`, pinned `search_path`, `authenticated` only.

## Acceptance

- [ ] New migration `0008_get_last_performance_per_workout.sql` drops `get_last_performance(uuid, uuid[])` and creates `get_last_performance(uuid)`. `0003` is left untouched.
- [ ] `startSession` calls the RPC with `p_workout_id` inside the first `Promise.all`.
- [ ] `src/lib/types/database.ts` reflects the new `Args`.
- [ ] SPEC §3 describes the new signature and scope.
- [ ] Structural test pins the workout scope (`workout_id = p_workout_id`) and the absence of `p_program_id` / `p_exercise_ids`.
- [ ] `scripts/test-last-performance.ts` proves: bench in Push A and Push B — calling for Push B returns only Push B's sets; an exercise done only in Push A has no rows when called for Push B; an exercise done in Push B historically but no longer in the workout returns no rows; another user's workout id returns zero rows.
- [ ] Active drafts already in IndexedDB keep the bundle they were started with — no client migration.
