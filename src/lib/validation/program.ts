import { z } from "zod";

// Zod schemas for every program mutation (ticket 006). CLAUDE.md: validation
// happens at the Server Action boundary, and no unvalidated input reaches the
// database — these are that boundary. Kept in src/lib/validation/ (per the
// ticket) so the schemas are importable by tests without pulling in a Server
// Action's "use server" module graph.

// A program name is the label the user reads everywhere; keep it short enough to
// fit a list row on a 390px screen. The description is free text, so it is
// generously bounded — the cap exists to stop abuse, not to shape content.
export const PROGRAM_NAME_MAX = 80;
export const PROGRAM_DESCRIPTION_MAX = 2000;

// Trim first, then require at least one character: a whitespace-only name is an
// empty name. Preprocessing a non-string (a missing FormData field arrives as
// null) to "" lets min(1) own the "required" message instead of a type error.
export const programNameSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z
    .string()
    .min(1, "Program name is required")
    .max(PROGRAM_NAME_MAX, `Program name must be at most ${PROGRAM_NAME_MAX} characters`),
);

// A blank description is NULL, never "". An empty description and "no
// description" are the same fact and must be indistinguishable in the database,
// so anything that trims to empty (missing field, "", "   ") collapses to null.
export const programDescriptionSchema = z
  .preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(
        PROGRAM_DESCRIPTION_MAX,
        `Description must be at most ${PROGRAM_DESCRIPTION_MAX} characters`,
      ),
  )
  .transform((value) => (value.length === 0 ? null : value));

export const createProgramSchema = z.object({
  name: programNameSchema,
  description: programDescriptionSchema,
});

// updateProgram edits an existing row, so it carries the id. followProgram and
// archiveProgram only need the id, hence the standalone programIdSchema.
export const updateProgramSchema = createProgramSchema.extend({
  id: z.uuid(),
});

export const programIdSchema = z.object({
  id: z.uuid(),
});

export type CreateProgramInput = z.infer<typeof createProgramSchema>;
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;
