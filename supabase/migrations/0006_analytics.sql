-- 0006_analytics.sql — every analytic number, computed once, in Postgres
-- (ticket 017, docs/SPEC.md §3, ADR-0004).
--
-- The point of putting all of this in SQL is that the chart and the PR badge
-- must never be able to disagree. Neither of them owns a definition — this
-- file does:
--
--   Volume    Σ(weight × reps) over WORKING sets only.
--   e1RM      Epley: weight × (1 + reps / 30.0).
--   PR        a per-exercise best, working sets only, in three separate
--             kinds: heaviest set · best e1RM · best reps at a given weight.
--   Adherence completed sessions ÷ scheduled workouts, per ISO week.
--
-- `is_warmup = false` appears on every single aggregate below. It is the
-- single easiest way to get all four numbers wrong at once, and the bug is
-- silent: the charts still render, they are just lies. Bench-pressing the
-- empty bar for 20 is not a personal record.
--
-- Everything here is SECURITY INVOKER / security_invoker = true, matching
-- every other function and view in this project (0003, 0004, 0005). RLS on
-- sessions and session_sets is the only thing standing between a user and
-- someone else's numbers, and DEFINER would bypass it. There is deliberately
-- no explicit `programs.user_id = auth.uid()` check on p_program_id in any of
-- these functions: RLS already makes a borrowed program id join to zero rows
-- on every table these queries touch, exactly as 0003_get_last_performance.sql
-- reasoned. search_path is pinned and every reference schema-qualified to
-- match the house style.
--
-- Note what is NOT here: v_session_summary. It already exists in
-- 0005_history.sql, which says in as many words that this ticket must reuse
-- it rather than redefine it — one definition of session volume, not two.
-- get_program_volume below is a thin, program-scoped projection of it.
--
-- Precision: e1RM is returned unrounded. Rounding is a display concern
-- (the UI labels it as an estimate — CONTEXT.md), and rounding before a
-- comparison is how two "equal" PRs start disagreeing about which came
-- first. 100kg × 5 → 116.666…, 110kg × 3 → 121.000… — the triple is the
-- stronger set, which is the entire reason we plot e1RM and not raw weight.

-- ===========================================================================
-- e1rm — Epley, in one place.
--
-- ADR-0004: "Each definition exists in exactly one place (the SQL), so the
-- chart and the PR badge can never disagree." Volume honours that by way of
-- v_session_summary, which get_program_volume below merely projects. e1RM
-- needs this function to honour it: without one the formula would be spelled
-- out four times (twice here, twice in 0005_history.sql), and a later switch
-- to Brzycki would be four edits with three chances to miss one — which is
-- precisely the drift this file exists to prevent.
--
-- IMMUTABLE because it is pure arithmetic on its arguments; PARALLEL SAFE so
-- it cannot hold back a parallel aggregate over a large session history.
--
-- search_path is pinned to match every other function in this schema. The
-- cost is that a SQL function carrying a SET clause is not inlined by the
-- planner, so this is a real call per row rather than a substituted
-- expression. At the scale these aggregates run — a few thousand sets for a
-- program, already indexed — that overhead is irrelevant, and consistency
-- with the house rule is worth more than the microseconds.
create or replace function public.e1rm(p_weight numeric, p_reps int)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_weight * (1 + p_reps / 30.0);
$$;

grant execute on function public.e1rm(numeric, int) to authenticated, service_role;

-- ===========================================================================
-- v_exercise_prs — per (user, exercise), the three PR kinds, each carrying
-- the session it happened in so history can badge it and analytics can link
-- to it.
--
-- NOT scoped to a program, unlike everything else in this file. ADR-0004
-- scopes *charts* to a program because rep schemes differ between blocks and
-- splicing them produces a meaningless line; a PR has no such problem —
-- CONTEXT.md defines it as "a best, per exercise", full stop, and
-- session_sets.exercise_id was denormalized (ADR-0002) precisely so this
-- comparison can cross programs. Same reasoning as get_session_prs in 0005.
--
-- Only `completed` sessions count. A set logged in an abandoned session is
-- not a performance the user stands behind, and an `active` session is by
-- definition still being edited.
--
-- Ties break toward the EARLIEST session: if you hit 100×5 in March and
-- again in June, the record was set in March. session_id is the final
-- tie-break so the view is deterministic rather than merely correct.
--
-- The third kind needs its deviation stated plainly rather than buried.
-- CONTEXT.md, ADR-0004 and the ticket all call it "best reps at a given
-- weight", which is inherently a per-(exercise, weight) fact: "at 100kg my
-- best is 8". That does not fit one row per exercise, and one row per
-- exercise is the shape SPEC.md §3 fixes for this view. So it is collapsed
-- to the most reps ever performed in a single working set, reported with the
-- weight it happened at (ties → the heavier set, unambiguously better), and
-- the columns are named most_reps* rather than best_reps_at_weight* so the
-- view does not claim to be something it isn't.
--
-- Known consequence, visible in this ticket's own fixture: a high-rep set at
-- a light weight (50kg × 15) takes the record and no amount of future
-- strength at 77.5kg can displace it. If that turns out to be the wrong
-- metric in use, the fix is a per-(exercise, weight) companion table, which
-- is a shape change SPEC.md would have to sanction first.
--
-- This is also the criterion warmups corrupt most spectacularly — a 20kg × 20
-- warmup outreps every real set anyone has ever done.
create or replace view public.v_exercise_prs
with (security_invoker = true) as
with working as (
  select
    s.user_id,
    ss.exercise_id,
    ss.session_id,
    s.completed_at,
    ss.weight,
    ss.reps,
    public.e1rm(ss.weight, ss.reps) as e1rm
  from public.session_sets ss
  join public.sessions s on s.id = ss.session_id
  where ss.is_warmup = false
    and s.status = 'completed'
),
heaviest as (
  select distinct on (w.user_id, w.exercise_id)
    w.user_id, w.exercise_id, w.weight, w.reps, w.session_id, w.completed_at
  from working w
  order by w.user_id, w.exercise_id,
           w.weight desc, w.reps desc, w.completed_at, w.session_id
),
best_e1rm as (
  select distinct on (w.user_id, w.exercise_id)
    w.user_id, w.exercise_id, w.e1rm, w.weight, w.reps, w.session_id, w.completed_at
  from working w
  order by w.user_id, w.exercise_id,
           w.e1rm desc, w.completed_at, w.session_id
),
most_reps as (
  select distinct on (w.user_id, w.exercise_id)
    w.user_id, w.exercise_id, w.reps, w.weight, w.session_id, w.completed_at
  from working w
  order by w.user_id, w.exercise_id,
           w.reps desc, w.weight desc, w.completed_at, w.session_id
)
-- Each kind reports its weight and reps alongside the session id: a bare
-- "best e1RM 137.08" is not a badge anyone can read, and the ticket's
-- "each with the session_id where it happened" is about which session to
-- LINK to. When the PR was set is deliberately not a column — session_id
-- already carries it, one join away, and completed_at is only here to break
-- ties toward the earliest achievement.
select
  h.user_id,
  h.exercise_id,

  h.weight     as heaviest_weight,
  h.reps       as heaviest_reps,
  h.session_id as heaviest_session_id,

  e.e1rm       as best_e1rm,
  e.weight     as best_e1rm_weight,
  e.reps       as best_e1rm_reps,
  e.session_id as best_e1rm_session_id,

  r.reps       as most_reps,
  r.weight     as most_reps_weight,
  r.session_id as most_reps_session_id
from heaviest h
join best_e1rm e on e.user_id = h.user_id and e.exercise_id = h.exercise_id
join most_reps r on r.user_id = h.user_id and r.exercise_id = h.exercise_id;

grant select on public.v_exercise_prs to authenticated, service_role;

-- ===========================================================================
-- get_program_volume — volume per completed session in a program,
-- chronological. The headline "am I doing more than last time" chart.
--
-- A projection of v_session_summary (0005_history.sql), not a reimplementation
-- of it: session volume is defined in exactly one place, so /history's number
-- and the analytics chart's number are the same number by construction.
--
-- workout_name rides along because it is free here (the view already computes
-- it) and a point on a volume chart with no label is not interpretable.
-- Sessions whose workout was later deleted keep a NULL name — deleting a plan
-- does not erase the past (ticket 016).
--
-- The warmup-only session — a real thing that happens when someone warms up,
-- tweaks something and stops — appears with total_volume = 0. It is NOT
-- filtered out: it is a session that happened, and a hole in the chart would
-- be a lie of a different kind.
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
  order by v.completed_at, v.session_id;
$$;

grant execute on function public.get_program_volume(uuid) to authenticated;

-- ===========================================================================
-- get_exercise_progression — per completed session in a program: the top set
-- and the best e1RM for one exercise. Chronological.
--
-- Both numbers, not one, because they answer different questions and can come
-- from different sets within the same session. Raw top-set weight is what the
-- user recognizes ("I put 117.5 on the bar"); e1RM is what actually tracks
-- strength when the rep count moves, and is the line the chart plots.
--
-- top_set = the heaviest working set, ties broken by the higher rep count
-- (117.5 × 5 beats 117.5 × 3). best_e1rm is the max over all working sets in
-- the session, which is frequently a *different* set — a 110 × 3 opener
-- outscores 100 × 5 even though 100 × 5 might be the day's prescribed work.
--
-- Warmups are excluded before either number is computed, so an exercise that
-- was only warmed up in a session contributes no row at all — which is
-- correct: nothing was performed.
create or replace function public.get_exercise_progression(
  p_program_id  uuid,
  p_exercise_id uuid
)
returns table (
  session_id     uuid,
  completed_at   timestamptz,
  top_set_weight numeric,
  top_set_reps   int,
  best_e1rm      numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with working as (
    select
      ss.session_id,
      s.completed_at,
      ss.weight,
      ss.reps
    from public.session_sets ss
    join public.sessions s on s.id = ss.session_id
    where s.program_id = p_program_id
      and s.status = 'completed'
      and ss.exercise_id = p_exercise_id
      and ss.is_warmup = false
  ),
  top_set as (
    select distinct on (w.session_id)
      w.session_id, w.weight, w.reps
    from working w
    order by w.session_id, w.weight desc, w.reps desc
  )
  select
    t.session_id,
    max(w.completed_at) as completed_at,   -- constant within a session
    t.weight            as top_set_weight,
    t.reps              as top_set_reps,
    max(public.e1rm(w.weight, w.reps)) as best_e1rm
  from top_set t
  join working w on w.session_id = t.session_id
  group by t.session_id, t.weight, t.reps
  order by 2, 1;
$$;

grant execute on function public.get_exercise_progression(uuid, uuid) to authenticated;

-- ===========================================================================
-- get_program_adherence — completed sessions vs scheduled workouts, per ISO
-- week. "Am I actually following this program."
--
-- scheduled_workouts is the count of workouts in the program that have a
-- day_of_week — an unscheduled workout (day_of_week IS NULL, an intentional
-- state in 0001_init.sql) is an option, not an obligation, and counting it
-- would make every week look like a failure. It is a constant across the
-- weeks, which is the honest reading of "scheduled per week"; the program's
-- current shape is the only shape we know, since workouts are mutable and
-- keep no history.
--
-- Weeks are contiguous, from the first week that has a completed session to
-- the week the program stopped being live (archived_at, or now() for a
-- program still in use). Two consequences, both deliberate:
--   * A week you skipped shows up as a zero row, not as a missing row. A
--     chart that silently omits the weeks you didn't train is a chart that
--     says you never miss.
--   * A program with no completed sessions returns zero rows rather than a
--     wall of zeroes back to its creation date.
--
-- adherence is NOT capped at 1.0: training three times in a two-session week
-- is 1.5, and flattening that to "100%" would hide it. It is NULL, not zero,
-- when nothing is scheduled — undefined, not perfect.
--
-- Weeks are truncated in UTC (`at time zone 'UTC'` before date_trunc) so a
-- session's week does not depend on the caller's timezone setting.
-- date_trunc('week', …) is Monday-based, i.e. ISO.
create or replace function public.get_program_adherence(p_program_id uuid)
returns table (
  week_start         date,
  completed_sessions int,
  scheduled_workouts int,
  adherence          numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with scheduled as (
    select count(*)::int as n
    from public.workouts w
    where w.program_id = p_program_id
      and w.day_of_week is not null
  ),
  completed as (
    select
      (date_trunc('week', s.completed_at at time zone 'UTC'))::date as week_start,
      count(*)::int as n
    from public.sessions s
    where s.program_id = p_program_id
      and s.status = 'completed'
      and s.completed_at is not null
    group by 1
  ),
  bounds as (
    select
      (select min(c.week_start) from completed c) as first_week,
      -- greatest() ignores NULLs, so a program with no sessions yet still
      -- yields a last_week — but first_week stays NULL and `weeks` below
      -- comes back empty, which is the intended "nothing to show".
      greatest(
        (select max(c.week_start) from completed c),
        (select (date_trunc('week', coalesce(p.archived_at, now()) at time zone 'UTC'))::date
         from public.programs p
         where p.id = p_program_id)
      ) as last_week
  ),
  weeks as (
    select gs::date as week_start
    from bounds b
    cross join lateral generate_series(b.first_week, b.last_week, interval '1 week') gs
    where b.first_week is not null
  )
  select
    wk.week_start,
    coalesce(c.n, 0) as completed_sessions,
    (select s.n from scheduled s) as scheduled_workouts,
    case
      when (select s.n from scheduled s) > 0
        then round(coalesce(c.n, 0)::numeric / (select s.n from scheduled s), 4)
      else null
    end as adherence
  from weeks wk
  left join completed c on c.week_start = wk.week_start
  order by wk.week_start;
$$;

grant execute on function public.get_program_adherence(uuid) to authenticated;

-- ===========================================================================
-- get_session_prs — re-created to call e1rm() instead of spelling Epley out
-- twice more.
--
-- This function belongs to ticket 016 and its original definition is in
-- 0005_history.sql, which stays untouched on disk: migrations are an applied
-- history, not a document you go back and edit (CLAUDE.md). Replacing it from
-- a later migration is the supported way to evolve a function, and leaving it
-- alone was the alternative — at the cost of e1RM living in two places
-- instead of one, which is the exact failure ADR-0004 forbids and this file
-- was written to fix.
--
-- The body is otherwise byte-for-byte 0005's, and the substitution is exact:
-- e1rm() is IMMUTABLE and returns the identical numeric, so the DISTINCT ON
-- ordering and every comparison below behave exactly as before. 0005's
-- reasoning still applies in full and is not repeated here — read it there.
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
      public.e1rm(ss.weight, ss.reps) as e1rm
    from public.session_sets ss
    where ss.session_id = p_session_id
      and ss.is_warmup = false
    order by ss.exercise_id, public.e1rm(ss.weight, ss.reps) desc, ss.set_number
  ),
  prior_best as (
    select
      sb.exercise_id,
      max(public.e1rm(prev.weight, prev.reps)) as e1rm
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
