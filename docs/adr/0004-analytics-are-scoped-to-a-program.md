# ADR-0004 — Analytics are scoped to a program; aggregation lives in Postgres

**Status:** Accepted · 2026-07-14

## Context

"Am I getting stronger?" is the question the app exists to answer. Two sub-decisions:

**1. Over what window?** A global all-time view of every set you've ever done mixes incompatible things: a 5×5 strength block and a 3×12 hypertrophy block produce wildly different volume and e1RM curves, and splicing them into one line produces a chart that looks like progress or regress depending on where the blocks happen to fall. The user asked for per-program analytics, and they're right — **a program is the only window in which the numbers are comparable**, because within it the rep scheme and structure are held roughly constant.

**2. Computed where?** Pulling every set for a program into the browser and aggregating in JS is fine for month one and grim by year two, on a phone, over cellular.

## Decision

**All analytics are scoped to a program.** The route is `/programs/[id]/analytics`. There is no global cross-program dashboard in the MVP.

**Aggregation happens in Postgres**, as views and RPCs — not in JavaScript. The client fetches rows that are already summarized and hands them straight to Recharts.

Definitions are fixed here so they cannot drift between the SQL and the UI:
- **Volume** = `Σ(weight × reps)` over **working sets only** (`is_warmup = false`).
- **e1RM** = **Epley**: `weight × (1 + reps / 30.0)`. Chosen over Brzycki for behaving more sanely above ~10 reps. It is an *estimate*; label it as one in the UI.
- **PR** = a per-exercise best, working sets only, in three separate kinds: heaviest set, best e1RM, best reps at a given weight.
- **Adherence** = completed sessions ÷ scheduled workouts, per ISO week.

**Warmups are excluded from every one of these.** Repeated because it is the single easiest way to get all four numbers wrong at once.

## Consequences

**Good.** Numbers are comparable within their window. Charts scale to years of data — the phone renders a few dozen aggregated rows, not tens of thousands of sets. Each definition exists in exactly one place (the SQL), so the chart and the PR badge can never disagree.

**Accepted costs.**
- **No cross-program view of a single lift** ("my bench over three years") in the MVP, even though `session_sets.exercise_id` is denormalized specifically to make it possible later. Deliberately deferred, not designed out.
- Aggregation logic in SQL is **harder to unit-test** than TypeScript. Mitigated by seeding synthetic sessions with hand-calculated expected values, and asserting against those.
- Changing a definition (e.g. switching to Brzycki) means a migration, not a redeploy.
