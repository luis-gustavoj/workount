import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import type { Equipment, MuscleGroup } from "@/lib/validation/exercise";

export type WorkoutExercisePrescription = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  position: number;
  targetSets: number;
  repMin: number;
  repMax: number;
  restSeconds: number | null;
  notes: string | null;
  supersetGroup: string | null;
};

/**
 * The full prescription list for a workout builder (ticket 009): each
 * `workout_exercises` row plus the exercise's display name, muscle group, and
 * equipment via the FK to `exercises`. RLS (`workout_exercises_all`,
 * migration 0001) already scopes this to the caller's own workouts through
 * the join up to `programs` — no explicit user filter needed here.
 */
export async function listWorkoutExercises(
  supabase: SupabaseClient<Database>,
  workoutId: string,
): Promise<WorkoutExercisePrescription[]> {
  const { data, error } = await supabase
    .from("workout_exercises")
    .select(
      "id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes, superset_group, exercise:exercises(name, muscle_group, equipment)",
    )
    .eq("workout_id", workoutId)
    .order("position");
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise.name,
    muscleGroup: row.exercise.muscle_group as MuscleGroup,
    equipment: row.exercise.equipment as Equipment,
    position: row.position,
    targetSets: row.target_sets,
    repMin: row.rep_min,
    repMax: row.rep_max,
    restSeconds: row.rest_seconds,
    notes: row.notes,
    supersetGroup: row.superset_group,
  }));
}
