"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { ExercisePicker } from "@/components/exercise-picker";
import { Button } from "@/components/ui/button";
import type { ExerciseOption } from "@/lib/exercises/search";

/**
 * The workout builder's entry point into the exercise picker (ticket 008).
 * Selecting or creating an exercise here does not yet attach it to the
 * workout — that write (a `workout_exercises` row with sets, rep range, rest,
 * notes) is ticket 009. This only proves the picker's own contract: search,
 * filter, create-and-select.
 */
export function AddExercise({ exercises }: { exercises: ExerciseOption[] }) {
  const t = useTranslations("Programs");
  const tPicker = useTranslations("ExercisePicker");
  const [picked, setPicked] = useState<ExerciseOption | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-muted text-sm">
        {picked ? tPicker("pickedNote", { name: picked.name }) : t("workoutExercisesEmpty")}
      </p>
      <ExercisePicker exercises={exercises} onSelect={setPicked}>
        <Button type="button" variant="outline" size="sm" className="self-start">
          {tPicker("trigger")}
        </Button>
      </ExercisePicker>
    </div>
  );
}
