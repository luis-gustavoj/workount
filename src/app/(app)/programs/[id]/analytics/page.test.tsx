import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../../messages/en.json";
import AnalyticsPage from "./page";
import {
  getExercisePrs,
  getExerciseProgression,
  getProgramAdherence,
  getProgramVolume,
  listProgramExercises,
} from "@/lib/analytics/query";

// The page is a Server Component: it is awaited into an element, then handed
// to the client renderer inside a message provider. Its I/O shell and the
// server-only next-intl / Supabase / navigation modules are mocked; what is
// under test is the branching — which section renders, and what happens when
// a program has nothing to chart.

const PROGRAM_ID = "11111111-1111-4111-8111-111111111111";
const EXERCISE_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/analytics/query", () => ({
  getProgramVolume: vi.fn(),
  getProgramAdherence: vi.fn(),
  getExerciseProgression: vi.fn(),
  getExercisePrs: vi.fn(),
  listProgramExercises: vi.fn(),
}));

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  // The real getTranslations resolves the request locale; in a test the
  // English catalog is the answer.
  getTranslations: async (namespace: "Analytics") => {
    const { createTranslator } = await import("next-intl");
    return createTranslator({ locale: "en", messages: en, namespace });
  },
}));

const maybeSingle = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    // ADR-0006: the server reads the user from locally-verified JWT claims,
    // so the stub returns claims rather than a user object. `role` matters —
    // `userFromClaims` rejects anything that isn't `authenticated`.
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: "user-1", role: "authenticated" } },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

async function renderPage(search: { exercise?: string } = {}) {
  const ui = await AnalyticsPage({
    params: Promise.resolve({ id: PROGRAM_ID }),
    searchParams: Promise.resolve(search),
  });

  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("AnalyticsPage", () => {
  beforeEach(() => {
    vi.mocked(maybeSingle).mockResolvedValue({
      data: { id: PROGRAM_ID, name: "PPL — Summer" },
    });
    vi.mocked(listProgramExercises).mockResolvedValue([
      { exerciseId: EXERCISE_ID, name: "Barbell Back Squat" },
    ]);
    vi.mocked(getProgramVolume).mockResolvedValue([]);
    vi.mocked(getProgramAdherence).mockResolvedValue([]);
    vi.mocked(getExerciseProgression).mockResolvedValue([]);
    vi.mocked(getExercisePrs).mockResolvedValue(new Map());
  });

  it("renders an empty state, not an axis with no data, for a program with no completed sessions", async () => {
    const { container } = await renderPage();

    expect(screen.getByText("Nothing to chart yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Finish a session in this program and your numbers show up here.",
      ),
    ).toBeInTheDocument();

    // No chart, no chart chrome at all — and the program is still named.
    expect(container.querySelector("svg.recharts-surface")).toBeNull();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("PPL — Summer")).toBeInTheDocument();
  });

  it("renders the four sections once a session has been completed", async () => {
    vi.mocked(getProgramVolume).mockResolvedValue([
      {
        sessionId: "session-1",
        completedAt: "2026-08-10T18:04:00.000Z",
        workoutName: "Squat Day",
        volumeKg: 1830,
      },
    ]);
    vi.mocked(getProgramAdherence).mockResolvedValue([
      {
        weekStart: "2026-08-10",
        completedSessions: 1,
        scheduledWorkouts: 2,
        adherence: 0.5,
      },
    ]);

    await renderPage();

    expect(screen.queryByText("Nothing to chart yet")).not.toBeInTheDocument();
    for (const heading of [
      "Strength",
      "Volume",
      "Personal records",
      "Adherence",
    ]) {
      expect(
        screen.getByRole("heading", { name: heading }),
      ).toBeInTheDocument();
    }
  });

  it("404s a program the caller cannot see — RLS returns no row", async () => {
    vi.mocked(maybeSingle).mockResolvedValue({ data: null });

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("falls back to the program's first exercise when the query string names another", async () => {
    await renderPage({ exercise: "33333333-3333-4333-8333-333333333333" });

    // A stale or hand-typed exercise id must not chart something this program
    // doesn't contain.
    expect(getExerciseProgression).toHaveBeenCalledWith(
      expect.anything(),
      PROGRAM_ID,
      EXERCISE_ID,
    );
  });
});
