"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";
import { formatRestClock } from "@/lib/session/rest";
import { cn } from "@/lib/utils";

/**
 * The hero illustration: the session player, rebuilt in markup rather than
 * screenshotted (ticket 025).
 *
 * Why a replica and not a PNG — it stays crisp at any density, weighs nothing,
 * needs no authenticated capture pipeline, and can show the one thing a still
 * image cannot: a set being logged and a timer that is actually running.
 *
 * The cost is that it is a replica, so it can drift from the real player. It
 * borrows what it can to limit that — `formatRestClock` and the `Session`
 * message catalog are the player's own, so the wording and the clock format
 * cannot drift even in principle.
 *
 * **The countdown is real time, not compressed.** A 90s rest ticks down one
 * true second per second, and the ring is the same `conic-gradient` on elapsed
 * fraction that `RestTimer` draws. The loop simply cuts away after a few
 * seconds rather than speeding the clock up: a readout sprinting through 90
 * seconds in six would undercut the exact claim the page is making about this
 * app's timer being trustworthy.
 */

// One loop, in milliseconds. Entry deck → log → rest → cut back.
const TICK_MS = 100;
const LOG_AT = 2_000;
const REST_ENDS_LOOP_AT = 10_400;
const LOOP_MS = 11_200;

// The rest being illustrated. 90s is the app's own default.
const REST_TOTAL_S = 90;

type Performed = { weight: number; reps: number };

const LOGGED: ReadonlyArray<{
  set: number;
  performed: Performed;
  last: string;
}> = [
  { set: 1, performed: { weight: 80, reps: 8 }, last: "77.5 × 8" },
  { set: 2, performed: { weight: 80, reps: 8 }, last: "77.5 × 8" },
];
const THIRD = { set: 3, performed: { weight: 82.5, reps: 7 }, last: "80 × 7" };
const UPCOMING = { set: 4, last: "80 × 6" };

function useLoopElapsed(enabled: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const startedAt = Date.now();
    const id = setInterval(
      () => setElapsed((Date.now() - startedAt) % LOOP_MS),
      TICK_MS,
    );
    return () => clearInterval(id);
  }, [enabled]);

  return elapsed;
}

/** One row of the set list — the shape of `SetRow`, at the mock's smaller scale. */
function MockRow({
  label,
  performed,
  last,
  settling,
  upcoming,
}: {
  label: string;
  performed?: Performed;
  last: string;
  settling?: boolean;
  upcoming?: boolean;
}) {
  const t = useTranslations("Session");

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-line py-2 last:border-b-0",
        upcoming && "opacity-60",
        // DESIGN.md: a logged set settles in place — 160ms, opacity and a 2px
        // rise. It does not fly, bounce, or celebrate.
        settling &&
          "motion-safe:animate-[settle_160ms_cubic-bezier(0.22,1,0.36,1)]",
      )}
    >
      <span className="w-9 shrink-0 text-[0.6875rem] font-medium text-ink-muted">
        {label}
      </span>
      <span className="min-w-0 flex-1 font-mono text-[0.9375rem] leading-tight font-medium text-ink tabular-nums">
        {performed ? `${performed.weight} × ${performed.reps}` : "—"}
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="text-[0.5625rem] font-medium tracking-[0.06em] text-ink-faint uppercase">
          {t("lastTimeLabel")}
        </span>
        <span className="font-mono text-[0.9375rem] leading-tight font-medium text-ink-muted tabular-nums">
          {last}
        </span>
      </span>
    </div>
  );
}

export function PlayerMock() {
  const t = useTranslations("Session");
  const tl = useTranslations("Landing");
  const reducedMotion = usePrefersReducedMotion();
  const elapsed = useLoopElapsed(!reducedMotion);

  // Reduced motion gets the frame that carries the most information at rest:
  // the third set already logged, and the timer mid-rest. Nothing is lost —
  // the animation only ever showed how it got there.
  const logged = reducedMotion || elapsed >= LOG_AT;
  const resting = logged;
  const settling =
    !reducedMotion && elapsed >= LOG_AT && elapsed < LOG_AT + 400;

  const restElapsedS = reducedMotion
    ? 6
    : Math.min((elapsed - LOG_AT) / 1000, (REST_ENDS_LOOP_AT - LOG_AT) / 1000);
  const secondsLeft = REST_TOTAL_S - Math.floor(Math.max(restElapsedS, 0));
  const ringPercent = Math.max(0, (restElapsedS / REST_TOTAL_S) * 100);

  return (
    <div
      role="img"
      aria-label={tl("mock.alt")}
      // The device. A single hairline and a deep radius — no glare gradient,
      // no notch drawn in: the frame is there to say "this is a phone", not to
      // be looked at.
      className="relative w-[19rem] max-w-full shrink-0 rounded-[2rem] border border-line bg-bg p-2 shadow-[0_2.5rem_5rem_-1.5rem_rgb(0_0_0/0.9)]"
    >
      <div className="flex h-[30rem] flex-col overflow-hidden rounded-[1.5rem] bg-bg">
        {/* Top band — static, per DESIGN.md's three-band layout. */}
        <div className="flex shrink-0 flex-col gap-1 border-b border-line px-4 pt-5 pb-3">
          <div className="flex items-center justify-between text-[0.5625rem] font-medium tracking-[0.06em] text-ink-faint uppercase">
            <span>{tl("mock.workout")}</span>
            <span>{t("exerciseProgress", { position: 2, total: 5 })}</span>
          </div>
          <h3 className="text-[1.0625rem] leading-tight font-semibold text-ink">
            {tl("mock.exercise")}
          </h3>
          <span className="font-mono text-[0.8125rem] text-ink-muted tabular-nums">
            {tl("mock.target")}
          </span>
        </div>

        {/* Middle band — the set list, the only scrolling region in the real
            player. Here it simply never overflows. */}
        <div className="flex min-h-0 flex-1 flex-col px-4">
          {LOGGED.map((row) => (
            <MockRow
              key={row.set}
              label={t("setLabel", { number: row.set })}
              performed={row.performed}
              last={row.last}
            />
          ))}
          {logged ? (
            <MockRow
              label={t("setLabel", { number: THIRD.set })}
              performed={THIRD.performed}
              last={THIRD.last}
              settling={settling}
            />
          ) : null}
          <MockRow
            label={t("setLabel", { number: UPCOMING.set })}
            last={UPCOMING.last}
            upcoming
          />
        </div>

        {/* Bottom band — the entry deck, then the rest timer that replaces it. */}
        <div className="shrink-0 border-t border-line bg-surface px-4 py-3">
          {resting ? (
            <div className="flex items-center gap-3">
              <div
                aria-hidden
                className="size-9 shrink-0 rounded-full"
                style={{
                  background: `conic-gradient(var(--color-signal) ${ringPercent}%, var(--color-raised) 0)`,
                }}
              />
              <div className="flex min-w-0 flex-col">
                <span className="text-[0.5625rem] font-medium tracking-[0.06em] text-ink-muted uppercase">
                  {t("restLabel")}
                </span>
                <span className="font-mono text-[1.75rem] leading-none font-semibold text-signal tabular-nums">
                  {formatRestClock(secondsLeft)}
                </span>
              </div>
              <div className="ml-auto flex shrink-0 gap-1.5">
                <span className="rounded-md border border-line px-2 py-1.5 font-mono text-[0.6875rem] text-ink-muted tabular-nums">
                  {t("restDecrease")}
                </span>
                <span className="rounded-md border border-line px-2 py-1.5 font-mono text-[0.6875rem] text-ink-muted tabular-nums">
                  {t("restIncrease")}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[0.5625rem] font-medium tracking-[0.06em] text-ink-faint uppercase">
                  {t("weightLabel")}
                </span>
                <span className="font-mono text-[1.375rem] leading-none font-semibold text-ink tabular-nums">
                  {THIRD.performed.weight}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[0.5625rem] font-medium tracking-[0.06em] text-ink-faint uppercase">
                  {t("repsLabel")}
                </span>
                <span className="font-mono text-[1.375rem] leading-none font-semibold text-ink tabular-nums">
                  {THIRD.performed.reps}
                </span>
              </div>
              <span className="ml-auto rounded-lg bg-signal px-4 py-2.5 text-[0.8125rem] font-medium text-primary-foreground">
                {t("logSet")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
