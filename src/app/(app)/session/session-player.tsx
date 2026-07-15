"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { workingSetCount } from "@/lib/session/player";
import { useSessionStore } from "@/lib/session/store";
import type { DraftExercise, LastPerformanceSet, PerformedSet } from "@/lib/session/types";

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
  const draft = useSessionStore((s) => s.draft);
  const status = useSessionStore((s) => s.status);
  const hydrate = useSessionStore((s) => s.hydrate);
  const logSet = useSessionStore((s) => s.logSet);
  const toggleWarmup = useSessionStore((s) => s.toggleWarmup);
  const goToExercise = useSessionStore((s) => s.goToExercise);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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
