import { describe, expect, it } from "vitest";

import {
  groupSetsByExercise,
  minutesFromSeconds,
  relativeDateHint,
  roundVolume,
} from "./format";
import type { HistorySetDetail } from "./query";

// Pure date math for the /history list's relative hint (ticket 016:
// "people navigate history by... 'last Tuesday', not by ISO dates"). Kept
// separate from the page component so it's testable without rendering
// anything — see src/lib/session/rest.ts for the sibling pattern.

const NOW = new Date(2026, 6, 16, 9, 0, 0).getTime(); // Thu 2026-07-16, 09:00 local

function at(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month, day, hour).toISOString();
}

describe("relativeDateHint", () => {
  it("returns 'today' for a session completed earlier the same calendar day", () => {
    expect(relativeDateHint(at(2026, 6, 16, 7), NOW)).toEqual({
      kind: "today",
    });
  });

  it("returns 'today' even for a session completed minutes ago", () => {
    const justNow = new Date(NOW - 5 * 60_000).toISOString();
    expect(relativeDateHint(justNow, NOW)).toEqual({ kind: "today" });
  });

  it("returns 'yesterday' for the previous calendar day, regardless of hour", () => {
    // Late last night — under 12h ago, but a different calendar day.
    expect(relativeDateHint(at(2026, 6, 15, 23), NOW)).toEqual({
      kind: "yesterday",
    });
  });

  it("returns 'yesterday' for a session early the previous morning", () => {
    expect(relativeDateHint(at(2026, 6, 15, 6), NOW)).toEqual({
      kind: "yesterday",
    });
  });

  it("returns daysAgo for 2-6 calendar days back", () => {
    expect(relativeDateHint(at(2026, 6, 14), NOW)).toEqual({
      kind: "daysAgo",
      days: 2,
    });
    expect(relativeDateHint(at(2026, 6, 10), NOW)).toEqual({
      kind: "daysAgo",
      days: 6,
    });
  });

  it("returns null (fall back to the absolute date) 7+ calendar days back", () => {
    expect(relativeDateHint(at(2026, 6, 9), NOW)).toBeNull();
    expect(relativeDateHint(at(2025, 11, 25), NOW)).toBeNull();
  });

  it("returns null for a session in the future (clock skew) rather than a negative count", () => {
    expect(relativeDateHint(at(2026, 6, 17), NOW)).toBeNull();
  });
});

// groupSetsByExercise — /history/[id] shows "every exercise, every set"
// (ticket 016), grouped, in the order they were performed.

function set(overrides: Partial<HistorySetDetail> = {}): HistorySetDetail {
  return {
    id: "set-1",
    exerciseId: "ex-1",
    exerciseName: "Barbell Bench Press",
    position: 0,
    setNumber: 1,
    weight: 80,
    reps: 8,
    isWarmup: false,
    targetRepMin: 8,
    targetRepMax: 10,
    isPr: false,
    ...overrides,
  };
}

describe("groupSetsByExercise", () => {
  it("returns an empty list for no sets", () => {
    expect(groupSetsByExercise([])).toEqual([]);
  });

  it("groups consecutive sets of the same exercise together", () => {
    const sets = [
      set({ id: "s1", setNumber: 1 }),
      set({ id: "s2", setNumber: 2 }),
      set({ id: "s3", setNumber: 3 }),
    ];
    const groups = groupSetsByExercise(sets);

    expect(groups).toHaveLength(1);
    expect(groups[0].exerciseId).toBe("ex-1");
    expect(groups[0].sets.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("preserves session order across multiple exercises, in first-appearance order", () => {
    const sets = [
      set({ id: "bench-1", exerciseId: "ex-bench", position: 0 }),
      set({ id: "squat-1", exerciseId: "ex-squat", position: 1 }),
      set({ id: "bench-2", exerciseId: "ex-bench", position: 0, setNumber: 2 }),
    ];
    const groups = groupSetsByExercise(sets);

    expect(groups.map((g) => g.exerciseId)).toEqual(["ex-bench", "ex-squat"]);
    expect(groups[0].sets.map((s) => s.id)).toEqual(["bench-1", "bench-2"]);
    expect(groups[1].sets.map((s) => s.id)).toEqual(["squat-1"]);
  });

  it("takes the target rep range from the group's first set", () => {
    const groups = groupSetsByExercise([
      set({ targetRepMin: 8, targetRepMax: 10 }),
    ]);
    expect(groups[0]).toMatchObject({ targetRepMin: 8, targetRepMax: 10 });
  });

  it("keeps warmups in the group's set list (never dropped, only marked)", () => {
    const sets = [
      set({ id: "warmup", isWarmup: true, weight: 20 }),
      set({ id: "working", isWarmup: false, weight: 80 }),
    ];
    const groups = groupSetsByExercise(sets);
    expect(groups[0].sets.map((s) => s.id)).toEqual(["warmup", "working"]);
  });
});

// Shared display rounding — both /history and /history/[id] need these, so
// they live here rather than each page recomputing the same one-liner.

describe("minutesFromSeconds", () => {
  it("rounds seconds to the nearest whole minute", () => {
    expect(minutesFromSeconds(3120)).toBe(52);
    expect(minutesFromSeconds(89)).toBe(1);
  });

  it("passes null through (a session summary's duration can be null)", () => {
    expect(minutesFromSeconds(null)).toBeNull();
  });
});

describe("roundVolume", () => {
  it("rounds a volume in kg to the nearest whole number for display", () => {
    expect(roundVolume(1134.5)).toBe(1135);
    expect(roundVolume(1134.49)).toBe(1134);
  });
});
