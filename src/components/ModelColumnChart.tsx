import { MODEL_BG } from "@/lib/chart-colors";
import { tokensLabel } from "@/lib/daily-summary";
import { modelFamily, modelShortName } from "@/lib/model-usage";
import type { SummaryModel } from "@/types/adw";
import { ColumnChart } from "./ColumnChart";

interface ModelColumnChartProps {
  models: SummaryModel[];
  /** The card's day (`YYYY-MM-DD`), for the chart's ids. */
  day: string;
}

/**
 * A day's tokens by model, one column per model id, the total above and the
 * short name below; hover or focus shows the full id and the four-way split.
 * With no models it keeps its caption and height and says so.
 */
export function ModelColumnChart({ models, day }: ModelColumnChartProps) {
  return (
    <ColumnChart
      title="Tokens by model"
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
        ariaLabel: `${m.model}: ${tokensLabel(m.total)} tokens`,
        colorClass: MODEL_BG[modelFamily(m.model)],
        detail: [
          { label: "Model", value: m.model },
          { label: "Input", value: tokensLabel(m.input) },
          { label: "Cache read", value: tokensLabel(m.cache_read) },
          { label: "Cache creation", value: tokensLabel(m.cache_creation) },
          { label: "Output", value: tokensLabel(m.output) },
        ],
      }))}
    />
  );
}
