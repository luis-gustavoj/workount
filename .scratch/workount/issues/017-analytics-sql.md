# 017 — Analytics views and PR detection (SQL)

**Blocked by:** 014 · **Blocks:** 018

## ⚠️ Do not start this until you have used the app for real

The [INDEX](INDEX.md) says to stop after 014 and actually train with the thing for a week or two. That advice is load-bearing and it applies here more than anywhere: **charts built against imagined data are the wrong charts.** You will discover, from real sessions, that the metric you thought you wanted is not the one you look at. Build these after you know.

## Goal

Every analytic number, computed **once**, in Postgres. The chart and the PR badge must never be able to disagree, which means neither of them owns a definition — the SQL does ([ADR-0004](../../../docs/adr/0004-analytics-are-scoped-to-a-program.md)).

## The definitions — fixed, not negotiable

- **Volume** = `Σ(weight × reps)` over **working sets only**.
- **e1RM** = **Epley**: `weight × (1 + reps / 30.0)`.
- **PR** = a per-exercise best, **working sets only**, in three distinct kinds: heaviest set · best e1RM · best reps at a given weight.
- **Adherence** = completed sessions ÷ scheduled workouts, per ISO week.

**`is_warmup = false` on every single one.** This is the easiest way to get all four numbers wrong at once, and the bug is silent — the charts still render, they're just lies. Week one of any program will report fake PRs if you forget.

## Scope

- `v_session_summary` — per session: duration, total volume, set count, exercise count.
- `v_exercise_prs` — per (user, exercise): the three PR kinds, each with the `session_id` where it happened (so history can badge it and analytics can link to it).
- `get_program_volume(p_program_id)` — volume per completed session, chronological.
- `get_exercise_progression(p_program_id, p_exercise_id)` — per session: top-set weight, best e1RM. Chronological.
- `get_program_adherence(p_program_id)` — completed vs scheduled, per week.

All `SECURITY INVOKER` — RLS applies, and a user must not be able to read another's numbers by passing their program id.

## Testing

Write `scripts/seed-synthetic.ts` generating ~8 weeks of plausible sessions with **hand-calculated expected values**, then assert against them. SQL aggregation is much harder to unit-test than TypeScript, and "the chart looks plausible" is not a test — a volume figure that's 15% too high because warmups slipped in looks entirely plausible.

Include a deliberate trap in the fixture: a session containing **only** warmup sets. Its volume must be 0, and it must produce no PRs.

## Acceptance

- Every function returns hand-verifiable numbers against the synthetic fixture.
- Warmups contribute **nothing**, anywhere. Assert it explicitly, per function.
- e1RM: `100kg × 5` → `116.67`; `110kg × 3` → `121.0`. (The triple is the stronger set — this is the entire reason we plot e1RM and not raw weight.)
- Cross-user access via a borrowed `program_id` returns zero rows.
