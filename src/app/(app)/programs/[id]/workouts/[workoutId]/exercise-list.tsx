"use client";

import { useMemo, useOptimistic, useTransition } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import { GripVertical, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  deleteWorkoutExercise,
  reorderWorkoutExercises,
  updateWorkoutExercise,
} from "@/app/(app)/programs/actions";
import { PrescriptionForm } from "@/app/(app)/programs/[id]/workouts/[workoutId]/prescription-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  availableSupersetGroups,
  lonelySupersetGroups,
  supersetAccentIndexes,
} from "@/lib/workouts/superset";
import type { WorkoutExercisePrescription } from "@/lib/workouts/queries";

// DESIGN.md reserves colour (the `signal`) for live state only, so telling
// two concurrent superset groups apart can't reach for a per-group hue —
// this cycles the left-edge accent through the achromatic ramp's two "extra"
// shades instead (see supersetAccentIndexes). `warn` overrides both when the
// group is lonely, regardless of which shade it would otherwise get.
const SUPERSET_ACCENT_CLASSES = ["border-l-ink-muted", "border-l-ink-faint"];

/**
 * One exercise's prescription row: drag handle, name, superset badge, the
 * always-visible edit fields (ticket 009 — the prescription IS the point of
 * this page, so it isn't hidden behind a disclosure), and remove.
 *
 * The superset grouping accent is a left-edge border, not the reserved
 * `signal` colour, matching the ticket's "bracket or shared accent down the
 * left edge" requirement.
 */
function SortableExercise({
  item,
  index,
  workoutId,
  programId,
  supersetGroupOptions,
  defaultRestSeconds,
  isLonelyGroup,
  accentIndex,
}: {
  item: WorkoutExercisePrescription;
  index: number;
  workoutId: string;
  programId: string;
  supersetGroupOptions: string[];
  defaultRestSeconds: number;
  isLonelyGroup: boolean;
  accentIndex: number;
}) {
  const t = useTranslations("PrescriptionEditor");
  const tMuscleGroup = useTranslations("muscle_group");
  const tEquipment = useTranslations("equipment");
  const { ref, isDragging, handleRef } = useSortable({ id: item.id, index });

  const { supersetGroup } = item;
  const accentClass = isLonelyGroup
    ? "border-l-warn"
    : (SUPERSET_ACCENT_CLASSES[accentIndex] ?? SUPERSET_ACCENT_CLASSES[0]);

  return (
    <div
      ref={ref}
      className={`border-line bg-surface flex flex-col gap-3 rounded-lg border p-3 ${
        isDragging ? "opacity-50" : ""
      } ${supersetGroup !== null ? `border-l-2 ${accentClass}` : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          ref={handleRef}
          type="button"
          className="touch-none text-ink-muted cursor-grab active:cursor-grabbing"
          aria-label={t("dragToReorder")}
        >
          <GripVertical className="size-4" />
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{item.exerciseName}</span>
            {supersetGroup !== null && (
              <Badge variant="secondary">
                {t("supersetGroupOption", { group: supersetGroup })}
              </Badge>
            )}
          </div>
          <span className="text-ink-muted text-xs">
            {tEquipment(item.equipment)} · {tMuscleGroup(item.muscleGroup)}
          </span>
        </div>

        <form
          action={deleteWorkoutExercise}
          onSubmit={(e) => {
            if (!confirm(t("removeConfirm"))) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="workoutId" value={workoutId} />
          <input type="hidden" name="programId" value={programId} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-ink-muted size-8 p-0"
          >
            <Trash2 className="size-4" />
            <span className="sr-only">{t("remove")}</span>
          </Button>
        </form>
      </div>

      {supersetGroup !== null && isLonelyGroup && (
        <p className="text-warn text-xs">
          {t("supersetLonelyWarning", { group: supersetGroup })}
        </p>
      )}

      <PrescriptionForm
        idPrefix={`edit-${item.id}`}
        initialValues={item}
        supersetGroupOptions={supersetGroupOptions}
        defaultRestSeconds={defaultRestSeconds}
        submitLabel={t("save")}
        onSubmit={(values) =>
          updateWorkoutExercise({ id: item.id, workoutId, programId, ...values })
        }
      />
    </div>
  );
}

export function ExerciseList({
  items: initialItems,
  workoutId,
  programId,
  defaultRestSeconds,
}: {
  items: WorkoutExercisePrescription[];
  workoutId: string;
  programId: string;
  defaultRestSeconds: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, setOptimisticItems] = useOptimistic(initialItems);

  const lonelyGroups = useMemo(() => lonelySupersetGroups(items), [items]);
  const supersetGroupOptions = useMemo(() => availableSupersetGroups(items), [items]);
  const accentIndexes = useMemo(() => supersetAccentIndexes(items), [items]);

  return (
    <DragDropProvider
      onDragEnd={(event) => {
        const { source } = event.operation;

        const currentPos = isSortable(source) ? source.sortable.index : 0;
        const initialPos = isSortable(source) ? source.sortable.initialIndex : 0;

        if (currentPos === initialPos) return;

        const updatedItems = move(items, event) as WorkoutExercisePrescription[];
        const newIds = updatedItems.map((item) => item.id);

        startTransition(async () => {
          setOptimisticItems(updatedItems);
          await reorderWorkoutExercises(workoutId, programId, newIds);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <SortableExercise
            key={item.id}
            item={item}
            index={index}
            workoutId={workoutId}
            programId={programId}
            supersetGroupOptions={supersetGroupOptions}
            defaultRestSeconds={defaultRestSeconds}
            isLonelyGroup={item.supersetGroup !== null && lonelyGroups.has(item.supersetGroup)}
            accentIndex={item.supersetGroup !== null ? (accentIndexes.get(item.supersetGroup) ?? 0) : 0}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
