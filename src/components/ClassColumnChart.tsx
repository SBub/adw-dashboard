import { CLASS_BG } from "@/lib/chart-colors";
import { classCounts, classLabel, shareLabel } from "@/lib/daily-summary";
import type { DailySummary } from "@/types/adw";
import { ColumnChart } from "./ColumnChart";

interface ClassColumnChartProps {
  counts: Pick<DailySummary, "runs" | "features" | "bugs" | "chores" | "patches">;
  /** The card's day (`YYYY-MM-DD`), for the chart's ids. */
  day: string;
}

/**
 * A day's runs by issue class, one column per class present, in classCounts'
 * fixed order; hover or focus shows the count and the share of the day's
 * runs. Nothing when there are no runs.
 */
export function ClassColumnChart({ counts, day }: ClassColumnChartProps) {
  const present = classCounts(counts);
  if (present.length === 0) return null;
  const total = present.reduce((sum, { count }) => sum + count, 0);

  return (
    <ColumnChart
      title="Work by class"
      subtitle="Runs finished that day"
      swatchClass={CLASS_BG["/feature"]}
      idPrefix={`runs-by-class-${day}`}
      summary={`Work by class: ${present.map(({ key, count }) => `${count} ${classLabel(key)}`).join(", ")}`}
      columns={present.map(({ key, count }) => ({
        key,
        value: count,
        valueLabel: String(count),
        name: classLabel(key),
        ariaLabel: `${classLabel(key)}: ${count} ${count === 1 ? "run" : "runs"}`,
        colorClass: CLASS_BG[key],
        detail: [
          { label: "Runs", value: String(count) },
          { label: "Share", value: shareLabel(count, total) },
        ],
      }))}
    />
  );
}
