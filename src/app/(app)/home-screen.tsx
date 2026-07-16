"use client";

import { del as idbDel, get as idbGet } from "idb-keyval";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { buildResolveHomeInput } from "@/lib/home/build-input";
import type { HomeData } from "@/lib/home/query";
import { resolveHome, type HomeState } from "@/lib/home/resolve";
import { calculateStreak } from "@/lib/home/streak";
import { ACTIVE_DRAFT_KEY, type SessionDraft } from "@/lib/session/types";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Status = "loading" | "ready";

/**
 * `/` — the home screen (ticket 015). The draft check is client-only (it
 * lives in IndexedDB, ADR-0001), so this whole screen has to be a client
 * component even though `data` — everything else `resolveHome` needs — was
 * fetched server-side in page.tsx. `now` is read exactly once, here, so the
 * resolver stays a pure function of it rather than each render re-deriving
 * its own clock.
 */
export function HomeScreen({ data }: { data: HomeData }) {
  const t = useTranslations("Home");
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<HomeState | null>(null);
  const [minutesInProgress, setMinutesInProgress] = useState(0);
  // Captured alongside `state` (rather than read again at render time) so
  // the streak below is computed from the same clock reading the resolver
  // used — a component render must stay pure (react-hooks/purity), and this
  // is the one `now` a re-render is allowed to reuse.
  const [resolvedAt, setResolvedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const stored = (await idbGet(ACTIVE_DRAFT_KEY)) as SessionDraft | undefined;
      if (cancelled) return;

      const now = Date.now();
      const draft = stored ? { startedAt: stored.startedAt } : null;
      const input = buildResolveHomeInput({
        now,
        draft,
        activeProgramId: data.activeProgramId,
        workouts: data.workouts,
        completedSessions: data.recentSessions.map((s) => ({
          workoutId: s.workoutId,
          completedAt: s.completedAt,
        })),
      });

      setState(resolveHome(input));
      setResolvedAt(now);
      setMinutesInProgress(
        draft ? Math.max(0, Math.round((now - Date.parse(draft.startedAt)) / 60000)) : 0,
      );
      setStatus("ready");
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [data]);

  async function discardDraft() {
    await idbDel(ACTIVE_DRAFT_KEY);
    const now = Date.now();
    const input = buildResolveHomeInput({
      now,
      draft: null,
      activeProgramId: data.activeProgramId,
      workouts: data.workouts,
      completedSessions: data.recentSessions.map((s) => ({
        workoutId: s.workoutId,
        completedAt: s.completedAt,
      })),
    });
    setState(resolveHome(input));
    setResolvedAt(now);
  }

  if (status === "loading" || !state || resolvedAt === null) {
    return (
      <main className="mx-auto flex w-full max-w-[480px] flex-1 items-center justify-center px-4 py-12">
        <p className="text-ink-muted text-sm">{t("loading")}</p>
      </main>
    );
  }

  const streak = calculateStreak(
    data.recentSessions.map((s) => s.completedAt),
    resolvedAt,
  );
  const lastThree = data.recentSessions.slice(0, 3);
  const showBelowTheFold = state.kind === "today" || state.kind === "rest";

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-8">
      {state.kind === "no-program" && (
        <Card className="items-center gap-4 py-10 text-center">
          <CardHeader className="gap-1">
            <CardTitle>{t("noProgramTitle")}</CardTitle>
            <CardDescription>{t("noProgramBody")}</CardDescription>
          </CardHeader>
          <Button asChild>
            <Link href="/programs/new">{t("noProgramCta")}</Link>
          </Button>
        </Card>
      )}

      {state.kind === "resume" && (
        <Card className="gap-4">
          <CardHeader className="gap-1">
            <CardTitle>{t("resumeTitle")}</CardTitle>
            <CardDescription>{t("resumeBody", { minutes: minutesInProgress })}</CardDescription>
          </CardHeader>
          <div className="flex flex-wrap gap-2 px-(--card-spacing)">
            <Button asChild>
              <Link href="/session">{state.stale ? t("finishNow") : t("resume")}</Link>
            </Button>
            {state.stale && (
              <Button type="button" variant="ghost" onClick={() => void discardDraft()}>
                {t("discard")}
              </Button>
            )}
          </div>
        </Card>
      )}

      {state.kind === "today" && (
        <div className="flex flex-col gap-3">
          {state.workouts.map((workout) => (
            <Card key={workout.id} className="gap-4">
              <CardHeader className="gap-1">
                <CardTitle>{t("todayTitle", { name: workout.name })}</CardTitle>
              </CardHeader>
              <div className="px-(--card-spacing)">
                <Button asChild>
                  <Link href={`/programs/${data.activeProgramId}/workouts/${workout.id}`}>
                    {t("startWorkout")}
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {state.kind === "rest" && (
        <Card className="gap-4">
          <CardHeader className="gap-1">
            <CardTitle>{t("restTitle")}</CardTitle>
            {state.completedToday.length > 0 && (
              <CardDescription>
                {t("restDoneToday", {
                  names: state.completedToday.map((w) => w.name).join(", "),
                })}
              </CardDescription>
            )}
            {state.nextWorkout && (
              <CardDescription>{t("restNext", { name: state.nextWorkout.name })}</CardDescription>
            )}
          </CardHeader>
          <div className="px-(--card-spacing)">
            <Button asChild variant="secondary">
              <Link href="/programs">{t("startAny")}</Link>
            </Button>
          </div>
        </Card>
      )}

      {showBelowTheFold && (
        <section className="flex flex-col gap-3 border-t border-line pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("streakLabel")}</h2>
            <span className="text-ink-muted text-sm">{t("streakValue", { days: streak })}</span>
          </div>
          {lastThree.length > 0 && (
            <ul className="flex flex-col gap-2">
              {lastThree.map((session) => (
                <li key={session.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{session.workoutName ?? t("deletedWorkout")}</span>
                  <span className="text-ink-muted shrink-0">
                    {new Date(session.completedAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
