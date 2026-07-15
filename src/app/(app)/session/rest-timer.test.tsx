import { NextIntlClientProvider } from "next-intl";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/notify", () => ({
  requestRestNotificationPermission: vi.fn(),
  notifyRestComplete: vi.fn(),
}));

import en from "../../../../messages/en.json";
import { RestTimer } from "./rest-timer";
import { notifyRestComplete } from "@/lib/session/notify";
import { useSessionStore } from "@/lib/session/store";

// The rest timer's UI orchestration (ticket 013): rendering the
// restEndsAt-derived clock, the ±15s / done-resting controls wired to the
// store, and firing the (mocked — see notify.test.ts for its own coverage)
// vibrate/notification exactly once when crossing zero — including staying
// silent on a ±15s tap during overtime and on a remount with an
// already-notified draft (both persisted via restStartedAt/restNotifiedAt,
// not component state; see store.test.ts for that persistence). Pure
// formatting/math is covered by rest.test.ts; store persistence by
// store.test.ts.

function renderTimer(props: { restEndsAt: number; restStartedAt: number; restNotifiedAt: number | null }) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RestTimer {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  useSessionStore.setState({ adjustRest: vi.fn(), endRest: vi.fn(), markRestNotified: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RestTimer", () => {
  it("shows the countdown clock derived from restEndsAt", () => {
    vi.setSystemTime(0);
    renderTimer({ restEndsAt: 90_000, restStartedAt: 0, restNotifiedAt: null });

    expect(screen.getByText("1:30")).toBeInTheDocument();
    expect(screen.getByText("Rest")).toBeInTheDocument();
  });

  it("switches to the overtime label and a signed clock once past restEndsAt", () => {
    vi.setSystemTime(113_000);
    renderTimer({ restEndsAt: 90_000, restStartedAt: 0, restNotifiedAt: null });

    expect(screen.getByText("+0:23")).toBeInTheDocument();
    expect(screen.getByText("Rest complete")).toBeInTheDocument();
  });

  it("calls adjustRest(-15000) and adjustRest(15000) from the ±15s buttons", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const adjustRest = vi.fn();
    useSessionStore.setState({ adjustRest, endRest: vi.fn(), markRestNotified: vi.fn() });
    renderTimer({ restEndsAt: Date.now() + 90_000, restStartedAt: Date.now(), restNotifiedAt: null });

    await user.click(screen.getByRole("button", { name: "-15s" }));
    await user.click(screen.getByRole("button", { name: "+15s" }));

    expect(adjustRest).toHaveBeenCalledWith(-15_000);
    expect(adjustRest).toHaveBeenCalledWith(15_000);
  });

  it("calls endRest from the done-resting button", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const endRest = vi.fn();
    useSessionStore.setState({ adjustRest: vi.fn(), endRest, markRestNotified: vi.fn() });
    renderTimer({ restEndsAt: Date.now() + 90_000, restStartedAt: Date.now(), restNotifiedAt: null });

    await user.click(screen.getByRole("button", { name: "Done resting" }));

    expect(endRest).toHaveBeenCalled();
  });

  it("vibrates/notifies exactly once at the moment the countdown crosses zero, and records it via markRestNotified", () => {
    const markRestNotified = vi.fn();
    useSessionStore.setState({ adjustRest: vi.fn(), endRest: vi.fn(), markRestNotified });
    vi.setSystemTime(89_000);
    renderTimer({ restEndsAt: 90_000, restStartedAt: 0, restNotifiedAt: null });
    expect(notifyRestComplete).not.toHaveBeenCalled();

    act(() => {
      vi.setSystemTime(90_500);
      vi.advanceTimersByTime(1000);
    });
    expect(notifyRestComplete).toHaveBeenCalledTimes(1);
    expect(markRestNotified).toHaveBeenCalledTimes(1);

    // Further ticks while still in overtime must not re-fire — the parent
    // hasn't re-rendered with an updated restNotifiedAt prop yet (that only
    // happens once the store persists it), so this also exercises the
    // "already notified for this restStartedAt" guard, not just re-mounting.
    act(() => {
      vi.setSystemTime(91_000);
      vi.advanceTimersByTime(1000);
    });
    expect(notifyRestComplete).toHaveBeenCalledTimes(1);
  });

  it("does not re-fire when a ±15s adjustment moves restEndsAt while already in overtime", () => {
    // restStartedAt is unchanged by the adjustment — only restEndsAt moves —
    // so the "already notified for this restStartedAt" guard must still
    // hold even though restEndsAt itself is a different number now.
    vi.setSystemTime(200_000);
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <RestTimer restEndsAt={90_000} restStartedAt={0} restNotifiedAt={0} />
      </NextIntlClientProvider>,
    );
    expect(notifyRestComplete).not.toHaveBeenCalled();

    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <RestTimer restEndsAt={105_000} restStartedAt={0} restNotifiedAt={0} />
      </NextIntlClientProvider>,
    );
    expect(notifyRestComplete).not.toHaveBeenCalled();
  });

  it("does not re-fire on mount when the draft already recorded a notification for this rest", () => {
    // Models reopening the app mid-overtime: restNotifiedAt was persisted
    // from a previous tab/session and equals restStartedAt already.
    vi.setSystemTime(200_000);
    renderTimer({ restEndsAt: 90_000, restStartedAt: 0, restNotifiedAt: 0 });
    expect(notifyRestComplete).not.toHaveBeenCalled();
  });
});
