"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

// The server has no media queries, so it renders the animated markup. The
// client's first paint corrects it if the preference is set. `false` is the
// right default in that gap: the opposite would flash a static frame at
// everyone, including the people who did not ask for one.
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Whether the user has asked for reduced motion.
 *
 * Shared because two very different places need the same answer: the session
 * player's rest sheet (DESIGN.md — every animation has a reduced-motion
 * alternative) and the landing page's animated hero. The marketing exemption in
 * ADR-0007 covers cards and gradients; it does not reach accessibility, so both
 * honour this identically.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: a media query is
 * exactly the external store it exists for, and its separate server snapshot is
 * what keeps a server-rendered page from hydrating into a mismatch when the
 * preference is set.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
