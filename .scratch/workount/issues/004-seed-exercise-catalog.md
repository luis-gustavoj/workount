# 004 — Seed the global exercise catalog

**Blocked by:** 003 · **Blocks:** 008

## Goal

A new user opens the exercise picker and finds the lifts they actually do, already there. Nobody should have to type "Barbell Bench Press" to use the app for the first time.

## Scope

`supabase/seed.sql` — roughly 60 global exercises (`user_id IS NULL`), each with a `muscle_group` and `equipment` drawn from the enumerated values in [SPEC.md §2](../../../docs/SPEC.md).

Cover, at minimum:
- **Barbell:** back/front squat, bench, incline bench, deadlift, Romanian deadlift, overhead press, bent-over row, hip thrust, barbell curl.
- **Dumbbell:** bench, incline bench, shoulder press, lateral raise, rear delt fly, row, curl, hammer curl, Bulgarian split squat, RDL.
- **Machine/cable:** lat pulldown, seated row, leg press, leg extension, leg curl, chest press, pec deck, cable fly, tricep pushdown, cable lateral raise, face pull.
- **Bodyweight:** pull-up, chin-up, dip, push-up, plank, hanging leg raise.
- **Other:** calf raise (standing + seated), kettlebell swing, farmer's carry.

Use **stable, hardcoded UUIDs** for the seeded rows, not `gen_random_uuid()`. Re-running the seed must be idempotent (`ON CONFLICT DO NOTHING`) — otherwise every `db reset` mints new ids and orphans any local data referencing them.

## Naming convention

Prefix with the equipment where it disambiguates: **"Barbell Bench Press"**, **"Dumbbell Bench Press"** — not two rows both called "Bench Press". The user searching "bench" should see both and be able to tell them apart. This matters more than it looks: the exercise is the identity key for all progress tracking, so a user who logs some sets against one "Bench Press" and some against another has silently split their own progression chart in two.

## Acceptance

- `supabase db reset` seeds the catalog.
- Running the seed twice changes nothing (idempotent).
- A signed-in user can `SELECT` all of them; they cannot `UPDATE` or `DELETE` any of them (RLS from 003).
