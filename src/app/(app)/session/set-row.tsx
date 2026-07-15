"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export type SetRowProps = {
  label: string;
  isWarmup: boolean;
  // A row is either something already performed (weight/reps are facts) or
  // a not-yet-performed placeholder for the next set to log (only the
  // last-time reference and target rep range are known).
  performed?: { weight: number; reps: number };
  lastTimeText: string | null;
  onToggleWarmup?: () => void;
};

/**
 * One set row (DESIGN.md's SetRow): set number, weight × reps, and the
 * last-time reference beside it. This is the whole point of the screen — the
 * user cannot decide whether to add weight or add a rep without it — so it
 * gets `readout-m` weight, not grey caption text.
 *
 * Warmups render at `ink-faint` with a "W" marker (DESIGN.md), never a
 * color: they don't count, and the interface says so before you read a word.
 */
export function SetRow({ label, isWarmup, performed, lastTimeText, onToggleWarmup }: SetRowProps) {
  const t = useTranslations("Session");
  const isUpcoming = !performed;

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

      <span
        className={cn(
          "min-w-0 flex-1 font-mono text-[1.25rem] leading-tight font-medium tabular-nums",
          isWarmup ? "text-ink-faint" : "text-ink",
        )}
      >
        {performed ? `${performed.weight} × ${performed.reps}` : "—"}
      </span>

      <span className="text-ink-muted min-w-0 flex-1 truncate text-right font-mono text-[1.25rem] leading-tight font-medium tabular-nums">
        {lastTimeText ?? t("lastTimeNone")}
      </span>

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
