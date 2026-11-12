-- 0009_cardio.sql — cardio as a second kind of workout and session
-- (docs/CONTEXT.md "Cardio", ADR-0008).
--
-- A cardio day is a WORKOUT (a day in the program, scheduled like any other)
-- whose prescription is free text instead of workout_exercises rows; a cardio
-- SESSION is the performance, recorded as duration + distance + RPE instead of
-- session_sets. Everything that already hangs off workouts/sessions — Home's
-- "Today", adherence, history, the streak — picks cardio up for free.
--
-- Written to be re-runnable (if not exists / create or replace) so pasting it
-- into the SQL editor before `supabase db push` records it does no harm.

-- ---------------------------------------------------------------------------
-- workouts: kind + notes
--   notes is the workout-level note: the whole prescription for a cardio day,
--   and the warm-up / finisher note for a strength day.
--   kind is fixed at creation in the UI — a strength workout with exercises
--   never turns into a cardio one.
-- ---------------------------------------------------------------------------
alter table public.workouts
  add column if not exists kind text not null default 'strength',
  add column if not exists notes text;

alter table public.workouts drop constraint if exists workouts_kind_check;
alter table public.workouts
  add constraint workouts_kind_check check (kind in ('strength', 'cardio'));

-- ---------------------------------------------------------------------------
-- sessions: kind snapshot + cardio performance
--   kind is SNAPSHOTTED (ADR-0002), not read through workout_id: the workout
--   can be deleted (ON DELETE SET NULL) and the session must still know what
--   it was.
--   distance_m is meters, always — like weights are kilograms (CLAUDE.md #5).
--   rpe is the session-level effort, 1–10, same scale as session_sets.rpe.
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column if not exists kind text not null default 'strength',
  add column if not exists distance_m int,
  add column if not exists rpe numeric(3,1);

alter table public.sessions drop constraint if exists sessions_kind_check;
alter table public.sessions
  add constraint sessions_kind_check check (kind in ('strength', 'cardio'));
alter table public.sessions drop constraint if exists sessions_distance_m_check;
alter table public.sessions
  add constraint sessions_distance_m_check check (distance_m is null or distance_m >= 0);
alter table public.sessions drop constraint if exists sessions_rpe_check;
alter table public.sessions
  add constraint sessions_rpe_check check (rpe is null or rpe between 1 and 10);

-- ---------------------------------------------------------------------------
-- v_session_summary — new columns appended at the END (create or replace view
-- cannot reorder or drop existing ones).
-- ---------------------------------------------------------------------------
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
  count(distinct ss.exercise_id) as exercise_count,
  s.kind,
  s.distance_m,
  s.rpe,
  s.notes
from public.sessions s
left join public.workouts w on w.id = s.workout_id
left join public.session_sets ss on ss.session_id = s.id
group by s.id, w.name;

-- ---------------------------------------------------------------------------
-- get_program_volume — strength sessions only. A cardio session has no
-- volume (CONTEXT.md "Cardio"); left in, it would plot as a fake zero every
-- Tuesday and Saturday.
-- ---------------------------------------------------------------------------
create or replace function public.get_program_volume(p_program_id uuid)
returns table (
  session_id   uuid,
  completed_at timestamptz,
  workout_name text,
  total_volume numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    v.session_id,
    v.completed_at,
    v.workout_name,
    v.total_volume
  from public.v_session_summary v
  where v.program_id = p_program_id
    and v.status = 'completed'
    and v.kind = 'strength'
  order by v.completed_at, v.session_id;
$$;

-- ---------------------------------------------------------------------------
-- commit_session — also writes kind, distance_m, rpe. Missing keys default to
-- a strength session with no cardio fields, so the player's existing payload
-- is unchanged. A cardio session is committed with an empty `sets` array.
-- ---------------------------------------------------------------------------
create or replace function public.commit_session(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id uuid := (p_payload->>'id')::uuid;
  v_user_id    uuid := (p_payload->>'user_id')::uuid;
  v_set        jsonb;
begin
  if v_user_id is distinct from auth.uid() then
    raise exception 'commit_session: payload user_id does not match the authenticated user';
  end if;

  insert into public.sessions (
    id, user_id, program_id, workout_id, status,
    started_at, completed_at, duration_seconds, notes,
    kind, distance_m, rpe
  ) values (
    v_session_id,
    v_user_id,
    (p_payload->>'program_id')::uuid,
    (p_payload->>'workout_id')::uuid,
    'completed',
    (p_payload->>'started_at')::timestamptz,
    (p_payload->>'completed_at')::timestamptz,
    (p_payload->>'duration_seconds')::int,
    p_payload->>'notes',
    coalesce(p_payload->>'kind', 'strength'),
    (p_payload->>'distance_m')::int,
    (p_payload->>'rpe')::numeric
  )
  on conflict (id) do update set
    program_id       = excluded.program_id,
    workout_id       = excluded.workout_id,
    status           = excluded.status,
    started_at       = excluded.started_at,
    completed_at     = excluded.completed_at,
    duration_seconds = excluded.duration_seconds,
    notes            = excluded.notes,
    kind             = excluded.kind,
    distance_m       = excluded.distance_m,
    rpe              = excluded.rpe;

  delete from public.session_sets where session_id = v_session_id;

  for v_set in select * from jsonb_array_elements(coalesce(p_payload->'sets', '[]'::jsonb))
  loop
    insert into public.session_sets (
      session_id, exercise_id, workout_exercise_id, position, set_number,
      weight, reps, is_warmup, rpe, target_rep_min, target_rep_max, completed_at
    ) values (
      v_session_id,
      (v_set->>'exercise_id')::uuid,
      (v_set->>'workout_exercise_id')::uuid,
      (v_set->>'position')::int,
      (v_set->>'set_number')::int,
      (v_set->>'weight')::numeric,
      (v_set->>'reps')::int,
      coalesce((v_set->>'is_warmup')::boolean, false),
      (v_set->>'rpe')::numeric,
      (v_set->>'target_rep_min')::int,
      (v_set->>'target_rep_max')::int,
      (v_set->>'completed_at')::timestamptz
    );
  end loop;

  return v_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_home_data — workouts also carry kind and notes. Home needs kind to offer
-- "Log cardio" instead of "Add exercises" for a workout with no exercises.
-- ---------------------------------------------------------------------------
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
      w.kind,
      count(we.id) as exercise_count
    from public.workouts w
    left join public.workout_exercises we on we.workout_id = w.id
    where w.program_id = (select program_id from active)
    group by w.id, w.name, w.day_of_week, w.position, w.kind
  ),
  recent_sessions as (
    select
      s.id,
      s.workout_id,
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
    'workouts', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', pw.id,
            'name', pw.name,
            'dayOfWeek', pw.day_of_week,
            'kind', pw.kind,
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
