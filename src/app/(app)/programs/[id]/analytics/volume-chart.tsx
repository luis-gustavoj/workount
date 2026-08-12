"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AXIS_PROPS,
  CHART,
  CHART_HEIGHT,
  NumbersDisclosure,
  TABLE_CLASS,
  TD_CLASS,
  TH_CLASS,
  TooltipCard,
} from "./chart-chrome";
import { axisTicks, shortDate, volumeDomainMax } from "@/lib/analytics/format";
import type { VolumePoint } from "@/lib/analytics/query";
// /history's rounding, deliberately reused rather than re-spelled: the same
// session must not read 1,830 kg on one screen and 1,829.5 kg on another.
import { roundVolume } from "@/lib/history/format";

/**
 * Volume per completed session (ticket 018, scope item 2), straight from
 * `get_program_volume` — which is itself a projection of `v_session_summary`,
 * so this chart and /history report the same number by construction.
 *
 * Bars, not a line: volume is a magnitude per session, so it keeps its zero
 * baseline. A warmup-only session is a real 0 and is drawn as one rather than
 * dropped — a hole in the chart would be a different lie.
 *
 * One series, so no legend: the section title says what is plotted.
 */

type Datum = {
  label: string;
  volume: number;
  workoutName: string | null;
  sessionId: string;
};

export function VolumeChart({ points }: { points: VolumePoint[] }) {
  const t = useTranslations("Analytics");
  const locale = useLocale();

  const data: Datum[] = points.map((point) => ({
    label: shortDate(point.completedAt, locale),
    volume: roundVolume(point.volumeKg),
    workoutName: point.workoutName,
    sessionId: point.sessionId,
  }));
  const axisMax = volumeDomainMax(data.map((d) => d.volume));

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis {...AXIS_PROPS} dataKey="label" minTickGap={16} />
          <YAxis
            {...AXIS_PROPS}
            width={44}
            domain={[0, axisMax]}
            ticks={axisTicks(0, axisMax)}
            tickFormatter={(value: number) => value.toLocaleString(locale)}
          />
          <Tooltip
            cursor={{ fill: CHART.grid, fillOpacity: 0.3 }}
            content={<VolumeTooltip />}
          />
          {/* A warmup-only session is volume 0, and a 0 draws no bar at all —
              which would make a session that happened look like a session that
              didn't, the very hole 0006_analytics.sql refuses to leave. It gets
              a 2px stub on the baseline instead: unmistakably not one of the
              1,500kg bars beside it, and unmistakably there. */}
          <Bar
            dataKey="volume"
            fill={CHART.secondary}
            maxBarSize={24}
            minPointSize={(value: number | null | undefined) =>
              value === 0 ? 2 : 0
            }
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>

      <NumbersDisclosure label={t("showNumbers")}>
        <table className={TABLE_CLASS}>
          <thead>
            <tr>
              <th className={TH_CLASS}>{t("dateColumn")}</th>
              <th className={TH_CLASS}>{t("workoutColumn")}</th>
              <th className={TH_CLASS}>{t("volumeColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.sessionId}>
                <td className={TD_CLASS}>
                  <Link
                    href={`/history/${point.sessionId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {shortDate(point.completedAt, locale)}
                  </Link>
                </td>
                <td className={TD_CLASS}>
                  {point.workoutName ?? t("deletedWorkout")}
                </td>
                <td className={`${TD_CLASS} font-mono`}>
                  {t("kgValue", { value: roundVolume(point.volumeKg) })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </NumbersDisclosure>
    </div>
  );
}

function VolumeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Datum }>;
}) {
  const t = useTranslations("Analytics");
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <TooltipCard
      title={point.label}
      rows={[
        {
          label: point.workoutName ?? t("deletedWorkout"),
          value: t("kgValue", { value: point.volume }),
          color: CHART.secondary,
        },
      ]}
    />
  );
}
