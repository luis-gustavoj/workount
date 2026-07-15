-- 0003_get_last_performance.sql — the SQL behind "Last time: 80×8, 80×8, 77.5×7."
--
-- docs/SPEC.md §3 / ticket 010. The subtlety that is easy to get wrong:
-- this is "the last time you did THIS EXERCISE", not "the last session".
-- Those differ constantly — skip bench one week but squat, and bench's
-- reference must come from two weeks ago while squat's comes from last
-- week. A naive `ORDER BY completed_at DESC LIMIT 1` finds one session and
-- reads its sets, which returns NOTHING for any exercise that session didn't
-- include. So the lookup is per-exercise: DISTINCT ON (exercise_id), ordered
-- per-exercise by the owning session's completed_at DESC.
--
-- SECURITY INVOKER (the default, stated explicitly): this function must run
-- with the CALLER's privileges so the sessions/session_sets RLS policies
-- (0001_init.sql) still gate every row. That is the only thing standing
-- between a user and another user's training history if they pass a
-- program_id they don't own — there is no explicit ownership check on
-- p_program_id here because RLS already makes it moot: sessions_all requires
-- sessions.user_id = auth.uid() on the `sessions s` reference itself, and
-- session_sets_all requires the same by joining up to it — so a foreign
-- program_id can only ever join to zero rows, on either table.
--
-- search_path is pinned even though INVOKER functions don't carry the
-- SECURITY DEFINER privilege-escalation risk (0002_handle_new_user.sql) —
-- cheap defense in depth, and every table reference is schema-qualified to
-- match.
create or replace function public.get_last_performance(
  p_program_id uuid,
  p_exercise_ids uuid[]
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
    -- For each requested exercise, the session_set (and therefore the
    -- session) that was most recently completed in this program among
    -- sessions containing a WORKING set of that exercise. Warmups are
    -- excluded here, not just below: a session where the lift was only
    -- warmed up must not "count" as the last performance, or a real working
    -- performance further back gets shadowed by an empty result.
    select distinct on (ss.exercise_id)
      ss.exercise_id,
      ss.session_id
    from public.session_sets ss
    join public.sessions s on s.id = ss.session_id
    where s.program_id = p_program_id
      and s.status = 'completed'
      and ss.is_warmup = false
      and ss.exercise_id = any (p_exercise_ids)
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

-- The app is entirely behind Google auth (ADR-0003) — anon gets nothing, same
-- as the table grants in 0001_init.sql.
grant execute on function public.get_last_performance(uuid, uuid[]) to authenticated;
