# Feature: Summary page, runs per day with class distribution, median duration, tokens and cost

## Metadata

issue_number: `55`
adw_id: `6b437178`
issue_json: `{"number":55,"title":"Summary page: runs per day with class distribution, median duration, tokens and cost","body":"## Context\nDepends on SBub/adw-toolkit \"Publish per-run metrics\" being merged and its migration applied (`adw.run_metrics`, `adw.daily_summary`); do not start before.\n\n## What to build\n- Route `/summary`, linked from the top nav next to Projects and Skills. Server-rendered from `adw.daily_summary`inside a`\"use cache\"`scope tagged`summary`, resolved at request time (`await connection()`first, as History), with an explicit`cacheLife`.\n- Content, per UTC day, newest first, last 30 days by default (a `?days=` param capped at 90): runs completed and failed; distribution of issue class as a small stacked bar; median run duration; tokens in and out and cost, totals and medians. A project filter (`?project=owner/repo`) defaults to all projects with a per-project breakdown table under the day.\n- Charts: inline SVG only, no charting library; the dataviz guidance in the repo's AGENTS.md if present, otherwise plain, accessible bars with text values.\n- Data boundary: `getDailySummary(days, project?)`in`src/data/index.ts`, typed, cast at the boundary.\n- Revalidation: the completion handler and the webhook route also call `updateTag(\"summary\")`/`revalidateTag(\"summary\", { expire: 0 })`so the page follows completions.\n- README: a Summary section; AGENTS.md: the tag rule.\n\n## Acceptance\n-`/summary`renders for all projects and for one; numbers match a direct query of the view for a sample day.\n- A completion drops the summary cache (verify with`NEXT_PRIVATE_DEBUG_CACHE=1`).\n- Gates pass; route is a partial prerender with the summary as a request-time hole.\n\n## Out of scope\nHistorical backfill, exporting data, per-run drill-down."}`

## Feature Description

A new top-level route, `/summary`, that shows what the ADW toolkit did per UTC day across the
projects the publishable key can see: how many runs finished (completed and failed), how those runs
split by issue class (a small inline-SVG stacked bar with text values), the median run duration, and
tokens in, tokens out and cost (totals and medians). By default it covers 30 days, newest first,
across all projects, with a per-project breakdown table under each day. `?days=` widens or narrows
the window (1 to 90) and `?project=owner/repo` narrows it to one project.

The data comes from the toolkit's `adw.daily_summary` view (one row per project per UTC day of
`runs.finished_at`, left-joined to `adw.run_metrics`), which is already applied to the hosted
project and readable with the publishable key (checked: `GET /rest/v1/daily_summary` with
`Accept-Profile: adw` returns rows such as
`{"day":"2026-10-05","runs":15,"completed":15,"failed":0,"halted":0,"features":8,"bugs":1,"chores":6,"patches":0,"median_duration_s":780.158333,"tokens_in_sum":0,"tokens_in_median":null,...,"cost_usd_sum":0.0000,"cost_usd_median":null}`).
The page is server-rendered from a `"use cache"` scope tagged `summary`, resolved at request time,
and a completion drops that tag in the same places that already drop a project's history tags.

## User Story

As the owner of several repositories run by the ADW toolkit
I want to see, per day, how many runs finished, what kind of work they were, how long they took and
what they cost
So that I can spot cost or duration regressions and judge throughput without reading every run's
directory on the machine that ran it

## Problem Statement

The dashboard shows live runs, a queue and a per-project history, but nothing aggregated over time.
Tokens and cost were never visible at all: they lived only in `agents/<adw_id>/` on the runner. The
toolkit now publishes them (`adw.run_metrics`) and aggregates them per project per day
(`adw.daily_summary`), but no screen reads that view.

## Solution Statement

Follow the History pattern end to end, adapted to a page with no project sidebar:

- **Boundary.** `getDailySummary(days, project)` in `src/data/index.ts` reads the projects the key
  can see, the most recent `day` in the view (the window's anchor, see below), and the view's rows
  from `anchor - (days - 1)` to the anchor, and casts the rows to `DailySummary` (new type in
  `src/types/adw.ts`, column for column with the view). Assembly into the page model happens in a
  pure, tested helper (`toSummaryReport` in `src/lib/daily-summary.ts`), never in a component.
- **No clock read.** "Last N days" needs a reference day. Reading `new Date()` would be a second
  clock read in the data layer, which AGENTS.md forbids (the only one is `getActiveRuns`'s
  `fetched_at`). Instead the window is anchored on the newest `day` present in the view (for the
  selected project, or for all), and the page states the range it shows ("30 days to 05.10.2026").
  On an active installation this is today; on a quiet one it is the last day with a finished run,
  which is the more useful window anyway. Date arithmetic is on a parsed input (`Date.UTC` on the
  anchor's parts), which is not a clock read, in a pure helper `summaryWindowStart`.
- **Cache and hole.** `getSummary(days, project)` in `src/app/summary/page.tsx` is `"use cache"`,
  `cacheTag(summaryTag())`, with an explicit `cacheLife({ stale: 300, revalidate: 900, expire: 86400 })`.
  It is called only from an async island that first awaits `searchParams` (to read `?days` and
  `?project`), under a `SectionBoundary`. That request-time read is what makes the island a hole
  resolved from the live cache handler (so `updateTag`/`revalidateTag` reaches it), exactly as the
  History islands do. The issue says "`await connection()` first, as History", but History no longer
  calls `connection()`: AGENTS.md says "Do not add `connection()` back as a redundant second marker"
  after the `searchParams` read. The summary island reads `searchParams` anyway, so it follows the
  current History rule and does not call `connection()`.
- **Revalidation.** One new tag spelling, `summaryTag()` returning `"summary"`, in
  `src/lib/history-tags.ts` (the one place tag spellings live). `historyTags(slug)` grows to return
  `[historyTag(slug), runsTag(slug), summaryTag()]`, so the `revalidateHistory` action (`updateTag`)
  and the `/api/revalidate` handler (`revalidateTag(tag, { expire: 0 })`), which both already iterate
  it, drop the summary on every completion with no change to their bodies. The anonymous-caller
  question AGENTS.md asks about a third tag is answered: the worst a caller can do is make the next
  `/summary` render read four small queries once, the same class of effect the two existing tags
  already allow.
- **All projects and medians.** The view is per project per day, and a median cannot be combined
  from per-project medians. For the all-projects day row, counts and sums are added up across
  projects; a median is shown only when exactly one project contributed to that day (then it is that
  project's exact median), otherwise the cell reads `per project` and the per-project table under the
  day carries each project's exact medians. With `?project=` set there is one row per day and every
  median is exact. No median of medians is ever displayed.
- **UI.** A server component tree with no client state. Filters are a plain `<form method="get">`
  with a project `<select>` (all, or one slug), a days `<select>` (7, 30, 90) and a submit button: the
  browser builds the query string, no router call, no `"use client"`. Each day is a card: date, a
  stacked class bar (inline SVG, `role="img"` with an `aria-label` listing every count, plus a visible
  legend with the numbers), completed and failed counts in the status palette, median duration,
  tokens in/out and cost (sum and median), and, in all-projects mode, a per-project breakdown table.
- **Top nav.** `SectionNav` gains a `Summary` link after `Skills`.

## Relevant Files

Use these files to implement the feature:

- `AGENTS.md`: rules this plan must keep (one data boundary, casts only in `src/data/index.ts`, no
  clock read, tag spellings only in `src/lib/history-tags.ts`, `SectionBoundary` around a
  server-rendered hole, `searchParams` as the request-time marker, no `connection()`, status hues only
  from `STATUS_COLORS`, `formatTimestamp` rules, pure tested helpers). Gets a new "Summary" rule
  block and edits to the tag and action rules.
- `README.md`: needs a "Summary" section and updates to "Routing", "The move", "Webhook
  revalidation" (three tags now) and "What is prerendered and what is not" (a second hole).
- `.adw/project.md`: the Review section lists the paths to screenshot; add `/summary` and
  `/summary?project=<slug>` there (headings untouched).
- `src/data/index.ts`: add `getDailySummary`, the column list `DAILY_SUMMARY_COLUMNS`, and the casts.
- `src/types/adw.ts`: add the `DailySummary` row type (view) and the `SummaryReport` model types
  produced by the lib helper.
- `src/lib/history-tags.ts` and `src/lib/history-tags.test.ts`: add `summaryTag`, extend
  `historyTags`, pin the strings.
- `src/app/actions/revalidate-history.ts`, `src/app/api/revalidate/route.ts`: bodies unchanged (they
  iterate `historyTags`), doc comments updated from "two tags" to three.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: the pattern to copy (`getHistory`,
  `readHistory`, islands under `SectionBoundary`, explicit `cacheLife`). Not changed.
- `src/app/skills/page.tsx`: the layout to copy for a top-level page outside `(dashboard)`.
- `src/components/SectionNav.tsx`: add the `Summary` link.
- `src/components/SectionBoundary.tsx`, `src/components/SectionHeading.tsx`: reused.
- `src/components/IssueClassBadge.tsx`: the issue class hues (violet, fuchsia, neutral, lime) the
  stacked bar reuses so a class has one colour across the app.
- `src/lib/status-colors.ts` and its test: completed and failed counts use `STATUS_COLORS`; the hue
  guard test must stay green (no `sky`/`rose` class written inline).
- `src/lib/run-view.ts` and `src/lib/run-view.test.ts`: export a seconds-based duration label reusing
  `formatDuration`.
- `src/lib/format-date.ts` and `src/lib/format-date.test.ts`: add `formatDay` for a `YYYY-MM-DD`
  date.
- `src/lib/slug.ts`: `isProjectSlug` validates `?project`.
- `next.config.ts`: read only (the `staleTimes.dynamic` window also bounds a revisited `/summary`).
- `knip.json`, `vitest.config.ts`, `lefthook.yml`: gates; every new export must be used.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheLife.md`, `cacheTag.md`,
  `updateTag.md`, `revalidateTag.md`, `connection.md`: read before writing the cache scope.
- `/Users/sveta/Dev/adw-toolkit/supabase/migrations/20261005180000_run_metrics.sql`: the source of
  truth for the view's columns and semantics (read only).

### New Files

- `src/app/summary/page.tsx`: the route. Static heading and description in the shell; `getSummary`
  (`"use cache"`, tagged, explicit `cacheLife`); `SummaryContent` island that awaits `searchParams`,
  normalises `?days` and `?project` outside the scope, calls `getSummary`, renders the components.
- `src/lib/daily-summary.ts`: pure helpers. `SUMMARY_DEFAULT_DAYS` (30), `SUMMARY_MAX_DAYS` (90),
  `SUMMARY_DAY_OPTIONS` ([7, 30, 90]), `readSummaryDays`, `readSummaryProject`, `summaryWindowStart`,
  `toSummaryReport`, `classSegments`, `tokensLabel`, `costLabel`, `summaryHref`.
- `src/lib/daily-summary.test.ts`: unit tests for every helper above.
- `src/components/SummaryFilters.tsx`: the GET form (server component, no state).
- `src/components/DailySummaryList.tsx`: the list of day cards (server component).
- `src/components/ClassDistributionBar.tsx`: the inline-SVG stacked bar plus legend (server
  component).
- `src/components/ProjectBreakdownTable.tsx`: the per-project table under a day (server component).

## Implementation Plan

### Phase 1: Foundation

Types, pure helpers and their tests, the tag spelling. Nothing renders yet; everything is unit
tested with fixed inputs.

### Phase 2: Core Implementation

The boundary read `getDailySummary`, the route with its cache scope and request-time island, and
the four server components.

### Phase 3: Integration

The nav link, the third tag flowing through the existing action and route handler, documentation
(README, AGENTS.md, profile Review section), and the build-level checks: the route is a partial
prerender, the summary is a hole, a tag drop regenerates it.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the framework docs and the view

- Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheLife.md`
  ("Prerendering behavior"), `cacheTag.md`, `updateTag.md`, `revalidateTag.md` and
  `connection.md`, and README "What is prerendered and what is not".
- Read `/Users/sveta/Dev/adw-toolkit/supabase/migrations/20261005180000_run_metrics.sql`, section
  "Daily summary", for the exact columns: `project_id, day, runs, completed, failed, halted,
features, bugs, chores, patches, median_duration_s, tokens_in_sum, tokens_in_median,
tokens_out_sum, tokens_out_median, cost_usd_sum, cost_usd_median`. `day` arrives as
  `"YYYY-MM-DD"`; the medians are `number | null` (null when no run of that day has a
  `run_metrics` row; `median_duration_s` is never null since `finished_at` is not null); sums are
  numbers (PostgREST serialises `bigint` and `numeric` as JSON numbers, as seen in the sample
  above). `runs` counts every finished status, so `runs - completed - failed` is `halted` (and any
  future status), and `runs - features - bugs - chores - patches` is the "other" class count
  (null or unknown `issue_class`).

### 2. Types in `src/types/adw.ts`

- In the view-model section next to `ProjectSummary` (both are read from a database view, not a
  table), add `DailySummary`, column for column with `adw.daily_summary`:
  `project_id: string; day: string; runs: number; completed: number; failed: number; halted: number;
features: number; bugs: number; chores: number; patches: number; median_duration_s: number | null;
tokens_in_sum: number; tokens_in_median: number | null; tokens_out_sum: number;
tokens_out_median: number | null; cost_usd_sum: number; cost_usd_median: number | null`.
  Document that `day` is a UTC calendar date (`YYYY-MM-DD`) and that medians are over runs with
  metrics.
- Add the page model, produced only by `toSummaryReport`:
  - `SummaryProject { slug: string; display_name: string }`.
  - `SummaryProjectDay extends DailySummary { slug: string; display_name: string }`.
  - `SummaryDay { day: string; totals: DailySummary-shaped totals without project_id (counts and
sums added, medians as described in step 4); projects: SummaryProjectDay[] }`. Define the totals
    type as `Omit<DailySummary, "project_id">` so it reuses the field list.
  - `SummaryReport { from: string | null; to: string | null; days: number; project: SummaryProject
| null; projects: SummaryProject[]; rows: SummaryDay[] }` (`from`/`to` null when the view has no
    row at all for the selection).
- Update the file's header comment (it says "the one view model").

### 3. Tag spelling in `src/lib/history-tags.ts`

- Add `export function summaryTag(): string { return "summary"; }` with a doc comment (the
  `/summary` page's scope, every project and every window share it).
- Change `historyTags(slug)` to return `readonly [string, string, string]`:
  `[historyTag(slug), runsTag(slug), summaryTag()]`, and update its comment (a completion also
  changes the summary's counts).
- `src/lib/history-tags.test.ts`: add `it("spells the summary scope tag as summary")`, and change
  the `historyTags` case to expect the three strings in that order.

### 4. Pure helpers in `src/lib/daily-summary.ts` (plus tests)

- Constants: `SUMMARY_DEFAULT_DAYS = 30`, `SUMMARY_MAX_DAYS = 90`, `SUMMARY_DAY_OPTIONS = [7, 30, 90]
as const` (defined here and nowhere else).
- `readSummaryDays(raw: string | string[] | undefined): number`: a string of decimal digits only
  (`/^\d{1,3}$/`, static regexp) parsed to an integer, clamped to `[1, SUMMARY_MAX_DAYS]`; anything
  else (absent, array, empty, `"abc"`, `"-5"`, `"1.5"`, `"0"` clamps to 1) is the default. Never
  throws.
- `readSummaryProject(raw: string | string[] | undefined): string | null`: the string when
  `isProjectSlug(raw)`, else `null` (absent, empty string from the form's "All projects" option,
  array, malformed). Never throws.
- `summaryWindowStart(anchor: string, days: number): string`: `YYYY-MM-DD` of `anchor - (days - 1)`
  days, computed with `Date.UTC(y, m - 1, d - (days - 1))` on the parsed anchor parts and formatted
  with the UTC getters. No argument-less `new Date()`. Crosses month and year boundaries correctly.
- `toSummaryReport(rows: DailySummary[], projects: SummaryProject-with-id[], options: { days: number;
project: SummaryProject | null; from: string | null; to: string | null }): SummaryReport`:
  - Group rows by `day`, sort days descending (string compare on `YYYY-MM-DD` is chronological).
  - Per day: `projects` are the rows of that day joined to `slug`/`display_name` by `project_id`
    (a row whose project is not in the list is dropped: RLS hides it), sorted by `runs` desc then
    `slug` asc.
  - `totals`: every count and every `_sum` added across that day's project rows; for each median
    (`median_duration_s`, `tokens_in_median`, `tokens_out_median`, `cost_usd_median`), the single
    project's value when the day has exactly one project row, otherwise `null`. Cost sums are added
    and rounded to 4 decimals (`Math.round(x * 1e4) / 1e4`) to keep float noise out of the label.
  - Never mutates its inputs.
- `classSegments(day: Pick<DailySummary, "runs" | "features" | "bugs" | "chores" | "patches">)`:
  returns `{ key: "/feature" | "/bug" | "/chore" | "/patch" | "other"; count: number; offset: number;
width: number }[]` in that fixed order, zero-count segments omitted, `offset`/`width` in percent of
  `runs` (the last segment's `offset + width` is exactly 100). `other` is
  `max(0, runs - features - bugs - chores - patches)`. `runs === 0` yields `[]`.
- `tokensLabel(n: number | null): string`: `null` is `"n/a"`; under 1,000 the integer (`"950"`);
  then one decimal with `k` (`"12.3k"`), `M` (`"4.6M"`), `B`. Rounded half up on the decimal, no
  `Intl`, no `toLocaleString`.
- `costLabel(usd: number | null): string`: `null` is `"n/a"`; `"$0.00"` for 0; two decimals
  (`"$12.35"`); under one cent but above zero `"<$0.01"`.
- `summaryHref(days: number, project: string | null): string`: `/summary`, with `?days=N` only when
  `N !== SUMMARY_DEFAULT_DAYS` and `project=` (URL-encoded through `URLSearchParams`) only when not
  null; used by the breakdown table's project links. The filter form does not use it (the browser
  builds that URL).
- `src/lib/daily-summary.test.ts`: one `describe` per helper with fixed inputs, including: default,
  clamp to 90, clamp to 1, junk and array for `readSummaryDays`; valid, empty, malformed, array for
  `readSummaryProject`; `summaryWindowStart("2026-10-05", 30) === "2026-09-06"`, `("2026-03-01", 2)
=== "2026-02-28"`, `("2026-01-01", 1) === "2026-01-01"`, `("2024-03-01", 2) === "2024-02-29"`;
  for `toSummaryReport`: two projects on one day add counts and sums and null every median, one
  project on a day keeps its medians, days ordered newest first, a row of an unlisted project is
  dropped, inputs not mutated (freeze them), cost sum rounding (`0.1 + 0.2`); `classSegments` with
  an "other" remainder, all zero, and widths summing to 100; label helpers at each threshold;
  `summaryHref` with defaults omitted and a slug encoded.

### 5. Duration and day labels

- `src/lib/run-view.ts`: export `secondsLabel(seconds: number | null): string | null` (`null` in,
  `null` out; otherwise `formatDuration(seconds * 1000)`). Tests in `src/lib/run-view.test.ts`
  (`780.158333` is `"13m 00s"`, `3725` is `"1h 02m"`, `null`).
- `src/lib/format-date.ts`: export `formatDay(day: string): string`, `"YYYY-MM-DD"` to `"DD.MM.YYYY"`
  through the same parse and UTC getters, unparseable input returned unchanged. Tests in
  `src/lib/format-date.test.ts`. This is a calendar date, not a timestamp, so `formatTimestamp`'s
  "only through `Timestamp`" rule is untouched; the component renders it in
  `<time dateTime={day}>`.

### 6. Boundary read `getDailySummary` in `src/data/index.ts`

- Add `const DAILY_SUMMARY_COLUMNS = "project_id, day, runs, completed, failed, halted, features,
bugs, chores, patches, median_duration_s, tokens_in_sum, tokens_in_median, tokens_out_sum,
tokens_out_median, cost_usd_sum, cost_usd_median";` with the "exactly the fields of
  DailySummary" comment, like `RUN_COLUMNS`.
- `export async function getDailySummary(days: number, project: string | null = null):
Promise<SummaryReport | null>`:
  1. Read `projects` (`select("id, slug, display_name").order("slug")`), cast once to
     `{ id: string; slug: string; display_name: string }[]`, throw `projects: <message>` on error.
  2. When `project` is set and not in that list, return `null` (unknown or private project).
  3. Anchor: `from("daily_summary").select("day").order("day", { ascending: false }).limit(1)`,
     `.eq("project_id", id)` when filtered; throw `daily_summary: <message>` on error. No row:
     return `toSummaryReport([], projects, { days, project, from: null, to: null })`.
  4. Rows: `from("daily_summary").select(DAILY_SUMMARY_COLUMNS).gte("day", from)` with `from =
summaryWindowStart(anchor, days)`, the same optional `.eq`, `.order("day", { ascending: false
})`; throw on error; cast once to `DailySummary[]`.
  5. Return `toSummaryReport(rows, projects, { days, project, from, to: anchor })`.
- Doc comment, in the style of the file: it reads no clock (the window is anchored on the data, and
  why), it is server only and only called from the summary page's `"use cache"` scope, never a
  `queryFn`, never enters the React Query cache; the view runs `security_invoker`, so the
  publishable key sees public projects only; medians across projects are not computed (see
  `toSummaryReport`). Keep the header comment of the file in step (a fifth read).
- `days` is already normalised by the caller; the boundary trusts it (the cache key is the
  normalised value).

### 7. The route `src/app/summary/page.tsx`

- `export const metadata = { title: "Summary | ADW Dashboard" }`.
- `type SearchParams = { [key: string]: string | string[] | undefined }`; props
  `{ searchParams: Promise<SearchParams> }`.
- `async function getSummary(days: number, project: string | null)`: `"use cache"`;
  `cacheTag(summaryTag())`; `cacheLife({ stale: 300, revalidate: 900, expire: 86400 })`; returns
  `getDailySummary(days, project)`. Doc comment: why it is a hole (Resume Data Cache, as `getHistory`);
  why `stale` stays 300 (the router cache's `staleTimes.dynamic` must stay at or under it); why
  `revalidate` is 15 minutes, not a day like History (failed and halted runs and the late
  `run_metrics` rows reach the view without any tag drop, see Notes); `expire` well above 5 minutes
  so it stays a cached hole, not a dynamic one.
- `async function SummaryContent({ searchParams })`: `const { days: rawDays, project: rawProject } =
await searchParams;` then `readSummaryDays`, `readSummaryProject` (outside the cache scope), then
  `await getSummary(days, project)`. `null` (unknown project) renders a muted panel "No public
  project named owner/repo." with a link back to `/summary`. Otherwise renders `SummaryFilters` and
  `DailySummaryList`. No `connection()` call (comment says why, pointing at the History rule).
- `export default function SummaryPage({ searchParams })`: not async, never awaits `searchParams`.
  Static shell: wrapper `mx-auto max-w-6xl px-4 py-6`, `<h1>` "Summary", a muted one-line
  description ("Finished runs per UTC day: what kind of work, how long, and what it cost. Medians
  are over runs that published metrics."), then `<SectionBoundary fallback={<p ...>Loading
summary...</p>} detail="The summary did not load."><SummaryContent searchParams={searchParams}
/></SectionBoundary>`.
- Never call `getSummary` from the page body or metadata (it would be prerendered into the shell).

### 8. Server components (no `"use client"`, typed props, no computation beyond calling lib helpers)

- `src/components/SummaryFilters.tsx`: props `{ projects: SummaryProject[]; project: string | null;
days: number }`. `<form method="get" action="/summary" className="flex flex-wrap items-end gap-3">`
  with a labelled `<select name="project">` (first option value `""` "All projects", then each
  `display_name` with `value={slug}`, `defaultValue={project ?? ""}`), a labelled `<select
name="days">` over `SUMMARY_DAY_OPTIONS` (`"Last 7 days"` etc.; when `days` is not one of the
  options, add it as an extra option so the current value stays selected), and a submit button
  "Apply". Visible `<label>`s for accessibility.
- `src/components/DailySummaryList.tsx`: props `{ report: SummaryReport }`. A muted range line:
  `"{days} days to {formatDay(to)}"` (and the project's name when filtered). Empty `rows`: the dashed
  empty panel ("No finished runs in this window."). Otherwise one `<article>` per day:
  - Header row: `<h2><time dateTime={day}>{formatDay(day)}</time></h2>`, `{runs} runs`, completed
    count with `STATUS_COLORS.completed.text`, failed count with `STATUS_COLORS.failed.text` (both
    with `STATUS_COLORS.neutral.text` when zero), halted shown only when non-zero (neutral).
  - `ClassDistributionBar` for the day totals.
  - A `<dl>` grid: Median duration (`secondsLabel`, or `per project` when null and the day has more
    than one project), Tokens in (`tokensLabel(sum)` and `median {tokensLabel(median)}`), Tokens out
    (same), Cost (`costLabel(sum)` and `median {costLabel(median)}`). A null median with one project
    reads `n/a` (no run of that day has metrics).
  - When `report.project === null` and the day has projects: `ProjectBreakdownTable`.
- `src/components/ClassDistributionBar.tsx`: props `{ counts: Pick<DailySummary, "runs" | "features"
| "bugs" | "chores" | "patches"> }`. Calls `classSegments(counts)`. An `<svg viewBox="0 0 100 8"
preserveAspectRatio="none" className="h-2 w-full" role="img" aria-label="Issue classes: 8
/feature, 1 /bug, 6 /chore">` with one `<rect x={offset} width={width} height={8}>` per segment,
  fills as full literal class strings in a local map matching `IssueClassBadge`'s hues
  (`fill-violet-500`, `fill-fuchsia-500`, `fill-neutral-400`, `fill-lime-500`, other
  `fill-neutral-300 dark:fill-neutral-600`), a 1-unit gap is not needed (keep it plain). Under it a
  legend `<ul>` with a swatch and `"/feature 8"` per non-zero segment, so every value is readable as
  text. No status hues (the hue guard test scans `src/`).
- `src/components/ProjectBreakdownTable.tsx`: props `{ rows: SummaryProjectDay[]; days: number }`.
  A `<table>` with a `<caption className="sr-only">`, header cells with `scope="col"`, one row per
  project: project name linking to `summaryHref(days, slug)`, runs, completed, failed, a compact
  `ClassDistributionBar` (or the class counts as text), median duration, tokens in (sum / median),
  tokens out (sum / median), cost (sum / median). Wrapped in `overflow-x-auto` so it scrolls at
  375 px instead of breaking the layout. Numbers right-aligned with `tabular-nums`.

### 9. Top nav

- `src/components/SectionNav.tsx`: add a third `Link` `href="/summary"` "Summary" with the same
  classes, after Skills. Update the comment if it names the links.

### 10. Action and route handler comments

- `src/app/actions/revalidate-history.ts` and `src/app/api/revalidate/route.ts`: the code already
  loops over `historyTags(slug)`; update their doc comments from "two tags" to the three tags and add
  the `summary` bullet (the `/summary` page's scope, one tag for all projects and windows). No other
  change: no read, no write, no new parameter.

### 11. Documentation

- `README.md`:
  - New `## Summary` section (after "Skills" or after "Routing"): what the page shows, where the data
    comes from (`adw.daily_summary`, toolkit migration), the window anchored on the newest day in the
    view and why (no clock read), the all-projects median rule, the filters (`?days` 1..90 default 30,
    `?project=owner/repo`, both normalised outside the cache scope, invalid is the default, unknown
    project is a not-found panel), the cache scope (tag `summary`, `cacheLife`, request-time hole
    after `searchParams`, why no `connection()`), revalidation (action and webhook drop it with the
    project's two tags; what is not covered: failed or halted runs, and metrics written after the
    completion, reach it within `revalidate`), and that the page is not live (no Providers, no
    Realtime outside `(dashboard)`).
  - "Routing": add `/summary` next to `/skills` as outside `(dashboard)`.
  - "The move" and "Webhook revalidation": "the same two tags" becomes three, naming `summary`.
  - "What is prerendered and what is not": `/summary` is a partial prerender, the heading in the
    shell, the summary island a hole.
- `AGENTS.md`:
  - Architecture, the data-boundary rule: list `getDailySummary(days, project)` as a boundary export
    read only by the summary page's `getSummary` scope, never a `queryFn`, and the `DailySummary`
    cast as one of the boundary's casts (`DAILY_SUMMARY_COLUMNS` equal to the fields of
    `DailySummary`).
  - Add `SummaryFilters`, `DailySummaryList`, `ClassDistributionBar` and `ProjectBreakdownTable` to
    the list of server components with no state.
  - New `## Summary` rule block: `/summary` lives in `src/app/summary/`, outside `(dashboard)`;
    `getSummary` is `"use cache"`, tagged `summaryTag()`, explicit `cacheLife({ stale: 300,
revalidate: 900, expire: 86400 })`, called only from the island after `await searchParams`,
    never from the page body or metadata; `?days` and `?project` are normalised by
    `readSummaryDays`/`readSummaryProject` outside the scope and never surface an error; the window is
    anchored on the newest day in the view, never on a clock read; medians across projects are never
    combined (one project's exact median or `per project`); everything that shapes the report lives
    in `src/lib/daily-summary.ts`, pure and tested, and every change to it goes with a test case;
    charts are inline SVG with text values, no charting library; the page is not a live section: no
    React Query entry, no Realtime reducer, no catch-up read touches it.
  - Tag rules: "Both tag spellings live in one place" becomes all three (`historyTag`, `runsTag`,
    `summaryTag`), `historyTags(slug)` returns the three, and the action rule records the decision on
    the third tag (an anonymous caller can make the next `/summary` render read the database once;
    nothing else). Never write `"summary"` inline.
- `.adw/project.md`, `## Review` only: add `/summary` (heading, filters, day cards with class bars,
  per-project tables) and `/summary?project=SBub/issebya-homes-ai-system` (or the first project the
  sidebar lists) to the paths to capture at 1920x1080 and 375x667. Do not rename or reorder any `##`
  heading.

### 12. Browser evidence (review phase; the profile's E2E is `none`)

- No spec is added: the profile has no Playwright or component layer, and browser evidence comes from
  the review phase. No `e2e/*.md` journey either: the review screenshots plus the HTML checks in
  Validation Commands cover the behaviour deterministically enough.
- The reviewer opens, at `http://localhost:$PORT` (from `.ports.env`), each at desktop 1920x1080 and
  mobile 375x667, full page:
  - `/`: the header nav shows Projects, Skills, Summary.
  - `/summary`: the "Summary" heading, the filter form (All projects, Last 30 days), the range line
    "30 days to DD.MM.YYYY", day cards newest first, each with a stacked class bar and its legend
    values, completed/failed counts, median duration, tokens and cost lines, and a per-project table
    under each day. At 375 px the table scrolls horizontally inside its card and nothing overflows the
    page.
  - `/summary?project=SBub/issebya-homes-ai-system&days=7` (or the first listed project): the select
    shows that project and "Last 7 days", one row per day, no breakdown table, medians shown as values
    (or `n/a` where no metrics exist).
  - `/summary?project=nobody/nothing`: the "No public project named nobody/nothing." panel.
  - `/summary?days=abc`: same as `/summary` (default window).

### 13. Run the Validation Commands

- Run every command in `Validation Commands` below, in order, and fix anything that fails without
  weakening a rule, a type or a test.

## Testing Strategy

### Unit Tests

All in the one layer the profile names, `src/**/*.test.ts` (vitest):

- `src/lib/daily-summary.test.ts` (new): `readSummaryDays`, `readSummaryProject`,
  `summaryWindowStart`, `toSummaryReport`, `classSegments`, `tokensLabel`, `costLabel`, `summaryHref`
  with fixed inputs (see step 4 for the cases).
- `src/lib/history-tags.test.ts` (changed): pins `summaryTag()` as `"summary"` and `historyTags`
  as the three strings, history first.
- `src/lib/run-view.test.ts` (extended): `secondsLabel`.
- `src/lib/format-date.test.ts` (extended): `formatDay`.
- `src/lib/status-colors.test.ts` (unchanged) keeps guarding that the new components write no status
  hue inline.

### Test Coverage

- `src/lib/daily-summary.test.ts` (unit): catches a median of medians shown for a multi-project day,
  days out of order, a dropped or double-counted project row, segments not summing to 100, a `?days`
  or `?project` value that throws or escapes the 1..90 bound, and an off-by-one or month/leap-year
  error in the window start. Fails without the feature (the module does not exist).
- `src/lib/history-tags.test.ts` (unit, changed): catches a completion that does not drop the
  summary scope, or a misspelt `summary` tag that nothing would expire. Fails without the change
  (`historyTags` returns two tags today).
- `src/lib/run-view.test.ts` and `src/lib/format-date.test.ts` (unit, extended): catch a wrong
  duration from seconds or a day label shifted by the runtime time zone.
- No test for `getDailySummary`, the page or the components: the project has no component or
  integration layer and the data boundary is not unit-tested elsewhere (it is a thin Supabase
  query); its correctness is proven by the build, the served-HTML checks and the direct comparison
  with the view in Validation Commands.

### Edge Cases

- No row in the view at all (fresh database), or none for the selected project: empty panel, range
  line omitted, no error.
- A day with `runs > features + bugs + chores + patches` (null or unknown `issue_class`): an "other"
  segment.
- A day with only failed or halted runs: completed 0 in neutral, the bar still drawn.
- All medians null (no `run_metrics` yet, true for every current row): `n/a`, sums `0` and `$0.00`.
- Two projects on the same day: counts and sums added, medians `per project`, table carries the
  exact values.
- `?days=0`, `?days=-1`, `?days=1000`, `?days=1.5`, `?days=` repeated (array): 1, default, 90,
  default, default.
- `?project=` empty (the form's "All projects"), malformed (`a/b/c`, `%2F`), unknown, private: all
  projects, all projects, not-found panel, not-found panel.
- Window across a month or year boundary, and across 29 February.
- A project's row whose `project_id` is not in the visible project list: dropped.
- Wide numbers on 375 px (`tokens_in_sum` in the billions): compact labels and the table scrolls.

## Acceptance Criteria

- The header shows a `Summary` link after `Skills`, on every route.
- `/summary` renders all projects for the last 30 days (anchored on the newest day in the view), newest
  day first, each day with completed and failed counts, a stacked issue-class bar with text values,
  median duration, tokens in/out and cost (sum and median), and a per-project breakdown table.
- `/summary?project=owner/repo` renders only that project, one row per day, exact medians, no
  breakdown table; `?days=` is honoured between 1 and 90, invalid values fall back to 30, and nothing
  throws for any query string.
- For a sample day, the numbers on the page equal a direct read of `adw.daily_summary` for that day
  (per project in the breakdown table and in project mode; summed in the all-projects day row).
- No median is ever computed across projects.
- `yarn build` reports `/summary` as a partial prerender (`◐`), the served HTML of `/summary` carries
  the `Summary` heading in the shell and the day cards as a streamed request-time hole.
- With `NEXT_PRIVATE_DEBUG_CACHE=1`, a plain GET of `/summary` adds no `generated entry` line for the
  summary scope once it is warm, and the first GET after a tag drop (the webhook POST or a real
  completion) does.
- `historyTags(slug)` returns `history:<slug>`, `runs:<slug>`, `summary`; the action and the route
  handler drop all three; no tag string is written inline anywhere.
- No argument-less `new Date()` or `Date.now()` added; no charting dependency added; no `"use client"`
  on the new components; no status hue written outside `STATUS_COLORS`; no em-dash in any file.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test` and `yarn build` pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint`: ESLint, including the security plugin's rule against non-literal regexps.
- `yarn typecheck`: `next typegen` and `tsc --noEmit` over the new types and the boundary casts.
- `yarn knip`: every new export (helpers, constants, components) is used; nothing left dead.
- `yarn format:check`: Prettier over the new and changed files.
- `yarn test`: the new and extended unit tests, plus the status hue guard over the new components.
- `yarn build`: needs `.env.local`; proves the route builds under `cacheComponents` with no clock read
  outside a cache scope. In its route table `/summary` must be `◐` (partial prerender).
- `grep -rn "new Date()\|Date.now()" src --include=*.ts --include=*.tsx | grep -v "\.test\.ts"`:
  still exactly the one occurrence in `getActiveRuns`.
- `grep -rnE "\"summary\"|'summary'" src | grep -v history-tags`: no inline tag spelling outside
  `src/lib/history-tags.ts` (component copy that is not a tag is fine; inspect any hit).
- `grep -rn $'\xe2\x80\x94' README.md AGENTS.md .adw/project.md src specs/issue-55-*`: no em-dashes.
- `ls .next/cache/fetch-cache 2>/dev/null | wc -l` after the build, and `grep -rl supabase
.next/cache/fetch-cache 2>/dev/null`: no Supabase entry (the `no-store` rule still holds).
- Served HTML, with the port from `.ports.env`:
  `set -a; . ./.ports.env; set +a; NEXT_PRIVATE_DEBUG_CACHE=1 yarn start > /tmp/adw-6b437178-start.log 2>&1 &`
  then
  `curl -s "http://localhost:$PORT/summary" | grep -c "Summary"` (heading present),
  `curl -s "http://localhost:$PORT/summary" | grep -o 'dateTime="20[0-9-]*"' | head` (day cards in
  the document, inline or as a streamed completion),
  `curl -s "http://localhost:$PORT/summary?project=nobody/nothing" | grep -c "No public project"`,
  `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:$PORT/summary?days=abc"` (200).
  Stop only the server this run started (its PID from `$!`).
- Numbers match the view for a sample day (read only, publishable key):
  `set -a; . ./.env.local; set +a; curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/daily_summary?select=*&order=day.desc&limit=5" -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Accept-Profile: adw"`
  and compare the newest day's `completed`, `failed`, class counts and `median_duration_s` (as
  `secondsLabel`) with the page's per-project table and with
  `/summary?project=<that slug>`.
- Cache drop: with the server above running and `ADW_REVALIDATE_SECRET` set in `.env.local`, warm the
  scope with one GET, then a second GET (no new `use-cache: ... generated entry` line for
  `getSummary` in `/tmp/adw-6b437178-start.log`), then
  `curl -s -X POST "http://localhost:$PORT/api/revalidate" -H "content-type: application/json" -H "x-adw-secret: $ADW_REVALIDATE_SECRET" -d '{"type":"UPDATE","schema":"adw","table":"runs","record":{"project_id":"<a public project id from the view>"},"old_record":null}'`
  (expects `{"revalidated":"<slug>"}`; it writes nothing to the database), then one GET of `/summary`
  must add a `generated entry` line for the summary scope. If the secret is not configured locally
  (503), say so in the report and leave this check to a real completion observed during review; never
  print the secret.

## Notes

- No new dependency. Charts are hand-written SVG; no charting library is added.
- **What the tag drop does not cover, by design of the toolkit's triggers.** The action fires only on
  `isHistoryChange` and the webhook only on a transition into or out of `completed`. A run that
  finishes `failed` or `halted` changes `daily_summary` without either, and `run_metrics` is written
  after the terminal state save (and again on the merge gate's `--apply`), so tokens and cost often
  land after the completion's tag drop. `cacheLife` `revalidate: 900` bounds both to about 15 minutes.
  A follow-up in `adw-toolkit` could add a trigger on `adw.run_metrics` (and on `runs` reaching
  `failed`) posting to `/api/revalidate`; the handler would then need to accept `table:
"run_metrics"` too. Out of scope here (it changes the toolkit and the payload contract together).
- **Medians across projects.** Exact all-project medians would need run-level rows
  (`runs` joined to `run_metrics`) or a second view in the toolkit (`daily_summary_all`). The issue
  asks for the page to be built from `adw.daily_summary`, so this plan shows `per project` instead of
  an incorrect median of medians. A toolkit view without `project_id` in the group-by is the clean
  follow-up.
- **Window anchor.** Anchoring on the newest day in the view instead of today keeps the codebase's
  single clock read. If a strict calendar window is ever wanted, the clock read must happen inside
  `getSummary`'s scope and AGENTS.md's clock rule must be amended in the same change.
- **`halted`.** The view counts `status = 'halted'`, which `RunStatus` in `src/types/adw.ts` does not
  list. This plan shows it as a neutral count only when non-zero and does not change `RunStatus`.
- **Not live.** `/summary` is outside `(dashboard)`: no `Providers`, no Realtime channel, so the
  header pill stays `connecting` there (as on `/skills`) and the page is not refreshed on screen when a
  run completes. It is correct on the next server render after a tag drop; a revisit within
  `staleTimes.dynamic` (300 s) may show the router cache's copy, the same bound History has.
- PostgREST's default `max-rows` (1000) caps the rows read: 90 days times the number of public
  projects stays far under it today; revisit if the project count grows past about ten.
- The issue's "`await connection()` first, as History" is superseded by the current History rule in
  AGENTS.md (`searchParams` is the marker, `connection()` would be redundant); the island reads
  `searchParams` first, which gives the same request-time hole.
