import { NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../../../messages/en.json";
import { AdherenceChart } from "./adherence-chart";
import { EXPECTED_ADHERENCE } from "../../../../../../scripts/seed-synthetic";
import type { AdherenceWeek } from "@/lib/analytics/query";

vi.mock("recharts", async (importOriginal) => {
  // Imported inside the factory: `vi.mock` is hoisted above the file's own
  // imports, so a top-level binding isn't initialised yet when it runs.
  const { fixedSizeRecharts } = await import("@/test/recharts");
  return fixedSizeRecharts(
    importOriginal as () => Promise<typeof import("recharts")>,
  );
});

/**
 * Adherence against the ticket-017 fixture: nine contiguous weeks, one of them
 * skipped entirely and one of them over-trained. Both are the point — a chart
 * that quietly omits the weeks you didn't train is a chart that says you never
 * miss, and one that caps 150% at 100% hides the extra session.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_MONDAY = Date.UTC(2026, 5, 1); // 1 Jun 2026 is a Monday

const weeks: AdherenceWeek[] = EXPECTED_ADHERENCE.map((expected, index) => ({
  weekStart: new Date(FIRST_MONDAY + index * WEEK_MS).toISOString(),
  completedSessions: expected.completed,
  scheduledWorkouts: expected.scheduled,
  adherence: expected.adherence,
}));

function renderChart(data: AdherenceWeek[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AdherenceChart weeks={data} />
    </NextIntlClientProvider>,
  );
}

describe("AdherenceChart", () => {
  it("shows every week the fixture has, skipped ones included", () => {
    renderChart(weeks);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(EXPECTED_ADHERENCE.length);

    const completed = rows.map(
      (row) => within(row).getAllByRole("cell")[1].textContent,
    );
    expect(completed).toEqual(["2", "2", "2", "3", "2", "0", "2", "2", "0"]);
  });

  it("reports adherence uncapped — 150% stays 150%", () => {
    renderChart(weeks);

    const percents = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[2].textContent);

    expect(percents).toEqual([
      "100%",
      "100%",
      "100%",
      "150%",
      "100%",
      "0%",
      "100%",
      "100%",
      "0%",
    ]);
  });

  it("numbers the weeks from the start of the block", () => {
    renderChart(weeks);

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getAllByRole("cell")[0]).toHaveTextContent("W1");
    expect(within(rows[8]).getAllByRole("cell")[0]).toHaveTextContent("W9");
  });

  it("draws the scheduled count as a target line, not a second bar series", () => {
    const { container } = renderChart(weeks);

    expect(
      container.querySelectorAll(".recharts-reference-line-line"),
    ).toHaveLength(1);
    const legend = screen.getByRole("list", { name: "Legend" });
    expect(within(legend).getByText("Scheduled")).toBeInTheDocument();
  });

  it("survives a program with no weeks at all", () => {
    renderChart([]);

    expect(screen.getAllByRole("row")).toHaveLength(1); // the header only
  });

  it("says there is nothing to measure against when no workout is scheduled", () => {
    const { container } = renderChart(
      weeks.map((week) => ({
        ...week,
        scheduledWorkouts: 0,
        adherence: null,
      })),
    );

    expect(
      screen.getByText(
        "None of this program’s workouts are set to a day of the week, so there’s nothing to measure against.",
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(".recharts-reference-line-line"),
    ).toHaveLength(0);

    // Undefined, not perfect, and not zero.
    const firstRow = screen.getAllByRole("row")[1];
    expect(within(firstRow).getAllByRole("cell")[2]).toHaveTextContent("—");
  });
});
