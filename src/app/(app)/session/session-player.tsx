"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildFinishSummary,
  finishSession,
  type FinishSummary,
} from "@/lib/session/commit";
import { requestRestNotificationPermission } from "@/lib/session/notify";
import { workingSetCount } from "@/lib/session/player";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/lib/session/store";
import type {
  DraftExercise,
  LastPerformanceSet,
  PerformedSet,
} from "@/lib/session/types";

import { RestSheet } from "./rest-sheet";
import { SetRow } from "./set-row";
import { Stepper } from "./stepper";

const WEIGHT_STEP = 2.5;
const REPS_STEP = 1;

type Translate = ReturnType<typeof useTranslations>;

function formatTarget(t: Translate, exercise: DraftExercise): string {
  return exercise.repMin === exercise.repMax
    ? t("targetLabelFixed", {
        sets: exercise.targetSets,
        reps: exercise.repMin,
      })
    : t("targetLabel", {
        sets: exercise.targetSets,
        repMin: exercise.repMin,
        repMax: exercise.repMax,
      });
}

function referenceForOrdinal(
  lastPerformance: LastPerformanceSet[],
  ordinal: number,
): LastPerformanceSet | null {
  return lastPerformance[ordinal - 1] ?? null;
}

function formatLastTime(
  t: Translate,
  reference: LastPerformanceSet | null,
): string | null {
  return reference
    ? t("lastTimeValue", { weight: reference.weight, reps: reference.reps })
    : null;
}

/**
 * Which working-set ordinal each performed set corresponds to — warmups get
 * `null` (there is nothing to compare a warmup against; the last-performance
 * bundle only ever contains working sets, ticket 010).
 */
function workingOrdinals(sets: PerformedSet[]): (number | null)[] {
  let count = 0;
  return sets.map((s) => {
    if (s.isWarmup) return null;
    count += 1;
    return count;
  });
}

/**
 * Weight/reps/warmup for the *next* set to log, seeded from this ordinal's
 * last-performance reference, falling back to whatever was logged most
 * recently, then a plain empty-bar start.
 */
function defaultEntry(exercise: DraftExercise): {
  weight: number;
  reps: number;
} {
  const nextOrdinal = workingSetCount(exercise) + 1;
  const reference = referenceForOrdinal(exercise.lastPerformance, nextOrdinal);
  const lastLogged = exercise.sets[exercise.sets.length - 1];
  return {
    weight: reference?.weight ?? lastLogged?.weight ?? 20,
    reps: reference?.reps ?? lastLogged?.reps ?? exercise.repMin,
  };
}

/**
 * The bottom band: weight/reps steppers, a warmup toggle, and Log. Remounted
 * (via the `key` the parent gives it — exercise id + sets logged so far)
 * whenever the player moves to a different exercise or a set is logged, so
 * its fields reset to fresh defaults without reaching for an effect that
 * calls setState (see docs/adr — React's own "resetting state with a key"
 * pattern, not a subscription to an external system).
 */
function EntryDeck({
  exercise,
  onLog,
}: {
  exercise: DraftExercise;
  onLog: (input: { weight: number; reps: number; isWarmup: boolean }) => void;
}) {
  const t = useTranslations("Session");
  const initial = defaultEntry(exercise);
  const [weight, setWeight] = useState(initial.weight);
  const [reps, setReps] = useState(initial.reps);
  const [isWarmup, setIsWarmup] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <Stepper
          label={t("weightLabel")}
          value={weight}
          step={WEIGHT_STEP}
          onChange={setWeight}
        />
        <Stepper
          label={t("repsLabel")}
          value={reps}
          step={REPS_STEP}
          onChange={setReps}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={isWarmup}
          onClick={() => setIsWarmup((w) => !w)}
          className={`h-11 shrink-0 rounded px-4 text-sm font-medium ${
            isWarmup ? "bg-raised text-ink" : "text-ink-muted"
          }`}
        >
          {t("warmupToggle")}
        </button>
        <Button
          type="button"
          className="h-14 flex-1 text-base"
          onClick={() => onLog({ weight, reps, isWarmup })}
        >
          {t("logSet")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The bottom dock: weight/reps steppers, a warmup toggle, and Log — the
 * entry deck, and nothing else. The rest sheet used to mount inside this
 * (ticket 023), growing the dock's height and shoving the entry deck and the
 * scrolling set list around every time a rest started or ended; it's now a
 * floating overlay `SessionPlayer` renders as its own sibling (see
 * `RestSheet`), so this dock's height — and its background, always
 * `bg-surface` — never changes because of resting. The safe-area-inset
 * bottom padding lives on this outer wrapper so it's always painted the same
 * color as the content above it, never the page's darker `bg` showing
 * through as a black strip above the home indicator.
 *
 * While a logged set is being edited (`isEditing`), the deck hides itself
 * instead of staying visible underneath: its weight/reps steppers are
 * styled identically to the edit form's own steppers, and the two showing
 * at once — one for "the next set," one for "the set you're correcting" —
 * is what made editing confusing. Only one stepper pair is ever on screen.
 */
function BottomDock({
  exercise,
  workingCount,
  onLog,
  isEditing,
}: {
  exercise: DraftExercise;
  workingCount: number;
  onLog: (input: { weight: number; reps: number; isWarmup: boolean }) => void;
  isEditing: boolean;
}) {
  const t = useTranslations("Session");
  return (
    <div
      className="bg-surface pb-[calc(env(safe-area-inset-bottom)+1rem)] select-none"
      style={{
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="border-t border-line bg-surface px-4 py-4">
        {isEditing ? (
          <p className="flex h-14 items-center justify-center text-center text-sm text-ink-muted">
            {t("editingHint")}
          </p>
        ) : (
          <EntryDeck
            // Remounts (resetting weight/reps/warmup to fresh defaults) on
            // two distinct signals: `sets.length` for "a new set was just
            // logged" (including a warmup — its own toggle must reset too),
            // and `workingCount` for "the next working ordinal changed even
            // though no new set was added" (toggling warmup on an *earlier*
            // row via its own SetRow control).
            key={`${exercise.workoutExerciseId}-${exercise.sets.length}-${workingCount}`}
            exercise={exercise}
            onLog={onLog}
          />
        )}
      </div>
    </div>
  );
}

// The finish flow's own state machine (ticket 014). `summary`/`completedAt`
// are frozen the instant the user taps Finish — not recomputed on every
// render — so the numbers shown in the confirmation dialog are exactly the
// numbers sent to `commit_session`, and a retry after a failure resends the
// identical payload rather than a slightly-later one.
type FinishState =
  | { phase: "idle" }
  | { phase: "confirming"; summary: FinishSummary; completedAt: Date }
  | { phase: "committing"; summary: FinishSummary; completedAt: Date }
  | {
      phase: "error";
      summary: FinishSummary;
      completedAt: Date;
      message: string;
    };

/**
 * The confirmation summary + retry banner (ticket 014, finish flow steps
 * 1-4): shown before anything is sent, so the user can "notice they forgot
 * to log the last set." On a commit failure the draft is untouched (see
 * commit.ts's `finishSession`) and this same dialog turns into the retry
 * banner — same summary, same Retry action, nothing lost.
 */
function FinishDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: Extract<FinishState, { phase: "confirming" | "committing" | "error" }>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("Session");
  const isCommitting = state.phase === "committing";

  return (
    <Dialog open onOpenChange={(open) => !open && !isCommitting && onCancel()}>
      <DialogContent showCloseButton={!isCommitting}>
        <DialogHeader>
          <DialogTitle>{t("finishTitle")}</DialogTitle>
          <DialogDescription>{t("finishBody")}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-ink-muted">{t("finishDuration")}</dt>
            <dd className="font-mono text-lg font-medium tabular-nums">
              {t("finishDurationValue", {
                minutes: Math.round(state.summary.durationSeconds / 60),
              })}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("finishVolume")}</dt>
            <dd className="font-mono text-lg font-medium tabular-nums">
              {t("finishVolumeValue", {
                volume: Math.round(state.summary.totalVolumeKg),
              })}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("finishSets")}</dt>
            <dd className="font-mono text-lg font-medium tabular-nums">
              {state.summary.setsCompleted}
            </dd>
          </div>
        </dl>

        {state.summary.prExerciseNames.length > 0 && (
          <p className="rounded bg-ok/10 px-3 py-2 text-sm font-medium text-ok">
            {t("finishPrBadge", {
              names: state.summary.prExerciseNames.join(", "),
            })}
          </p>
        )}

        {state.phase === "error" && (
          <p
            role="alert"
            className="rounded bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {state.message}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isCommitting}
            onClick={onCancel}
          >
            {t("finishCancel")}
          </Button>
          <Button type="button" disabled={isCommitting} onClick={onConfirm}>
            {isCommitting
              ? t("finishSaving")
              : state.phase === "error"
                ? t("finishRetry")
                : t("finishConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The session player (ticket 012) — driven entirely by the Zustand store
 * (store.ts), which is itself hydrated from the IndexedDB draft written by
 * `startSession` (ticket 011). No network call happens anywhere in this
 * component or its children, per ADR-0001.
 *
 * Fixed three-band layout (DESIGN.md): a static header, a scrolling set
 * list, and a fixed entry deck — nothing reflows under the user's thumb
 * mid-set.
 */
export function SessionPlayer() {
  const t = useTranslations("Session");
  const router = useRouter();
  const draft = useSessionStore((s) => s.draft);
  const status = useSessionStore((s) => s.status);
  const hydrate = useSessionStore((s) => s.hydrate);
  const logSet = useSessionStore((s) => s.logSet);
  const toggleWarmup = useSessionStore((s) => s.toggleWarmup);
  const updateSet = useSessionStore((s) => s.updateSet);
  const deleteSet = useSessionStore((s) => s.deleteSet);
  const goToExercise = useSessionStore((s) => s.goToExercise);
  const [finishState, setFinishState] = useState<FinishState>({
    phase: "idle",
  });
  // Which logged set (by setNumber) is showing its edit surface, one row at
  // a time (ticket 023). Lives here, not in SetRow, so switching exercises
  // or logging/deleting a set can reliably close it — a stale setNumber
  // could otherwise point at the wrong row after a delete renumbers the rest.
  const [editingSetNumber, setEditingSetNumber] = useState<number | null>(null);

  // The bottom dock's rendered height (including its safe-area padding),
  // measured so the floating rest sheet can sit flush above it without
  // either one needing to know the other's layout in advance. Changes with
  // content (e.g. a wrapped warmup row on a narrow phone), not just on
  // mount, hence a ResizeObserver rather than a one-time measurement.
  //
  // A callback ref, not `useRef` + a `[]`-effect: the dock doesn't exist in
  // the DOM yet on the very first render (this component briefly returns
  // its "loading" branch before `draft` resolves), so a plain ref's
  // `.current` is still null when a mount-only effect runs — and since refs
  // aren't reactive, nothing ever re-triggers that effect once the real dock
  // node shows up. A callback ref fires exactly when the node it's attached
  // to is actually created (or torn down), so the observer always ends up
  // attached to the true element.
  const [dockHeight, setDockHeight] = useState(0);
  const dockObserverRef = useRef<ResizeObserver | null>(null);
  const dockRef = useCallback((node: HTMLDivElement | null) => {
    dockObserverRef.current?.disconnect();
    dockObserverRef.current = null;
    if (!node) return;
    // `offsetHeight`, not the observer entry's `contentRect` — the latter is
    // the content-box (padding excluded), which under-measures this element
    // by exactly its safe-area bottom padding and makes the floating rest
    // sheet sit that much too low, overlapping the entry deck's Reps
    // stepper instead of sitting flush above it.
    const observer = new ResizeObserver(() => setDockHeight(node.offsetHeight));
    observer.observe(node);
    dockObserverRef.current = observer;
  }, []);

  function goTo(index: number) {
    setEditingSetNumber(null);
    void goToExercise(index);
  }

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Asked once per player mount, not per rest cycle — the rest sheet's own
  // content mounts and unmounts on every set logged (it's only shown while
  // a rest is active), so requesting there would re-prompt-check on every set.
  useEffect(() => {
    requestRestNotificationPermission();
  }, []);

  function openFinish() {
    if (!draft) return;
    const completedAt = new Date();
    setFinishState({
      phase: "confirming",
      summary: buildFinishSummary(draft, completedAt),
      completedAt,
    });
  }

  async function confirmFinish() {
    if (!draft || finishState.phase === "idle") return;
    const { summary, completedAt } = finishState;
    setFinishState({ phase: "committing", summary, completedAt });

    // Everything below touches the network — `getUser()` included, it hits
    // the auth server and throws (not just `{ error }`) on a plain fetch
    // failure — so it all goes in one try/catch. Offline is exactly the
    // case ticket 014 exists for: any failure here must land on the retry
    // banner, never an unhandled rejection that leaves the dialog stuck on
    // "Saving…" with no way for the user to retry.
    try {
      const supabase = createClient();
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (userError || !userId) {
        setFinishState({
          phase: "error",
          summary,
          completedAt,
          message: t("finishError"),
        });
        return;
      }

      // finishSession only clears the draft after commit_session confirms
      // the write (commit.ts's "rule that must not be broken") — on
      // failure the draft is untouched, so this same dialog turns into a
      // retry banner.
      const result = await finishSession(supabase, draft, userId, completedAt);
      if (result.ok) {
        router.push(`/history/${result.sessionId}`);
      } else {
        setFinishState({
          phase: "error",
          summary,
          completedAt,
          message: t("finishError"),
        });
      }
    } catch {
      setFinishState({
        phase: "error",
        summary,
        completedAt,
        message: t("finishError"),
      });
    }
  }

  const exercise = draft ? draft.exercises[draft.activeExerciseIndex] : null;

  if (status === "loading") {
    return <p className="p-6 text-sm text-ink-muted">{t("loading")}</p>;
  }

  if (status === "empty" || !draft || !exercise) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-[1.375rem] font-semibold">{t("emptyTitle")}</h1>
        <p className="text-sm text-ink-muted">{t("emptyBody")}</p>
        <Button asChild size="sm">
          <Link href="/programs">{t("backToWorkouts")}</Link>
        </Button>
      </div>
    );
  }

  const total = draft.exercises.length;
  const position = draft.activeExerciseIndex + 1;
  const canGoPrev = draft.activeExerciseIndex > 0;
  const canGoNext = draft.activeExerciseIndex < total - 1;

  const workingCount = workingSetCount(exercise);
  const nextOrdinal = workingCount + 1;
  const nextReference = referenceForOrdinal(
    exercise.lastPerformance,
    nextOrdinal,
  );
  const ordinals = workingOrdinals(exercise.sets);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Finish strip — a slim bar above the fixed three-band layout
          (DESIGN.md), so it never competes with the header's exercise
          name/position for attention. */}
      <div className="flex justify-end border-b border-line px-4 py-2">
        <button
          type="button"
          onClick={openFinish}
          className="h-11 px-2 text-sm font-medium text-ink-muted underline underline-offset-2"
        >
          {t("finish")}
        </button>
      </div>

      {finishState.phase !== "idle" && (
        <FinishDialog
          state={finishState}
          onCancel={() => setFinishState({ phase: "idle" })}
          onConfirm={() => void confirmFinish()}
        />
      )}

      {/* Top band — static: name, position, prescription, notes. */}
      <div className="flex flex-col gap-2 border-b border-line px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label={t("previousExercise")}
            disabled={!canGoPrev}
            onClick={() => goTo(draft.activeExerciseIndex - 1)}
            className="grid size-11 shrink-0 place-items-center text-ink-muted disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
            <span className="text-[0.6875rem] font-medium tracking-[0.06em] text-ink-muted uppercase">
              {t("exerciseProgress", { position, total })}
            </span>
            <h1 className="text-[1.375rem] leading-tight font-semibold">
              {exercise.exerciseName}
            </h1>
            <span className="font-mono text-sm text-ink-muted tabular-nums">
              {formatTarget(t, exercise)}
            </span>
          </div>
          <button
            type="button"
            aria-label={t("nextExercise")}
            disabled={!canGoNext}
            onClick={() => goTo(draft.activeExerciseIndex + 1)}
            className="grid size-11 shrink-0 place-items-center text-ink-muted disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {exercise.notes && (
          <p className="text-center text-sm text-ink-muted">{exercise.notes}</p>
        )}

        {canGoNext && (
          <button
            type="button"
            onClick={() => goTo(draft.activeExerciseIndex + 1)}
            className="self-center text-sm text-ink-muted underline underline-offset-2"
          >
            {t("skipExercise")}
          </button>
        )}
      </div>

      {/* Middle band — the only scrolling region. */}
      <div className="flex-1 overflow-y-auto px-4">
        {exercise.sets.map((s, index) => {
          const ordinal = ordinals[index];
          return (
            <SetRow
              key={s.setNumber}
              // Labeled by working-set ordinal, the same numbering scheme
              // the upcoming placeholder below uses — never the raw,
              // warmups-included `setNumber` (store.ts). Otherwise a
              // placeholder that promises "Set 1" can render as "Set 2" the
              // moment it's logged, if a warmup preceded it: warmups never
              // count (CLAUDE.md), so they don't get a competing number.
              label={ordinal === null ? "" : t("setLabel", { number: ordinal })}
              isWarmup={s.isWarmup}
              performed={{ weight: s.weight, reps: s.reps }}
              lastTimeText={
                ordinal === null
                  ? null
                  : formatLastTime(
                      t,
                      referenceForOrdinal(exercise.lastPerformance, ordinal),
                    )
              }
              onToggleWarmup={() =>
                void toggleWarmup(exercise.workoutExerciseId, s.setNumber)
              }
              edit={{
                setNumber: s.setNumber,
                isEditing: editingSetNumber === s.setNumber,
                onStart: () => setEditingSetNumber(s.setNumber),
                onSave: (input) => {
                  setEditingSetNumber(null);
                  void updateSet(
                    exercise.workoutExerciseId,
                    s.setNumber,
                    input,
                  );
                },
                onCancel: () => setEditingSetNumber(null),
                onDelete: () => {
                  setEditingSetNumber(null);
                  void deleteSet(exercise.workoutExerciseId, s.setNumber);
                },
              }}
            />
          );
        })}

        <SetRow
          label={
            workingCount >= exercise.targetSets
              ? t("extraSet")
              : t("setLabel", { number: nextOrdinal })
          }
          isWarmup={false}
          lastTimeText={formatLastTime(t, nextReference)}
        />
      </div>

      <div ref={dockRef}>
        <BottomDock
          exercise={exercise}
          workingCount={workingCount}
          onLog={(input) => void logSet(exercise.workoutExerciseId, input)}
          isEditing={editingSetNumber !== null}
        />
      </div>
      <RestSheet
        restEndsAt={draft.restEndsAt}
        restStartedAt={draft.restStartedAt ?? draft.restEndsAt}
        restNotifiedAt={draft.restNotifiedAt}
        bottomOffset={dockHeight}
      />
    </div>
  );
}
