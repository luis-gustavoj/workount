import { describe, expect, it } from "vitest";

import { nextExerciseIndexAfterLogging, workingSetCount } from "./player";
import type { DraftExercise, PerformedSet } from "./types";

// Pure navigation logic for the session player (ticket 012). Kept separate
// from the Zustand store (store.ts) so the superset-alternation rule — "the
// player drives this order rather than making the user navigate back and
// forth manually" — is testable without touching IndexedDB at all.

function exercise(overrides: Partial<DraftExercise> = {}): DraftExercise {
  return {
    workoutExerciseId: "we-1",
    exerciseId: "ex-1",
    exerciseName: "Exercise",
    muscleGroup: "chest",
    equipment: "barbell",
    position: 0,
    targetSets: 3,
    repMin: 8,
    repMax: 12,
    restSeconds: 90,
    notes: null,
    supersetGroup: null,
    lastPerformance: [],
    sets: [],
    ...overrides,
  };
}

function performedSet(overrides: Partial<PerformedSet> = {}): PerformedSet {
  return {
    setNumber: 1,
    weight: 80,
    reps: 8,
    isWarmup: false,
    rpe: null,
    completedAt: "2026-07-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("workingSetCount", () => {
  it("counts only non-warmup sets", () => {
    const ex = exercise({
      sets: [performedSet({ isWarmup: true }), performedSet(), performedSet()],
    });
    expect(workingSetCount(ex)).toBe(2);
  });

  it("is zero for an exercise with no sets logged", () => {
    expect(workingSetCount(exercise())).toBe(0);
  });
});

describe("nextExerciseIndexAfterLogging", () => {
  it("stays on the same exercise when it has no superset group", () => {
    const exercises = [exercise({ workoutExerciseId: "we-1" })];
    expect(nextExerciseIndexAfterLogging(exercises, 0)).toBe(0);
  });

  it("alternates to the peer after logging a set on A1", () => {
    const exercises = [
      exercise({ workoutExerciseId: "we-1", position: 0, supersetGroup: "A" }),
      exercise({ workoutExerciseId: "we-2", position: 1, supersetGroup: "A" }),
    ];
    expect(nextExerciseIndexAfterLogging(exercises, 0)).toBe(1);
  });

  it("alternates back to A1 after logging a set on A2", () => {
    const exercises = [
      exercise({ workoutExerciseId: "we-1", position: 0, supersetGroup: "A" }),
      exercise({ workoutExerciseId: "we-2", position: 1, supersetGroup: "A" }),
    ];
    expect(nextExerciseIndexAfterLogging(exercises, 1)).toBe(0);
  });

  it("cycles through three or more peers in position order", () => {
    const exercises = [
      exercise({ workoutExerciseId: "we-1", position: 0, supersetGroup: "A" }),
      exercise({ workoutExerciseId: "we-2", position: 1, supersetGroup: "A" }),
      exercise({ workoutExerciseId: "we-3", position: 2, supersetGroup: "A" }),
    ];
    expect(nextExerciseIndexAfterLogging(exercises, 0)).toBe(1);
    expect(nextExerciseIndexAfterLogging(exercises, 1)).toBe(2);
    expect(nextExerciseIndexAfterLogging(exercises, 2)).toBe(0);
  });

  it("ignores exercises from other superset groups and non-grouped exercises in between", () => {
    const exercises = [
      exercise({ workoutExerciseId: "we-1", position: 0, supersetGroup: "A" }),
      exercise({ workoutExerciseId: "we-2", position: 1, supersetGroup: "B" }),
      exercise({ workoutExerciseId: "we-3", position: 2, supersetGroup: "A" }),
    ];
    expect(nextExerciseIndexAfterLogging(exercises, 0)).toBe(2);
  });

  it("stays put when the exercise's superset group has no peer (lonely group)", () => {
    const exercises = [exercise({ workoutExerciseId: "we-1", supersetGroup: "A" })];
    expect(nextExerciseIndexAfterLogging(exercises, 0)).toBe(0);
  });
});
