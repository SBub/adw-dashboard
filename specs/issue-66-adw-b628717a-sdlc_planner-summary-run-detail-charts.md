# Feature: Summary page charts: per-run detail over days and a selectable daily aggregate, with models

## Metadata

issue_number: `66`
adw_id: `b628717a`
issue_json: `{"number":66,"title":"Summary page: per-run detail chart over days plus selectable daily aggregate chart, with model","body":"Replace the current /summary tables with two charts, driven by adw.runs joined to adw.run_metrics (26 runs are recorded today; every run has tokens, cost, phases and model ids). Top chart, run detail per day: x axis is the day, one mark per run inside its day (jitter or small multiples), y axis selectable: duration (finished_at minus started_at), tokens in, tokens out, cost USD. Mark colour = issue class (feature, bug, chore, patch). Hover/tap shows issue number and title, adw_id, status, attempts, models used, per-phase breakdown (from phases). Clicking a mark opens the run's project page. Bottom chart, daily aggregates, one selector: runs per day (stacked by class), class distribution (100% stacked), median duration per day, tokens per day (in and out, stacked by model once the toolkit publishes per-model splits), cost per day (stacked by model). Source: adw.daily_summary for the existing aggregates; per-model stacks depend on the toolkit issue \"record the model used per phase and per-model token split\" and should render from model_set as a single series until that lands. Project filter at the top (all projects or one), persisted in the URL (?project=owner/repo, ?metric=, ?agg=), so the page stays a cached server read keyed by search params plus a client chart. Keep the existing cache tags and revalidation path for the summary; the charts must not break the client prerender (no Date.now() in render). Charting: pick one small dependency (recharts or visx), render client side, SSR a loading skeleton. Dark mode via the existing palette; class colours reuse src/lib/status-colors.ts conventions (add a class colour map next to it). Acceptance: both charts render for the 26 existing runs on all three projects; selectors update without a full reload; URL round-trips; unit tests for the data shaping (grouping by day, selectable metric mapping) in src/lib."}`

## Feature Description

`/summary` today is a list of day cards (counts, an inline-SVG class bar, medians, sums) with a per-project table under each day. This feature replaces the day cards and tables with two charts:

1. **Run detail** (top). x is the UTC day of `finished_at` across the window, one mark per finished run, spread deterministically inside its day band. The y axis is selectable through `?metric=`: `duration` (finished_at minus started_at, the default), `tokens_in`, `tokens_out`, `cost`. Mark colour is the issue class (`/feature`, `/bug`, `/chore`, `/patch`, other). Hover (or tap on touch) shows the issue number and title, `adw_id`, status, attempts, models used and a per-phase breakdown (phase, duration, tokens in/out, cost, models) read from `run_metrics.phases`. Clicking a mark navigates to the run's project page `/projects/<owner>/<repo>`.
2. **Daily aggregate** (bottom). One selector, `?agg=`: `runs` (runs per day stacked by class, default), `classes` (class distribution, 100% stacked), `duration` (median duration per day), `tokens` (tokens in and out per day, each stacked by model), `cost` (cost per day stacked by model).

The project and window filter stays at the top (`?project=owner/repo`, `?days=`), now submitted through `next/form` so it is a client-side navigation instead of a full document load. The metric and aggregate selectors are pure client state mirrored into the URL with `window.history.replaceState`, so they switch instantly with no server round trip, and every URL round-trips (reload, share, back to the same view).

## User Story

As the owner of the ADW toolkit watching its runs across projects
I want to see every finished run as a mark on a timeline, coloured by issue class and sized by the metric I pick, plus a daily aggregate I can switch between counts, class mix, median duration, tokens and cost per model
So that I can spot outlier runs (slow, expensive, token-heavy), see which models the money goes to, and jump straight to the project that produced a run.

## Problem Statement

The current page shows only per-day aggregates as text and tables. There is no way to see individual runs, compare them on one metric, see which model consumed the tokens and cost, or get from an outlier to its project. The tables grow linearly with days times projects and are hard to scan; a trend over 30 or 90 days is invisible.

## Solution Statement

Keep the server shape of the page exactly: `SummaryContent` awaits `searchParams`, normalises the parameters outside the cache scope and calls `getSummary(days, project)` (`"use cache"`, `summaryTag()`, same `cacheLife`). Only `days` and `project` are cache-key arguments; `metric` and `agg` change no data, so they are normalised outside the scope and passed straight to the client component (no extra cache entries, no change to the tag or revalidation path).

`getDailySummary(days, project)` keeps its signature and additionally reads the finished runs of the same window with their `run_metrics` row embedded (one PostgREST request, `runs` with `run_metrics(...)`; the foreign key `(project_id, adw_id)` makes it a one-to-one embed that returns an object or `null`). A new pure module, `src/lib/summary-charts.ts`, shapes everything the charts need (the day axis, one point per run carrying every metric value, every aggregate series with its stack keys) and `toSummaryReport` attaches it to the report as `report.charts`. Components only pick a precomputed field by the selected key and format with the existing pure label helpers (`secondsLabel`, `tokensLabel`, `costLabel`, `formatDay`), so the rule "components never compute business values" holds.

**Per-model data has landed, `model_set` is gone.** The issue was written before the toolkit's migrations `20261006180000_run_metrics_model_usage.sql` and `20261006200000_model_usage_views.sql`. The hosted database (read-only probe with the publishable key) now has `run_metrics.phases[].models` (`{<model>: {input, cache_read, cache_creation, output, cost_usd}}`), `tokens_cache_read`, `tokens_cache_creation`, and the views `adw.run_model_usage` and `adw.daily_model_summary`; `run_metrics.model_set` no longer exists. The per-model stacks are therefore built from `phases[].models` of the runs already read for the top chart, not from `adw.daily_model_summary`: that view keys on the UTC day of `started_at` while `adw.daily_summary` keys on `finished_at`, so stacking it next to the daily counts would put a midnight-spanning run on two different days. Any part of a run's tokens or cost its phases do not attribute to a model (rows published before the per-model change) is one extra `unattributed` series, so a day's stack still adds up to the run totals.

**Charting library: `recharts` (3.x).** One dependency, declarative React components (`ScatterChart`, `BarChart` with `stackId` and `stackOffset="expand"`), built-in tooltips with tap support, `ResponsiveContainer`, React 19 peer support. visx would need five or six packages and hand-built axes and tooltips for the same result. The chart components are loaded with `next/dynamic` and `ssr: false` from the client component `SummaryCharts`, whose `loading` is a static `ChartSkeleton`; the server HTML therefore carries the selectors and two skeletons and recharts never runs during any prerender pass, so it cannot read the clock there.

**Colours.** A new `src/lib/class-colors.ts` next to `status-colors.ts` holds `CLASS_COLORS` (per class: the badge classes now inlined in `IssueClassBadge`, a swatch class, and an SVG fill as a CSS custom property reference such as `var(--color-violet-500)`, which Tailwind 4 defines) and the model series palette. Recharts takes colours as strings, so CSS variables give dark mode through `globals.css` (axis, grid and tooltip variables switched under `prefers-color-scheme: dark`). No status hue (`emerald`, `amber`, `sky`, `rose`, `red`) appears anywhere outside `status-colors.ts`; the existing guard test keeps scanning `src/`.

## Relevant Files

Use these files to implement the feature:

- `README.md` - "Summary" section (data, window, medians, filters, cache, revalidation) and the opening paragraph that describes `/summary`; both are rewritten to describe the charts.
- `AGENTS.md` - "Summary" rules (the "no charting library" rule must be amended in this change), the client component list in "Architecture", the server-component list that names `DailySummaryList`, `ClassDistributionBar`, `ProjectBreakdownTable`, the boundary cast list and the column-list rule, the clock rule.
- `.adw/project.md` - Review section describes `/summary` as "day cards with class bars, per-project tables"; update the description (headings untouched).
- `src/app/summary/page.tsx` - `getSummary` (unchanged scope), `SummaryContent` reads `?metric` and `?agg` too and renders `SummaryCharts` instead of `DailySummaryList`.
- `src/data/index.ts` - `getDailySummary`: add the runs plus `run_metrics` read for the window, `RUN_METRICS_COLUMNS`, the boundary cast, pass runs into `toSummaryReport`.
- `src/data/supabase.ts` - read only: the client is pinned to schema `adw` with the `no-store` fetch; the new read goes through `getSupabase()`.
- `src/types/adw.ts` - add the `RunMetrics` row type (column for column with `adw.run_metrics`), `RunPhase`, `RunPhaseModelUsage`; add the chart view models to the view-model section and `charts` to `SummaryReport`.
- `src/lib/daily-summary.ts` - `toSummaryReport` takes the runs and attaches `charts`; `summaryHref` gains `metric` and `agg`; `classSegments` is reused by the `classes` aggregate; `tokensLabel`, `costLabel` reused by the chart labels.
- `src/lib/daily-summary.test.ts` - extend for `summaryHref` and the `charts` attachment.
- `src/lib/run-view.ts` - `secondsLabel` formats duration ticks and tooltips.
- `src/lib/format-date.ts` - `formatDay` labels the day axis; `formatTimestamp` is not needed.
- `src/lib/status-colors.ts` and `src/lib/status-colors.test.ts` - conventions to mirror; the hue guard must stay green.
- `src/lib/slug.ts` - `isProjectSlug` (used by `readSummaryProject`).
- `src/components/SummaryFilters.tsx` - switch `<form method="get">` to `next/form`'s `Form`, give it the shared form id so the client selectors submit with it.
- `src/components/IssueClassBadge.tsx` - read its classes from `CLASS_COLORS`.
- `src/components/SectionBoundary.tsx` - the existing boundary around the island; unchanged.
- `src/components/DailySummaryList.tsx`, `src/components/ProjectBreakdownTable.tsx`, `src/components/ClassDistributionBar.tsx` - removed (replaced by the charts; knip would flag them).
- `src/app/globals.css` - chart CSS variables for light and dark.
- `package.json`, `yarn.lock` - `recharts` and its `react-is` peer.
- `knip.json`, `vitest.config.ts`, `lefthook.yml` - read only: dead-code scan of `src/**` and the unit layer `src/**/*.test.ts`.
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/form.md` - `next/form` (client navigation for a GET form).
- `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` - "native History API": `window.history.replaceState` integrates with the Next router without a reload.
- `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` (or the `next/dynamic` reference next to it) - `dynamic(..., { ssr: false, loading })` in a client component.
- `~/Dev/adw-toolkit/supabase/migrations/20261005180000_run_metrics.sql`, `20261006120000_run_metrics_change_stats.sql`, `20261006180000_run_metrics_model_usage.sql`, `20261006200000_model_usage_views.sql` - the authoritative `adw.run_metrics` schema (read only; not part of this repository).

### New Files

- `src/lib/summary-charts.ts` - pure shaping for both charts: parameter readers, metric and aggregate keys, day axis, run points, aggregate series, per-model split.
- `src/lib/summary-charts.test.ts` - unit tests for all of it, fixed inputs, no clock.
- `src/lib/class-colors.ts` - `CLASS_COLORS` (badge, swatch, fill) and `MODEL_COLORS` / `modelColor(index)`.
- `src/lib/class-colors.test.ts` - pins the class hues to `IssueClassBadge`'s and that no class or model colour uses a status hue.
- `src/components/SummaryCharts.tsx` - `"use client"`: holds `metric` and `agg` state, renders the two selectors (associated with the filter form), mirrors them into the URL with `replaceState`, lazy-loads the two charts.
- `src/components/RunDetailChart.tsx` - `"use client"`: recharts scatter of the run points, class colours, tooltip, click to project page.
- `src/components/DailyAggregateChart.tsx` - `"use client"`: recharts stacked bars for the selected aggregate series.
- `src/components/ChartSkeleton.tsx` - server-safe static placeholder (fixed height, pulse), the SSR and `loading` state.

## Implementation Plan

### Phase 1: Foundation

- Add `recharts` (and `react-is`, its peer) with `yarn add recharts react-is`.
- Types: `RunMetrics`, `RunPhase`, `RunPhaseModelUsage` as database-row types; chart view models (`SummaryMetric`, `SummaryAggregate`, `SummaryRunPoint`, `SummaryAggregateSeries`, `SummaryCharts`) in the view-model section; `SummaryReport.charts`.
- `src/lib/class-colors.ts` and its test; `IssueClassBadge` reads from it.
- Chart CSS variables in `globals.css`.

### Phase 2: Core Implementation

- `src/lib/summary-charts.ts` with full unit tests (the shaping is the risky part and the only testable layer).
- `getDailySummary` reads runs with embedded metrics for the window and passes them through `toSummaryReport`, which attaches `toSummaryCharts(...)`.
- The three client components and the skeleton.

### Phase 3: Integration

- `SummaryContent` normalises `?metric` and `?agg` outside the cache scope and renders `SummaryFilters` plus `SummaryCharts` (keyed so a navigation with new parameters remounts it).
- `SummaryFilters` becomes a `next/form` `Form` with the shared id; the client selects join it through the `form` attribute.
- Remove `DailySummaryList`, `ProjectBreakdownTable`, `ClassDistributionBar`.
- Update `README.md`, `AGENTS.md`, `.adw/project.md` Review text.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add the charting dependency

- `yarn add recharts react-is` (Yarn only; never npm/npx). Expect `recharts@^3.10` and `react-is@^19`.
- Confirm `yarn.lock` changed and `yarn install --immutable` is clean afterwards.

### 2. Row and view-model types in `src/types/adw.ts`

- Database rows section, mirroring `adw.run_metrics` column for column (verified against the hosted table: `project_id, adw_id, tokens_in, tokens_out, cost_usd, attempts, gate_outcome, phases, computed_at, updated_at, plan_lines, diff_added, diff_removed, diff_files, tokens_cache_read, tokens_cache_creation`):
  ```ts
  export type GateOutcome = "merged" | "declined" | "held" | "failed" | "none";
  export interface RunPhaseModelUsage {
    input: number;
    cache_read: number;
    cache_creation: number;
    output: number;
    cost_usd: number;
  }
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
  ```
  Note in the comment that PostgREST returns `numeric` (`cost_usd`) as a JSON number here (the probe shows `4.2935`) and `bigint` as a number.
- View-model section:
  - `SummaryMetric = "duration" | "tokens_in" | "tokens_out" | "cost"`; `SummaryAggregate = "runs" | "classes" | "duration" | "tokens" | "cost"`.
  - `SummaryRunPoint`: `adw_id`, `slug`, `display_name`, `issue_number`, `issue_title`, `issue_class` (`ClassKey`), `status` (string: finished runs can be `halted`, which `RunStatus` does not list), `day` (`YYYY-MM-DD`), `x` (day index plus in-band offset), `duration_s: number`, `tokens_in`, `tokens_out`, `cost_usd` (each `number | null`, null when the run has no `run_metrics` row), `attempts: number | null`, `models: string[]`, `phases: { phase, duration_s, tokens_in, tokens_out, cost_usd, models: string[] }[]`.
  - `SummaryAggregateSeries`: `{ key: string; label: string; stack: string | null; color: string }`.
  - `SummaryAggregateChart`: `{ series: SummaryAggregateSeries[]; rows: ({ x: number; day: string } & Record<string, number | null>)[]; unit: "count" | "percent" | "seconds" | "tokens" | "usd" }`.
  - `SummaryCharts`: `{ days: string[]; points: SummaryRunPoint[]; aggregates: Record<SummaryAggregate, SummaryAggregateChart> }`.
  - `SummaryReport` gains `charts: SummaryCharts`. `SummaryDay` and `rows` stay (the `duration` aggregate reads per-project medians from them) unless knip shows a field unused; drop only what is dead.
- Keep the file header comment accurate (it lists what each section holds).

### 3. Class and model colours: `src/lib/class-colors.ts`

- Move `ClassKey` here or import it from `daily-summary.ts` (keep one definition; `daily-summary.ts` already exports it, so import it).
- `CLASS_COLORS: Record<ClassKey, { badge: string; swatch: string; fill: string }>`, full literal strings:
  - `/feature`: badge as today in `IssueClassBadge` (violet), swatch `bg-violet-500`, fill `var(--color-violet-500)`.
  - `/bug`: fuchsia; `/chore`: neutral-400; `/patch`: lime; `other`: the current fallback badge, swatch `bg-neutral-300 dark:bg-neutral-600`, fill `var(--chart-class-other)` (defined in `globals.css` for light and dark).
- `MODEL_COLORS`: an ordered list of fills on non-status hues (for example `var(--color-indigo-500)`, `var(--color-teal-500)`, `var(--color-orange-500)`, `var(--color-cyan-600)`, `var(--color-pink-500)`, `var(--color-yellow-600)`), plus `UNATTRIBUTED_COLOR = "var(--chart-unattributed)"`. `modelColor(index)` cycles the list. Header comment in the style of `status-colors.ts`: issue classes and models are not states; never a status hue; never interpolate a hue name.
- `IssueClassBadge` reads `CLASS_COLORS[issueClass]?.badge ?? CLASS_COLORS.other.badge` (keep the `null` short-circuit; an unknown class string keeps the fallback look).

### 4. `src/lib/class-colors.test.ts`

- The badge strings for the four classes equal today's `IssueClassBadge` strings (pinned literally, so a hue change is deliberate).
- Every `fill` is a `var(--...)` reference; none of `CLASS_COLORS` or `MODEL_COLORS` contains `emerald|amber|sky|rose|red`.
- `modelColor` cycles: `modelColor(MODEL_COLORS.length) === modelColor(0)`.

### 5. Chart CSS variables in `src/app/globals.css`

- `:root { --chart-axis: var(--color-neutral-500); --chart-grid: var(--color-neutral-200); --chart-tooltip-bg: var(--color-white); --chart-tooltip-border: var(--color-neutral-200); --chart-class-other: var(--color-neutral-300); --chart-unattributed: var(--color-neutral-400); }` and the dark values under `@media (prefers-color-scheme: dark)` (neutral-400, neutral-800, neutral-900, neutral-700, neutral-600, neutral-500). This matches how the app does dark mode today (Tailwind's default `dark:` variant is `prefers-color-scheme`).

### 6. Pure shaping: `src/lib/summary-charts.ts`

Header comment: pure, no clock (`Date.parse` on stored timestamps is a parse, not a clock read), no IO, tested in `summary-charts.test.ts`; the boundary calls `toSummaryCharts` through `toSummaryReport`; components only pick fields.

- Constants, defined here and nowhere else: `SUMMARY_METRICS` (ordered `duration, tokens_in, tokens_out, cost`, each with its label: "Duration", "Tokens in", "Tokens out", "Cost (USD)"), `SUMMARY_DEFAULT_METRIC = "duration"`, `SUMMARY_AGGREGATES` (ordered `runs, classes, duration, tokens, cost` with labels "Runs per day", "Class distribution", "Median duration", "Tokens per day", "Cost per day"), `SUMMARY_DEFAULT_AGGREGATE = "runs"`, `SUMMARY_FILTER_FORM_ID = "summary-filters"`.
- `SUMMARY_METRIC_FIELD: Record<SummaryMetric, "duration_s" | "tokens_in" | "tokens_out" | "cost_usd">`: the selectable metric mapping the components use to pick `point[field]`.
- `readSummaryMetric(raw)` / `readSummaryAggregate(raw)`: a single string that is one of the keys, otherwise the default (absent, repeated, empty, unknown, different case). Never throw.
- `summaryDayAxis(from, to)`: every `YYYY-MM-DD` from `from` to `to` inclusive (reuse the UTC-midnight arithmetic of `summaryWindowStart`; export a tiny shared `addDays` from `daily-summary.ts` or keep a local one), `[]` when either is null. Empty days stay on the axis so gaps are visible.
- `runDay(finished_at)`: the UTC `YYYY-MM-DD` of an ISO timestamp (UTC getters), matching `adw.daily_summary`'s `date_trunc('day', finished_at at time zone 'UTC')`.
- `runDurationSeconds(started_at, finished_at)`: whole seconds, clamped at 0 (same clamp as `formatDuration`).
- `runModels(phases)`: distinct model ids across `phases[].models`, sorted.
- `toRunPoints(runs, projects, axis)`: `runs` is `(Run & { run_metrics: RunMetrics | null })[]`. Drop a run whose project is not in `projects` (RLS) or whose day is not on the axis. Group by day; inside a day order by `finished_at`, then `adw_id`; the i-th of n gets `x = dayIndex + BAND * ((i + 1) / (n + 1) - 0.5)` with `BAND = 0.8`, so marks never leave their day and the layout is deterministic (no random jitter: server and client agree and tests are exact). Class key: the known class string or `other`. Metric values from `run_metrics`, or `null` when absent; `attempts` likewise. `phases` mapped to the tooltip shape with each phase's `runModels([phase])`.
- `dailyModelSplit(runs)`: per day, per model, `{ input, output, cost_usd }` summed from `phases[].models`, plus `unattributed` per run = `max(0, run total - sum over its models)` for each of tokens in, tokens out, cost (cost rounded to 4 decimals against float noise, as `dayTotals` does). Runs without `run_metrics` contribute nothing.
- `toAggregates(report rows, axis, projects, split)` returns `Record<SummaryAggregate, SummaryAggregateChart>`, one row per axis day (a day with no runs has zeros for counts and `null` for medians):
  - `runs`: series per class in the fixed order `/feature, /bug, /chore, /patch, other`, one stack `"runs"`, values from the day's `totals` (`other = runs - known`, as `classSegments` computes), unit `count`.
  - `classes`: same series, values are `classSegments(...)` widths in percent (sum exactly 100, the last segment absorbs rounding), unit `percent`; a day with no runs is all `null` (no bar), not 0 percent.
  - `duration`: one series per project that has a row in the window (key `project:<slug>`, label `display_name`, `stack: null`, colours from `modelColor` order or a neutral when there is one project), value each project's exact `median_duration_s` for the day. Never combined: this is how the all-projects view shows medians without a median of medians. With a project selected it is one series. Unit `seconds`.
  - `tokens`: series `in:<model>` (stack `"in"`) and `out:<model>` (stack `"out"`) for every model in the window in sorted order, plus `in:unattributed` / `out:unattributed` only when non-zero somewhere in the window; unit `tokens`.
  - `cost`: series `cost:<model>` plus `cost:unattributed` when non-zero, one stack, unit `usd`.
  - Series colours: classes from `CLASS_COLORS[...].fill`, models from `modelColor(index in the sorted model list)` so a model has the same colour in `tokens` and `cost`, unattributed `UNATTRIBUTED_COLOR`.
- `toSummaryCharts(runs, report, projects)`: assembles `{ days: axis, points, aggregates }`. Empty window (`from === null`): `{ days: [], points: [], aggregates }` with empty rows.
- Never mutate inputs.

### 7. `src/lib/summary-charts.test.ts`

Fixed fixtures (a `run(overrides)` and `metrics(overrides)` builder like `row()` in `daily-summary.test.ts`). Cases:

- Readers: each valid key; absent, array, empty, `"Cost"`, `"bogus"` give the default.
- `SUMMARY_METRIC_FIELD` maps every metric, and picking the field off a point yields the expected number (the selectable metric mapping).
- `summaryDayAxis`: same day, across a month end, across 29.02.2028, nulls.
- `runDay`: `2026-10-05T23:59:59+00:00` is `2026-10-05`; `2026-10-06T00:30:00+01:00` is `2026-10-05` (UTC, not local offset).
- `runDurationSeconds`: normal, negative clamped to 0.
- `toRunPoints`: grouping by day (two runs on one day, one on another); x offsets exact (`n = 1` at the band centre, `n = 2` at `-0.1333..` and `+0.1333..` of `BAND * ...`), always within `(dayIndex - 0.4, dayIndex + 0.4)`; tie order by `finished_at` then `adw_id`; run of an unknown project dropped; run outside the axis dropped; run without metrics has null tokens and cost but a duration; unknown class is `other`; models sorted and distinct.
- `dailyModelSplit`: two models in two phases summed; a run whose phases have no `models` is all unattributed; partial attribution yields the remainder; no negative remainder.
- `toAggregates`: `runs` stacks equal the day counts and an empty axis day is zeros; `classes` sums to 100 and an empty day is null; `duration` keeps two projects' medians as two series (no combined median) and is one series with a project selected; `tokens` and `cost` use the same colour for the same model and omit `unattributed` when it is zero everywhere.
- `toSummaryCharts` with an empty window.

### 8. Extend `src/lib/daily-summary.ts` and its test

- `toSummaryReport(rows, projects, options, runs = [])` (or `options.runs`) attaches `charts: toSummaryCharts(runs, report-so-far, projects)`; keep the existing behaviour and tests intact.
- `summaryHref({ days, project, metric, agg })`: defaults left out (`days` 30, no project, `metric` duration, `agg` runs), order `days, project, metric, agg`. Update the existing `summaryHref` tests and add: metric only, agg only, all four.
- `classSegments` stays exported (now used by `summary-charts.ts`); `ClassKey` stays here.
- Add a `daily-summary.test.ts` case that `toSummaryReport` with runs carries `charts.points` for them and with no runs carries empty points.

### 9. Data boundary: `src/data/index.ts`

- `RUN_METRICS_COLUMNS` equal to the fields of `RunMetrics` (comment like the other column constants).
- In `getDailySummary`, after `from` is known (and only then), read:
  ```ts
  let runsQuery = getSupabase()
    .from("runs")
    .select(`${RUN_COLUMNS}, run_metrics(${RUN_METRICS_COLUMNS})`)
    .not("finished_at", "is", null)
    .gte("finished_at", `${from}T00:00:00Z`)
    .order("finished_at", { ascending: true });
  if (selected) runsQuery = runsQuery.eq("project_id", selected.id);
  ```
  Run it in a `Promise.all` with the `daily_summary` rows read (both depend only on `from` and `selected`). Throw `runs: <message>` on error, like the other reads. Cast once at the boundary: `(data ?? []) as (Run & { run_metrics: RunMetrics | null })[]`, with a comment that the select lists exactly the fields of `Run` plus the embedded `RunMetrics` row (one-to-one through the `(project_id, adw_id)` foreign key, so an object or null). The client is the existing `getSupabase()` with `no-store`; no own `fetch`.
- The empty-window branch passes `[]` runs.
- Update the file header comment (the summary also reads `adw.runs` joined to `adw.run_metrics`).

### 10. Skeleton: `src/components/ChartSkeleton.tsx`

- No `"use client"`, no state: a fixed-height (`h-72`) rounded block with `animate-pulse` neutral background and an `aria-label`/visually hidden "Loading chart". Same height as the chart so nothing shifts when the chart arrives.

### 11. `src/components/RunDetailChart.tsx` (`"use client"`)

- Props: `points: SummaryRunPoint[]`, `days: string[]`, `metric: SummaryMetric`. No fetching and no clock read.
- `ResponsiveContainer` (height 288) > `ScatterChart` with `XAxis type="number" dataKey="x" domain={[-0.5, days.length - 0.5]}` and integer `ticks`, thinned for long windows (every day up to 14, else every 7th; choose in `summary-charts.ts` as `dayTicks(days)` and test it), `tickFormatter={(i) => formatDay(days[i])}`; `YAxis dataKey={SUMMARY_METRIC_FIELD[metric]}` with a formatter by metric (`secondsLabel`, `tokensLabel`, `costLabel`); `CartesianGrid` stroke `var(--chart-grid)`; axis stroke `var(--chart-axis)`.
- One `Scatter` per class (data filtered by `issue_class`, done in `summary-charts.ts` as `pointsByClass(points)` so the component only maps) with `fill={CLASS_COLORS[key].fill}`, so the legend lists classes. Points with a `null` value for the metric are filtered by the same helper per metric, and the chart's caption says how many runs have no metrics.
- `isAnimationActive={false}` (no animation frames needed; keeps screenshots deterministic).
- `Tooltip` with a custom `content` component (in the same file) rendering: `#issue_number issue_title` (or "No issue"), `adw_id` in `<code>`, status (`STATUS_COLORS[status]?.text` when the status is a known `StatusKey`, neutral otherwise), attempts, models (comma list or "none recorded"), the metric value, and a small phase table (phase, `secondsLabel(duration_s)`, `tokensLabel` in/out, `costLabel`, models). Tooltip colours from the CSS variables; `trigger` default hover, which recharts also fires on tap.
- `onClick` on each `Scatter`: `router.push(`/projects/${point.slug}`)` with `useRouter` from `next/navigation` (the slug as is, as `ProjectNav` does). `cursor: pointer` on marks.
- `accessibilityLayer` on, and an `aria-label` on the wrapping `<figure>` summarising "N runs over D days, y: <metric label>".
- An empty `points` list renders a dashed "No finished runs in this window" panel instead of an empty chart.

### 12. `src/components/DailyAggregateChart.tsx` (`"use client"`)

- Props: `chart: SummaryAggregateChart`, `days: string[]`. `BarChart data={chart.rows}` with `XAxis dataKey="x"` (same tick helper and `formatDay`), `YAxis` formatter by `chart.unit` (percent as `n%`), one `Bar` per `chart.series` with `dataKey={s.key}`, `stackId={s.stack ?? undefined}`, `fill={s.color}`, `name={s.label}`; `Legend` (labels as text) and `Tooltip` with values formatted by unit. `isAnimationActive={false}`.
- For `tokens`, the two stacks (`in`, `out`) render side by side per day (distinct `stackId`s), legend entries "in: <model>" / "out: <model>".
- For `duration`, bars are grouped per project (no `stackId`), each an exact median; a day with no value for a project has no bar.

### 13. `src/components/SummaryCharts.tsx` (`"use client"`)

- Props: `charts: SummaryCharts`, `days: number`, `project: string | null`, `metric: SummaryMetric`, `agg: SummaryAggregate`.
- `const RunDetailChart = dynamic(() => import("./RunDetailChart").then((m) => m.RunDetailChart), { ssr: false, loading: () => <ChartSkeleton /> })`, the same for `DailyAggregateChart`. This is not a hand-written `Suspense`; the surrounding `SectionBoundary` stays the error and streaming boundary.
- `useState` for `metric` and `agg`, initialised from props. On change: set state, then `window.history.replaceState(null, "", summaryHref({ days, project, metric, agg }))` inside the event handler (never in render, never in an effect).
- Two `<select>`s, `name="metric"` and `name="agg"`, each with `form={SUMMARY_FILTER_FORM_ID}`, so submitting the project/window form carries the current metric and aggregate: the URL round-trips through every control. Options from `SUMMARY_METRICS` / `SUMMARY_AGGREGATES`. Same `SELECT` class string as `SummaryFilters` (export it from `SummaryFilters` or move it to a tiny shared constant; do not duplicate).
- Layout: section "Runs" (heading, metric select, `RunDetailChart`), section "Daily" (heading, aggregate select, `DailyAggregateChart chart={charts.aggregates[agg]}`), stacked vertically, full width, readable at 375 px.

### 14. Filters: `src/components/SummaryFilters.tsx`

- `import Form from "next/form"`; `<Form action="/summary" id={SUMMARY_FILTER_FORM_ID} ...>` in place of `<form method="get">`. It stays a server component without `"use client"` (`Form` is the client part). Submitting is a client-side navigation: no full reload, the `SummaryContent` hole re-renders from the server with the new `days`/`project`.
- Update its doc comment (no longer "no router call needed" wording that implies a document load; it is progressive: without JS it is a plain GET).

### 15. Page: `src/app/summary/page.tsx`

- `SummaryContent` reads `metric` and `agg` from the awaited `searchParams` too, normalised with `readSummaryMetric` / `readSummaryAggregate` outside `getSummary`. `getSummary(days, project)` keeps exactly its signature, tag and `cacheLife`; add one comment line that metric and aggregate are deliberately not arguments (they change no data, so they must not multiply cache entries).
- Render `<SummaryFilters .../>` then `<SummaryCharts key={`${days}|${project ?? ""}|${metric}|${agg}`} charts={report.charts} days={days} project={project} metric={metric} agg={agg} />`. The key remounts the client state when a navigation (form submit, back/forward) brings new parameters, so state never disagrees with the URL.
- Update the static description paragraph to describe the two charts. Keep the "No public project" panel, the `SectionBoundary` and its fallback (replace the fallback text with two `ChartSkeleton`s plus the filter row height, so the hole's fallback looks like the page).

### 16. Remove the replaced components

- Delete `src/components/DailySummaryList.tsx`, `src/components/ProjectBreakdownTable.tsx`, `src/components/ClassDistributionBar.tsx`. Run `yarn knip` and remove whatever the deletion orphans (types, label helpers), keeping only what the charts use.

### 17. Documentation

- `AGENTS.md`:
  - "Summary": replace "Charts are inline SVG with their values also as text; no charting library." with the new rule: charts are `recharts`, rendered only in client components loaded with `next/dynamic` `ssr: false` behind `ChartSkeleton`; no other charting library; colours only from `class-colors.ts` (classes, models) and `STATUS_COLORS` (status text in the tooltip), as CSS variable references; values are available as text in legends and tooltips.
  - "Summary": `?metric` and `?agg` are normalised by `readSummaryMetric` / `readSummaryAggregate` outside the scope, are never `getSummary` arguments, live in client state and are written to the URL only with `window.history.replaceState(summaryHref(...))` in an event handler; the selectors join the filter form through `form={SUMMARY_FILTER_FORM_ID}`.
  - "Summary": shaping lives in `src/lib/daily-summary.ts` and `src/lib/summary-charts.ts` (name the constants defined only there), both pure and tested; the run marks' in-day spread is deterministic, never random.
  - "Summary": per-model stacks come from `run_metrics.phases[].models` keyed on the `finished_at` day, never from `adw.daily_model_summary` (it keys on `started_at`); the remainder is the `unattributed` series. The median rule extends to the chart: per-project series, never a combined median.
  - "Architecture": add `SummaryCharts`, `RunDetailChart`, `DailyAggregateChart` to the `"use client"` list with their reason; remove `DailySummaryList`, `ClassDistributionBar`, `ProjectBreakdownTable` from the server-component list, add `ChartSkeleton`; `SummaryFilters` stays server-side and uses `next/form`.
  - Boundary cast list and column rule: add `(Run & { run_metrics: RunMetrics | null })[]` for the summary runs read and `RUN_METRICS_COLUMNS` equal to the fields of `RunMetrics`.
  - Types: `RunMetrics` is a row type; mention in the types bullet.
  - Status hue guard: class and model colours never use a status hue.
- `README.md`: rewrite the "Summary" section (what the two charts show, data read including the runs + `run_metrics` embed and the per-model decision, URL parameters and how they change without reload, cache unchanged, revalidation unchanged with the note that late `run_metrics` writes are still bounded by the 15-minute `revalidate`), the intro paragraph's `/summary` sentence, and the "Types" section (`RunMetrics`). Mention recharts in "Stack".
- `.adw/project.md` Review: replace "day cards with class bars, per-project tables" with "filters, the run detail chart and the daily aggregate chart", and the project variant "(one row per day, no table)" with "(the same two charts for one project)". Add `/summary?metric=cost&agg=cost` to the paths. Do not touch the nine headings.
- No em-dashes anywhere.

### 18. Browser evidence for the review phase (no E2E code suite in this project)

The profile's E2E code suite is `none` and the one unit layer cannot render components, so the charts' browser behaviour is proven by the review phase's screenshots. No `e2e/*.md` journey is added: the behaviour is deterministic and visible in screenshots, and the URL and shaping logic are unit-tested. The reviewer opens, at desktop 1920x1080 and mobile 375x667, full page:

- `/summary`: filter row, "Runs" chart with one mark per finished run (35 finished runs in the hosted database today across `SBub/adw-toolkit`, `SBub/issebya-homes-ai-system`, `SBub/adw-dashboard`), coloured by class with a legend; "Daily" chart showing runs per day stacked by class.
- `/summary?project=SBub/issebya-homes-ai-system` and the same for `SBub/adw-toolkit` and `SBub/adw-dashboard`: both charts render for each of the three projects.
- `/summary?metric=cost&agg=cost`: y axis in dollars, cost bars stacked by model (`claude-opus-5-5`, `claude-sonnet-5-5`, ...) with a legend.
- `/summary?agg=tokens`, `/summary?agg=classes`, `/summary?agg=duration`: tokens in and out as two stacks per day; 100% bars; per-project median bars in the all-projects view.
- A hover screenshot on one mark showing issue number and title, `adw_id`, status, attempts, models and the phase rows.
- Changing the metric select updates the chart and the address bar (`?metric=tokens_out`) with no document reload (the network panel shows no document request); reloading that URL shows the same selection; clicking a mark lands on `/projects/<owner>/<repo>`.
- Dark mode (emulated `prefers-color-scheme: dark`) at desktop: axes, grid and tooltip readable.
- The served HTML of `/summary` (curl) contains the filter form and the chart skeletons; no console error about hydration.

### 19. Run the validation commands

- Run every command in `Validation Commands` below and fix anything that fails without weakening a rule, type or test.

## Testing Strategy

### Unit Tests

- `src/lib/summary-charts.test.ts` (new): readers, metric field mapping, day axis, UTC day of a run, duration clamp, deterministic in-day spread, run point mapping including runs without metrics and unknown classes, per-model split with the unattributed remainder, every aggregate's rows and series, day ticks, empty window.
- `src/lib/class-colors.test.ts` (new): class hues pinned to the badge's, fills are CSS variable references, no status hue, model colour cycling.
- `src/lib/daily-summary.test.ts` (extended): `summaryHref` with `metric` and `agg` (defaults omitted, order fixed), `toSummaryReport` attaches `charts`.
- `src/lib/status-colors.test.ts` (unchanged): its source scan now also covers the new files and must stay green.

### Test Coverage

- `src/lib/summary-charts.test.ts`, unit layer (`src/**/*.test.ts`, vitest): catches wrong day grouping (local time instead of UTC), marks leaving their day band or reordering between renders, the wrong field picked for a selected metric, a median of medians sneaking into the all-projects duration aggregate, and per-model stacks that do not add up to a run's totals. None of this exists today, so every case fails without the feature (the module does not exist).
- `src/lib/daily-summary.test.ts` additions, unit layer: catches `summaryHref` dropping `metric`/`agg` (URL not round-tripping) or writing defaults, and the report losing its `charts`.
- `src/lib/class-colors.test.ts`, unit layer: catches a class colour drifting from the badge or a model/class colour reusing a status hue.
- The React components (`SummaryCharts`, `RunDetailChart`, `DailyAggregateChart`, `ChartSkeleton`) get no automated test: the project has no component or browser test layer (profile Tests section), and inventing one is out of scope. Their evidence is the review screenshots in step 18; all logic they would otherwise hold is in the tested `src/lib` modules.
- The data boundary read (`getDailySummary`'s runs query) has no unit test, like every other boundary read here; `yarn build` exercises it against the hosted database for the default parameters at build time only if prerendered (it is a hole, so it is exercised in the review instead).

### Edge Cases

- A run with no `run_metrics` row: shown in the duration view, absent (and counted in the caption) in the token and cost views, contributes nothing to model stacks.
- A run whose phases carry no `models` (published before the per-model change): its tokens and cost go to `unattributed`.
- Phase models that sum to slightly more than the run total (rounding): the remainder clamps at 0, never negative.
- A run spanning midnight UTC, or with a `+01:00` offset in its timestamps: day is the UTC day of `finished_at`, the same as `adw.daily_summary`.
- `finished_at` earlier than `started_at` (clock skew): duration 0.
- Status `halted` or another future status: shown as text with a neutral colour.
- `issue_class` null or unknown: class `other`, neutral fill.
- `issue_number`/`issue_title` null: tooltip says "No issue".
- Many runs on one day (more than ten): marks stay inside the 0.8 band and do not overlap the neighbouring day.
- Window with no finished runs, or a project with no runs: empty-state panels, no chart errors.
- `?metric=Cost`, `?metric=a&metric=b`, `?agg=` empty: defaults, no error.
- `?project=` a private or unknown slug: the existing "No public project" panel.
- 90-day window on 375 px: ticks thinned, chart readable, no horizontal page scroll.
- Browser back after a filter submit: the keyed `SummaryCharts` remounts with the URL's values.

## Acceptance Criteria

- `/summary` shows no day cards and no per-project tables; it shows the filter row, the run detail chart and the daily aggregate chart.
- Both charts render for the existing finished runs in the all-projects view and for each of `SBub/adw-toolkit`, `SBub/issebya-homes-ai-system`, `SBub/adw-dashboard`.
- The run chart has one mark per finished run in the window, in its UTC `finished_at` day, coloured by issue class; the y axis switches between duration, tokens in, tokens out and cost.
- Hover or tap on a mark shows issue number and title, `adw_id`, status, attempts, models used and the per-phase breakdown; clicking a mark opens `/projects/<owner>/<repo>` of that run.
- The aggregate chart switches between runs per day by class, class distribution (100%), median duration per day (per project, never combined), tokens per day (in and out, stacked by model) and cost per day (stacked by model).
- Changing metric or aggregate updates the chart and the URL with no document reload; changing project or window is a client-side navigation; every URL (`?days`, `?project`, `?metric`, `?agg`) reloads into the same view; invalid values fall back to defaults.
- `getSummary(days, project)` keeps its signature, `summaryTag()` and `cacheLife`; no new tag; the revalidation path is untouched; no `Date.now()`/`new Date()` without an argument is added anywhere.
- The served HTML of `/summary` contains the filters and the chart skeletons; recharts never renders on the server.
- Dark mode is readable; no status hue outside `status-colors.ts` (guard test green).
- `src/lib/summary-charts.test.ts`, `src/lib/class-colors.test.ts` and the extended `daily-summary.test.ts` pass; every validation command passes.
- `README.md`, `AGENTS.md` and `.adw/project.md` describe the new page; no em-dashes.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn install --immutable` - the lockfile matches the added `recharts` and `react-is`.
- `yarn lint` - ESLint over the repo, including the security plugin's rules on the new modules.
- `yarn typecheck` - `next typegen` then `tsc --noEmit`; the new row and view-model types and recharts props line up (do not stage `next-env.d.ts`).
- `yarn knip` - no dead exports or files left by the removed components, the new exports are used.
- `yarn format:check` - Prettier clean (run `yarn format` first if needed).
- `yarn test` - the unit layer, including the new `summary-charts.test.ts`, `class-colors.test.ts`, the extended `daily-summary.test.ts` and the status hue guard.
- `yarn build` - production build under `cacheComponents` with `.env.local`; proves no clock read or recharts code runs in a prerender pass and the `/summary` shell still builds.
- `ls .next/cache/fetch-cache 2>/dev/null | wc -l` after the build, and `grep -rl supabase .next/cache/fetch-cache 2>/dev/null` - no Supabase response stored in Next's fetch cache (the new read goes through `getSupabase()`'s `no-store` fetch).

## Notes

- New dependencies: `recharts` (charting) and `react-is` (recharts' peer), added with `yarn add recharts react-is`. Chosen over visx because one package covers scatter, stacked and 100% bars, tooltips with tap, legends and responsive sizing; visx would be several packages plus hand-built axes and tooltips.
- The issue's "render from `model_set` as a single series until that lands" no longer applies: the toolkit's per-model change has landed and dropped `run_metrics.model_set` (`20261006180000_run_metrics_model_usage.sql`). Models come from `phases[].models`. `adw.run_model_usage` and `adw.daily_model_summary` exist but are not read: the daily view keys on `started_at` and would disagree with `adw.daily_summary`'s `finished_at` days, and the run view would be a second request for data the runs read already carries.
- The issue says 26 runs; the hosted database holds 35 finished runs today (34 completed, 1 failed) across three public projects. The acceptance is "every finished run in the window", whatever the count.
- `tokens_in` is fresh (uncached) input since the toolkit's split; cache read and creation tokens are in their own columns. They are read (they are part of `RunMetrics`) but not charted; a "cache tokens" metric is an easy follow-up in `SUMMARY_METRICS`.
- `RunStatus` lists `running | completed | failed`, but finished runs can be `halted` (the view counts them). The chart point carries `status` as a string to avoid widening `RunStatus` in this change; widening it is a separate decision for the Active/History code.
- Revalidation is unchanged: a completion drops `summary` through `historyTags(slug)`; `run_metrics` written after the completion, and failed or halted finishes, still wait at most the 15-minute `revalidate`.
- Do not start a dev server on a port other than the one in `.ports.env`; never write to the hosted Supabase project (the planning probe was read-only with the publishable key).
