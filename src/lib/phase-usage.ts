// The phase side of the summary page's day cards, pure: the pipeline phases
// that cost money, their fixed order and display names, and one day's
// adw.daily_phase_summary rows summed per phase. No clock, no cache, no IO;
// tested in src/lib/phase-usage.test.ts. PHASE_ORDER is also the costed key
// list src/lib/run-phase.ts labels for run rows, so the keys are spelled once.
import type { DailyPhaseSummary, SummaryPhase } from "@/types/adw";

/**
 * The toolkit's costed step keys in pipeline order. `adw_ci_iso` is not one:
 * CI has no cost, so its rows are dropped, as is any key not listed here.
 */
export const PHASE_ORDER = [
  "adw_plan_iso",
  "adw_build_iso",
  "adw_test_iso",
  "adw_review_iso",
  "adw_document_iso",
] as const;

export type PhaseKey = (typeof PHASE_ORDER)[number];

const PHASE_NAMES: Record<PhaseKey, string> = {
  adw_plan_iso: "Plan",
  adw_build_iso: "Build",
  adw_test_iso: "Test",
  adw_review_iso: "Review",
  adw_document_iso: "Document",
};

/** The column label of a phase: Plan, Build, Test, Review or Document. */
export function phaseName(phase: PhaseKey): string {
  return PHASE_NAMES[phase];
}

function isPhaseKey(value: string): value is PhaseKey {
  return (PHASE_ORDER as readonly string[]).includes(value);
}

/**
 * One entry per known phase with at least one row (a phase with no rows is
 * omitted, a phase with rows is kept even at zero cost), every numeric column
 * summed, cost rounded to 4 decimals against float noise, in PHASE_ORDER.
 * `adw_ci_iso` and unknown keys are dropped. The caller filters by day and
 * visible project. Never mutates its input.
 */
export function sumPhaseUsage(rows: readonly DailyPhaseSummary[]): SummaryPhase[] {
  const byPhase = new Map<PhaseKey, SummaryPhase>();
  for (const row of rows) {
    if (!isPhaseKey(row.phase)) continue;
    const entry = byPhase.get(row.phase) ?? {
      phase: row.phase,
      runs: 0,
      input: 0,
      cache_read: 0,
      cache_creation: 0,
      output: 0,
      cost_usd: 0,
      duration_s: 0,
    };
    entry.runs += row.runs;
    entry.input += row.input;
    entry.cache_read += row.cache_read;
    entry.cache_creation += row.cache_creation;
    entry.output += row.output;
    entry.cost_usd += row.cost_usd;
    entry.duration_s += row.duration_s;
    byPhase.set(row.phase, entry);
  }
  return PHASE_ORDER.flatMap((phase) => {
    const entry = byPhase.get(phase);
    return entry ? [{ ...entry, cost_usd: Math.round(entry.cost_usd * 1e4) / 1e4 }] : [];
  });
}
