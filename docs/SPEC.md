# Workount — Specification

A mobile-first web app for tracking strength-training **programs** and **sessions**, installed to a phone home screen and used in the gym.

Read [CONTEXT.md](CONTEXT.md) first — it defines every term used below. In particular, **workout** (the plan) and **session** (the performance) are different things throughout.

**Decisions that shape everything, recorded separately:**
[ADR-0001](adr/0001-offline-first-session-player.md) offline-first session ·
[ADR-0002](adr/0002-sessions-snapshot-their-prescription.md) prescription snapshots ·
[ADR-0003](adr/0003-google-only-auth.md) Google-only auth ·
[ADR-0004](adr/0004-analytics-are-scoped-to-a-program.md) per-program analytics

---

## 1. Stack

| | |
|---|---|
| Framework | Next.js (App Router, TypeScript), `src/` layout |
| Styling | Tailwind + shadcn/ui |
| Data | Supabase Postgres, RLS on every table |
| Auth | Supabase Auth, Google OAuth only |
| Client state | Zustand, persisted to IndexedDB via `idb-keyval` |
| Charts | Recharts |
| Validation | Zod, at every Server Action boundary |
| Tests | Vitest (units), Playwright (E2E) |
| Deploy | Vercel + Supabase cloud |

**Units.** Weights are stored as `numeric(6,2)` in **kilograms, always**. `profiles.weight_unit` is a *display* preference; conversion happens at the edge, never in the database. Storing mixed units is how you end up with a 225kg bench.

---

## 2. Data model

```sql
profiles
  id                  uuid PK → auth.users(id) ON DELETE CASCADE
  display_name        text
  avatar_url          text
  active_program_id   uuid NULL → programs(id) ON DELETE SET NULL
  default_rest_seconds int NOT NULL DEFAULT 90
  weight_unit         text NOT NULL DEFAULT 'kg'   -- 'kg' | 'lb' (display only)
  created_at          timestamptz NOT NULL DEFAULT now()

exercises
  id            uuid PK DEFAULT gen_random_uuid()
  user_id       uuid NULL → auth.users(id) ON DELETE CASCADE  -- NULL = global/seeded
  name          text NOT NULL
  muscle_group  text NOT NULL     -- chest|back|shoulders|quads|hamstrings|glutes|biceps|triceps|core|calves|other
  equipment     text NOT NULL     -- barbell|dumbbell|machine|cable|bodyweight|kettlebell|other
  created_at    timestamptz NOT NULL DEFAULT now()
  -- a user may not create two exercises with the same name; globals are unique among themselves
  UNIQUE NULLS NOT DISTINCT (user_id, lower(name))

programs
  id           uuid PK
  user_id      uuid NOT NULL → auth.users(id) ON DELETE CASCADE
  name         text NOT NULL
  description  text
  archived_at  timestamptz NULL
  created_at   timestamptz NOT NULL DEFAULT now()

workouts                          -- a DAY within a program. A plan, not a performance.
  id            uuid PK
  program_id    uuid NOT NULL → programs(id) ON DELETE CASCADE
  name          text NOT NULL              -- "Push A"
  day_of_week   smallint NULL              -- 0=Sun … 6=Sat. NULL = unscheduled.
  position      int NOT NULL
  created_at    timestamptz NOT NULL DEFAULT now()
  CHECK (day_of_week BETWEEN 0 AND 6)

workout_exercises                 -- the PRESCRIPTION
  id              uuid PK
  workout_id      uuid NOT NULL → workouts(id) ON DELETE CASCADE
  exercise_id     uuid NOT NULL → exercises(id) ON DELETE RESTRICT
  position        int NOT NULL
  target_sets     int NOT NULL CHECK (target_sets BETWEEN 1 AND 20)
  rep_min         int NOT NULL CHECK (rep_min >= 1)
  rep_max         int NOT NULL CHECK (rep_max >= rep_min)
  rest_seconds    int NULL       -- NULL → falls back to profiles.default_rest_seconds
  notes           text
  superset_group  text NULL      -- 'A','B',… peers alternate. NULL = performed straight.
  created_at      timestamptz NOT NULL DEFAULT now()

sessions                          -- the PERFORMANCE
  id                uuid PK        -- CLIENT-GENERATED. Enables idempotent commit.
  user_id           uuid NOT NULL → auth.users(id) ON DELETE CASCADE
  program_id        uuid NOT NULL → programs(id) ON DELETE CASCADE
  workout_id        uuid NULL → workouts(id) ON DELETE SET NULL
  status            text NOT NULL CHECK (status IN ('active','completed','abandoned'))
  started_at        timestamptz NOT NULL
  completed_at      timestamptz NULL
  duration_seconds  int NULL
  notes             text

session_sets                      -- one performed set. Self-describing — see ADR-0002.
  id                   uuid PK
  session_id           uuid NOT NULL → sessions(id) ON DELETE CASCADE
  exercise_id          uuid NOT NULL → exercises(id) ON DELETE RESTRICT   -- denormalized
  workout_exercise_id  uuid NULL → workout_exercises(id) ON DELETE SET NULL  -- convenience only
  position             int NOT NULL     -- exercise order within the session
  set_number           int NOT NULL     -- 1-based, within the exercise
  weight               numeric(6,2) NOT NULL CHECK (weight >= 0)   -- ALWAYS kg
  reps                 int NOT NULL CHECK (reps >= 0)
  is_warmup            boolean NOT NULL DEFAULT false
  rpe                  numeric(3,1) NULL CHECK (rpe BETWEEN 1 AND 10)
  target_rep_min       int NULL         -- SNAPSHOT of the prescription, at performance time
  target_rep_max       int NULL
  completed_at         timestamptz NOT NULL
```

**Indexes.** `session_sets(exercise_id, completed_at DESC)` and `session_sets(session_id)`; `sessions(user_id, status)` and `sessions(program_id, completed_at DESC)`; `workout_exercises(workout_id, position)`.

### RLS — on every table, from the first migration

Never "add it later"; later means shipping a table that leaks.

- `programs`, `sessions` → `user_id = auth.uid()` for all commands.
- `workouts`, `workout_exercises`, `session_sets` → gate via a join to the owning parent. (`session_sets` must gate through `sessions`, *not* through `exercises` — a set references a global exercise, and global exercises are readable by everyone.)
- `exercises` → `SELECT` where `user_id IS NULL OR user_id = auth.uid()`; `INSERT/UPDATE/DELETE` only where `user_id = auth.uid()` (nobody may edit the global catalog).
- `profiles` → `id = auth.uid()`.

### Invariants

1. **Exactly one active program.** Setting `profiles.active_program_id` replaces the previous value. Enforced by the Server Action, which writes a single column — the schema makes >1 unrepresentable.
2. **A completed session is immutable.** No UPDATE path to `session_sets` for a session whose status is `completed`.
3. **Warmups never count** — excluded from volume, e1RM and PRs, everywhere, without exception.
4. **Editing or deleting a program cannot alter history.** Guaranteed by ADR-0002's snapshotting.

---

## 3. Database functions

### `get_last_performance(p_program_id uuid, p_exercise_ids uuid[]) → setof …`

For each supplied exercise, return the performed sets (`set_number`, `weight`, `reps`) from **the most recent `completed` session in that program** that included it. Working sets only.

Powers the *"Last time: 80×8, 80×8, 77.5×7"* reference. It is **fetched once at session start** and cached in the bundle — never called mid-session, because mid-session there is no network ([ADR-0001](adr/0001-offline-first-session-player.md)).

Note the per-exercise independence: if you skipped bench last week but did it the week before, bench's reference comes from two weeks ago while squat's comes from last week. It is *the last time you did **this exercise***, not *the last session*.

### `commit_session(p_payload jsonb) → uuid`

The **only** write path for a finished session. Takes the whole session and all its sets, inserts them **in one transaction**, and **upserts on the client-generated `sessions.id`** so a retry after a flaky response cannot double-write. Rejects a payload whose `user_id` isn't `auth.uid()`. `SECURITY INVOKER` so RLS still applies.

### `duplicate_program(p_program_id uuid, p_new_name text) → uuid`

Deep-copies program → workouts → workout_exercises under a new name. **Does not copy sessions** — history stays attached to the original ([ADR-0002](adr/0002-sessions-snapshot-their-prescription.md)). This is how a user iterates ("PPL v2") without blurring the analytics of what they already did.

### The analytics functions

All three are program-scoped ([ADR-0004](adr/0004-analytics-are-scoped-to-a-program.md)), `SECURITY INVOKER`, and count **working sets only**. A borrowed `program_id` returns zero rows — RLS, not an app-level check.

- `get_program_volume(p_program_id) → …` — volume per **completed** session, chronological. A projection of `v_session_summary`, so /history and the chart cannot disagree. A session of nothing but warmups appears with volume 0 rather than vanishing.
- `get_exercise_progression(p_program_id, p_exercise_id) → …` — per completed session: the top set (weight × reps) and the best e1RM, which are frequently different sets. Chronological.
- `get_program_adherence(p_program_id) → …` — completed sessions vs scheduled workouts, per ISO week, contiguous so a skipped week is a zero rather than a missing row. Workouts with no `day_of_week` are not obligations and stay out of the denominator. Not capped at 1.0. The denominator is the program's *current* workout count, applied to every past week — workouts are mutable and keep no history, so editing a program rewrites its past adherence.

### Views

- `v_session_summary` — per session: duration, total volume, set count, exercise count.
- `v_exercise_prs` — per (user, exercise): heaviest set, best e1RM, best reps-at-weight, each with the `session_id` it happened in. Keyed by exercise rather than by program, as `get_session_prs` already is — the reps kind is implemented as *most reps in a working set*, not a per-weight breakdown, because a per-weight breakdown does not fit one row per exercise.

---

## 4. Screens

### `/` — Home

The default screen, and the one the user sees most. It answers exactly one question: **"what do I do right now?"** Resolved in strict priority order:

1. **A draft exists in IndexedDB** → *"Session in progress — 34 min"*, primary action **Resume**. Nothing else competes for attention.
2. **The active program has a workout for today's `day_of_week`, and no `completed` session for it today** → *"Today: Push A"*, with the exercise list previewed, primary action **Start workout**.
3. **Otherwise** → *"Rest day"*, showing the next scheduled workout, plus a secondary **Start any workout** escape hatch (people train off-schedule constantly; do not force them to lie to the app).

Below the fold: current streak, and the last 3 sessions.

**Edge case that must be handled:** no active program at all (new user) → an empty state pointing at program creation, not a blank screen.

### `/programs` · `/programs/new` · `/programs/[id]`

List of programs, each showing whether it's the **active** one. `/programs/[id]` shows its workouts in `position` order, with **Follow this program** (sets `active_program_id`), **Duplicate**, **Archive**.

### `/programs/[id]/workouts/[workoutId]` — Workout builder

Edit the prescription: add exercises from a searchable catalog (with inline *"create custom exercise"*), set `target_sets`, `rep_min`–`rep_max`, optional `rest_seconds`, optional `notes`. Drag to reorder. Assign a `superset_group`.

### `/session` — The session player

**The heart of the app.** Everything else exists to serve this screen. It is used one-handed, sweaty, mid-set, possibly with a barbell nearby. Design accordingly: large tap targets, no fiddly controls, nothing that requires precision.

**Start** (needs network, one round trip): generate the session `id` client-side → fetch the **bundle** (prescription + exercise metadata + `get_last_performance`) → write to IndexedDB → best-effort `INSERT sessions (status='active')`.

**During** (zero network):
- Current exercise: name, prescribed sets × rep range, notes, and per set the **last performance** reference.
- Log actual weight + reps per set. Add extra sets beyond the target. Mark a set as **warmup**.
- Supersets alternate between peers in the group.
- **Rest timer** auto-starts on logging a set. Default `rest_seconds ?? 90`. ±15s buttons. Vibrate + sound on zero. Stored as **`restEndsAt` (epoch ms)**, *never* a decrementing counter — a counter drifts or freezes when the screen locks, which is exactly when it's running.
- **Every state change writes through to IndexedDB.** A browser kill mid-session must lose nothing.

**Finish**: `commit_session` → clear the draft. On failure, **keep the draft** and show a retry banner. Never destroy the local copy until the server has confirmed.

### `/history` · `/history/[id]`

List (date, workout name, duration, volume) and detail (every set, PRs badged).

### `/programs/[id]/analytics`

Per [ADR-0004](adr/0004-analytics-are-scoped-to-a-program.md): volume over time, per-exercise e1RM progression, PRs, adherence. Aggregated in Postgres, rendered with Recharts.

---

## 5. Non-functional

- **Mobile-first.** Designed at 390px. Desktop is a courtesy, not a target.
- **PWA.** Installable to the home screen, standalone display, service worker caching the app shell so it opens instantly with no signal.
- **Forgot-to-finish reminder.** `pg_cron` finds sessions still `active` after 3 hours and sends a Web Push. For users who declined push: on next open, a stale draft prompts *Resume / Finish / Discard*.
- **Accessibility.** Session player controls ≥ 44px. Rest timer must not rely on colour alone.

---

## 6. Acceptance

The MVP is done when this passes **on a phone, in a gym, with airplane mode on**:

1. Sign in with Google.
2. Build a 3-day PPL program with rep ranges, rest overrides, and one superset.
3. Follow it. On Monday, home says *"Today: Push A"*.
4. Start the session. **Enable airplane mode.**
5. Log every set. See *"last time"* next to each. Use the rest timer; adjust it ±15s.
6. **Kill the browser entirely. Reopen.** The session is exactly where you left it.
7. Disable airplane mode. Finish. One `sessions` row, N `session_sets` rows.
8. History shows it. Analytics shows the volume point and the e1RM move.

Step 6 is the one that matters. If it fails, nothing else does.
