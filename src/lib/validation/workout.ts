import { z } from "zod";

export const WORKOUT_NAME_MAX = 80;

// Index-matched to day_of_week (0=Sun..6=Sat, migration 0001) and to the
// translation keys in messages/*.json — the single source both the program
// detail page and the workout detail page read from, so the two never drift.
export const DAY_OF_WEEK_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type WorkoutSummary = {
  id: string;
  name: string;
  day_of_week: number | null;
  position: number;
  program_id: string;
};

export const workoutNameSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z
    .string()
    .min(1, "Workout name is required")
    .max(WORKOUT_NAME_MAX, `Workout name must be at most ${WORKOUT_NAME_MAX} characters`),
);

export const dayOfWeekSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  },
  z
    .number()
    .int()
    .min(0, "Day of week must be between 0 (Sunday) and 6 (Saturday)")
    .max(6, "Day of week must be between 0 (Sunday) and 6 (Saturday)")
    .nullable(),
);

export const createWorkoutSchema = z.object({
  programId: z.uuid(),
  name: workoutNameSchema,
  dayOfWeek: dayOfWeekSchema,
});

export const updateWorkoutSchema = z.object({
  id: z.uuid(),
  programId: z.uuid(),
  name: workoutNameSchema,
  dayOfWeek: dayOfWeekSchema,
});

export const deleteWorkoutSchema = z.object({
  id: z.uuid(),
  programId: z.uuid(),
});

export const reorderWorkoutsSchema = z.object({
  programId: z.uuid(),
  ids: z.array(z.uuid()).min(1),
});

export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>;
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;
