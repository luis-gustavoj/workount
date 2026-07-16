import { get as idbGet, set as idbSet } from "idb-keyval";
import { create } from "zustand";

import { nextExerciseIndexAfterLogging } from "./player";
import { restEndsAtFor } from "./rest";
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
  /**
   * Corrects a mis-entered weight/reps on an already-logged set (ticket 023).
   * Does not touch `completedAt` — this is a correction, not a re-performance.
   */
  updateSet: (
    workoutExerciseId: string,
    setNumber: number,
    patch: { weight?: number; reps?: number },
  ) => Promise<void>;
  /**
   * Undoes a mistaken log (ticket 023). Renumbers the remainder to 1..N —
   * required because `logSet` mints the next `setNumber` as `sets.length + 1`,
   * so a gap left by deleting a middle set would collide with the next log.
   * Also clears an active rest if the deleted set was the last one, since a
   * rest auto-started by a set that no longer exists shouldn't keep counting.
   */
  deleteSet: (workoutExerciseId: string, setNumber: number) => Promise<void>;
  goToExercise: (index: number) => Promise<void>;
  /** ±15s buttons (ticket 013). No-op while no rest timer is running. */
  adjustRest: (deltaMs: number) => Promise<void>;
  /** Ends rest early or dismisses overtime — explicit "done resting". */
  endRest: () => Promise<void>;
  /** Records that the zero-crossing vibrate/notification has fired for the current rest, so a reload mid-overtime doesn't re-fire it. */
  markRestNotified: () => Promise<void>;
};

async function persist(draft: SessionDraft): Promise<void> {
  await idbSet(ACTIVE_DRAFT_KEY, draft);
}

/**
 * Every action here does the same two things in the same order — update the
 * in-memory draft, then write it through to IndexedDB — so it's centralized
 * once rather than repeated per action (5 call sites before this existed).
 */
async function commit(set: (partial: Partial<SessionStore>) => void, nextDraft: SessionDraft): Promise<void> {
  set({ draft: nextDraft });
  await persist(nextDraft);
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
    // The rest-timer fields (ticket 013) postdate some already-persisted
    // drafts — a draft written before they existed has them `undefined`,
    // not `null`; normalize so the rest of the app only ever sees the
    // documented states.
    const restEndsAt = stored.restEndsAt ?? null;
    const restStartedAt = stored.restStartedAt ?? null;
    const restNotifiedAt = stored.restNotifiedAt ?? null;
    set({
      draft: { ...stored, activeExerciseIndex, restEndsAt, restStartedAt, restNotifiedAt },
      status: "ready",
    });
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
    // Auto-starts the rest timer (ticket 013), from the exercise the set was
    // just logged on — not whichever exercise the player advances to next,
    // since a superset's peer can have a different restSeconds. Restarts it
    // even if a previous rest was still counting (or in overtime): logging a
    // set always means "rest starts now." `restStartedAt` is the fixed
    // anchor a ±15s adjustment won't move; `restNotifiedAt` resets so the
    // new rest's zero-crossing can fire its own alert.
    const now = Date.now();
    const restEndsAt = restEndsAtFor(withNewSet.exercises[exerciseIndex].restSeconds, now);
    const nextDraft: SessionDraft = {
      ...withNewSet,
      activeExerciseIndex,
      restEndsAt,
      restStartedAt: now,
      restNotifiedAt: null,
    };

    await commit(set, nextDraft);
  },

  toggleWarmup: async (workoutExerciseId, setNumber) => {
    const { draft } = get();
    if (!draft) return;

    const { draft: nextDraft, exerciseIndex } = mapExercise(draft, workoutExerciseId, (sets) =>
      sets.map((s) => (s.setNumber === setNumber ? { ...s, isWarmup: !s.isWarmup } : s)),
    );
    if (exerciseIndex === -1) return;

    await commit(set, nextDraft);
  },

  updateSet: async (workoutExerciseId, setNumber, patch) => {
    const { draft } = get();
    if (!draft) return;

    const { draft: nextDraft, exerciseIndex } = mapExercise(draft, workoutExerciseId, (sets) =>
      sets.map((s) => (s.setNumber === setNumber ? { ...s, ...patch } : s)),
    );
    if (exerciseIndex === -1) return;

    await commit(set, nextDraft);
  },

  deleteSet: async (workoutExerciseId, setNumber) => {
    const { draft } = get();
    if (!draft) return;

    const { draft: nextDraft, exerciseIndex } = mapExercise(draft, workoutExerciseId, (currentSets) =>
      currentSets
        .filter((s) => s.setNumber !== setNumber)
        .map((s, index) => ({ ...s, setNumber: index + 1 })),
    );
    if (exerciseIndex === -1) return;

    // `exerciseIndex` is positional and unchanged by the map above, so it's
    // safe to read the pre-mutation sets off the original draft here.
    const sets = draft.exercises[exerciseIndex].sets;
    const wasLast = sets.length > 0 && sets[sets.length - 1].setNumber === setNumber;

    const finalDraft: SessionDraft =
      wasLast && draft.restEndsAt !== null
        ? { ...nextDraft, restEndsAt: null, restStartedAt: null, restNotifiedAt: null }
        : nextDraft;

    await commit(set, finalDraft);
  },

  goToExercise: async (index) => {
    const { draft } = get();
    if (!draft || index < 0 || index >= draft.exercises.length) return;

    await commit(set, { ...draft, activeExerciseIndex: index });
  },

  adjustRest: async (deltaMs) => {
    const { draft } = get();
    if (!draft || draft.restEndsAt === null) return;

    // Only restEndsAt moves — restStartedAt stays put, so the ring's total
    // duration grows/shrinks with the adjustment (it's just restEndsAt -
    // restStartedAt) and the "already notified" check keyed on
    // restStartedAt still holds: nudging rest while already in overtime
    // must not look like a fresh rest and re-fire the alert.
    await commit(set, { ...draft, restEndsAt: draft.restEndsAt + deltaMs });
  },

  endRest: async () => {
    const { draft } = get();
    if (!draft) return;

    await commit(set, { ...draft, restEndsAt: null, restStartedAt: null, restNotifiedAt: null });
  },

  markRestNotified: async () => {
    const { draft } = get();
    if (!draft || draft.restStartedAt === null) return;

    await commit(set, { ...draft, restNotifiedAt: draft.restStartedAt });
  },
}));
