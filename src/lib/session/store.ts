import { get as idbGet, set as idbSet } from "idb-keyval";
import { create } from "zustand";

import { nextExerciseIndexAfterLogging } from "./player";
import { ACTIVE_DRAFT_KEY, SESSION_DRAFT_VERSION, type PerformedSet, type SessionDraft } from "./types";

export type LogSetInput = {
  weight: number;
  reps: number;
  isWarmup: boolean;
  rpe?: number | null;
};

export type SessionStatus = "loading" | "ready" | "empty";

type SessionStore = {
  draft: SessionDraft | null;
  status: SessionStatus;
  /** Reads the draft written by startSession (ticket 011) out of IndexedDB. */
  hydrate: () => Promise<void>;
  /**
   * Logs a set on the given exercise. Every mutation writes through to
   * IndexedDB immediately (ticket 012's hard rule #2) — there is no debounce,
   * no batching, no write-on-unmount. A superset auto-advances to its next
   * peer; a straight exercise stays put so the same set list keeps taking
   * input.
   */
  logSet: (workoutExerciseId: string, input: LogSetInput) => Promise<void>;
  /** Flips a set already logged between warmup and working, in place. */
  toggleWarmup: (workoutExerciseId: string, setNumber: number) => Promise<void>;
  goToExercise: (index: number) => Promise<void>;
};

async function persist(draft: SessionDraft): Promise<void> {
  await idbSet(ACTIVE_DRAFT_KEY, draft);
}

function mapExercise(
  draft: SessionDraft,
  workoutExerciseId: string,
  fn: (sets: PerformedSet[]) => PerformedSet[],
): { draft: SessionDraft; exerciseIndex: number } {
  const exerciseIndex = draft.exercises.findIndex(
    (e) => e.workoutExerciseId === workoutExerciseId,
  );
  if (exerciseIndex === -1) return { draft, exerciseIndex: -1 };

  const exercises = draft.exercises.map((exercise, index) =>
    index === exerciseIndex ? { ...exercise, sets: fn(exercise.sets) } : exercise,
  );
  return { draft: { ...draft, exercises }, exerciseIndex };
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  draft: null,
  status: "loading",

  hydrate: async () => {
    const stored = (await idbGet(ACTIVE_DRAFT_KEY)) as SessionDraft | undefined;
    if (!stored || stored.version !== SESSION_DRAFT_VERSION) {
      set({ draft: null, status: "empty" });
      return;
    }
    // Defensive, symmetric with goToExercise's own bounds check: an
    // out-of-range index (corrupted storage, or a future migration that
    // shrinks `exercises`) must clamp to a valid exercise, not silently make
    // the player treat an in-progress draft as if no session existed.
    const maxIndex = Math.max(stored.exercises.length - 1, 0);
    const activeExerciseIndex = Math.min(Math.max(stored.activeExerciseIndex, 0), maxIndex);
    set({ draft: { ...stored, activeExerciseIndex }, status: "ready" });
  },

  logSet: async (workoutExerciseId, input) => {
    const { draft } = get();
    if (!draft) return;

    const { draft: withNewSet, exerciseIndex } = mapExercise(draft, workoutExerciseId, (sets) => [
      ...sets,
      {
        setNumber: sets.length + 1,
        weight: input.weight,
        reps: input.reps,
        isWarmup: input.isWarmup,
        rpe: input.rpe ?? null,
        completedAt: new Date().toISOString(),
      },
    ]);
    if (exerciseIndex === -1) return;

    const activeExerciseIndex = nextExerciseIndexAfterLogging(withNewSet.exercises, exerciseIndex);
    const nextDraft: SessionDraft = { ...withNewSet, activeExerciseIndex };

    set({ draft: nextDraft });
    await persist(nextDraft);
  },

  toggleWarmup: async (workoutExerciseId, setNumber) => {
    const { draft } = get();
    if (!draft) return;

    const { draft: nextDraft, exerciseIndex } = mapExercise(draft, workoutExerciseId, (sets) =>
      sets.map((s) => (s.setNumber === setNumber ? { ...s, isWarmup: !s.isWarmup } : s)),
    );
    if (exerciseIndex === -1) return;

    set({ draft: nextDraft });
    await persist(nextDraft);
  },

  goToExercise: async (index) => {
    const { draft } = get();
    if (!draft || index < 0 || index >= draft.exercises.length) return;

    const nextDraft: SessionDraft = { ...draft, activeExerciseIndex: index };
    set({ draft: nextDraft });
    await persist(nextDraft);
  },
}));
