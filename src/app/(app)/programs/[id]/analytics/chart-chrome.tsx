"use client";

import type { ReactNode } from "react";

/**
 * The shared chrome for the four analytics charts (ticket 018) — colours,
 * axis styling, the tooltip card, the table-view disclosure, and the empty
 * note. One file so the charts read as one system rather than four unrelated
 * pictures.
 *
 * ---------------------------------------------------------------------------
 * Colour
 * ---------------------------------------------------------------------------
 * The charts are achromatic, which is DESIGN.md's whole idea and not a
 * shortcut: the chassis carries no colour so the single azure `signal` stays
 * findable, and it marks exactly three things — the active set, the running
 * timer, and a record. A chart is not live, so its marks are ink; the one
 * exception is the point holding a personal record, which is the third thing
 * on that list.
 *
 * Series are told apart by lightness plus a second, non-colour channel (a
 * dashed stroke, a legend key, a direct readout, and the table view below
 * every chart) — never by hue alone. Checked with the dataviz palette
 * validator rather than by eye, at the surfaces DESIGN.md specifies:
 *
 *   dark  ink #f5f5f5 ↔ ink-faint #808080  ΔE 37.0 · signal #17a5fe ↔ ink 32.1
 *   light ink #121212 ↔ ink-faint #7a7a7a  ΔE 39.7 · signal #006eaf ↔ ink 36.3
 *
 * all far above the ΔE 15 normal-vision floor and stable under deutan/protan/
 * tritan simulation (an achromatic pair is CVD-invariant by construction).
 * The validator's chroma-floor and lightness-band checks FAIL by design here:
 * both assume a chromatic categorical palette, and this system's neutrals are
 * chroma exactly 0 in both themes.
 *
 * Values are CSS variables rather than hex so every mark follows the theme
 * (and the `.dark` class) without a second palette in JavaScript.
 */
export const CHART = {
  /** The series the reader is here for. */
  primary: "var(--ink)",
  /** Context beside it — the top set under the e1RM line, every bar. */
  secondary: "var(--ink-faint)",
  /** A record. The only chromatic mark in any chart. */
  record: "var(--signal)",
  /** Hairline grid and axis rules, one step off the surface. */
  grid: "var(--line)",
  /** Axis ticks and other chart text. */
  axis: "var(--ink-muted)",
  /** The ring around dots and the gap between marks — the page's own colour. */
  surface: "var(--bg)",
} as const;

/** Every axis in every chart: recessive ticks, no tick marks, a hairline rule. */
export const AXIS_PROPS = {
  tick: { fill: CHART.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
  stroke: CHART.grid,
} as const;

/** 200px of plot is about as much vertical as a 390px screen can spare with
 *  four sections stacked on it, and enough to read a trend. */
export const CHART_HEIGHT = 200;

/**
 * The hover/focus readout. Values lead and wear ink; the series name follows
 * in muted text with a short stroke of its own colour as the key — a tooltip
 * is too dense for filled swatches (dataviz: line keys, not boxes).
 */
export function TooltipCard({
  title,
  rows,
}: {
  title: string;
  // A row without a colour is a derived reading rather than a plotted series
  // — adherence's percentage beside its session count — so it gets no key.
  rows: Array<Partial<SeriesKey> & { label: string; value: string }>;
}) {
  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2 shadow-none">
      {/* A date, not machine state — so it stays sentence case. Uppercase
          micro-text is for units and status words (DESIGN.md). */}
      <p className="text-xs text-ink-muted">{title}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-baseline gap-2">
            {row.color && <LineKey color={row.color} dashed={row.dashed} />}
            <span className="font-mono text-sm text-ink">{row.value}</span>
            <span className="text-xs text-ink-muted">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * How one series is keyed wherever it is named: its colour, and whether it is
 * drawn as a dashed stroke or a dot. The legend and the tooltip both carry
 * these three, which is why they are one type rather than four loose props.
 */
export type SeriesKey = {
  color: string;
  /** Matches a dashed line on the chart — the second, non-colour channel. */
  dashed?: boolean;
  /** A dot rather than a stroke, for point markers like the record. */
  round?: boolean;
};

/** A 12×2px stroke in the series colour — the legend and tooltip's identity
 *  channel, so the text itself never has to wear the data colour. */
export function LineKey({ color, dashed = false, round = false }: SeriesKey) {
  if (round) {
    return (
      <span
        aria-hidden
        className="inline-block size-2 shrink-0 rounded-full"
        style={{ background: color }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-block h-0.5 w-3 shrink-0"
      style={
        dashed
          ? {
              backgroundImage: `repeating-linear-gradient(to right, ${color} 0 3px, transparent 3px 6px)`,
            }
          : { background: color }
      }
    />
  );
}

/** The legend, always present once a chart plots two things — the dependable
 *  identity channel, named so it is findable rather than merely visible. */
export function Legend({
  label,
  items,
}: {
  label: string;
  items: Array<SeriesKey & { label: string }>;
}) {
  return (
    <ul
      aria-label={label}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] tracking-[0.06em] text-ink-muted uppercase"
    >
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <LineKey color={item.color} dashed={item.dashed} round={item.round} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * The table view every chart ships with. A tooltip enhances, it never gates —
 * a value you can only reach by hovering is a value a keyboard or a
 * screen-reader user cannot reach at all. Native `<details>`, so it costs no
 * JavaScript and no layout when closed.
 */
export function NumbersDisclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="w-fit cursor-pointer list-none text-xs font-medium text-ink-muted">
        {label}
      </summary>
      <div className="mt-3 overflow-x-auto">{children}</div>
    </details>
  );
}

/** Rules, not cards (DESIGN.md): the table is hairlines and space. */
export const TABLE_CLASS = "w-full text-left text-xs";
export const TH_CLASS =
  "text-ink-muted border-b border-line pb-1.5 pr-3 text-[0.6875rem] font-medium tracking-[0.06em] uppercase last:pr-0";
export const TD_CLASS = "border-b border-line py-1.5 pr-3 last:pr-0";

/**
 * The empty state, which is the *common* case for a new program — one session
 * and no trend. It teaches rather than apologising, and it never draws an
 * axis with nothing under it.
 *
 * Space and a sentence, not a bordered panel: DESIGN.md refuses cards, and a
 * box drawn around "come back in a few sessions" makes an ordinary state look
 * like an error.
 */
export function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1 py-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-ink-muted">{body}</p>
    </div>
  );
}
