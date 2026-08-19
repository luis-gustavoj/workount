import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import { SetRow, type SetRowEdit, type SetRowProps } from "./set-row";

// One performed set row (ticket 023): the last-time reference must never
// clip (root cause was a 50/50 flex split with `truncate`), and an
// already-logged row can be tapped to correct a mis-entered weight/reps or
// delete it outright. Placeholder (not-yet-performed) rows get neither.

function edit(overrides: Partial<SetRowEdit> = {}): SetRowEdit {
  return {
    setNumber: 1,
    isEditing: false,
    onStart: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

function renderRow(props: Partial<SetRowProps> = {}) {
  const defaults: SetRowProps = {
    label: "Set 1",
    isWarmup: false,
    performed: { weight: 80, reps: 8 },
    lastTimeText: "80 × 8",
    edit: edit(),
    ...props,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SetRow {...defaults} />
    </NextIntlClientProvider>,
  );
}

describe("SetRow — last-time layout", () => {
  it("renders a long last-time value in full, with no truncate class on it", () => {
    renderRow({ lastTimeText: "137.5 × 12" });

    const value = screen.getByText("137.5 × 12");
    expect(value).toBeInTheDocument();
    expect(value.className).not.toMatch(/truncate/);
    expect(screen.getByText("Last time")).toBeInTheDocument();
  });

  it("renders the none-state under the same label", () => {
    renderRow({ lastTimeText: null });

    expect(screen.getByText("Last time")).toBeInTheDocument();
    expect(screen.getByText("First time")).toBeInTheDocument();
  });
});

describe("SetRow — tap-to-edit", () => {
  it("has no edit affordance on the not-yet-performed placeholder row", () => {
    renderRow({ performed: undefined, edit: undefined, lastTimeText: null });

    expect(screen.queryByRole("button", { name: /edit set/i })).not.toBeInTheDocument();
  });

  it("opens the edit surface, seeded from performed, on tap", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderRow({ edit: edit({ onStart }) });

    await user.click(screen.getByRole("button", { name: "Edit set 1" }));

    expect(onStart).toHaveBeenCalled();
  });

  it("shows seeded Steppers and hides the warmup toggle while editing", () => {
    renderRow({ edit: edit({ isEditing: true }), onToggleWarmup: vi.fn() });

    expect(screen.getByLabelText("Weight (kg)")).toHaveValue(80);
    expect(screen.getByLabelText("Reps")).toHaveValue(8);
    expect(screen.queryByRole("button", { name: "Mark as warmup" })).not.toBeInTheDocument();
  });

  it("Save calls onSave with the edited values", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderRow({ edit: edit({ isEditing: true, onSave }) });

    await user.click(screen.getByRole("button", { name: "Weight (kg): increase" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ weight: 82.5, reps: 8 });
  });

  it("Cancel discards without calling onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    renderRow({ edit: edit({ isEditing: true, onSave, onCancel }) });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Delete requires a second Confirm delete tap before calling onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderRow({ edit: edit({ isEditing: true, onDelete }) });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm delete" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(onDelete).toHaveBeenCalled();
  });
});
