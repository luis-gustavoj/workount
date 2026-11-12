import { describe, expect, it } from "vitest";

import { logCardioSchema, toDistanceMeters, toDurationSeconds } from "./cardio";

const id = "11111111-1111-4111-8111-111111111111";
const workoutId = "22222222-2222-4222-8222-222222222222";

describe("logCardioSchema", () => {
  it("parses a pt-BR comma distance and blank optionals", () => {
    expect(
      logCardioSchema.parse({ id, workoutId, durationMinutes: "32", distanceKm: "5,2", rpe: "", notes: "  " }),
    ).toEqual({ id, workoutId, durationMinutes: 32, distanceKm: 5.2, rpe: null, notes: null });
  });

  it("requires a positive duration", () => {
    expect(() => logCardioSchema.parse({ id, workoutId, durationMinutes: "" })).toThrow();
    expect(() => logCardioSchema.parse({ id, workoutId, durationMinutes: "0" })).toThrow();
  });

  it("rejects an RPE outside 1–10", () => {
    expect(() => logCardioSchema.parse({ id, workoutId, durationMinutes: "30", rpe: "11" })).toThrow();
  });
});

describe("unit conversion", () => {
  it("stores seconds and meters", () => {
    expect(toDurationSeconds(32.5)).toBe(1950);
    expect(toDistanceMeters(5.2)).toBe(5200);
    expect(toDistanceMeters(null)).toBeNull();
  });
});
