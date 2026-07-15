import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPush, mockStartSession } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockStartSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({}),
}));

vi.mock("@/lib/session/start", () => ({
  startSession: mockStartSession,
}));

import en from "../../../../../../../messages/en.json";
import { StartSessionButton } from "./start-session-button";

// The only place startSession (ticket 011) is called from the UI — after it
// resolves, the rest of the session (ticket 012's /session player) runs with
// zero network calls, per ADR-0001.

function renderButton() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <StartSessionButton workoutId="workout-1" />
    </NextIntlClientProvider>,
  );
}

describe("StartSessionButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts the session and navigates to /session on success", async () => {
    const user = userEvent.setup();
    mockStartSession.mockResolvedValue({ id: "session-1" });
    renderButton();

    await user.click(screen.getByRole("button", { name: "Start session" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/session"));
    expect(mockStartSession).toHaveBeenCalledWith({}, "workout-1");
  });

  it("shows a translated error and does not navigate on failure", async () => {
    const user = userEvent.setup();
    mockStartSession.mockRejectedValue(new Error("offline"));
    renderButton();

    await user.click(screen.getByRole("button", { name: "Start session" }));

    expect(
      await screen.findByText("Couldn't start the session. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
