"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { summaryHref } from "@/lib/daily-summary";
import {
  readSummaryAggregate,
  readSummaryMetric,
  SUMMARY_AGGREGATES,
  SUMMARY_FILTER_FORM_ID,
  SUMMARY_METRICS,
} from "@/lib/summary-charts";
import type { SummaryAggregate, SummaryCharts as Charts, SummaryMetric } from "@/types/adw";
import { ChartSkeleton } from "./ChartSkeleton";
import { SUMMARY_SELECT } from "./SummaryFilters";

// recharts runs in the browser only: neither prerender pass and no server
// render ever executes it, so it can never read the clock there. The server
// HTML carries the skeletons.
const RunDetailChart = dynamic(() => import("./RunDetailChart").then((m) => m.RunDetailChart), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const DailyAggregateChart = dynamic(
  () => import("./DailyAggregateChart").then((m) => m.DailyAggregateChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

interface SummaryChartsProps {
  charts: Charts;
  days: number;
  project: string | null;
  metric: SummaryMetric;
  agg: SummaryAggregate;
}

const LABEL = "flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-400";

/**
 * The summary's two charts and their selectors. The metric and the aggregate
 * change no data (every series is already in `charts`), so they are client
 * state: a change re-draws at once and is mirrored into the URL with
 * replaceState in the handler, never a navigation. Both selects join the
 * filter form (`form`), so applying a project or window keeps them.
 */
export function SummaryCharts({ charts, days, project, metric, agg }: SummaryChartsProps) {
  const [selectedMetric, setMetric] = useState(metric);
  const [selectedAgg, setAgg] = useState(agg);

  function select(next: { metric: SummaryMetric; agg: SummaryAggregate }) {
    setMetric(next.metric);
    setAgg(next.agg);
    window.history.replaceState(null, "", summaryHref({ days, project, ...next }));
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Runs</h2>
          <label className={LABEL}>
            Measure
            <select
              name="metric"
              form={SUMMARY_FILTER_FORM_ID}
              value={selectedMetric}
              onChange={(e) =>
                select({ metric: readSummaryMetric(e.target.value), agg: selectedAgg })
              }
              className={SUMMARY_SELECT}
            >
              {SUMMARY_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <RunDetailChart points={charts.points} days={charts.days} metric={selectedMetric} />
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Daily</h2>
          <label className={LABEL}>
            Aggregate
            <select
              name="agg"
              form={SUMMARY_FILTER_FORM_ID}
              value={selectedAgg}
              onChange={(e) =>
                select({ metric: selectedMetric, agg: readSummaryAggregate(e.target.value) })
              }
              className={SUMMARY_SELECT}
            >
              {SUMMARY_AGGREGATES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DailyAggregateChart chart={charts.aggregates[selectedAgg]} days={charts.days} />
      </section>
    </div>
  );
}
