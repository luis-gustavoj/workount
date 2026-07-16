import { describe, expect, it } from "vitest";

import { calculateStreak } from "./streak";

const TODAY = Date.parse("2026-07-16T18:00:00.000Z"); // Thursday

describe("calculateStreak", () => {
  it("is zero with no completed sessions", () => {
    expect(calculateStreak([], TODAY)).toBe(0);
  });

  it("counts today alone as a streak of one", () => {
    expect(calculateStreak(["2026-07-16T08:00:00.000Z"], TODAY)).toBe(1);
  });

  it("counts consecutive days ending today", () => {
    const dates = [
      "2026-07-16T08:00:00.000Z",
      "2026-07-15T08:00:00.000Z",
      "2026-07-14T08:00:00.000Z",
    ];
    expect(calculateStreak(dates, TODAY)).toBe(3);
  });

  it("still counts a streak ending yesterday — not yet broken before today's training", () => {
    const dates = ["2026-07-15T08:00:00.000Z", "2026-07-14T08:00:00.000Z"];
    expect(calculateStreak(dates, TODAY)).toBe(2);
  });

  it("breaks on a skipped day", () => {
    const dates = ["2026-07-16T08:00:00.000Z", "2026-07-13T08:00:00.000Z"];
    expect(calculateStreak(dates, TODAY)).toBe(1);
  });

  it("multiple sessions on the same day count once", () => {
    const dates = ["2026-07-16T08:00:00.000Z", "2026-07-16T19:00:00.000Z"];
    expect(calculateStreak(dates, TODAY)).toBe(1);
  });

  it("is zero when the most recent session was more than a day ago", () => {
    expect(calculateStreak(["2026-07-13T08:00:00.000Z"], TODAY)).toBe(0);
  });
});
