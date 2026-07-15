import { describe, expect, it } from "vitest";

import {
  createWorkoutExerciseSchema,
  deleteWorkoutExerciseSchema,
  notesSchema,
  NOTES_MAX,
  repMaxSchema,
  repMinSchema,
  reorderWorkoutExercisesSchema,
  restSecondsSchema,
  REST_SECONDS_MAX,
  supersetGroupSchema,
  targetSetsSchema,
  TARGET_SETS_MAX,
  updateWorkoutExerciseSchema,
} from "./workout-exercise";

const workoutId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const exerciseId = "33333333-3333-4333-8333-333333333333";
const workoutExerciseId = "44444444-4444-4444-8444-444444444444";

const validCreate = {
  workoutId,
  programId,
  exerciseId,
  targetSets: 4,
  repMin: 6,
  repMax: 8,
  restSeconds: 120,
  notes: "Pause 1s at the chest.",
  supersetGroup: null,
};

describe("targetSetsSchema", () => {
  it("accepts values in range", () => {
    expect(targetSetsSchema.parse(1)).toBe(1);
    expect(targetSetsSchema.parse(20)).toBe(20);
    expect(targetSetsSchema.parse("4")).toBe(4);
  });

  it("rejects below the minimum", () => {
    expect(() => targetSetsSchema.parse(0)).toThrow();
  });

  it("rejects above the maximum", () => {
    expect(() => targetSetsSchema.parse(TARGET_SETS_MAX + 1)).toThrow();
  });

  it("rejects non-integers", () => {
    expect(() => targetSetsSchema.parse(3.5)).toThrow();
  });
});

describe("repMinSchema / repMaxSchema", () => {
  it("accepts 1 and above", () => {
    expect(repMinSchema.parse(1)).toBe(1);
    expect(repMaxSchema.parse(1)).toBe(1);
  });

  it("rejects below 1", () => {
    expect(() => repMinSchema.parse(0)).toThrow();
    expect(() => repMaxSchema.parse(0)).toThrow();
  });

  it("coerces numeric strings", () => {
    expect(repMinSchema.parse("8")).toBe(8);
  });
});

describe("restSecondsSchema", () => {
  it("collapses null, undefined, and empty string to null (inheritance, not a copy)", () => {
    expect(restSecondsSchema.parse(null)).toBeNull();
    expect(restSecondsSchema.parse(undefined)).toBeNull();
    expect(restSecondsSchema.parse("")).toBeNull();
  });

  it("accepts a value in range", () => {
    expect(restSecondsSchema.parse(120)).toBe(120);
    expect(restSecondsSchema.parse("90")).toBe(90);
  });

  it("accepts the minimum of 0", () => {
    expect(restSecondsSchema.parse(0)).toBe(0);
  });

  it("rejects a negative value", () => {
    expect(() => restSecondsSchema.parse(-1)).toThrow();
  });

  it("rejects above the maximum", () => {
    expect(() => restSecondsSchema.parse(REST_SECONDS_MAX + 1)).toThrow();
  });
});

describe("notesSchema", () => {
  it("collapses missing, empty, and whitespace-only to null", () => {
    expect(notesSchema.parse(undefined)).toBeNull();
    expect(notesSchema.parse("")).toBeNull();
    expect(notesSchema.parse("   ")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(notesSchema.parse("  Pause at the chest.  ")).toBe("Pause at the chest.");
  });

  it("rejects a value longer than the maximum", () => {
    expect(() => notesSchema.parse("x".repeat(NOTES_MAX + 1))).toThrow();
  });

  it("accepts a value exactly at the maximum", () => {
    const notes = "x".repeat(NOTES_MAX);
    expect(notesSchema.parse(notes)).toBe(notes);
  });
});

describe("supersetGroupSchema", () => {
  it("collapses missing, empty, and whitespace-only to null", () => {
    expect(supersetGroupSchema.parse(undefined)).toBeNull();
    expect(supersetGroupSchema.parse(null)).toBeNull();
    expect(supersetGroupSchema.parse("")).toBeNull();
    expect(supersetGroupSchema.parse("  ")).toBeNull();
  });

  it("accepts a single uppercase letter", () => {
    expect(supersetGroupSchema.parse("A")).toBe("A");
    expect(supersetGroupSchema.parse("B")).toBe("B");
  });

  it("uppercases a lowercase letter", () => {
    expect(supersetGroupSchema.parse("a")).toBe("A");
  });

  it("trims surrounding whitespace", () => {
    expect(supersetGroupSchema.parse(" a ")).toBe("A");
  });

  it("rejects more than one letter", () => {
    expect(() => supersetGroupSchema.parse("AA")).toThrow();
  });

  it("rejects a digit", () => {
    expect(() => supersetGroupSchema.parse("1")).toThrow();
  });
});

describe("createWorkoutExerciseSchema", () => {
  it("accepts a full valid prescription", () => {
    const parsed = createWorkoutExerciseSchema.parse(validCreate);
    expect(parsed).toEqual(validCreate);
  });

  it("accepts an omitted rest, notes, and superset group as null", () => {
    const parsed = createWorkoutExerciseSchema.parse({
      workoutId,
      programId,
      exerciseId,
      targetSets: 3,
      repMin: 8,
      repMax: 12,
      restSeconds: null,
      notes: null,
      supersetGroup: null,
    });
    expect(parsed.restSeconds).toBeNull();
    expect(parsed.notes).toBeNull();
    expect(parsed.supersetGroup).toBeNull();
  });

  it("accepts rep_min === rep_max (a fixed target, e.g. 5x5)", () => {
    const parsed = createWorkoutExerciseSchema.parse({
      ...validCreate,
      repMin: 5,
      repMax: 5,
    });
    expect(parsed.repMin).toBe(5);
    expect(parsed.repMax).toBe(5);
  });

  it("rejects rep_max below rep_min", () => {
    expect(() =>
      createWorkoutExerciseSchema.parse({ ...validCreate, repMin: 10, repMax: 8 }),
    ).toThrow();
  });

  it("rejects a non-uuid workoutId, programId, or exerciseId", () => {
    expect(() =>
      createWorkoutExerciseSchema.parse({ ...validCreate, workoutId: "bad" }),
    ).toThrow();
    expect(() =>
      createWorkoutExerciseSchema.parse({ ...validCreate, programId: "bad" }),
    ).toThrow();
    expect(() =>
      createWorkoutExerciseSchema.parse({ ...validCreate, exerciseId: "bad" }),
    ).toThrow();
  });
});

describe("updateWorkoutExerciseSchema", () => {
  const validUpdate = { ...validCreate, id: workoutExerciseId };

  it("accepts a full valid update", () => {
    const parsed = updateWorkoutExerciseSchema.parse(validUpdate);
    expect(parsed.id).toBe(workoutExerciseId);
  });

  it("rejects rep_max below rep_min", () => {
    expect(() =>
      updateWorkoutExerciseSchema.parse({ ...validUpdate, repMin: 10, repMax: 8 }),
    ).toThrow();
  });

  it("rejects a non-uuid id", () => {
    expect(() =>
      updateWorkoutExerciseSchema.parse({ ...validUpdate, id: "bad" }),
    ).toThrow();
  });
});

describe("deleteWorkoutExerciseSchema", () => {
  it("accepts uuid id, workoutId, and programId", () => {
    expect(
      deleteWorkoutExerciseSchema.parse({ id: workoutExerciseId, workoutId, programId }),
    ).toEqual({ id: workoutExerciseId, workoutId, programId });
  });

  it("rejects non-uuid values", () => {
    expect(() =>
      deleteWorkoutExerciseSchema.parse({ id: "bad", workoutId, programId }),
    ).toThrow();
  });
});

describe("reorderWorkoutExercisesSchema", () => {
  it("accepts a workoutId, programId, and a non-empty array of uuid ids", () => {
    const parsed = reorderWorkoutExercisesSchema.parse({
      workoutId,
      programId,
      ids: [workoutExerciseId, exerciseId],
    });
    expect(parsed.ids).toHaveLength(2);
  });

  it("rejects an empty ids array", () => {
    expect(() =>
      reorderWorkoutExercisesSchema.parse({ workoutId, programId, ids: [] }),
    ).toThrow();
  });

  it("rejects a non-uuid programId", () => {
    expect(() =>
      reorderWorkoutExercisesSchema.parse({
        workoutId,
        programId: "bad",
        ids: [workoutExerciseId],
      }),
    ).toThrow();
  });
});
