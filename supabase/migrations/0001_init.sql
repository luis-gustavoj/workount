-- 0001_init.sql — the full Workount data model.
--
-- Row-level security is enabled on *every* table in the same statement block that
-- creates it (see CLAUDE.md and SPEC.md §2). "Add RLS later" means shipping a
-- table that leaks; there is no later.
--
-- Read docs/CONTEXT.md before touching this file. The load-bearing distinction:
--   workouts       = the PLAN (a day in a program; mutable)
--   sessions       = the PERFORMANCE (what happened; immutable once completed)
-- Weights are stored in KILOGRAMS, always — weight_unit is a display preference.
--
-- gen_random_uuid() is in Postgres core since v13, so no extension is required.

-- ===========================================================================
-- exercises — the movement catalog.
--   user_id IS NULL → global, seeded by us, readable by everyone.
--   user_id = <uid> → a custom exercise, visible only to its owner.
-- An exercise is a definition; it has no sets, weight, or reps.
-- ===========================================================================
create table exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete cascade,  -- NULL = global
  name         text not null,
  muscle_group text not null check (muscle_group in
    ('chest','back','shoulders','quads','hamstrings','glutes',
     'biceps','triceps','core','calves','other')),
  equipment    text not null check (equipment in
    ('barbell','dumbbell','machine','cable','bodyweight','kettlebell','other')),
  created_at   timestamptz not null default now()
);

-- A user may not create two exercises with the same (case-insensitive) name, and
-- the global catalog is unique among itself. NULLS NOT DISTINCT (PG15+) is what
-- makes the NULL user_id of globals collide as intended — without it Postgres
-- treats every NULL as distinct and the catalog could hold twenty "Bench Press"
-- rows (trap #2). Expression indexes cannot be table constraints, hence the
-- unique index rather than a UNIQUE (...) clause on the table.
create unique index exercises_user_lower_name_key
  on exercises (user_id, lower(name)) nulls not distinct;

alter table exercises enable row level security;

-- SELECT: the global catalog plus your own customs.
create policy exercises_select on exercises
  for select
  using (user_id is null or user_id = auth.uid());

-- Writes touch your own customs only — nobody edits the global catalog.
create policy exercises_insert on exercises
  for insert
  with check (user_id = auth.uid());

create policy exercises_update on exercises
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy exercises_delete on exercises
  for delete
  using (user_id = auth.uid());

-- ===========================================================================
-- programs — a named training plan the user follows. The unit of analytics.
-- ===========================================================================
create table programs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  description text,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table programs enable row level security;

create policy programs_all on programs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===========================================================================
-- profiles — one row per auth user. Display preferences live here.
--   active_program_id → the ONE program being followed (SPEC invariant 1).
--   weight_unit, locale → display preferences only; never a dimension of data.
-- Created after programs so active_program_id's FK resolves inline.
-- ===========================================================================
create table profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  display_name         text,
  avatar_url           text,
  active_program_id    uuid references programs (id) on delete set null,
  default_rest_seconds int not null default 90,
  weight_unit          text not null default 'kg' check (weight_unit in ('kg','lb')),
  -- i18n display preference (ADR-0005). Mirrors weight_unit exactly; the existing
  -- profiles policy already covers it, so no new RLS policy is needed.
  locale               text not null default 'en' check (locale in ('en','pt-BR')),
  created_at           timestamptz not null default now()
);

alter table profiles enable row level security;

create policy profiles_all on profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- ===========================================================================
-- workouts — a DAY within a program. A plan, not a performance.
-- ===========================================================================
create table workouts (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references programs (id) on delete cascade,
  name        text not null,                                    -- "Push A"
  day_of_week smallint check (day_of_week between 0 and 6),     -- 0=Sun..6=Sat, NULL=unscheduled
  position    int not null,
  created_at  timestamptz not null default now()
);

alter table workouts enable row level security;

-- Gated by a join up to the owning program.
create policy workouts_all on workouts
  for all
  using (exists (
    select 1 from programs p
    where p.id = workouts.program_id and p.user_id = auth.uid()))
  with check (exists (
    select 1 from programs p
    where p.id = workouts.program_id and p.user_id = auth.uid()));

-- ===========================================================================
-- workout_exercises — the PRESCRIPTION: exercise, sets, rep range, rest, notes.
--   exercise_id is ON DELETE RESTRICT: a prescribed exercise cannot be deleted
--   out from under the plan (trap #3 / ADR-0002). Archive, never delete.
-- ===========================================================================
create table workout_exercises (
  id             uuid primary key default gen_random_uuid(),
  workout_id     uuid not null references workouts (id) on delete cascade,
  exercise_id    uuid not null references exercises (id) on delete restrict,
  position       int not null,
  target_sets    int not null check (target_sets between 1 and 20),
  rep_min        int not null check (rep_min >= 1),
  rep_max        int not null check (rep_max >= rep_min),
  rest_seconds   int,                                           -- NULL → profiles.default_rest_seconds
  notes          text,
  superset_group text,                                          -- 'A','B',… NULL = performed straight
  created_at     timestamptz not null default now()
);

alter table workout_exercises enable row level security;

-- Gated by a join up through workouts to the owning program.
create policy workout_exercises_all on workout_exercises
  for all
  using (exists (
    select 1 from workouts w
    join programs p on p.id = w.program_id
    where w.id = workout_exercises.workout_id and p.user_id = auth.uid()))
  with check (exists (
    select 1 from workouts w
    join programs p on p.id = w.program_id
    where w.id = workout_exercises.workout_id and p.user_id = auth.uid()));

-- ===========================================================================
-- sessions — the PERFORMANCE. id is CLIENT-GENERATED (no default) so the finish
-- commit can upsert idempotently after a flaky response (ADR-0001).
-- ===========================================================================
create table sessions (
  id               uuid primary key,                            -- CLIENT-GENERATED
  user_id          uuid not null references auth.users (id) on delete cascade,
  program_id       uuid not null references programs (id) on delete cascade,
  workout_id       uuid references workouts (id) on delete set null,
  status           text not null check (status in ('active','completed','abandoned')),
  started_at       timestamptz not null,
  completed_at     timestamptz,
  duration_seconds int,
  notes            text
);

alter table sessions enable row level security;

create policy sessions_all on sessions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===========================================================================
-- session_sets — one performed set. Self-describing (ADR-0002): it snapshots the
-- exercise identity and the prescribed rep range so history survives program
-- edits.
--   exercise_id is ON DELETE RESTRICT — a performed exercise must not be deletable.
-- ===========================================================================
create table session_sets (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references sessions (id) on delete cascade,
  exercise_id         uuid not null references exercises (id) on delete restrict,       -- denormalized identity
  workout_exercise_id uuid references workout_exercises (id) on delete set null,        -- convenience link only
  position            int not null,                             -- exercise order within the session
  set_number          int not null,                             -- 1-based, within the exercise
  weight              numeric(6,2) not null check (weight >= 0),  -- ALWAYS kg
  reps                int not null check (reps >= 0),
  is_warmup           boolean not null default false,
  rpe                 numeric(3,1) check (rpe between 1 and 10),
  target_rep_min      int,                                      -- snapshot of the prescription…
  target_rep_max      int,                                      -- …at performance time
  completed_at        timestamptz not null
);

alter table session_sets enable row level security;

-- Gated through SESSIONS, deliberately NOT through exercises (trap #1): a set
-- references an exercise, and global exercises are readable by everyone — gating
-- through them would make every user's training history world-readable. The
-- owner check must climb to sessions.user_id.
create policy session_sets_all on session_sets
  for all
  using (exists (
    select 1 from sessions s
    where s.id = session_sets.session_id and s.user_id = auth.uid()))
  with check (exists (
    select 1 from sessions s
    where s.id = session_sets.session_id and s.user_id = auth.uid()));

-- ===========================================================================
-- Table privileges.
--
-- RLS decides which ROWS a caller may touch, but Postgres GRANTs decide whether
-- the caller may touch the table at all — the two are independent checks. This
-- Supabase build's default privileges give the API roles only REFERENCES/TRIGGER/
-- TRUNCATE on new public tables, so without these grants every query (even from
-- service_role, which bypasses RLS policies but not GRANT checks) fails with
-- "permission denied for table".
--
--   authenticated → CRUD, then narrowed to their own rows by the RLS policies above.
--   service_role  → the trusted server key; bypasses RLS, so it needs full CRUD.
--   anon is intentionally omitted: the whole app is behind Google auth (ADR-0003),
--   so an unauthenticated caller has no business reaching these tables — let it
--   fail closed rather than fall through to an RLS filter.
-- All PKs are uuid defaults, so there are no sequences to grant.
-- ===========================================================================
grant select, insert, update, delete on
  exercises, programs, profiles, workouts, workout_exercises, sessions, session_sets
  to authenticated, service_role;

-- ===========================================================================
-- Indexes (SPEC.md §2).
-- ===========================================================================
create index session_sets_exercise_completed_idx
  on session_sets (exercise_id, completed_at desc);
create index session_sets_session_idx
  on session_sets (session_id);
create index sessions_user_status_idx
  on sessions (user_id, status);
create index sessions_program_completed_idx
  on sessions (program_id, completed_at desc);
create index workout_exercises_workout_position_idx
  on workout_exercises (workout_id, position);
