import type { AdherenceWeek, ExercisePrs, ProgressionPoint } from "./query";

/**
 * Pure display math for /programs/[id]/analytics (ticket 018). Axis domains,
 * rounding, and the record flag — nothing here computes a training number.
 * Volume, e1RM and adherence arrive already aggregated from the ticket-017
 * SQL (ADR-0004); these functions only decide how they are drawn.
 *
 * Kept out of the components so the arithmetic is testable without rendering
 * an SVG — same split as src/lib/history/format.ts.
 */

/** The smallest plate pair, and therefore the smallest step a weight axis
 *  should ever land on. */
const PLATE_STEP = 5;

/** Two points make a slope, not a trend. A brand-new program has one session
 *  and nothing to say; drawing a line through two points invents a story
 *  (ticket 018 — "come back after a few sessions" beats a meaningless line). */
export const MIN_TREND_POINTS = 3;

export function hasTrend(pointCount: number): boolean {
  return pointCount >= MIN_TREND_POINTS;
}

/** e1RM is an *estimate* (CONTEXT.md) and is displayed as one: one decimal.
 *  The unrounded value is what gets compared and plotted — rounding before a
 *  comparison is how two "equal" bests start disagreeing (0006_analytics.sql). */
export function roundE1rm(kg: number): number {
  return Math.round(kg * 10) / 10;
}

/**
 * The y-domain for a weight line chart: **zero-suppressed**, padded by 15% of
 * the range and snapped outward to whole plate steps.
 *
 * Suppressing zero is right here and wrong for the volume bars below: a line
 * carries *change*, and eight weeks of 119→137kg progress flattens into a
 * straight line near the top of a 0-based axis. Bars carry *magnitude* and
 * must keep their baseline.
 */
export function weightDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, PLATE_STEP];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  // A single session (or an unchanged weight) has no range to pad against, so
  // fall back to a fixed plate step rather than collapsing the axis onto the
  // one value.
  const pad = range > 0 ? range * 0.15 : Math.max(PLATE_STEP, max * 0.05);

  const lo = Math.max(0, Math.floor((min - pad) / PLATE_STEP) * PLATE_STEP);
  const hi = Math.ceil((max + pad) / PLATE_STEP) * PLATE_STEP;

  return [lo, hi === lo ? lo + PLATE_STEP : hi];
}

/** A program whose every session was warmups-only still deserves a legible
 *  axis — the bars sit flat on the baseline and say so. */
const EMPTY_VOLUME_MAX = 100;

/**
 * The top of a volume axis: rounded up to a half-magnitude tick (2430 →
 * 2500, 1830 → 2000), so the axis labels are numbers a person reads rather
 * than the raw maximum. The bottom is always 0 — these are bars.
 */
export function volumeDomainMax(values: number[]): number {
  const max = values.length === 0 ? 0 : Math.max(...values);
  if (max <= 0) return EMPTY_VOLUME_MAX;

  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = magnitude / 2;
  return Math.ceil(max / step) * step;
}

/**
 * Tick values for an axis over `[lo, hi]`: three to six of them, each a round
 * multiple of a 1 / 2 / 2.5 / 5 × 10ⁿ step.
 *
 * Left to itself a chart library divides the domain into equal parts and ticks
 * a volume axis at 650 · 1,300 · 1,950 — technically correct and unreadable.
 * The ticks carry every value that isn't directly labelled, so they have to be
 * numbers a person can compare at a glance, on a phone, between sets.
 */
export function axisTicks(lo: number, hi: number, minStep = 0): number[] {
  const span = hi - lo;
  if (span <= 0) return [lo];

  const magnitude = 10 ** Math.floor(Math.log10(span));
  for (const factor of [0.1, 0.2, 0.25, 0.5, 1, 2]) {
    const step = magnitude * factor;
    // A count of sessions has no half: `minStep = 1` keeps a 0–3 axis off
    // 0.5-session ticks.
    if (step < minStep) continue;
    const first = Math.ceil(lo / step) * step;
    const count = Math.floor((hi - first) / step) + 1;
    if (count >= 3 && count <= 6) {
      return Array.from({ length: count }, (_, i) =>
        // Re-round each tick: 0.1 + 0.2 arithmetic would otherwise print a
        // 1,499.9999999 on the axis.
        Number((first + i * step).toPrecision(12)),
      );
    }
  }
  return [lo, hi];
}

/**
 * How many workouts this program schedules in a week.
 *
 * `get_program_adherence` repeats the same count on every row — it is the
 * program's *current* shape applied to every past week (0006_analytics.sql) —
 * so reading row zero is correct, and it is here rather than spelled out at
 * each call site so that assumption lives in one place. Zero when the program
 * schedules nothing to a day, and when there are no weeks at all.
 */
export function scheduledPerWeek(weeks: AdherenceWeek[]): number {
  return weeks[0]?.scheduledWorkouts ?? 0;
}

/** Adherence as a whole percent. Not capped — three sessions in a two-session
 *  week is 150%, and flattening it to 100% would hide it. Null stays null:
 *  nothing scheduled is undefined, not perfect. */
export function adherencePercent(adherence: number | null): number | null {
  return adherence === null ? null : Math.round(adherence * 100);
}

/** "12 Aug" — a date short enough for an axis tick at 390px. */
export function shortDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
}

export type RecordMarkedPoint = ProgressionPoint & { isRecord: boolean };

/**
 * Flags the point that holds the exercise's best e1RM, so the chart can put
 * the signal on it — DESIGN.md allows exactly three live things, and "a
 * record" is one of them.
 *
 * Which session holds the record is decided by `v_exercise_prs`, not by
 * scanning the series here: the badge and the chart must never be able to
 * disagree (ADR-0004). Because that view crosses programs, the record may
 * belong to a session that isn't on this chart at all — in which case
 * nothing is flagged, which is the honest outcome.
 */
export function markRecords(
  points: ProgressionPoint[],
  prs: ExercisePrs | undefined,
): RecordMarkedPoint[] {
  return points.map((point) => ({
    ...point,
    isRecord: prs !== undefined && point.sessionId === prs.bestE1rmSessionId,
  }));
}
