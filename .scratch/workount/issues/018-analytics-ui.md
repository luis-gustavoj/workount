# 018 — Analytics UI

**Blocked by:** 017 · **Blocks:** —

## Goal

`/programs/[id]/analytics` — answer *"am I getting stronger?"* honestly, on a phone.

## Scope

Four things, in descending order of how often they'll actually be looked at:

1. **Per-exercise e1RM progression** — the real answer to the question. One chart per exercise (or an exercise selector), plotting **estimated 1RM** over time, with the top-set weight as a secondary line. Label it as an *estimate*, because it is one.
2. **Volume over time** — per completed session, working sets only.
3. **PRs** — the three kinds per exercise, each linking to the session it happened in.
4. **Adherence** — completed vs scheduled, per week. The honest answer to *"am I actually following this program?"*, which is usually the real reason progress stalled.

All data comes pre-aggregated from the 017 functions. **No aggregation in JavaScript** — if you're writing a `.reduce()` over sets in a component, the logic belongs in SQL where the PR badge can also see it.

## Design notes

Read the **`dataviz` skill** before writing a single line of chart code — it covers palette, axes, and the stat-tile patterns, and it exists precisely so these don't end up looking like four unrelated charts.

Beyond that:
- **Mobile first.** These are being read at 390px, one-handed, probably on the walk home. A dense multi-series desktop dashboard is the wrong artefact.
- **Empty states are the common case at first.** A brand-new program has one session and no trend. "Not enough data yet — come back after a few sessions" beats a chart with two points and a meaningless line through them.
- **Don't plot raw weight as the progression metric.** It ignores reps and lies: dropping from 100×5 to 105×2 looks like progress and isn't. That's what e1RM is for.

## Acceptance

- Against the synthetic 8-week fixture from 017, the e1RM curve matches the hand-calculated values and PR badges land on the right sessions.
- A program with **zero** completed sessions renders an empty state, not a crash and not an axis with no data.
- Renders legibly at 390px wide.
