import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import {
  minutesFromSeconds,
  relativeDateHint,
  roundVolume,
  type RelativeHint,
} from "@/lib/history/format";
import { HISTORY_PAGE_SIZE, getHistoryList } from "@/lib/history/query";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * `/history` — the completed-session list (ticket 016, SPEC.md §4).
 * Server-rendered, paginated via a `?page=` search param rather than client
 * "load more" JS — a year of training is ~150 sessions, comfortably a
 * handful of plain page navigations, and this keeps the whole screen working
 * with zero client JS (CLAUDE.md's Server Action / no-unnecessary-client-code
 * bias, same choice ProgramDetailPage made for its own disclosures).
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  const t = await getTranslations("History");
  const locale = await getLocale();
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { sessions, hasMore } = await getHistoryList(supabase, {
    offset: (pageNum - 1) * HISTORY_PAGE_SIZE,
  });
  const now = Date.now();

  function relativeDateLabel(
    hint: RelativeHint | null,
    absoluteDate: string,
  ): string {
    if (!hint) return absoluteDate;
    if (hint.kind === "today") return t("today");
    if (hint.kind === "yesterday") return t("yesterday");
    return t("daysAgo", { days: hint.days });
  }

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-8">
      <h1 className="text-[1.375rem] leading-tight font-semibold">
        {t("title")}
      </h1>

      {sessions.length === 0 && pageNum === 1 ? (
        <Card className="items-center gap-4 py-10 text-center">
          <CardHeader className="gap-1">
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyBody")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((session) => {
            const hint = relativeDateHint(session.completedAt, now);
            const absoluteDate = new Date(
              session.completedAt,
            ).toLocaleDateString(locale);
            const minutes = minutesFromSeconds(session.durationSeconds);

            return (
              <li key={session.id}>
                <Link
                  href={`/history/${session.id}`}
                  className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Card
                    size="sm"
                    className="transition-colors hover:bg-muted/40"
                  >
                    <CardHeader className="gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="truncate">
                          {session.workoutName ?? t("deletedWorkout")}
                        </CardTitle>
                        <span className="shrink-0 text-xs text-ink-muted">
                          {relativeDateLabel(hint, absoluteDate)}
                        </span>
                      </div>
                      <CardDescription>
                        {minutes !== null && t("durationValue", { minutes })}
                        {minutes !== null && " · "}
                        {t("volumeValue", {
                          volume: roundVolume(session.totalVolumeKg),
                        })}
                        {" · "}
                        {t("setsValue", { count: session.setCount })}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {(pageNum > 1 || hasMore) && (
        <div className="flex items-center justify-between gap-2">
          <PaginationButton
            href={
              pageNum > 1
                ? pageNum === 2
                  ? "/history"
                  : `/history?page=${pageNum - 1}`
                : null
            }
            label={t("prevPage")}
            icon={<ChevronLeft className="size-4" />}
            iconPosition="start"
          />
          <PaginationButton
            href={hasMore ? `/history?page=${pageNum + 1}` : null}
            label={t("nextPage")}
            icon={<ChevronRight className="size-4" />}
            iconPosition="end"
          />
        </div>
      )}
    </main>
  );
}

/** Enabled (a Link) when `href` is given, disabled otherwise — collapses the
 * prev/next buttons' enabled/disabled × start/end-icon combinations into one
 * place. */
function PaginationButton({
  href,
  label,
  icon,
  iconPosition,
}: {
  href: string | null;
  label: string;
  icon: React.ReactNode;
  iconPosition: "start" | "end";
}) {
  const content =
    iconPosition === "start" ? (
      <>
        {icon}
        {label}
      </>
    ) : (
      <>
        {label}
        {icon}
      </>
    );

  if (!href) {
    return (
      <Button variant="outline" size="sm" disabled>
        {content}
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>{content}</Link>
    </Button>
  );
}
