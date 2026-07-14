# 010 — `get_last_performance` RPC

**Blocked by:** 003 · **Blocks:** 011

## Goal

The SQL behind the app's most important feature: **"Last time: 80×8, 80×8, 77.5×7."**

## What it does

```sql
get_last_performance(p_program_id uuid, p_exercise_ids uuid[])
  → (exercise_id uuid, set_number int, weight numeric, reps int, performed_at timestamptz)
```

For **each** supplied exercise, return the performed working sets from **the most recent `completed` session in that program that included that exercise**.

## The subtlety that will be got wrong

It is **"the last time you did *this exercise*"**, not **"the last session"**.

These differ constantly. If you skipped bench last week but squatted, then bench's reference must come from *two* weeks ago while squat's comes from *last* week. A naive implementation finds the most recent session and reads its sets — which returns **nothing at all** for any exercise that wasn't in it, and the user opens the app to a blank reference on the exercise they most needed it for.

So the query is **per-exercise**: for each exercise id, find its own most recent completed session within the program. A `DISTINCT ON (exercise_id) … ORDER BY exercise_id, completed_at DESC` over the sets, or a lateral join per exercise. Not a single "latest session" lookup.

Other requirements:
- **Working sets only** (`is_warmup = false`). Nobody wants "last time: 20kg × 10" because that was the warmup.
- Scoped to the program ([ADR-0004](../../../docs/adr/0004-analytics-are-scoped-to-a-program.md)) — the reference for your PPL bench is your PPL bench, not the bench you did on a different program with a different rep scheme.
- Returns **all sets** of that performance, in `set_number` order, so the player can show the reference set-by-set rather than a single summary number.
- `SECURITY INVOKER` — RLS must still apply. A user must not be able to read another user's history by passing their program id.

## Acceptance

Seed three sessions in a program: week 1 (bench + squat), week 2 (**squat only**), week 3 (empty). Then:

- `get_last_performance(program, [bench, squat])` returns **bench from week 1** and **squat from week 2**. This single assertion is the whole ticket — if it returns nothing for bench, the naive implementation shipped.
- Warmup sets never appear.
- An exercise never performed returns no rows (the player must handle this — first time doing a lift, there is no "last time").
- Calling it with another user's `program_id` returns zero rows.

## Notes

Unit-test the ordering by seeding sets deliberately out of insertion order and asserting they come back by `set_number`.
