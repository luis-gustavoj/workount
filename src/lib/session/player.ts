import type { DraftExercise } from "./types";

/**
 * Pure navigation logic for the session player (ticket 012). Kept
 * side-effect-free and separate from the Zustand store (store.ts) so the
 * superset rule is unit-testable without touching IndexedDB.
 */

// Warmups never count (CLAUDE.md, docs/CONTEXT.md) — excluded from volume,
// e1RM and PRs everywhere, including here: they must never consume one of the
// prescribed `targetSets` slots.
export function workingSetCount(exercise: DraftExercise): number {
  return exercise.sets.filter((s) => !s.isWarmup).length;
}

/**
 * After logging a set on `currentIndex`, where should the player go next?
 *
 * A superset alternates: a set of A1, a set of A2, then rest, repeat. Per
 * ticket 012, "the player drives this order rather than making the user
 * navigate back and forth manually" — so logging a set on a superset member
 * auto-advances to its next peer (in `position` order, wrapping around),
 * skipping over any other exercises interleaved between them. An exercise
 * with no superset group, or a lonely group with no peer, simply stays put —
 * the user keeps logging its own sets until they move on manually.
 */
export function nextExerciseIndexAfterLogging(
  exercises: DraftExercise[],
  currentIndex: number,
): number {
  const current = exercises[currentIndex];
  if (!current.supersetGroup) return currentIndex;

  const peers = exercises
    .map((exercise, index) => ({ exercise, index }))
    .filter(({ exercise }) => exercise.supersetGroup === current.supersetGroup)
    .sort((a, b) => a.exercise.position - b.exercise.position);

  if (peers.length < 2) return currentIndex;

  const positionInPeers = peers.findIndex(({ index }) => index === currentIndex);
  const next = peers[(positionInPeers + 1) % peers.length];
  return next.index;
}
