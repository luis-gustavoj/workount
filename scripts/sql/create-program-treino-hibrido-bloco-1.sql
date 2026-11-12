-- create-program-treino-hibrido-bloco-1.sql
--   Creates the program "Treino Híbrido – Bloco 1" (10 weeks) for one user:
--   three strength workouts (A seg, B qua, C sex) with their prescriptions and
--   two CARDIO workouts (ter esteira, sáb rua), then makes it the user's ACTIVE
--   program.
--
-- REQUIRES migration 0009_cardio.sql (workouts.kind / workouts.notes). The
-- script checks and aborts with a clear message if it hasn't been applied.
--
-- HOW TO RUN
--   Paste the whole file into the Supabase SQL editor (or
--   psql "$DATABASE_URL" -f scripts/sql/create-program-treino-hibrido-bloco-1.sql).
--   Both run as a superuser role, which bypasses RLS — so every row is
--   explicitly attributed to v_user_id below, never to whoever runs it.
--
-- SAFETY
--   - One DO block = one transaction: any error rolls back everything.
--   - Aborts (writes nothing) if the user already has a non-archived program
--     with this name.
--   - Exercises are NOT created. Each name is looked up case-insensitively
--     among the global catalog and the user's own customs (preferring the one
--     already in the user's history). If any is missing the
--     script aborts listing ALL the missing names, and writes nothing.
--   - Weights are not stored anywhere in a prescription (SPEC §2: a prescribed
--     set has no weight). The suggested starting load goes into the exercise
--     note, in kg.
--   - target_sets = WORKING sets only; warm-ups live in the workout note.
--
-- The verification query at the bottom runs after the block; it is read-only.

do $$
declare
  v_user_id      uuid := '3358cc03-148c-48ab-b158-4585e4c67379';
  v_program_name text := 'Treino Híbrido – Bloco 1';
  v_set_active   boolean := true;   -- false = create it without following it

  v_program_id  uuid;
  v_workout_id  uuid;
  v_missing     text;
  w             record;
  r             record;
begin
  -- --- preconditions -------------------------------------------------------
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workouts' and column_name = 'kind'
  ) then
    raise exception 'Migration 0009_cardio.sql is not applied (workouts.kind missing). Apply it first.';
  end if;

  if not exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'User % has no profiles row — sign in once first.', v_user_id;
  end if;

  if exists (
    select 1 from public.programs
    where user_id = v_user_id and name = v_program_name and archived_at is null
  ) then
    raise exception 'User % already has a program named "%". Nothing was written.',
      v_user_id, v_program_name;
  end if;

  -- --- the plan ------------------------------------------------------------
  -- day_of_week: 0=dom 1=seg 2=ter 3=qua 4=qui 5=sex 6=sáb.
  -- Workout positions follow the week: A, corrida ter, B, C, corrida sáb.
  create temp table hw_workouts (
    key text, name text, kind text, day_of_week smallint, position int, notes text
  ) on commit drop;

  insert into hw_workouts values
  ('A', 'A – Superior', 'strength', 1, 0,
   'Aquecimento: 5 min de esteira + 1–2 séries leves. Depois: 15–20 min de corrida leve na esteira (S1–4: 4 min correndo / 1 min caminhando; a partir da S6: contínuo e fácil).'),
  ('T', 'Corrida – Esteira', 'cardio', 2, 1,
   'Esteira, inclinação 1%.' || chr(10) || chr(10)
   || 'S1: 5×(4'' correndo + 1'' caminhando)' || chr(10)
   || 'S2: 4×(6'' + 1'')' || chr(10)
   || 'S3: 3×(8'' + 1'') + 4 acelerações de 20"' || chr(10)
   || 'S4: 2×(12'' + 1'') + 4 acelerações de 20"' || chr(10)
   || 'S5: 20'' fácil (deload)' || chr(10)
   || 'S6: 10'' + 6×(1'' forte + 2'' leve) + 5''' || chr(10)
   || 'S7: 10'' + 8×(1'' forte + 1,5'' leve) + 5''' || chr(10)
   || 'S8: 10'' + 5×(2'' forte + 2'' leve) + 5''' || chr(10)
   || 'S9: 10'' + 6×(2'' forte + 2'' leve) + 5''' || chr(10)
   || 'S10: 20'' fácil + 4 acelerações'),
  ('B', 'B – Inferior', 'strength', 3, 2,
   'Aquecimento: 5 min de caminhada inclinada + 2 séries leves no Hack. Depois: 15 min de caminhada inclinada bem leve (8–12%, 5–5,5 km/h).'),
  ('C', 'C – Corpo inteiro', 'strength', 5, 3,
   'Pernas moderadas (parar com 2–3 reps sobrando) por causa da corrida de sábado. Depois: 15 min de caminhada inclinada.'),
  ('S', 'Corrida – Rua', 'cardio', 6, 4,
   'Rua, ritmo fácil (dá para conversar).' || chr(10) || chr(10)
   || 'S1: 30'' (5'' correndo / 1'' caminhando)' || chr(10)
   || 'S2: 32'' (6/1)' || chr(10)
   || 'S3: 35'' (8/1)' || chr(10)
   || 'S4: 35'' (10/1)' || chr(10)
   || 'S5: 30'' (deload)' || chr(10)
   || 'S6: 35'' contínuo' || chr(10)
   || 'S7: 38''' || chr(10)
   || 'S8: 40''' || chr(10)
   || 'S9: 42''' || chr(10)
   || 'S10: teste de 5 km');

  create temp table hw_exercises (
    workout_key text, position int, exercise text,
    target_sets int, rep_min int, rep_max int, rest_seconds int,
    load_kg numeric, superset text, extra_note text,
    exercise_id uuid
  ) on commit drop;

  -- rest_seconds 0 on the first exercise of a superset pair: rest only after the pair.
  insert into hw_exercises
    (workout_key, position, exercise, target_sets, rep_min, rep_max, rest_seconds,
     load_kg, superset, extra_note)
  values
  ('A', 0, 'Barbell Bench Press',                    3,  6, 10, 150,  80,   null, null),
  ('A', 1, 'Neutral-Grip Lat Pulldown',              3,  8, 12, 120,  60,   null, null),
  ('A', 2, 'Barbell Incline Bench Press',            3,  8, 12, 120,  44,   null, null),
  ('A', 3, 'Smith Machine Row',                      3,  8, 12, 120,  85,   null, null),
  ('A', 4, 'Cable Lateral Raise',                    3, 10, 15,  60,  17.5, null, '+1 série nas semanas 6–9.'),
  ('A', 5, 'Overhead Cable Triceps Extension (Bar)', 2, 10, 15,   0,  47.5, 'A',  '+1 série nas semanas 6–9.'),
  ('A', 6, 'Bayesian Cable Curl',                    2, 10, 15,  60,  22.5, 'A',  '+1 série nas semanas 6–9.'),

  ('B', 0, 'Hack Machine Squat',                     3,  6, 10, 150, 103,   null, null),
  ('B', 1, 'Barbell RDL',                            3,  6, 10, 150,  80,   null, null),
  ('B', 2, 'Leg Press',                              2, 10, 15, 120, 125,   null, null),
  ('B', 3, 'Lying Leg Curl',                         3,  8, 12,  90,  40,   null, null),
  ('B', 4, 'Leg Extension',                          2, 10, 15,  90,  77.5, null, null),
  ('B', 5, 'Standing Calf Raise',                    3,  8, 12,  60,  65,   null, 'Pausa de 1 s embaixo.'),
  ('B', 6, 'Cable Crunch',                           2, 10, 15,  60,  45,   null, null),

  ('C', 0, 'Pull-Up',                                3,  6, 10, 150,  60,   null, null),
  ('C', 1, 'Machine Shoulder Press',                 3,  8, 12, 120,  47.5, null, null),
  ('C', 2, 'Leg Press',                              3, 10, 15, 120, 120,   null, 'Parar com 2–3 reps sobrando.'),
  ('C', 3, 'Chest-Supported Machine Row',            2,  8, 12,  90,  50,   null, null),
  ('C', 4, 'Seated Leg Curl',                        2, 10, 15,  90,  37.5, null, null),
  ('C', 5, 'Machine Flye',                           2, 12, 15,   0,  57.5, 'A',  '+1 série nas semanas 6–9.'),
  ('C', 6, 'High-Cable Lateral Raise',               2, 12, 15,  60,  10,   'A',  null),
  ('C', 7, 'EZ-Bar Cable Curl',                      2, 10, 15,   0,  47.5, 'B',  null),
  ('C', 8, 'Tricep Pushdown',                        2, 10, 15,  60,  52.5, 'B',  null);

  -- --- resolve every exercise up front; abort listing all that are missing ---
  -- A global and a custom can share a name (the unique index is per owner).
  -- Prefer the one the user actually trained with — progress is tracked by
  -- exercise id — then their custom, then the global.
  update hw_exercises h
  set exercise_id = (
    select e.id
    from public.exercises e
    where (e.user_id = v_user_id or e.user_id is null)
      and lower(e.name) = lower(h.exercise)
    order by
      (select max(ss.completed_at)
         from public.session_sets ss
         join public.sessions s on s.id = ss.session_id
        where ss.exercise_id = e.id and s.user_id = v_user_id) desc nulls last,
      (e.user_id is null)
    limit 1
  );

  select string_agg(distinct exercise, ', ' order by exercise) into v_missing
  from hw_exercises where exercise_id is null;

  if v_missing is not null then
    raise exception 'Exercises not found in the catalog or in this user''s customs: %. Nothing was written.',
      v_missing;
  end if;

  -- --- the program ---------------------------------------------------------
  insert into public.programs (user_id, name, description)
  values (
    v_user_id,
    v_program_name,
    '10 semanas. Academia seg (A), qua (B), sex (C); corrida ter (esteira) e sáb (rua).' || chr(10)
    || 'Dupla progressão: quando todas as séries baterem o topo da faixa, subir 2,5–5% de carga.' || chr(10)
    || 'RIR por semana: S1=3, S2–3=2, S4=1 (isoladores 0), S5=deload (metade das séries, RIR 4), '
    || 'S6–7=2, S8–9=1, S10=2–3 (sexta só superiores; sábado teste de 5 km).' || chr(10)
    || 'Nas semanas 6–9, +1 série em: Cable Lateral Raise, Machine Flye, Bayesian Cable Curl, '
    || 'Overhead Cable Triceps Extension (Bar).'
  )
  returning id into v_program_id;

  -- --- workouts and prescriptions -----------------------------------------
  for w in select * from hw_workouts order by position loop
    insert into public.workouts (program_id, name, day_of_week, position, kind, notes)
    values (v_program_id, w.name, w.day_of_week, w.position, w.kind, w.notes)
    returning id into v_workout_id;

    for r in select * from hw_exercises where workout_key = w.key order by position loop
      insert into public.workout_exercises
        (workout_id, exercise_id, position, target_sets, rep_min, rep_max,
         rest_seconds, superset_group, notes)
      values (
        v_workout_id, r.exercise_id, r.position, r.target_sets, r.rep_min, r.rep_max,
        r.rest_seconds, r.superset,
        concat_ws(' ',
          'Carga inicial sugerida: ' || replace(trim_scale(r.load_kg)::text, '.', ',') || ' kg.',
          case when r.superset is not null
            then 'Bi-set ' || r.superset || ': alternar com o par; descanso só depois do par.' end,
          r.extra_note)
      );
    end loop;
  end loop;

  if v_set_active then
    update public.profiles set active_program_id = v_program_id where id = v_user_id;
  end if;

  raise notice 'Program "%" created: %', v_program_name, v_program_id;
end;
$$;

-- --- verification (read-only) -----------------------------------------------
-- One row per workout, then one per prescribed exercise.
select
  w.position,
  w.name                              as workout,
  w.kind,
  w.day_of_week,
  count(we.id)                        as exercises,
  coalesce(sum(we.target_sets), 0)    as working_sets
from public.programs p
join public.workouts w on w.program_id = p.id
left join public.workout_exercises we on we.workout_id = w.id
where p.user_id = '3358cc03-148c-48ab-b158-4585e4c67379'
  and p.name = 'Treino Híbrido – Bloco 1'
  and p.archived_at is null
group by w.id
order by w.position;

select
  w.name          as workout,
  we.position,
  e.name          as exercise,
  we.target_sets,
  we.rep_min || '–' || we.rep_max as reps,
  we.rest_seconds,
  we.superset_group,
  we.notes
from public.programs p
join public.workouts w on w.program_id = p.id
join public.workout_exercises we on we.workout_id = w.id
join public.exercises e on e.id = we.exercise_id
where p.user_id = '3358cc03-148c-48ab-b158-4585e4c67379'
  and p.name = 'Treino Híbrido – Bloco 1'
  and p.archived_at is null
order by w.position, we.position;
