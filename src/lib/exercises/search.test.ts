import { describe, expect, it } from "vitest";

import { findNearDuplicates, matchesQuery, toExerciseOption, type ExerciseRow } from "./search";

// A slice of the real seeded catalog (supabase/seed.sql) plus one custom, so
// these tests exercise the actual naming convention the ticket cares about:
// equipment-prefixed names disambiguating a shared movement.
const CATALOG: ExerciseRow[] = [
  { id: "1", name: "Barbell Bench Press", muscle_group: "chest", equipment: "barbell", user_id: null },
  { id: "2", name: "Barbell Incline Bench Press", muscle_group: "chest", equipment: "barbell", user_id: null },
  { id: "3", name: "Barbell Close-Grip Bench Press", muscle_group: "triceps", equipment: "barbell", user_id: null },
  { id: "4", name: "Dumbbell Bench Press", muscle_group: "chest", equipment: "dumbbell", user_id: null },
  { id: "5", name: "Dumbbell Incline Bench Press", muscle_group: "chest", equipment: "dumbbell", user_id: null },
  { id: "6", name: "Dumbbell Row", muscle_group: "back", equipment: "dumbbell", user_id: null },
  { id: "7", name: "Barbell Curl", muscle_group: "biceps", equipment: "barbell", user_id: null },
  { id: "8", name: "Seated Cable Row", muscle_group: "back", equipment: "cable", user_id: null },
  { id: "9", name: "Bench Press (paused)", muscle_group: "chest", equipment: "barbell", user_id: "user-1" },
];

describe("toExerciseOption", () => {
  it("marks a null user_id as not custom", () => {
    expect(toExerciseOption(CATALOG[0]).isCustom).toBe(false);
  });

  it("marks a non-null user_id as custom", () => {
    expect(toExerciseOption(CATALOG[8]).isCustom).toBe(true);
  });

  it("maps snake_case columns to camelCase fields", () => {
    expect(toExerciseOption(CATALOG[0])).toEqual({
      id: "1",
      name: "Barbell Bench Press",
      muscleGroup: "chest",
      equipment: "barbell",
      isCustom: false,
    });
  });
});

describe("matchesQuery", () => {
  it("matches everything on an empty query", () => {
    expect(matchesQuery("Barbell Bench Press", "")).toBe(true);
    expect(matchesQuery("Barbell Bench Press", "   ")).toBe(true);
  });

  it("is a case-insensitive substring match", () => {
    expect(matchesQuery("Barbell Bench Press", "bench")).toBe(true);
    expect(matchesQuery("Barbell Bench Press", "BENCH")).toBe(true);
    expect(matchesQuery("Barbell Bench Press", "Bench")).toBe(true);
  });

  it("'bench' finds the barbell, dumbbell, and incline variants (acceptance)", () => {
    const names = CATALOG.filter((e) => matchesQuery(e.name, "bench")).map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Barbell Bench Press",
        "Barbell Incline Bench Press",
        "Barbell Close-Grip Bench Press",
        "Dumbbell Bench Press",
        "Dumbbell Incline Bench Press",
      ]),
    );
  });

  it("matches a full contiguous phrase", () => {
    expect(matchesQuery("Barbell Bench Press", "bench press")).toBe(true);
  });

  it("does not match an unrelated query", () => {
    expect(matchesQuery("Barbell Bench Press", "squat")).toBe(false);
  });

  it("matches word prefixes across tokens, in any order", () => {
    expect(matchesQuery("Barbell Bench Press", "pre ben")).toBe(true);
  });

  it("expands the 'bb' abbreviation to 'barbell'", () => {
    expect(matchesQuery("Barbell Bench Press", "bb bench")).toBe(true);
  });

  it("expands the 'db' abbreviation to 'dumbbell'", () => {
    expect(matchesQuery("Dumbbell Row", "db row")).toBe(true);
  });

  it("does not let 'db' match a barbell exercise", () => {
    expect(matchesQuery("Barbell Curl", "db")).toBe(false);
  });

  it("requires every query token to match", () => {
    expect(matchesQuery("Dumbbell Row", "db squat")).toBe(false);
  });
});

describe("findNearDuplicates", () => {
  it("suggests existing exercises whose name contains the typed one", () => {
    const results = findNearDuplicates(
      "Bench Press",
      CATALOG.map((e) => ({ id: e.id, name: e.name })),
    );
    const names = results.map((r) => r.name);
    expect(names).toContain("Barbell Bench Press");
    expect(names).toContain("Dumbbell Bench Press");
  });

  it("ranks the fewest-extra-words match first", () => {
    const results = findNearDuplicates(
      "Bench Press",
      CATALOG.map((e) => ({ id: e.id, name: e.name })),
    );
    // "Barbell Bench Press" / "Dumbbell Bench Press" (1 extra word) should
    // outrank "Barbell Incline Bench Press" (2 extra words).
    expect(results[0].name).not.toBe("Barbell Incline Bench Press");
  });

  it("includes and ranks first an exact case-insensitive match", () => {
    // The unique index is scoped to user_id (migration 0001), so a custom
    // named identically to an existing GLOBAL exercise is not rejected by
    // the database — this is the one case the warning must not skip.
    const results = findNearDuplicates("barbell bench press", [
      { id: "1", name: "Barbell Incline Bench Press" },
      { id: "2", name: "Barbell Bench Press" },
    ]);
    expect(results[0].name).toBe("Barbell Bench Press");
  });

  it("respects the limit", () => {
    const results = findNearDuplicates(
      "Bench Press",
      CATALOG.map((e) => ({ id: e.id, name: e.name })),
      1,
    );
    expect(results).toHaveLength(1);
  });

  it("returns nothing for an unrelated name", () => {
    const results = findNearDuplicates(
      "Nordic Hamstring Curl",
      CATALOG.map((e) => ({ id: e.id, name: e.name })),
    );
    expect(results).toEqual([]);
  });

  it("returns nothing for a blank name", () => {
    const results = findNearDuplicates(
      "   ",
      CATALOG.map((e) => ({ id: e.id, name: e.name })),
    );
    expect(results).toEqual([]);
  });
});
