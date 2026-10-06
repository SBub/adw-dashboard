// Everything that shapes the /summary page's two charts, pure: the two
// client-side selections (`?metric`, `?agg`), the day axis, one point per
// finished run, every daily aggregate series and the per-model split. No
// clock (Date.parse on a stored timestamp is a parse, not a clock read), no
// cache, no IO, so every case is unit-tested with fixed inputs
// (src/lib/summary-charts.test.ts). The data boundary attaches the result of
// toSummaryCharts to the report (getDailySummary in src/data/index.ts); the
// chart components only pick a precomputed field by the selected key.
//
// The run marks are spread inside their day deterministically (by finish
// time, then adw_id), never randomly: the server and the browser agree, and
// the tests are exact.
import { CLASS_COLORS, modelColor, UNATTRIBUTED_COLOR } from "@/lib/class-colors";
import {
  addDays,
  classSegments,
  SUMMARY_DEFAULT_AGGREGATE,
  SUMMARY_DEFAULT_METRIC,
} from "@/lib/daily-summary";
import type {
  ClassKey,
  Run,
  RunMetrics,
  RunPhase,
  SummaryAggregate,
  SummaryAggregateChart,
  SummaryAggregateRow,
  SummaryAggregateSeries,
  SummaryCharts,
  SummaryMetric,
  SummaryProject,
  SummaryReport,
  SummaryRunPoint,
} from "@/types/adw";

/** A finished run as the summary reads it: the row with its run_metrics row embedded (or null). */
export type SummaryRun = Run & { run_metrics: RunMetrics | null };

/** The run chart's y axes, in selector order, with their labels. */
export const SUMMARY_METRICS: readonly { key: SummaryMetric; label: string }[] = [
  { key: "duration", label: "Duration" },
  { key: "tokens_in", label: "Tokens in" },
  { key: "tokens_out", label: "Tokens out" },
  { key: "cost", label: "Cost (USD)" },
];

/** The daily aggregate charts, in selector order, with their labels. */
export const SUMMARY_AGGREGATES: readonly { key: SummaryAggregate; label: string }[] = [
  { key: "runs", label: "Runs per day" },
  { key: "classes", label: "Class distribution" },
  { key: "duration", label: "Median duration" },
  { key: "tokens", label: "Tokens per day" },
  { key: "cost", label: "Cost per day" },
];

/** The id of the project and window form; the chart selectors join it through `form`. */
export const SUMMARY_FILTER_FORM_ID = "summary-filters";

/** The field of a run point each metric plots: the selectable metric mapping. */
export const SUMMARY_METRIC_FIELD: Record<
  SummaryMetric,
  "duration_s" | "tokens_in" | "tokens_out" | "cost_usd"
> = {
  duration: "duration_s",
  tokens_in: "tokens_in",
  tokens_out: "tokens_out",
  cost: "cost_usd",
};

/** The issue classes in chart order, with the field name an aggregate row uses for each. */
const CLASSES: readonly { key: ClassKey; field: string }[] = [
  { key: "/feature", field: "feature" },
  { key: "/bug", field: "bug" },
  { key: "/chore", field: "chore" },
  { key: "/patch", field: "patch" },
  { key: "other", field: "other" },
];

/** The width of a day band the run marks of one day spread over (of a day's 1). */
const BAND = 0.8;

const SECOND = 1000;

/** Rounds a dollar amount to 4 decimals against float noise, as the day totals do. */
function round4(usd: number): number {
  return Math.round(usd * 1e4) / 1e4;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The run chart's y axis from `?metric`: one of SUMMARY_METRICS's keys,
 * exactly; anything else (absent, repeated, empty, unknown, other case) is
 * SUMMARY_DEFAULT_METRIC. Never throws.
 */
export function readSummaryMetric(raw: string | string[] | undefined): SummaryMetric {
  return SUMMARY_METRICS.find((m) => m.key === raw)?.key ?? SUMMARY_DEFAULT_METRIC;
}

/**
 * The aggregate chart from `?agg`: one of SUMMARY_AGGREGATES's keys, exactly;
 * anything else is SUMMARY_DEFAULT_AGGREGATE. Never throws.
 */
export function readSummaryAggregate(raw: string | string[] | undefined): SummaryAggregate {
  return SUMMARY_AGGREGATES.find((a) => a.key === raw)?.key ?? SUMMARY_DEFAULT_AGGREGATE;
}

/**
 * Every calendar day from `from` to `to`, both included, oldest first, or no
 * day when either is null. Days without a run stay on the axis, so gaps show.
 */
export function summaryDayAxis(from: string | null, to: string | null): string[] {
  if (from === null || to === null) return [];
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * The indices of the day axis that carry a tick label: every day up to two
 * weeks, every seventh day (from the first) beyond, so a 90-day window stays
 * readable on a phone.
 */
export function dayTicks(days: readonly string[]): number[] {
  const step = days.length <= 14 ? 1 : 7;
  return days.map((_, i) => i).filter((i) => i % step === 0);
}

/**
 * The UTC calendar day (`YYYY-MM-DD`) of a stored timestamp, the day
 * adw.daily_summary counts a run on (date_trunc('day', finished_at at time
 * zone 'UTC')), whatever offset the string carries.
 */
export function runDay(iso: string): string {
  return new Date(Date.parse(iso)).toISOString().slice(0, 10);
}

/** Whole seconds from start to finish, clamped at zero (clock skew), as durationLabel does. */
export function runDurationSeconds(startedAt: string, finishedAt: string): number {
  return Math.max(0, Math.floor((Date.parse(finishedAt) - Date.parse(startedAt)) / SECOND));
}

/** The distinct model ids across the phases' per-model usage, sorted. */
export function runModels(phases: readonly RunPhase[]): string[] {
  const models = new Set<string>();
  for (const phase of phases)
    for (const model of Object.keys(phase.models ?? {})) models.add(model);
  return [...models].sort(compare);
}

/** A stored issue class as a chart class: a known class, otherwise "other". */
function classKey(issueClass: string | null): ClassKey {
  return CLASSES.find((c) => c.key === issueClass)?.key ?? "other";
}

/**
 * One point per finished run on the axis, oldest day first. A run whose
 * project is not in `projects` (RLS hides it) or whose day is not on the axis
 * is dropped. Inside a day, runs are ordered by finished_at, then adw_id, and
 * the i-th of n sits at `dayIndex + BAND * ((i + 1) / (n + 1) - 0.5)`, so the
 * marks never leave their day band. Tokens, cost and attempts are null for a
 * run without metrics. Never mutates its inputs.
 */
export function toRunPoints(
  runs: readonly SummaryRun[],
  projects: readonly (SummaryProject & { id: string })[],
  axis: readonly string[],
): SummaryRunPoint[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const dayIndex = new Map(axis.map((day, i) => [day, i]));
  const byDay = new Map<string, SummaryRun[]>();
  for (const run of runs) {
    if (run.finished_at === null || !byId.has(run.project_id)) continue;
    const day = runDay(run.finished_at);
    if (!dayIndex.has(day)) continue;
    const list = byDay.get(day);
    if (list) list.push(run);
    else byDay.set(day, [run]);
  }

  const points: SummaryRunPoint[] = [];
  for (const [index, day] of axis.entries()) {
    const list = [...(byDay.get(day) ?? [])].sort(
      (a, b) =>
        Date.parse(a.finished_at ?? "") - Date.parse(b.finished_at ?? "") ||
        compare(a.adw_id, b.adw_id),
    );
    for (const [i, run] of list.entries()) {
      const project = byId.get(run.project_id);
      if (!project || run.finished_at === null) continue;
      const metrics = run.run_metrics;
      const phases = metrics?.phases ?? [];
      points.push({
        adw_id: run.adw_id,
        slug: project.slug,
        display_name: project.display_name,
        issue_number: run.issue_number,
        issue_title: run.issue_title,
        issue_class: classKey(run.issue_class),
        status: run.status,
        day,
        x: index + BAND * ((i + 1) / (list.length + 1) - 0.5),
        duration_s: runDurationSeconds(run.started_at, run.finished_at),
        tokens_in: metrics?.tokens_in ?? null,
        tokens_out: metrics?.tokens_out ?? null,
        cost_usd: metrics?.cost_usd ?? null,
        attempts: metrics?.attempts ?? null,
        models: runModels(phases),
        phases: phases.map((phase) => ({
          phase: phase.phase,
          duration_s: phase.duration_s,
          tokens_in: phase.tokens_in,
          tokens_out: phase.tokens_out,
          cost_usd: phase.cost_usd,
          models: runModels([phase]),
        })),
      });
    }
  }
  return points;
}

/** The run chart's marks of one class, for the selected metric. */
interface ClassPoints {
  key: ClassKey;
  color: string;
  points: SummaryRunPoint[];
}

/**
 * The run points split by class in chart order (classes without a point
 * omitted), keeping only the points that have a value for `metric`, and how
 * many points have none (runs without metrics, for tokens and cost).
 */
export function pointsByClass(
  points: readonly SummaryRunPoint[],
  metric: SummaryMetric,
): { classes: ClassPoints[]; missing: number } {
  const field = SUMMARY_METRIC_FIELD[metric];
  const valued = points.filter((point) => point[field] !== null);
  return {
    classes: CLASSES.map(({ key }) => ({
      key,
      color: CLASS_COLORS[key].fill,
      points: valued.filter((point) => point.issue_class === key),
    })).filter((c) => c.points.length > 0),
    missing: points.length - valued.length,
  };
}

/** Fresh input, output and cost, summed. */
export interface ModelTotals {
  input: number;
  output: number;
  cost_usd: number;
}

/** One day's tokens and cost per model, and what no phase attributes to a model. */
export interface DayModelSplit {
  models: Record<string, ModelTotals>;
  unattributed: ModelTotals;
}

function addTotals(into: ModelTotals, input: number, output: number, cost: number): void {
  into.input += input;
  into.output += output;
  into.cost_usd = round4(into.cost_usd + cost);
}

/**
 * Per UTC day of finished_at, the tokens in, tokens out and cost of the runs
 * per model, summed from run_metrics.phases[].models. What a run's totals
 * hold beyond its models' sum (rows published before the per-model change, or
 * phases without models) is the day's `unattributed`, clamped at zero per run
 * and per field, so a day's stacks add up to its runs' totals. A run without
 * metrics contributes nothing. Never mutates its input.
 */
export function dailyModelSplit(runs: readonly SummaryRun[]): Map<string, DayModelSplit> {
  const byDay = new Map<string, DayModelSplit>();
  for (const run of runs) {
    const metrics = run.run_metrics;
    if (run.finished_at === null || metrics === null) continue;
    const day = runDay(run.finished_at);
    let split = byDay.get(day);
    if (!split) {
      split = { models: {}, unattributed: { input: 0, output: 0, cost_usd: 0 } };
      byDay.set(day, split);
    }
    const attributed = { input: 0, output: 0, cost_usd: 0 };
    for (const phase of metrics.phases) {
      for (const [model, usage] of Object.entries(phase.models ?? {})) {
        const totals = split.models[model] ?? { input: 0, output: 0, cost_usd: 0 };
        split.models[model] = totals;
        addTotals(totals, usage.input, usage.output, usage.cost_usd);
        addTotals(attributed, usage.input, usage.output, usage.cost_usd);
      }
    }
    addTotals(
      split.unattributed,
      Math.max(0, metrics.tokens_in - attributed.input),
      Math.max(0, metrics.tokens_out - attributed.output),
      Math.max(0, round4(metrics.cost_usd - attributed.cost_usd)),
    );
  }
  return byDay;
}

/** One aggregate row per axis day, the values filled in by `values`. */
function axisRows(
  axis: readonly string[],
  values: (day: string) => Record<string, number | null>,
): SummaryAggregateRow[] {
  return axis.map((day, x) => ({ x, day, ...values(day) }));
}

/**
 * Every daily aggregate chart over the axis, one row per axis day:
 *
 * - runs: the day's runs per class (adw.daily_summary's counts, "other" the
 *   runs with no known class), one stack; zeros on a day without runs.
 * - classes: the same as percentages of the day (classSegments' widths, the
 *   last absorbing the rounding); null on a day without runs (no bar).
 * - duration: one series per project with a row in the window, each the
 *   project's exact median for the day, never combined (no median of
 *   medians); null where the project has no value.
 * - tokens: tokens in and out per model, two stacks, plus the unattributed
 *   remainder of each when it is non-zero somewhere in the window.
 * - cost: cost per model, one stack, plus the unattributed remainder when
 *   non-zero somewhere.
 *
 * A model keeps one colour across tokens and cost (its index in the sorted
 * model list of the window).
 */
export function toAggregates(
  rows: SummaryReport["rows"],
  axis: readonly string[],
  split: ReadonlyMap<string, DayModelSplit>,
): Record<SummaryAggregate, SummaryAggregateChart> {
  const onAxis = new Set(axis);
  const byDay = new Map(rows.map((row) => [row.day, row]));

  const classSeries: SummaryAggregateSeries[] = CLASSES.map(({ key, field }) => ({
    key: field,
    label: key,
    stack: "runs",
    color: CLASS_COLORS[key].fill,
  }));
  const runs = axisRows(axis, (day) => {
    const totals = byDay.get(day)?.totals;
    if (!totals) return Object.fromEntries(CLASSES.map(({ field }) => [field, 0]));
    const known = totals.features + totals.bugs + totals.chores + totals.patches;
    return {
      feature: totals.features,
      bug: totals.bugs,
      chore: totals.chores,
      patch: totals.patches,
      other: Math.max(0, totals.runs - known),
    };
  });
  const classes = axisRows(axis, (day) => {
    const totals = byDay.get(day)?.totals;
    const segments = totals ? classSegments(totals) : [];
    return Object.fromEntries(
      CLASSES.map(({ key, field }) => [
        field,
        segments.length === 0 ? null : (segments.find((s) => s.key === key)?.width ?? 0),
      ]),
    );
  });

  const projects = new Map<string, string>();
  for (const row of rows) {
    if (!onAxis.has(row.day)) continue;
    for (const project of row.projects) projects.set(project.slug, project.display_name);
  }
  const projectSlugs = [...projects.keys()].sort(compare);
  const durationSeries = projectSlugs.map((slug, i) => ({
    key: `project_${i}`,
    label: projects.get(slug) ?? slug,
    stack: null,
    color: modelColor(i),
  }));
  const duration = axisRows(axis, (day) => {
    const list = byDay.get(day)?.projects ?? [];
    return Object.fromEntries(
      projectSlugs.map((slug, i) => [
        `project_${i}`,
        list.find((p) => p.slug === slug)?.median_duration_s ?? null,
      ]),
    );
  });

  const daySplits = axis.flatMap((day) => {
    const s = split.get(day);
    return s ? [s] : [];
  });
  const models = [...new Set(daySplits.flatMap((s) => Object.keys(s.models)))].sort(compare);
  const anyUnattributed = (pick: (t: ModelTotals) => number) =>
    daySplits.some((s) => pick(s.unattributed) > 0);
  const modelSeries = (
    prefix: string,
    stack: string,
    labelPrefix: string,
    pick: (t: ModelTotals) => number,
  ): {
    series: SummaryAggregateSeries[];
    values: (s: DayModelSplit | undefined) => Record<string, number>;
  } => {
    const series = models.map((model, i) => ({
      key: `${prefix}_${i}`,
      label: `${labelPrefix}${model}`,
      stack,
      color: modelColor(i),
    }));
    const withRest = anyUnattributed(pick);
    if (withRest) {
      series.push({
        key: `${prefix}_unattributed`,
        label: `${labelPrefix}unattributed`,
        stack,
        color: UNATTRIBUTED_COLOR,
      });
    }
    return {
      series,
      values: (s) => ({
        ...Object.fromEntries(
          models.map((model, i) => {
            const totals = s?.models[model];
            return [`${prefix}_${i}`, totals ? pick(totals) : 0];
          }),
        ),
        ...(withRest ? { [`${prefix}_unattributed`]: s ? pick(s.unattributed) : 0 } : {}),
      }),
    };
  };
  const tokensIn = modelSeries("in", "in", "in: ", (t) => t.input);
  const tokensOut = modelSeries("out", "out", "out: ", (t) => t.output);
  const cost = modelSeries("cost", "cost", "", (t) => t.cost_usd);

  return {
    runs: { series: classSeries, rows: runs, unit: "count" },
    classes: { series: classSeries, rows: classes, unit: "percent" },
    duration: { series: durationSeries, rows: duration, unit: "seconds" },
    tokens: {
      series: [...tokensIn.series, ...tokensOut.series],
      rows: axisRows(axis, (day) => ({
        ...tokensIn.values(split.get(day)),
        ...tokensOut.values(split.get(day)),
      })),
      unit: "tokens",
    },
    cost: {
      series: cost.series,
      rows: axisRows(axis, (day) => cost.values(split.get(day))),
      unit: "usd",
    },
  };
}

/**
 * Both charts' data for a report: the window's day axis, one point per
 * finished run on it, and every aggregate. A run of a project not in
 * `projects` counts nowhere. An empty window (`from` null) has no day, no
 * point and aggregate charts without rows. Never mutates its inputs.
 */
export function toSummaryCharts(
  runs: readonly SummaryRun[],
  report: Pick<SummaryReport, "from" | "to" | "rows">,
  projects: readonly (SummaryProject & { id: string })[],
): SummaryCharts {
  const axis = summaryDayAxis(report.from, report.to);
  const visible = new Set(projects.map((project) => project.id));
  const shown = runs.filter((run) => visible.has(run.project_id));
  return {
    days: axis,
    points: toRunPoints(shown, projects, axis),
    aggregates: toAggregates(report.rows, axis, dailyModelSplit(shown)),
  };
}
