import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { programIdSchema } from "@/lib/validation/program";
import {
  archiveProgram,
  followProgram,
  updateProgram,
} from "@/app/(app)/programs/actions";
import { ProgramFields } from "@/app/(app)/programs/program-fields";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * `/programs/[id]` — program detail (ticket 006). Shows name, description, its
 * workouts (empty until ticket 007), and the follow / edit / archive actions.
 *
 * Access control is entirely RLS: the SELECT is scoped to the owner, so another
 * user's program returns no row and we render a 404 (`notFound`), never a 500
 * and never a leak. A malformed (non-uuid) id is 404'd before it reaches the
 * database, where `.eq("id", …)` on a uuid column would otherwise throw.
 */
export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsed = programIdSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { id } = parsed.data;

  const t = await getTranslations("Programs");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [{ data: program }, { data: profile }] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, description")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("active_program_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (!program) notFound();

  const activeProgramId = profile?.active_program_id ?? null;
  const isActive = activeProgramId === program.id;

  // The one invariant's first edge case: switching active programs silently
  // drops the previous one, so name it before the click (ticket 006). Only
  // needed when a *different* program is currently active.
  let activeProgramName: string | null = null;
  if (activeProgramId && !isActive) {
    const { data: active } = await supabase
      .from("programs")
      .select("name")
      .eq("id", activeProgramId)
      .maybeSingle();
    activeProgramName = active?.name ?? null;
  }

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href="/programs">
          <ChevronLeft className="size-4" />
          {t("back")}
        </Link>
      </Button>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-[1.375rem] leading-tight font-semibold">
            {program.name}
          </h1>
          {isActive && <Badge className="shrink-0">{t("active")}</Badge>}
        </div>
        <p className="text-ink-muted text-sm">
          {program.description ?? t("noDescription")}
        </p>
      </div>

      {/* Follow: the "one active program" control. When another program is
          active, the note names it so the switch is never a surprise. */}
      <section className="flex flex-col gap-2">
        {isActive ? (
          <p className="text-ink-muted text-sm">{t("activeNote")}</p>
        ) : (
          <form action={followProgram}>
            <input type="hidden" name="id" value={program.id} />
            <Button type="submit">{t("follow")}</Button>
          </form>
        )}
        {!isActive && activeProgramName && (
          <p className="text-ink-muted text-sm">
            {t("switchNote", { name: activeProgramName })}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-5">
        <h2 className="text-sm font-medium">{t("workouts")}</h2>
        <p className="text-ink-muted text-sm">{t("workoutsEmpty")}</p>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-5">
        {/* Native <details> disclosure: an edit form that needs no client JS. */}
        <details className="group flex flex-col gap-3">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm font-medium">
            {t("edit")}
          </summary>
          <form action={updateProgram} className="mt-3 flex flex-col gap-4">
            <input type="hidden" name="id" value={program.id} />
            <ProgramFields
              defaults={{
                name: program.name,
                description: program.description ?? "",
              }}
            />
            <Button type="submit" className="self-start">
              {t("save")}
            </Button>
          </form>
        </details>
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-5">
        <form action={archiveProgram}>
          <input type="hidden" name="id" value={program.id} />
          <Button type="submit" variant="destructive">
            {t("archive")}
          </Button>
        </form>
        <p className="text-ink-muted text-xs">{t("archiveHint")}</p>
      </section>
    </main>
  );
}
