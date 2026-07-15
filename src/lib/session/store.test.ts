import { beforeEach, describe, expect, it, vi } from "vitest";

const idbStore = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: vi.fn((key: string) => Promise.resolve(idbStore.get(key))),
  set: vi.fn((key: string, value: unknown) => {
    idbStore.set(key, value);
    return Promise.resolve();
  }),
}));

import { get as idbGet, set as idbSet } from "idb-keyval";

import { useSessionStore } from "./store";
import { ACTIVE_DRAFT_KEY, SESSION_DRAFT_VERSION, type DraftExercise, type SessionDraft } from "./types";

// The store is the I/O shell around the pure logic in player.ts (see
// player.test.ts for the superset-alternation rule itself). These tests cover
// the two hard rules from ticket 012: every mutation writes through to
// IndexedDB immediately, and warmups never consume a target_sets slot.

function exercise(overrides: Partial<DraftExercise> = {}): DraftExercise {
  return {
    workoutExerciseId: "we-1",
    exerciseId: "ex-1",
    exerciseName: "Barbell Bench Press",
    muscleGroup: "chest",
    equipment: "barbell",
    position: 0,
    targetSets: 3,
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

beforeEach(() => {
  idbStore.clear();
  vi.clearAllMocks();
  useSessionStore.setState({ draft: null, status: "loading" });
});

describe("hydrate", () => {
  it("loads a matching-version draft from IndexedDB", async () => {
    idbStore.set(ACTIVE_DRAFT_KEY, draft());
    await useSessionStore.getState().hydrate();

    expect(idbGet).toHaveBeenCalledWith(ACTIVE_DRAFT_KEY);
    expect(useSessionStore.getState().status).toBe("ready");
    expect(useSessionStore.getState().draft?.id).toBe("session-1");
  });

  it("reports empty when no draft exists", async () => {
    await useSessionStore.getState().hydrate();
    expect(useSessionStore.getState().status).toBe("empty");
    expect(useSessionStore.getState().draft).toBeNull();
  });

  it("reports empty for a draft with a mismatched version", async () => {
    idbStore.set(ACTIVE_DRAFT_KEY, { ...draft(), version: 999 });
    await useSessionStore.getState().hydrate();
    expect(useSessionStore.getState().status).toBe("empty");
  });

  it("clamps an out-of-range activeExerciseIndex instead of trusting it verbatim", async () => {
    idbStore.set(ACTIVE_DRAFT_KEY, draft({ activeExerciseIndex: 7 }));
    await useSessionStore.getState().hydrate();
    expect(useSessionStore.getState().draft!.activeExerciseIndex).toBe(0);
  });

  it("clamps a negative activeExerciseIndex to 0", async () => {
    idbStore.set(ACTIVE_DRAFT_KEY, draft({ activeExerciseIndex: -3 }));
    await useSessionStore.getState().hydrate();
    expect(useSessionStore.getState().draft!.activeExerciseIndex).toBe(0);
  });

  it("normalizes missing rest-timer fields (a draft persisted before ticket 013) to null instead of undefined", async () => {
    const legacyDraft = draft();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (legacyDraft as any).restEndsAt;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (legacyDraft as any).restStartedAt;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (legacyDraft as any).restNotifiedAt;
    idbStore.set(ACTIVE_DRAFT_KEY, legacyDraft);

    await useSessionStore.getState().hydrate();

    const hydrated = useSessionStore.getState().draft!;
    expect(hydrated.restEndsAt).toBeNull();
    expect(hydrated.restStartedAt).toBeNull();
    expect(hydrated.restNotifiedAt).toBeNull();
  });
});

describe("logSet", () => {
  it("appends a set and writes through to IndexedDB immediately", async () => {
    useSessionStore.setState({ draft: draft(), status: "ready" });

    await useSessionStore.getState().logSet("we-1", { weight: 80, reps: 8, isWarmup: false });

    const logged = useSessionStore.getState().draft!.exercises[0].sets;
    expect(logged).toEqual([
      expect.objectContaining({ setNumber: 1, weight: 80, reps: 8, isWarmup: false }),
    ]);
    expect(idbSet).toHaveBeenCalledWith(
      ACTIVE_DRAFT_KEY,
      expect.objectContaining({ exercises: [expect.objectContaining({ sets: logged })] }),
    );
  });

  it("numbers sets sequentially, including warmups, but a warmup still does not count toward the target", async () => {
    useSessionStore.setState({ draft: draft({ exercises: [exercise({ targetSets: 2 })] }) });

    await useSessionStore.getState().logSet("we-1", { weight: 20, reps: 10, isWarmup: true });
    await useSessionStore.getState().logSet("we-1", { weight: 80, reps: 8, isWarmup: false });

    const sets = useSessionStore.getState().draft!.exercises[0].sets;
    expect(sets.map((s) => s.setNumber)).toEqual([1, 2]);
    expect(sets[0].isWarmup).toBe(true);
    expect(sets[1].isWarmup).toBe(false);
  });

  it("allows logging beyond targetSets (an extra set)", async () => {
    useSessionStore.setState({ draft: draft({ exercises: [exercise({ targetSets: 1 })] }) });

    await useSessionStore.getState().logSet("we-1", { weight: 80, reps: 8, isWarmup: false });
    await useSessionStore.getState().logSet("we-1", { weight: 80, reps: 6, isWarmup: false });

    expect(useSessionStore.getState().draft!.exercises[0].sets).toHaveLength(2);
  });

  it("auto-advances to the superset peer after logging a set", async () => {
    useSessionStore.setState({
      draft: draft({
        exercises: [
          exercise({ workoutExerciseId: "we-1", position: 0, supersetGroup: "A" }),
          exercise({ workoutExerciseId: "we-2", position: 1, supersetGroup: "A" }),
        ],
      }),
    });

    await useSessionStore.getState().logSet("we-1", { weight: 40, reps: 10, isWarmup: false });

    expect(useSessionStore.getState().draft!.activeExerciseIndex).toBe(1);
  });

  it("does nothing when hydration hasn't produced a draft yet", async () => {
    await useSessionStore.getState().logSet("we-1", { weight: 80, reps: 8, isWarmup: false });
    expect(idbSet).not.toHaveBeenCalled();
  });

  it("is a no-op for an unknown workoutExerciseId", async () => {
    useSessionStore.setState({ draft: draft() });
    await useSessionStore.getState().logSet("does-not-exist", { weight: 1, reps: 1, isWarmup: false });
    expect(useSessionStore.getState().draft!.exercises[0].sets).toEqual([]);
    expect(idbSet).not.toHaveBeenCalled();
  });

  it("auto-starts the rest timer from the logged exercise's effective restSeconds (ticket 013)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    useSessionStore.setState({
      draft: draft({ exercises: [exercise({ restSeconds: 120 })] }),
    });

    await useSessionStore.getState().logSet("we-1", { weight: 80, reps: 8, isWarmup: false });

    expect(useSessionStore.getState().draft!.restEndsAt).toBe(1_000_000 + 120_000);
    vi.useRealTimers();
  });

  it("restarts the rest timer on every logged set, including while a previous rest was still counting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    useSessionStore.setState({ draft: draft({ exercises: [exercise({ restSeconds: 90 })] }) });
    await useSessionStore.getState().logSet("we-1", { weight: 80, reps: 8, isWarmup: false });

    vi.setSystemTime(1_050_000);
    await useSessionStore.getState().logSet("we-1", { weight: 80, reps: 8, isWarmup: false });

    expect(useSessionStore.getState().draft!.restEndsAt).toBe(1_050_000 + 90_000);
    vi.useRealTimers();
  });

  it("sets restStartedAt to the moment of logging and resets restNotifiedAt, so the new rest can notify again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    useSessionStore.setState({
      draft: draft({
        exercises: [exercise({ restSeconds: 90 })],
        restStartedAt: 500_000,
        restNotifiedAt: 500_000,
      }),
    });

    await useSessionStore.getState().logSet("we-1", { weight: 80, reps: 8, isWarmup: false });

    expect(useSessionStore.getState().draft!.restStartedAt).toBe(1_000_000);
    expect(useSessionStore.getState().draft!.restNotifiedAt).toBeNull();
    vi.useRealTimers();
  });
});

describe("adjustRest", () => {
  it("adjusts restEndsAt by the given delta and persists", async () => {
    useSessionStore.setState({ draft: draft({ restEndsAt: 1_000_000, restStartedAt: 910_000 }) });

    await useSessionStore.getState().adjustRest(15_000);

    expect(useSessionStore.getState().draft!.restEndsAt).toBe(1_015_000);
    expect(idbSet).toHaveBeenCalledWith(
      ACTIVE_DRAFT_KEY,
      expect.objectContaining({ restEndsAt: 1_015_000 }),
    );
  });

  it("subtracts for a negative delta (-15s button)", async () => {
    useSessionStore.setState({ draft: draft({ restEndsAt: 1_000_000 }) });
    await useSessionStore.getState().adjustRest(-15_000);
    expect(useSessionStore.getState().draft!.restEndsAt).toBe(985_000);
  });

  it("leaves restStartedAt and restNotifiedAt untouched — a ±15s tap during overtime must not look like a fresh rest", async () => {
    useSessionStore.setState({
      draft: draft({ restEndsAt: 1_000_000, restStartedAt: 910_000, restNotifiedAt: 910_000 }),
    });

    await useSessionStore.getState().adjustRest(15_000);

    expect(useSessionStore.getState().draft!.restStartedAt).toBe(910_000);
    expect(useSessionStore.getState().draft!.restNotifiedAt).toBe(910_000);
  });

  it("is a no-op when no rest timer is running", async () => {
    useSessionStore.setState({ draft: draft({ restEndsAt: null }) });
    await useSessionStore.getState().adjustRest(15_000);
    expect(useSessionStore.getState().draft!.restEndsAt).toBeNull();
    expect(idbSet).not.toHaveBeenCalled();
  });

  it("is a no-op when hydration hasn't produced a draft yet", async () => {
    await useSessionStore.getState().adjustRest(15_000);
    expect(idbSet).not.toHaveBeenCalled();
  });
});

describe("endRest", () => {
  it("clears restEndsAt, restStartedAt, and restNotifiedAt, and persists", async () => {
    useSessionStore.setState({
      draft: draft({ restEndsAt: 1_000_000, restStartedAt: 910_000, restNotifiedAt: 910_000 }),
    });

    await useSessionStore.getState().endRest();

    const draftAfter = useSessionStore.getState().draft!;
    expect(draftAfter.restEndsAt).toBeNull();
    expect(draftAfter.restStartedAt).toBeNull();
    expect(draftAfter.restNotifiedAt).toBeNull();
    expect(idbSet).toHaveBeenCalledWith(ACTIVE_DRAFT_KEY, expect.objectContaining({ restEndsAt: null }));
  });

  it("is a no-op when hydration hasn't produced a draft yet", async () => {
    await useSessionStore.getState().endRest();
    expect(idbSet).not.toHaveBeenCalled();
  });
});

describe("markRestNotified", () => {
  it("records restStartedAt as the notified point and persists", async () => {
    useSessionStore.setState({ draft: draft({ restEndsAt: 1_000_000, restStartedAt: 910_000 }) });

    await useSessionStore.getState().markRestNotified();

    expect(useSessionStore.getState().draft!.restNotifiedAt).toBe(910_000);
    expect(idbSet).toHaveBeenCalledWith(
      ACTIVE_DRAFT_KEY,
      expect.objectContaining({ restNotifiedAt: 910_000 }),
    );
  });

  it("is a no-op when no rest has started", async () => {
    useSessionStore.setState({ draft: draft({ restStartedAt: null }) });
    await useSessionStore.getState().markRestNotified();
    expect(useSessionStore.getState().draft!.restNotifiedAt).toBeNull();
    expect(idbSet).not.toHaveBeenCalled();
  });

  it("is a no-op when hydration hasn't produced a draft yet", async () => {
    await useSessionStore.getState().markRestNotified();
    expect(idbSet).not.toHaveBeenCalled();
  });
});

describe("toggleWarmup", () => {
  it("flips an already-logged set's warmup flag and persists", async () => {
    useSessionStore.setState({ draft: draft() });
    await useSessionStore.getState().logSet("we-1", { weight: 80, reps: 8, isWarmup: false });

    await useSessionStore.getState().toggleWarmup("we-1", 1);

    expect(useSessionStore.getState().draft!.exercises[0].sets[0].isWarmup).toBe(true);
    expect(idbSet).toHaveBeenLastCalledWith(
      ACTIVE_DRAFT_KEY,
      expect.objectContaining({
        exercises: [expect.objectContaining({ sets: [expect.objectContaining({ isWarmup: true })] })],
      }),
    );
  });
});

describe("goToExercise", () => {
  it("moves to a valid index and persists it", async () => {
    useSessionStore.setState({
      draft: draft({ exercises: [exercise({ workoutExerciseId: "we-1" }), exercise({ workoutExerciseId: "we-2" })] }),
    });

    await useSessionStore.getState().goToExercise(1);

    expect(useSessionStore.getState().draft!.activeExerciseIndex).toBe(1);
    expect(idbSet).toHaveBeenCalledWith(
      ACTIVE_DRAFT_KEY,
      expect.objectContaining({ activeExerciseIndex: 1 }),
    );
  });

  it("ignores an out-of-range index", async () => {
    useSessionStore.setState({ draft: draft() });
    await useSessionStore.getState().goToExercise(5);
    expect(useSessionStore.getState().draft!.activeExerciseIndex).toBe(0);
    expect(idbSet).not.toHaveBeenCalled();
  });
});
