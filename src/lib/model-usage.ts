// The model side of the summary page's day cards, pure: a model id's family
// and short name, and one day's adw.daily_model_summary rows summed per model.
// No clock, no cache, no IO; tested in src/lib/model-usage.test.ts.
import type { DailyModelSummary, SummaryModel } from "@/types/adw";

export type ModelFamily = "opus" | "sonnet" | "haiku" | "other";

const FAMILIES = ["opus", "sonnet", "haiku"] as const;

const SHORT_NAMES: Record<Exclude<ModelFamily, "other">, string> = {
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
};

/** The first of opus, sonnet and haiku the id contains (case-insensitive), else "other". */
export function modelFamily(model: string): ModelFamily {
  const id = model.toLowerCase();
  return FAMILIES.find((family) => id.includes(family)) ?? "other";
}

/**
 * The column label of a model: Opus, Sonnet or Haiku for the three families,
 * otherwise the id without a leading `claude-`, never empty ("unknown" for an
 * empty id).
 */
export function modelShortName(model: string): string {
  const family = modelFamily(model);
  if (family !== "other") return SHORT_NAMES[family];
  const name = model.startsWith("claude-") ? model.slice("claude-".length) : model;
  return name === "" ? "unknown" : name;
}

/**
 * One entry per distinct model id (so two versions of one family stay two
 * entries), every numeric column summed, `total` the four token columns added,
 * cost rounded to 4 decimals against float noise. Largest total first, then
 * model id. The caller filters by day and visible project. Never mutates its
 * input.
 */
export function sumModelUsage(rows: readonly DailyModelSummary[]): SummaryModel[] {
  const byModel = new Map<string, SummaryModel>();
  for (const row of rows) {
    const entry = byModel.get(row.model) ?? {
      model: row.model,
      runs: 0,
      input: 0,
      cache_read: 0,
      cache_creation: 0,
      output: 0,
      total: 0,
      cost_usd: 0,
    };
    entry.runs += row.runs;
    entry.input += row.input;
    entry.cache_read += row.cache_read;
    entry.cache_creation += row.cache_creation;
    entry.output += row.output;
    entry.total += row.input + row.cache_read + row.cache_creation + row.output;
    entry.cost_usd += row.cost_usd;
    byModel.set(row.model, entry);
  }
  return [...byModel.values()]
    .map((entry) => ({ ...entry, cost_usd: Math.round(entry.cost_usd * 1e4) / 1e4 }))
    .sort((a, b) => b.total - a.total || (a.model < b.model ? -1 : a.model > b.model ? 1 : 0));
}
