"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import type { PrescriptionActionResult } from "@/app/(app)/programs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_REP_MAX,
  DEFAULT_REP_MIN,
  DEFAULT_TARGET_SETS,
  NOTES_MAX,
  REP_MIN_MIN,
  REST_SECONDS_MAX,
  REST_SECONDS_MIN,
  TARGET_SETS_MAX,
  TARGET_SETS_MIN,
} from "@/lib/validation/workout-exercise";

// Sentinel for the "no superset" <select> option — mirrors ALL_MUSCLE_GROUPS
// in exercise-picker.tsx: a native <select> option cannot carry a null value.
const NO_SUPERSET_GROUP = "none";

export type PrescriptionValues = {
  targetSets: number;
  repMin: number;
  repMax: number;
  restSeconds: number | null;
  notes: string | null;
  supersetGroup: string | null;
};

/**
 * The sets / rep range / rest / notes / superset fields shared by the "add
 * exercise" flow (create) and each row of the exercise list (edit) — ticket
 * 009. One component so the two forms can't drift, same reasoning as
 * ProgramFields.
 *
 * Called directly (not bound to a `<form action>`) so a rep-range mistake
 * comes back as a typed, translated error instead of an uncaught throw, and
 * so the caller can react to success (reset the picker, in the create case).
 * `idPrefix` keeps input ids unique across the many instances of this
 * component that render on one page at once.
 */
export function PrescriptionForm({
  idPrefix,
  initialValues,
  supersetGroupOptions,
  defaultRestSeconds,
  submitLabel,
  onSubmit,
  onSuccess,
  onCancel,
}: {
  idPrefix: string;
  initialValues?: Partial<PrescriptionValues>;
  supersetGroupOptions: string[];
  defaultRestSeconds: number;
  submitLabel: string;
  onSubmit: (values: PrescriptionValues) => Promise<PrescriptionActionResult>;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("PrescriptionEditor");

  const [targetSets, setTargetSets] = useState(initialValues?.targetSets ?? DEFAULT_TARGET_SETS);
  const [repMin, setRepMin] = useState(initialValues?.repMin ?? DEFAULT_REP_MIN);
  const [repMax, setRepMax] = useState(initialValues?.repMax ?? DEFAULT_REP_MAX);
  const [restSeconds, setRestSeconds] = useState(
    initialValues?.restSeconds != null ? String(initialValues.restSeconds) : "",
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [supersetGroup, setSupersetGroup] = useState(
    initialValues?.supersetGroup ?? NO_SUPERSET_GROUP,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const repRangeValid = repMax >= repMin;
  const canSubmit = repRangeValid && !isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    startTransition(async () => {
      const result = await onSubmit({
        targetSets,
        repMin,
        repMax,
        restSeconds: restSeconds.trim() === "" ? null : Number(restSeconds),
        notes: notes.trim() === "" ? null : notes.trim(),
        supersetGroup: supersetGroup === NO_SUPERSET_GROUP ? null : supersetGroup,
      });
      if (!result.ok) {
        setError(result.error === "not_found" ? t("notFoundError") : t("invalidError"));
        return;
      }
      onSuccess?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex w-20 flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-target-sets`} className="text-sm font-medium">
            {t("targetSetsLabel")}
          </label>
          <Input
            id={`${idPrefix}-target-sets`}
            type="number"
            inputMode="numeric"
            min={TARGET_SETS_MIN}
            max={TARGET_SETS_MAX}
            required
            value={targetSets}
            onChange={(e) => setTargetSets(Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("repRangeLabel")}</span>
          <div className="flex items-center gap-1.5">
            <label htmlFor={`${idPrefix}-rep-min`} className="sr-only">
              {t("repMinLabel")}
            </label>
            <Input
              id={`${idPrefix}-rep-min`}
              type="number"
              inputMode="numeric"
              min={REP_MIN_MIN}
              required
              className="w-16"
              value={repMin}
              aria-invalid={!repRangeValid}
              onChange={(e) => setRepMin(Number(e.target.value))}
            />
            <span aria-hidden="true" className="text-ink-muted">
              –
            </span>
            <label htmlFor={`${idPrefix}-rep-max`} className="sr-only">
              {t("repMaxLabel")}
            </label>
            <Input
              id={`${idPrefix}-rep-max`}
              type="number"
              inputMode="numeric"
              min={REP_MIN_MIN}
              required
              className="w-16"
              value={repMax}
              aria-invalid={!repRangeValid}
              onChange={(e) => setRepMax(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex w-32 flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-rest-seconds`} className="text-sm font-medium">
            {t("restSecondsLabel")}
          </label>
          <Input
            id={`${idPrefix}-rest-seconds`}
            type="number"
            inputMode="numeric"
            min={REST_SECONDS_MIN}
            max={REST_SECONDS_MAX}
            placeholder={String(defaultRestSeconds)}
            value={restSeconds}
            onChange={(e) => setRestSeconds(e.target.value)}
          />
          <span className="text-ink-muted text-xs">
            {t("restSecondsInherited", { seconds: defaultRestSeconds })}
          </span>
        </div>

        <div className="flex w-32 flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-superset-group`} className="text-sm font-medium">
            {t("supersetGroupLabel")}
          </label>
          <select
            id={`${idPrefix}-superset-group`}
            value={supersetGroup}
            onChange={(e) => setSupersetGroup(e.target.value)}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option value={NO_SUPERSET_GROUP}>{t("supersetGroupNone")}</option>
            {supersetGroupOptions.map((group) => (
              <option key={group} value={group}>
                {t("supersetGroupOption", { group })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!repRangeValid && (
        <p role="alert" className="text-destructive text-sm">
          {t("repRangeError")}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-notes`} className="text-sm font-medium">
          {t("notesLabel")}
        </label>
        <Textarea
          id={`${idPrefix}-notes`}
          rows={2}
          maxLength={NOTES_MAX}
          placeholder={t("notesPlaceholder")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
            {t("cancel")}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
