"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { notifyRestComplete } from "@/lib/session/notify";
import { elapsedFraction, formatRestClock, remaining } from "@/lib/session/rest";
import { useSessionStore } from "@/lib/session/store";

const TICK_MS = 1000;
const ADJUST_MS = 15_000;

/**
 * The rest timer (ticket 013, DESIGN.md's `RestTimer`). Rendered by the
 * parent whenever `draft.restEndsAt` is non-null — during the countdown
 * *and* during overtime, since both states live in that one field (see
 * types.ts). `setInterval` here is purely a render tick (ADR-0001's "a mere
 * render tick"): it never decrements anything, only asks `remaining()`/
 * `elapsedFraction()` to re-derive the truth from the wall clock.
 */
export function RestTimer({
  restEndsAt,
  restStartedAt,
  restNotifiedAt,
}: {
  restEndsAt: number;
  restStartedAt: number;
  restNotifiedAt: number | null;
}) {
  const t = useTranslations("Session");
  const adjustRest = useSessionStore((s) => s.adjustRest);
  const endRest = useSessionStore((s) => s.endRest);
  const markRestNotified = useSessionStore((s) => s.markRestNotified);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    // `setInterval` is throttled or fully suspended while the tab is
    // backgrounded — precisely while resting, per the ticket — so it alone
    // can be stale for however long the phone was locked. Re-sync the
    // instant it's foregrounded again, in the same effect since both exist
    // solely to refresh `now`.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") setNow(Date.now());
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // A raw millisecond comparison, not `remaining(...) <= 0` — remaining()
  // rounds to the nearest second for the *display*, which would otherwise
  // flip to "complete" and fire the alert up to ~499ms before the real
  // zero-crossing.
  const isOvertime = now >= restEndsAt;
  const secondsLeft = remaining(restEndsAt, now);

  // Fires exactly once per rest — keyed on restStartedAt, which a ±15s
  // adjustment never touches (only restEndsAt moves), so nudging the timer
  // while already in overtime can't look like a fresh rest and re-trigger
  // this. `restNotifiedAt` is persisted through the store, not component
  // state, so reopening the app mid-overtime doesn't re-fire it either.
  useEffect(() => {
    if (!isOvertime) return;
    if (restNotifiedAt === restStartedAt) return;
    notifyRestComplete(t("restNotificationTitle"), t("restNotificationBody"));
    void markRestNotified();
  }, [isOvertime, restStartedAt, restNotifiedAt, markRestNotified, t]);

  const ringPercent = Math.round(elapsedFraction(restStartedAt, restEndsAt, now) * 100);

  return (
    <>
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="size-11 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(var(--color-${isOvertime ? "warn" : "signal"}) ${ringPercent}%, var(--color-raised) 0)`,
          }}
        />
        <div className="flex flex-col">
          <span
            className={`text-[0.6875rem] font-medium tracking-[0.06em] uppercase ${
              isOvertime ? "text-warn" : "text-ink-muted"
            }`}
          >
            {isOvertime ? t("restCompleteLabel") : t("restLabel")}
          </span>
          <span className="text-ink font-mono text-[3.5rem] leading-none font-semibold tabular-nums">
            {formatRestClock(secondsLeft)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          aria-label={t("restDecrease")}
          className="bg-raised text-ink grid size-11 shrink-0 place-items-center rounded text-sm font-medium active:translate-y-px"
          onClick={() => void adjustRest(-ADJUST_MS)}
        >
          {t("restDecrease")}
        </button>
        <button
          type="button"
          aria-label={t("restIncrease")}
          className="bg-raised text-ink grid size-11 shrink-0 place-items-center rounded text-sm font-medium active:translate-y-px"
          onClick={() => void adjustRest(ADJUST_MS)}
        >
          {t("restIncrease")}
        </button>
        <button
          type="button"
          className="text-ink-muted h-11 shrink-0 rounded px-3 text-sm font-medium underline underline-offset-2"
          onClick={() => void endRest()}
        >
          {t("doneResting")}
        </button>
      </div>
    </>
  );
}
