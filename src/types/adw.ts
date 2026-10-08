// Domain types. The three interfaces in the first section mirror the database
// tables column for column; keep them in lockstep with the schema. The second
// section holds what the data layer reads from a view or assembles for a
// screen, never a leaf component: ProjectSummary (the project_summaries view),
// DailySummary (the daily_summary columns the page reads), DailyModelSummary
// (the daily_model_summary columns), DailyPhaseSummary (the
// daily_phase_summary columns), RunMetrics (the run_metrics columns the
// History page reads) and the summary page's report (assembled by
// toSummaryReport in src/lib/daily-summary.ts).
// Runs and queue items have
// no view model; the screens render Run and QueueItem rows as stored (the
// clock-dependent labels are removed pending issue #3).

import type { PhaseKey } from "@/lib/phase-usage";

// ---------------------------------------------------------------------------
// Database rows
// ---------------------------------------------------------------------------

export type RunStatus = "running" | "completed" | "failed";

export interface Project {
  id: string;
  slug: string;
  display_name: string;
  repo_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Run {
  project_id: string;
  adw_id: string;
  issue_number: number | null;
  issue_title: string | null;
  issue_class: string | null;
  branch_name: string | null;
  phase: string | null;
  status: RunStatus;
  state: Record<string, unknown>;
  toolkit_version: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
}

/** The queue_items state check constraint (the toolkit's queue_ops STATE_* values). */
export type QueueState =
  | "queued"
  | "running"
  | "merged"
  | "declined"
  | "conflict"
  | "held"
  | "failed"
  | "skipped"
  | "gated";

export interface QueueItem {
  project_id: string;
  issue_number: number;
  state: QueueState;
  source: string | null;
  position: number;
  issue_title: string | null;
  queued_at: string | null;
  adw_id: string | null;
  reason: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// View models: provided by the data layer, not stored in the database
// ---------------------------------------------------------------------------

/** A project plus the per-status counts, the queued count and last-run time the landing page shows. */
export interface ProjectSummary extends Project {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  last_run_at: string | null;
}

/**
 * One row of the adw.daily_summary view: one project's finished runs on one
 * UTC calendar day (`day` is `YYYY-MM-DD`, the day of runs.finished_at),
 * the columns the summary page reads from the view. `runs` counts every
 * finished status, so `runs - completed - failed` is any future status (0
 * today), and `runs - features - bugs - chores - patches` is the runs with no
 * known issue class. `duration_sum_s` is the sum of the finished runs'
 * wall-clock durations in seconds. The token and cost sums are over the runs
 * that published metrics (adw.run_metrics) and are 0 when none did.
 * `tokens_in_sum` is fresh (uncached) input only since the toolkit's four-way
 * split; `tokens_cache_read_sum` is the cached prompt read, the large figure.
 */
export interface DailySummary {
  project_id: string;
  day: string;
  runs: number;
  completed: number;
  failed: number;
  features: number;
  bugs: number;
  chores: number;
  patches: number;
  duration_sum_s: number;
  tokens_in_sum: number;
  tokens_cache_read_sum: number;
  tokens_out_sum: number;
  cost_usd_sum: number;
}

/**
 * The columns of one adw.run_metrics row the History page reads: one run's
 * total cost in US dollars. The table holds one row per run (keyed by
 * project_id and adw_id) with tokens and a per-phase breakdown too; a run
 * that published no metrics has no row.
 */
export interface RunMetrics {
  adw_id: string;
  cost_usd: number;
}

/**
 * One row of the adw.daily_model_summary view: one project's usage of one
 * model (`model` is the id, such as `claude-opus-4-1-20250805`) on one UTC
 * calendar day. Unlike DailySummary, `day` is the day of runs.started_at, not
 * finished_at, so a run spanning midnight UTC lands on different days in the
 * two views. The four token columns are the toolkit's split (fresh input,
 * cache read, cache creation, output); `runs` counts the runs that used the
 * model. Runs that published no per-model metrics are absent.
 */
export interface DailyModelSummary {
  project_id: string;
  day: string;
  model: string;
  runs: number;
  input: number;
  cache_read: number;
  cache_creation: number;
  output: number;
  cost_usd: number;
}

/**
 * One row of the adw.daily_phase_summary view: one project's usage of one
 * pipeline phase (`phase` is the toolkit's step key, such as `adw_plan_iso`)
 * on one UTC calendar day. Like DailySummary, and unlike DailyModelSummary,
 * `day` is the day of runs.finished_at, so the phases line up with the day's
 * run counts; unfinished runs are absent. The four token columns are the
 * toolkit's split, `duration_s` the summed phase time in seconds, `runs` the
 * runs that had the phase. Runs that published no per-phase metrics are
 * absent.
 */
export interface DailyPhaseSummary {
  project_id: string;
  day: string;
  phase: string;
  runs: number;
  input: number;
  cache_read: number;
  cache_creation: number;
  output: number;
  cost_usd: number;
  duration_s: number;
}

/** A project as the summary page names it: its slug and display name. */
export interface SummaryProject {
  slug: string;
  display_name: string;
}

/** One project's row of one day, named for the per-project breakdown. */
export interface SummaryProjectDay extends DailySummary {
  slug: string;
  display_name: string;
}

/**
 * One model's usage on one day, summed over the visible projects
 * (sumModelUsage in src/lib/model-usage.ts). `total` adds the four token
 * columns.
 */
export interface SummaryModel {
  model: string;
  runs: number;
  input: number;
  cache_read: number;
  cache_creation: number;
  output: number;
  total: number;
  cost_usd: number;
}

/**
 * One pipeline phase's usage on one day, summed over the visible projects
 * (sumPhaseUsage in src/lib/phase-usage.ts).
 */
export interface SummaryPhase {
  phase: PhaseKey;
  runs: number;
  input: number;
  cache_read: number;
  cache_creation: number;
  output: number;
  cost_usd: number;
  duration_s: number;
}

/**
 * One UTC day of the summary. `totals` adds every count and every sum across
 * the day's projects. `models` is the day's usage per model summed over the
 * visible projects, largest total first; empty when no run of that day
 * published per-model metrics. `phases` is the day's usage per pipeline phase
 * summed over the visible projects, in pipeline order; empty when no run of
 * that day published per-phase metrics.
 */
export interface SummaryDay {
  day: string;
  totals: Omit<DailySummary, "project_id">;
  projects: SummaryProjectDay[];
  models: SummaryModel[];
  phases: SummaryPhase[];
}

/**
 * The summary page's model. `from` and `to` bound the window (both
 * `YYYY-MM-DD`, `to` the newest day in the view), null when the view has no
 * row. `rows` newest day first.
 */
export interface SummaryReport {
  from: string | null;
  to: string | null;
  days: number;
  rows: SummaryDay[];
}
