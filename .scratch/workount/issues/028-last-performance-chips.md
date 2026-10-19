# 028 — Last performance at a glance: chips under the exercise name

**Blocked by:** 023, 027 · **Blocks:** —

## Goal

The player shows last time's reference one row at a time — beside each logged set and the upcoming placeholder. Set 3's number is invisible until you reach set 3. But the decision about how to load the bar is made *before* set 1: "last time I dropped to 7 on set 3, so stay at 80 rather than add 2.5." That needs the whole **last performance** up front.

## Decisions (grilling session, 2026-10-19)

1. **A chip row in the top band**, below the prescription line: one chip per working set of the last performance, `80 × 8` (`lastTimeValue`), mono/tabular.
2. **Additive.** The per-row "Last time" stays — chips answer "what's the shape of the whole thing", the row answers "what am I trying to beat right now".
3. **Chips track progress.** The chip at the next working ordinal is `signal` (it *is* "the set you are on" — DESIGN.md), chips for ordinals already logged are `ink-faint`, later ones `ink-muted`. Warmups don't advance the ordinal. Past the last chip, nothing is highlighted.
4. **No last performance → no chip row.** The rows already say "First time".
5. **All of last time's sets**, even when today's target differs — the chips are a fact, not the plan.
6. Wrap to a second line rather than scroll horizontally; no "3 days ago" label (the bundle doesn't carry `performed_at`, and it doesn't change the decision).
7. Display-only. No schema, RPC, or draft change.

DESIGN.md constraints: 4px radius (no pills), hairline `line` border, signal as text color only, never decorative.

## Acceptance

- [ ] Exercise with a last performance renders one chip per set, in order, in a list labelled "Last time".
- [ ] The next-ordinal chip carries `aria-current="step"`; logged ordinals are marked done; logging a set advances it; logging a warmup does not.
- [ ] Exercise with no last performance renders no chip list.
- [ ] Last performance longer than the target renders every set.
