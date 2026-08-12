import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

// The I/O shell around the ticket-017 analytics SQL
// (supabase/migrations/0006_analytics.sql). Every number below arrives
// already aggregated: volume, e1RM and adherence are computed in Postgres
// over working sets only, and nothing in this file — or in any component
// downstream of it — recomputes them (ADR-0004). The mapping here is
// snake_case → camelCase and nothing else.

export type VolumePoint = {
  sessionId: string;
  completedAt: string;
  workoutName: string | null; // null once the workout is deleted (ticket 016)
  volumeKg: number;
};

export type ProgressionPoint = {
  sessionId: string;
  completedAt: string;
  topSetWeightKg: number;
  topSetReps: number;
  e1rmKg: number;
};

export type AdherenceWeek = {
  weekStart: string;
  completedSessions: number;
  scheduledWorkouts: number;
  /** completed ÷ scheduled. Not capped at 1, and null when nothing is
   *  scheduled — undefined, not perfect (0006_analytics.sql). */
  adherence: number | null;
};

export type ExercisePrs = {
  exerciseId: string;
  heaviestWeightKg: number;
  heaviestReps: number;
  heaviestSessionId: string;
  bestE1rmKg: number;
  bestE1rmWeightKg: number;
  bestE1rmReps: number;
  bestE1rmSessionId: string;
  mostReps: number;
  mostRepsWeightKg: number;
  mostRepsSessionId: string;
};

export type ProgramExercise = {
  exerciseId: string;
  name: string;
};

/** Volume per completed session in the program, chronological. */
export async function getProgramVolume(
  supabase: SupabaseClient<Database>,
  programId: string,
): Promise<VolumePoint[]> {
  const { data, error } = await supabase.rpc("get_program_volume", {
    p_program_id: programId,
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    sessionId: row.session_id,
    completedAt: row.completed_at,
    workoutName: row.workout_name,
    volumeKg: row.total_volume,
  }));
}

/**
 * Top set and best e1RM per completed session, for one exercise in one
 * program. Chronological, and empty for an exercise that has been prescribed
 * but never performed here — which the caller renders as an empty state, not
 * as an axis with no data.
 */
export async function getExerciseProgression(
  supabase: SupabaseClient<Database>,
  programId: string,
  exerciseId: string,
): Promise<ProgressionPoint[]> {
  const { data, error } = await supabase.rpc("get_exercise_progression", {
    p_program_id: programId,
    p_exercise_id: exerciseId,
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    sessionId: row.session_id,
    completedAt: row.completed_at,
    topSetWeightKg: row.top_set_weight,
    topSetReps: row.top_set_reps,
    e1rmKg: row.best_e1rm,
  }));
}

/** Completed vs scheduled per ISO week, contiguous — a skipped week is a
 *  zero row, never a missing one. */
export async function getProgramAdherence(
  supabase: SupabaseClient<Database>,
  programId: string,
): Promise<AdherenceWeek[]> {
  const { data, error } = await supabase.rpc("get_program_adherence", {
    p_program_id: programId,
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    weekStart: row.week_start,
    completedSessions: row.completed_sessions,
    scheduledWorkouts: row.scheduled_workouts,
    adherence: row.adherence,
  }));
}

/**
 * The three PR kinds for the given exercises, keyed by exercise id.
 *
 * `v_exercise_prs` is per (user, exercise) rather than per program — a PR is
 * "a best, per exercise" (CONTEXT.md), so a record set under a previous
 * program still stands, and the session it links to may live outside this
 * program. That is the view's deliberate design (0006_analytics.sql), not an
 * oversight; the UI links to the session and lets it speak for itself.
 */
export async function getExercisePrs(
  supabase: SupabaseClient<Database>,
  exerciseIds: string[],
): Promise<Map<string, ExercisePrs>> {
  if (exerciseIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("v_exercise_prs")
    .select(
      "exercise_id, heaviest_weight, heaviest_reps, heaviest_session_id, best_e1rm, best_e1rm_weight, best_e1rm_reps, best_e1rm_session_id, most_reps, most_reps_weight, most_reps_session_id",
    )
    .in("exercise_id", exerciseIds);
  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => [
      row.exercise_id,
      {
        exerciseId: row.exercise_id,
        heaviestWeightKg: row.heaviest_weight,
        heaviestReps: row.heaviest_reps,
        heaviestSessionId: row.heaviest_session_id,
        bestE1rmKg: row.best_e1rm,
        bestE1rmWeightKg: row.best_e1rm_weight,
        bestE1rmReps: row.best_e1rm_reps,
        bestE1rmSessionId: row.best_e1rm_session_id,
        mostReps: row.most_reps,
        mostRepsWeightKg: row.most_reps_weight,
        mostRepsSessionId: row.most_reps_session_id,
      },
    ]),
  );
}

/**
 * The exercises the progression chart offers, read off the program's
 * *prescription* — every exercise in every workout, in workout-then-position
 * order, each listed once.
 *
 * Reading the menu from the plan rather than from what was performed is a
 * deliberate trade. The alternative — DISTINCT over `session_sets` — has no
 * PostgREST spelling, so it would mean either a new SQL function or pulling
 * every set row down to a phone and de-duplicating there, which is the exact
 * thing ADR-0004 rules out. The plan is a few dozen rows, and it is what the
 * user recognizes as "the exercises in this program".
 *
 * The cost: an exercise dropped from the plan keeps its history (ADR-0002)
 * but loses its chart, and one prescribed but never performed shows the
 * not-enough-data state. Both are visible, neither is a wrong number.
 */
export async function listProgramExercises(
  supabase: SupabaseClient<Database>,
  programId: string,
): Promise<ProgramExercise[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "position, workout_exercises(position, exercise_id, exercises(name))",
    )
    .eq("program_id", programId)
    .order("position")
    .order("position", { referencedTable: "workout_exercises" });
  if (error) throw error;

  const seen = new Set<string>();
  const exercises: ProgramExercise[] = [];
  for (const workout of data ?? []) {
    for (const we of workout.workout_exercises) {
      if (seen.has(we.exercise_id)) continue;
      seen.add(we.exercise_id);
      exercises.push({ exerciseId: we.exercise_id, name: we.exercises.name });
    }
  }
  return exercises;
}
