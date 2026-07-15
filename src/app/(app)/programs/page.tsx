import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * `/programs` — the program list (ticket 006). Archived programs are hidden but
 * keep their history, so we filter on `archived_at IS NULL`. The single active
 * program (`profiles.active_program_id`) is badged; the empty state points
 * straight at creation rather than showing a blank screen (SPEC §4).
 */
export default async function ProgramsPage() {
  const t = await getTranslations("Programs");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [{ data: programs }, { data: profile }] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, description")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("active_program_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const activeProgramId = profile?.active_program_id ?? null;
  const list = programs ?? [];

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[1.375rem] leading-tight font-semibold">
          {t("title")}
        </h1>
        <Button asChild size="sm">
          <Link href="/programs/new">
            <Plus className="size-4" />
            {t("new")}
          </Link>
        </Button>
      </div>

      {list.length === 0 ? (
        <Card className="items-center gap-4 py-10 text-center">
          <CardHeader className="gap-1">
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyBody")}</CardDescription>
          </CardHeader>
          <Button asChild>
            <Link href="/programs/new">{t("createCta")}</Link>
          </Button>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((program) => {
            const isActive = program.id === activeProgramId;
            return (
              <li key={program.id}>
                <Link
                  href={`/programs/${program.id}`}
                  className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Card size="sm" className="transition-colors hover:bg-muted/40">
                    <CardHeader className="gap-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="truncate">
                          {program.name}
                        </CardTitle>
                        {isActive && (
                          <Badge className="shrink-0">{t("active")}</Badge>
                        )}
                      </div>
                      {program.description && (
                        <CardDescription className="line-clamp-2">
                          {program.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
