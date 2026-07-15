import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  del: vi.fn().mockResolvedValue(undefined),
}));

import { del as idbDel } from "idb-keyval";

import {
  buildCommitPayload,
  buildFinishSummary,
  commitSessionPayloadSchema,
  finishSession,
} from "./commit";
import { SESSION_DRAFT_VERSION, type DraftExercise, type SessionDraft } from "./types";

// commit.ts is the finish flow (ticket 014): buildCommitPayload/
// buildFinishSummary are pure and tested directly; finishSession is the I/O
// shell around them, tested against a faked Supabase client so these run
// without a real database — the atomicity/idempotency guarantees of
// commit_session itself are proven for real in
// scripts/test-commit-session.ts, per this repo's convention for RPC
// behavior (see scripts/test-last-performance.ts, scripts/test-rls.ts).

const USER_ID = "11111111-1111-4111-8111-111111111111";

function exercise(overrides: Partial<DraftExercise> = {}): DraftExercise {
  return {
    workoutExerciseId: "55555555-5555-4555-8555-555555555555",
    exerciseId: "66666666-6666-4666-8666-666666666666",
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
    id: "22222222-2222-4222-8222-222222222222",
    programId: "33333333-3333-4333-8333-333333333333",
    workoutId: "44444444-4444-4444-8444-444444444444",
    startedAt: "2026-07-15T18:00:00.000Z",
    exercises: [exercise()],
    activeExerciseIndex: 0,
    restEndsAt: null,
    restStartedAt: null,
    restNotifiedAt: null,
    ...overrides,
  };
}

const COMPLETED_AT = new Date("2026-07-15T18:52:00.000Z");

describe("buildCommitPayload", () => {
  it("computes duration in seconds from startedAt to completedAt", () => {
    const payload = buildCommitPayload(draft(), USER_ID, COMPLETED_AT);
    expect(payload.duration_seconds).toBe(52 * 60);
  });

  it("carries through session identity fields untouched", () => {
    const payload = buildCommitPayload(draft(), USER_ID, COMPLETED_AT);
    expect(payload.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(payload.user_id).toBe(USER_ID);
    expect(payload.program_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(payload.workout_id).toBe("44444444-4444-4444-8444-444444444444");
  });

  it("snapshots each set's exercise_id, target rep range, and workout_exercise_id from its exercise (ADR-0002)", () => {
    const d = draft({
      exercises: [
        exercise({
          workoutExerciseId: "we-9",
          exerciseId: "ex-9",
          repMin: 6,
          repMax: 10,
          position: 2,
          sets: [
            {
              setNumber: 1,
              weight: 80,
              reps: 8,
              isWarmup: false,
              rpe: null,
              completedAt: "2026-07-15T18:10:00.000Z",
            },
          ],
        }),
      ],
    });
    const payload = buildCommitPayload(d, USER_ID, COMPLETED_AT);
    expect(payload.sets).toEqual([
      {
        exercise_id: "ex-9",
        workout_exercise_id: "we-9",
        position: 2,
        set_number: 1,
        weight: 80,
        reps: 8,
        is_warmup: false,
        rpe: null,
        target_rep_min: 6,
        target_rep_max: 10,
        completed_at: "2026-07-15T18:10:00.000Z",
      },
    ]);
  });

  it("flattens sets across multiple exercises, preserving each exercise's own snapshot", () => {
    const d = draft({
      exercises: [
        exercise({
          workoutExerciseId: "we-1",
          exerciseId: "ex-1",
          sets: [
            {
              setNumber: 1,
              weight: 80,
              reps: 8,
              isWarmup: false,
              rpe: null,
              completedAt: "2026-07-15T18:10:00.000Z",
            },
          ],
        }),
        exercise({
          workoutExerciseId: "we-2",
          exerciseId: "ex-2",
          position: 1,
          sets: [
            {
              setNumber: 1,
              weight: 100,
              reps: 5,
              isWarmup: false,
              rpe: null,
              completedAt: "2026-07-15T18:20:00.000Z",
            },
          ],
        }),
      ],
    });
    const payload = buildCommitPayload(d, USER_ID, COMPLETED_AT);
    expect(payload.sets.map((s) => s.exercise_id)).toEqual(["ex-1", "ex-2"]);
  });

  it("produces an empty sets array for a session where nothing was logged", () => {
    const payload = buildCommitPayload(draft({ exercises: [exercise({ sets: [] })] }), USER_ID, COMPLETED_AT);
    expect(payload.sets).toEqual([]);
  });

  it("passes zod validation for a well-formed draft", () => {
    const d = draft({
      exercises: [
        exercise({
          sets: [
            {
              setNumber: 1,
              weight: 80,
              reps: 8,
              isWarmup: true,
              rpe: 8.5,
              completedAt: "2026-07-15T18:10:00.000Z",
            },
          ],
        }),
      ],
    });
    const payload = buildCommitPayload(d, USER_ID, COMPLETED_AT);
    expect(() => commitSessionPayloadSchema.parse(payload)).not.toThrow();
  });
});

describe("buildFinishSummary", () => {
  it("excludes warmups from volume and the completed-set count (CLAUDE.md: warmups never count)", () => {
    const d = draft({
      exercises: [
        exercise({
          sets: [
            { setNumber: 1, weight: 20, reps: 10, isWarmup: true, rpe: null, completedAt: "t" },
            { setNumber: 2, weight: 80, reps: 8, isWarmup: false, rpe: null, completedAt: "t" },
          ],
        }),
      ],
    });
    const summary = buildFinishSummary(d, COMPLETED_AT);
    expect(summary.setsCompleted).toBe(1);
    expect(summary.totalVolumeKg).toBe(80 * 8);
  });

  it("sums volume across exercises", () => {
    const d = draft({
      exercises: [
        exercise({
          workoutExerciseId: "we-1",
          sets: [{ setNumber: 1, weight: 80, reps: 8, isWarmup: false, rpe: null, completedAt: "t" }],
        }),
        exercise({
          workoutExerciseId: "we-2",
          position: 1,
          sets: [{ setNumber: 1, weight: 100, reps: 5, isWarmup: false, rpe: null, completedAt: "t" }],
        }),
      ],
    });
    const summary = buildFinishSummary(d, COMPLETED_AT);
    expect(summary.totalVolumeKg).toBe(80 * 8 + 100 * 5);
  });

  it("flags a PR when this session's best e1RM beats the last-performance snapshot", () => {
    const d = draft({
      exercises: [
        exercise({
          exerciseName: "Squat",
          lastPerformance: [{ setNumber: 1, weight: 100, reps: 5 }],
          sets: [{ setNumber: 1, weight: 110, reps: 5, isWarmup: false, rpe: null, completedAt: "t" }],
        }),
      ],
    });
    const summary = buildFinishSummary(d, COMPLETED_AT);
    expect(summary.prExerciseNames).toEqual(["Squat"]);
  });

  it("does not flag a PR when this session doesn't beat the last-performance snapshot", () => {
    const d = draft({
      exercises: [
        exercise({
          lastPerformance: [{ setNumber: 1, weight: 100, reps: 5 }],
          sets: [{ setNumber: 1, weight: 90, reps: 5, isWarmup: false, rpe: null, completedAt: "t" }],
        }),
      ],
    });
    expect(buildFinishSummary(d, COMPLETED_AT).prExerciseNames).toEqual([]);
  });

  it("does not flag a PR for an exercise performed for the first time ever (nothing to beat)", () => {
    const d = draft({
      exercises: [
        exercise({
          lastPerformance: [],
          sets: [{ setNumber: 1, weight: 60, reps: 10, isWarmup: false, rpe: null, completedAt: "t" }],
        }),
      ],
    });
    expect(buildFinishSummary(d, COMPLETED_AT).prExerciseNames).toEqual([]);
  });

  it("ignores an exercise with no working sets logged at all", () => {
    const d = draft({ exercises: [exercise({ sets: [] })] });
    const summary = buildFinishSummary(d, COMPLETED_AT);
    expect(summary.setsCompleted).toBe(0);
    expect(summary.totalVolumeKg).toBe(0);
  });
});

function fakeSupabase(options: { error?: Error; rejects?: Error; sessionId?: string } = {}) {
  const rpc = vi.fn(async () => {
    if (options.rejects) throw options.rejects;
    if (options.error) return { data: null, error: options.error };
    return { data: options.sessionId ?? "22222222-2222-4222-8222-222222222222", error: null };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { rpc } as any;
}

describe("finishSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("on success: calls commit_session with the built payload and clears the draft", async () => {
    const supabase = fakeSupabase();
    const d = draft();
    const result = await finishSession(supabase, d, USER_ID, COMPLETED_AT);

    expect(result).toEqual({ ok: true, sessionId: "22222222-2222-4222-8222-222222222222" });
    expect(supabase.rpc).toHaveBeenCalledWith("commit_session", {
      p_payload: buildCommitPayload(d, USER_ID, COMPLETED_AT),
    });
    expect(idbDel).toHaveBeenCalledTimes(1);
  });

  it("on a returned RPC error: keeps the draft — does not clear IndexedDB", async () => {
    const supabase = fakeSupabase({ error: new Error("bad set row") });
    const result = await finishSession(supabase, draft(), USER_ID, COMPLETED_AT);

    expect(result.ok).toBe(false);
    expect(idbDel).not.toHaveBeenCalled();
  });

  it("on a rejected RPC call (offline, the gym-basement case): keeps the draft, surfaces a failure", async () => {
    const supabase = fakeSupabase({ rejects: new Error("network request failed") });
    const result = await finishSession(supabase, draft(), USER_ID, COMPLETED_AT);

    expect(result).toEqual({ ok: false, error: "network request failed" });
    expect(idbDel).not.toHaveBeenCalled();
  });

  it("does not clear the draft in a finally — only on the confirmed-success path", async () => {
    // Regression guard for "the rule that must not be broken" (ticket 014):
    // a naive `try { commit } finally { clearDraft }` would call idbDel here
    // too. It must not.
    const supabase = fakeSupabase({ error: new Error("offline") });
    await finishSession(supabase, draft(), USER_ID, COMPLETED_AT).catch(() => {});
    expect(idbDel).not.toHaveBeenCalled();
  });
});
