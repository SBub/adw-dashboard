"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { costLabel, tokensLabel } from "@/lib/daily-summary";
import { formatDay } from "@/lib/format-date";
import { secondsLabel } from "@/lib/run-view";
import { dayTicks } from "@/lib/summary-charts";
import type { SummaryAggregateChart } from "@/types/adw";

interface DailyAggregateChartProps {
  chart: SummaryAggregateChart;
  days: string[];
}

const AXIS = { stroke: "var(--chart-axis)", fontSize: 12 } as const;
const TICK = { fill: "var(--chart-axis)" } as const;

/** A value in the chart's unit as its label. */
function unitLabel(unit: SummaryAggregateChart["unit"], value: number): string {
  switch (unit) {
    case "count":
      return String(value);
    case "percent":
      return `${Math.round(value)}%`;
    case "seconds":
      return secondsLabel(value) ?? "n/a";
    case "tokens":
      return tokensLabel(value);
    case "usd":
      return costLabel(value);
  }
}

/**
 * One daily aggregate: one bar group per axis day, one Bar per series of the
 * chart, stacked by the series' stack (tokens: in and out side by side;
 * duration: one unstacked bar per project, never a combined median). Every
 * value is precomputed by toSummaryCharts; this only draws. Rendered only in
 * the browser (SummaryCharts loads it with ssr: false); it reads no clock.
 */
export function DailyAggregateChart({ chart, days }: DailyAggregateChartProps) {
  if (chart.rows.length === 0 || chart.series.length === 0) {
    return (
      <p className="flex h-72 items-center justify-center rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        Nothing to chart in this window.
      </p>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer
          data={chart.rows}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        >
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="x"
            ticks={dayTicks(days)}
            interval={0}
            tickFormatter={(i: number) => {
              const day = days[i];
              return day === undefined ? "" : formatDay(day).slice(0, 5);
            }}
            {...AXIS}
            tick={TICK}
          />
          <YAxis
            domain={chart.unit === "percent" ? [0, 100] : undefined}
            tickFormatter={(value: number) => unitLabel(chart.unit, value)}
            width={64}
            {...AXIS}
            tick={TICK}
          />
          <Tooltip
            cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.4 }}
            contentStyle={{
              background: "var(--chart-tooltip-bg)",
              border: "1px solid var(--chart-tooltip-border)",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelFormatter={(i) => {
              const day = typeof i === "number" ? days[i] : undefined;
              return day === undefined ? "" : formatDay(day);
            }}
            formatter={(value) =>
              typeof value === "number" ? unitLabel(chart.unit, value) : String(value)
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {chart.series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={s.stack ?? undefined}
              fill={s.color}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
