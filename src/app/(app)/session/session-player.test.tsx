import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const idbStore = new Map<string, unknown>();

vi.mock("@/lib/session/notify", () => ({
  requestRestNotificationPermission: vi.fn(),
  notifyRestComplete: vi.fn(),
}));

const { mockPush, mockFinishSession, mockGetUser } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockFinishSession: vi.fn(),
  mockGetUser: vi.fn(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

// buildFinishSummary stays real (it's pure and already covered by
// commit.test.ts) — only finishSession, the network-touching half of the
// finish flow, is faked here so these tests don't need a real Supabase RPC.
vi.mock("@/lib/session/commit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session/commit")>();
  return { ...actual, finishSession: mockFinishSession };
});

vi.mock("idb-keyval", () => ({
  get: vi.fn((key: string) => Promise.resolve(idbStore.get(key))),
  set: vi.fn((key: string, value: unknown) => {
    idbStore.set(key, value);
    return Promise.resolve();
  }),
}));

import { get as idbGet, set as idbSet } from "idb-keyval";

import en from "../../../../messages/en.json";
import { SessionPlayer } from "./session-player";
import { useSessionStore } from "@/lib/session/store";
import { ACTIVE_DRAFT_KEY, SESSION_DRAFT_VERSION, type DraftExercise, type SessionDraft } from "@/lib/session/types";

// The session player (ticket 012) is entirely driven by the Zustand store,
// itself hydrated from the IndexedDB draft (ticket 011, ADR-0001). These
// tests exercise the acceptance criteria directly relevant to the UI: last
// performance shown per set (or gracefully absent), warmups excluded from
// the target-set count, supersets alternating automatically, and every
// mutation writing through to IndexedDB immediately — no fetch/network
// involved anywhere, matching the "zero network calls" hard rule.

function exercise(overrides: Partial<DraftExercise> = {}): DraftExercise {
  return {
    workoutExerciseId: "we-1",
    exerciseId: "ex-1",
    exerciseName: "Barbell Bench Press",
    muscleGroup: "chest",
    equipment: "barbell",
    position: 0,
    targetSets: 2,
    repMin: 8,
    repMax: 12,
    restSeconds: 90,
    notes: null,
    supersetGroup: null,
    lastPerformance: [],
    sets: [],
    ...overrides,
  };
}

function draft(overrides: Partial<SessionDraft> = {}): SessionDraft {
  return {
    version: SESSION_DRAFT_VERSION,
    id: "session-1",
    programId: "program-1",
    workoutId: "workout-1",
    startedAt: "2026-07-15T12:00:00.000Z",
    exercises: [exercise()],
    activeExerciseIndex: 0,
    restEndsAt: null,
    restStartedAt: null,
    restNotifiedAt: null,
    ...overrides,
  };
}

function renderPlayer() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SessionPlayer />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  idbStore.clear();
  vi.clearAllMocks();
  useSessionStore.setState({ draft: null, status: "loading" });
});

describe("SessionPlayer", () => {
  it("shows an empty state when there is no draft", async () => {
    renderPlayer();
    expect(await screen.findByText("No session in progress")).toBeInTheDocument();
    expect(idbGet).toHaveBeenCalledWith(ACTIVE_DRAFT_KEY);
  });

  it("shows the current exercise, its prescription, and no last-time text for a lift never performed", async () => {
    idbStore.set(ACTIVE_DRAFT_KEY, draft());
    renderPlayer();

    expect(await screen.findByText("Barbell Bench Press")).toBeInTheDocument();
    expect(screen.getByText("2 × 8–12")).toBeInTheDocument();
    expect(screen.getByText("First time")).toBeInTheDocument();
  });

  it("shows the last-performance reference against the upcoming set", async () => {
    idbStore.set(
      ACTIVE_DRAFT_KEY,
      draft({
        exercises: [exercise({ lastPerformance: [{ setNumber: 1, weight: 80, reps: 8 }] })],
      }),
    );
    renderPlayer();

    expect(await screen.findByText("Last time")).toBeInTheDocument();
    expect(screen.getByText("80 × 8")).toBeInTheDocument();
  });

  it("logs a set and writes through to IndexedDB immediately", async () => {
    const user = userEvent.setup();
    idbStore.set(ACTIVE_DRAFT_KEY, draft());
    renderPlayer();

    await screen.findByText("Barbell Bench Press");
    await user.click(screen.getByRole("button", { name: "Log set" }));

    await waitFor(() => expect(screen.getByText("Set 1")).toBeInTheDocument());
    expect(idbSet).toHaveBeenCalledWith(
      ACTIVE_DRAFT_KEY,
      expect.objectContaining({
        exercises: [expect.objectContaining({ sets: [expect.objectContaining({ setNumber: 1 })] })],
      }),
    );
  });

  it("logs a warmup set without consuming a target_sets slot", async () => {
    const user = userEvent.setup();
    idbStore.set(ACTIVE_DRAFT_KEY, draft({ exercises: [exercise({ targetSets: 1 })] }));
    renderPlayer();

    await screen.findByText("Barbell Bench Press");
    await user.click(screen.getByRole("button", { name: "Warmup" }));
    await user.click(screen.getByRole("button", { name: "Log set" }));

    // The warmup never counted toward the single target set (CLAUDE.md's
    // "warmups never count"), so the upcoming prompt still reads "Set 1" —
    // and only once, since the logged warmup row doesn't compete for that
    // number (it isn't a working set, so it isn't part of that numbering).
    await waitFor(() => {
      expect(screen.getAllByText("Set 1")).toHaveLength(1);
    });
    expect(screen.queryByText("Extra set")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unmark warmup" })).toBeInTheDocument();
  });

  it("allows logging an extra set beyond the target", async () => {
    const user = userEvent.setup();
    idbStore.set(ACTIVE_DRAFT_KEY, draft({ exercises: [exercise({ targetSets: 1 })] }));
    renderPlayer();

    await screen.findByText("Barbell Bench Press");
    await user.click(screen.getByRole("button", { name: "Log set" }));
    await waitFor(() => expect(screen.getByText("Extra set")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Log set" }));
    await waitFor(() => expect(screen.getByText("Set 2")).toBeInTheDocument());
  });

  it("numbers a working set by working-set ordinal, matching what the placeholder promised, even after a preceding warmup", async () => {
    const user = userEvent.setup();
    idbStore.set(ACTIVE_DRAFT_KEY, draft({ exercises: [exercise({ targetSets: 2 })] }));
    renderPlayer();

    await screen.findByText("Barbell Bench Press");
    await user.click(screen.getByRole("button", { name: "Warmup" }));
    await user.click(screen.getByRole("button", { name: "Log set" }));
    // The placeholder promised "Set 1" for the first working set (the
    // warmup doesn't consume a number) — logging it must render as "Set 1",
    // not "Set 2" from a raw, warmups-included position count.
    await waitFor(() => expect(screen.getByRole("button", { name: "Log set" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Log set" }));

    await waitFor(() => expect(screen.getByText("Set 2")).toBeInTheDocument());
    expect(screen.getAllByText("Set 1")).toHaveLength(1);
  });

  it("refreshes the entry deck's defaults when toggling warmup on an earlier set changes the next working ordinal", async () => {
    const user = userEvent.setup();
    idbStore.set(
      ACTIVE_DRAFT_KEY,
      draft({
        exercises: [
          exercise({
            targetSets: 2,
            lastPerformance: [
              { setNumber: 1, weight: 80, reps: 8 },
              { setNumber: 2, weight: 82.5, reps: 6 },
            ],
          }),
        ],
      }),
    );
    renderPlayer();

    await screen.findByText("Barbell Bench Press");
    // Log the first working set — the deck now prefills toward ordinal 2
    // (82.5 × 6).
    await user.click(screen.getByRole("button", { name: "Log set" }));
    await screen.findByText("Set 1");
    expect(screen.getByLabelText("Weight (kg)")).toHaveValue(82.5);

    // Mark that logged set as warmup — it no longer counts, so the next
    // working ordinal is back to 1 (80 × 8). The entry deck must refresh
    // to match, not keep showing the stale 82.5 × 6 prefill.
    await user.click(screen.getByRole("button", { name: "Mark as warmup" }));

    await waitFor(() => expect(screen.getByLabelText("Weight (kg)")).toHaveValue(80));
    expect(screen.getByLabelText("Reps")).toHaveValue(8);
  });

  it("auto-advances to the superset peer after logging a set", async () => {
    const user = userEvent.setup();
    idbStore.set(
      ACTIVE_DRAFT_KEY,
      draft({
        exercises: [
          exercise({ workoutExerciseId: "we-1", exerciseName: "Bench Press", position: 0, supersetGroup: "A" }),
          exercise({ workoutExerciseId: "we-2", exerciseName: "Barbell Row", position: 1, supersetGroup: "A" }),
        ],
      }),
    );
    renderPlayer();

    await screen.findByText("Bench Press");
    await user.click(screen.getByRole("button", { name: "Log set" }));

    expect(await screen.findByText("Barbell Row")).toBeInTheDocument();
  });

  it("toggles warmup on an already-logged set", async () => {
    const user = userEvent.setup();
    idbStore.set(ACTIVE_DRAFT_KEY, draft());
    renderPlayer();

    await screen.findByText("Barbell Bench Press");
    await user.click(screen.getByRole("button", { name: "Log set" }));
    await screen.findByRole("button", { name: "Mark as warmup" });

    await user.click(screen.getByRole("button", { name: "Mark as warmup" }));

    expect(await screen.findByRole("button", { name: "Unmark warmup" })).toBeInTheDocument();
  });

  it("moves between exercises with next/previous and skip", async () => {
    const user = userEvent.setup();
    idbStore.set(
      ACTIVE_DRAFT_KEY,
      draft({
        exercises: [
          exercise({ workoutExerciseId: "we-1", exerciseName: "Squat" }),
          exercise({ workoutExerciseId: "we-2", exerciseName: "Leg Press" }),
        ],
      }),
    );
    renderPlayer();

    await screen.findByText("Squat");
    expect(screen.getByRole("button", { name: "Previous exercise" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByText("Leg Press")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next exercise" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous exercise" }));
    expect(await screen.findByText("Squat")).toBeInTheDocument();
  });

  it("auto-starts the rest timer when a set is logged, and it stays visible after navigating to another exercise", async () => {
    const user = userEvent.setup();
    idbStore.set(
      ACTIVE_DRAFT_KEY,
      draft({
        exercises: [
          exercise({ workoutExerciseId: "we-1", exerciseName: "Squat", restSeconds: 90 }),
          exercise({ workoutExerciseId: "we-2", exerciseName: "Leg Press", restSeconds: 60 }),
        ],
      }),
    );
    renderPlayer();

    await screen.findByText("Squat");
    expect(screen.queryByText("Rest")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Log set" }));
    expect(await screen.findByText("Rest")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByText("Leg Press")).toBeInTheDocument();
    expect(screen.getByText("Rest")).toBeInTheDocument();
  });

  it("ends the rest timer via the done-resting control", async () => {
    const user = userEvent.setup();
    idbStore.set(ACTIVE_DRAFT_KEY, draft());
    renderPlayer();

    await screen.findByText("Barbell Bench Press");
    await user.click(screen.getByRole("button", { name: "Log set" }));
    await screen.findByText("Rest");

    await user.click(screen.getByRole("button", { name: "Done resting" }));
    // The rest sheet stays mounted through its own exit transition (ticket
    // 023) rather than unmounting instantly, so this settles asynchronously.
    await waitFor(() => expect(screen.queryByText("Rest")).not.toBeInTheDocument());
  });

  describe("Rest sheet + inline set editing (ticket 023)", () => {
    it("keeps the entry deck and rest sheet both interactable at once", async () => {
      const user = userEvent.setup();
      idbStore.set(ACTIVE_DRAFT_KEY, draft());
      renderPlayer();

      await screen.findByText("Barbell Bench Press");
      await user.click(screen.getByRole("button", { name: "Log set" }));
      await screen.findByText("Rest");

      // The rest sheet's own control still works...
      await user.click(screen.getByRole("button", { name: "-15s" }));
      // ...and the entry deck above it, seeded for the next set, is still
      // operable at the same time — neither is hidden or dimmed behind the
      // other.
      await user.clear(screen.getByLabelText("Weight (kg)"));
      await user.type(screen.getByLabelText("Weight (kg)"), "85");

      expect(screen.getByLabelText("Weight (kg)")).toHaveValue(85);
      expect(screen.getByText("Rest")).toBeInTheDocument();
    });

    it("edits a logged set: tap to open, adjust weight, Save writes through to IndexedDB", async () => {
      const user = userEvent.setup();
      idbStore.set(ACTIVE_DRAFT_KEY, draft());
      renderPlayer();

      await screen.findByText("Barbell Bench Press");
      await user.click(screen.getByRole("button", { name: "Log set" }));
      await screen.findByText("Set 1");

      await user.click(screen.getByRole("button", { name: "Edit set 1" }));
      // The entry deck below has its own "Weight (kg)" Stepper for the next
      // set — scope to the edit row so these queries don't collide with it.
      const editRow = screen.getByText("Set 1").closest("div")!;
      expect(within(editRow).getByLabelText("Weight (kg)")).toHaveValue(20);
      await user.click(within(editRow).getByRole("button", { name: "Weight (kg): increase" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(idbSet).toHaveBeenLastCalledWith(
          ACTIVE_DRAFT_KEY,
          expect.objectContaining({
            exercises: [
              expect.objectContaining({
                sets: [expect.objectContaining({ setNumber: 1, weight: 22.5, reps: 8 })],
              }),
            ],
          }),
        ),
      );
      // Edit mode closed — the Save/Cancel/Delete row is gone.
      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    });

    it("deletes a logged set after a second confirm tap, renumbering the remainder", async () => {
      const user = userEvent.setup();
      idbStore.set(ACTIVE_DRAFT_KEY, draft({ exercises: [exercise({ targetSets: 2 })] }));
      renderPlayer();

      await screen.findByText("Barbell Bench Press");
      await user.click(screen.getByRole("button", { name: "Log set" }));
      await screen.findByText("Set 1");
      await user.click(screen.getByRole("button", { name: "Log set" }));
      await screen.findByText("Set 2");

      await user.click(screen.getByRole("button", { name: "Edit set 1" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));
      // Delete doesn't fire on the first tap — it swaps into a confirm step.
      expect(idbSet).not.toHaveBeenLastCalledWith(
        ACTIVE_DRAFT_KEY,
        expect.objectContaining({
          exercises: [expect.objectContaining({ sets: [expect.objectContaining({ setNumber: 1 })] })],
        }),
      );
      await user.click(screen.getByRole("button", { name: "Confirm delete" }));

      await waitFor(() =>
        expect(idbSet).toHaveBeenLastCalledWith(
          ACTIVE_DRAFT_KEY,
          expect.objectContaining({
            exercises: [expect.objectContaining({ sets: [expect.objectContaining({ setNumber: 1 })] })],
          }),
        ),
      );
      expect(useSessionStore.getState().draft!.exercises[0].sets).toHaveLength(1);
    });

    it("resets edit state when navigating to a different exercise", async () => {
      const user = userEvent.setup();
      idbStore.set(
        ACTIVE_DRAFT_KEY,
        draft({
          exercises: [
            exercise({ workoutExerciseId: "we-1", exerciseName: "Squat" }),
            exercise({ workoutExerciseId: "we-2", exerciseName: "Leg Press" }),
          ],
        }),
      );
      renderPlayer();

      await screen.findByText("Squat");
      await user.click(screen.getByRole("button", { name: "Log set" }));
      await screen.findByText("Set 1");
      await user.click(screen.getByRole("button", { name: "Edit set 1" }));
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Skip" }));
      await screen.findByText("Leg Press");
      await user.click(screen.getByRole("button", { name: "Previous exercise" }));
      await screen.findByText("Squat");

      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    });
  });

  describe("Finish flow (ticket 014)", () => {
    it("shows a summary — duration, volume, sets completed — before committing anything", async () => {
      const user = userEvent.setup();
      idbStore.set(
        ACTIVE_DRAFT_KEY,
        draft({
          startedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
          exercises: [
            exercise({
              sets: [
                { setNumber: 1, weight: 80, reps: 8, isWarmup: false, rpe: null, completedAt: "t" },
              ],
            }),
          ],
        }),
      );
      renderPlayer();

      await screen.findByText("Barbell Bench Press");
      await user.click(screen.getByRole("button", { name: "Finish" }));

      expect(await screen.findByText("Finish session?")).toBeInTheDocument();
      expect(screen.getByText("30 min")).toBeInTheDocument();
      expect(screen.getByText("640 kg")).toBeInTheDocument();
      expect(mockFinishSession).not.toHaveBeenCalled();
    });

    it("on success: commits and navigates to the session in history", async () => {
      const user = userEvent.setup();
      mockFinishSession.mockResolvedValue({ ok: true, sessionId: "session-1" });
      idbStore.set(ACTIVE_DRAFT_KEY, draft());
      renderPlayer();

      await screen.findByText("Barbell Bench Press");
      await user.click(screen.getByRole("button", { name: "Finish" }));
      await screen.findByText("Finish session?");
      await user.click(screen.getByRole("button", { name: "Finish session" }));

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/history/session-1"));
      expect(mockFinishSession).toHaveBeenCalledTimes(1);
    });

    it("on failure: keeps the draft, shows a retry banner, and lets the user retry", async () => {
      const user = userEvent.setup();
      mockFinishSession.mockResolvedValue({ ok: false, error: "offline" });
      idbStore.set(ACTIVE_DRAFT_KEY, draft());
      renderPlayer();

      await screen.findByText("Barbell Bench Press");
      await user.click(screen.getByRole("button", { name: "Finish" }));
      await screen.findByText("Finish session?");
      await user.click(screen.getByRole("button", { name: "Finish session" }));

      expect(
        await screen.findByText(
          "Couldn’t save. Check your connection and try again; your session is safe on this device.",
        ),
      ).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();

      // Retry: same dialog, Retry re-invokes finishSession with the same draft.
      mockFinishSession.mockResolvedValue({ ok: true, sessionId: "session-1" });
      await user.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/history/session-1"));
      expect(mockFinishSession).toHaveBeenCalledTimes(2);
    });

    it("on a network failure resolving the user (offline, before commit_session is even reached): shows the retry banner rather than hanging", async () => {
      // Regression guard: supabase-js's auth.getUser() rejects outright on a
      // plain fetch failure (it only returns `{ error }` for actual
      // AuthErrors) — this must land on the same retry banner as a
      // commit_session failure, not an unhandled rejection that leaves the
      // dialog stuck on "Saving…" forever.
      const user = userEvent.setup();
      mockGetUser.mockRejectedValueOnce(new Error("network request failed"));
      idbStore.set(ACTIVE_DRAFT_KEY, draft());
      renderPlayer();

      await screen.findByText("Barbell Bench Press");
      await user.click(screen.getByRole("button", { name: "Finish" }));
      await screen.findByText("Finish session?");
      await user.click(screen.getByRole("button", { name: "Finish session" }));

      expect(
        await screen.findByText(
          "Couldn’t save. Check your connection and try again; your session is safe on this device.",
        ),
      ).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockFinishSession).not.toHaveBeenCalled();
    });

    it("Keep training dismisses the dialog without calling finishSession", async () => {
      const user = userEvent.setup();
      idbStore.set(ACTIVE_DRAFT_KEY, draft());
      renderPlayer();

      await screen.findByText("Barbell Bench Press");
      await user.click(screen.getByRole("button", { name: "Finish" }));
      await screen.findByText("Finish session?");

      await user.click(screen.getByRole("button", { name: "Keep training" }));

      expect(screen.queryByText("Finish session?")).not.toBeInTheDocument();
      expect(mockFinishSession).not.toHaveBeenCalled();
    });
  });
});
