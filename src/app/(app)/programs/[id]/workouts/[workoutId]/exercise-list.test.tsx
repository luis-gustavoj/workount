import { NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../../../messages/en.json";
import { ExerciseList } from "./exercise-list";
import {
  deleteWorkoutExercise,
  updateWorkoutExercise,
} from "@/app/(app)/programs/actions";
import type { WorkoutExercisePrescription } from "@/lib/workouts/queries";

vi.mock("@/app/(app)/programs/actions", () => ({
  deleteWorkoutExercise: vi.fn(),
  updateWorkoutExercise: vi.fn(),
  reorderWorkoutExercises: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const mockUpdateWorkoutExercise = vi.mocked(updateWorkoutExercise);

const WORKOUT_ID = "11111111-1111-4111-8111-111111111111";
const PROGRAM_ID = "22222222-2222-4222-8222-222222222222";

function item(overrides: Partial<WorkoutExercisePrescription>): WorkoutExercisePrescription {
  return {
    id: "we-1",
    exerciseId: "ex-1",
    exerciseName: "Barbell Bench Press",
    muscleGroup: "chest",
    equipment: "barbell",
    position: 0,
    targetSets: 4,
    repMin: 6,
    repMax: 8,
    restSeconds: 120,
    notes: null,
    supersetGroup: null,
    ...overrides,
  };
}

function renderList(items: WorkoutExercisePrescription[]) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ExerciseList
        items={items}
        workoutId={WORKOUT_ID}
        programId={PROGRAM_ID}
        defaultRestSeconds={90}
      />
    </NextIntlClientProvider>,
  );
}

describe("ExerciseList", () => {
  beforeEach(() => {
    vi.mocked(deleteWorkoutExercise).mockReset();
    mockUpdateWorkoutExercise.mockReset();
    mockUpdateWorkoutExercise.mockResolvedValue({ ok: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renders each exercise with its muscle group and equipment", () => {
    renderList([
      item({ id: "we-1", exerciseName: "Barbell Bench Press", muscleGroup: "chest" }),
      item({ id: "we-2", exerciseName: "Barbell Row", muscleGroup: "back" }),
    ]);

    expect(screen.getByText("Barbell Bench Press")).toBeInTheDocument();
    expect(screen.getByText("Barbell Row")).toBeInTheDocument();
    expect(screen.getByText("Barbell · Chest")).toBeInTheDocument();
    expect(screen.getByText("Barbell · Back")).toBeInTheDocument();
  });

  it("shows a superset badge only for a grouped exercise", () => {
    renderList([
      item({ id: "we-1", supersetGroup: "A" }),
      item({ id: "we-2", exerciseName: "Incline DB Press", supersetGroup: null }),
    ]);

    // Scoped to the badge itself — "Group A" also appears as an <option> in
    // each row's superset <select>, which this must not match.
    expect(
      screen.getByText("Group A", { selector: "[data-slot='badge']" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Group A", { selector: "[data-slot='badge']" })).toHaveLength(1);
  });

  it("gives two concurrent superset groups visibly different left-edge accents", () => {
    renderList([
      item({ id: "we-1", exerciseName: "Lateral Raise", supersetGroup: "A" }),
      item({ id: "we-2", exerciseName: "Face Pull", supersetGroup: "A" }),
      item({ id: "we-3", exerciseName: "Barbell Curl", supersetGroup: "B" }),
      item({ id: "we-4", exerciseName: "Triceps Pushdown", supersetGroup: "B" }),
    ]);

    const groupARow = screen.getByText("Lateral Raise").closest(".border-line");
    const groupBRow = screen.getByText("Barbell Curl").closest(".border-line");

    expect(groupARow).toHaveClass("border-l-ink-muted");
    expect(groupBRow).toHaveClass("border-l-ink-faint");
    expect(groupARow).not.toHaveClass("border-l-ink-faint");
    expect(groupBRow).not.toHaveClass("border-l-ink-muted");
  });

  it("warns when a superset group has only one member", () => {
    renderList([item({ id: "we-1", supersetGroup: "A" })]);

    expect(
      screen.getByText("Group A needs a second exercise to alternate with."),
    ).toBeInTheDocument();
  });

  it("does not warn once a superset group has a second member", () => {
    renderList([
      item({ id: "we-1", supersetGroup: "A" }),
      item({ id: "we-2", exerciseName: "Incline DB Press", supersetGroup: "A" }),
    ]);

    expect(
      screen.queryByText(/needs a second exercise to alternate with/),
    ).not.toBeInTheDocument();
  });

  it("asks for confirmation and removes the exercise on delete", async () => {
    const user = userEvent.setup();
    renderList([item({ id: "we-1" })]);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Remove this exercise from the workout? The sessions you already did stay in History.",
    );
  });

  it("does not submit the delete form when confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderList([item({ id: "we-1" })]);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(deleteWorkoutExercise).not.toHaveBeenCalled();
  });

  it("saves an edited row scoped to its own id, workout, and program", async () => {
    const user = userEvent.setup();
    renderList([item({ id: "we-1", targetSets: 4, repMin: 6, repMax: 8, restSeconds: 120 })]);

    const setsInput = screen.getByLabelText("Sets");
    await user.clear(setsInput);
    await user.type(setsInput, "5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() =>
      expect(mockUpdateWorkoutExercise).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "we-1",
          workoutId: WORKOUT_ID,
          programId: PROGRAM_ID,
          targetSets: 5,
        }),
      ),
    );
  });

  it("renders one drag handle per row for reordering", () => {
    renderList([item({ id: "we-1" }), item({ id: "we-2" })]);

    expect(screen.getAllByRole("button", { name: "Drag to reorder" })).toHaveLength(2);
  });

  it("scopes the muscle group caption to its own row", () => {
    renderList([
      item({ id: "we-1", exerciseName: "Barbell Bench Press", muscleGroup: "chest" }),
    ]);
    const row = screen.getByText("Barbell Bench Press").closest("div")!.parentElement!;
    expect(within(row).getByText("Barbell · Chest")).toBeInTheDocument();
  });
});
