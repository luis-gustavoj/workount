"use client";

import { useOptimistic, useTransition } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import { GripVertical, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { deleteWorkout, reorderWorkouts } from "@/app/(app)/programs/actions";
import type { WorkoutSummary } from "@/lib/validation/workout";

function SortableWorkout({
  workout,
  index,
  programId,
  dayLabels,
  deleteLabel,
  deleteConfirmLabel,
  dragLabel,
}: {
  workout: WorkoutSummary;
  index: number;
  programId: string;
  dayLabels: string[];
  deleteLabel: string;
  deleteConfirmLabel: string;
  dragLabel: string;
}) {
  const { ref, isDragging, handleRef } = useSortable({
    id: workout.id,
    index,
  });

  return (
    <div
      ref={ref}
      className={`flex items-center gap-2 rounded-lg border border-line bg-surface-primary p-3 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <button
        ref={handleRef}
        type="button"
        className="touch-none text-ink-muted cursor-grab active:cursor-grabbing"
        aria-label={dragLabel}
      >
        <GripVertical className="size-4" />
      </button>

      <Link
        href={`/programs/${programId}/workouts/${workout.id}`}
        className="flex min-w-0 flex-1 flex-col gap-0.5"
      >
        <span className="text-sm font-medium">{workout.name}</span>
        {workout.day_of_week !== null && (
          <span className="text-ink-muted text-xs">
            {dayLabels[workout.day_of_week]}
          </span>
        )}
      </Link>

      <form
        action={deleteWorkout}
        onSubmit={(e) => {
          if (!confirm(deleteConfirmLabel)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={workout.id} />
        <input type="hidden" name="programId" value={programId} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="text-ink-muted size-8 p-0"
        >
          <Trash2 className="size-4" />
          <span className="sr-only">{deleteLabel}</span>
        </Button>
      </form>
    </div>
  );
}

export function WorkoutList({
  workouts: initialWorkouts,
  programId,
  dayLabels,
  deleteLabel,
  deleteConfirmLabel,
  dragLabel,
}: {
  workouts: WorkoutSummary[];
  programId: string;
  dayLabels: string[];
  deleteLabel: string;
  deleteConfirmLabel: string;
  dragLabel: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [workouts, setOptimisticWorkouts] = useOptimistic(initialWorkouts);

  return (
    <DragDropProvider
      onDragEnd={(event) => {
        const { source } = event.operation;

        const currentPos = isSortable(source) ? source.sortable.index : 0;
        const initialPos = isSortable(source) ? source.sortable.initialIndex : 0;

        if (currentPos === initialPos) return;

        const updatedItems = move(workouts, event) as WorkoutSummary[];
        const newIds = updatedItems.map((w) => w.id);

        startTransition(async () => {
          setOptimisticWorkouts(updatedItems);
          await reorderWorkouts(programId, newIds);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-2">
        {workouts.map((workout, index) => (
          <SortableWorkout
            key={workout.id}
            workout={workout}
            index={index}
            programId={programId}
            dayLabels={dayLabels}
            deleteLabel={deleteLabel}
            deleteConfirmLabel={deleteConfirmLabel}
            dragLabel={dragLabel}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
