import type { HistorySetDetail } from "./query";

/**
 * Pure date math for /history (ticket 016, docs/CONTEXT.md). People navigate
 * history by "last Tuesday", not by ISO dates — so the list shows the
 * absolute date in the user's locale (at the call site, via
 * toLocaleDateString) plus this relative hint for anything recent enough to
 * be worth naming. Kept separate from the page component so it's testable
 * without rendering anything — see src/lib/session/rest.ts for the sibling
 * pattern.
 */

export type RelativeHint =
  { kind: "today" } | { kind: "yesterday" } | { kind: "daysAgo"; days: number };

const MS_PER_DAY = 86_400_000;
const RECENT_WINDOW_DAYS = 6;

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * "Today" / "Yesterday" / "N days ago" for a session completed within the
 * last week, by *calendar* day (not a rolling 24h window) — a session at
 * 11pm last night is "Yesterday", not "10 hours ago". Returns null once past
 * the recent window (7+ calendar days back) or for a future timestamp
 * (clock skew), so the caller falls back to the plain absolute date.
 */
export function relativeDateHint(
  completedAtIso: string,
  nowMs: number,
): RelativeHint | null {
  const diffDays = Math.round(
    (startOfLocalDay(nowMs) -
      startOfLocalDay(new Date(completedAtIso).getTime())) /
      MS_PER_DAY,
  );

  if (diffDays < 0 || diffDays > RECENT_WINDOW_DAYS) return null;
  if (diffDays === 0) return { kind: "today" };
  if (diffDays === 1) return { kind: "yesterday" };
  return { kind: "daysAgo", days: diffDays };
}

export type ExerciseGroup = {
  exerciseId: string;
  exerciseName: string;
  targetRepMin: number | null;
  targetRepMax: number | null;
  sets: HistorySetDetail[];
};

/**
 * /history/[id] shows "every exercise, every set" (ticket 016) grouped by
 * exercise, in the order the session performed them — the flat
 * `session_sets` list is already ordered by (position, set_number), so a
 * single pass preserves that order. The target rep range is read off the
 * group's first set: every set of one exercise instance shares the same
 * ADR-0002 snapshot in practice, so any set's copy is representative.
 */
export function groupSetsByExercise(sets: HistorySetDetail[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  const byExerciseId = new Map<string, ExerciseGroup>();

  for (const s of sets) {
    let group = byExerciseId.get(s.exerciseId);
    if (!group) {
      group = {
        exerciseId: s.exerciseId,
        exerciseName: s.exerciseName,
        targetRepMin: s.targetRepMin,
        targetRepMax: s.targetRepMax,
        sets: [],
      };
      byExerciseId.set(s.exerciseId, group);
      groups.push(group);
    }
    group.sets.push(s);
  }

  return groups;
}

/** Both /history and /history/[id] round a duration to whole minutes for display. */
export function minutesFromSeconds(seconds: number | null): number | null {
  return seconds === null ? null : Math.round(seconds / 60);
}

/** Both /history and /history/[id] round a volume to a whole kg for display. */
export function roundVolume(kg: number): number {
  return Math.round(kg);
}
