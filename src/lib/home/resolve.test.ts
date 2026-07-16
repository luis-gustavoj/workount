import { describe, expect, it } from "vitest";

import { findNextScheduledWorkout, resolveHome, type HomeWorkout, type ResolveHomeInput } from "./resolve";

const NOW = Date.parse("2026-07-16T18:00:00.000Z"); // a Thursday

const pushA: HomeWorkout = { id: "w-push-a", name: "Push A", dayOfWeek: 4 }; // Thursday
const pullA: HomeWorkout = { id: "w-pull-a", name: "Pull A", dayOfWeek: 4 }; // Thursday, same day as pushA
const legsA: HomeWorkout = { id: "w-legs-a", name: "Legs A", dayOfWeek: 1 }; // Monday
const unscheduled: HomeWorkout = { id: "w-any", name: "Full Body", dayOfWeek: null };

function baseInput(overrides: Partial<ResolveHomeInput> = {}): ResolveHomeInput {
  return {
    now: NOW,
    draft: null,
    activeProgramId: "program-1",
    todaysWorkouts: [],
    completedWorkoutIdsToday: [],
    nextWorkout: null,
    ...overrides,
  };
}

describe("resolveHome", () => {
  it("1. resumes a fresh draft, over everything else", () => {
    const startedAt = new Date(NOW - 5 * 60 * 1000).toISOString(); // 5 min ago
    const state = resolveHome(
      baseInput({
        draft: { startedAt },
        todaysWorkouts: [pushA], // would otherwise resolve to "today"
      }),
    );
    expect(state).toEqual({ kind: "resume", startedAt, stale: false });
  });

  it("2. flags a draft older than 12h as stale", () => {
    const startedAt = new Date(NOW - 13 * 60 * 60 * 1000).toISOString();
    const state = resolveHome(baseInput({ draft: { startedAt } }));
    expect(state).toEqual({ kind: "resume", startedAt, stale: true });
  });

  it("draft exactly at the 12h boundary is not yet stale", () => {
    const startedAt = new Date(NOW - 12 * 60 * 60 * 1000).toISOString();
    const state = resolveHome(baseInput({ draft: { startedAt } }));
    expect(state).toEqual({ kind: "resume", startedAt, stale: false });
  });

  it("3. recommends today's workout when it hasn't been completed", () => {
    const state = resolveHome(baseInput({ todaysWorkouts: [pushA] }));
    expect(state).toEqual({ kind: "today", workouts: [pushA] });
  });

  it("shows both workouts when two are scheduled for today (007)", () => {
    const state = resolveHome(baseInput({ todaysWorkouts: [pushA, pullA] }));
    expect(state).toEqual({ kind: "today", workouts: [pushA, pullA] });
  });

  it("shows only the still-pending workout when one of two today's is already done", () => {
    const state = resolveHome(
      baseInput({
        todaysWorkouts: [pushA, pullA],
        completedWorkoutIdsToday: [pullA.id],
      }),
    );
    expect(state).toEqual({ kind: "today", workouts: [pushA] });
  });

  it("4. falls through to rest with no workout scheduled today (unscheduled program)", () => {
    const state = resolveHome(baseInput({ todaysWorkouts: [], nextWorkout: legsA }));
    expect(state).toEqual({ kind: "rest", nextWorkout: legsA, completedToday: [] });
  });

  it("5. falls through to rest, naming what was already done, once today's workout is completed", () => {
    const state = resolveHome(
      baseInput({
        todaysWorkouts: [pushA],
        completedWorkoutIdsToday: [pushA.id],
        nextWorkout: legsA,
      }),
    );
    expect(state).toEqual({ kind: "rest", nextWorkout: legsA, completedToday: [pushA] });
  });

  it("6. shows the no-program empty state when nothing is active", () => {
    const state = resolveHome(baseInput({ activeProgramId: null }));
    expect(state).toEqual({ kind: "no-program" });
  });

  it("a draft wins even with no active program", () => {
    const startedAt = new Date(NOW).toISOString();
    const state = resolveHome(baseInput({ activeProgramId: null, draft: { startedAt } }));
    expect(state).toEqual({ kind: "resume", startedAt, stale: false });
  });

  it("rest day still offers the escape hatch when the program has unscheduled workouts", () => {
    const state = resolveHome(baseInput({ todaysWorkouts: [], nextWorkout: null }));
    expect(state).toEqual({ kind: "rest", nextWorkout: null, completedToday: [] });
  });
});

describe("findNextScheduledWorkout", () => {
  it("picks the closest upcoming day, wrapping the week", () => {
    // today is Thursday (4); legsA is Monday (1) → 4 days away
    expect(findNextScheduledWorkout([legsA], 4)).toEqual(legsA);
  });

  it("treats a workout on today's own day as next week, not today", () => {
    expect(findNextScheduledWorkout([pushA], 4)).toEqual(pushA);
  });

  it("prefers the nearer of two scheduled workouts", () => {
    const wed: HomeWorkout = { id: "w-wed", name: "Wed Workout", dayOfWeek: 3 };
    const fri: HomeWorkout = { id: "w-fri", name: "Fri Workout", dayOfWeek: 5 };
    // today is Thursday (4): wed is 6 days away, fri is 1 day away
    expect(findNextScheduledWorkout([wed, fri], 4)).toEqual(fri);
  });

  it("ignores unscheduled workouts", () => {
    expect(findNextScheduledWorkout([unscheduled], 4)).toBeNull();
  });

  it("returns null when there are no scheduled workouts at all", () => {
    expect(findNextScheduledWorkout([], 4)).toBeNull();
  });
});
