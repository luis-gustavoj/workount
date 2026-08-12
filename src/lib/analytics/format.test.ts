import { describe, expect, it } from "vitest";

import {
  EXPECTED_ADHERENCE,
  EXPECTED_BENCH_PROGRESSION,
  EXPECTED_E1RM_REFERENCE,
  EXPECTED_SQUAT_PROGRESSION,
  EXPECTED_VOLUME,
} from "../../../scripts/seed-synthetic";
import {
  MIN_TREND_POINTS,
  adherencePercent,
  axisTicks,
  hasTrend,
  markRecords,
  roundE1rm,
  shortDate,
  volumeDomainMax,
  weightDomain,
} from "./format";
import type { ExercisePrs, ProgressionPoint } from "./query";

// The expected numbers are imported from the ticket-017 fixture rather than
// re-typed here: these helpers exist to *display* those numbers, and the one
// failure that matters is the display drifting from the SQL.

describe("roundE1rm", () => {
  it("rounds to one decimal — it is an estimate, not a measurement", () => {
    expect(roundE1rm(137.08333333)).toBe(137.1);
    expect(roundE1rm(121)).toBe(121);
    expect(roundE1rm(116.66666667)).toBe(116.7);
  });

  it("keeps the reference comparison the right way round", () => {
    // 100 × 5 vs 110 × 3: the triple is the stronger set, and must still be
    // after rounding (CONTEXT.md — this is why we plot e1RM, not raw weight).
    const [fiveRep, triple] = EXPECTED_E1RM_REFERENCE;
    expect(roundE1rm(fiveRep.e1rm)).toBe(116.7);
    expect(roundE1rm(triple.e1rm)).toBe(121);
    expect(roundE1rm(triple.e1rm)).toBeGreaterThan(roundE1rm(fiveRep.e1rm));
  });
});

describe("weightDomain", () => {
  it("suppresses zero and snaps outward to whole plate steps", () => {
    // The squat e1RM curve: 119.58 … 137.08. A 0-based axis would flatten
    // eight weeks of progress into a straight line near the top.
    const domain = weightDomain(
      EXPECTED_SQUAT_PROGRESSION.map((p) => p.bestE1rm),
    );
    expect(domain).toEqual([115, 140]);
  });

  it("pads a single point instead of collapsing the axis", () => {
    const [lo, hi] = weightDomain([100]);
    expect(lo).toBeLessThan(100);
    expect(hi).toBeGreaterThan(100);
  });

  it("never dips below zero for light weights", () => {
    const [lo] = weightDomain([5, 7.5]);
    expect(lo).toBe(0);
  });

  it("covers both series when the top set and the e1RM are plotted together", () => {
    const values = EXPECTED_BENCH_PROGRESSION.flatMap((p) => [
      p.topSetWeight,
      p.bestE1rm,
    ]);
    const [lo, hi] = weightDomain(values);
    expect(lo).toBeLessThanOrEqual(60); // the lowest top set
    expect(hi).toBeGreaterThanOrEqual(98.17); // the best e1RM
  });
});

describe("volumeDomainMax", () => {
  it("rounds up to a readable tick, from a zero baseline", () => {
    // Bars carry magnitude, so the axis starts at 0 — only the top is chosen.
    expect(volumeDomainMax(EXPECTED_VOLUME.map((v) => v.volume))).toBe(2500);
    expect(volumeDomainMax([1830])).toBe(2000);
    expect(volumeDomainMax([420])).toBe(450);
  });

  it("gives an all-warmup program an axis rather than a zero-height one", () => {
    // The warmup-only session is volume 0 and is NOT filtered out (017).
    expect(volumeDomainMax([0])).toBeGreaterThan(0);
    expect(volumeDomainMax([])).toBeGreaterThan(0);
  });
});

describe("axisTicks", () => {
  it("lands on numbers a person reads, inside the domain", () => {
    // The volume axis: 0 → 2500 must not tick at 650 / 1300 / 1950.
    expect(axisTicks(0, 2500)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
  });

  it("keeps a weight axis on plate-sized steps", () => {
    // The squat progression's domain, top set and e1RM together.
    expect(axisTicks(95, 145)).toEqual([100, 110, 120, 130, 140]);
  });

  it("counts sessions in whole numbers on a small axis", () => {
    // A week has no half-session, so the adherence axis asks for whole steps.
    expect(axisTicks(0, 3, 1)).toEqual([0, 1, 2, 3]);
    expect(axisTicks(0, 6, 1)).toEqual([0, 2, 4, 6]);
    expect(axisTicks(0, 1, 1)).toEqual([0, 1]);
  });

  it("never returns a wall of ticks", () => {
    for (const [lo, hi] of [
      [0, 1],
      [0, 100],
      [0, 47_500],
      [95, 105],
      [117.5, 137.5],
    ] as const) {
      const ticks = axisTicks(lo, hi);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(6);
      expect(ticks[0]).toBeGreaterThanOrEqual(lo);
      expect(ticks.at(-1)!).toBeLessThanOrEqual(hi);
    }
  });

  it("degenerates gracefully on a zero-width domain", () => {
    expect(axisTicks(100, 100)).toEqual([100]);
  });
});

describe("adherencePercent", () => {
  it("reports the fixture's weeks as whole percentages, uncapped", () => {
    const percents = EXPECTED_ADHERENCE.map((w) =>
      adherencePercent(w.adherence),
    );
    expect(percents).toEqual([100, 100, 100, 150, 100, 0, 100, 100, 0]);
  });

  it("stays null when nothing is scheduled — undefined, not perfect", () => {
    expect(adherencePercent(null)).toBeNull();
  });

  it("rounds to a whole percent", () => {
    expect(adherencePercent(0.6667)).toBe(67);
  });
});

describe("hasTrend", () => {
  it("needs more than two points before a line means anything", () => {
    expect(MIN_TREND_POINTS).toBeGreaterThan(2);
    expect(hasTrend(0)).toBe(false);
    expect(hasTrend(1)).toBe(false);
    expect(hasTrend(2)).toBe(false);
    expect(hasTrend(MIN_TREND_POINTS)).toBe(true);
    expect(hasTrend(20)).toBe(true);
  });
});

describe("shortDate", () => {
  it("formats compactly for a 390px axis", () => {
    const label = shortDate("2026-08-12T18:04:00.000Z", "en-US");
    expect(label).toMatch(/Aug/);
    expect(label).toMatch(/12/);
    expect(label).not.toMatch(/2026/);
  });
});

describe("markRecords", () => {
  const point = (sessionId: string, e1rm: number): ProgressionPoint => ({
    sessionId,
    completedAt: "2026-08-12T18:04:00.000Z",
    topSetWeightKg: 100,
    topSetReps: 5,
    e1rmKg: e1rm,
  });

  const prs = (bestE1rmSessionId: string): ExercisePrs => ({
    exerciseId: "ex-1",
    heaviestWeightKg: 117.5,
    heaviestReps: 5,
    heaviestSessionId: bestE1rmSessionId,
    bestE1rmKg: 137.08,
    bestE1rmWeightKg: 117.5,
    bestE1rmReps: 5,
    bestE1rmSessionId,
    mostReps: 5,
    mostRepsWeightKg: 117.5,
    mostRepsSessionId: bestE1rmSessionId,
  });

  it("flags exactly the session the SQL says holds the record", () => {
    const points = [point("s1", 121), point("s2", 128.33), point("s3", 137.08)];
    expect(markRecords(points, prs("s3")).map((p) => p.isRecord)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("flags nothing when the record was set outside this program", () => {
    // v_exercise_prs crosses programs on purpose; the record's session simply
    // isn't on this chart, and no point should be dressed up as one.
    const points = [point("s1", 121), point("s2", 128.33)];
    expect(markRecords(points, prs("elsewhere")).some((p) => p.isRecord)).toBe(
      false,
    );
  });

  it("flags nothing when the exercise has no PR row at all", () => {
    expect(
      markRecords([point("s1", 121)], undefined).some((p) => p.isRecord),
    ).toBe(false);
  });
});
