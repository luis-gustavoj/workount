"use client";

import { useEffect, useState } from "react";
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
import { buildFinishSummary, finishSession, type FinishSummary } from "@/lib/session/commit";
import { requestRestNotificationPermission } from "@/lib/session/notify";
import { workingSetCount } from "@/lib/session/player";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/lib/session/store";
import type { DraftExercise, LastPerformanceSet, PerformedSet } from "@/lib/session/types";

import { RestTimer } from "./rest-timer";
import { SetRow } from "./set-row";
import { Stepper } from "./stepper";

const WEIGHT_STEP = 2.5;
const REPS_STEP = 1;

type Translate = ReturnType<typeof useTranslations>;

function formatTarget(t: Translate, exercise: DraftExercise): string {
  return exercise.repMin === exercise.repMax
    ? t("targetLabelFixed", { sets: exercise.targetSets, reps: exercise.repMin })
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

function formatLastTime(t: Translate, reference: LastPerformanceSet | null): string | null {
  return reference ? t("lastTime", { weight: reference.weight, reps: reference.reps }) : null;
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
function defaultEntry(exercise: DraftExercise): { weight: number; reps: number } {
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
      <div className="flex items-center justify-around">
        <Stepper label={t("weightLabel")} value={weight} step={WEIGHT_STEP} onChange={setWeight} />
        <Stepper label={t("repsLabel")} value={reps} step={REPS_STEP} onChange={setReps} />
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

// The finish flow's own state machine (ticket 014). `summary`/`completedAt`
// are frozen the instant the user taps Finish — not recomputed on every
// render — so the numbers shown in the confirmation dialog are exactly the
// numbers sent to `commit_session`, and a retry after a failure resends the
// identical payload rather than a slightly-later one.
type FinishState =
  | { phase: "idle" }
  | { phase: "confirming"; summary: FinishSummary; completedAt: Date }
  | { phase: "committing"; summary: FinishSummary; completedAt: Date }
  | { phase: "error"; summary: FinishSummary; completedAt: Date; message: string };

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
              {t("finishDurationValue", { minutes: Math.round(state.summary.durationSeconds / 60) })}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("finishVolume")}</dt>
            <dd className="font-mono text-lg font-medium tabular-nums">
              {t("finishVolumeValue", { volume: Math.round(state.summary.totalVolumeKg) })}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("finishSets")}</dt>
            <dd className="font-mono text-lg font-medium tabular-nums">{state.summary.setsCompleted}</dd>
          </div>
        </dl>

        {state.summary.prExerciseNames.length > 0 && (
          <p className="bg-ok/10 text-ok rounded px-3 py-2 text-sm font-medium">
            {t("finishPrBadge", { names: state.summary.prExerciseNames.join(", ") })}
          </p>
        )}

        {state.phase === "error" && (
          <p role="alert" className="bg-danger/10 text-danger rounded px-3 py-2 text-sm">
            {state.message}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isCommitting} onClick={onCancel}>
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
  const goToExercise = useSessionStore((s) => s.goToExercise);
  const [finishState, setFinishState] = useState<FinishState>({ phase: "idle" });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Asked once per player mount, not per rest cycle — RestTimer itself
  // mounts and unmounts on every set logged (it's only rendered while a
  // rest is active), so requesting there would re-prompt-check on every set.
  useEffect(() => {
    requestRestNotificationPermission();
  }, []);

  function openFinish() {
    if (!draft) return;
    const completedAt = new Date();
    setFinishState({ phase: "confirming", summary: buildFinishSummary(draft, completedAt), completedAt });
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
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (userError || !userId) {
        setFinishState({ phase: "error", summary, completedAt, message: t("finishError") });
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
        setFinishState({ phase: "error", summary, completedAt, message: t("finishError") });
      }
    } catch {
      setFinishState({ phase: "error", summary, completedAt, message: t("finishError") });
    }
  }

  const exercise = draft ? draft.exercises[draft.activeExerciseIndex] : null;

  if (status === "loading") {
    return <p className="text-ink-muted p-6 text-sm">{t("loading")}</p>;
  }

  if (status === "empty" || !draft || !exercise) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-[1.375rem] font-semibold">{t("emptyTitle")}</h1>
        <p className="text-ink-muted text-sm">{t("emptyBody")}</p>
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
  const nextReference = referenceForOrdinal(exercise.lastPerformance, nextOrdinal);
  const ordinals = workingOrdinals(exercise.sets);

  return (
    <div className="flex flex-1 flex-col">
      {/* Finish strip — a slim bar above the fixed three-band layout
          (DESIGN.md), so it never competes with the header's exercise
          name/position for attention. */}
      <div className="border-line flex justify-end border-b px-4 py-2">
        <button
          type="button"
          onClick={openFinish}
          className="text-ink-muted h-11 px-2 text-sm font-medium underline underline-offset-2"
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
      <div className="border-line flex flex-col gap-2 border-b px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label={t("previousExercise")}
            disabled={!canGoPrev}
            onClick={() => void goToExercise(draft.activeExerciseIndex - 1)}
            className="text-ink-muted grid size-11 shrink-0 place-items-center disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
            <span className="text-ink-muted text-[0.6875rem] font-medium tracking-[0.06em] uppercase">
              {t("exerciseProgress", { position, total })}
            </span>
            <h1 className="text-[1.375rem] leading-tight font-semibold">{exercise.exerciseName}</h1>
            <span className="text-ink-muted font-mono text-sm tabular-nums">
              {formatTarget(t, exercise)}
            </span>
          </div>
          <button
            type="button"
            aria-label={t("nextExercise")}
            disabled={!canGoNext}
            onClick={() => void goToExercise(draft.activeExerciseIndex + 1)}
            className="text-ink-muted grid size-11 shrink-0 place-items-center disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {exercise.notes && <p className="text-ink-muted text-center text-sm">{exercise.notes}</p>}

        {canGoNext && (
          <button
            type="button"
            onClick={() => void goToExercise(draft.activeExerciseIndex + 1)}
            className="text-ink-muted self-center text-sm underline underline-offset-2"
          >
            {t("skipExercise")}
          </button>
        )}
      </div>

      {/* Rest timer (ticket 013) — visible from anywhere in the player, so
          it lives outside the scrolling middle band below, alongside the
          static header. Rendered only while a rest is running or in
          overtime; `draft.restEndsAt` is the single flag for both. */}
      {draft.restEndsAt !== null && (
        <RestTimer
          restEndsAt={draft.restEndsAt}
          restStartedAt={draft.restStartedAt ?? draft.restEndsAt}
          restNotifiedAt={draft.restNotifiedAt}
        />
      )}

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
                ordinal === null ? null : formatLastTime(t, referenceForOrdinal(exercise.lastPerformance, ordinal))
              }
              onToggleWarmup={() => void toggleWarmup(exercise.workoutExerciseId, s.setNumber)}
            />
          );
        })}

        <SetRow
          label={
            workingCount >= exercise.targetSets ? t("extraSet") : t("setLabel", { number: nextOrdinal })
          }
          isWarmup={false}
          lastTimeText={formatLastTime(t, nextReference)}
        />
      </div>

      {/* Bottom band — the entry deck. Fixed, thumb-height, above the
          safe-area inset, never scrolls away (DESIGN.md). */}
      <div className="border-line bg-surface border-t px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <EntryDeck
          // Remounts (resetting weight/reps/warmup to fresh defaults) on
          // two distinct signals: `sets.length` for "a new set was just
          // logged" (including a warmup — its own toggle must reset too),
          // and `workingCount` for "the next working ordinal changed even
          // though no new set was added" (toggling warmup on an *earlier*
          // row via its own SetRow control).
          key={`${exercise.workoutExerciseId}-${exercise.sets.length}-${workingCount}`}
          exercise={exercise}
          onLog={(input) => void logSet(exercise.workoutExerciseId, input)}
        />
      </div>
    </div>
  );
}
