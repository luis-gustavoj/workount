import { describe, expect, it } from "vitest";

import type { WorkoutExercisePrescription } from "@/lib/workouts/queries";

import { buildSessionDraft, type LastPerformanceRow } from "./draft";
import { SESSION_DRAFT_VERSION } from "./types";

// buildSessionDraft is the pure heart of ticket 011: given already-fetched
// prescriptions, the resolved profile default rest, and get_last_performance
// rows, assemble the offline session draft. It must resolve rest inheritance
// and last-performance grouping without ever touching the network — all I/O
// lives in start.ts.

function prescription(
  overrides: Partial<WorkoutExercisePrescription> = {},
): WorkoutExercisePrescription {
  return {
    id: "we-1",
    exerciseId: "ex-1",
    exerciseName: "Barbell Bench Press",
    muscleGroup: "chest",
    equipment: "barbell",
    position: 0,
    targetSets: 3,
    repMin: 8,
    repMax: 12,
    restSeconds: null,
    notes: null,
    supersetGroup: null,
    ...overrides,
  };
}

describe("buildSessionDraft", () => {
  it("stamps version 1 on every draft (versioned persisted format, ticket 011)", () => {
    const draft = buildSessionDraft({
      sessionId: "s-1",
      programId: "p-1",
      workoutId: "w-1",
      startedAt: "2026-07-15T12:00:00.000Z",
      prescriptions: [],
      defaultRestSeconds: 90,
      lastPerformanceRows: [],
    });
    expect(draft.version).toBe(SESSION_DRAFT_VERSION);
    expect(draft.version).toBe(1);
  });

  it("carries through the session identity fields untouched", () => {
    const draft = buildSessionDraft({
      sessionId: "s-1",
      programId: "p-1",
      workoutId: "w-1",
      startedAt: "2026-07-15T12:00:00.000Z",
      prescriptions: [],
      defaultRestSeconds: 90,
      lastPerformanceRows: [],
    });
    expect(draft.id).toBe("s-1");
    expect(draft.programId).toBe("p-1");
    expect(draft.workoutId).toBe("w-1");
    expect(draft.startedAt).toBe("2026-07-15T12:00:00.000Z");
  });

  it("resolves an explicit rest_seconds as-is, ignoring the profile default", () => {
    const draft = buildSessionDraft({
      sessionId: "s-1",
      programId: "p-1",
      workoutId: "w-1",
      startedAt: "now",
      prescriptions: [prescription({ restSeconds: 120 })],
      defaultRestSeconds: 90,
      lastPerformanceRows: [],
    });
    expect(draft.exercises[0].restSeconds).toBe(120);
  });

  it("falls back to the profile default when rest_seconds is null (nothing to fall back to, offline)", () => {
    const draft = buildSessionDraft({
      sessionId: "s-1",
      programId: "p-1",
      workoutId: "w-1",
      startedAt: "now",
      prescriptions: [prescription({ restSeconds: null })],
      defaultRestSeconds: 90,
      lastPerformanceRows: [],
    });
    expect(draft.exercises[0].restSeconds).toBe(90);
  });

  it("bakes rest in as a plain number, never the nullable original", () => {
    const draft = buildSessionDraft({
      sessionId: "s-1",
      programId: "p-1",
      workoutId: "w-1",
      startedAt: "now",
      prescriptions: [prescription({ restSeconds: null })],
      defaultRestSeconds: 90,
      lastPerformanceRows: [],
    });
    expect(draft.exercises[0].restSeconds).not.toBeNull();
    expect(typeof draft.exercises[0].restSeconds).toBe("number");
  });

  it("groups last-performance rows by exercise, in the order returned", () => {
    const rows: LastPerformanceRow[] = [
      { exercise_id: "ex-1", set_number: 1, weight: 80, reps: 8, performed_at: "d1" },
      { exercise_id: "ex-1", set_number: 2, weight: 80, reps: 8, performed_at: "d1" },
      { exercise_id: "ex-2", set_number: 1, weight: 105, reps: 6, performed_at: "d2" },
    ];
    const draft = buildSessionDraft({
      sessionId: "s-1",
      programId: "p-1",
      workoutId: "w-1",
      startedAt: "now",
      prescriptions: [
        prescription({ id: "we-1", exerciseId: "ex-1" }),
        prescription({ id: "we-2", exerciseId: "ex-2" }),
      ],
      defaultRestSeconds: 90,
      lastPerformanceRows: rows,
    });

    expect(draft.exercises[0].lastPerformance).toEqual([
      { setNumber: 1, weight: 80, reps: 8 },
      { setNumber: 2, weight: 80, reps: 8 },
    ]);
    expect(draft.exercises[1].lastPerformance).toEqual([{ setNumber: 1, weight: 105, reps: 6 }]);
  });

  it("gives an exercise never performed an empty last-performance array, not a crash", () => {
    const draft = buildSessionDraft({
      sessionId: "s-1",
      programId: "p-1",
      workoutId: "w-1",
      startedAt: "now",
      prescriptions: [prescription({ exerciseId: "never-done" })],
      defaultRestSeconds: 90,
      lastPerformanceRows: [],
    });
    expect(draft.exercises[0].lastPerformance).toEqual([]);
  });

  it("starts every exercise with an empty sets[] (nothing logged yet)", () => {
    const draft = buildSessionDraft({
      sessionId: "s-1",
      programId: "p-1",
      workoutId: "w-1",
      startedAt: "now",
      prescriptions: [prescription()],
      defaultRestSeconds: 90,
      lastPerformanceRows: [],
    });
    expect(draft.exercises[0].sets).toEqual([]);
  });

  it("preserves prescription order and carries through exercise metadata", () => {
    const draft = buildSessionDraft({
      sessionId: "s-1",
      programId: "p-1",
      workoutId: "w-1",
      startedAt: "now",
      prescriptions: [
        prescription({ id: "we-1", position: 0, exerciseName: "Squat" }),
        prescription({ id: "we-2", position: 1, exerciseName: "Bench" }),
      ],
      defaultRestSeconds: 90,
      lastPerformanceRows: [],
    });
    expect(draft.exercises.map((e) => e.exerciseName)).toEqual(["Squat", "Bench"]);
  });
});
