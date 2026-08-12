import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AdherenceChart } from "./adherence-chart";
import { EmptyNote } from "./chart-chrome";
import { PersonalRecords } from "./personal-records";
import { ProgressionChart } from "./progression-chart";
import { VolumeChart } from "./volume-chart";
import { scheduledPerWeek } from "@/lib/analytics/format";
import {
  getExercisePrs,
  getExerciseProgression,
  getProgramAdherence,
  getProgramVolume,
  listProgramExercises,
} from "@/lib/analytics/query";
import { createClient } from "@/lib/supabase/server";
import { analyticsSearchSchema } from "@/lib/validation/analytics";
import { programIdSchema } from "@/lib/validation/program";
import { Button } from "@/components/ui/button";

/**
 * `/programs/[id]/analytics` (ticket 018, ADR-0004) — "am I getting
 * stronger?", answered honestly, on a phone.
 *
 * Four sections, in descending order of how often they get looked at:
 * strength (e1RM per exercise), volume, personal records, adherence. Every
 * number is aggregated by the ticket-017 SQL; this page fetches rows that are
 * already summarized and hands them to the charts. There is no `.reduce()`
 * over sets anywhere below, and there must never be one — the chart and the
 * PR badge cannot be allowed to disagree.
 *
 * Access control is entirely RLS, like every other program screen: a borrowed
 * program id selects no row and 404s, and the analytics functions are
 * `SECURITY INVOKER`, so they return zero rows for it too.
 *
 * Server-rendered, and the exercise selector is a set of links rather than a
 * client-side control — the same choice /history and the program screens make.
 */
export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ exercise?: string }>;
}) {
  const parsed = programIdSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { id } = parsed.data;

  const search = analyticsSearchSchema.safeParse(await searchParams);
  const requestedExerciseId = search.success ? search.data.exercise : undefined;

  const t = await getTranslations("Analytics");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [{ data: program }, exercises, volume, adherence] = await Promise.all([
    supabase.from("programs").select("id, name").eq("id", id).maybeSingle(),
    listProgramExercises(supabase, id),
    getProgramVolume(supabase, id),
    getProgramAdherence(supabase, id),
  ]);

  if (!program) notFound();

  // An exercise id that isn't in this program (stale link, hand-typed query)
  // falls back to the first one rather than rendering an empty chart for
  // something the program doesn't contain.
  const selected =
    exercises.find((e) => e.exerciseId === requestedExerciseId) ??
    exercises[0] ??
    null;

  const [progression, prs] = await Promise.all([
    selected
      ? getExerciseProgression(supabase, id, selected.exerciseId)
      : Promise.resolve([]),
    getExercisePrs(
      supabase,
      exercises.map((e) => e.exerciseId),
    ),
  ]);

  const header = (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href={`/programs/${program.id}`}>
          <ChevronLeft className="size-4" />
          {t("back")}
        </Link>
      </Button>
      <div className="flex flex-col gap-1">
        <h1 className="text-[1.375rem] leading-tight font-semibold">
          {t("title")}
        </h1>
        <p className="text-sm text-ink-muted">{program.name}</p>
      </div>
    </>
  );

  // The common case for a brand-new program, and the one the acceptance
  // criteria name: nothing completed yet, so there is nothing to chart. An
  // axis with no data under it would be worse than a sentence.
  if (volume.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-8">
        {header}
        <EmptyNote title={t("emptyTitle")} body={t("emptyBody")} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-8">
      {header}

      <Section title={t("strengthTitle")} subtitle={t("strengthSubtitle")}>
        {selected === null ? (
          <EmptyNote
            title={t("noExercisesTitle")}
            body={t("noExercisesBody")}
          />
        ) : (
          <>
            <ExerciseSelector
              programId={program.id}
              exercises={exercises}
              selectedId={selected.exerciseId}
              label={t("exerciseLabel")}
            />
            <ProgressionChart
              points={progression}
              prs={prs.get(selected.exerciseId)}
            />
          </>
        )}
      </Section>

      <Section title={t("volumeTitle")} subtitle={t("volumeSubtitle")}>
        <VolumeChart points={volume} />
      </Section>

      <Section title={t("prsTitle")} subtitle={t("prsSubtitle")}>
        {exercises.length === 0 ? (
          <EmptyNote
            title={t("noExercisesTitle")}
            body={t("noExercisesBody")}
          />
        ) : (
          <PersonalRecords exercises={exercises} prs={prs} />
        )}
      </Section>

      <Section
        title={t("adherenceTitle")}
        subtitle={t("adherenceSubtitle", {
          count: scheduledPerWeek(adherence),
        })}
      >
        <AdherenceChart weeks={adherence} />
      </Section>
    </main>
  );
}

/** Rules and space, not cards (DESIGN.md): a hairline and a heading is the
 *  whole separator. */
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium">{title}</h2>
        {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Which exercise the progression chart shows. Links, not a `<select>`: it
 * needs no client JavaScript, every choice is a real URL a user can return
 * to, and a row of 44px-tall targets is easier to hit one-handed than a
 * native picker.
 *
 * It scopes this section only — volume and adherence are program-wide facts
 * and are not filtered by it.
 */
function ExerciseSelector({
  programId,
  exercises,
  selectedId,
  label,
}: {
  programId: string;
  exercises: Array<{ exerciseId: string; name: string }>;
  selectedId: string;
  label: string;
}) {
  if (exercises.length < 2) return null;

  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex w-max gap-2">
        {exercises.map((exercise) => {
          const isSelected = exercise.exerciseId === selectedId;
          return (
            <li key={exercise.exerciseId}>
              <Link
                href={`/programs/${programId}/analytics?exercise=${exercise.exerciseId}`}
                aria-current={isSelected ? "true" : undefined}
                className={`flex h-11 items-center rounded-sm border px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  isSelected
                    ? "border-ink text-ink"
                    : "border-line text-ink-muted"
                }`}
              >
                {exercise.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
