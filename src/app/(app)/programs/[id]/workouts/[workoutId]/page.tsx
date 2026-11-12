import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { updateWorkout } from "@/app/(app)/programs/actions";
import { CardioLogForm } from "@/app/(app)/programs/[id]/workouts/[workoutId]/cardio-log-form";
import { AddExercise } from "@/app/(app)/programs/[id]/workouts/[workoutId]/add-exercise";
import { ExerciseList } from "@/app/(app)/programs/[id]/workouts/[workoutId]/exercise-list";
import { StartSessionButton } from "@/app/(app)/programs/[id]/workouts/[workoutId]/start-session-button";
import { listExercises } from "@/lib/exercises/queries";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DAY_OF_WEEK_KEYS,
  WORKOUT_NAME_MAX,
  WORKOUT_NOTES_MAX,
} from "@/lib/validation/workout";
import { listWorkoutExercises } from "@/lib/workouts/queries";
import { availableSupersetGroups } from "@/lib/workouts/superset";

const paramsSchema = z.object({
  id: z.uuid(),
  workoutId: z.uuid(),
});

/**
 * `/programs/[id]/workouts/[workoutId]` — the workout builder: the workout
 * detail page (ticket 007), the exercise picker (ticket 008), and the
 * prescription editor (ticket 009) — sets, rep range, rest override, notes,
 * and superset group per exercise, plus the rename / reschedule form.
 */
export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string; workoutId: string }>;
}) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { id: programId, workoutId } = parsed.data;

  const t = await getTranslations("Programs");
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const [
    { data: program },
    { data: workout },
    { data: profile },
    exercises,
    workoutExercises,
  ] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name")
      .eq("id", programId)
      .maybeSingle(),
    supabase
      .from("workouts")
      .select("id, name, day_of_week, position, program_id, kind, notes")
      .eq("id", workoutId)
      .eq("program_id", programId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("default_rest_seconds")
      .eq("id", user.id)
      .maybeSingle(),
    listExercises(supabase),
    listWorkoutExercises(supabase, workoutId),
  ]);

  if (!program || !workout) notFound();

  // profiles.default_rest_seconds — the value an empty rest override
  // inherits (SPEC.md §2). The row is guaranteed by the handle_new_user
  // trigger and repaired at sign-in; the fallback mirrors the column's own DB
  // default (migration 0001).
  const defaultRestSeconds = profile?.default_rest_seconds ?? 90;
  const supersetGroupOptions = availableSupersetGroups(workoutExercises);
  // ADR-0008: a cardio workout's prescription is its notes; it has no exercises.
  const isCardio = workout.kind === "cardio";

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href={`/programs/${programId}`}>
          <ChevronLeft className="size-4" />
          {program.name}
        </Link>
      </Button>

      <div className="flex flex-col gap-2">
        <h1 className="text-[1.375rem] leading-tight font-semibold">
          {workout.name}
        </h1>
        {workout.day_of_week !== null && (
          <p className="text-sm text-ink-muted">
            {t(DAY_OF_WEEK_KEYS[workout.day_of_week])}
          </p>
        )}
      </div>

      {isCardio ? (
        <section className="flex flex-col gap-3 border-t border-line pt-5">
          <h2 className="text-sm font-medium">{t("prescription")}</h2>
          {workout.notes ? (
            <p className="text-sm whitespace-pre-wrap">{workout.notes}</p>
          ) : (
            <p className="text-sm text-ink-muted">{t("prescriptionEmpty")}</p>
          )}
        </section>
      ) : (
        workout.notes && (
          <p className="text-sm whitespace-pre-wrap text-ink-muted">
            {workout.notes}
          </p>
        )
      )}

      {isCardio && <CardioLogForm workoutId={workoutId} />}

      {!isCardio && workoutExercises.length > 0 && (
        <StartSessionButton workoutId={workoutId} />
      )}

      {!isCardio && (
        <section className="flex flex-col gap-3 border-t border-line pt-5">
          <h2 className="text-sm font-medium">{t("exercises")}</h2>

          {workoutExercises.length > 0 ? (
            <ExerciseList
              items={workoutExercises}
              workoutId={workoutId}
              programId={programId}
              defaultRestSeconds={defaultRestSeconds}
            />
          ) : (
            <p className="text-sm text-ink-muted">
              {t("workoutExercisesEmpty")}
            </p>
          )}

          <AddExercise
            exercises={exercises}
            workoutId={workoutId}
            programId={programId}
            supersetGroupOptions={supersetGroupOptions}
            defaultRestSeconds={defaultRestSeconds}
          />
        </section>
      )}

      <section className="flex flex-col gap-3 border-t border-line pt-5">
        <details className="group flex flex-col gap-3">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm font-medium">
            {t("edit")}
          </summary>
          <form action={updateWorkout} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="id" value={workout.id} />
            <input type="hidden" name="programId" value={programId} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="workout-name" className="text-sm font-medium">
                {t("workoutName")}
              </label>
              <Input
                id="workout-name"
                name="name"
                defaultValue={workout.name}
                required
                maxLength={WORKOUT_NAME_MAX}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="workout-day" className="text-sm font-medium">
                {t("dayOfWeek")}
              </label>
              <select
                id="workout-day"
                name="dayOfWeek"
                defaultValue={workout.day_of_week ?? ""}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t("dayOfWeekNone")}</option>
                {DAY_OF_WEEK_KEYS.map((key, i) => (
                  <option key={key} value={i}>
                    {t(key)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="workout-notes" className="text-sm font-medium">
                {t("workoutNotes")}
              </label>
              <Textarea
                id="workout-notes"
                name="notes"
                defaultValue={workout.notes ?? ""}
                maxLength={WORKOUT_NOTES_MAX}
                rows={isCardio ? 10 : 4}
              />
              {isCardio && (
                <p className="text-xs text-ink-muted">
                  {t("workoutNotesHint")}
                </p>
              )}
            </div>
            <Button type="submit" className="self-start">
              {t("save")}
            </Button>
          </form>
        </details>
      </section>
    </main>
  );
}
