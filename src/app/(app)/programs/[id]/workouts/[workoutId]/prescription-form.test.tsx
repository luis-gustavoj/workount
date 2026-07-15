import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../../../../messages/en.json";
import { PrescriptionForm, type PrescriptionValues } from "./prescription-form";
import type { PrescriptionActionResult } from "@/app/(app)/programs/actions";

function renderForm(
  props: Partial<{
    initialValues: Partial<PrescriptionValues>;
    supersetGroupOptions: string[];
    defaultRestSeconds: number;
    submitLabel: string;
    onSubmit: (values: PrescriptionValues) => Promise<PrescriptionActionResult>;
    onSuccess: () => void;
    onCancel: () => void;
  }> = {},
) {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue({ ok: true });
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PrescriptionForm
        idPrefix="test"
        initialValues={props.initialValues}
        supersetGroupOptions={props.supersetGroupOptions ?? ["A"]}
        defaultRestSeconds={props.defaultRestSeconds ?? 90}
        submitLabel={props.submitLabel ?? "Save"}
        onSubmit={onSubmit}
        onSuccess={props.onSuccess}
        onCancel={props.onCancel}
      />
    </NextIntlClientProvider>,
  );
  return { onSubmit };
}

describe("PrescriptionForm", () => {
  it("submits sensible defaults when no initial values are given", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        targetSets: 3,
        repMin: 8,
        repMax: 12,
        restSeconds: null,
        notes: null,
        supersetGroup: null,
      }),
    );
  });

  it("seeds every field from initialValues (edit mode)", () => {
    renderForm({
      initialValues: {
        targetSets: 4,
        repMin: 6,
        repMax: 8,
        restSeconds: 120,
        notes: "Pause 1s at the chest.",
        supersetGroup: "A",
      },
    });

    expect(screen.getByLabelText("Sets")).toHaveValue(4);
    expect(screen.getByLabelText("Minimum reps")).toHaveValue(6);
    expect(screen.getByLabelText("Maximum reps")).toHaveValue(8);
    expect(screen.getByLabelText("Rest (seconds)")).toHaveValue(120);
    expect(screen.getByLabelText("Notes")).toHaveValue("Pause 1s at the chest.");
    expect(screen.getByLabelText("Superset")).toHaveValue("A");
  });

  it("shows the profile default as the rest placeholder and names it as inherited", () => {
    renderForm({ defaultRestSeconds: 75 });

    expect(screen.getByLabelText("Rest (seconds)")).toHaveAttribute("placeholder", "75");
    expect(screen.getByText("Empty inherits your default of 75s")).toBeInTheDocument();
  });

  it("disables submit and shows an inline error when rep max is below rep min", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    const repMax = screen.getByLabelText("Maximum reps");
    await user.clear(repMax);
    await user.type(repMax, "2");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Rep max must be at least rep min.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("allows rep_min === rep_max (a fixed target, e.g. 5x5)", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.clear(screen.getByLabelText("Minimum reps"));
    await user.type(screen.getByLabelText("Minimum reps"), "5");
    await user.clear(screen.getByLabelText("Maximum reps"));
    await user.type(screen.getByLabelText("Maximum reps"), "5");

    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ repMin: 5, repMax: 5 })),
    );
  });

  it("collapses an emptied rest, emptied notes, and 'None' superset to null on submit", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm({
      initialValues: { restSeconds: 120, notes: "Some note", supersetGroup: "A" },
    });

    await user.clear(screen.getByLabelText("Rest (seconds)"));
    await user.clear(screen.getByLabelText("Notes"));
    await user.selectOptions(screen.getByLabelText("Superset"), "None");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ restSeconds: null, notes: null, supersetGroup: null }),
      ),
    );
  });

  it("lists the given superset group options plus None", () => {
    renderForm({ supersetGroupOptions: ["A", "B"] });

    const select = screen.getByLabelText("Superset");
    expect(within(select).getByRole("option", { name: "None" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Group A" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Group B" })).toBeInTheDocument();
  });

  it("calls onSuccess after a successful submit", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderForm({ onSuccess });

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("shows a translated not-found error and does not call onSuccess", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: "not_found" });
    renderForm({ onSubmit, onSuccess });

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("This exercise was removed. Refresh and try again."),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows a generic translated error for any other failure", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: "invalid" });
    renderForm({ onSubmit });

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Check the values and try again.")).toBeInTheDocument();
  });

  it("renders no cancel button when onCancel is omitted", () => {
    renderForm();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("calls onCancel when the cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderForm({ onCancel });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
