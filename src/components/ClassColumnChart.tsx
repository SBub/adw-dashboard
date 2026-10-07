import { CLASS_BG } from "@/lib/chart-colors";
import { classCounts } from "@/lib/daily-summary";
import type { DailySummary } from "@/types/adw";
import { ColumnChart } from "./ColumnChart";

interface ClassColumnChartProps {
  counts: Pick<DailySummary, "runs" | "features" | "bugs" | "chores" | "patches">;
  /** The card's day (`YYYY-MM-DD`), for the chart's ids. */
  day: string;
}

/** A day's runs by issue class, one column per class present. Nothing when there are no runs. */
export function ClassColumnChart({ counts, day }: ClassColumnChartProps) {
  const present = classCounts(counts);
  if (present.length === 0) return null;

  return (
    <ColumnChart
      title="Runs by class"
      idPrefix={`runs-by-class-${day}`}
      summary={`Runs by class: ${present.map(({ key, count }) => `${count} ${key}`).join(", ")}`}
      columns={present.map(({ key, count }) => ({
        key,
        value: count,
        valueLabel: String(count),
        name: <span className="font-mono">{key}</span>,
        ariaLabel: `${key}: ${count} ${count === 1 ? "run" : "runs"}`,
        colorClass: CLASS_BG[key],
      }))}
    />
  );
}
