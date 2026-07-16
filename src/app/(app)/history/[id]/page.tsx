import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import {
  groupSetsByExercise,
  minutesFromSeconds,
  roundVolume,
} from "@/lib/history/format";
import { getSessionDetail } from "@/lib/history/query";
import { sessionIdSchema } from "@/lib/validation/history";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * `/history/[id]` — the session detail (ticket 016, SPEC.md §4). Every set
 * this session logged, grouped by exercise in performance order, warmups
 * visually distinguished but never hidden, the snapshotted rep range shown
 * alongside what was actually hit (ADR-0002's whole payoff), and PR badges
 * from `get_session_prs`.
 *
 * Access control is entirely RLS via `v_session_summary`/`session_sets`
 * (0005_history.sql, both security_invoker): a session that doesn't exist or
 * belongs to someone else comes back as `null` from getSessionDetail and
 * renders a 404 either way, never a leak — same pattern as
 * /programs/[id].
 */
export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsed = sessionIdSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { id } = parsed.data;

  const t = await getTranslations("History");
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const detail = await getSessionDetail(supabase, id);
  if (!detail) notFound();

  const exerciseGroups = groupSetsByExercise(detail.sets);
  const absoluteDate = new Date(detail.completedAt).toLocaleDateString(locale, {
    dateStyle: "long",
  });
  const minutes = minutesFromSeconds(detail.durationSeconds);

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href="/history">
          <ChevronLeft className="size-4" />
          {t("back")}
        </Link>
      </Button>

      <div className="flex flex-col gap-2">
        <h1 className="text-[1.375rem] leading-tight font-semibold">
          {detail.workoutName ?? t("deletedWorkout")}
        </h1>
        <p className="text-sm text-ink-muted">{absoluteDate}</p>
        <p className="text-sm text-ink-muted">
          {minutes !== null && t("durationValue", { minutes })}
          {minutes !== null && " · "}
          {t("volumeValue", { volume: roundVolume(detail.totalVolumeKg) })}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {exerciseGroups.map((group) => (
          <Card key={group.exerciseId} size="sm">
            <CardHeader className="gap-1">
              <CardTitle>{group.exerciseName}</CardTitle>
              {group.targetRepMin !== null && group.targetRepMax !== null && (
                <CardDescription>
                  {t("targetRange", {
                    repMin: group.targetRepMin,
                    repMax: group.targetRepMax,
                  })}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1.5">
                {group.sets.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="w-5 shrink-0 text-ink-muted tabular-nums">
                      {s.setNumber}
                    </span>
                    <span className="tabular-nums">
                      {t("setWeightReps", { weight: s.weight, reps: s.reps })}
                    </span>
                    {s.isWarmup && (
                      <Badge
                        variant="outline"
                        className="shrink-0"
                        aria-label={t("warmupLabel")}
                      >
                        {t("warmupMarker")}
                      </Badge>
                    )}
                    {s.isPr && (
                      <Badge
                        className="shrink-0"
                        aria-label={t("prBadgeLabel")}
                      >
                        {t("prBadge")}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
