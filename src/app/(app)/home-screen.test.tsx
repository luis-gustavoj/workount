import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import { HomeScreen } from "./home-screen";
import type { HomeData } from "@/lib/home/query";
import { startSession } from "@/lib/session/start";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
}));

const idbGet = vi.fn();
const idbDel = vi.fn();
vi.mock("idb-keyval", () => ({
  get: (...args: unknown[]) => idbGet(...args),
  del: (...args: unknown[]) => idbDel(...args),
}));

vi.mock("@/lib/session/start", () => ({ startSession: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const mockStartSession = vi.mocked(startSession);

const PROGRAM_ID = "11111111-1111-4111-8111-111111111111";
const WORKOUT_ID = "22222222-2222-4222-8222-222222222222";

// A Thursday, so the fixture's day_of_week 4 workout is "today".
const THURSDAY = new Date("2026-08-20T09:00:00Z");

function homeData(overrides: Partial<HomeData> = {}): HomeData {
  return {
    activeProgramId: PROGRAM_ID,
    workouts: [
      { id: WORKOUT_ID, name: "Push A", dayOfWeek: 4, exerciseCount: 5 },
    ],
    recentSessions: [],
    ...overrides,
  };
}

function renderHome(data: HomeData = homeData()) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <HomeScreen data={data} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(THURSDAY);
  idbGet.mockResolvedValue(undefined);
});

// Ticket 024. "Start workout" used to be a link to the workout builder, so the
// button you press every training day meant *look at the plan* and starting was
// another screen away.
describe("HomeScreen — starting a workout", () => {
  it("starts the session and goes to the player", async () => {
    mockStartSession.mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof startSession>>,
    );
    renderHome();

    const start = await screen.findByRole("button", { name: "Start workout" });
    await waitFor(() => expect(start).toBeEnabled());
    await userEvent.click(start);

    await waitFor(() =>
      expect(mockStartSession).toHaveBeenCalledWith(
        expect.anything(),
        WORKOUT_ID,
      ),
    );
    expect(push).toHaveBeenCalledWith("/session");
  });

  // The bundle fetch is a real round trip (ADR-0001) and gym wifi is gym wifi.
  it("keeps the user on Home and explains itself when the start fails", async () => {
    mockStartSession.mockRejectedValue(new Error("offline"));
    renderHome();

    const start = await screen.findByRole("button", { name: "Start workout" });
    await waitFor(() => expect(start).toBeEnabled());
    await userEvent.click(start);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't start the session/i,
    );
    expect(push).not.toHaveBeenCalled();
  });

  // Home resolves before the IndexedDB read lands, so for a few milliseconds it
  // does not know a session is already in progress. Starting in that window
  // would clobber the draft.
  it("does not allow a start until the draft check has landed", () => {
    let resolveDraft: (value: undefined) => void = () => {};
    idbGet.mockReturnValue(
      new Promise<undefined>((resolve) => {
        resolveDraft = resolve;
      }),
    );
    renderHome();

    expect(screen.getByRole("button", { name: "Start workout" })).toBeDisabled();
    resolveDraft(undefined);
  });

  it("still offers the plan alongside the start", async () => {
    renderHome();

    expect(await screen.findByRole("link", { name: "View plan" })).toHaveAttribute(
      "href",
      `/programs/${PROGRAM_ID}/workouts/${WORKOUT_ID}`,
    );
  });

  // Starting an empty workout drops the user in a player whose empty state
  // reads "No session in progress" — a lie, moments after they started one.
  it("offers Add exercises, not Start, for a workout with no exercises", async () => {
    renderHome(
      homeData({
        workouts: [
          { id: WORKOUT_ID, name: "Push A", dayOfWeek: 4, exerciseCount: 0 },
        ],
      }),
    );

    expect(
      await screen.findByRole("link", { name: "Add exercises" }),
    ).toHaveAttribute("href", `/programs/${PROGRAM_ID}/workouts/${WORKOUT_ID}`);
    expect(
      screen.queryByRole("button", { name: "Start workout" }),
    ).not.toBeInTheDocument();
  });
});

// The screen used to render the word "Loading…" until IndexedDB answered,
// which meant a second loading state after the route's skeleton.
describe("HomeScreen — no second loading state", () => {
  it("renders today's workout immediately, without waiting on IndexedDB", () => {
    idbGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderHome();

    expect(screen.getByText("Today: Push A")).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("swaps in the resume card once a draft turns up", async () => {
    idbGet.mockResolvedValue({
      startedAt: new Date(THURSDAY.getTime() - 34 * 60_000).toISOString(),
    });
    renderHome();

    expect(await screen.findByText("Session in progress")).toBeInTheDocument();
    expect(screen.queryByText("Today: Push A")).not.toBeInTheDocument();
  });
});
