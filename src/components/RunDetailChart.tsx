"use client";

import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import { costLabel, tokensLabel } from "@/lib/daily-summary";
import { formatDay } from "@/lib/format-date";
import { secondsLabel } from "@/lib/run-view";
import { STATUS_COLORS, type StatusKey } from "@/lib/status-colors";
import {
  dayTicks,
  pointsByClass,
  SUMMARY_METRIC_FIELD,
  SUMMARY_METRICS,
} from "@/lib/summary-charts";
import type { SummaryMetric, SummaryRunPoint } from "@/types/adw";

interface RunDetailChartProps {
  points: SummaryRunPoint[];
  days: string[];
  metric: SummaryMetric;
}

const AXIS = { stroke: "var(--chart-axis)", fontSize: 12 } as const;
const TICK = { fill: "var(--chart-axis)" } as const;

/** A metric value as its label: duration, tokens or dollars. */
function metricLabel(metric: SummaryMetric, value: number | null): string {
  if (metric === "duration") return secondsLabel(value) ?? "n/a";
  if (metric === "cost") return costLabel(value);
  return tokensLabel(value);
}

function statusClass(status: string): string {
  return Object.hasOwn(STATUS_COLORS, status)
    ? STATUS_COLORS[status as StatusKey].text
    : "text-neutral-600 dark:text-neutral-400";
}

/** The hover (or tap) card of one run: issue, adw_id, status, attempts, models, phases. */
function RunTooltip({
  active,
  payload,
  metric,
}: Partial<TooltipContentProps> & { metric: SummaryMetric }) {
  const point = active ? (payload?.[0]?.payload as SummaryRunPoint | undefined) : undefined;
  if (!point) return null;
  const label = SUMMARY_METRICS.find((m) => m.key === metric)?.label ?? metric;
  return (
    <div className="max-w-sm space-y-2 rounded-md border border-(--chart-tooltip-border) bg-(--chart-tooltip-bg) p-3 text-xs shadow-sm">
      <p className="font-medium">
        {point.issue_number === null
          ? "No issue"
          : `#${point.issue_number} ${point.issue_title ?? ""}`}
      </p>
      <p className="text-neutral-500 dark:text-neutral-400">
        <code>{point.adw_id}</code> · {point.display_name} ·{" "}
        <span className={statusClass(point.status)}>{point.status}</span> · {formatDay(point.day)}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
        <dd className="tabular-nums">{metricLabel(metric, point[SUMMARY_METRIC_FIELD[metric]])}</dd>
        <dt className="text-neutral-500 dark:text-neutral-400">Attempts</dt>
        <dd className="tabular-nums">{point.attempts ?? "n/a"}</dd>
        <dt className="text-neutral-500 dark:text-neutral-400">Models</dt>
        <dd>{point.models.length > 0 ? point.models.join(", ") : "none recorded"}</dd>
      </dl>
      {point.phases.length > 0 && (
        <table className="w-full text-left tabular-nums">
          <thead className="text-neutral-500 dark:text-neutral-400">
            <tr>
              <th className="pr-2 font-normal">Phase</th>
              <th className="pr-2 font-normal">Time</th>
              <th className="pr-2 font-normal">In / out</th>
              <th className="pr-2 font-normal">Cost</th>
              <th className="font-normal">Models</th>
            </tr>
          </thead>
          <tbody>
            {point.phases.map((phase, i) => (
              <tr key={`${phase.phase}-${i}`}>
                <td className="pr-2">{phase.phase}</td>
                <td className="pr-2">{secondsLabel(phase.duration_s)}</td>
                <td className="pr-2">
                  {tokensLabel(phase.tokens_in)} / {tokensLabel(phase.tokens_out)}
                </td>
                <td className="pr-2">{costLabel(phase.cost_usd)}</td>
                <td>{phase.models.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * One mark per finished run, x its UTC day (spread inside the day), y the
 * selected metric, coloured by issue class. Clicking a mark opens the run's
 * project page. Rendered only in the browser (SummaryCharts loads it with
 * ssr: false); it reads no clock.
 */
export function RunDetailChart({ points, days, metric }: RunDetailChartProps) {
  const router = useRouter();
  const { classes, missing } = pointsByClass(points, metric);
  const label = SUMMARY_METRICS.find((m) => m.key === metric)?.label ?? metric;

  if (points.length === 0) {
    return (
      <p className="flex h-72 items-center justify-center rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        No finished runs in this window.
      </p>
    );
  }

  return (
    <figure
      aria-label={`${points.length} runs over ${days.length} days, y: ${label}`}
      className="space-y-1"
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart accessibilityLayer margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--chart-grid)" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[-0.5, days.length - 0.5]}
              ticks={dayTicks(days)}
              tickFormatter={(i: number) => {
                const day = days[i];
                return day === undefined ? "" : formatDay(day).slice(0, 5);
              }}
              {...AXIS}
              tick={TICK}
            />
            <YAxis
              type="number"
              dataKey={SUMMARY_METRIC_FIELD[metric]}
              name={label}
              tickFormatter={(value: number) => metricLabel(metric, value)}
              width={64}
              {...AXIS}
              tick={TICK}
            />
            <Tooltip
              cursor={false}
              content={(props) => <RunTooltip {...props} metric={metric} />}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {classes.map((c) => (
              <Scatter
                key={c.key}
                name={c.key}
                data={c.points}
                fill={c.color}
                isAnimationActive={false}
                cursor="pointer"
                onClick={(item) => {
                  const point = item.payload as SummaryRunPoint | undefined;
                  if (point) router.push(`/projects/${point.slug}`);
                }}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {missing > 0 && (
        <figcaption className="text-xs text-neutral-500 dark:text-neutral-400">
          {missing === 1
            ? "1 run has no metrics and is not shown for this measure."
            : `${missing} runs have no metrics and are not shown for this measure.`}
        </figcaption>
      )}
    </figure>
  );
}
