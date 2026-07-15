import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../../../messages/en.json";
import { AddExercise } from "./add-exercise";
import { createWorkoutExercise } from "@/app/(app)/programs/actions";
import type { ExerciseOption } from "@/lib/exercises/search";

// Server Actions are plain async functions once outside Next's build pipeline
// (mirrors exercise-picker.test.tsx's mock of createCustomExercise).
vi.mock("@/app/(app)/programs/actions", () => ({
  createWorkoutExercise: vi.fn(),
}));

const mockCreateWorkoutExercise = vi.mocked(createWorkoutExercise);

const WORKOUT_ID = "11111111-1111-4111-8111-111111111111";
const PROGRAM_ID = "22222222-2222-4222-8222-222222222222";

const EXERCISES: ExerciseOption[] = [
  {
    id: "ex-1",
    name: "Barbell Bench Press",
    muscleGroup: "chest",
    equipment: "barbell",
    isCustom: false,
  },
];

function renderAddExercise() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AddExercise
        exercises={EXERCISES}
        workoutId={WORKOUT_ID}
        programId={PROGRAM_ID}
        supersetGroupOptions={["A"]}
        defaultRestSeconds={90}
      />
    </NextIntlClientProvider>,
  );
}

async function pickBenchPress(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add exercise" }));
  await user.click(screen.getByText("Barbell Bench Press"));
}

describe("AddExercise", () => {
  beforeEach(() => {
    mockCreateWorkoutExercise.mockReset();
    mockCreateWorkoutExercise.mockResolvedValue({ ok: true });
  });

  it("shows only the picker trigger before anything is picked", () => {
    renderAddExercise();

    expect(screen.getByRole("button", { name: "Add exercise" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Sets")).not.toBeInTheDocument();
  });

  it("shows the prescription form for the picked exercise", async () => {
    const user = userEvent.setup();
    renderAddExercise();

    await pickBenchPress(user);

    expect(await screen.findByLabelText("Sets")).toBeInTheDocument();
    expect(screen.getByText("Barbell Bench Press")).toBeInTheDocument();
  });

  it("creates the workout exercise with the picked exercise, workout, and program ids", async () => {
    const user = userEvent.setup();
    renderAddExercise();

    await pickBenchPress(user);
    await user.click(await screen.findByRole("button", { name: "Add to workout" }));

    await waitFor(() =>
      expect(mockCreateWorkoutExercise).toHaveBeenCalledWith({
        workoutId: WORKOUT_ID,
        programId: PROGRAM_ID,
        exerciseId: "ex-1",
        targetSets: 3,
        repMin: 8,
        repMax: 12,
        restSeconds: null,
        notes: null,
        supersetGroup: null,
      }),
    );
  });

  it("returns to the trigger button after a successful add", async () => {
    const user = userEvent.setup();
    renderAddExercise();

    await pickBenchPress(user);
    await user.click(await screen.findByRole("button", { name: "Add to workout" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add exercise" })).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Sets")).not.toBeInTheDocument();
  });

  it("returns to the trigger button on cancel without creating anything", async () => {
    const user = userEvent.setup();
    renderAddExercise();

    await pickBenchPress(user);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Add exercise" })).toBeInTheDocument();
    expect(mockCreateWorkoutExercise).not.toHaveBeenCalled();
  });
});
