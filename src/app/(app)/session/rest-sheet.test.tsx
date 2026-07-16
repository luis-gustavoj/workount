import { NextIntlClientProvider } from "next-intl";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/notify", () => ({
  requestRestNotificationPermission: vi.fn(),
  notifyRestComplete: vi.fn(),
}));

import en from "../../../../messages/en.json";
import { RestSheet } from "./rest-sheet";
import { useSessionStore } from "@/lib/session/store";

// The presence/chrome wrapper around RestTimer (ticket 023): a persistent,
// non-modal bottom sheet that slides in/out rather than being conditionally
// rendered by the parent. RestTimer's own countdown/±15s/notify logic is
// covered by rest-timer.test.tsx — these tests only exercise mount/unmount
// timing around the `restEndsAt` presence signal.

function renderSheet(props: { restEndsAt: number | null; restStartedAt: number | null; restNotifiedAt: number | null }) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RestSheet {...props} />
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

describe("RestSheet", () => {
  it("renders nothing when restEndsAt is null", () => {
    vi.setSystemTime(0);
    renderSheet({ restEndsAt: null, restStartedAt: null, restNotifiedAt: null });

    expect(screen.queryByText("Rest")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders content when active", () => {
    vi.setSystemTime(0);
    renderSheet({ restEndsAt: 90_000, restStartedAt: 0, restNotifiedAt: null });

    expect(screen.getByText("Rest")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("slides open on a genuine transition into active — starts translated, then settles at translate-y-0", () => {
    vi.setSystemTime(0);
    const { rerender } = renderSheet({ restEndsAt: null, restStartedAt: null, restNotifiedAt: null });

    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <RestSheet restEndsAt={90_000} restStartedAt={0} restNotifiedAt={null} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("status")).toHaveClass("translate-y-full");

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(screen.getByRole("status")).toHaveClass("translate-y-0");
  });

  it("content persists through the exit transition on end before unmounting", () => {
    vi.setSystemTime(0);
    const { rerender } = renderSheet({ restEndsAt: 90_000, restStartedAt: 0, restNotifiedAt: null });
    expect(screen.getByText("Rest")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <RestSheet restEndsAt={null} restStartedAt={null} restNotifiedAt={null} />
      </NextIntlClientProvider>,
    );

    // Still mounted, still showing the frozen content, immediately after the
    // store nulled the rest fields.
    expect(screen.getByText("Rest")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("translate-y-full");

    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(screen.queryByText("Rest")).not.toBeInTheDocument();
  });

  it("reduced motion removes it immediately instead of waiting out the exit transition", () => {
    const matchMediaSpy = vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));

    vi.setSystemTime(0);
    const { rerender } = renderSheet({ restEndsAt: 90_000, restStartedAt: 0, restNotifiedAt: null });
    expect(screen.getByText("Rest")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <RestSheet restEndsAt={null} restStartedAt={null} restNotifiedAt={null} />
      </NextIntlClientProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(screen.queryByText("Rest")).not.toBeInTheDocument();
    matchMediaSpy.mockRestore();
  });
});
