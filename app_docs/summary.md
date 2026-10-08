# Summary page

**Specifications:**

- specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md
- specs/issue-134-adw-b6fb710c-sdlc_planner-remove-halted-from-summary.md

## Overview

The summary at `/` (`src/app/page.tsx`): finished runs per UTC day across projects, split into today's card (a React Query entry with a Refresh button) and the past days, each from its own cache scope. The report is shaped in `src/lib/daily-summary.ts` and drawn with inline charts.

## How it works

### Summary

`/` shows what the toolkit finished per UTC day, newest first, today on top
in its own card with a Refresh button: runs
completed and failed, then three bordered chart
cards, in one row from 1024px and stacked below, each with a title and a
muted subtitle: "Work by class" ("Runs finished that day", one
column per class present), "Tokens by model" ("All tokens, including cache
reads", one column per model) and "Cost by phase" ("What each pipeline step
cost that day", one column per pipeline phase). The order is fixed every day
and comes from the data shape, never from the values: `feature`, `chore`,
`bug`, `patch`, `other` (`classCounts`, which the per-project table's class
bar shares), `Haiku`, `Sonnet`, `Opus`, then any other model
(`sumModelUsage`), and `Plan`, `Build`, `Test`, `Review`, `Document`
(`sumPhaseUsage`; CI has no cost and is never shown); absent entries are
omitted. The plot is 180px high with faint dotted guide lines and bars with
rounded tops and a capped width; every column takes the same slot width
whatever its name, so the bars are evenly spaced; the value (run count, token label or cost in
dollars) sits in
white inside its bar, or just above a bar too short for it (`barValueInside`).
Under each bar is its name (the class without its slash, the short model
name or the phase name) beside a dot of the bar's colour. Hovering or focusing
a column shows a tooltip: the full model id, input, cache read, cache write,
output and the day's cost for a model; input, cache read, cache write, output,
the total time and the runs for a phase; the run count and the share of the
day's runs for a class. Each chart scales to its own maximum. A chart with
nothing to show keeps its caption and plot height and says so ("No per-phase
usage published." for the phase chart). It always covers 30 days
(`SUMMARY_DEFAULT_DAYS`) across every public project, with a per-project table
under each day (Project, Runs, Completed, Failed, Classes, Total duration,
Tokens in, Cache read, Tokens out, Cost) that ends in a Total row with the
column sums; its Classes column keeps a compact stacked class bar. There are
no filters (issue #97).

**Page copy.** `/` is the landing page, so its static shell opens with the
`h1` "What an AI developer workflow gets done" and an intro paragraph saying
what ADW is and that the page is the public ledger of finished runs; the
document title is "ADW Dashboard: what an AI developer workflow gets done".
Both sit in the page body and `metadata`, outside the report hole. The
reading notes ("Times are UTC. Tokens and cost count runs that published
metrics.") are a muted line directly under the intro, also in the shell.

**Data.** The toolkit's `adw.daily_summary` view (its migration
`supabase/migrations/*_run_metrics.sql`) holds one row per project per UTC day
of `runs.finished_at`, left-joined to `adw.run_metrics`. The page reads its
sums: `duration_sum_s`, `tokens_in_sum`, `tokens_cache_read_sum`,
`tokens_out_sum` and `cost_usd_sum`. The token and cost sums are over the runs
that published metrics and are 0 when none did. Since the toolkit split token
usage four ways, `tokens_in` is fresh (uncached) input only and small; cache
read is the large figure, which is why it has its own column.
Two reads in `src/data/index.ts` take today's UTC date as an argument:
`getSummaryPast(today, days)` reads the projects and the rows of the `days`
days before today (`day >= from and day < today`) and hands them to
`toSummaryReport`; `getSummaryToday(today)` reads the projects and today's
rows and hands them to `toSummaryDay`, which returns that one day (or `null`).
Each also reads the `adw.daily_model_summary` view for the same days, in the
same `Promise.all` (one row per project, model and UTC day, with `input`,
`cache_read`, `cache_creation`, `output` and `cost_usd`). Both cast the rows to
`DailySummary` and `DailyModelSummary` (`src/types/adw.ts`), and both helpers
live in `src/lib/daily-summary.ts`, which groups and adds the rows; the model
rows of visible projects are summed per day and model by `sumModelUsage`
(`src/lib/model-usage.ts`) into each day's `models`. The model view keys on
the UTC day of `runs.started_at`, not `finished_at`, so a run that spans
midnight UTC sits on its start day in the model chart and on its finish day in
the counts, and a day with model rows but no finished run gets no card.
The third read in the same `Promise.all` is the `adw.daily_phase_summary`
view (one row per project, pipeline phase and UTC day of `runs.finished_at`,
like `daily_summary`, with `runs`, `input`, `cache_read`, `cache_creation`,
`output`, `cost_usd` and `duration_s`), cast to `DailyPhaseSummary`; its rows
of visible projects are summed per day and phase by `sumPhaseUsage`
(`src/lib/phase-usage.ts`, which also holds the phase order and names) into
each day's `phases`. Everything
that shapes the report (today's day, the window, the totals, the bar's
segments, the chart columns, the labels) lives in that file, pure and unit-tested. A day is shown as
`DD.MM.YYYY` by `formatDay` (`src/lib/format-date.ts`) and `duration_sum_s`
by `secondsLabel` (`src/lib/run-view.ts`, the same format as a run's
`durationLabel`); both are pure and read no clock.

**The window.** The report splits on the current UTC day. `SummaryContent`
calls `requestToday`, which awaits `connection()` and then reads the clock
once, `utcDay(Date.now())`
(the codebase's second argument-less clock read, request time only), and passes
that `today` to both halves, so they can never disagree on the day. The past
days are the 30 days strictly before it (`pastDaysWindow`), and the page
states them ("30 days to 05.10.2026", yesterday); today is the card above. A
run finished at 23:59 UTC yesterday is a past day, one at 00:01 is today's.

**Totals.** Every value on the page is a sum. The day header's counts and the
table's Total row are `day.totals`, the sum of the table's own rows
(`dayTotals` in `src/lib/daily-summary.ts`), passed to `ProjectBreakdownTable`
as a prop. Nothing is a median.

**Cache.** Two `"use cache"` scopes in `src/app/page.tsx`, both called only
below the island's `await connection()`, so both are request-time holes (see
"What is prerendered and what is not"). Unlike History, which reads
`searchParams`, the island has no other request-time read, so the
`connection()` call is required here.

- `getPastDays(today)`, tagged `summary:past` (`summaryPastTag()` in
  `src/lib/history-tags.ts`), with `cacheLife({ stale: 300, revalidate: 86400,
expire: 172800 })`. `today` is in the cache key, so every request in one UTC
  day reads one entry and the first request after midnight builds a new one
  that includes yesterday: no cron and no tag drop for the rollover. Past days
  are immutable, so no completion drops this tag; the one-day `revalidate`
  bounds metrics written after midnight for a run finished just before it.
- `getTodayState(today)`, tagged `summary:today` (`summaryTodayTag()`), with
  `cacheLife({ stale: 60, revalidate: 60, expire: 300 })`, a one-liner around
  `prefetch(queryKeys.summaryToday(today), () => getSummaryToday(today))`. Its
  dehydrated state is hydrated into `SummaryProviders`
  (`src/app/summary-providers.tsx`, a bare `QueryClientProvider` over
  `makeQueryClient()`, no Realtime), mounted only around the today island, so
  the today card (`TodaySummary`) is in the server HTML.

**Refresh.** The today card's Refresh button calls `refetch()` on its own
query and nothing else: `getSummaryToday(today)` runs in the browser through
the same Supabase client (publishable key, RLS) and transfers today's rows,
today's per-model rows and the project list, with no request to the app, no `router.refresh()`, no
server action and no navigation. A failed refetch keeps the last figures and
shows a retry line. The day is the prop the page rendered with, so a page left
open across midnight keeps refreshing that day until it is reloaded.

**Revalidation.** `historyTags(slug)` ends in `summary:today`, so the
`revalidateHistory` action and the `/api/revalidate` webhook drop today's
scope on every completion they handle, and a fresh visitor sees the run
without pressing Refresh. Not covered by a tag drop: a run that finishes
`failed` (it fires neither the action nor the webhook), and tokens and
cost (per-model and per-phase usage included) that the toolkit writes after
the completion. The model and phase rows are read in the same scopes as the day rows, so the same tags
and lifetimes cover them. The 60-second `revalidate`
of the today scope and the Refresh button bound both. The router cache's
`staleTimes.dynamic` (300 seconds) is above that `stale`, so a client
navigation back to `/` within five minutes may show the router-cached today
card; Refresh is the remedy. The page has no Realtime listener: it is outside
`(dashboard)`.

## Rules

- The summary is the root route `/`, `src/app/page.tsx`, outside
  `(dashboard)`. Its report is split on today's UTC date, read once by the
  `SummaryContent` island through `requestToday` (`await connection()`, then
  the clock) and passed to both
  halves, each under its own `SectionBoundary`, today first:
  - `getTodayState(today)` is `"use cache"`, tagged `summaryTodayTag()`, with
    `cacheLife({ stale: 60, revalidate: 60, expire: 300 })`, a one-liner
    around `prefetch(queryKeys.summaryToday(today), ...)`. Its state is
    hydrated into `SummaryProviders` and read by `TodaySummary`.
  - `getPastDays(today)` is `"use cache"`, tagged `summaryPastTag()`, with
    `cacheLife({ stale: 300, revalidate: 86400, expire: 172800 })`. `today`
    in its key is the midnight rollover; no completion drops this tag, and
    no cron or tag drop is added for the rollover.
    Both are called only below that `connection()`; never from the page body
    or metadata (they would be prerendered into the shell and frozen). The
    island reads no `searchParams`, so `connection()` is its one request-time
    marker and is required (the History rule against it does not apply here).
    One tag per half; never a per-project, per-day or per-window summary tag,
    and never an `expire` under 5 minutes.
- The `h1` and the intro paragraph of `/` are static copy in the page body
  (the shell), and the title comes from `metadata`; none of them reads the
  report. The reading note about UTC and metrics is a `<p>` in the page body
  directly under the intro, also in the shell, outside the `SectionBoundary`.
  `e2e/test_connection_indicator_scope.md` and `e2e/test_landing_no_filters.md`
  assert the `h1` text, so change them together.
- `/` has no filters (issue #97): it always shows every public project over
  `SUMMARY_DEFAULT_DAYS` days and reads no search parameter.
- The window is anchored on today's UTC date (`utcDay` of the island's one
  clock read), not on the newest row in `adw.daily_summary`: the past days are
  the `SUMMARY_DEFAULT_DAYS` days strictly before today (`pastDaysWindow`),
  today is the card above them. The two halves always take the same `today`;
  never compute it twice or in a client component.
- The summary shows sums only. A day's totals are the sum of its project
  rows (`dayTotals` in `src/lib/daily-summary.ts`), and no median is read,
  assembled or shown; a median cannot be combined across projects, so do not
  reintroduce one without a per-project-only display.
- The per-project table's `<tfoot>` Total row renders `day.totals`, passed
  in as `ProjectBreakdownTable`'s `totals` prop; the table adds nothing
  itself. The table shows for every day with projects. Do
  not reintroduce a separate totals strip.
- Everything that shapes the report lives in `src/lib/daily-summary.ts`
  (`SUMMARY_DEFAULT_DAYS` defined there and nowhere else), pure and tested in
  `src/lib/daily-summary.test.ts`; every change to it goes with a test case.
- Charts are inline SVG or CSS columns with their values also as text; no
  charting library. Class colours come only from `CLASS_FILL`/`CLASS_BG` and
  model colours only from `MODEL_BG` and phase colours only from `PHASE_BG`
  in `src/lib/chart-colors.ts`; class hues
  match `IssueClassBadge`; completed and failed counts use `STATUS_COLORS`.
  The column geometry and labels (`classCounts`, `columnHeights`,
  `barValueInside`, `classLabel`, `shareLabel`) live in
  `src/lib/daily-summary.ts`; each chart scales to its own maximum.
- All three chart orders are fixed and come from the data shape, never from a
  sort by value in a component: classes `feature`, `chore`, `bug`, `patch`,
  `other` from `classCounts` (shared with `ClassDistributionBar` through
  `classSegments`), models `Haiku`, `Sonnet`, `Opus`, then any other from
  `sumModelUsage`, phases `Plan`, `Build`, `Test`, `Review`, `Document` from
  `sumPhaseUsage` (CI has no cost and is omitted, as is any unknown phase
  key). Absent entries are omitted; the components render the
  arrays as given.
- Each day card shows three chart cards under its header, work by class,
  tokens by model and cost by phase (`DayCharts`), in one row from `lg` and
  stacked below (at `sm` three cards are too narrow for five columns); the
  per-project table keeps its compact `ClassDistributionBar`. Model aggregation and names (`modelFamily`,
  `modelShortName`, `sumModelUsage`) live in `src/lib/model-usage.ts`, pure
  and tested in `src/lib/model-usage.test.ts`; every change to it goes with a
  test case. The phase keys, their order and names (`PHASE_ORDER`,
  `phaseName`, `sumPhaseUsage`) live only in `src/lib/phase-usage.ts`, pure
  and tested in `src/lib/phase-usage.test.ts`; every change to it goes with a
  test case. `adw.daily_model_summary` keys on the UTC day of `started_at`,
  `adw.daily_summary` and `adw.daily_phase_summary` on `finished_at`; a day
  with model or phase rows but no finished run gets no card. Every column takes an equal grid slot
  (`repeat(n, minmax(0, 5rem))`, never sized from its content), and the bar
  is capped (`max-w-14`) and centred in it, so adjacent bars are equally
  spaced. A name never widens its slot and is never cut (no `truncate`): it
  wraps under its dot and then inside the word (`wrap-anywhere`). A chart
  with five or more columns uses `gap-1` so
  the row fits a one-third card at `lg` and a stacked card at 375px; the plot box is 180px
  (`h-45`) and the value placement (inside the bar or above it) comes only
  from `barValueInside`.
- The today card is a React Query entry under `SummaryProviders`, but not a
  live section: no Realtime reducer, no catch-up read and no `setQueryData`
  touch it. Its Refresh button calls `refetch()` on that query only; never
  `router.refresh()`, a server action or a navigation from it. A failed
  refetch keeps the last figures (no error boundary takes over). The past
  days never enter the query cache. Completions reach the page only through
  the `summary:today` tag in `historyTags(slug)`; the past days tag is never
  dropped.
- `staleTimes.dynamic` (300 seconds) is above `getTodayState`'s `stale` (60)
  on purpose: the rule tying them is for History, which has no in-place
  refresh. A revisit within five minutes may show the router-cached today
  card, and Refresh is the remedy. Leave `staleTimes` unchanged for it.
