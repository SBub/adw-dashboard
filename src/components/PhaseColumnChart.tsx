import { PHASE_BG } from "@/lib/chart-colors";
import { tokensLabel } from "@/lib/daily-summary";
import { costLabel } from "@/lib/run-view";
import { phaseName } from "@/lib/phase-usage";
import { secondsLabel } from "@/lib/run-view";
import type { SummaryPhase } from "@/types/adw";
import { ColumnChart } from "./ColumnChart";

interface PhaseColumnChartProps {
  phases: SummaryPhase[];
  /** The card's day (`YYYY-MM-DD`), for the chart's ids. */
  day: string;
}

/**
 * A day's cost by pipeline phase, one column per phase in sumPhaseUsage's
 * pipeline order (Plan, Build, Test, Review, Document; CI has no cost and is
 * omitted), the cost on the bar and the phase name below; hover or focus
 * shows the four-way token split, the total time and the runs. With no phases
 * it keeps its caption and plot height and says so.
 */
export function PhaseColumnChart({ phases, day }: PhaseColumnChartProps) {
  return (
    <ColumnChart
      title="Cost by phase"
      subtitle="What each pipeline step cost that day"
      idPrefix={`cost-by-phase-${day}`}
      summary={
        phases.length === 0
          ? "Cost by phase: no per-phase usage published."
          : `Cost by phase: ${phases.map((p) => `${phaseName(p.phase)} ${costLabel(p.cost_usd)}`).join(", ")}`
      }
      empty="No per-phase usage published."
      columns={phases.map((p) => ({
        key: p.phase,
        value: p.cost_usd,
        valueLabel: costLabel(p.cost_usd),
        name: phaseName(p.phase),
        ariaLabel: `${phaseName(p.phase)}: ${costLabel(p.cost_usd)}`,
        colorClass: PHASE_BG[p.phase],
        detail: [
          { label: "Input", value: tokensLabel(p.input) },
          { label: "Cache read", value: tokensLabel(p.cache_read) },
          { label: "Cache write", value: tokensLabel(p.cache_creation) },
          { label: "Output", value: tokensLabel(p.output) },
          { label: "Time", value: secondsLabel(p.duration_s) },
          { label: "Runs", value: String(p.runs) },
        ],
      }))}
    />
  );
}
