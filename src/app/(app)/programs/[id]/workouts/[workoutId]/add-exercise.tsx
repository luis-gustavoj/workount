"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { createWorkoutExercise } from "@/app/(app)/programs/actions";
import { PrescriptionForm } from "@/app/(app)/programs/[id]/workouts/[workoutId]/prescription-form";
import { ExercisePicker } from "@/components/exercise-picker";
import { Button } from "@/components/ui/button";
import type { ExerciseOption } from "@/lib/exercises/search";

/**
 * The workout builder's entry point into the exercise picker (ticket 008)
 * and the prescription editor (ticket 009). Picking or creating an exercise
 * opens an inline "prescribe it" form — sets, rep range, rest, notes,
 * superset group — right there, before it's attached to the workout as a
 * `workout_exercises` row; cancelling returns to the plain trigger button
 * with nothing written.
 */
export function AddExercise({
  exercises,
  workoutId,
  programId,
  supersetGroupOptions,
  defaultRestSeconds,
}: {
  exercises: ExerciseOption[];
  workoutId: string;
  programId: string;
  supersetGroupOptions: string[];
  defaultRestSeconds: number;
}) {
  const tPicker = useTranslations("ExercisePicker");
  const tPrescription = useTranslations("PrescriptionEditor");
  const [picked, setPicked] = useState<ExerciseOption | null>(null);

  if (picked) {
    return (
      <div className="border-line bg-surface flex flex-col gap-3 rounded-lg border p-3">
        <span className="text-sm font-medium">{picked.name}</span>
        <PrescriptionForm
          idPrefix={`add-${picked.id}`}
          supersetGroupOptions={supersetGroupOptions}
          defaultRestSeconds={defaultRestSeconds}
          submitLabel={tPrescription("addToWorkout")}
          onCancel={() => setPicked(null)}
          onSuccess={() => setPicked(null)}
          onSubmit={(values) =>
            createWorkoutExercise({
              workoutId,
              programId,
              exerciseId: picked.id,
              ...values,
            })
          }
        />
      </div>
    );
  }

  return (
    <ExercisePicker exercises={exercises} onSelect={setPicked}>
      <Button type="button" variant="outline" size="sm" className="self-start">
        {tPicker("trigger")}
      </Button>
    </ExercisePicker>
  );
}
