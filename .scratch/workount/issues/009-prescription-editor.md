# 009 — Prescription editor

**Blocked by:** 008 · **Blocks:** 011, 021

## Goal

The workout builder proper: for each exercise in a workout, prescribe **how many sets, what rep range, how much rest, and any notes**. This completes the "build a program" half of the app.

## Scope

On `/programs/[id]/workouts/[workoutId]`, a list of `workout_exercises`, each editing:

| Field | Notes |
|---|---|
| `target_sets` | 1–20 |
| `rep_min` – `rep_max` | a **range** (8–10), not a single number. `rep_max >= rep_min`. |
| `rest_seconds` | **optional**. Empty → inherits `profiles.default_rest_seconds` (90). Show the inherited value as placeholder text, so the user can see what they'd get. |
| `notes` | optional, free text. "Pause 1s at the chest." Surfaced during the session. |
| `superset_group` | optional: `A`, `B`, … Peers alternate. |

Plus: add an exercise (via the 008 picker), remove one, drag to reorder (`position`).

## Why a rep *range* and not a target

Because the range is what drives progression. "Bench 3×8–10" means: work up to 10 reps at this weight, then add weight and drop back to 8. A single fixed number gives the user nothing to progress *within*, and the "last time" reference in the session player would have nothing to compare against. The range is the mechanism, not a nicety.

## Superset semantics

Exercises sharing a `superset_group` within a workout are performed **alternately**: a set of A1, a set of A2, rest, repeat. The session player (012) implements this. Here, just capture it, and make it visually obvious in the builder which exercises are grouped (a bracket or shared accent down the left edge — the grouping is the whole point and must be legible at a glance).

Sanity rule: a group with only one member is meaningless. Either warn, or silently treat it as no superset.

## Acceptance

- Build a full "Push A": bench 4×6–8 @ 120s, incline DB 3×8–12 (default rest), a lateral raise / face pull superset, notes on one exercise.
- Reload — sets, ranges, rest overrides, notes, order, and superset grouping all persist.
- Leaving rest empty and later changing `profiles.default_rest_seconds` changes what that exercise inherits. (It's an inheritance, not a copy — verify you didn't accidentally materialise the 90.)
- **The whole program builder is now done.** Verify against [SPEC.md §6](../../../docs/SPEC.md) step 2.
