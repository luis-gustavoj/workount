import { z } from "zod";

// Zod at the boundary (CLAUDE.md): /history/[id]'s route param must not
// reach the database unvalidated — mirrors validation/program.ts's
// programIdSchema.
export const sessionIdSchema = z.object({
  id: z.uuid(),
});
