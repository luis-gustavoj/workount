import { z } from "zod";

// Zod schemas for the prescription editor (ticket 009): per-exercise sets,
// rep range, rest override, notes, and superset group on `workout_exercises`
// (migration 0001). CLAUDE.md: validated at the Server Action boundary, no
// unvalidated input reaches the database.

export const TARGET_SETS_MIN = 1;
export const TARGET_SETS_MAX = 20;
export const REP_MIN_MIN = 1;
// rest_seconds has no DB CHECK (migration 0001) since NULL — "inherit the
// profile default" — is a real, unbounded-by-the-schema value. This ceiling
// exists only to catch a fat-fingered input, not to encode a domain rule.
export const REST_SECONDS_MIN = 0;
export const REST_SECONDS_MAX = 600;
export const NOTES_MAX = 280;

// Sensible starting point for the "add exercise" form — common hypertrophy
// prescription — not a domain rule; every field stays editable before save.
export const DEFAULT_TARGET_SETS = 3;
export const DEFAULT_REP_MIN = 8;
export const DEFAULT_REP_MAX = 12;

export const REP_RANGE_ERROR = "Rep max must be at least rep min";

const SUPERSET_GROUP_PATTERN = /^[A-Z]$/;

export const targetSetsSchema = z.coerce
  .number()
  .int()
  .min(TARGET_SETS_MIN, `Target sets must be at least ${TARGET_SETS_MIN}`)
  .max(TARGET_SETS_MAX, `Target sets must be at most ${TARGET_SETS_MAX}`);

export const repMinSchema = z.coerce
  .number()
  .int()
  .min(REP_MIN_MIN, `Rep min must be at least ${REP_MIN_MIN}`);

export const repMaxSchema = z.coerce
  .number()
  .int()
  .min(REP_MIN_MIN, `Rep max must be at least ${REP_MIN_MIN}`);

// NULL means "inherit profiles.default_rest_seconds" (migration 0001). An
// empty field must collapse to null, never to the currently-inherited number
// — materialising it would turn an inheritance into a copy (ticket 009
// acceptance: changing the profile default later must still change what an
// empty-rest exercise reports).
export const restSecondsSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  },
  z
    .number()
    .int()
    .min(REST_SECONDS_MIN, `Rest must be at least ${REST_SECONDS_MIN} seconds`)
    .max(REST_SECONDS_MAX, `Rest must be at most ${REST_SECONDS_MAX} seconds`)
    .nullable(),
);

// A blank note and "no note" are the same fact (mirrors programDescriptionSchema).
export const notesSchema = z
  .preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().max(NOTES_MAX, `Notes must be at most ${NOTES_MAX} characters`),
  )
  .transform((value) => (value.length === 0 ? null : value));

// A single letter, case-insensitive on input but normalised to uppercase —
// 'A', 'B', … (SPEC.md §2). Blank/whitespace means "no superset".
export const supersetGroupSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim().toUpperCase();
    return trimmed.length === 0 ? null : trimmed;
  },
  z
    .string()
    .regex(SUPERSET_GROUP_PATTERN, "Superset group must be a single letter A–Z")
    .nullable(),
);

const prescriptionFields = {
  targetSets: targetSetsSchema,
  repMin: repMinSchema,
  repMax: repMaxSchema,
  restSeconds: restSecondsSchema,
  notes: notesSchema,
  supersetGroup: supersetGroupSchema,
};

// The range is the whole mechanism (ticket 009: "the range is what drives
// progression"), so a max below min isn't just odd input, it's meaningless —
// enforced on both create and update.
export const createWorkoutExerciseSchema = z
  .object({
    workoutId: z.uuid(),
    programId: z.uuid(),
    exerciseId: z.uuid(),
    ...prescriptionFields,
  })
  .refine((data) => data.repMax >= data.repMin, {
    message: REP_RANGE_ERROR,
    path: ["repMax"],
  });

// No exerciseId: swapping the exercise itself isn't an edit to a prescription,
// it's a remove-and-re-add — the exercise is the identity, not a field on it.
export const updateWorkoutExerciseSchema = z
  .object({
    id: z.uuid(),
    workoutId: z.uuid(),
    programId: z.uuid(),
    ...prescriptionFields,
  })
  .refine((data) => data.repMax >= data.repMin, {
    message: REP_RANGE_ERROR,
    path: ["repMax"],
  });

export const deleteWorkoutExerciseSchema = z.object({
  id: z.uuid(),
  workoutId: z.uuid(),
  programId: z.uuid(),
});

export const reorderWorkoutExercisesSchema = z.object({
  workoutId: z.uuid(),
  programId: z.uuid(),
  ids: z.array(z.uuid()).min(1),
});

export type CreateWorkoutExerciseInput = z.infer<typeof createWorkoutExerciseSchema>;
export type UpdateWorkoutExerciseInput = z.infer<typeof updateWorkoutExerciseSchema>;
