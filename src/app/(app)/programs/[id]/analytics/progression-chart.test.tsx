import { NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../../../messages/en.json";
import { ProgressionChart } from "./progression-chart";
import {
  EXPECTED_PRS,
  EXPECTED_SQUAT_PROGRESSION,
} from "../../../../../../scripts/seed-synthetic";
import type { ExercisePrs, ProgressionPoint } from "@/lib/analytics/query";

// jsdom measures every element as 0×0, so Recharts' ResponsiveContainer would
// render nothing. Handing its child a fixed size makes the real SVG render —
// which is the point: the record marker is asserted on the actual chart, not
// only in the table beneath it.
vi.mock("recharts", async (importOriginal) => {
  // Imported inside the factory: `vi.mock` is hoisted above the file's own
  // imports, so a top-level binding isn't initialised yet when it runs.
  const { fixedSizeRecharts } = await import("@/test/recharts");
  return fixedSizeRecharts(
    importOriginal as () => Promise<typeof import("recharts")>,
  );
});

/**
 * The ticket-018 acceptance criterion: against the synthetic 8-week fixture
 * from 017, the e1RM curve matches the hand-calculated values and the PR
 * marker lands on the right session.
 *
 * The expectations are imported from that fixture rather than re-typed, so
 * the chart is pinned to the same numbers the SQL is asserted against
 * (scripts/test-analytics.ts). If a definition ever drifts, both fail.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_SESSION = Date.UTC(2026, 5, 1, 18, 0, 0);

const squatPoints: ProgressionPoint[] = EXPECTED_SQUAT_PROGRESSION.map(
  (expected, index) => ({
    sessionId: expected.key,
    completedAt: new Date(FIRST_SESSION + index * WEEK_MS).toISOString(),
    topSetWeightKg: expected.topSetWeight,
    topSetReps: expected.topSetReps,
    e1rmKg: expected.bestE1rm,
  }),
);

const squatPrs: ExercisePrs = {
  exerciseId: "squat",
  heaviestWeightKg: EXPECTED_PRS.squat.heaviestWeight,
  heaviestReps: EXPECTED_PRS.squat.heaviestReps,
  heaviestSessionId: EXPECTED_PRS.squat.heaviestSessionKey,
  bestE1rmKg: EXPECTED_PRS.squat.bestE1rm,
  bestE1rmWeightKg: EXPECTED_PRS.squat.heaviestWeight,
  bestE1rmReps: EXPECTED_PRS.squat.heaviestReps,
  bestE1rmSessionId: EXPECTED_PRS.squat.bestE1rmSessionKey,
  mostReps: EXPECTED_PRS.squat.mostReps,
  mostRepsWeightKg: EXPECTED_PRS.squat.mostRepsWeight,
  mostRepsSessionId: EXPECTED_PRS.squat.mostRepsSessionKey,
};

function renderChart(
  points: ProgressionPoint[],
  prs: ExercisePrs | undefined = squatPrs,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ProgressionChart points={points} prs={prs} />
    </NextIntlClientProvider>,
  );
}

describe("ProgressionChart", () => {
  it("reports the fixture's e1RM curve, rounded as the estimate it is", () => {
    renderChart(squatPoints);

    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    const e1rms = rows.map(
      (row) => within(row).getAllByRole("cell")[2].textContent,
    );

    // 121.0 · 119.58 · 122.5 · 125.42 · 128.33 · 134.17 · 137.08, hand-
    // calculated in scripts/seed-synthetic.ts, shown to one decimal.
    expect(e1rms).toEqual([
      "121 kg",
      "119.6 kg",
      "122.5 kg",
      "125.4 kg",
      "128.3 kg",
      "134.2 kg",
      "137.1 kgRecord",
    ]);
  });

  it("shows the top set beside it, because that is what the user put on the bar", () => {
    renderChart(squatPoints);

    const rows = screen.getAllByRole("row").slice(1);
    const topSets = rows.map(
      (row) => within(row).getAllByRole("cell")[1].textContent,
    );

    expect(topSets[0]).toBe("110 kg × 3");
    expect(topSets.at(-1)).toBe("117.5 kg × 5");
  });

  it("puts the record marker on the session the SQL says holds it", () => {
    const { container } = renderChart(squatPoints);

    // One signal-coloured dot on the chart, at the last point (w8A), and the
    // same session flagged in the table view.
    const recordDots = container.querySelectorAll(
      'circle[fill="var(--signal)"]',
    );
    expect(recordDots).toHaveLength(1);

    const rows = screen.getAllByRole("row").slice(1);
    const markedRows = rows.filter((row) => within(row).queryByText("Record"));
    expect(markedRows).toHaveLength(1);
    expect(within(markedRows[0]).getByRole("link")).toHaveAttribute(
      "href",
      `/history/${EXPECTED_PRS.squat.bestE1rmSessionKey}`,
    );
  });

  it("marks nothing when the record was set outside this program", () => {
    const { container } = renderChart(squatPoints, {
      ...squatPrs,
      bestE1rmSessionId: "a-session-in-another-program",
    });

    expect(
      container.querySelectorAll('circle[fill="var(--signal)"]'),
    ).toHaveLength(0);
    expect(screen.queryByText("Record")).not.toBeInTheDocument();
  });

  it("leads with the latest estimate and the set it came from", () => {
    renderChart(squatPoints);

    const readout = screen.getByText("Latest est. 1RM").parentElement!;
    expect(within(readout).getByText("137.1 kg")).toBeInTheDocument();
    expect(within(readout).getByText("from 117.5 kg × 5")).toBeInTheDocument();
  });

  it("refuses to draw a trend through two points", () => {
    const { container } = renderChart(squatPoints.slice(0, 2));

    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
    // The numbers are still there — "not enough for a line" is not "nothing".
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("draws the line once a third session exists", () => {
    const { container } = renderChart(squatPoints.slice(0, 3));

    expect(screen.queryByText("Not enough data yet")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("says so plainly when the exercise was never performed here", () => {
    const { container } = renderChart([]);

    expect(screen.getByText("Not performed yet")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("ticks the weight axis at round numbers", () => {
    const { container } = renderChart(squatPoints);

    // The weight ticks are the bare numbers; the date ticks below the plot
    // carry a month name.
    const yTicks = [...container.querySelectorAll("svg text")]
      .map((tick) => tick.textContent ?? "")
      .filter((text) => /^\d+$/.test(text));

    // Not 95 / 110 / 125 / 145, which is what an evenly-divided domain gives.
    expect(yTicks).toEqual(["100", "110", "120", "130", "140"]);
  });

  it("names both series, so identity never rests on colour alone", () => {
    renderChart(squatPoints);

    const legend = screen.getByRole("list", { name: "Legend" });
    expect(within(legend).getByText("Est. 1RM")).toBeInTheDocument();
    expect(within(legend).getByText("Top set")).toBeInTheDocument();
    expect(within(legend).getByText("Record")).toBeInTheDocument();
  });
});
