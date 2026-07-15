-- seed.sql — the global exercise catalog (ticket 004).
--
-- Loaded by `supabase db reset` after the migrations. Every row here is a
-- GLOBAL exercise: user_id IS NULL, readable by everyone, editable by no one
-- (RLS from 0001_init.sql — the exercises_insert/update/delete policies all
-- require user_id = auth.uid(), which NULL never satisfies).
--
-- Two rules this file must honour, both from the ticket:
--
--   1. Stable, hardcoded UUIDs — never gen_random_uuid(). A `db reset` must
--      mint the SAME ids every time, or local data that references an exercise
--      (a prescription, a logged set) is orphaned the moment you rebuild.
--
--   2. Idempotent. A bare ON CONFLICT DO NOTHING (no named arbiter) so a re-run
--      is a no-op whether a row collides on the primary key `id` OR on the
--      migration's UNIQUE (user_id, lower(name)) NULLS NOT DISTINCT index.
--      Naming one arbiter would abort the seed if a future edit kept a row's
--      stable id but changed its name (the PK conflict would go uncaught).
--
-- Naming: prefix with the equipment wherever it disambiguates a shared movement
-- ("Barbell Bench Press" vs "Dumbbell Bench Press"), never a bare "Bench Press".
-- The exercise is the identity key for all progress tracking; two rows for the
-- same lift silently split a user's progression chart in two.
--
-- muscle_group / equipment must be drawn from the CHECK-constrained enums in
-- 0001_init.sql. muscle_group is the PRIMARY mover (a movement trains several;
-- we pick one so search and per-muscle grouping are deterministic).
--
-- The UUIDs are a deliberate, human-readable sequence: 00000000-0000-4000-a000-
-- 0000000000NN, NN running 01..3e. Version nibble 4 and variant nibble a keep
-- them valid v4-shaped UUIDs while making seed rows obvious on sight.

insert into exercises (id, user_id, name, muscle_group, equipment) values
  -- ── Barbell ──────────────────────────────────────────────────────────────
  ('00000000-0000-4000-a000-000000000001', null, 'Barbell Back Squat',              'quads',      'barbell'),
  ('00000000-0000-4000-a000-000000000002', null, 'Barbell Front Squat',             'quads',      'barbell'),
  ('00000000-0000-4000-a000-000000000003', null, 'Barbell Bench Press',             'chest',      'barbell'),
  ('00000000-0000-4000-a000-000000000004', null, 'Barbell Incline Bench Press',     'chest',      'barbell'),
  ('00000000-0000-4000-a000-000000000005', null, 'Barbell Close-Grip Bench Press',  'triceps',    'barbell'),
  ('00000000-0000-4000-a000-000000000006', null, 'Barbell Deadlift',                'back',       'barbell'),
  ('00000000-0000-4000-a000-000000000007', null, 'Barbell Romanian Deadlift',       'hamstrings', 'barbell'),
  ('00000000-0000-4000-a000-000000000008', null, 'Barbell Good Morning',            'hamstrings', 'barbell'),
  ('00000000-0000-4000-a000-000000000009', null, 'Barbell Overhead Press',          'shoulders',  'barbell'),
  ('00000000-0000-4000-a000-00000000000a', null, 'Barbell Bent-Over Row',           'back',       'barbell'),
  ('00000000-0000-4000-a000-00000000000b', null, 'Barbell Hip Thrust',              'glutes',     'barbell'),
  ('00000000-0000-4000-a000-00000000000c', null, 'Barbell Curl',                    'biceps',     'barbell'),
  ('00000000-0000-4000-a000-00000000000d', null, 'Barbell Shrug',                   'back',       'barbell'),
  ('00000000-0000-4000-a000-00000000000e', null, 'Barbell Lunge',                   'quads',      'barbell'),

  -- ── Dumbbell ─────────────────────────────────────────────────────────────
  ('00000000-0000-4000-a000-00000000000f', null, 'Dumbbell Bench Press',            'chest',      'dumbbell'),
  ('00000000-0000-4000-a000-000000000010', null, 'Dumbbell Incline Bench Press',    'chest',      'dumbbell'),
  ('00000000-0000-4000-a000-000000000011', null, 'Dumbbell Fly',                    'chest',      'dumbbell'),
  ('00000000-0000-4000-a000-000000000012', null, 'Dumbbell Shoulder Press',         'shoulders',  'dumbbell'),
  ('00000000-0000-4000-a000-000000000013', null, 'Dumbbell Lateral Raise',          'shoulders',  'dumbbell'),
  ('00000000-0000-4000-a000-000000000014', null, 'Dumbbell Rear Delt Fly',          'shoulders',  'dumbbell'),
  ('00000000-0000-4000-a000-000000000015', null, 'Dumbbell Row',                    'back',       'dumbbell'),
  ('00000000-0000-4000-a000-000000000016', null, 'Dumbbell Curl',                   'biceps',     'dumbbell'),
  ('00000000-0000-4000-a000-000000000017', null, 'Dumbbell Hammer Curl',            'biceps',     'dumbbell'),
  ('00000000-0000-4000-a000-000000000018', null, 'Dumbbell Overhead Tricep Extension', 'triceps', 'dumbbell'),
  ('00000000-0000-4000-a000-000000000019', null, 'Dumbbell Bulgarian Split Squat',  'quads',      'dumbbell'),
  ('00000000-0000-4000-a000-00000000001a', null, 'Dumbbell Romanian Deadlift',      'hamstrings', 'dumbbell'),
  ('00000000-0000-4000-a000-00000000001b', null, 'Dumbbell Lunge',                  'quads',      'dumbbell'),
  ('00000000-0000-4000-a000-00000000001c', null, 'Dumbbell Goblet Squat',           'quads',      'dumbbell'),

  -- ── Machine & cable ──────────────────────────────────────────────────────
  ('00000000-0000-4000-a000-00000000001d', null, 'Lat Pulldown',                    'back',       'cable'),
  ('00000000-0000-4000-a000-00000000001e', null, 'Seated Cable Row',                'back',       'cable'),
  ('00000000-0000-4000-a000-00000000001f', null, 'Chest-Supported Row',             'back',       'machine'),
  ('00000000-0000-4000-a000-000000000020', null, 'Leg Press',                       'quads',      'machine'),
  ('00000000-0000-4000-a000-000000000021', null, 'Hack Squat',                      'quads',      'machine'),
  ('00000000-0000-4000-a000-000000000022', null, 'Leg Extension',                   'quads',      'machine'),
  ('00000000-0000-4000-a000-000000000023', null, 'Leg Curl',                        'hamstrings', 'machine'),
  ('00000000-0000-4000-a000-000000000024', null, 'Machine Chest Press',             'chest',      'machine'),
  ('00000000-0000-4000-a000-000000000025', null, 'Pec Deck',                        'chest',      'machine'),
  ('00000000-0000-4000-a000-000000000026', null, 'Cable Fly',                       'chest',      'cable'),
  ('00000000-0000-4000-a000-000000000027', null, 'Machine Shoulder Press',          'shoulders',  'machine'),
  ('00000000-0000-4000-a000-000000000028', null, 'Cable Lateral Raise',             'shoulders',  'cable'),
  ('00000000-0000-4000-a000-000000000029', null, 'Face Pull',                       'shoulders',  'cable'),
  ('00000000-0000-4000-a000-00000000002a', null, 'Tricep Pushdown',                 'triceps',    'cable'),
  ('00000000-0000-4000-a000-00000000002b', null, 'Cable Overhead Tricep Extension', 'triceps',    'cable'),
  ('00000000-0000-4000-a000-00000000002c', null, 'Cable Curl',                      'biceps',     'cable'),
  ('00000000-0000-4000-a000-00000000002d', null, 'Preacher Curl',                   'biceps',     'machine'),
  ('00000000-0000-4000-a000-00000000002e', null, 'Hip Abduction Machine',           'glutes',     'machine'),

  -- ── Bodyweight ───────────────────────────────────────────────────────────
  ('00000000-0000-4000-a000-00000000002f', null, 'Pull-Up',                         'back',       'bodyweight'),
  ('00000000-0000-4000-a000-000000000030', null, 'Chin-Up',                         'back',       'bodyweight'),
  ('00000000-0000-4000-a000-000000000031', null, 'Inverted Row',                    'back',       'bodyweight'),
  ('00000000-0000-4000-a000-000000000032', null, 'Dip',                             'chest',      'bodyweight'),
  ('00000000-0000-4000-a000-000000000033', null, 'Push-Up',                         'chest',      'bodyweight'),
  ('00000000-0000-4000-a000-000000000034', null, 'Bodyweight Squat',                'quads',      'bodyweight'),
  ('00000000-0000-4000-a000-000000000035', null, 'Plank',                           'core',       'bodyweight'),
  ('00000000-0000-4000-a000-000000000036', null, 'Hanging Leg Raise',               'core',       'bodyweight'),
  ('00000000-0000-4000-a000-000000000037', null, 'Crunch',                          'core',       'bodyweight'),
  ('00000000-0000-4000-a000-000000000038', null, 'Russian Twist',                   'core',       'bodyweight'),
  ('00000000-0000-4000-a000-000000000039', null, 'Back Extension',                  'back',       'bodyweight'),

  -- ── Other ────────────────────────────────────────────────────────────────
  ('00000000-0000-4000-a000-00000000003a', null, 'Standing Calf Raise',             'calves',     'machine'),
  ('00000000-0000-4000-a000-00000000003b', null, 'Seated Calf Raise',               'calves',     'machine'),
  ('00000000-0000-4000-a000-00000000003c', null, 'Kettlebell Swing',                'glutes',     'kettlebell'),
  ('00000000-0000-4000-a000-00000000003d', null, 'Kettlebell Goblet Squat',         'quads',      'kettlebell'),
  ('00000000-0000-4000-a000-00000000003e', null, 'Farmers Carry',                   'other',      'other')
on conflict do nothing;
