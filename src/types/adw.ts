// Domain types. The interfaces in the first section mirror the database
// tables column for column (Project, Run, QueueItem, RunMetrics and the
// RunPhase entries of its phases column); keep them in lockstep with the
// schema. The second section holds what the data layer reads from a view or
// assembles for a screen, never a leaf component: ProjectSummary (the
// project_summaries view), DailySummary (the daily_summary view, column for
// column) and the summary page's report (assembled by toSummaryReport in
// src/lib/daily-summary.ts, its charts by toSummaryCharts in
// src/lib/summary-charts.ts).
// Runs and queue items have
// no view model; the screens render Run and QueueItem rows as stored (the
// clock-dependent labels are removed pending issue #3).

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
  note: string | null;
  updated_at: string;
}

/** The run_metrics gate_outcome check constraint. */
export type GateOutcome = "merged" | "declined" | "held" | "failed" | "none";

/** One model's share of a phase: fresh input, cache read and creation, output and cost. */
export interface RunPhaseModelUsage {
  input: number;
  cache_read: number;
  cache_creation: number;
  output: number;
  cost_usd: number;
}

/** One entry of run_metrics.phases (jsonb), as the toolkit publishes it. */
export interface RunPhase {
  phase: string;
  started_at: string;
  finished_at: string;
  duration_s: number;
  tokens_in: number;
  tokens_cache_read: number;
  tokens_cache_creation: number;
  tokens_out: number;
  cost_usd: number;
  calls: number;
  /** Absent on rows published before the per-model change. */
  models?: Record<string, RunPhaseModelUsage>;
}

/**
 * One row of adw.run_metrics: a finished run's tokens, cost and phases, keyed
 * by (project_id, adw_id) like the run. PostgREST returns the numeric
 * cost_usd and the bigint token counts as JSON numbers.
 */
export interface RunMetrics {
  project_id: string;
  adw_id: string;
  tokens_in: number;
  tokens_out: number;
  tokens_cache_read: number;
  tokens_cache_creation: number;
  cost_usd: number;
  attempts: number;
  gate_outcome: GateOutcome;
  phases: RunPhase[];
  plan_lines: number | null;
  diff_added: number | null;
  diff_removed: number | null;
  diff_files: number | null;
  computed_at: string;
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
 * column for column with the view. `runs` counts every finished status, so
 * `runs - completed - failed` is `halted` (and any future status), and
 * `runs - features - bugs - chores - patches` is the runs with no known
 * issue class. The token and cost medians are over the runs that published
 * metrics (adw.run_metrics) and are null when none did.
 */
export interface DailySummary {
  project_id: string;
  day: string;
  runs: number;
  completed: number;
  failed: number;
  halted: number;
  features: number;
  bugs: number;
  chores: number;
  patches: number;
  median_duration_s: number | null;
  tokens_in_sum: number;
  tokens_in_median: number | null;
  tokens_out_sum: number;
  tokens_out_median: number | null;
  cost_usd_sum: number;
  cost_usd_median: number | null;
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
 * One UTC day of the summary. `totals` adds counts and sums across the day's
 * projects; a median is the single project's exact value when exactly one
 * project contributed and null otherwise (a median of medians is never shown).
 */
export interface SummaryDay {
  day: string;
  totals: Omit<DailySummary, "project_id">;
  projects: SummaryProjectDay[];
}

/**
 * The summary page's model. `from` and `to` bound the window (both
 * `YYYY-MM-DD`, `to` the newest day in the view for the selection), null when
 * the view has no row for it. `project` is the filtered project or null for
 * all; `projects` every project the filter can offer; `rows` newest day first.
 */
export interface SummaryReport {
  from: string | null;
  to: string | null;
  days: number;
  project: SummaryProject | null;
  projects: SummaryProject[];
  rows: SummaryDay[];
  charts: SummaryCharts;
}

/** The run detail chart's selectable y axis (`?metric`). */
export type SummaryMetric = "duration" | "tokens_in" | "tokens_out" | "cost";

/** The daily aggregate chart's selection (`?agg`). */
export type SummaryAggregate = "runs" | "classes" | "duration" | "tokens" | "cost";

/** The issue classes the charts colour by; "other" is a missing or unknown class. */
export type ClassKey = "/feature" | "/bug" | "/chore" | "/patch" | "other";

/** One phase of a run as the run chart's tooltip lists it. */
export interface SummaryRunPhase {
  phase: string;
  duration_s: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  models: string[];
}

/**
 * One finished run as a mark of the run detail chart. `day` is the UTC day of
 * finished_at and `x` its position on the day axis (the day's index plus a
 * deterministic offset inside the day). Tokens, cost and attempts are null
 * when the run has no run_metrics row. `status` is a string: a finished run
 * can be halted, which RunStatus does not list.
 */
export interface SummaryRunPoint {
  adw_id: string;
  slug: string;
  display_name: string;
  issue_number: number | null;
  issue_title: string | null;
  issue_class: ClassKey;
  status: string;
  day: string;
  x: number;
  duration_s: number;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  attempts: number | null;
  models: string[];
  phases: SummaryRunPhase[];
}

/** One series of an aggregate chart: the row field it reads, its legend label, its stack and fill. */
export interface SummaryAggregateSeries {
  key: string;
  label: string;
  stack: string | null;
  color: string;
}

/** One day of an aggregate chart: its axis position, its day and one value per series key. */
export type SummaryAggregateRow = { x: number; day: string } & Record<
  string,
  number | string | null
>;

/** One daily aggregate chart, ready to draw: its series, one row per axis day, and its unit. */
export interface SummaryAggregateChart {
  series: SummaryAggregateSeries[];
  rows: SummaryAggregateRow[];
  unit: "count" | "percent" | "seconds" | "tokens" | "usd";
}

/** Everything the summary's two charts draw, shaped by toSummaryCharts. */
export interface SummaryCharts {
  /** Every UTC day of the window, oldest first; empty days included. */
  days: string[];
  points: SummaryRunPoint[];
  aggregates: Record<SummaryAggregate, SummaryAggregateChart>;
}
