# 026 — Starter programs, so a new account isn't an empty one

**Blocked by:** 006, 025 · **Blocks:** —

## Goal

A new user signs in and finds nothing. Before Workount can tell them anything, they have to type in a complete multi-day program: workouts, exercises, target sets, rep ranges, rest overrides. Only on their *second* session of that program does the feature the landing page leads with — *"see what you lifted last time"* — have anything to show.

That is a long way to walk on faith, and ticket 025 made it worse by inviting strangers who have no relationship with the author to walk it.

## Why this is separate from 025

025 mitigates the gap with honest copy: step 1 of how-it-works says the setup takes about ten minutes, and step 3 says the last-time reference appears from your second session. Setting an expectation correctly is not the same as removing the friction, and building the fix inside a landing-page ticket would have hidden a product decision inside a marketing change.

## Sketch, not a spec

Two shapes worth considering before anything is built:

1. **Seeded template programs** a user adopts in one tap — PPL, upper/lower, 5×5. Needs a `is_template` notion or a separate table, an adoption flow that deep-copies into the user's own rows (`duplicate_program` from ticket 021 is most of that machinery already), and a decision about whether templates are global rows or application-level fixtures. RLS on any new table, in the same migration that creates it.

2. **Nothing seeded; make the builder faster.** The friction may be the builder, not the emptiness. Worth measuring before adding a schema concept that has to be maintained forever.

Option 2 should be ruled out on evidence before option 1 is built. The landing page now has analytics; the drop-off between sign-in and first committed session is the number that decides this.

## Acceptance

Undefined on purpose — this ticket needs the measurement above before it has a scope.
