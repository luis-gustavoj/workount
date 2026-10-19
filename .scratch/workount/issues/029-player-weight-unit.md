# 029 — The session player ignores `profiles.weight_unit`

**Blocked by:** — · **Blocks:** —

## Problem

Found while scoping 028. The player renders weights as raw kilograms everywhere — the set rows, the last-time reference, the entry deck's weight stepper (and its 2.5 step), and now the last-performance chips. `profiles.weight_unit` is never read in the player, so a user who chose `lb` in settings still trains in kg.

CLAUDE.md rule 5: weights are stored in kg, always; the unit is a display preference converted **at the UI edge**. The storage half holds; the display half was never built for the player.

## Sketch, not a spec

- The unit must be in the **bundle** (resolved at session start alongside `default_rest_seconds`) — the player makes no network calls (ADR-0001), so it can't read the profile mid-session. That's a draft shape change → `SESSION_DRAFT_VERSION` bump.
- Stepper step in lb is a separate decision (5 lb is the smallest plate pair) — and conversions must round-trip so 80 kg doesn't log back as 79.97.
- One formatting helper used by every weight readout in the player, so they can't disagree.

## Acceptance

To be defined when picked up.
