import { MODEL_BG } from "@/lib/chart-colors";
import { tokensLabel } from "@/lib/daily-summary";
import { costLabel } from "@/lib/run-view";
import { modelFamily, modelShortName } from "@/lib/model-usage";
import type { SummaryModel } from "@/types/adw";
import { ColumnChart } from "./ColumnChart";

interface ModelColumnChartProps {
  models: SummaryModel[];
  /** The card's day (`YYYY-MM-DD`), for the chart's ids. */
  day: string;
}

/**
 * A day's tokens by model, one column per model id in sumModelUsage's
 * capability order (Haiku, Sonnet, Opus, then any other model), the total on
 * the bar and the short name below; hover or focus shows the full id, the
 * four-way split and the cost. With no models it keeps its caption and plot
 * height and says so.
 */
export function ModelColumnChart({ models, day }: ModelColumnChartProps) {
  return (
    <ColumnChart
      title="Tokens by model"
      subtitle="All tokens, including cache reads"
      idPrefix={`tokens-by-model-${day}`}
      summary={
        models.length === 0
          ? "Tokens by model: no per-model usage published."
          : `Tokens by model: ${models.map((m) => `${modelShortName(m.model)} ${tokensLabel(m.total)}`).join(", ")}`
      }
      empty="No per-model usage published."
      columns={models.map((m) => ({
        key: m.model,
        value: m.total,
        valueLabel: tokensLabel(m.total),
        name: modelShortName(m.model),
        ariaLabel: `${modelShortName(m.model)} (${m.model}): ${tokensLabel(m.total)} tokens`,
        colorClass: MODEL_BG[modelFamily(m.model)],
        detail: [
          { label: "Model", value: m.model },
          { label: "Input", value: tokensLabel(m.input) },
          { label: "Cache read", value: tokensLabel(m.cache_read) },
          { label: "Cache write", value: tokensLabel(m.cache_creation) },
          { label: "Output", value: tokensLabel(m.output) },
          { label: "Cost", value: costLabel(m.cost_usd) },
        ],
      }))}
    />
  );
}
