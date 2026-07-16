import { findNextScheduledWorkout, type HomeDraft, type HomeWorkout, type ResolveHomeInput } from "./resolve";

export type HomeSession = {
  workoutId: string | null; // ON DELETE SET NULL (SPEC.md §2) — a deleted workout's sessions keep completedAt but lose this
  completedAt: string; // ISO 8601
};

/**
 * Turns already-fetched, timezone-naive rows (from `getHomeData`, query.ts)
 * plus the client's own clock into the shape `resolveHome` needs. Split out
 * from `resolveHome` itself so "what happened today" (a calendar-day
 * question, answered here) stays separate from "what do we show" (the
 * priority logic, answered there) — each testable on its own.
 */
export function buildResolveHomeInput(params: {
  now: number;
  draft: HomeDraft | null;
  activeProgramId: string | null;
  workouts: HomeWorkout[];
  completedSessions: HomeSession[];
}): ResolveHomeInput {
  const today = new Date(params.now);
  const todayDayOfWeek = today.getDay();

  const completedWorkoutIdsToday = params.completedSessions
    .filter((s) => s.workoutId !== null && isSameLocalDay(new Date(s.completedAt), today))
    .map((s) => s.workoutId as string);

  return {
    now: params.now,
    draft: params.draft,
    activeProgramId: params.activeProgramId,
    todaysWorkouts: params.workouts.filter((w) => w.dayOfWeek === todayDayOfWeek),
    completedWorkoutIdsToday,
    nextWorkout: findNextScheduledWorkout(params.workouts, todayDayOfWeek),
  };
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
