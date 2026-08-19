-- 0007_get_home_data.sql — everything the home screen needs, in one round trip
-- (ticket 024, docs/SPEC.md §3 · §4).
--
-- Home is the landing screen and it was the slowest one in the app. In
-- JavaScript it could not be anything else: the workouts and sessions queries
-- both need `profiles.active_program_id`, so they could not start until that
-- first query came back. Two sequential round trips before a single card could
-- render, on the screen the user opens most.
--
-- Ticket 024 also gave Home a real Start button, which needs a third fact the
-- old query never fetched: how many exercises each workout has. A workout with
-- none must offer "Add exercises" rather than a Start that drops the user into
-- an empty player saying "no session in progress" — a confusing lie right
-- after they started one.
--
-- So: one function, one round trip, three facts. CLAUDE.md — aggregation lives
-- in Postgres, not in JavaScript.
--
-- SECURITY INVOKER / search_path = '' throughout, matching 0003–0006. RLS on
-- profiles, workouts and sessions is what scopes every row below to the
-- caller; DEFINER would bypass it. There is deliberately no explicit
-- `user_id = auth.uid()` filter — `profiles` is already RLS-scoped to the
-- caller, and the ids that flow out of it therefore belong to them.
--
-- The shape is a single jsonb document rather than a `returns table`, because
-- this is three differently-shaped result sets (a scalar, a workout list, a
-- session list) and flattening them into one row-type would mean either three
-- functions — three round trips, defeating the point — or a wide sparse table
-- the client has to unpick.

create or replace function public.get_home_data(p_recent_session_limit int default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with active as (
    select p.active_program_id as program_id
    from public.profiles p
    where p.id = (select auth.uid())
  ),
  program_workouts as (
    select
      w.id,
      w.name,
      w.day_of_week,
      w.position,
      -- The count that decides Start vs "Add exercises". A left join keeps
      -- zero-exercise workouts in the list — they are precisely the case
      -- this exists to detect, so an inner join would hide them.
      count(we.id) as exercise_count
    from public.workouts w
    left join public.workout_exercises we on we.workout_id = w.id
    where w.program_id = (select program_id from active)
    group by w.id, w.name, w.day_of_week, w.position
  ),
  recent_sessions as (
    select
      s.id,
      s.workout_id,
      -- null once the workout is deleted (ON DELETE SET NULL, SPEC §2); the
      -- session survives and still counts toward the streak.
      w.name as workout_name,
      s.completed_at,
      s.duration_seconds
    from public.sessions s
    left join public.workouts w on w.id = s.workout_id
    where s.program_id = (select program_id from active)
      and s.status = 'completed'
      and s.completed_at is not null
    order by s.completed_at desc
    limit p_recent_session_limit
  )
  select jsonb_build_object(
    'activeProgramId', (select program_id from active),
    -- coalesce so the client always gets arrays, never null. A `no active
    -- program` user is a real state (SPEC §4), not an error, and it should not
    -- need a null check at every use site.
    'workouts', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', pw.id,
            'name', pw.name,
            'dayOfWeek', pw.day_of_week,
            'exerciseCount', pw.exercise_count
          )
          order by pw.position
        )
        from program_workouts pw
      ),
      '[]'::jsonb
    ),
    'recentSessions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', rs.id,
            'workoutId', rs.workout_id,
            'workoutName', rs.workout_name,
            'completedAt', rs.completed_at,
            'durationSeconds', rs.duration_seconds
          )
          order by rs.completed_at desc
        )
        from recent_sessions rs
      ),
      '[]'::jsonb
    )
  );
$$;

-- The app is entirely behind Google auth (ADR-0003) — anon gets nothing, same
-- as the table grants in 0001_init.sql.
grant execute on function public.get_home_data(int) to authenticated;
