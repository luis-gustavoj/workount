# ADR-0002 — Sessions snapshot their prescription; they don't just point at it

**Status:** Accepted · 2026-07-14

## Context

A session is performed *from* a workout. The lazy modelling is for a performed set to carry only `workout_exercise_id` and read the exercise name, target reps, etc. through that join.

This is a **time bomb**. Programs are edited constantly — that's the whole point of a program, you progress it. The moment the user changes "Bench Press — 3 sets × 8" to "Bench Press — 4 sets × 6", every historical session that joined through that row **silently rewrites itself**. Last month's session now claims it prescribed 4×6. Delete the exercise from the program entirely and the join goes null: your history loses the *name of the exercise you did*.

History is a record of facts. Facts do not change when you change your plans.

## Decision

**A performed set carries everything it needs to be interpreted on its own.**

`session_sets` stores:
- **`exercise_id`** — denormalized, `ON DELETE RESTRICT`. The identity of the movement, independent of the program. This is also what makes cross-program analytics possible at all ("show my bench e1RM over two years, across four programs").
- **`target_rep_min` / `target_rep_max`** — a **snapshot of the prescription at the moment it was performed**, so history can honestly show "prescribed 8–10, you hit 11".
- **`workout_exercise_id`** — nullable, `ON DELETE SET NULL`. A *convenience* link back to the prescription that generated it. It may go null; nothing important depends on it.

The invariant: **removing a workout, an exercise from a workout, or an entire program must never change or destroy what a completed session says you did.**

## Consequences

**Good.** History is immutable and self-describing. Programs stay freely editable — the user can restructure without fear. Analytics key off `exercise_id`, so they work across programs and survive program deletion.

**Accepted cost.** Denormalized data, hence redundancy. A session's snapshot of a rep range can diverge from the program's current rep range — *this is the intended behaviour, not a bug*, and the UI should present it as "then vs. now" rather than trying to reconcile it.

**Corollary for program iteration.** Because history attaches to the *program*, iterating a program by editing it in place blurs the analytics for it. This is why `duplicate_program` exists: fork "PPL" into "PPL v2", leave v1's history intact and interpretable.
