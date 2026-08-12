import { NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import en from "../../../../../../messages/en.json";
import { PersonalRecords } from "./personal-records";
import { EXPECTED_PRS } from "../../../../../../scripts/seed-synthetic";
import type { ExercisePrs, ProgramExercise } from "@/lib/analytics/query";

/**
 * The three PR kinds, against the ticket-017 fixture. The bench numbers are
 * the load-bearing ones: its reps record is 15 × 50kg from week 5, four weeks
 * before its other two records — which proves the kinds are tracked
 * separately — and it is emphatically NOT the 20 × 20kg warmup, which
 * out-reps every real set anyone has ever done.
 */

const exercises: ProgramExercise[] = [
  { exerciseId: "bench", name: "Barbell Bench Press" },
  { exerciseId: "unperformed", name: "Face Pull" },
];

const bench = EXPECTED_PRS.bench;
const prs = new Map<string, ExercisePrs>([
  [
    "bench",
    {
      exerciseId: "bench",
      heaviestWeightKg: bench.heaviestWeight,
      heaviestReps: bench.heaviestReps,
      heaviestSessionId: bench.heaviestSessionKey,
      bestE1rmKg: bench.bestE1rm,
      bestE1rmWeightKg: bench.heaviestWeight,
      bestE1rmReps: bench.heaviestReps,
      bestE1rmSessionId: bench.bestE1rmSessionKey,
      mostReps: bench.mostReps,
      mostRepsWeightKg: bench.mostRepsWeight,
      mostRepsSessionId: bench.mostRepsSessionKey,
    },
  ],
]);

function renderRecords() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PersonalRecords exercises={exercises} prs={prs} />
    </NextIntlClientProvider>,
  );
}

describe("PersonalRecords", () => {
  it("shows all three kinds for an exercise that has records", () => {
    renderRecords();

    expect(
      screen.getByText("Heaviest set").nextElementSibling,
    ).toHaveTextContent("77.5 kg × 8");
    expect(
      screen.getByText("Best est. 1RM").nextElementSibling,
    ).toHaveTextContent("98.2 kg est.");
    expect(screen.getByText("Most reps").nextElementSibling).toHaveTextContent(
      "15 × 50 kg",
    );
  });

  it("links each record to the session it happened in", () => {
    renderRecords();

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute(
      "href",
      `/history/${bench.heaviestSessionKey}`,
    );
    expect(links[1]).toHaveAttribute(
      "href",
      `/history/${bench.bestE1rmSessionKey}`,
    );
    // The reps record is four weeks earlier than the other two — a separate
    // kind, tracked separately, linking somewhere else.
    expect(links[2]).toHaveAttribute(
      "href",
      `/history/${bench.mostRepsSessionKey}`,
    );
    expect(bench.mostRepsSessionKey).not.toBe(bench.heaviestSessionKey);
  });

  it("says so, per exercise, when there are no records yet", () => {
    renderRecords();

    const facePull = screen.getByText("Face Pull").closest("li")!;
    expect(
      within(facePull).getByText("No records for this exercise yet."),
    ).toBeInTheDocument();
    expect(within(facePull).queryByRole("link")).not.toBeInTheDocument();
  });
});
