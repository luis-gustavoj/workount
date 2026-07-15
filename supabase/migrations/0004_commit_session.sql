-- 0004_commit_session.sql — the only write path for a finished session
-- (ticket 014, ADR-0001, ADR-0002).
--
-- Design constraints, all from the ticket:
--   * ATOMIC — a plpgsql function body runs inside the transaction of the
--     single statement that invoked it (`select commit_session(...)`). There
--     is no explicit BEGIN/COMMIT and no EXCEPTION block here, so any error
--     anywhere in the body — including a session_sets CHECK violation on a
--     bad row — aborts and rolls back the *entire* call. A half-written
--     session (row exists, sets don't) is therefore not a state this
--     function can produce.
--   * IDEMPOTENT — upserts on the CLIENT-GENERATED sessions.id (0001_init.sql:
--     "id uuid primary key -- CLIENT-GENERATED"). A retried commit after a
--     lost response upserts the same session row and replaces its sets
--     (delete-then-reinsert) rather than minting a second copy.
--   * SECURITY INVOKER (the default, stated explicitly, matching
--     0003_get_last_performance.sql) — RLS still gates every insert/update
--     this function performs. The explicit p_payload->>'user_id' vs
--     auth.uid() check below is *in addition* to RLS, not instead of it: the
--     ticket says "rejects a payload whose user_id isn't auth.uid()" as an
--     application-level guarantee, so callers get a clear error rather than
--     a silent RLS-filtered no-op.
--
-- Payload shape (built client-side by src/lib/session/commit.ts):
--   {
--     id, user_id, program_id, workout_id, started_at, completed_at,
--     duration_seconds, notes,
--     sets: [{ exercise_id, workout_exercise_id, position, set_number,
--              weight, reps, is_warmup, rpe, target_rep_min, target_rep_max,
--              completed_at }, ...]
--   }
--
-- jsonb ->> on a JSON null yields SQL NULL directly, so workout_id,
-- workout_exercise_id, rpe etc. round-trip correctly without a nullif.
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
  -- Explicit rejection (ticket 014), not just reliance on RLS below — gives
  -- a clear error instead of an RLS-filtered no-op for a forged user_id.
  if v_user_id is distinct from auth.uid() then
    raise exception 'commit_session: payload user_id does not match the authenticated user';
  end if;

  insert into public.sessions (
    id, user_id, program_id, workout_id, status,
    started_at, completed_at, duration_seconds, notes
  ) values (
    v_session_id,
    v_user_id,
    (p_payload->>'program_id')::uuid,
    (p_payload->>'workout_id')::uuid,
    'completed',
    (p_payload->>'started_at')::timestamptz,
    (p_payload->>'completed_at')::timestamptz,
    (p_payload->>'duration_seconds')::int,
    p_payload->>'notes'
  )
  on conflict (id) do update set
    program_id       = excluded.program_id,
    workout_id       = excluded.workout_id,
    status           = excluded.status,
    started_at       = excluded.started_at,
    completed_at     = excluded.completed_at,
    duration_seconds = excluded.duration_seconds,
    notes            = excluded.notes;
    -- user_id is deliberately not reassigned on conflict: it's the row's
    -- ownership, fixed at creation. RLS (sessions_all: USING/CHECK
    -- user_id = auth.uid()) already makes it impossible to reach this
    -- upsert against a session owned by someone else in the first place.

  -- Delete-then-reinsert (ticket 014's own words) rather than a diffing
  -- upsert: a completed session's sets are written exactly once per commit,
  -- so there's nothing to preserve across a retry — replacing the set is
  -- simpler and just as idempotent.
  delete from public.session_sets where session_id = v_session_id;

  for v_set in select * from jsonb_array_elements(p_payload->'sets')
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

-- Same policy as get_last_performance: the app is entirely behind Google
-- auth (ADR-0003), so only `authenticated` needs execute.
grant execute on function public.commit_session(jsonb) to authenticated;
