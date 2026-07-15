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
  // The rest timer (ticket 013, CONTEXT.md), as timestamps (epoch ms) —
  // never a decrementing counter, which drifts or freezes exactly when the
  // phone locks. All three are `null` together when no rest is running.
  // Fields at the draft level, not per-exercise: only one rest timer runs at
  // a time, and it must stay visible regardless of which exercise the player
  // is currently showing (and, for a superset, that exercise can differ from
  // the one the rest actually started for). Past `restEndsAt`, the timer
  // keeps counting up as overtime rather than clamping to zero, until the
  // user ends it or logs the next set.
  restEndsAt: number | null;
  // When the current rest started — fixed for the life of one rest cycle,
  // unlike `restEndsAt` (±15s moves it). Two things need this fixed point:
  // the ring's total duration (`restEndsAt - restStartedAt`, exact and
  // reload-safe, instead of re-reading whatever exercise happens to be on
  // screen — that reading can be a superset peer with a different rest), and
  // the "already notified" check below (keyed on this so a ±15s tap during
  // overtime — which only moves `restEndsAt` — can't look like a fresh rest
  // and re-fire the alert).
  restStartedAt: number | null;
  // The `restStartedAt` value the zero-crossing vibrate/notification has
  // already fired for, or `null` if it hasn't yet this rest. Persisted
  // (rather than component-local state) so reopening the app while already
  // in overtime doesn't re-fire the alert — ticket 013's "kill the browser
  // mid-rest and reopen" acceptance applies here too.
  restNotifiedAt: number | null;
};

// idb-keyval key the draft lives under (SPEC.md §4 / ticket 011).
export const ACTIVE_DRAFT_KEY = "activeDraft";
