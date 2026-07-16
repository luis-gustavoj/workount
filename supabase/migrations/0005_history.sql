-- 0005_history.sql — the SQL behind /history and /history/[id] (ticket 016).
--
-- Two objects:
--
--   * v_session_summary — per-session aggregates for the list screen
--     (duration, volume, set count, exercise count), plus the workout's
--     current name for convenience. docs/SPEC.md §3 promises this exact view
--     name, so ticket 017 (analytics SQL) must reuse it rather than
--     redefining it.
--
--   * get_session_prs — a per-session-set PR flag for the detail screen's
--     badges. Deliberately NOT the full three-kind `v_exercise_prs` system
--     (heaviest set / best e1RM / best reps-at-weight) that ticket 017 owns —
--     that ticket is explicitly gated behind real training data ("do not
--     start until you have used the app for real"). This is the same
--     "lightweight, fully-offline" scope decision src/lib/session/commit.ts's
--     buildFinishSummary already made for the finish screen, just now
--     compared against the caller's whole history (any program) instead of
--     only the bundle's last-performance snapshot, because a badge on a
--     record screen has network access to do it properly. Uses e1RM
--     (Epley) as the single ranking metric — a superset, not a subset, of
--     "heaviest set" for equal-rep comparisons, and the same metric the
--     finish screen already trained the user to recognize.
--
-- Both SECURITY INVOKER, matching every other function in this project: RLS
-- on sessions/session_sets is the only thing standing between a user and
-- someone else's training history, and DEFINER would bypass it.

-- ===========================================================================
-- v_session_summary
--
-- security_invoker = true (PG15+, already relied on elsewhere in this schema
-- for NULLS NOT DISTINCT) is not optional here: without it, the view runs
-- with the privileges of whichever role owns it (the migration runner),
-- which on a Supabase project is a role that bypasses RLS — every user's
-- sessions would be readable through the view regardless of the
-- sessions/session_sets policies in 0001_init.sql. With it, the view is
-- exactly as safe as querying sessions and session_sets directly.
--
-- LEFT JOIN workouts, not an inner join: a session's workout_id can be NULL
-- (an intentional design in 0001_init.sql — sessions.workout_id is
-- ON DELETE SET NULL) either because the workout was deleted, or because the
-- session was started without one. Either way the row must still summarize;
-- workout_name simply comes back NULL and the UI falls back to the exercise
-- list (ticket 016's own acceptance criterion).
--
-- total_volume sums working sets only (ADR-0004, CONTEXT.md "Warmup set");
-- set_count and exercise_count count every set/exercise performed, warmup or
-- not — the ticket's example is a warmup that "silently vanished... the user
-- would think the app dropped a set", so the set count the list shows must
-- match what the detail screen's set list actually contains.
--
-- GROUP BY s.id alone (not every selected sessions column) relies on
-- functional dependency: Postgres allows this when grouping by a table's
-- primary key, because every other column of that same table is then
-- provably single-valued per group.
create or replace view public.v_session_summary
with (security_invoker = true) as
select
  s.id as session_id,
  s.user_id,
  s.program_id,
  s.workout_id,
  w.name as workout_name,
  s.status,
  s.started_at,
  s.completed_at,
  s.duration_seconds,
  coalesce(
    sum(ss.weight * ss.reps) filter (where ss.is_warmup = false),
    0
  ) as total_volume,
  count(ss.id) as set_count,
  count(distinct ss.exercise_id) as exercise_count
from public.sessions s
left join public.workouts w on w.id = s.workout_id
left join public.session_sets ss on ss.session_id = s.id
group by s.id, w.name;

grant select on public.v_session_summary to authenticated, service_role;

-- ===========================================================================
-- get_session_prs — session_set ids that are a personal best at the moment
-- this session happened, one per exercise in the session at most.
--
-- session_best: the working set with the highest e1RM per exercise, WITHIN
-- this session — ties broken by set_number so the result is deterministic.
-- Comparing every set independently against prior history (rather than just
-- this session's best) would double-badge an exercise whose second set beat
-- both history and its own first set.
--
-- prior_best: the best e1RM ever recorded for that exercise, across ANY
-- program, in a session completed strictly before this one. Not scoped to
-- p_program_id — CONTEXT.md defines a PR as "a best, per exercise", and
-- ADR-0002 denormalized session_sets.exercise_id specifically to make this
-- cross-program comparison possible. Warmups are excluded on both sides
-- (CLAUDE.md: "no exceptions").
--
-- A session_best row with no prior_best match (first time the exercise was
-- ever performed) is compared against coalesce(..., 0), so it always badges —
-- matching commit.ts's precedent of not requiring a prior baseline to count.
create or replace function public.get_session_prs(p_session_id uuid)
returns table (session_set_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  with session_best as (
    select distinct on (ss.exercise_id)
      ss.id as session_set_id,
      ss.exercise_id,
      ss.weight * (1 + ss.reps / 30.0) as e1rm
    from public.session_sets ss
    where ss.session_id = p_session_id
      and ss.is_warmup = false
    order by ss.exercise_id, ss.weight * (1 + ss.reps / 30.0) desc, ss.set_number
  ),
  prior_best as (
    select
      sb.exercise_id,
      max(prev.weight * (1 + prev.reps / 30.0)) as e1rm
    from session_best sb
    join public.session_sets prev on prev.exercise_id = sb.exercise_id
    join public.sessions ps on ps.id = prev.session_id
    join public.sessions s on s.id = p_session_id
    where prev.is_warmup = false
      and ps.status = 'completed'
      and ps.completed_at < s.completed_at
    group by sb.exercise_id
  )
  select sb.session_set_id
  from session_best sb
  left join prior_best pb on pb.exercise_id = sb.exercise_id
  where sb.e1rm > coalesce(pb.e1rm, 0);
$$;

grant execute on function public.get_session_prs(uuid) to authenticated;
