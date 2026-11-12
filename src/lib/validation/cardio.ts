import { z } from "zod";

// The "log cardio" form (ADR-0008). Distance is typed in km — with either a
// dot or a pt-BR comma — and stored in meters; duration is typed in minutes and
// stored in seconds. Units convert here, at the edge (CLAUDE.md #5).

const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value ?? null;

const decimal = (value: unknown) => {
  const v = blankToNull(value);
  if (typeof v !== "string") return v;
  const n = Number(v.trim().replace(",", "."));
  return Number.isNaN(n) ? v : n;
};

export const logCardioSchema = z.object({
  // Client-generated, like every session id: a double-submit upserts the same
  // row instead of logging the run twice.
  id: z.uuid(),
  workoutId: z.uuid(),
  durationMinutes: z.preprocess(decimal, z.number().positive().max(24 * 60)),
  distanceKm: z.preprocess(decimal, z.number().min(0).max(1000).nullable()),
  rpe: z.preprocess(decimal, z.number().min(1).max(10).nullable()),
  notes: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null),
    z.string().max(4000).nullable(),
  ),
});

export type LogCardioInput = z.infer<typeof logCardioSchema>;

export function toDurationSeconds(minutes: number): number {
  return Math.round(minutes * 60);
}

export function toDistanceMeters(km: number | null): number | null {
  return km === null ? null : Math.round(km * 1000);
}
