"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { Stepper } from "./stepper";

const WEIGHT_STEP = 2.5;
const REPS_STEP = 1;

// The edit/delete affordances for one already-logged set (ticket 023) —
// bundled into one object rather than five separate optional props, since
// they only ever travel together (there is no state where one is present
// without the rest).
export type SetRowEdit = {
  setNumber: number;
  isEditing: boolean;
  onStart: () => void;
  onSave: (input: { weight: number; reps: number }) => void;
  onCancel: () => void;
  onDelete: () => void;
};

export type SetRowProps = {
  label: string;
  isWarmup: boolean;
  // A row is either something already performed (weight/reps are facts) or
  // a not-yet-performed placeholder for the next set to log (only the
  // last-time reference and target rep range are known).
  performed?: { weight: number; reps: number };
  lastTimeText: string | null;
  onToggleWarmup?: () => void;
  // Present alongside `performed` for an already-logged row.
  edit?: SetRowEdit;
};

/**
 * The edit surface for an already-logged set (ticket 023): weight/reps
 * Steppers seeded from `performed`, Save/Cancel, and a Delete that swaps
 * into a one-step confirm rather than firing immediately. Local state is
 * reset by the parent remounting this on `setNumber` each time edit mode is
 * (re-)entered — the same trick `EntryDeck` uses for its own fields.
 *
 * Every action button is sized to 44px (DESIGN.md: "Touch targets are
 * ≥44px") — the shadcn `Button`'s default height is 32px, so it needs an
 * explicit override here same as every other in-flow control in this
 * screen (`Stepper`, `RestTimer`'s own buttons).
 */
function SetRowEditForm({
  label,
  isWarmup,
  performed,
  onSave,
  onCancel,
  onDelete,
}: {
  label: string;
  isWarmup: boolean;
  performed: { weight: number; reps: number };
  onSave: (input: { weight: number; reps: number }) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Session");
  const [weight, setWeight] = useState(performed.weight);
  const [reps, setReps] = useState(performed.reps);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col gap-3 border-b border-line py-3 last:border-b-0">
      <span className={cn("text-sm font-medium", isWarmup ? "text-ink-faint" : "text-ink-muted")}>
        {isWarmup && (
          <span aria-hidden className="mr-1">
            {t("warmupMarker")}
          </span>
        )}
        {label}
      </span>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <Stepper label={t("weightLabel")} value={weight} step={WEIGHT_STEP} onChange={setWeight} />
        <Stepper label={t("repsLabel")} value={reps} step={REPS_STEP} onChange={setReps} />
      </div>

      {confirmingDelete ? (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => setConfirmingDelete(false)}>
            {t("cancelEdit")}
          </Button>
          <Button type="button" variant="destructive" className="h-11" onClick={onDelete}>
            {t("confirmDeleteSet")}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="destructive" className="h-11" onClick={() => setConfirmingDelete(true)}>
            {t("deleteSet")}
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
              {t("cancelEdit")}
            </Button>
            <Button type="button" className="h-11" onClick={() => onSave({ weight, reps })}>
              {t("saveSet")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One set row (DESIGN.md's SetRow): set number, weight × reps, and the
 * last-time reference beside it. This is the whole point of the screen — the
 * user cannot decide whether to add weight or add a rep without it — so it
 * gets `readout-m` weight, not grey caption text.
 *
 * Warmups render at `ink-faint` with a "W" marker (DESIGN.md), never a
 * color: they don't count, and the interface says so before you read a word.
 *
 * The last-time value is `shrink-0` and sized to content, never `flex-1` —
 * splitting the row 50/50 with the performed-value span is what used to clip
 * it to an ellipsis regardless of how short the performed value actually was
 * (ticket 023). It never truncates; a defensive last-resort truncation, if
 * ever needed, belongs on the performed-value span instead.
 */
export function SetRow({ label, isWarmup, performed, lastTimeText, onToggleWarmup, edit }: SetRowProps) {
  const t = useTranslations("Session");
  const isUpcoming = !performed;

  if (edit?.isEditing && performed) {
    return (
      <SetRowEditForm
        key={edit.setNumber}
        label={label}
        isWarmup={isWarmup}
        performed={performed}
        onSave={edit.onSave}
        onCancel={edit.onCancel}
        onDelete={edit.onDelete}
      />
    );
  }

  const valueBlock = (
    <>
      <span
        className={cn(
          "min-w-0 flex-1 font-mono text-[1.25rem] leading-tight font-medium tabular-nums",
          isWarmup ? "text-ink-faint" : "text-ink",
        )}
      >
        {performed ? `${performed.weight} × ${performed.reps}` : "—"}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        <span className="text-ink-muted text-[0.6875rem] font-medium tracking-[0.06em] uppercase">
          {t("lastTimeLabel")}
        </span>
        {lastTimeText ? (
          <span className="text-ink-muted font-mono text-[1.25rem] leading-tight font-medium tabular-nums">
            {lastTimeText}
          </span>
        ) : (
          <span className="text-ink-muted text-sm">{t("lastTimeNone")}</span>
        )}
      </span>
    </>
  );

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-line py-3 last:border-b-0",
        isUpcoming && "opacity-70",
      )}
    >
      <span
        className={cn(
          "w-14 shrink-0 text-sm font-medium",
          isWarmup ? "text-ink-faint" : "text-ink-muted",
        )}
      >
        {isWarmup && (
          <span aria-hidden className="mr-1">
            {t("warmupMarker")}
          </span>
        )}
        {label}
      </span>

      {performed && edit ? (
        <button
          type="button"
          onClick={edit.onStart}
          aria-label={t("editSet", { number: edit.setNumber })}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {valueBlock}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{valueBlock}</div>
      )}

      {onToggleWarmup && (
        <button
          type="button"
          onClick={onToggleWarmup}
          aria-label={isWarmup ? t("unmarkWarmup") : t("markWarmup")}
          aria-pressed={isWarmup}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded text-xs font-semibold",
            isWarmup ? "bg-raised text-ink-faint" : "text-ink-muted",
          )}
        >
          {t("warmupMarker")}
        </button>
      )}
    </div>
  );
}
