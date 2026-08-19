import { describe, expect, it } from "vitest";

import { buildResolveHomeInput } from "./build-input";
import type { HomeWorkout } from "./resolve";

const NOW = Date.parse("2026-07-16T18:00:00.000Z"); // Thursday, local UTC for this test

const pushA: HomeWorkout = { id: "w-push-a", name: "Push A", dayOfWeek: 4 , exerciseCount: 4 };
const legsA: HomeWorkout = { id: "w-legs-a", name: "Legs A", dayOfWeek: 1 , exerciseCount: 4 };

describe("buildResolveHomeInput", () => {
  it("marks a workout completed today when its session's completedAt falls on today's calendar day", () => {
    const input = buildResolveHomeInput({
      now: NOW,
      draft: null,
      activeProgramId: "p1",
      workouts: [pushA, legsA],
      completedSessions: [{ workoutId: pushA.id, completedAt: "2026-07-16T12:00:00.000Z" }],
    });
    expect(input.completedWorkoutIdsToday).toEqual([pushA.id]);
    expect(input.todaysWorkouts).toEqual([pushA]);
  });

  it("does not count a session completed on a different calendar day as today", () => {
    const input = buildResolveHomeInput({
      now: NOW,
      draft: null,
      activeProgramId: "p1",
      workouts: [pushA],
      completedSessions: [{ workoutId: pushA.id, completedAt: "2026-07-15T23:59:00.000Z" }],
    });
    expect(input.completedWorkoutIdsToday).toEqual([]);
  });

  it("ignores sessions whose workout was since deleted (workoutId null)", () => {
    const input = buildResolveHomeInput({
      now: NOW,
      draft: null,
      activeProgramId: "p1",
      workouts: [pushA],
      completedSessions: [{ workoutId: null, completedAt: "2026-07-16T12:00:00.000Z" }],
    });
    expect(input.completedWorkoutIdsToday).toEqual([]);
  });

  it("computes the next scheduled workout from the full workout list", () => {
    const input = buildResolveHomeInput({
      now: NOW,
      draft: null,
      activeProgramId: "p1",
      workouts: [pushA, legsA],
      completedSessions: [],
    });
    expect(input.nextWorkout).toEqual(legsA);
  });

  it("passes the draft through untouched", () => {
    const draft = { startedAt: "2026-07-16T17:00:00.000Z" };
    const input = buildResolveHomeInput({
      now: NOW,
      draft,
      activeProgramId: "p1",
      workouts: [],
      completedSessions: [],
    });
    expect(input.draft).toEqual(draft);
  });
});
