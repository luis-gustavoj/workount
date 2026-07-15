import { z } from "zod";

// Zod schema for custom-exercise creation (ticket 008). CLAUDE.md: validation
// happens at the Server Action boundary — this is that boundary for
// createCustomExercise.

export const EXERCISE_NAME_MAX = 80;

// Must mirror the CHECK constraints in supabase/migrations/0001_init.sql.
export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "quads",
  "hamstrings",
  "glutes",
  "biceps",
  "triceps",
  "core",
  "calves",
  "other",
] as const;

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "other",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type Equipment = (typeof EQUIPMENT)[number];

export const exerciseNameSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z
    .string()
    .min(1, "Exercise name is required")
    .max(EXERCISE_NAME_MAX, `Exercise name must be at most ${EXERCISE_NAME_MAX} characters`),
);

export const createCustomExerciseSchema = z.object({
  name: exerciseNameSchema,
  muscleGroup: z.enum(MUSCLE_GROUPS),
  equipment: z.enum(EQUIPMENT),
});

export type CreateCustomExerciseInput = z.infer<typeof createCustomExerciseSchema>;
