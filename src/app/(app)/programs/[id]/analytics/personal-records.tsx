import Link from "next/link";
import { useTranslations } from "next-intl";

import { roundE1rm } from "@/lib/analytics/format";
import type { ExercisePrs, ProgramExercise } from "@/lib/analytics/query";

/**
 * The three PR kinds per exercise (ticket 018, scope item 3), each linking to
 * the session it happened in — read from `v_exercise_prs`, which computes
 * them over working sets only. A warmup is never a record, and that exclusion
 * lives in the SQL, not here.
 *
 * A table rather than a chart: three unordered bests per exercise is a
 * reference list, and a chart of it would be three one-bar charts.
 *
 * No client JavaScript — plain markup and links. `useTranslations` rather
 * than `getTranslations` keeps the component synchronous, which is what lets
 * it render on the server *and* be rendered directly in a test.
 */
export function PersonalRecords({
  exercises,
  prs,
}: {
  exercises: ProgramExercise[];
  prs: Map<string, ExercisePrs>;
}) {
  const t = useTranslations("Analytics");

  return (
    <ul className="flex flex-col gap-4">
      {exercises.map((exercise) => {
        const record = prs.get(exercise.exerciseId);

        return (
          <li key={exercise.exerciseId} className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">{exercise.name}</h3>

            {record === undefined ? (
              <p className="text-sm text-ink-muted">{t("prNone")}</p>
            ) : (
              <dl className="flex flex-col gap-0.5">
                <PrRow
                  label={t("prHeaviest")}
                  value={t("setValue", {
                    weight: record.heaviestWeightKg,
                    reps: record.heaviestReps,
                  })}
                  sessionId={record.heaviestSessionId}
                />
                <PrRow
                  label={t("prBestE1rm")}
                  value={t("prE1rmValue", {
                    value: roundE1rm(record.bestE1rmKg),
                  })}
                  sessionId={record.bestE1rmSessionId}
                />
                <PrRow
                  label={t("prMostReps")}
                  value={t("prRepsValue", {
                    reps: record.mostReps,
                    weight: record.mostRepsWeightKg,
                  })}
                  sessionId={record.mostRepsSessionId}
                />
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** One record: what kind it is, what it was, and the session it happened in.
 *  The session a record was set in may pre-date this program — a PR is a
 *  per-exercise best (CONTEXT.md), so the link goes wherever it happened. */
function PrRow({
  label,
  value,
  sessionId,
}: {
  label: string;
  value: string;
  sessionId: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-mono text-sm">
        <Link
          href={`/history/${sessionId}`}
          className="underline-offset-2 hover:underline"
        >
          {value}
        </Link>
      </dd>
    </div>
  );
}
