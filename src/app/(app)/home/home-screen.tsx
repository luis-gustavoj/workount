"use client";

import { del as idbDel, get as idbGet } from "idb-keyval";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { buildResolveHomeInput } from "@/lib/home/build-input";
import type { HomeData } from "@/lib/home/query";
import { resolveHome, type HomeState, type HomeWorkout } from "@/lib/home/resolve";
import { calculateStreak } from "@/lib/home/streak";
import { startSession } from "@/lib/session/start";
import { ACTIVE_DRAFT_KEY, type SessionDraft } from "@/lib/session/types";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The primary action for one of today's workouts: start it, or — if it has no
 * exercises yet — go add some.
 *
 * Defined at module scope, not inside `HomeScreen`. A component declared inside
 * another is a *new component type* on every render, so React unmounts and
 * remounts its whole subtree each time the parent's state changes — throwing
 * away the DOM node, and with it any focus sitting on this button.
 */
function TodayActions({
  workout,
  planHref,
  canStart,
  isStarting,
  onStart,
}: {
  workout: HomeWorkout;
  planHref: string;
  canStart: boolean;
  isStarting: boolean;
  onStart: () => void;
}) {
  const t = useTranslations("Home");

  // A workout with no exercises has nothing to start. Starting it anyway would
  // land the user in a player whose empty state reads "No session in progress"
  // — a confusing lie moments after they started one.
  if (workout.exerciseCount === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-ink-muted text-sm">{t("noExercises")}</p>
        <Button asChild className="self-start">
          <Link href={planHref}>{t("addExercises")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" disabled={!canStart || isStarting} onClick={onStart}>
        {isStarting ? t("starting") : t("startWorkout")}
      </Button>
      <Link
        href={planHref}
        className="text-ink-muted rounded-md text-sm underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {t("viewPlan")}
      </Link>
    </div>
  );
}

/**
 * `/` — the home screen (tickets 015 / 024).
 *
 * Everything except the draft was fetched server-side in one round trip
 * (page.tsx). The draft lives in IndexedDB (ADR-0001) and can only be read in
 * the browser, which is why this is a client component — but it no longer
 * *blocks* on that read. It used to render the word "Loading…" until IndexedDB
 * answered, which meant that after the route's skeleton you got a second,
 * uglier loading state before any content at all.
 *
 * Now the server-derived answer renders immediately (resolved as though there
 * were no draft), and the resume card replaces it a beat later if one turns
 * out to exist. The one thing that must not race is starting a session: until
 * the draft read lands we cannot know we would be clobbering one, so the Start
 * button stays disabled for those few milliseconds.
 *
 * `now` is captured alongside each resolution rather than read at render time,
 * so the resolver stays a pure function of it and a re-render can't invent a
 * new clock (react-hooks/purity).
 */
export function HomeScreen({ data }: { data: HomeData }) {
  const t = useTranslations("Home");
  const router = useRouter();

  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [isStarting, startTransition] = useTransition();
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = (await idbGet(ACTIVE_DRAFT_KEY)) as SessionDraft | undefined;
      if (cancelled) return;
      setDraft(stored ?? null);
      setNow(Date.now());
      setDraftChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const state: HomeState = resolveHome(
    buildResolveHomeInput({
      now,
      draft: draft ? { startedAt: draft.startedAt } : null,
      activeProgramId: data.activeProgramId,
      workouts: data.workouts,
      completedSessions: data.recentSessions.map((s) => ({
        workoutId: s.workoutId,
        completedAt: s.completedAt,
      })),
    }),
  );

  async function discardDraft() {
    await idbDel(ACTIVE_DRAFT_KEY);
    setDraft(null);
    setNow(Date.now());
  }

  /**
   * Start a session straight from Home and go to the player.
   *
   * This is the whole point of ticket 024. Home used to link to the workout
   * builder, so "Start workout" meant *look at the plan*, and starting was
   * another screen and another tap away — on the button you press most, every
   * training day.
   *
   * The round trip is real (bundle + last-performance, per ADR-0001), so the
   * button owns a pending and an error state rather than pretending otherwise.
   * On failure the user stays on Home with the plan still reachable.
   */
  function start(workoutId: string) {
    setStartError(null);
    startTransition(async () => {
      try {
        await startSession(createClient(), workoutId);
        router.push("/session");
      } catch {
        setStartError(t("startError"));
      }
    });
  }

  const streak = calculateStreak(
    data.recentSessions.map((s) => s.completedAt),
    now,
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
            <CardDescription>
              {t("resumeBody", {
                minutes: Math.max(
                  0,
                  Math.round((now - Date.parse(state.startedAt)) / 60000),
                ),
              })}
            </CardDescription>
          </CardHeader>
          <div className="flex flex-wrap gap-2 px-(--card-spacing)">
            <Button asChild>
              <Link href="/session">
                {state.stale ? t("finishNow") : t("resume")}
              </Link>
            </Button>
            {state.stale && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void discardDraft()}
              >
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
                <TodayActions
                  workout={workout}
                  planHref={`/programs/${data.activeProgramId}/workouts/${workout.id}`}
                  // Until the draft read lands we cannot know whether starting
                  // would clobber a session already in progress.
                  canStart={draftChecked}
                  isStarting={isStarting}
                  onStart={() => start(workout.id)}
                />
              </div>
            </Card>
          ))}
          {startError && (
            <p role="alert" className="text-danger text-sm">
              {startError}
            </p>
          )}
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
              <CardDescription>
                {t("restNext", { name: state.nextWorkout.name })}
              </CardDescription>
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
            <span className="text-sm text-ink-muted">
              {t("streakValue", { days: streak })}
            </span>
          </div>
          {lastThree.length > 0 && (
            <ul className="flex flex-col gap-2">
              {lastThree.map((session) => (
                <li key={session.id} className="text-sm">
                  <Link
                    href={`/history/${session.id}`}
                    className="flex items-center justify-between gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="truncate">
                      {session.workoutName ?? t("deletedWorkout")}
                    </span>
                    <span className="shrink-0 text-ink-muted">
                      {new Date(session.completedAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/history"
            className="self-start text-sm text-ink-muted underline-offset-2 hover:underline"
          >
            {t("seeAll")}
          </Link>
        </section>
      )}
    </main>
  );
}
