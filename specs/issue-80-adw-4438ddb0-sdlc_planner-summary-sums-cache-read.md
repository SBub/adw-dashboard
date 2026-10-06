# Feature: Summary page shows sums instead of medians, with a cache-read column

## Metadata

issue_number: `80`
adw_id: `4438ddb0`
issue_json: `{"number":80,"title":"Summary page: sums instead of medians, with a cache-read column","body":"Depends on SBub/adw-toolkit issue \"metrics: daily_summary gains duration and cache-read sums\" (the view must expose duration_sum_s, tokens_cache_read_sum, tokens_cache_creation_sum before this runs). Change the /summary page to totals only, no medians anywhere: 1. Day summary strip (across all projects that day): Total duration, Tokens in, Cache read, Tokens out, Cost. Each is the sum of the project rows below. 2. Per-project table columns, in this order: Project, Runs, Completed, Failed, Classes (bar, unchanged), Total duration, Tokens in, Cache read, Tokens out, Cost. Each value is that project's sum for the day from adw.daily_summary (duration_sum_s, tokens_in_sum, tokens_cache_read_sum, tokens_out_sum, cost_usd_sum). Remove the sum / median pairs and the median per project labels. 3. Day header (date, runs, completed, failed, class bar with counts) unchanged. 4. Formatting: durations as 1h 20m / 16m 10s via the existing durationLabel; tokens with the existing k/M formatting; cost in dollars with two decimals. Note that tokens_in is fresh input only since the toolkit's four-way split, so it is small; cache read is the large figure and is why the column exists. 5. Update the data types and the query (getDailySummary), unit tests for the strip totals being the sum of the rows, and the page's cached read stays as is (same tags and revalidation)."}`

## Feature Description

`/summary` currently shows, per UTC day, a strip with a median duration and three "sum plus median" metrics (tokens in, tokens out, cost), where every all-projects median reads `per project`, and a per-project table whose columns are `Median duration`, `Tokens in (sum / median)`, `Tokens out (sum / median)` and `Cost (sum / median)`.

Since the toolkit split token usage four ways, `tokens_in` is only the fresh (uncached) input and is small; the bulk of the prompt is cache read, which the page does not show at all. Medians across projects also cannot be combined, so the all-projects strip is mostly `per project` placeholders.

This feature turns the page into totals only:

- The day strip shows five sums across the day's projects: Total duration, Tokens in, Cache read, Tokens out, Cost. Each equals the sum of the project rows in the table below.
- The per-project table columns are, in order: Project, Runs, Completed, Failed, Classes (bar, unchanged), Total duration, Tokens in, Cache read, Tokens out, Cost, each the project's sum for the day from `adw.daily_summary`.
- The day header (date, runs, completed, failed, halted, class bar with counts) is unchanged.
- No median appears anywhere: not in the type, not in the query, not in the report, not in the UI, not in the copy.

## User Story

As the operator of the ADW toolkit
I want each day of the summary to show how much time, fresh input, cache read, output and money my runs took in total, per project and across projects
So that I can see where the real token volume (cache read) and the cost go, without `per project` placeholders standing in for numbers

## Problem Statement

The summary page reports medians that cannot be combined across projects (so the all-projects strip shows `per project` for four of its values) and omits cache read, which after the toolkit's four-way token split is by far the largest token figure. "Tokens in" alone now understates input volume by orders of magnitude, so the page misleads about where tokens and cost go.

## Solution Statement

Read the toolkit view's new sum columns and drop the median columns at the one data boundary, then let the existing pure assembly add every metric across a day's projects:

1. `DailySummary` (`src/types/adw.ts`) loses `median_duration_s`, `tokens_in_median`, `tokens_out_median`, `cost_usd_median` and gains `duration_sum_s` and `tokens_cache_read_sum`. `DAILY_SUMMARY_COLUMNS` in `src/data/index.ts` changes to exactly those fields.
2. `dayTotals` in `src/lib/daily-summary.ts` becomes a pure sum of every count and every sum field (cost still rounded to four decimals against float noise); the "a median only when there is one project" branch disappears. Unit tests pin that the strip totals equal the sum of the rows.
3. `DailySummaryList` renders five plain metrics; `ProjectBreakdownTable` renders the ten columns in the issue's order. Durations go through `secondsLabel` (the seconds sibling of `durationLabel`, same `formatDuration`, so `1h 20m` / `16m 10s`), tokens through `tokensLabel`, cost through `costLabel`.
4. The cache scope `getSummary` (tag `summary`, `cacheLife`), the island, the filters and the revalidation path are untouched.
5. `README.md` and `AGENTS.md` are edited in place: the "Medians across projects" rule and paragraph become a "sums only" rule.

## Relevant Files

Use these files to implement the feature:

- `AGENTS.md` - Repository rules. The "Summary" section's median rule must be replaced; the `secondsLabel` mention under "Architecture" names `median_duration_s` and must name `duration_sum_s`. Also the `DAILY_SUMMARY_COLUMNS` equals the fields of `DailySummary` rule, the "every change to `daily-summary.ts` goes with a test case" rule and the "label format changes go with a test case" rule apply.
- `README.md` - The intro paragraph (line ~27, "median duration") and the "Summary" section (lines ~1150-1210: data paragraph, the `secondsLabel` sentence, "Medians across projects") describe medians and must describe sums and cache read instead.
- `.adw/project.md` - Read only. Its Review section already lists `/summary` and `/summary?project=...`; nothing in it changes (no script, port, env file or doc location moves).
- `src/types/adw.ts` - `DailySummary` (view columns read by the page), `SummaryDay` (doc comment says medians are kept for one project), `SummaryProjectDay`. Field changes and comment updates.
- `src/data/index.ts` - `DAILY_SUMMARY_COLUMNS` and the `getDailySummary` doc comment ("medians never are"). The query shape (three reads, anchor, window) stays.
- `src/lib/daily-summary.ts` - `dayTotals` and the `toSummaryReport` doc comment; `tokensLabel` and `costLabel` are reused unchanged.
- `src/lib/daily-summary.test.ts` - The `row()` fixture, the "adds counts and sums ... no median of medians" case, the "keeps the exact medians" case; new sum cases go here.
- `src/lib/run-view.ts` - `secondsLabel`, which formats the summary's duration in the `durationLabel` format. Its doc names `median_duration_s`; with no `null` caller left its signature narrows to `(seconds: number): string`.
- `src/lib/run-view.test.ts` - `secondsLabel` cases; the `null` case goes, the issue's two example labels are added.
- `src/components/DailySummaryList.tsx` - The day strip (`Metric`, the `median` helper, the `detail` prop).
- `src/components/ProjectBreakdownTable.tsx` - The per-project table header and cells.
- `src/app/summary/page.tsx` - The page description says "Medians are over runs that published metrics."; `getSummary` and `SummaryContent` stay exactly as they are.
- `src/components/ClassDistributionBar.tsx` - Read only: takes `counts` (`runs`, `features`, `bugs`, `chores`, `patches`), which the totals keep.
- `node_modules/next/dist/docs/` - Read only, per the profile, before touching anything near caching. Nothing in this change alters a cache scope, a tag or a `cacheLife`.

### New Files

None.

## Implementation Plan

### Phase 1: Foundation

Change the shape at the boundary: `DailySummary` fields and `DAILY_SUMMARY_COLUMNS`, kept equal to each other. The new columns come from the toolkit's view change (dependency named in the issue); the median columns are simply no longer selected (whether the view still carries them does not matter to the page). `tokens_cache_creation_sum`, which the view also gains, is not selected: the issue shows no cache-creation figure, and selecting an unused column would be a field nothing reads (see Notes).

### Phase 2: Core Implementation

Make `dayTotals` a sum of every metric, then rebuild the two components: the strip as five `Metric`s with no detail line, the table as ten columns. Narrow `secondsLabel` to non-null input and give it the issue's examples as test cases.

### Phase 3: Integration

The cached read is unchanged: `getSummary` still calls `getDailySummary(days, project)` under `summaryTag()` with the same `cacheLife`, so revalidation via `historyTags(slug)` and the route handler is unaffected. Update the page description and the two documentation files so they describe sums and cache read.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the rules and the current code

- Read `AGENTS.md` sections "Architecture" (the `durationLabel` / `secondsLabel` bullet, the casts bullet) and "Summary", and `README.md` "Summary".
- Read `src/lib/daily-summary.ts`, `src/lib/daily-summary.test.ts`, `src/types/adw.ts` (summary section), `src/data/index.ts` (`DAILY_SUMMARY_COLUMNS`, `getDailySummary`), `src/components/DailySummaryList.tsx`, `src/components/ProjectBreakdownTable.tsx`, `src/lib/run-view.ts` and its test.

### 2. Change `DailySummary` and the summary types

- In `src/types/adw.ts`, `DailySummary` becomes, in this order:
  `project_id`, `day`, `runs`, `completed`, `failed`, `halted`, `features`, `bugs`, `chores`, `patches`, `duration_sum_s: number`, `tokens_in_sum: number`, `tokens_cache_read_sum: number`, `tokens_out_sum: number`, `cost_usd_sum: number`.
- Rewrite its doc comment: one row per project per UTC day, the columns the summary page reads from `adw.daily_summary`; `duration_sum_s` is the sum of the finished runs' wall-clock durations in seconds; the token and cost sums are over the runs that published metrics (`adw.run_metrics`) and are 0 when none did; `tokens_in_sum` is fresh (uncached) input only since the toolkit's four-way split, `tokens_cache_read_sum` is the cached prompt read and is the large figure.
- Rewrite the `SummaryDay` comment: `totals` adds every count and every sum across the day's projects; there are no medians.
- Update the file header comment (line ~5, "column for column") if it still claims the type mirrors the whole view.

### 3. Change the query columns

- In `src/data/index.ts` set
  `DAILY_SUMMARY_COLUMNS = "project_id, day, runs, completed, failed, halted, features, bugs, chores, patches, duration_sum_s, tokens_in_sum, tokens_cache_read_sum, tokens_out_sum, cost_usd_sum"`, exactly the fields of `DailySummary`.
- In the `getDailySummary` doc comment replace "counts and sums are added across projects, medians never are" with "every count and sum is added across projects". Leave the three reads, the anchor, the window and the cast as they are.

### 4. Make the day totals pure sums, test first

- In `src/lib/daily-summary.test.ts`:
  - Update `row()` to the new `DailySummary` fields (all sums default `0`, no median fields).
  - Replace "adds counts and sums across projects and shows no median of medians" with "the day's totals are the sum of its project rows": two project rows with distinct non-zero `duration_sum_s` (e.g. 600 and 4200), `tokens_in_sum`, `tokens_cache_read_sum` (e.g. 1_200_000 and 3_400_000), `tokens_out_sum`, `cost_usd_sum`, plus the counts; assert each total equals the row values added, and additionally assert, for every numeric field of `totals` except `day`, that it equals `projects.reduce` of the same field (so a future field that is not summed fails).
  - Replace "keeps the exact medians when one project contributed" with "a single project's totals equal its row" (the totals are `row` minus `project_id`).
  - Add "carries no median": `Object.keys(totals)` contains no key matching `/median/`.
  - Keep the ordering, dropped-row, rounding (cost 0.1 + 0.2 is 0.3), window passthrough and non-mutation cases, adjusted only for the fixture.
- In `src/lib/daily-summary.ts`, rewrite `dayTotals` to sum `runs`, `completed`, `failed`, `halted`, `features`, `bugs`, `chores`, `patches`, `duration_sum_s`, `tokens_in_sum`, `tokens_cache_read_sum`, `tokens_out_sum`, and `cost_usd_sum` (still `Math.round(... * 1e4) / 1e4`); remove the `only` single-project branch and its comment. Update its doc comment and the `toSummaryReport` doc comment (drop the median sentence).

### 5. Narrow `secondsLabel`, with test cases

- In `src/lib/run-view.test.ts`: remove the "is null for null" case; add `secondsLabel(4800)` is `"1h 20m"` and `secondsLabel(970)` is `"16m 10s"` (the issue's two examples); keep the fractional and the hours cases.
- In `src/lib/run-view.ts`: `export function secondsLabel(seconds: number): string`, returning `formatDuration(seconds * SECOND)`; the doc names the summary's `duration_sum_s`.

### 6. Rebuild the day strip

- In `src/components/DailySummaryList.tsx`:
  - Delete the `median` helper, the `medianOf` closure and `Metric`'s `detail` prop.
  - The `<dl>` holds five metrics in this order: `Total duration` (`secondsLabel(totals.duration_sum_s)`), `Tokens in` (`tokensLabel(totals.tokens_in_sum)`), `Cache read` (`tokensLabel(totals.tokens_cache_read_sum)`), `Tokens out` (`tokensLabel(totals.tokens_out_sum)`), `Cost` (`costLabel(totals.cost_usd_sum)`).
  - Grid: `grid-cols-2 sm:grid-cols-5` so the five fit one row from `sm` up and wrap two per row on a phone.
  - The header (date, runs, completed, failed, halted) and `ClassDistributionBar` stay byte for byte.
  - No new colour classes (the status-colour scan in `src/lib/status-colors.test.ts` must stay green).

### 7. Rebuild the per-project table

- In `src/components/ProjectBreakdownTable.tsx`:
  - Header columns in order: `Project`, `Runs`, `Completed`, `Failed`, `Classes`, `Total duration`, `Tokens in`, `Cache read`, `Tokens out`, `Cost` (numeric ones right-aligned as now).
  - Cells: `secondsLabel(row.duration_sum_s)`, `tokensLabel(row.tokens_in_sum)`, `tokensLabel(row.tokens_cache_read_sum)`, `tokensLabel(row.tokens_out_sum)`, `costLabel(row.cost_usd_sum)`; no " / " pairs.
  - Keep `overflow-x-auto`; adjust `min-w-[44rem]` only if the ten columns crowd (shorter headers likely keep it fine).
  - Doc comment: "One day's rows per project, each value that project's sum for the day."

### 8. Update the page copy

- In `src/app/summary/page.tsx` replace the description's "Medians are over runs that published metrics." with a sums sentence, e.g. "Finished runs per UTC day: what kind of work, how long, and what it cost. Totals per day; tokens and cost count runs that published metrics." Do not touch `getSummary`, its `cacheTag`, its `cacheLife`, `SummaryContent` or the `SectionBoundary`.

### 9. Update the documentation

- `README.md`: intro line ~27 ("median duration, tokens and cost") becomes "total duration, tokens (fresh input, cache read, output) and cost"; in "Summary" rewrite the first paragraph (sums, the five metrics, the ten table columns), the "Data" paragraph (new columns, sums are 0 when no run published metrics, `tokens_in` fresh input only and cache read the large figure; `secondsLabel` formats `duration_sum_s`), and replace "Medians across projects" with a short "Totals" paragraph: every value is a sum, a day's strip is the sum of its project rows, nothing is a median.
- `AGENTS.md`: in the `durationLabel` bullet, `secondsLabel` "formats the summary's `duration_sum_s`"; replace the "Medians across projects are never combined" bullet with: "The summary shows sums only. A day's totals are the sum of its project rows (`dayTotals` in `src/lib/daily-summary.ts`), and no median is read, assembled or shown; a median cannot be combined across projects, so do not reintroduce one without a per-project-only display."
- No em-dashes in any edit.

### 10. Browser evidence for the review phase

- The profile's E2E code suite is `none` and there is no component test layer, so no spec is added; the review phase screenshots, per the profile's Review section, at desktop 1920x1080 and mobile 375x667, full page:
  - `/summary`: each day card shows the unchanged header and class bar, then a strip of exactly five labelled values (Total duration, Tokens in, Cache read, Tokens out, Cost) with no `median` or `per project` text; under it a table with exactly the ten columns in the issue's order, no " / " pairs. On mobile the strip wraps two per row and the table scrolls horizontally inside its card.
  - `/summary?project=SBub/issebya-homes-ai-system` (or the first listed project): one card per day with the same five-value strip and no table.
  - Spot-check one day: the strip's Cache read equals the table's Cache read values added (within the k/M rounding).
- No `e2e/*.md` journey: the totals rule is pinned deterministically by unit tests, and the layout is the reviewer's screenshot job.

### 11. Run the validation commands

- Run every command under `Validation Commands`, in order, and fix anything that fails without weakening a rule, type or test.

## Testing Strategy

### Unit Tests

- `src/lib/daily-summary.test.ts`:
  - Totals are the sum of the project rows for every count and every sum field, including `duration_sum_s` and `tokens_cache_read_sum`, checked both with literal values and generically against `projects.reduce` per field.
  - A single project's totals equal its row (minus `project_id`).
  - Totals carry no median key.
  - Existing ordering, dropping of hidden projects, cost rounding, passthrough and non-mutation cases keep passing with the new fixture.
- `src/lib/run-view.test.ts`: `secondsLabel(4800)` is `1h 20m`, `secondsLabel(970)` is `16m 10s`; existing fraction and hours cases kept.

### Test Coverage

- Unit (`src/**/*.test.ts`, vitest), `daily-summary.test.ts` "the day's totals are the sum of its project rows": catches a strip that does not add `duration_sum_s` / `tokens_cache_read_sum` (today `dayTotals` has neither, so the totals lack them and the case fails) or any metric left out of the sum.
- Unit, `daily-summary.test.ts` "carries no median": catches a median sneaking back into the report (fails today: `dayTotals` returns four median keys).
- Unit, `run-view.test.ts` `secondsLabel` examples: pins the issue's two duration formats for the summed seconds (the narrowed signature also makes the removed `null` case a type error, so it must go).
- The components (`DailySummaryList`, `ProjectBreakdownTable`) have no test layer in this project (profile: no component tests, E2E `none`); their column order and the absence of median text are verified by the review phase's screenshots (task 10).

### Edge Cases

- A day where no run published metrics: token and cost sums are 0 and render `0` and `$0.00` (not `n/a`); duration is still a real sum.
- A cost under a cent renders `<$0.01`; float noise in the summed cost (0.1 + 0.2) is rounded to four decimals.
- Cache read in the billions renders with `B` (`tokensLabel` already covers it).
- A day total of several hours renders `Nh MMm`, uncapped hours (`49h 12m`), from `formatDuration`.
- Fractional `duration_sum_s` (a numeric column) floors to whole seconds.
- Single-project filter: strip equals that project's row; no table.
- A row whose project is hidden by RLS is still dropped before summing.
- Empty window: the "No finished runs in this window." panel is unchanged.

## Acceptance Criteria

- `DailySummary` has exactly the fields `project_id, day, runs, completed, failed, halted, features, bugs, chores, patches, duration_sum_s, tokens_in_sum, tokens_cache_read_sum, tokens_out_sum, cost_usd_sum`, and `DAILY_SUMMARY_COLUMNS` lists exactly those.
- `grep -rn -i median src` finds nothing (types, data, lib, components, page copy, tests).
- Each day's strip shows Total duration, Tokens in, Cache read, Tokens out, Cost, in that order, each the sum of the project rows; the unit test proves it for every field.
- The per-project table's columns are Project, Runs, Completed, Failed, Classes, Total duration, Tokens in, Cache read, Tokens out, Cost, with single values.
- The day header and class bar are unchanged.
- Durations read like `1h 20m` / `16m 10s`; tokens like `12.3k` / `4.6M`; cost like `$12.35`.
- `getSummary` keeps `cacheTag(summaryTag())` and `cacheLife({ stale: 300, revalidate: 900, expire: 86400 })`, called only from `SummaryContent`.
- `README.md` and `AGENTS.md` describe sums and cache read, with no median rule left; no em-dashes.
- All validation commands pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `grep -rn -i median src` - must print nothing: no median left in code, copy or tests.
- `yarn lint` - ESLint over the changed components, lib and tests.
- `yarn typecheck` - proves `DailySummary`, `SummaryDay` totals, both components and the narrowed `secondsLabel` agree (do not stage the rewritten `next-env.d.ts`).
- `yarn knip` - no dead export or file left after removing the median helper.
- `yarn format:check` - Prettier on every changed file (`yarn format` to fix).
- `yarn test` - the new totals and `secondsLabel` cases, plus the status-colour scan and every existing suite.
- `yarn build` - reads `adw.daily_summary` with the new column list against the hosted view at build time paths and compiles `/summary`; a missing `duration_sum_s` or `tokens_cache_read_sum` column (toolkit dependency not yet applied) surfaces here or on the first `/summary` request as a PostgREST error in the section's error panel.

## Notes

- Dependency: the toolkit change "metrics: daily_summary gains duration and cache-read sums" must be applied to the hosted Supabase project first. Nothing here writes to the database (Protected). If the columns are missing, the `/summary` island shows its `SectionBoundary` error panel rather than breaking the page; do not add a fallback select.
- The sums are typed `number`, not nullable, matching the existing `tokens_in_sum` / `cost_usd_sum` contract (the view coalesces to 0). If the toolkit's view ever returns `null` for a sum, the right fix is a `coalesce` in the view, not a null branch here.
- `tokens_cache_creation_sum` is exposed by the view but not selected: the issue's strip and table show no cache-creation figure, and a selected column nothing renders would be dead weight. Adding it later means one field in `DailySummary`, one entry in `DAILY_SUMMARY_COLUMNS`, one line in `dayTotals` and its test, and a column.
- The issue says "via the existing `durationLabel`": `durationLabel` takes two timestamps, so the summed seconds go through `secondsLabel`, which shares `durationLabel`'s `formatDuration` and therefore its exact format. No new formatter.
- No new dependency. No change to `.adw/project.md` (no script, port, env file or doc location changes). No cache, tag or revalidation change.
- Commit as `feat: ...` with no trailers, per the profile.
