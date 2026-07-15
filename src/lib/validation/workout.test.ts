import { describe, expect, it } from "vitest";

import {
  createWorkoutSchema,
  deleteWorkoutSchema,
  reorderWorkoutsSchema,
  updateWorkoutSchema,
  WORKOUT_NAME_MAX,
} from "./workout";

const programId = "11111111-1111-4111-8111-111111111111";
const workoutId = "22222222-2222-4222-8222-222222222222";

describe("createWorkoutSchema", () => {
  it("accepts a name with a day of week", () => {
    const parsed = createWorkoutSchema.parse({
      programId,
      name: "Push A",
      dayOfWeek: 1,
    });
    expect(parsed).toEqual({ programId, name: "Push A", dayOfWeek: 1 });
  });

  it("accepts a null day of week (unscheduled)", () => {
    const parsed = createWorkoutSchema.parse({
      programId,
      name: "Pull B",
      dayOfWeek: null,
    });
    expect(parsed.dayOfWeek).toBeNull();
  });

  it("collapses an empty-string day of week to null", () => {
    const parsed = createWorkoutSchema.parse({
      programId,
      name: "Legs",
      dayOfWeek: "",
    });
    expect(parsed.dayOfWeek).toBeNull();
  });

  it("coerces a string day of week to a number", () => {
    const parsed = createWorkoutSchema.parse({
      programId,
      name: "Push A",
      dayOfWeek: "3",
    });
    expect(parsed.dayOfWeek).toBe(3);
  });

  it("trims surrounding whitespace from the name", () => {
    expect(
      createWorkoutSchema.parse({ programId, name: "  Push A  " }).name,
    ).toBe("Push A");
  });

  it("rejects an empty name", () => {
    expect(() =>
      createWorkoutSchema.parse({ programId, name: "" }),
    ).toThrow();
  });

  it("rejects a whitespace-only name", () => {
    expect(() =>
      createWorkoutSchema.parse({ programId, name: "   " }),
    ).toThrow();
  });

  it("rejects a name longer than the maximum", () => {
    expect(() =>
      createWorkoutSchema.parse({
        programId,
        name: "x".repeat(WORKOUT_NAME_MAX + 1),
      }),
    ).toThrow();
  });

  it("accepts a name exactly at the maximum", () => {
    const name = "x".repeat(WORKOUT_NAME_MAX);
    expect(
      createWorkoutSchema.parse({ programId, name }).name,
    ).toBe(name);
  });

  it("rejects day of week below 0", () => {
    expect(() =>
      createWorkoutSchema.parse({ programId, name: "Push A", dayOfWeek: -1 }),
    ).toThrow();
  });

  it("rejects day of week above 6", () => {
    expect(() =>
      createWorkoutSchema.parse({ programId, name: "Push A", dayOfWeek: 7 }),
    ).toThrow();
  });

  it("accepts day of week 0 (Sunday) and 6 (Saturday)", () => {
    expect(
      createWorkoutSchema.parse({ programId, name: "A", dayOfWeek: 0 }).dayOfWeek,
    ).toBe(0);
    expect(
      createWorkoutSchema.parse({ programId, name: "A", dayOfWeek: 6 }).dayOfWeek,
    ).toBe(6);
  });

  it("rejects a non-uuid program id", () => {
    expect(() =>
      createWorkoutSchema.parse({ programId: "bad", name: "Push A" }),
    ).toThrow();
  });
});

describe("updateWorkoutSchema", () => {
  it("requires id, programId, name, and dayOfWeek", () => {
    const parsed = updateWorkoutSchema.parse({
      id: workoutId,
      programId,
      name: "Renamed",
      dayOfWeek: 2,
    });
    expect(parsed).toEqual({
      id: workoutId,
      programId,
      name: "Renamed",
      dayOfWeek: 2,
    });
  });

  it("rejects a non-uuid id", () => {
    expect(() =>
      updateWorkoutSchema.parse({
        id: "not-a-uuid",
        programId,
        name: "Renamed",
      }),
    ).toThrow();
  });

  it("still enforces the name rules", () => {
    expect(() =>
      updateWorkoutSchema.parse({ id: workoutId, programId, name: "" }),
    ).toThrow();
  });
});

describe("deleteWorkoutSchema", () => {
  it("accepts uuid id and programId", () => {
    expect(deleteWorkoutSchema.parse({ id: workoutId, programId })).toEqual({
      id: workoutId,
      programId,
    });
  });

  it("rejects non-uuid values", () => {
    expect(() =>
      deleteWorkoutSchema.parse({ id: "bad", programId }),
    ).toThrow();
    expect(() =>
      deleteWorkoutSchema.parse({ id: workoutId, programId: "bad" }),
    ).toThrow();
  });
});

describe("reorderWorkoutsSchema", () => {
  const id2 = "33333333-3333-4333-8333-333333333333";

  it("accepts a programId and a non-empty array of uuid ids", () => {
    const parsed = reorderWorkoutsSchema.parse({
      programId,
      ids: [workoutId, id2],
    });
    expect(parsed.ids).toHaveLength(2);
  });

  it("rejects an empty ids array", () => {
    expect(() =>
      reorderWorkoutsSchema.parse({ programId, ids: [] }),
    ).toThrow();
  });

  it("rejects non-uuid entries in the ids array", () => {
    expect(() =>
      reorderWorkoutsSchema.parse({ programId, ids: ["bad"] }),
    ).toThrow();
  });
});
