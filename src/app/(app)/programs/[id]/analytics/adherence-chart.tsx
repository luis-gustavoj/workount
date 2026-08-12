"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AXIS_PROPS,
  CHART,
  CHART_HEIGHT,
  Legend,
  NumbersDisclosure,
  TABLE_CLASS,
  TD_CLASS,
  TH_CLASS,
  TooltipCard,
} from "./chart-chrome";
import {
  adherencePercent,
  axisTicks,
  scheduledPerWeek,
  shortDate,
} from "@/lib/analytics/format";
import type { AdherenceWeek } from "@/lib/analytics/query";

/**
 * Completed vs scheduled per ISO week (ticket 018, scope item 4) — the honest
 * answer to "am I actually following this program", which is usually the real
 * reason progress stalled.
 *
 * `get_program_adherence` returns contiguous weeks, so a skipped week arrives
 * as a zero and is drawn as an empty slot rather than quietly closed up. The
 * scheduled count is constant across weeks (the program's current shape), so
 * it is one reference line instead of a second bar series — a target to clear,
 * which is what it is.
 *
 * Nothing here is capped at 100%: three sessions in a two-session week is
 * 150%, and flattening it would hide the extra session.
 */

type Datum = {
  weekLabel: string;
  dateLabel: string;
  completed: number;
  percent: number | null;
};

export function AdherenceChart({ weeks }: { weeks: AdherenceWeek[] }) {
  const t = useTranslations("Analytics");
  const locale = useLocale();

  const scheduled = scheduledPerWeek(weeks);
  const data: Datum[] = weeks.map((week, index) => ({
    weekLabel: t("weekShort", { number: index + 1 }),
    dateLabel: shortDate(week.weekStart, locale),
    completed: week.completedSessions,
    percent: adherencePercent(week.adherence),
  }));
  const axisMax = Math.max(scheduled, ...data.map((d) => d.completed), 1);

  return (
    <div className="flex flex-col gap-3">
      {scheduled === 0 && (
        <p className="text-sm text-ink-muted">{t("adherenceUnscheduled")}</p>
      )}

      <Legend
        label={t("legendLabel")}
        items={[
          { label: t("completedColumn"), color: CHART.secondary },
          ...(scheduled > 0
            ? [{ label: t("scheduledTarget"), color: CHART.axis, dashed: true }]
            : []),
        ]}
      />

      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis {...AXIS_PROPS} dataKey="weekLabel" minTickGap={8} />
          <YAxis
            {...AXIS_PROPS}
            width={28}
            allowDecimals={false}
            domain={[0, axisMax]}
            ticks={axisTicks(0, axisMax, 1)}
          />
          <Tooltip
            cursor={{ fill: CHART.grid, fillOpacity: 0.3 }}
            content={<AdherenceTooltip />}
          />
          {scheduled > 0 && (
            <ReferenceLine
              y={scheduled}
              stroke={CHART.axis}
              strokeDasharray="4 4"
            />
          )}
          <Bar
            dataKey="completed"
            fill={CHART.secondary}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>

      <NumbersDisclosure label={t("showNumbers")}>
        <table className={TABLE_CLASS}>
          <thead>
            <tr>
              <th className={TH_CLASS}>{t("weekColumn")}</th>
              <th className={TH_CLASS}>{t("completedColumn")}</th>
              <th className={TH_CLASS}>{t("adherenceColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((week) => (
              <tr key={week.dateLabel + week.weekLabel}>
                <td className={TD_CLASS}>
                  {week.weekLabel}
                  <span className="ml-2 text-ink-muted">{week.dateLabel}</span>
                </td>
                <td className={`${TD_CLASS} font-mono`}>{week.completed}</td>
                <td className={`${TD_CLASS} font-mono`}>
                  {week.percent === null
                    ? "—"
                    : t("percentValue", { value: week.percent })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </NumbersDisclosure>
    </div>
  );
}

function AdherenceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Datum }>;
}) {
  const t = useTranslations("Analytics");
  const week = payload?.[0]?.payload;
  if (!active || !week) return null;

  return (
    <TooltipCard
      title={`${week.weekLabel} · ${week.dateLabel}`}
      rows={[
        {
          label: t("completedColumn"),
          value: String(week.completed),
          color: CHART.secondary,
        },
        ...(week.percent === null
          ? []
          : [
              {
                label: t("adherenceColumn"),
                value: t("percentValue", { value: week.percent }),
              },
            ]),
      ]}
    />
  );
}
