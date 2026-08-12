/**
 * seed-synthetic.ts — an 8-week synthetic training block with
 * HAND-CALCULATED expected values (ticket 017).
 *
 * SQL aggregation is much harder to unit-test than TypeScript, and "the chart
 * looks plausible" is not a test: a volume figure that is 15% too high
 * because warmups slipped in looks entirely plausible. So this module keeps
 * two things deliberately apart:
 *
 *   * the FIXTURE — generated from a progression formula, so it reads like a
 *     real block rather than a pile of magic rows;
 *   * the EXPECTATIONS — literal numbers, arithmetic shown in comments,
 *     written out by hand. They are never recomputed from the fixture, which
 *     would make the assertions circular and prove nothing.
 *
 * scripts/test-analytics.ts asserts the second against the first through
 * Postgres. Run this file directly to plant the same block in a real account
 * so the ticket-018 charts have something to draw:
 *
 *   npm run seed:synthetic -- someone@example.com
 *
 * ---------------------------------------------------------------------------
 * The block
 * ---------------------------------------------------------------------------
 * Program "Synthetic 8-Week Block", three workouts:
 *   A "Squat Day"   — Monday   (day_of_week 1)   scheduled
 *   B "Bench Day"   — Thursday (day_of_week 4)   scheduled
 *   C "Optional Arms" — no day_of_week           NOT scheduled, so it must
 *                       not inflate the adherence denominator.
 *
 * Eight weeks, week 6 skipped entirely (life happens — and a skipped week
 * must show up as a zero, not as a missing row). Weeks are anchored so that
 * week 8 is *last* week, which leaves the current week trailing with no
 * sessions in it: adherence must report it as 0/2 rather than stopping at
 * the last week the user trained.
 *
 * Squat Day  : warmup 40 × 10, then 3 × (100 + 2.5·(w-1)) × 5
 *              week 1 also gets a 110 × 3 opener.
 * Bench Day  : warmup 20 × 20, then 3 × (60 + 2.5·(w-1)) × 8
 *              week 5 also gets a 50 × 15 back-off set.
 *
 * Three traps are built in on purpose:
 *
 *   1. WARMUP-ONLY SESSION (week 4, Saturday): two 40 × 10 warmup squats and
 *      nothing else. Volume must be 0, it must produce no PR, and it must
 *      contribute no row to the squat progression — but it IS a completed
 *      session, so adherence counts it. That asymmetry is the definition
 *      talking: adherence counts sessions, volume counts working sets.
 *   2. ABANDONED SESSION (week 3, Wednesday): a 200 × 5 squat. 200kg would
 *      dominate every PR and spike every chart if `status` were ignored.
 *   3. THE WARMUPS THEMSELVES. The 40 × 10 squat warmup out-reps every
 *      working squat set (which are all 5s), and the 20 × 20 bench warmup
 *      out-reps everything anyone has ever done. If warmups leak into the
 *      "best reps at a given weight" PR, both PRs become the warmup, loudly.
 */
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { resolveConfig } from "./local-stack";

// ---------------------------------------------------------------------------
// Fixture shape
// ---------------------------------------------------------------------------

export type ExerciseKey = "squat" | "bench";

export type SyntheticSet = {
  exercise: ExerciseKey;
  setNumber: number;
  weight: number;
  reps: number;
  isWarmup: boolean;
};

export type SyntheticSession = {
  /** Stable handle for assertions, e.g. "w1A", "w4-warmup-only". */
  key: string;
  week: number;
  /** Days after that week's Monday: 0 = Mon, 3 = Thu, 5 = Sat. */
  dayOffset: number;
  /** Which workout of the program this performed; null = off-schedule. */
  workout: "A" | "B" | null;
  status: "completed" | "abandoned";
  sets: SyntheticSet[];
};

/** Weeks 1–8 with week 6 skipped. */
const WEEKS = [1, 2, 3, 4, 5, 7, 8] as const;

const SQUAT_WEIGHT = (w: number) => 100 + 2.5 * (w - 1);
const BENCH_WEIGHT = (w: number) => 60 + 2.5 * (w - 1);

function squatDay(week: number): SyntheticSession {
  const weight = SQUAT_WEIGHT(week);
  const sets: SyntheticSet[] = [
    { exercise: "squat", setNumber: 1, weight: 40, reps: 10, isWarmup: true },
    { exercise: "squat", setNumber: 2, weight, reps: 5, isWarmup: false },
    { exercise: "squat", setNumber: 3, weight, reps: 5, isWarmup: false },
    { exercise: "squat", setNumber: 4, weight, reps: 5, isWarmup: false },
  ];
  // Week 1's heavy triple. 100 × 5 → e1RM 116.67, 110 × 3 → 121.0: the triple
  // is the stronger set despite being three fewer reps, which is the entire
  // reason the progression chart plots e1RM and not raw weight.
  if (week === 1) {
    sets.push({ exercise: "squat", setNumber: 5, weight: 110, reps: 3, isWarmup: false });
  }
  return { key: `w${week}A`, week, dayOffset: 0, workout: "A", status: "completed", sets };
}

function benchDay(week: number): SyntheticSession {
  const weight = BENCH_WEIGHT(week);
  const sets: SyntheticSet[] = [
    { exercise: "bench", setNumber: 1, weight: 20, reps: 20, isWarmup: true },
    { exercise: "bench", setNumber: 2, weight, reps: 8, isWarmup: false },
    { exercise: "bench", setNumber: 3, weight, reps: 8, isWarmup: false },
    { exercise: "bench", setNumber: 4, weight, reps: 8, isWarmup: false },
  ];
  // Week 5's back-off set: the most reps ever done on bench in a working set,
  // at a weight nowhere near the heaviest. It is what makes the three PR
  // kinds land in two different sessions instead of collapsing into one.
  if (week === 5) {
    sets.push({ exercise: "bench", setNumber: 5, weight: 50, reps: 15, isWarmup: false });
  }
  return { key: `w${week}B`, week, dayOffset: 3, workout: "B", status: "completed", sets };
}

const ALL_SESSIONS: SyntheticSession[] = [
  ...WEEKS.flatMap((w) => [squatDay(w), benchDay(w)]),
  {
    // Trap 1 — warmed up, tweaked something, went home.
    key: "w4-warmup-only",
    week: 4,
    dayOffset: 5,
    workout: null,
    status: "completed",
    sets: [
      { exercise: "squat", setNumber: 1, weight: 40, reps: 10, isWarmup: true },
      { exercise: "squat", setNumber: 2, weight: 40, reps: 10, isWarmup: true },
    ],
  },
  {
    // Trap 2 — a monstrous lift in a session the user walked away from.
    key: "w3-abandoned",
    week: 3,
    dayOffset: 2,
    workout: "A",
    status: "abandoned",
    sets: [{ exercise: "squat", setNumber: 1, weight: 200, reps: 5, isWarmup: false }],
  },
];

/** Chronological, so the expectation lists can be compared positionally. */
export const SYNTHETIC_SESSIONS: SyntheticSession[] = [...ALL_SESSIONS].sort(
  (a, b) => a.week - b.week || a.dayOffset - b.dayOffset,
);

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Monday 00:00 UTC of the ISO week containing `d`. UTC on purpose: the SQL
 * truncates weeks in UTC too (`at time zone 'UTC'` before date_trunc), so the
 * fixture and the aggregate agree on where a week starts regardless of where
 * the test is run from.
 */
function mondayUtc(d: Date): Date {
  const out = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  const shift = (out.getUTCDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0
  out.setUTCDate(out.getUTCDate() - shift);
  return out;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Monday of fixture week 1. Week 8 lands on *last* week, so the current week
 * is left empty — which is what proves adherence reports the present week as
 * a zero instead of ending at the last week the user trained.
 */
export function week1Monday(now: Date = new Date()): Date {
  return new Date(mondayUtc(now).getTime() - 56 * DAY_MS);
}

/** When a session finished: 18:00 UTC on its day. Started an hour earlier. */
export function sessionCompletedAt(s: SyntheticSession, anchor: Date): Date {
  const day = new Date(anchor.getTime() + ((s.week - 1) * 7 + s.dayOffset) * DAY_MS);
  day.setUTCHours(18, 0, 0, 0);
  return day;
}

export const SESSION_DURATION_SECONDS = 3600;

// ---------------------------------------------------------------------------
// Expected values — hand-calculated. Do not derive these from the fixture.
// ---------------------------------------------------------------------------

/**
 * get_program_volume: one row per COMPLETED session, chronological.
 * The week-3 abandoned session is absent; the warmup-only session is present
 * with 0.
 *
 *   w1A  3 × 100 × 5 = 1500, + 110 × 3 = 330            → 1830
 *   w1B  3 ×  60 × 8                                    → 1440
 *   w2A  3 × 102.5 × 5                                  → 1537.5
 *   w2B  3 ×  62.5 × 8                                  → 1500
 *   w3A  3 × 105 × 5                                    → 1575
 *   w3B  3 ×  65 × 8                                    → 1560
 *   w4A  3 × 107.5 × 5                                  → 1612.5
 *   w4B  3 ×  67.5 × 8                                  → 1620
 *   w4   warmup-only                                    → 0
 *   w5A  3 × 110 × 5                                    → 1650
 *   w5B  3 ×  70 × 8 = 1680, + 50 × 15 = 750            → 2430
 *   w7A  3 × 115 × 5                                    → 1725
 *   w7B  3 ×  75 × 8                                    → 1800
 *   w8A  3 × 117.5 × 5                                  → 1762.5
 *   w8B  3 ×  77.5 × 8                                  → 1860
 *
 * If the squat warmup (40 × 10 = 400) leaked in, every A row would be 400
 * high and the warmup-only session would read 800 instead of 0.
 */
export const EXPECTED_VOLUME: Array<{ key: string; volume: number }> = [
  { key: "w1A", volume: 1830 },
  { key: "w1B", volume: 1440 },
  { key: "w2A", volume: 1537.5 },
  { key: "w2B", volume: 1500 },
  { key: "w3A", volume: 1575 },
  { key: "w3B", volume: 1560 },
  { key: "w4A", volume: 1612.5 },
  { key: "w4B", volume: 1620 },
  { key: "w4-warmup-only", volume: 0 },
  { key: "w5A", volume: 1650 },
  { key: "w5B", volume: 2430 },
  { key: "w7A", volume: 1725 },
  { key: "w7B", volume: 1800 },
  { key: "w8A", volume: 1762.5 },
  { key: "w8B", volume: 1860 },
];

/** Σ of the column above, added up by hand. */
export const EXPECTED_TOTAL_VOLUME = 23902.5;

/**
 * get_exercise_progression(squat): one row per completed session containing a
 * WORKING squat set. Seven rows — the warmup-only session contributes none
 * (nothing was performed) and the abandoned one is excluded.
 *
 * e1RM = weight × (1 + reps/30). For a 5: × 35/30 = × 7/6.
 *   w1  top set is the 110 × 3 opener, not the 100 × 5 work:
 *       100 × 35/30 = 116.6667 vs 110 × 33/30 = 121.0 → best is 121.0
 *   w2  102.5 × 7/6 = 119.5833
 *   w3  105   × 7/6 = 122.5
 *   w4  107.5 × 7/6 = 125.4167
 *   w5  110   × 7/6 = 128.3333
 *   w7  115   × 7/6 = 134.1667
 *   w8  117.5 × 7/6 = 137.0833
 */
export type ProgressionExpectation = {
  key: string;
  topSetWeight: number;
  topSetReps: number;
  bestE1rm: number;
};

export const EXPECTED_SQUAT_PROGRESSION: ProgressionExpectation[] = [
  { key: "w1A", topSetWeight: 110, topSetReps: 3, bestE1rm: 121.0 },
  { key: "w2A", topSetWeight: 102.5, topSetReps: 5, bestE1rm: 119.58 },
  { key: "w3A", topSetWeight: 105, topSetReps: 5, bestE1rm: 122.5 },
  { key: "w4A", topSetWeight: 107.5, topSetReps: 5, bestE1rm: 125.42 },
  { key: "w5A", topSetWeight: 110, topSetReps: 5, bestE1rm: 128.33 },
  { key: "w7A", topSetWeight: 115, topSetReps: 5, bestE1rm: 134.17 },
  { key: "w8A", topSetWeight: 117.5, topSetReps: 5, bestE1rm: 137.08 },
];

/**
 * get_exercise_progression(bench). e1RM for an 8: × 38/30 = × 19/15.
 *   w1  60   × 19/15 = 76.0
 *   w2  62.5 × 19/15 = 79.1667
 *   w3  65   × 19/15 = 82.3333
 *   w4  67.5 × 19/15 = 85.5
 *   w5  70   × 19/15 = 88.6667 — the 50 × 15 back-off scores 75.0 and loses,
 *       and 70 is still the top set weight.
 *   w7  75   × 19/15 = 95.0
 *   w8  77.5 × 19/15 = 98.1667
 *
 * Every row would be wrong if the 20 × 20 warmup counted: its e1RM is
 * 20 × 50/30 = 33.3, harmless — but its 20 reps poison the reps PR below.
 */
export const EXPECTED_BENCH_PROGRESSION: ProgressionExpectation[] = [
  { key: "w1B", topSetWeight: 60, topSetReps: 8, bestE1rm: 76.0 },
  { key: "w2B", topSetWeight: 62.5, topSetReps: 8, bestE1rm: 79.17 },
  { key: "w3B", topSetWeight: 65, topSetReps: 8, bestE1rm: 82.33 },
  { key: "w4B", topSetWeight: 67.5, topSetReps: 8, bestE1rm: 85.5 },
  { key: "w5B", topSetWeight: 70, topSetReps: 8, bestE1rm: 88.67 },
  { key: "w7B", topSetWeight: 75, topSetReps: 8, bestE1rm: 95.0 },
  { key: "w8B", topSetWeight: 77.5, topSetReps: 8, bestE1rm: 98.17 },
];

/**
 * v_exercise_prs. Squat's three kinds all land in week 8 (a clean linear
 * block does that); bench's reps PR lands in week 5, four weeks before its
 * other two, which is the case that proves the three kinds are tracked
 * separately rather than being three views of one "best set".
 *
 * The reps PRs are the load-bearing assertions:
 *   squat 5 @ 117.5 — NOT 10 @ 40 (the warmup), and NOT 5 @ 200 (abandoned).
 *   bench 15 @ 50   — NOT 20 @ 20 (the warmup).
 */
export const EXPECTED_PRS: Record<
  ExerciseKey,
  {
    heaviestWeight: number;
    heaviestReps: number;
    heaviestSessionKey: string;
    bestE1rm: number;
    bestE1rmSessionKey: string;
    mostReps: number;
    mostRepsWeight: number;
    mostRepsSessionKey: string;
  }
> = {
  squat: {
    heaviestWeight: 117.5,
    heaviestReps: 5,
    heaviestSessionKey: "w8A",
    bestE1rm: 137.08, // 117.5 × 7/6
    bestE1rmSessionKey: "w8A",
    mostReps: 5,
    mostRepsWeight: 117.5,
    mostRepsSessionKey: "w8A",
  },
  bench: {
    heaviestWeight: 77.5,
    heaviestReps: 8,
    heaviestSessionKey: "w8B",
    bestE1rm: 98.17, // 77.5 × 19/15
    bestE1rmSessionKey: "w8B",
    mostReps: 15,
    mostRepsWeight: 50,
    mostRepsSessionKey: "w5B",
  },
};

/**
 * get_program_adherence. Two scheduled workouts per week ("Optional Arms" has
 * no day_of_week, so it is not an obligation and must not appear in the
 * denominator). Nine contiguous rows: fixture weeks 1–8 plus the current
 * week, which the user has not trained in yet.
 *
 *   w1 2/2  w2 2/2
 *   w3 2/2  — three sessions happened that week, but one was ABANDONED.
 *   w4 3/2  — the warmup-only session counts here: adherence counts
 *             sessions, not volume. 1.5, not capped to 1.0; flattening it
 *             would hide the extra session.
 *   w5 2/2
 *   w6 0/2  — the skipped week, present as a zero rather than missing.
 *   w7 2/2  w8 2/2
 *   w9 0/2  — the current week, still empty.
 *
 * 2+2+2+3+2+0+2+2+0 = 15 completed sessions, matching EXPECTED_VOLUME's row
 * count.
 */
export const EXPECTED_ADHERENCE: Array<{
  weekIndex: number;
  completed: number;
  scheduled: number;
  adherence: number;
}> = [
  { weekIndex: 1, completed: 2, scheduled: 2, adherence: 1 },
  { weekIndex: 2, completed: 2, scheduled: 2, adherence: 1 },
  { weekIndex: 3, completed: 2, scheduled: 2, adherence: 1 },
  { weekIndex: 4, completed: 3, scheduled: 2, adherence: 1.5 },
  { weekIndex: 5, completed: 2, scheduled: 2, adherence: 1 },
  { weekIndex: 6, completed: 0, scheduled: 2, adherence: 0 },
  { weekIndex: 7, completed: 2, scheduled: 2, adherence: 1 },
  { weekIndex: 8, completed: 2, scheduled: 2, adherence: 1 },
  { weekIndex: 9, completed: 0, scheduled: 2, adherence: 0 },
];

/**
 * A second, deliberately tiny program that isolates the Epley formula: two
 * sessions, one set each, nothing else to average against.
 *
 *   100 × 5 → 100 × (1 + 5/30)  = 116.67
 *   110 × 3 → 110 × (1 + 3/30)  = 121.00
 *
 * The triple is the stronger set even though it is 200kg less total volume
 * and two fewer reps. This is the entire reason the progression chart plots
 * e1RM and not raw top-set weight — plotted raw, this pair reads as a 10kg
 * jump; plotted honestly, as a 4.3kg one.
 */
export const EXPECTED_E1RM_REFERENCE: Array<{
  key: string;
  weight: number;
  reps: number;
  e1rm: number;
}> = [
  { key: "ref-100x5", weight: 100, reps: 5, e1rm: 116.67 },
  { key: "ref-110x3", weight: 110, reps: 3, e1rm: 121.0 },
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

export type SeedResult = {
  programId: string;
  exerciseIds: Record<ExerciseKey, string>;
  /** Fixture key → sessions.id, for resolving expectations to rows. */
  sessionIds: Record<string, string>;
  week1Monday: Date;
};

const EXERCISE_NAMES: Record<ExerciseKey, string> = {
  squat: "Back Squat",
  bench: "Bench Press",
};

/**
 * Plant the block in `client`'s account. `client` must be signed in as
 * `userId` — every write goes through RLS, exactly as the app's would.
 *
 * Completed sessions go through commit_session (the only write path for a
 * finished session, ADR-0001/ticket 014), so the fixture exercises the same
 * code the app does. The abandoned session cannot: commit_session hardcodes
 * status 'completed'. It is inserted directly, which is also how the real
 * player creates one — a session row goes in at start and is never committed.
 */
export async function seedSynthetic(
  client: SupabaseClient,
  userId: string,
  opts: { now?: Date } = {},
): Promise<SeedResult> {
  const anchor = week1Monday(opts.now ?? new Date());
  const suffix = randomUUID().slice(0, 8);

  const program = await client
    .from("programs")
    .insert({
      user_id: userId,
      name: `Synthetic 8-Week Block ${suffix}`,
      description: "Generated by scripts/seed-synthetic.ts (ticket 017).",
    })
    .select("id")
    .single();
  if (program.error) throw new Error(`program insert: ${program.error.message}`);
  const programId: string = program.data.id;

  const workouts = await client
    .from("workouts")
    .insert([
      { program_id: programId, name: "Squat Day", day_of_week: 1, position: 0 },
      { program_id: programId, name: "Bench Day", day_of_week: 4, position: 1 },
      // Unscheduled on purpose: it must not count toward adherence.
      { program_id: programId, name: "Optional Arms", day_of_week: null, position: 2 },
    ])
    .select("id, name");
  if (workouts.error) throw new Error(`workout insert: ${workouts.error.message}`);
  const byName = new Map(workouts.data.map((w) => [w.name as string, w.id as string]));
  const workoutIds = {
    A: byName.get("Squat Day")!,
    B: byName.get("Bench Day")!,
    C: byName.get("Optional Arms")!,
  };

  // Custom (user-owned) exercises, uniquified per seed run: the catalog has a
  // unique index on (user_id, lower(name)), so seeding twice into one account
  // would otherwise collide.
  const exerciseIds = {} as Record<ExerciseKey, string>;
  for (const key of ["squat", "bench"] as const) {
    const ex = await client
      .from("exercises")
      .insert({
        user_id: userId,
        name: `${EXERCISE_NAMES[key]} ${suffix}`,
        muscle_group: key === "squat" ? "quads" : "chest",
        equipment: "barbell",
      })
      .select("id")
      .single();
    if (ex.error) throw new Error(`exercise insert (${key}): ${ex.error.message}`);
    exerciseIds[key] = ex.data.id as string;
  }

  const sessionIds: Record<string, string> = {};

  for (const session of SYNTHETIC_SESSIONS) {
    const sessionId = randomUUID();
    sessionIds[session.key] = sessionId;
    const completedAt = sessionCompletedAt(session, anchor);
    const startedAt = new Date(completedAt.getTime() - SESSION_DURATION_SECONDS * 1000);
    const workoutId = session.workout ? workoutIds[session.workout] : null;

    if (session.status === "abandoned") {
      const ins = await client.from("sessions").insert({
        id: sessionId,
        user_id: userId,
        program_id: programId,
        workout_id: workoutId,
        status: "abandoned",
        started_at: startedAt.toISOString(),
        completed_at: null,
        duration_seconds: null,
      });
      if (ins.error) throw new Error(`abandoned session insert: ${ins.error.message}`);

      const setRows = session.sets.map((s) => ({
        session_id: sessionId,
        exercise_id: exerciseIds[s.exercise],
        position: 0,
        set_number: s.setNumber,
        weight: s.weight,
        reps: s.reps,
        is_warmup: s.isWarmup,
        completed_at: completedAt.toISOString(),
      }));
      const setIns = await client.from("session_sets").insert(setRows);
      if (setIns.error) throw new Error(`abandoned sets insert: ${setIns.error.message}`);
      continue;
    }

    const payload = {
      id: sessionId,
      user_id: userId,
      program_id: programId,
      workout_id: workoutId,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_seconds: SESSION_DURATION_SECONDS,
      notes: null,
      sets: session.sets.map((s) => ({
        exercise_id: exerciseIds[s.exercise],
        workout_exercise_id: null,
        position: s.exercise === "squat" ? 0 : 1,
        set_number: s.setNumber,
        weight: s.weight,
        reps: s.reps,
        is_warmup: s.isWarmup,
        rpe: null,
        target_rep_min: s.exercise === "squat" ? 5 : 8,
        target_rep_max: s.exercise === "squat" ? 5 : 10,
        completed_at: completedAt.toISOString(),
      })),
    };
    const commit = await client.rpc("commit_session", { p_payload: payload });
    if (commit.error)
      throw new Error(`commit_session (${session.key}): ${commit.error.message}`);
  }

  return { programId, exerciseIds, sessionIds, week1Monday: anchor };
}

/**
 * Seed the EXPECTED_E1RM_REFERENCE pair: one program, one exercise, two
 * sessions a week apart with a single working set each. Returns the program
 * and exercise to point get_exercise_progression at, plus the session ids in
 * the order the expectations list them.
 */
export async function seedE1rmReference(
  client: SupabaseClient,
  userId: string,
  opts: { now?: Date } = {},
): Promise<{ programId: string; exerciseId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const now = opts.now ?? new Date();

  const program = await client
    .from("programs")
    .insert({ user_id: userId, name: `e1RM Reference ${suffix}` })
    .select("id")
    .single();
  if (program.error) throw new Error(`e1rm program insert: ${program.error.message}`);
  const programId: string = program.data.id;

  const exercise = await client
    .from("exercises")
    .insert({
      user_id: userId,
      name: `Reference Lift ${suffix}`,
      muscle_group: "quads",
      equipment: "barbell",
    })
    .select("id")
    .single();
  if (exercise.error) throw new Error(`e1rm exercise insert: ${exercise.error.message}`);
  const exerciseId: string = exercise.data.id;

  for (const [i, ref] of EXPECTED_E1RM_REFERENCE.entries()) {
    const sessionId = randomUUID();
    // Chronological: the 100 × 5 first, the 110 × 3 a week later.
    const completedAt = new Date(now.getTime() - (EXPECTED_E1RM_REFERENCE.length - i) * 7 * DAY_MS);
    const commit = await client.rpc("commit_session", {
      p_payload: {
        id: sessionId,
        user_id: userId,
        program_id: programId,
        workout_id: null,
        started_at: new Date(completedAt.getTime() - 1800_000).toISOString(),
        completed_at: completedAt.toISOString(),
        duration_seconds: 1800,
        notes: null,
        sets: [
          {
            exercise_id: exerciseId,
            workout_exercise_id: null,
            position: 0,
            set_number: 1,
            weight: ref.weight,
            reps: ref.reps,
            is_warmup: false,
            rpe: null,
            target_rep_min: ref.reps,
            target_rep_max: ref.reps,
            completed_at: completedAt.toISOString(),
          },
        ],
      },
    });
    if (commit.error) throw new Error(`e1rm commit (${ref.key}): ${commit.error.message}`);
  }

  return { programId, exerciseId };
}

// ---------------------------------------------------------------------------
// CLI — plant the block in a real, loggable-into account.
// ---------------------------------------------------------------------------

const SEED_PASSWORD = "synthetic-seed-password-123";

/**
 * This CLI creates an auth user with a password committed to the repo and
 * writes 17 sessions. resolveConfig() honours a SUPABASE_URL from the
 * environment, so without this guard a stray env var — or a shell that still
 * has production exported from an earlier task — would plant all of it in the
 * real project, under a login anyone reading this file knows the password to.
 * Local stacks only. There is no --force: if you genuinely want fixture data
 * in a hosted project, seed it through the app.
 */
function assertLocalStack(url: string): void {
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") {
    throw new Error(
      `Refusing to seed ${url}. seed-synthetic.ts creates a user with a ` +
        `hardcoded password and is for local stacks only (localhost / 127.0.0.1).`,
    );
  }
}

async function main(): Promise<void> {
  const email = process.argv[2] ?? "synthetic@example.com";
  const { url, anonKey, serviceRoleKey } = resolveConfig();
  assertLocalStack(url);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const created = await admin.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
  });
  if (created.error && !/already been registered/i.test(created.error.message)) {
    throw new Error(`create user: ${created.error.message}`);
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({
    email,
    password: SEED_PASSWORD,
  });
  if (signIn.error) throw new Error(`sign in: ${signIn.error.message}`);
  const userId = signIn.data.user.id;

  const result = await seedSynthetic(client, userId);

  // Make it the active program so the app opens on it.
  const profile = await client
    .from("profiles")
    .update({ active_program_id: result.programId })
    .eq("id", userId);
  if (profile.error) throw new Error(`profile update: ${profile.error.message}`);

  console.log(`Seeded 8 weeks for ${email} (password: ${SEED_PASSWORD})`);
  console.log(`  program: ${result.programId}`);
  console.log(`  squat:   ${result.exerciseIds.squat}`);
  console.log(`  bench:   ${result.exerciseIds.bench}`);
  console.log(`  analytics: /programs/${result.programId}/analytics`);
}

// Only run the CLI when executed directly — scripts/test-analytics.ts imports
// this module for the fixture and must not trip the seeding path.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
