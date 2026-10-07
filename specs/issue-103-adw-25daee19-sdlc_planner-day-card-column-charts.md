# Feature: Day card column charts, runs by class and tokens by model

## Metadata

issue_number: `103`
adw_id: `25daee19`
issue_json: `{"number":103,"title":"Day card: replace the class bar with two column charts, runs by class and tokens by model"}`

## Feature Description

Every day card on the summary page (`/`), the past days and the today card alike, currently shows
a full-width horizontal stacked class bar with a legend directly under its header
(`<ClassDistributionBar counts={totals} />` in `src/components/SummaryDayCard.tsx`; the issue
points at `DailySummaryList.tsx`, but since #101 the card markup lives in `SummaryDayCard`, which
both `DailySummaryList` and the client `TodaySummary` render). That bar is replaced by two small
column charts side by side, sharing one baseline and one height:

1. **Runs by class**: one vertical column per class present that day (`/feature`, `/bug`,
   `/chore`, `/patch`, and `other` for runs with no known class, as the bar already counts them),
   height proportional to the run count, the count above the column and the class name below, in
   the existing class colours.
2. **Tokens by model**: one column per model that ran that day, height proportional to the day's
   total tokens for that model across all visible projects (input + cache read + cache creation +
   output), the total as `tokensLabel` text above and a short model name (`Opus`, `Sonnet`,
   `Haiku`) below. Hovering or focusing a column shows the split: input, cache read, cache
   creation, output (and the full model id).

The data for the second chart comes from the toolkit's `adw.daily_model_summary` view, which
nothing in `src` reads yet. It is read in the same boundary functions (and so the same cached
scopes) as the day rows, summed over projects per day and model by a pure helper, and attached to
each `SummaryDay`. The per-project table and its Total row, with their compact class bars, stay
unchanged.

## User Story

As a visitor reading the ADW public ledger on `/`
I want to see at a glance how a day's runs split by issue class and how its tokens split by model
So that I can compare days and spot which model carried the work without reading the table

## Problem Statement

The day card shows the class split as a thin stacked bar, which makes small classes hard to
compare, and it shows nothing about which models consumed the day's tokens. The toolkit already
publishes per-model usage (`adw.daily_model_summary`), but the dashboard does not read it.

## Solution Statement

- Add a `DailyModelSummary` row type and a `DAILY_MODEL_SUMMARY_COLUMNS` select at the data
  boundary. `getSummaryPast` and `getSummaryToday` each read the view in parallel with their
  existing two reads (one `Promise.all`, no extra round trip per card; the page renders every past
  card from one read), with the same day filter as the `daily_summary` read.
- A new pure module `src/lib/model-usage.ts` owns the model side: `modelShortName`,
  `modelFamily` and `sumModelUsage` (sum one day's rows per model). `toSummaryReport` and
  `toSummaryDay` in `src/lib/daily-summary.ts` take the model rows too, drop hidden projects' rows
  with the same project map they already use (so a future one-project filter sums only that
  project, because only that project would be passed in), and attach `models` to each
  `SummaryDay`. Chart geometry is pure too: `classCounts` (the fixed class order, zeros omitted,
  shared with `classSegments`) and `columnHeights` (each value as a percent of the chart's own
  maximum) in `daily-summary.ts`.
- The class colour map moves out of `ClassDistributionBar.tsx` into `src/lib/chart-colors.ts`,
  next to a new small model colour map keyed by family. Both components read it.
- Three stateless presentational components without `"use client"` (they are rendered by the
  client `TodaySummary` too): `ColumnChart` (CSS columns on a shared baseline, CSS-only
  hover/focus detail like `SectionHeading`), `ClassColumnChart` and `ModelColumnChart`, composed in
  a `DayCharts` row that `SummaryDayCard` renders where the bar was.
- `ClassDistributionBar` keeps only its compact form (the table's use); its now unused legend
  branch and `compact` prop are removed.
- No new tag: both reads sit in the scopes that already hold the `daily_summary` read, so
  `summary:today` (dropped by the action and the webhook on every completion) and the existing
  `cacheLife` cover the model rows identically.

## Relevant Files

Use these files to implement the feature:

- `README.md`: the `## Summary` section (Data, Totals, Cache, Revalidation) describes the card and
  the reads; it must describe the charts, the third read and the `started_at` keying of the model
  view.
- `AGENTS.md`: the boundary cast rule (list of casts and column constants), the stateless
  component list, the `## Summary` rules ("Charts are inline SVG ... Class hues match
  `IssueClassBadge`"), the status hue rule. Each needs the new names.
- `.adw/project.md`: the Review section says "past day cards with class bars", and the Tests
  section lists the `e2e/*.md` journeys; both change. Never rename or reorder its `##` headings.
- `src/types/adw.ts`: add `DailyModelSummary` (row) and `SummaryModel` (view model), and
  `models: SummaryModel[]` on `SummaryDay`.
- `src/data/index.ts`: `DAILY_MODEL_SUMMARY_COLUMNS`, the third parallel read in
  `getSummaryPast` and `getSummaryToday`, the cast, and the header comment.
- `src/lib/daily-summary.ts`: `toSummaryReport` and `toSummaryDay` take the model rows;
  `classCounts`, `columnHeights`; `classSegments` built on `classCounts`; `tokensLabel` reused.
- `src/lib/daily-summary.test.ts`: existing `toSummaryReport` / `toSummaryDay` calls get the new
  argument; new cases.
- `src/components/SummaryDayCard.tsx`: replace `<ClassDistributionBar counts={totals} />` with
  `<DayCharts ... />`.
- `src/components/ClassDistributionBar.tsx`: import the fill map from `src/lib/chart-colors.ts`,
  drop the legend, `SWATCH` and the `compact` prop.
- `src/components/ProjectBreakdownTable.tsx`: drop the `compact` attribute on its two
  `ClassDistributionBar` uses (the component is compact only now). Nothing else changes.
- `src/components/TodaySummary.tsx`: no code change expected (it renders `SummaryDayCard` with
  `data`, which now carries `models`); read it to confirm.
- `src/components/IssueClassBadge.tsx`: the class hues the chart must match (reference only).
- `src/components/SectionHeading.tsx`: the CSS-only info popover pattern (group hover,
  `focus-within`, `aria-describedby` with a derived id) the column detail follows.
- `src/lib/layers.ts`, `src/lib/layers.test.ts`: any z-index on the column popover must stay below
  `TOOLTIP_LAYER` (`z-50`).
- `src/lib/status-colors.ts`, `src/lib/status-colors.test.ts`: the model hues must not be
  `emerald`, `amber`, `sky`, `rose` or `red` (the test scans `src/`).
- `src/app/page.tsx`: `getPastDays` and `getTodayState` are where the reads are cached; no change
  expected, read to confirm the reads stay inside them.
- `e2e/test_landing_today_refresh.md`: its step 8 says the Refresh issues exactly a
  `daily_summary` read and at most a `projects` read; it must now also allow exactly one
  `daily_model_summary` read for today.
- `e2e/test_landing_no_filters.md`: read it for the journey format and for assertions on the class
  bar or legend that would break.
- `~/Dev/adw-toolkit/supabase/migrations/20261006200000_model_usage_views.sql` (outside the repo,
  reference only): the view's columns
  `project_id, day, model, runs, input, cache_read, cache_creation, output, cost_usd`, and its
  keying on the UTC day of `runs.started_at` (not `finished_at` like `daily_summary`).
- `node_modules/next/dist/docs/` caching guides (`use cache`, `cacheTag`, `cacheLife`): read
  before touching the summary reads, per the profile's Documentation section.

### New Files

- `src/lib/model-usage.ts`: `modelFamily`, `modelShortName`, `sumModelUsage`, pure.
- `src/lib/model-usage.test.ts`: unit tests for the three.
- `src/lib/chart-colors.ts`: `CLASS_FILL` (moved from `ClassDistributionBar.tsx`, as `fill-*`
  for the SVG bar) and `CLASS_BG` (`bg-*`, same hues, for CSS columns), `MODEL_BG` keyed by
  `ModelFamily`.
- `src/components/ColumnChart.tsx`: the generic presentational column chart.
- `src/components/ClassColumnChart.tsx`: runs by class, built on `ColumnChart`.
- `src/components/ModelColumnChart.tsx`: tokens by model, built on `ColumnChart`.
- `src/components/DayCharts.tsx`: the two charts side by side.
- `e2e/test_day_card_charts.md`: the agent-driven journey the issue asks for.

## Implementation Plan

### Phase 1: Foundation

Types, the pure model module, the colour maps and the chart geometry helpers, all unit-tested
before any component uses them.

### Phase 2: Core Implementation

The boundary reads `adw.daily_model_summary` inside the existing summary reads; `toSummaryReport`
and `toSummaryDay` attach per-day model sums. The chart components are built and `SummaryDayCard`
renders them in place of the full class bar.

### Phase 3: Integration

The today card gets the charts for free through `SummaryDayCard` and `getSummaryToday`. The
existing Refresh journey is updated for the third read, a new journey covers the charts, and
`README.md`, `AGENTS.md` and `.adw/project.md` describe the current code.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the conventions and the caching docs

- Read `AGENTS.md` in full, `README.md` `## Summary`, and the installed `use cache` / `cacheTag` /
  `cacheLife` docs under `node_modules/next/dist/docs/01-app/`.
- Read `~/Dev/adw-toolkit/supabase/migrations/20261006200000_model_usage_views.sql` to confirm the
  column list and types (`runs` int, token columns bigint, `cost_usd` numeric(12,4)).

### 2. Types in `src/types/adw.ts`

- Under "Database rows" (or next to `DailySummary`, keeping the rows/view-model separation of the
  file), add:
  ```ts
  /** One row of adw.daily_model_summary: one project's usage of one model on one UTC day of runs.started_at. */
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
  ```
  Document in its comment that the view keys on `started_at` while `daily_summary` keys on
  `finished_at`.
- Under "View models", add `SummaryModel`: `model` (the id), `runs`, `input`, `cache_read`,
  `cache_creation`, `output`, `total` (the four token columns added), `cost_usd`; and add
  `models: SummaryModel[]` to `SummaryDay`, documented as "the day's usage per model summed over
  the visible projects, largest total first; empty when no run of that day published per-model
  metrics".

### 3. `src/lib/model-usage.ts` and its test

- `export type ModelFamily = "opus" | "sonnet" | "haiku" | "other"`.
- `modelFamily(model: string): ModelFamily`: lowercase the id and return the first of `opus`,
  `sonnet`, `haiku` it contains, else `other`. Handles `claude-opus-4-1-20250805`,
  `claude-sonnet-4-5`, `claude-haiku-4-5-20251001`, a bare `opus`, a `[1m]` suffix.
- `modelShortName(model: string): string`: `Opus`, `Sonnet`, `Haiku` for the three families;
  otherwise the id with a leading `claude-` removed, or the id unchanged (never an empty string:
  an empty id returns `unknown`).
- `sumModelUsage(rows: readonly DailyModelSummary[]): SummaryModel[]`: one entry per distinct
  `model`, every numeric column summed, `total = input + cache_read + cache_creation + output`,
  `cost_usd` rounded to 4 decimals like `dayTotals`, sorted by `total` desc then `model` asc.
  Columns are keyed by model id, not family, so two Opus versions are two columns (the full id is
  in their detail). Never mutates its input. The caller filters by day and visible project.
- `src/lib/model-usage.test.ts` (vitest, same style as `daily-summary.test.ts`): `modelFamily` and
  `modelShortName` for each known id shape, an unknown id (`gpt-x` stays `gpt-x`,
  `claude-foo` becomes `foo`), the empty id; `sumModelUsage` summing two projects' rows of one
  model, keeping two models apart, the total, the ordering (including the tie-break), the cost
  rounding, an empty input returning `[]`, and that the input array is not mutated.

### 4. Chart geometry in `src/lib/daily-summary.ts` and its tests

- `classCounts(day)`: the `[ClassKey, count][]` list `classSegments` builds today (fixed order
  `/feature`, `/bug`, `/chore`, `/patch`, `other`; `other` = `runs - known`, floored at 0), zero
  counts omitted, as `{ key, count }[]`. Rewrite `classSegments` on top of it so the two cannot
  drift; its existing tests must pass unchanged.
- `columnHeights(values: readonly number[]): number[]`: each value as a percent of the maximum
  (the maximum is 100, a zero is 0), all zeros when the maximum is 0 or the list is empty. Each
  chart scales to its own maximum by calling it on its own values.
- Tests in `src/lib/daily-summary.test.ts`: `classCounts` order, zero omission, `other`, runs
  below the known sum; `columnHeights` for `[5, 10]` (50, 100), a single value (100), zeros, an
  empty list.

### 5. Colour maps in `src/lib/chart-colors.ts`

- Move `FILL` from `ClassDistributionBar.tsx` here as `CLASS_FILL: Record<ClassKey, string>`
  (unchanged strings). Add `CLASS_BG` with the same hues as `bg-*` (the strings the deleted
  `SWATCH` held: `bg-violet-500`, `bg-fuchsia-500`, `bg-neutral-400`, `bg-lime-500`,
  `bg-neutral-300 dark:bg-neutral-600`).
- Add `MODEL_BG: Record<ModelFamily, string>` with hues outside both the status palette and the
  class palette, written as full literal strings: `opus` `bg-indigo-500`, `sonnet`
  `bg-teal-500`, `haiku` `bg-orange-400`, `other` `bg-neutral-300 dark:bg-neutral-600`. No
  `emerald`, `amber`, `sky`, `rose` or `red` (pinned by `status-colors.test.ts`).
- File comment: the one place a class or a model gets a chart colour; the class hues are
  `IssueClassBadge`'s.

### 6. Data boundary in `src/data/index.ts`

- Add `DAILY_MODEL_SUMMARY_COLUMNS = "project_id, day, model, runs, input, cache_read, cache_creation, output, cost_usd"`,
  equal to the fields of `DailyModelSummary`.
- `getSummaryPast(today, days)`: add a third member to the existing `Promise.all`:
  `getSupabase().from("daily_model_summary").select(DAILY_MODEL_SUMMARY_COLUMNS).gte("day", from).lt("day", today)`.
  Throw `daily_model_summary: <message>` on error, like the `daily_summary` read. Cast the rows
  to `DailyModelSummary[]` once, here, and pass them to `toSummaryReport`.
- `getSummaryToday(today)`: same third read with `.eq("day", today)`, passed to `toSummaryDay`.
- Signatures of both exports stay the same; no new export; the query key and the `"use cache"`
  scopes in `src/app/page.tsx` stay untouched (the reads already run inside them, so both are
  covered by `summary:past` / `summary:today` and their `cacheLife`).
- Update the file header comment's summary paragraph to mention the view.

### 7. Assembly in `src/lib/daily-summary.ts`

- `toSummaryReport(rows, modelRows, projects, options)`: group `modelRows` by `day`, dropping a
  row whose `project_id` is not in the project map (same rule as the day rows: RLS or a filter
  hides it); each day of the report gets `models: sumModelUsage(thatDaysRows)` (or `[]`). A day
  that has model rows but no `daily_summary` row is not added (cards exist only for days with
  finished runs; the view keys on `started_at`, so such a day is a run started then and finished
  later).
- `toSummaryDay(rows, modelRows, projects, day)`: filters both arrays by `day` and delegates, as
  today.
- Update the module header comment (model rows, charts' helpers) and the doc comments.
- Tests in `src/lib/daily-summary.test.ts`: update every existing call with a `[]` model argument
  (and `models: []` in expected days where a whole day is compared); add cases: models summed
  over two projects on one day and attached to that day only; a hidden project's model rows
  dropped; a model-only day not creating a day; `toSummaryDay` ignoring other days' model rows;
  `models` empty when no model rows exist.

### 8. Chart components

- `src/components/ColumnChart.tsx` (no `"use client"`, no hooks, no server-only imports):
  props `title: string` (e.g. `Runs by class`), `idPrefix: string`, `columns: { key: string;
value: number; valueLabel: string; name: string; ariaLabel: string; colorClass: string;
detail?: { label: string; value: string }[] }[]`, `summary: string` (the text alternative).
  Calls `columnHeights` on the values. Renders a `<figure>` with a visible small `figcaption`
  (`title`) and an `sr-only` paragraph with `summary`; then a `<ul>` (`flex items-end gap-2`) of
  `<li>` columns. Every column: value label above (`text-xs tabular-nums`), a fixed-height plot
  box (`h-12`, the shared height, `flex items-end`) holding a `w-6` bar with
  `style={{ height: "<pct>%" }}` and a `min-h-px` so a tiny value stays visible, then the name
  below (`text-xs`, truncate). All columns of both charts sit on the bottom of identical `h-12`
  boxes, so the baseline is shared. A column with `detail` is `tabIndex={0}`, `aria-label` its
  value, `aria-describedby` an id derived from `idPrefix` and `key` (sanitised to
  `[A-Za-z0-9_-]`), and holds a CSS-only popover (`hidden group-hover:block
group-focus-within:block`, positioned above the column, a z-index below `TOOLTIP_LAYER`, for
  instance `z-10`) listing the detail rows. Like `SectionHeading`, the popover is always in the
  DOM. A column without `detail` still carries `aria-label` (on the `li`, `role` not needed).
  Takes `value` and all labels ready-made; it computes no business value.
- `src/components/ClassColumnChart.tsx`: props `counts` (the same `Pick<DailySummary, "runs" |
"features" | "bugs" | "chores" | "patches">` as the bar), `day: string`. Builds columns from
  `classCounts(counts)`: `valueLabel` the count, `name` the class key (`font-mono`),
  `ariaLabel` `"/feature: 5 runs"`, `colorClass` `CLASS_BG[key]`, `summary`
  `"Runs by class: 5 /feature, 2 /bug"`. No columns: renders nothing.
- `src/components/ModelColumnChart.tsx`: props `models: SummaryModel[]`, `day: string`. Columns
  from `models`: `valueLabel` `tokensLabel(total)`, `name` `modelShortName(model)`, `ariaLabel`
  `"<model id>: <tokensLabel(total)> tokens"`, `colorClass` `MODEL_BG[modelFamily(model)]`,
  `detail` rows `Model` (full id), `Input`, `Cache read`, `Cache creation`, `Output`, each
  through `tokensLabel`. `summary` `"Tokens by model: Opus 4.6M, Sonnet 1.2M"`. When `models` is
  empty, render the figure with its caption and a muted `No per-model usage published.` text in a
  box of the same height, so the two charts keep their alignment.
- `src/components/DayCharts.tsx`: props `day: SummaryDay`; renders `ClassColumnChart` and
  `ModelColumnChart` in one row (`flex flex-wrap gap-x-8 gap-y-3 items-end`), the class chart
  first; the id prefix of each chart includes `day.day` and the chart name, so the today card and
  a past card never share an id.
- `src/components/SummaryDayCard.tsx`: replace the `ClassDistributionBar` import and element with
  `<DayCharts day={day} />` in the same place, directly after `</header>`. Update the doc comment
  ("class bar" becomes "class and model charts").
- `src/components/ClassDistributionBar.tsx`: import `CLASS_FILL` from `@/lib/chart-colors`; delete
  `SWATCH`, the legend and the `compact` prop (the wrapper keeps `min-w-24`); update its comment
  (the per-project table's bar). `src/components/ProjectBreakdownTable.tsx`: drop `compact` on
  both uses.
- Check `yarn knip`: nothing exported and unused (`classSegments` stays used by the bar).

### 9. E2E journeys

- Create `e2e/test_day_card_charts.md` (`## User Story`, `## Test Steps` with numbered steps and
  `**Verify**` lines, `## Success Criteria`), modelled on `e2e/test_landing_today_refresh.md`.
  This is the one place the rendered charts are checked: the profile has no component test layer
  and no Playwright code suite, and the issue asks for this journey. Steps:
  1. Navigate to `/`.
  2. Take the first day card that has runs (the today card when it has runs, else the first past
     card). **Verify** directly below its header there is a figure captioned `Runs by class` and
     one captioned `Tokens by model`, side by side at 1920x1080.
  3. **Verify** the class chart has one column per class with a non-zero count, each with an
     `aria-label` like `/feature: N runs`, the count above and the class name below, and that the
     counts add up to the header's `N runs`.
  4. **Verify** the model chart shows columns with a short name (`Opus`, `Sonnet` or `Haiku`, or
     another short id) and a token label above, or the text `No per-model usage published.`
  5. When the model chart has a column, focus it (`browser_press_key` Tab until it is focused, or
     `browser_hover`) and **Verify** the split with `Input`, `Cache read`, `Cache creation` and
     `Output` becomes visible.
  6. **Verify** the card's area between the header and the per-project table holds no list with
     the class legend (no `li` with a swatch and a class name outside the two figures); the
     per-project table below still has its compact class bars (an `svg` with `aria-label`
     starting `Issue classes:` inside the table).
  7. **Verify** the server-rendered HTML (`browser_evaluate`
     `fetch("/").then((r) => r.text())`) contains `Runs by class` and `Tokens by model`.
  8. Resize to 375x667 and **Verify** both charts are visible without horizontal page overflow.
  9. Take screenshots at 1920x1080 and at 375x667.
- Update `e2e/test_landing_today_refresh.md` step 8 and its Success Criteria: after the click,
  exactly one `GET` to `.../rest/v1/daily_summary` with `day=eq.<today>`, exactly one `GET` to
  `.../rest/v1/daily_model_summary` with `day=eq.<today>`, at most one `GET` to
  `.../rest/v1/projects`, and nothing to the application origin.
- Check `e2e/test_landing_no_filters.md` for any assertion on the class bar or its legend and
  update it to the charts.

### 10. Documentation

- `README.md` `## Summary`: the opening paragraph (the class split as two column charts, runs by
  class and tokens by model, with the hover/focus split, replacing the stacked bar; the table keeps
  its compact bars); **Data** (the third read of `adw.daily_model_summary`, `DailyModelSummary`,
  `sumModelUsage` in `src/lib/model-usage.ts`, its keying on the UTC day of `started_at`, so a
  run that spans midnight can sit on different days in the two views, and a day with model rows
  but no finished run is not shown); **Revalidation** (the model rows are in the same scopes, so
  the same tags and lifetimes cover them; per-model metrics written after a completion are bounded
  like the other metrics, by the 60-second today scope and Refresh).
- `AGENTS.md`:
  - Boundary cast rule: add `DailyModelSummary[]` for `daily_model_summary` and
    `DAILY_MODEL_SUMMARY_COLUMNS` equal to the fields of `DailyModelSummary`.
  - The data boundary paragraph: `getSummaryPast` and `getSummaryToday` also read the model view
    in the same `Promise.all`.
  - The stateless list: add `DayCharts`, `ColumnChart`, `ClassColumnChart` and
    `ModelColumnChart`, rendered by the client `TodaySummary` too, so stateless and free of
    server-only imports.
  - `## Summary`: the chart rule becomes "Charts are inline SVG or CSS columns with their values
    also as text; no charting library. Class colours come only from `CLASS_FILL`/`CLASS_BG` and
    model colours only from `MODEL_BG` in `src/lib/chart-colors.ts`; class hues match
    `IssueClassBadge`." Add: model aggregation and short names live in `src/lib/model-usage.ts`,
    pure and tested, every change with a test case; `columnHeights` and `classCounts` in
    `daily-summary.ts`.
  - The `src/types/adw.ts` rule: mention `DailyModelSummary` among the row types.
- `.adw/project.md`: Review section "past day cards with class bars" becomes "past day cards with
  their runs-by-class and tokens-by-model charts"; Tests section journey list adds
  `e2e/test_day_card_charts.md` (and the two journeys already present but missing from the list,
  `test_queue_row_single_line.md` and `test_section_tooltip_layering.md`, only if verified to
  exist). Headings untouched.
- No em-dashes anywhere.

### 11. Run the validation commands

- Run every command under `Validation Commands`, in order, and fix anything that fails without
  weakening a rule, a type or a test.

## Testing Strategy

### Unit Tests

- `src/lib/model-usage.test.ts` (new): `modelFamily`, `modelShortName`, `sumModelUsage`.
- `src/lib/daily-summary.test.ts` (extended): `classCounts`, `columnHeights`, model rows in
  `toSummaryReport` and `toSummaryDay`, and the existing `classSegments` cases unchanged as the
  regression check for the refactor onto `classCounts`.
- `src/lib/status-colors.test.ts` and `src/lib/layers.test.ts` (existing, unchanged) guard the new
  colour map and the popover's z-index.

### Test Coverage

- `src/lib/model-usage.test.ts`, unit layer (`yarn test`): catches a wrong per-model sum across
  projects, a missing cache-creation term in the total, a wrong order, and a wrong short name;
  fails without the feature because the module does not exist.
- `src/lib/daily-summary.test.ts` new cases, unit layer: catches model rows attached to the wrong
  day, a hidden project's tokens leaking into a day's chart, a model-only day creating a card,
  column heights not scaled to their own maximum; fail without the feature (no `models`, no
  `columnHeights`, no `classCounts`).
- The rendered charts themselves have no automated regression layer in this repository (no
  component tests, E2E code suite `none`); `e2e/test_day_card_charts.md` is the opt-in acceptance
  journey the issue requests and is listed as a task, not here.

### Edge Cases

- A day whose runs published no per-model metrics (published before the per-model change):
  `models` is `[]`, the model chart shows its placeholder with the same height, the class chart is
  unaffected.
- A day with one class only, or one model only: one full-height column.
- Two versions of one family on the same day: two columns, both named `Opus`, told apart by the
  full id in their `aria-label` and detail.
- A model id outside the three families: `other` colour, the id without `claude-` as name.
- Runs with no known class: an `other` column, as the bar counted them.
- A tiny value next to a large one: the column keeps a 1px minimum and its value label.
- A hidden (RLS) project: its model rows are dropped like its day rows.
- A run started before UTC midnight and finished after it: its tokens sit on the start day in the
  model chart and on the finish day in the counts; a model-only day is not rendered.
- The today card with no finished runs yet: unchanged empty state, no charts.
- The same day on the today card and as a past card cannot both render (the past window ends
  yesterday), but ids include the chart name and day so nothing collides anyway.
- Mobile 375px: the two charts wrap onto two lines rather than overflow.

## Acceptance Criteria

- Every day card on `/` (past and today) shows, directly under its header, a `Runs by class` and a
  `Tokens by model` column chart side by side with a shared baseline and height, and no stacked
  class bar or class legend there.
- Class columns: one per class present, height by count, count above, class name below, class
  colours from `src/lib/chart-colors.ts` matching `IssueClassBadge`.
- Model columns: one per model that ran that day, height by total tokens (input + cache read +
  cache creation + output summed over visible projects), `tokensLabel` above, short name below,
  the four-way split (and the full id) on hover and on keyboard focus.
- Each chart scales to its own maximum; each column has an `aria-label` with its value; each chart
  has a text alternative.
- The per-project table and its Total row keep their compact class bars; `ClassDistributionBar`
  is still used there.
- `adw.daily_model_summary` is read only in `src/data/index.ts`, inside `getSummaryPast` and
  `getSummaryToday`'s existing `Promise.all`, cast once to `DailyModelSummary[]`; no new query
  key, tag, scope or dependency.
- The today card's Refresh refetches today's model rows too, and nothing else changes in its
  behaviour.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test` and `yarn build`
  pass; `README.md`, `AGENTS.md` and `.adw/project.md` describe the new state.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint`: ESLint, including the React hooks purity rules (the chart components must read no
  clock).
- `yarn typecheck`: `next typegen` and `tsc --noEmit`; catches a `SummaryDay` built without
  `models` and stale `compact` props.
- `yarn knip`: no unused export after moving the colour map and removing the legend variant.
- `yarn format:check`: Prettier on every touched file, including the specs and journeys.
- `yarn test`: the new `model-usage` and extended `daily-summary` tests, plus the
  `status-colors` and `layers` scans over the new components.
- `yarn build`: proves the summary scopes still compile under `cacheComponents` and that the
  boundary reads type-check against a real build (the summary reads themselves are request-time).

## Notes

- No new dependency. Charts are CSS columns (the plot is a div with a percentage height), which
  makes the hover/focus popover and keyboard focus simple; the issue allows SVG or CSS.
- The issue names `DailySummaryList.tsx` line 55; since #101 that markup moved into
  `SummaryDayCard.tsx`, which is also the today card's, so one change covers both as the issue's
  "Coordinate with #101" asks.
- "If the summary page is filtered to one project": `/` has no filters since #97. The aggregation
  sums only the rows of the projects passed into `toSummaryReport` / `toSummaryDay`, so a future
  filter that narrows that list narrows the model chart with it; nothing else is built for it.
- Revalidation: no webhook or tag change. `daily_model_summary` derives from `run_metrics` joined
  to `runs`; the reads live in the scopes already tagged `summary:today` (dropped on every
  completion by the action and the webhook) and `summary:past`. Metrics published after the
  completion event are the same gap the token sums already have, bounded by the today scope's
  60-second `revalidate`, Refresh, and the past scope's one-day `revalidate`.
- The view keys on `runs.started_at`, `daily_summary` on `finished_at`. Showing model tokens of
  runs that started on a day next to the counts of runs that finished on it is a known, documented
  mismatch; aligning them would need a toolkit view change (`adw-toolkit/supabase`) and is out of
  scope.
- `cost_usd` is read and summed but not shown in this chart; it is kept in `SummaryModel` because
  the column is part of the row type (the select equals the type) and a later cost-by-model view
  can use it. Drop it from `SummaryModel` instead if knip or review prefers no unused field.
