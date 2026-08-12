"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AXIS_PROPS,
  CHART,
  CHART_HEIGHT,
  EmptyNote,
  Legend,
  NumbersDisclosure,
  TABLE_CLASS,
  TD_CLASS,
  TH_CLASS,
  TooltipCard,
} from "./chart-chrome";
import {
  axisTicks,
  hasTrend,
  markRecords,
  roundE1rm,
  shortDate,
  weightDomain,
} from "@/lib/analytics/format";
import type { ExercisePrs, ProgressionPoint } from "@/lib/analytics/query";

/**
 * Per-exercise strength progression (ticket 018, scope item 1) — the chart
 * that actually answers "am I getting stronger?".
 *
 * It plots **estimated 1RM**, with the top-set weight as a second, recessive
 * line. Raw weight alone would lie: dropping from 100 × 5 to 105 × 2 reads as
 * progress and isn't (CONTEXT.md). Both series are kilograms, so they share
 * one y-axis — a second scale would invent a relationship between them.
 *
 * Every number here is `get_exercise_progression`'s (0006_analytics.sql).
 * Nothing is derived from sets in this file.
 */

type Datum = {
  /** The session's completion time, in epoch ms — the x position. Named `at`
   *  rather than `t` so it never reads as the translation function. */
  at: number;
  e1rm: number;
  topWeight: number;
  topReps: number;
  isRecord: boolean;
  sessionId: string;
};

export function ProgressionChart({
  points,
  prs,
}: {
  points: ProgressionPoint[];
  prs: ExercisePrs | undefined;
}) {
  const t = useTranslations("Analytics");
  const locale = useLocale();

  if (points.length === 0) {
    return (
      <EmptyNote
        title={t("neverPerformedTitle")}
        body={t("neverPerformedBody")}
      />
    );
  }

  const marked = markRecords(points, prs);
  const data: Datum[] = marked.map((point) => ({
    at: new Date(point.completedAt).getTime(),
    e1rm: point.e1rmKg,
    topWeight: point.topSetWeightKg,
    topReps: point.topSetReps,
    isRecord: point.isRecord,
    sessionId: point.sessionId,
  }));
  const domain = weightDomain(data.flatMap((d) => [d.e1rm, d.topWeight]));
  const latest = marked[marked.length - 1];
  const showsRecord = data.some((d) => d.isRecord);

  return (
    <div className="flex flex-col gap-4">
      {/* The one number the section exists to report, stated before the
          chart — a reader who only glances gets an answer. */}
      <div>
        <p className="text-[0.6875rem] tracking-[0.06em] text-ink-muted uppercase">
          {t("latestE1rmLabel")}
        </p>
        <p className="font-mono text-[1.25rem] leading-tight font-medium">
          {t("kgValue", { value: roundE1rm(latest.e1rmKg) })}
        </p>
        <p className="text-xs text-ink-muted">
          {t("latestE1rmFrom", {
            weight: latest.topSetWeightKg,
            reps: latest.topSetReps,
          })}
        </p>
      </div>

      {hasTrend(data.length) ? (
        <div className="flex flex-col gap-2">
          <Legend
            label={t("legendLabel")}
            items={[
              { label: t("e1rmSeries"), color: CHART.primary },
              {
                label: t("topSetSeries"),
                color: CHART.secondary,
                dashed: true,
              },
              ...(showsRecord
                ? [
                    {
                      label: t("recordMarker"),
                      color: CHART.record,
                      round: true,
                    },
                  ]
                : []),
            ]}
          />
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              {/* A time axis, not one slot per session: a three-week gap in
                  training must look like a gap. */}
              <XAxis
                {...AXIS_PROPS}
                dataKey="at"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                minTickGap={32}
                tickFormatter={(value: number) =>
                  shortDate(new Date(value).toISOString(), locale)
                }
              />
              <YAxis
                {...AXIS_PROPS}
                domain={domain}
                ticks={axisTicks(domain[0], domain[1])}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: CHART.grid }}
                content={<ProgressionTooltip locale={locale} />}
              />
              <Line
                type="monotone"
                dataKey="topWeight"
                stroke={CHART.secondary}
                strokeWidth={2}
                strokeDasharray="4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: CHART.secondary,
                  stroke: CHART.surface,
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="e1rm"
                stroke={CHART.primary}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={<ProgressionDot />}
                activeDot={{
                  r: 5,
                  fill: CHART.primary,
                  stroke: CHART.surface,
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyNote title={t("notEnoughTitle")} body={t("notEnoughBody")} />
      )}

      <NumbersDisclosure label={t("showNumbers")}>
        <table className={TABLE_CLASS}>
          <thead>
            <tr>
              <th className={TH_CLASS}>{t("dateColumn")}</th>
              <th className={TH_CLASS}>{t("topSetSeries")}</th>
              <th className={TH_CLASS}>{t("e1rmSeries")}</th>
            </tr>
          </thead>
          <tbody>
            {marked.map((point) => (
              <tr key={point.sessionId}>
                <td className={TD_CLASS}>
                  <Link
                    href={`/history/${point.sessionId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {shortDate(point.completedAt, locale)}
                  </Link>
                </td>
                <td className={`${TD_CLASS} font-mono`}>
                  {t("setValue", {
                    weight: point.topSetWeightKg,
                    reps: point.topSetReps,
                  })}
                </td>
                <td className={`${TD_CLASS} font-mono`}>
                  {t("kgValue", { value: roundE1rm(point.e1rmKg) })}
                  {point.isRecord && (
                    <span className="ml-2 text-[0.6875rem] tracking-[0.06em] text-signal uppercase">
                      {t("recordMarker")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </NumbersDisclosure>
    </div>
  );
}

/**
 * The e1RM dot. Signal on the session that holds the record — which
 * `v_exercise_prs` decides, not this chart — and ink everywhere else. Both
 * carry a 2px ring in the page colour so they stay legible where the two
 * lines cross.
 */
function ProgressionDot(props: { cx?: number; cy?: number; payload?: Datum }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return <g />;
  const isRecord = payload?.isRecord ?? false;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={isRecord ? 5 : 4}
      fill={isRecord ? CHART.record : CHART.primary}
      stroke={CHART.surface}
      strokeWidth={2}
    />
  );
}

function ProgressionTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: Array<{ payload: Datum }>;
  locale?: string;
}) {
  const t = useTranslations("Analytics");
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <TooltipCard
      title={shortDate(new Date(point.at).toISOString(), locale ?? "en")}
      rows={[
        {
          label: t("e1rmSeries"),
          value: t("kgValue", { value: roundE1rm(point.e1rm) }),
          color: point.isRecord ? CHART.record : CHART.primary,
        },
        {
          label: t("topSetSeries"),
          value: t("setValue", {
            weight: point.topWeight,
            reps: point.topReps,
          }),
          color: CHART.secondary,
          dashed: true,
        },
      ]}
    />
  );
}
