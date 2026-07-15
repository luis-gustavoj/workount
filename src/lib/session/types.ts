import type { Equipment, MuscleGroup } from "@/lib/validation/exercise";

// The offline session draft (ticket 011, ADR-0001). Written to IndexedDB
// under a single `activeDraft` key and read/written with zero network calls
// for the rest of the session — the player (ticket 012) never fetches
// anything mid-session, so this shape must already hold everything it will
// ever need.
//
// `version: 1` is not decorative. This is a *persisted* format: a user can be
// mid-session with an old shape sitting in their IndexedDB when the shape
// next changes, and only a version tag makes that migratable instead of
// silently corrupt.
export const SESSION_DRAFT_VERSION = 1;

// One row of "last time you did this exercise" (SPEC.md §3 / ticket 010),
// already scoped to a single exercise — see `lastPerformance` below.
export type LastPerformanceSet = {
  setNumber: number;
  weight: number;
  reps: number;
};

// A set the user has actually logged during this session. Empty for every
// exercise at start (SPEC.md §4: "sets[] ... empty at start").
export type PerformedSet = {
  setNumber: number;
  weight: number;
  reps: number;
  isWarmup: boolean;
  rpe: number | null;
  completedAt: string; // ISO 8601
};

// One exercise within the draft: its prescription (baked, not looked up —
// there is nothing to look up offline), its last-performance reference, and
// what's been logged so far.
export type DraftExercise = {
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  position: number;
  targetSets: number;
  repMin: number;
  repMax: number;
  // The EFFECTIVE rest, `rest_seconds ?? default_rest_seconds`, resolved at
  // start time (ticket 011: "offline, there is nothing to fall back to").
  // Never the nullable original.
  restSeconds: number;
  notes: string | null;
  supersetGroup: string | null;
  lastPerformance: LastPerformanceSet[];
  sets: PerformedSet[];
};

export type SessionDraft = {
  version: typeof SESSION_DRAFT_VERSION;
  id: string;
  programId: string;
  workoutId: string;
  startedAt: string; // ISO 8601
  exercises: DraftExercise[];
  // Which exercise the player is currently showing. Persisted like every
  // other field here (ticket 012 acceptance: "Kill the browser tab entirely.
  // Reopen /session. Everything is exactly where you left it ... the current
  // exercise, the lot") — a component-local index would be lost on reload.
  activeExerciseIndex: number;
};

// idb-keyval key the draft lives under (SPEC.md §4 / ticket 011).
export const ACTIVE_DRAFT_KEY = "activeDraft";
