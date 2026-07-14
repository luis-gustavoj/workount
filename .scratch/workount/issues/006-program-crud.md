# 006 — Program CRUD and "follow this program"

**Blocked by:** 003, 005 · **Blocks:** 007

## Goal

Create programs, list them, and pick the **one** you're currently following.

## Scope

- `/programs` — list. The **active** program is visually distinct (badge). Empty state points at creation.
- `/programs/new` — name + description.
- `/programs/[id]` — detail: name, description, its workouts (empty for now — 007 adds them), and the actions below.
- Actions in `src/app/(app)/programs/actions.ts`, all Zod-validated:
  - `createProgram`, `updateProgram`
  - `followProgram(id)` → sets `profiles.active_program_id`
  - `archiveProgram(id)` → sets `archived_at`; archived programs are hidden from the list but **keep their history**
- Zod schemas in `src/lib/validation/program.ts`.

## The one invariant

**Exactly one active program.** `followProgram` writes a single column, so "more than one active" is unrepresentable — good. But handle the two edge cases:

- **Following program B while following A** silently unfollows A. That's correct, but *say so in the UI* — a user who's built two programs and doesn't realise switching drops the other will be confused about why home stopped recommending their squats.
- **Archiving the active program** must null out `active_program_id` (the FK is `ON DELETE SET NULL`, but archiving isn't deleting — handle it explicitly). Otherwise home recommends workouts from a program the user thinks they've put away.

## Acceptance

- Create two programs; follow one; the list shows exactly one as active.
- Follow the other; the first is no longer active.
- Archive the active one; `active_program_id` is null and home shows the no-active-program empty state rather than crashing.
- User A cannot open user B's `/programs/[id]` (RLS returns nothing → 404, not a 500).
