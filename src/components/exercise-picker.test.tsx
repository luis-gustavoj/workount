import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";
import { ExercisePicker } from "./exercise-picker";
import { createCustomExercise } from "@/lib/exercises/actions";
import type { ExerciseOption } from "@/lib/exercises/search";

// Server Actions are plain async functions once outside Next's build pipeline
// (the "use server" directive is a no-op under Vitest), so the module mocks
// like any other dependency.
vi.mock("@/lib/exercises/actions", () => ({
  createCustomExercise: vi.fn(),
}));

const mockCreateCustomExercise = vi.mocked(createCustomExercise);

const EXERCISES: ExerciseOption[] = [
  { id: "1", name: "Barbell Bench Press", muscleGroup: "chest", equipment: "barbell", isCustom: false },
  { id: "2", name: "Barbell Incline Bench Press", muscleGroup: "chest", equipment: "barbell", isCustom: false },
  { id: "3", name: "Dumbbell Bench Press", muscleGroup: "chest", equipment: "dumbbell", isCustom: false },
  { id: "4", name: "Barbell Curl", muscleGroup: "biceps", equipment: "barbell", isCustom: false },
  { id: "5", name: "Bench Press (paused)", muscleGroup: "chest", equipment: "barbell", isCustom: true },
];

function renderPicker(
  props: Partial<{ exercises: ExerciseOption[]; onSelect: (e: ExerciseOption) => void }> = {},
) {
  const onSelect = props.onSelect ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ExercisePicker exercises={props.exercises ?? EXERCISES} onSelect={onSelect}>
        <button type="button">Add exercise</button>
      </ExercisePicker>
    </NextIntlClientProvider>,
  );
  return { onSelect };
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add exercise" }));
}

async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerName: RegExp | string,
  optionName: string,
) {
  await user.click(screen.getByRole("combobox", { name: triggerName }));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("ExercisePicker", () => {
  beforeEach(() => {
    mockCreateCustomExercise.mockReset();
  });

  it("lists global exercises and marks customs", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    expect(screen.getByText("Barbell Bench Press")).toBeInTheDocument();
    const customRow = screen.getByText("Bench Press (paused)").closest("button");
    expect(customRow).not.toBeNull();
    expect(within(customRow!).getByText("Custom")).toBeInTheDocument();
    // A global row carries no "Custom" badge.
    const globalRow = screen.getByText("Barbell Bench Press").closest("button");
    expect(within(globalRow!).queryByText("Custom")).not.toBeInTheDocument();
  });

  it("'bench' returns the barbell, dumbbell, and incline variants (acceptance)", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await user.type(screen.getByPlaceholderText("Search exercises"), "bench");

    expect(screen.getByText("Barbell Bench Press")).toBeInTheDocument();
    expect(screen.getByText("Barbell Incline Bench Press")).toBeInTheDocument();
    expect(screen.getByText("Dumbbell Bench Press")).toBeInTheDocument();
    expect(screen.queryByText("Barbell Curl")).not.toBeInTheDocument();
  });

  it("filters by muscle group", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await selectOption(user, "Muscle group", "Biceps");

    expect(screen.getByText("Barbell Curl")).toBeInTheDocument();
    expect(screen.queryByText("Barbell Bench Press")).not.toBeInTheDocument();
  });

  it("fires onSelect and closes when picking an existing exercise", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker();
    await openPicker(user);

    await user.click(screen.getByText("Barbell Bench Press"));

    expect(onSelect).toHaveBeenCalledWith(EXERCISES[0]);
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Search exercises")).not.toBeInTheDocument(),
    );
  });

  it("shows the create prompt only once a query is typed", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    expect(screen.queryByText(/can’t find it/i)).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search exercises"), "Nordic Curl");
    expect(screen.getByText('Can’t find it? Create "Nordic Curl"')).toBeInTheDocument();
  });

  it("creates a custom exercise and selects it immediately (acceptance)", async () => {
    const created: ExerciseOption = {
      id: "new-1",
      name: "Nordic Curl",
      muscleGroup: "hamstrings",
      equipment: "bodyweight",
      isCustom: true,
    };
    mockCreateCustomExercise.mockResolvedValueOnce({ ok: true, exercise: created });

    const user = userEvent.setup();
    const { onSelect } = renderPicker();
    await openPicker(user);

    await user.type(screen.getByPlaceholderText("Search exercises"), "Nordic Curl");
    await user.click(screen.getByText('Can’t find it? Create "Nordic Curl"'));

    expect(screen.getByLabelText("Name")).toHaveValue("Nordic Curl");

    await selectOption(user, "Muscle group", "Hamstrings");
    await selectOption(user, "Equipment", "Bodyweight");

    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(created));
    expect(mockCreateCustomExercise).toHaveBeenCalledWith({
      name: "Nordic Curl",
      muscleGroup: "hamstrings",
      equipment: "bodyweight",
    });
    await waitFor(() =>
      expect(screen.queryByLabelText("Name")).not.toBeInTheDocument(),
    );
  });

  it("shows a usable inline error on a duplicate name, not a crash (acceptance)", async () => {
    mockCreateCustomExercise.mockResolvedValueOnce({ ok: false, error: "duplicate" });

    const user = userEvent.setup();
    const { onSelect } = renderPicker();
    await openPicker(user);

    await user.type(screen.getByPlaceholderText("Search exercises"), "My Custom Lift");
    await user.click(screen.getByText('Can’t find it? Create "My Custom Lift"'));
    await selectOption(user, "Muscle group", "Chest");
    await selectOption(user, "Equipment", "Barbell");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(
      await screen.findByText("You already have a custom exercise with this name."),
    ).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    // The form stays open with what the user typed, ready to fix.
    expect(screen.getByLabelText("Name")).toHaveValue("My Custom Lift");
  });

  it("suggests a near-duplicate before letting the user create it (acceptance)", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await user.type(screen.getByPlaceholderText("Search exercises"), "Bench Press");
    await user.click(screen.getByText('Can’t find it? Create "Bench Press"'));

    expect(screen.getByText("Did you mean one of these?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Barbell Bench Press" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dumbbell Bench Press" })).toBeInTheDocument();
    // "Create anyway" replaces the plain "Create" label once suggestions exist.
    expect(screen.getByRole("button", { name: "Create anyway" })).toBeInTheDocument();
  });

  it("selecting a suggested near-duplicate selects the existing exercise, no create call", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker();
    await openPicker(user);

    await user.type(screen.getByPlaceholderText("Search exercises"), "Bench Press");
    await user.click(screen.getByText('Can’t find it? Create "Bench Press"'));
    await user.click(screen.getByRole("button", { name: "Barbell Bench Press" }));

    expect(onSelect).toHaveBeenCalledWith(EXERCISES[0]);
    expect(mockCreateCustomExercise).not.toHaveBeenCalled();
  });
});
