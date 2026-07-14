# 021 — Duplicate a program

**Blocked by:** 009 · **Blocks:** —

## Goal

Fork "PPL" into "PPL v2" — iterate on a program **without corrupting the analytics of the one you already ran**.

## Why this exists

Because of [ADR-0002](../../../docs/adr/0002-sessions-snapshot-their-prescription.md) and [ADR-0004](../../../docs/adr/0004-analytics-are-scoped-to-a-program.md) together. History attaches to the **program**, and analytics are scoped to the **program**. So if the user's way of progressing is to *edit their program in place* — bump the volume, swap an exercise, change the rep scheme — then the program's analytics become a blend of two different training blocks and the trend line means nothing.

Duplication is the release valve. Fork it, follow the fork, and v1 keeps a clean, interpretable history of what it actually was.

## Scope

`duplicate_program(p_program_id uuid, p_new_name text) → uuid` — deep-copies:

```
program → workouts → workout_exercises
```

preserving `position`, `day_of_week`, rep ranges, rest overrides, notes, and superset groups. New UUIDs throughout.

**It does not copy sessions.** History stays with the original. That is the entire point — if the copy dragged the history along, it would defeat the reason for copying.

Wire it to a **Duplicate** button on `/programs/[id]`, defaulting the new name to `"<name> v2"` and offering to follow the copy immediately (which is what the user wants ~always, but ask rather than assume).

## Acceptance

- Duplicating a program with 3 workouts and 15 prescribed exercises produces an exact structural copy under a new name, with new ids.
- The copy has **zero** sessions.
- The original's sessions and analytics are **completely untouched**.
- Editing the copy does not affect the original. (Verify the deep copy really is deep — a shallow copy that re-points at the *original's* `workout_exercises` rows would pass a naive eyeball check and then corrupt both programs the first time either is edited.)
- Runs as one transaction: a failure partway leaves no half-copied program.
