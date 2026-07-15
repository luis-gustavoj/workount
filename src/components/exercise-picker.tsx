"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { createCustomExercise } from "@/lib/exercises/actions";
import { findNearDuplicates, matchesQuery, type ExerciseOption } from "@/lib/exercises/search";
import { EQUIPMENT, EXERCISE_NAME_MAX, MUSCLE_GROUPS } from "@/lib/validation/exercise";

// "all" rather than "" because a Radix Select item cannot have an empty
// string value.
const ALL_MUSCLE_GROUPS = "all";

/**
 * Searchable picker over the exercise catalog, with an inline escape hatch to
 * create a custom exercise (ticket 008). Global exercises and the caller's own
 * customs are supplied together in `exercises` — RLS already scoped that list
 * server-side, so this component just filters and displays it.
 *
 * `exercises` seeds local state so a newly created custom is reflected (and
 * immediately selectable) without waiting on a server round trip back to the
 * parent.
 */
export function ExercisePicker({
  exercises,
  onSelect,
  children,
}: {
  exercises: ExerciseOption[];
  onSelect: (exercise: ExerciseOption) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("ExercisePicker");
  const tMuscleGroup = useTranslations("muscle_group");
  const tEquipment = useTranslations("equipment");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [muscleGroupFilter, setMuscleGroupFilter] = useState(ALL_MUSCLE_GROUPS);
  const [localExercises, setLocalExercises] = useState(exercises);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createMuscleGroup, setCreateMuscleGroup] = useState("");
  const [createEquipment, setCreateEquipment] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      localExercises
        .filter(
          (exercise) =>
            muscleGroupFilter === ALL_MUSCLE_GROUPS ||
            exercise.muscleGroup === muscleGroupFilter,
        )
        .filter((exercise) => matchesQuery(exercise.name, query))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [localExercises, muscleGroupFilter, query],
  );

  // Live "did you mean" nudge (ticket: "if the typed name is close to an
  // existing exercise, say so ... before letting them create a
  // near-duplicate") — recomputed on every keystroke in the create form.
  const nearDuplicates = useMemo(
    () => (showCreateForm ? findNearDuplicates(createName, localExercises) : []),
    [showCreateForm, createName, localExercises],
  );

  function resetState() {
    setQuery("");
    setMuscleGroupFilter(ALL_MUSCLE_GROUPS);
    setShowCreateForm(false);
    setCreateName("");
    setCreateMuscleGroup("");
    setCreateEquipment("");
    setCreateError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetState();
  }

  function handleSelect(exercise: ExerciseOption) {
    onSelect(exercise);
    handleOpenChange(false);
  }

  function openCreateForm() {
    setCreateName(query.trim());
    setCreateError(null);
    setShowCreateForm(true);
  }

  function handleCreate() {
    setCreateError(null);
    startTransition(async () => {
      const result = await createCustomExercise({
        name: createName,
        muscleGroup: createMuscleGroup,
        equipment: createEquipment,
      });
      if (!result.ok) {
        setCreateError(t("duplicateError"));
        return;
      }
      setLocalExercises((prev) => [...prev, result.exercise]);
      handleSelect(result.exercise);
    });
  }

  const canSubmitCreate =
    createName.trim().length > 0 && createMuscleGroup !== "" && createEquipment !== "";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom" className="flex max-h-[85vh] flex-col">
        <SheetHeader>
          <SheetTitle>{showCreateForm ? t("createTitle") : t("title")}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {showCreateForm ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="custom-exercise-name" className="text-sm font-medium">
                  {t("nameLabel")}
                </label>
                <Input
                  id="custom-exercise-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  maxLength={EXERCISE_NAME_MAX}
                  autoFocus
                />
              </div>

              {nearDuplicates.length > 0 && (
                <div className="border-line bg-raised flex flex-col gap-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">{t("didYouMean")}</p>
                  <div className="flex flex-col gap-1">
                    {nearDuplicates.map((duplicate) => (
                      <Button
                        key={duplicate.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="justify-start"
                        onClick={() => handleSelect(duplicate)}
                      >
                        {duplicate.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="custom-exercise-muscle-group" className="text-sm font-medium">
                  {t("muscleGroupLabel")}
                </label>
                <Select value={createMuscleGroup} onValueChange={setCreateMuscleGroup}>
                  <SelectTrigger id="custom-exercise-muscle-group" className="w-full">
                    <SelectValue placeholder={t("muscleGroupPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {MUSCLE_GROUPS.map((muscleGroup) => (
                      <SelectItem key={muscleGroup} value={muscleGroup}>
                        {tMuscleGroup(muscleGroup)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="custom-exercise-equipment" className="text-sm font-medium">
                  {t("equipmentLabel")}
                </label>
                <Select value={createEquipment} onValueChange={setCreateEquipment}>
                  <SelectTrigger id="custom-exercise-equipment" className="w-full">
                    <SelectValue placeholder={t("equipmentPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT.map((equipment) => (
                      <SelectItem key={equipment} value={equipment}>
                        {tEquipment(equipment)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {createError && (
                <p role="alert" className="text-destructive text-sm">
                  {createError}
                </p>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowCreateForm(false)}>
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={!canSubmitCreate || isPending}
                  onClick={handleCreate}
                >
                  {nearDuplicates.length > 0 ? t("createAnyway") : t("create")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Search className="text-ink-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="pl-8"
                    autoFocus
                  />
                </div>

                <label htmlFor="exercise-muscle-group-filter" className="sr-only">
                  {t("muscleGroupLabel")}
                </label>
                <Select value={muscleGroupFilter} onValueChange={setMuscleGroupFilter}>
                  <SelectTrigger id="exercise-muscle-group-filter" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_MUSCLE_GROUPS}>{t("allMuscleGroups")}</SelectItem>
                    {MUSCLE_GROUPS.map((muscleGroup) => (
                      <SelectItem key={muscleGroup} value={muscleGroup}>
                        {tMuscleGroup(muscleGroup)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                {filtered.length === 0 ? (
                  <p className="text-ink-muted py-4 text-center text-sm">{t("noResults")}</p>
                ) : (
                  filtered.map((exercise) => (
                    <button
                      key={exercise.id}
                      type="button"
                      onClick={() => handleSelect(exercise)}
                      className="border-line bg-surface flex items-center justify-between gap-2 rounded-lg border p-3 text-left"
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {exercise.name}
                          {exercise.isCustom && (
                            <Badge variant="secondary">{t("custom")}</Badge>
                          )}
                        </span>
                        <span className="text-ink-muted text-xs">
                          {tEquipment(exercise.equipment)} · {tMuscleGroup(exercise.muscleGroup)}
                        </span>
                      </span>
                    </button>
                  ))
                )}

                {query.trim().length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-start"
                    onClick={openCreateForm}
                  >
                    {t("createPrompt", { query: query.trim() })}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
