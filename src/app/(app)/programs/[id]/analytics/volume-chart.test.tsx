import { NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../../../messages/en.json";
import { VolumeChart } from "./volume-chart";
import { EXPECTED_VOLUME } from "../../../../../../scripts/seed-synthetic";
import type { VolumePoint } from "@/lib/analytics/query";

vi.mock("recharts", async (importOriginal) => {
  // Imported inside the factory: `vi.mock` is hoisted above the file's own
  // imports, so a top-level binding isn't initialised yet when it runs.
  const { fixedSizeRecharts } = await import("@/test/recharts");
  return fixedSizeRecharts(
    importOriginal as () => Promise<typeof import("recharts")>,
  );
});

/**
 * Volume per session, against the ticket-017 fixture. The number that matters
 * most here is the zero: the week-4 session was nothing but warmups, and it
 * must appear as a real 0 rather than be dropped or inflated to 800.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_SESSION = Date.UTC(2026, 5, 1, 18, 0, 0);

const points: VolumePoint[] = EXPECTED_VOLUME.map((expected, index) => ({
  sessionId: expected.key,
  completedAt: new Date(FIRST_SESSION + index * 3 * DAY_MS).toISOString(),
  workoutName: expected.key.endsWith("A") ? "Squat Day" : "Bench Day",
  volumeKg: expected.volume,
}));

function renderChart(data: VolumePoint[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <VolumeChart points={data} />
    </NextIntlClientProvider>,
  );
}

describe("VolumeChart", () => {
  it("reports every completed session's volume, straight from the SQL", () => {
    renderChart(points);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(EXPECTED_VOLUME.length);

    const volumes = rows.map(
      (row) => within(row).getAllByRole("cell")[2].textContent,
    );
    expect(volumes[0]).toBe("1,830 kg");
    expect(volumes.at(-1)).toBe("1,860 kg");
  });

  it("draws the warmup-only session as the zero it is", () => {
    renderChart(points);

    const warmupOnly = EXPECTED_VOLUME.findIndex(
      (v) => v.key === "w4-warmup-only",
    );
    expect(EXPECTED_VOLUME[warmupOnly].volume).toBe(0);

    const row = screen.getAllByRole("row").slice(1)[warmupOnly];
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent("0 kg");
    // Still a session that happened — it keeps its link into history.
    expect(within(row).getByRole("link")).toHaveAttribute(
      "href",
      "/history/w4-warmup-only",
    );
  });

  it("renders a bar for every session, including the zero one", () => {
    const { container } = renderChart(points);

    expect(container.querySelector("svg")).not.toBeNull();

    const bars = container.querySelectorAll("path.recharts-rectangle");
    expect(bars).toHaveLength(EXPECTED_VOLUME.length);
    // Grey, not signal: a chart is not live (DESIGN.md).
    expect(bars[0].getAttribute("fill")).toBe("var(--ink-faint)");
  });

  it("survives an empty program rather than crashing on an empty axis", () => {
    // The page short-circuits to its own empty state before it gets here, but
    // an axis with no data under it must never be a crash either.
    renderChart([]);

    expect(screen.getAllByRole("row")).toHaveLength(1); // the header only
  });

  it("names a session whose workout was later deleted", () => {
    renderChart([{ ...points[0], workoutName: null }]);

    expect(screen.getByText("Deleted workout")).toBeInTheDocument();
  });
});
