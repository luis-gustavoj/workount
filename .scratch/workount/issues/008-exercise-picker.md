# 008 — Exercise picker with custom exercises

**Blocked by:** 004, 007 · **Blocks:** 009

## Goal

A searchable picker over the exercise catalog, with an inline escape hatch to create a custom exercise when the movement isn't there.

## Scope

- A `<ExercisePicker />` component (a sheet/dialog): search by name, filter by muscle group, results showing name + equipment + muscle group.
- Global exercises and the user's own customs appear in one list. Customs are subtly marked ("Custom") so the user knows which are theirs.
- **"Can't find it? Create '<query>'"** at the bottom of the results — opens an inline form (name, muscle group, equipment) that creates a custom exercise and immediately selects it. The user is mid-flow building a program; do not make them leave the screen to go and manage a catalog.

## Why this screen matters more than it looks

The exercise is the **identity key for all progress tracking**. If a user creates a custom "Bench Press" when a global "Barbell Bench Press" already exists, they have silently split their own progression chart in two and nothing in the app will ever tell them.

So: **search must be forgiving.** Case-insensitive substring at minimum; ideally match on word prefixes so "bb bench" and "bench press" both find "Barbell Bench Press". Show global matches *before* offering to create a custom, and if the typed name is close to an existing exercise, say so ("Did you mean Barbell Bench Press?") before letting them create a near-duplicate.

## Acceptance

- Searching "bench" returns barbell, dumbbell, and incline variants.
- Creating a custom exercise selects it immediately, without leaving the builder.
- The custom is visible to its creator and to **nobody else** (RLS).
- Attempting to create a custom exercise with a name the user already has is rejected cleanly (unique constraint from 003) — with a usable error, not a 500.
