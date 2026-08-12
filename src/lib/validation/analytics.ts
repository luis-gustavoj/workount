import { z } from "zod";

// Zod at the boundary (CLAUDE.md). The analytics screen's only input is which
// exercise the progression chart is showing. A junk value is not a 404 — the
// page falls back to the program's first exercise, because a mistyped query
// string should not take the whole screen down.
export const analyticsSearchSchema = z.object({
  exercise: z.uuid().optional(),
});
