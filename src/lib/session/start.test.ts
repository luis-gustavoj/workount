import { describe, expect, it, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  set: vi.fn().mockResolvedValue(undefined),
}));

import { set as idbSet } from "idb-keyval";

import { startSession } from "./start";
import { ACTIVE_DRAFT_KEY } from "./types";

// startSession is the I/O shell around the pure buildSessionDraft (ticket
// 011): fetch the workout's prescription + exercise metadata + resolved
// default rest + get_last_performance in one go, write the result to
// IndexedDB, then best-effort insert the `sessions` row. These tests fake
// the Supabase client's chainable query builder rather than hitting a real
// database — see docs/adr/0001-offline-first-session-player.md for why this
// function must never make a *mid-session* call, only this one at start.

const WORKOUT_ID = "11111111-1111-4111-8111-111111111111";
const WORKOUT_ROW = { id: "we-1", program_id: "prog-1" };

// A minimal stand-in for postgrest-js's chainable, thenable query builder:
// every chain method returns the same object, and awaiting it resolves to a
// fixed { data, error } regardless of which methods were called along the
// way.
function chainable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    order: () => obj,
    single: () => obj,
    then: (
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return obj;
}

function workoutExerciseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "we-1",
    exercise_id: "ex-1",
    position: 0,
    target_sets: 3,
    rep_min: 8,
    rep_max: 12,
    rest_seconds: null,
    notes: null,
    superset_group: null,
    exercise: { name: "Barbell Bench Press", muscle_group: "chest", equipment: "barbell" },
    ...overrides,
  };
}

type FakeSupabaseOptions = {
  workoutExerciseRows?: ReturnType<typeof workoutExerciseRow>[];
  defaultRestSeconds?: number;
  lastPerformance?: Array<{
    exercise_id: string;
    set_number: number;
    weight: number;
    reps: number;
    performed_at: string;
  }>;
  sessionsInsertRejects?: boolean;
};

function fakeSupabase(options: FakeSupabaseOptions = {}) {
  const {
    workoutExerciseRows = [workoutExerciseRow()],
    defaultRestSeconds = 90,
    lastPerformance = [],
    sessionsInsertRejects = false,
  } = options;

  const rpc = vi.fn().mockResolvedValue({ data: lastPerformance, error: null });

  const from = vi.fn((table: string) => {
    switch (table) {
      case "workouts":
        return chainable({ data: WORKOUT_ROW, error: null });
      case "workout_exercises":
        return chainable({ data: workoutExerciseRows, error: null });
      case "profiles":
        return chainable({ data: { default_rest_seconds: defaultRestSeconds }, error: null });
      case "sessions":
        return sessionsInsertRejects
          ? { insert: () => Promise.reject(new Error("offline")) }
          : { insert: () => Promise.resolve({ data: null, error: null }) };
      default:
        throw new Error(`unexpected table: ${table}`);
    }
  });

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from,
    rpc,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("startSession", () => {
  it("generates a client-side session id (idempotency key for commit_session)", async () => {
    const draft = await startSession(fakeSupabase(), WORKOUT_ID);
    expect(draft.id).toBeTruthy();
    expect(draft.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("builds a complete draft: prescription, exercise metadata, resolved rest, version 1", async () => {
    const supabase = fakeSupabase({
      workoutExerciseRows: [workoutExerciseRow({ rest_seconds: null })],
      defaultRestSeconds: 75,
    });
    const draft = await startSession(supabase, WORKOUT_ID);

    expect(draft.version).toBe(1);
    expect(draft.workoutId).toBe(WORKOUT_ID);
    expect(draft.programId).toBe("prog-1");
    expect(draft.exercises).toHaveLength(1);
    expect(draft.exercises[0].exerciseName).toBe("Barbell Bench Press");
    expect(draft.exercises[0].restSeconds).toBe(75);
    expect(draft.exercises[0].sets).toEqual([]);
  });

  it("writes the whole draft to IndexedDB under the activeDraft key", async () => {
    const draft = await startSession(fakeSupabase(), WORKOUT_ID);
    expect(idbSet).toHaveBeenCalledWith(ACTIVE_DRAFT_KEY, draft);
  });

  it("passes the resolved program id and exercise ids to get_last_performance", async () => {
    const supabase = fakeSupabase({
      workoutExerciseRows: [
        workoutExerciseRow({ id: "we-1", exercise_id: "ex-1" }),
        workoutExerciseRow({ id: "we-2", exercise_id: "ex-2" }),
      ],
    });
    await startSession(supabase, WORKOUT_ID);
    expect(supabase.rpc).toHaveBeenCalledWith("get_last_performance", {
      p_program_id: "prog-1",
      p_exercise_ids: ["ex-1", "ex-2"],
    });
  });

  it("gives an exercise never performed an empty last-performance and does not crash", async () => {
    const supabase = fakeSupabase({
      workoutExerciseRows: [workoutExerciseRow({ exercise_id: "never-done" })],
      lastPerformance: [],
    });
    const draft = await startSession(supabase, WORKOUT_ID);
    expect(draft.exercises[0].lastPerformance).toEqual([]);
  });

  it("skips the get_last_performance round trip for a workout with no exercises", async () => {
    const supabase = fakeSupabase({ workoutExerciseRows: [] });
    const draft = await startSession(supabase, WORKOUT_ID);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(draft.exercises).toEqual([]);
  });

  it("creates the draft anyway when the best-effort sessions insert fails (already offline)", async () => {
    const supabase = fakeSupabase({ sessionsInsertRejects: true });
    const draft = await startSession(supabase, WORKOUT_ID);
    expect(draft.id).toBeTruthy();
    expect(idbSet).toHaveBeenCalledWith(ACTIVE_DRAFT_KEY, draft);
  });

  it("rejects a non-UUID workoutId before any query runs (Zod at the boundary, CLAUDE.md)", async () => {
    const supabase = fakeSupabase();
    await expect(startSession(supabase, "not-a-uuid")).rejects.toThrow();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
