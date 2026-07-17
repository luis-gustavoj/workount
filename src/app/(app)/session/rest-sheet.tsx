"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { RestTimer } from "./rest-timer";

// How long the slide-down exit transition takes (DESIGN.md's 150-220ms
// motion band) — the sheet stays mounted this long after `restEndsAt` goes
// null, so the content doesn't just vanish mid-slide.
const EXIT_MS = 180;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type Phase = "entering" | "open" | "leaving" | "closed";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * `entering` -> `open` -> `leaving` -> `closed`, driven purely by `active`.
 * No transition fires on mount if the initial phase already matches `active`
 * (DESIGN.md: "no page-load choreography") — only a genuine flip of `active`
 * after mount animates. `prefers-reduced-motion` collapses the exit wait to
 * 0ms so nothing sits in a stuck half-state (translated off-screen but still
 * occupying layout for the full 180ms).
 *
 * The `active` transition is detected during render (the React-documented
 * "adjusting state when a prop changes" escape hatch — comparing against a
 * snapshot in state and calling `setState` conditionally in the render
 * body), not in an effect: an effect may only set state from inside a
 * callback (a timer firing, a subscription notifying), never synchronously
 * in its own body. The effect below exists solely to schedule those timers.
 */
function usePresence(active: boolean): Phase {
  const [phase, setPhase] = useState<Phase>(active ? "open" : "closed");
  const [prevActive, setPrevActive] = useState(active);
  const reducedMotion = usePrefersReducedMotion();

  if (active !== prevActive) {
    setPrevActive(active);
    setPhase(active ? "entering" : "leaving");
  }

  useEffect(() => {
    if (phase === "entering") {
      const id = setTimeout(() => setPhase("open"), 0);
      return () => clearTimeout(id);
    }
    if (phase === "leaving") {
      const id = setTimeout(() => setPhase("closed"), reducedMotion ? 0 : EXIT_MS);
      return () => clearTimeout(id);
    }
  }, [phase, reducedMotion]);

  return phase;
}

type RestSheetContent = {
  restEndsAt: number;
  restStartedAt: number;
  restNotifiedAt: number | null;
};

function resolveContent(
  restEndsAt: number | null,
  restStartedAt: number | null,
  restNotifiedAt: number | null,
): RestSheetContent | null {
  return restEndsAt === null ? null : { restEndsAt, restStartedAt: restStartedAt ?? restEndsAt, restNotifiedAt };
}

/**
 * The rest timer's chrome + presence wrapper: a persistent, non-modal
 * floating card — not the shadcn `Sheet` (a Radix `Dialog`: scrim, focus
 * trap, `aria-modal`), the wrong tool since the entry deck below it must
 * stay interactive throughout, and not an in-flow layout element either
 * (ticket 023's original approach) — growing the bottom dock's height every
 * time a rest starts/stops shoved the entry deck and the scrolling set list
 * around, which reads as the layout itself misbehaving. `position: fixed`,
 * floating just above the dock (`bottomOffset`, the dock's own measured
 * height from `SessionPlayer`'s `ResizeObserver`), so neither the dock nor
 * the scrolling list ever resize when a rest starts or ends. Rendered
 * unconditionally by the parent; this component decides show/hide itself
 * from `restEndsAt`.
 */
export function RestSheet({
  restEndsAt,
  restStartedAt,
  restNotifiedAt,
  bottomOffset,
}: {
  restEndsAt: number | null;
  restStartedAt: number | null;
  restNotifiedAt: number | null;
  bottomOffset: number;
}) {
  const active = restEndsAt !== null;
  const phase = usePresence(active);

  // The store nulls all three rest fields the instant a rest ends — this
  // keeps the last non-null triple around so RestTimer's content doesn't
  // blank out mid-slide during the `leaving` phase, when the sheet is still
  // mounted but the draft has already moved on. Same render-time-adjustment
  // pattern as `usePresence` above, guarded so it only calls `setState` when
  // the resolved content actually changed (an unconditional call here would
  // loop forever — a new object literal differs by reference every render).
  const [content, setContent] = useState<RestSheetContent | null>(() =>
    resolveContent(restEndsAt, restStartedAt, restNotifiedAt),
  );
  const resolved = resolveContent(restEndsAt, restStartedAt, restNotifiedAt);
  if (
    resolved !== null &&
    (content === null ||
      content.restEndsAt !== resolved.restEndsAt ||
      content.restStartedAt !== resolved.restStartedAt ||
      content.restNotifiedAt !== resolved.restNotifiedAt)
  ) {
    setContent(resolved);
  }

  if (phase === "closed") return null;
  if (!content) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "border-line bg-raised fixed z-20 mx-3 flex items-center justify-between gap-3 rounded-lg border px-4 py-3",
        "transition-transform duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        phase === "open" ? "translate-y-0" : "translate-y-full",
      )}
      style={{
        left: "env(safe-area-inset-left)",
        right: "env(safe-area-inset-right)",
        bottom: bottomOffset,
      }}
    >
      <RestTimer
        restEndsAt={content.restEndsAt}
        restStartedAt={content.restStartedAt}
        restNotifiedAt={content.restNotifiedAt}
      />
    </div>
  );
}
