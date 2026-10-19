-- 0008_get_last_performance_per_workout.sql — "Last time" is per WORKOUT.
--
-- Ticket 027 / docs/CONTEXT.md "Last performance". Supersedes the
-- program-scoped function from 0003_get_last_performance.sql. The same lift is
-- routinely prescribed differently on different days (heavy bench on Push A,
-- light bench on Push B); a reference pulled from the other day is the wrong
-- one. So the session pick is filtered to sessions OF THIS WORKOUT, and an
-- exercise never performed in this workout returns no rows — deliberately no
-- fallback to other workouts.
--
-- Keyed on sessions.workout_id, not session_sets.workout_exercise_id: the
-- latter is a convenience link that goes null when an exercise is removed
-- from a workout (ADR-0002), so re-adding it would orphan its history.
--
-- p_exercise_ids is gone: keyed on the workout, the function already knows
-- which exercises the workout contains. Passing them in forced the client to
-- fetch the prescription first and call this second; now both run in
-- parallel at session start.
--
-- Everything else carries over from 0003 unchanged and for the same reasons:
-- per-exercise DISTINCT ON (the last time you did THIS exercise, not the last
-- session), warmups excluded at both layers, set_number order, SECURITY
-- INVOKER so sessions/session_sets/workout_exercises RLS gates every row
-- (another user's workout_id joins to zero rows), pinned search_path.
drop function if exists public.get_last_performance(uuid, uuid[]);

create or replace function public.get_last_performance(
  p_workout_id uuid
)
returns table (
  exercise_id uuid,
  set_number int,
  weight numeric,
  reps int,
  performed_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with last_session as (
    -- For each exercise currently in the workout, the most recently
    -- completed session of this workout containing a WORKING set of it.
    select distinct on (ss.exercise_id)
      ss.exercise_id,
      ss.session_id
    from public.session_sets ss
    join public.sessions s on s.id = ss.session_id
    where s.workout_id = p_workout_id
      and s.status = 'completed'
      and ss.is_warmup = false
      and ss.exercise_id in (
        select we.exercise_id
        from public.workout_exercises we
        where we.workout_id = p_workout_id
      )
    order by ss.exercise_id, s.completed_at desc nulls last
  )
  select
    ss.exercise_id,
    ss.set_number,
    ss.weight,
    ss.reps,
    ss.completed_at as performed_at
  from last_session ls
  join public.session_sets ss
    on ss.session_id = ls.session_id
   and ss.exercise_id = ls.exercise_id
  where ss.is_warmup = false
  order by ss.exercise_id, ss.set_number;
$$;

grant execute on function public.get_last_performance(uuid) to authenticated;
