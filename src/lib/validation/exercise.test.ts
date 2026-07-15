import { describe, expect, it } from "vitest";

import { createCustomExerciseSchema, EXERCISE_NAME_MAX, exerciseNameSchema } from "./exercise";

describe("exerciseNameSchema", () => {
  it("trims surrounding whitespace", () => {
    expect(exerciseNameSchema.parse("  Bench Press  ")).toBe("Bench Press");
  });

  it("rejects an empty name", () => {
    expect(() => exerciseNameSchema.parse("")).toThrow();
  });

  it("rejects a whitespace-only name", () => {
    expect(() => exerciseNameSchema.parse("   ")).toThrow();
  });

  it("rejects a name longer than the maximum", () => {
    expect(() => exerciseNameSchema.parse("x".repeat(EXERCISE_NAME_MAX + 1))).toThrow();
  });

  it("accepts a name exactly at the maximum", () => {
    const name = "x".repeat(EXERCISE_NAME_MAX);
    expect(exerciseNameSchema.parse(name)).toBe(name);
  });
});

describe("createCustomExerciseSchema", () => {
  it("accepts a valid custom exercise", () => {
    const parsed = createCustomExerciseSchema.parse({
      name: "Bench Press (paused)",
      muscleGroup: "chest",
      equipment: "barbell",
    });
    expect(parsed).toEqual({
      name: "Bench Press (paused)",
      muscleGroup: "chest",
      equipment: "barbell",
    });
  });

  it("rejects a muscle group outside the enum", () => {
    expect(() =>
      createCustomExerciseSchema.parse({
        name: "Bench Press",
        muscleGroup: "abs",
        equipment: "barbell",
      }),
    ).toThrow();
  });

  it("rejects an equipment outside the enum", () => {
    expect(() =>
      createCustomExerciseSchema.parse({
        name: "Bench Press",
        muscleGroup: "chest",
        equipment: "resistance-band",
      }),
    ).toThrow();
  });

  it("rejects a missing name", () => {
    expect(() =>
      createCustomExerciseSchema.parse({ muscleGroup: "chest", equipment: "barbell" }),
    ).toThrow();
  });
});
