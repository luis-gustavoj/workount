/**
 * The home screen resolver (ticket 015, SPEC.md §4 "/ — Home"). A pure
 * function of already-fetched state to a `HomeState` — no `Date.now()`, no
 * network, no IndexedDB access in here, so every branch is a clock-injected
 * unit test rather than something you can only see by changing your phone's
 * clock (ticket 015: "the highest-traffic screen in the app and its logic is
 * entirely date-dependent").
 *
 * Strict priority, per ticket 015:
 *   1. a draft exists                                        → resume
 *   2. the active program has an uncompleted workout today    → today
 *   3. otherwise                                              → rest
 *   0. no active program at all                                → no-program
 * A draft beats everything, including a scheduled workout for today — a user
 * mid-session does not need to see today's recommendation.
 */

// A draft older than this prompts Finish now / Discard alongside Resume
// (ticket 020's fallback for missed push notifications), because the user
// probably forgot about it rather than still being mid-set.
const STALE_DRAFT_MS = 12 * 60 * 60 * 1000;

export type HomeWorkout = {
  id: string;
  name: string;
  // 0=Sun…6=Sat, or null for "unscheduled — do it whenever" (007). Only
  // needed by `findNextScheduledWorkout`; callers building `HomeWorkout`s for
  // `todaysWorkouts` already know it matches today.
  dayOfWeek: number | null;
  // How many exercises the workout prescribes. The resolver does not read it
  // — it decides *which* workout, not what the card offers — but Home starts
  // sessions directly now (ticket 024), and a workout with zero exercises
  // must offer "Add exercises" instead of a Start that drops the user into an
  // empty player claiming no session is in progress.
  exerciseCount: number;
};

export type HomeDraft = {
  startedAt: string; // ISO 8601 — SessionDraft.startedAt (session/types.ts)
};

export type ResolveHomeInput = {
  now: number; // epoch ms, injected — never Date.now() below
  draft: HomeDraft | null;
  activeProgramId: string | null;
  // Workouts in the active program scheduled for *today's* day_of_week.
  // Can hold more than one — 007 allows two workouts on the same day, and
  // resolveHome shows both rather than picking one for the user.
  todaysWorkouts: HomeWorkout[];
  // workout_id of every `completed` session whose completed_at falls today,
  // for the workouts that matter here (today's). Used to tell "already did
  // this" apart from "still to do".
  completedWorkoutIdsToday: string[];
  // The next scheduled workout after today, for the rest-day escape hatch.
  // null if the program has no scheduled (day_of_week IS NOT NULL) workouts.
  nextWorkout: HomeWorkout | null;
};

export type HomeState =
  | { kind: "no-program" }
  | { kind: "resume"; startedAt: string; stale: boolean }
  | { kind: "today"; workouts: HomeWorkout[] }
  | { kind: "rest"; nextWorkout: HomeWorkout | null; completedToday: HomeWorkout[] };

export function resolveHome(input: ResolveHomeInput): HomeState {
  if (input.draft) {
    const stale = input.now - Date.parse(input.draft.startedAt) > STALE_DRAFT_MS;
    return { kind: "resume", startedAt: input.draft.startedAt, stale };
  }

  if (!input.activeProgramId) {
    return { kind: "no-program" };
  }

  const pending = input.todaysWorkouts.filter(
    (w) => !input.completedWorkoutIdsToday.includes(w.id),
  );
  if (pending.length > 0) {
    return { kind: "today", workouts: pending };
  }

  // Anything left in todaysWorkouts here was scheduled for today and has a
  // completed session — the "Push A done today ✓" case, not a bare rest day.
  const completedToday = input.todaysWorkouts.filter((w) =>
    input.completedWorkoutIdsToday.includes(w.id),
  );
  return { kind: "rest", nextWorkout: input.nextWorkout, completedToday };
}

/**
 * The next scheduled workout strictly after today, for the rest-day escape
 * hatch. Distance is measured in days-from-today, wrapping the week; a
 * workout scheduled for today's own day_of_week is treated as *next week*
 * (distance 7), not today — by the time this runs today's occurrence has
 * already been resolved (either "today" state, or completed and appearing in
 * `completedToday`), so "next" means the next one after that.
 *
 * Unscheduled workouts (`dayOfWeek: null`) never win; a program made up
 * entirely of unscheduled workouts has no "next", by design (007) — the
 * escape hatch ("Start any workout") is how those get started.
 */
export function findNextScheduledWorkout(
  workouts: HomeWorkout[],
  todayDayOfWeek: number,
): HomeWorkout | null {
  let best: HomeWorkout | null = null;
  let bestDistance = Infinity;
  for (const w of workouts) {
    if (w.dayOfWeek === null) continue;
    const distance = (w.dayOfWeek - todayDayOfWeek + 7) % 7 || 7;
    if (distance < bestDistance) {
      best = w;
      bestDistance = distance;
    }
  }
  return best;
}
