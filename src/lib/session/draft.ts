import type { WorkoutExercisePrescription } from "@/lib/workouts/queries";

import {
  SESSION_DRAFT_VERSION,
  type DraftExercise,
  type LastPerformanceSet,
  type SessionDraft,
} from "./types";

export type LastPerformanceRow = {
  exercise_id: string;
  set_number: number;
  weight: number;
  reps: number;
  performed_at: string;
};

export type BuildSessionDraftInput = {
  sessionId: string;
  programId: string;
  workoutId: string;
  startedAt: string;
  prescriptions: WorkoutExercisePrescription[];
  defaultRestSeconds: number;
  lastPerformanceRows: LastPerformanceRow[];
};

/**
 * Assemble the session draft (ticket 011) from already-fetched pieces. Pure
 * and network-free on purpose, so it's testable without a Supabase client —
 * all the I/O lives in `startSession` (start.ts), which fetches these inputs
 * and then hands them here.
 *
 * Two resolutions happen here, both because offline there is nothing left to
 * fall back to (ticket 011):
 * - rest: `rest_seconds ?? default_rest_seconds`, baked into a plain number.
 * - last performance: grouped per exercise, defaulting to `[]` for an
 *   exercise never performed before.
 */
export function buildSessionDraft(input: BuildSessionDraftInput): SessionDraft {
  const lastPerformanceByExercise = new Map<string, LastPerformanceSet[]>();
  for (const row of input.lastPerformanceRows) {
    const sets = lastPerformanceByExercise.get(row.exercise_id) ?? [];
    sets.push({ setNumber: row.set_number, weight: row.weight, reps: row.reps });
    lastPerformanceByExercise.set(row.exercise_id, sets);
  }

  const exercises: DraftExercise[] = input.prescriptions.map((p) => ({
    workoutExerciseId: p.id,
    exerciseId: p.exerciseId,
    exerciseName: p.exerciseName,
    muscleGroup: p.muscleGroup,
    equipment: p.equipment,
    position: p.position,
    targetSets: p.targetSets,
    repMin: p.repMin,
    repMax: p.repMax,
    restSeconds: p.restSeconds ?? input.defaultRestSeconds,
    notes: p.notes,
    supersetGroup: p.supersetGroup,
    lastPerformance: lastPerformanceByExercise.get(p.exerciseId) ?? [],
    sets: [],
  }));

  return {
    version: SESSION_DRAFT_VERSION,
    id: input.sessionId,
    programId: input.programId,
    workoutId: input.workoutId,
    startedAt: input.startedAt,
    exercises,
    activeExerciseIndex: 0,
  };
}
