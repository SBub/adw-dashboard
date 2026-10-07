# Feature: Landing page rendering: static shell, cached past days, client-refreshable today

## Metadata

issue_number: `101`
adw_id: `ba819b41`
issue_json: `{"number":101,"title":"Landing page rendering: static shell, cached past days, client-refreshable today"}`

## Feature Description

The summary at `/` is today one request-time hole: `SummaryContent` awaits `connection()` and
calls one `"use cache"` scope, `getSummary()`, tagged `summary`, that holds the whole 30-day
report (past days and today together) with a 15-minute `revalidate`. Every completion drops the
whole entry, and the only way to see a newer figure for today is to reload the page once the
entry has been dropped or has aged out.

This feature splits the report along the one line that matters for freshness, the current UTC
day:

1. **Static shell** (unchanged): header, `h1`, intro and the UTC reading note are prerendered.
2. **Past days island** (server, under a `SectionBoundary`): after `await connection()` the
   island takes today's UTC date (`YYYY-MM-DD`) from the one request-time clock read, and calls a
   `"use cache"` scope `getPastDays(today)` that returns the `SUMMARY_DEFAULT_DAYS` (30) days
   strictly before `today`. `today` is a cache-key argument, so every request in one UTC day hits
   one entry and the first request after midnight builds a new entry that includes yesterday: no
   cron and no tag drop for the rollover. Long lifetime, tag `summary:past`, never dropped by a
   completion.
3. **Today island** (client leaf, under its own `QueryClientProvider`): the server prefetches
   today's day (all projects) through a short-lived `"use cache"` scope `getTodayState(today)`,
   tagged `summary:today`, into a `HydrationBoundary`, so the first paint is server-rendered.
   `TodaySummary` reads it with `useSuspenseQuery` under `queryKeys.summaryToday(today)`
   (`staleTime: "static"`, no clock read in render) and shows a **Refresh** button that calls
   `refetch()` on that query only: no `router.refresh()`, no server action, no navigation, only
   today's rows are transferred, through the browser Supabase client (publishable key, RLS).
4. The `/api/revalidate` webhook and the `revalidateHistory` action drop `summary:today` (in
   place of the old `summary`), so a fresh visitor sees a just-finished run without pressing the
   button.

## User Story

As a visitor reading the ADW public ledger on `/`
I want the past days to load instantly from a long-lived cache and today's figures to be
refreshable in place
So that I can follow today's work without reloading the page, while the stable history costs
the database nothing on every visit

## Problem Statement

Past days are immutable once the UTC day is over, yet they share one cache entry, one lifetime
and one tag with today, the only day that changes. Every completion therefore throws away and
re-reads 30 days to change one, the 15-minute `revalidate` that bounds today's staleness also
forces the immutable days to be re-read, and a visitor has no way to update today's numbers short
of a full reload (which, under the router cache, may not even reach the server).

## Solution Statement

- Make today's UTC date an explicit argument. It is read once per request, after
  `await connection()`, in the summary island (`utcDay(Date.now())`, a pure helper on an epoch
  in milliseconds), and passed down to both halves. This amends the clock rule in `AGENTS.md`:
  there are now exactly two argument-less clock reads, `getActiveRuns`'s `fetched_at` and this
  one, which runs only at request time, never in a prerender pass and never in client render.
  `AGENTS.md` already says the clock rule must be amended in the same change if a calendar window
  is ever wanted; this is that change.
- Replace the anchor-based `getDailySummary(days)` in the data boundary with two reads keyed by
  the explicit date: `getSummaryPast(today, days)` (`day >= from and day < today`, server only)
  and `getSummaryToday(today)` (`day = today`, also the `queryFn` of the today query). Both read
  the same `DAILY_SUMMARY_COLUMNS` and the same project list and assemble through the same pure
  `toSummaryReport`, so the server prefetch and the browser refetch produce an identical
  `SummaryDay | null`.
- Split the tag: `summaryPastTag()` (`summary:past`, used only by `getPastDays`, never dropped)
  and `summaryTodayTag()` (`summary:today`, on `getTodayState`, and the third tag of
  `historyTags(slug)`).
- Give the today island its own minimal provider (`SummaryProviders`: a `QueryClientProvider`
  over `makeQueryClient()`, nothing else; no Realtime, no `ConnectionIndicator`, per #70), mounted
  only around that island. `Providers` stays in `(dashboard)/layout.tsx`.
- Extract the day `<article>` out of `DailySummaryList` into a stateless `SummaryDayCard` used by
  both the server list and the client today card, so both halves render the same markup.

## Relevant Files

Use these files to implement the feature:

- `README.md` - "Summary", "Labels: no clock in render", "What is prerendered and what is not",
  "Webhook revalidation" and "The query layer" describe the current single-scope report, the
  anchor window and the `summary` tag; all must be rewritten to the split.
- `AGENTS.md` - the clock rule (exactly one clock site), the data boundary export list
  (`getDailySummary` as the sixth export), the query key list, the `"use client"` list, the
  `makeQueryClient`/`prefetch` users, the `historyTags`/`summary` tag rules, the whole "Summary"
  section (single `getSummary` scope, window anchored on the newest day, "not a live section: no
  React Query entry"), and the "Do not mount `Providers` ... on `/`" rule. Each must be amended in
  the same change.
- `.adw/project.md` - Tests section lists the `e2e/*.md` journeys and the Review section describes
  what `/` shows; both gain the today card and the new journey. Never rename or reorder its nine
  `##` headings.
- `src/app/page.tsx` - the landing page: static shell plus `SummaryContent` and `getSummary`; gets
  the clock read, the two islands and the two `"use cache"` scopes.
- `src/data/index.ts` - the data boundary; `getDailySummary` is replaced by `getSummaryPast` and
  `getSummaryToday`, sharing a private project-list read and `DAILY_SUMMARY_COLUMNS`.
- `src/lib/daily-summary.ts` - pure summary helpers; gains `utcDay`, `pastDaysWindow` and
  `toSummaryDay`; `summaryWindowStart` stays as their building block.
- `src/lib/daily-summary.test.ts` - unit tests for the new helpers, including the UTC split.
- `src/lib/history-tags.ts` / `src/lib/history-tags.test.ts` - tag spellings; `summaryTag`
  becomes `summaryPastTag` and `summaryTodayTag`, `historyTags` returns `summary:today` third.
- `src/app/api/revalidate/route.ts` - drops `historyTags(slug)` already; only its comments change
  (it now drops `summary:today`).
- `src/app/actions/revalidate-history.ts` - same: comments describe `summary:today`.
- `src/data/query-keys.ts` - gains `summaryToday(day)`.
- `src/data/query-client.ts` - `makeQueryClient` and `prefetch`, reused unchanged by the new
  provider and `getTodayState`; its header comment lists its users.
- `src/components/DailySummaryList.tsx` - the past days list; renders each day through the new
  `SummaryDayCard` and states the past window.
- `src/components/ClassDistributionBar.tsx`, `src/components/ProjectBreakdownTable.tsx` -
  stateless, now also rendered inside the client `TodaySummary` (through `SummaryDayCard`).
- `src/components/QueryBoundary.tsx` - wraps the today `useSuspenseQuery`, inside the new provider.
- `src/components/SectionBoundary.tsx` - wraps each server island.
- `src/components/ActiveRunsView.tsx` - the existing model for a `useSuspenseQuery` over a boundary
  `queryFn` with `staleTime: "static"`.
- `src/app/providers.tsx` - the dashboard provider; NOT reused on `/` (it opens Realtime); the new
  provider copies its `useState(makeQueryClient)` line only.
- `src/data/supabase.ts` - `getSupabase()` works in the browser (publishable key), so the client
  `queryFn` needs nothing new.
- `src/lib/status-colors.ts` - colour of the refresh error message (`STATUS_COLORS.failed.text`;
  no inline `rose`/`red`).
- `src/types/adw.ts` - `DailySummary`, `SummaryDay`, `SummaryReport` (unchanged shapes).
- `e2e/test_landing_no_filters.md` - asserts the window line and the first day card; re-read and
  adjust wording if the today card changes what "first day card" means.
- `.claude/commands/test_e2e.md` - the contract for the new journey file.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`,
  `.../cacheLife.md`, `.../cacheTag.md`, `.../revalidateTag.md` - read before touching the scopes.

### New Files

- `src/components/SummaryDayCard.tsx` - stateless day `<article>` (heading, counts, class bar,
  per-project table), with an optional `title` and an `actions` slot; no `"use client"`.
- `src/components/TodaySummary.tsx` - `"use client"`; the today card with the Refresh button.
- `src/app/summary-providers.tsx` - `"use client"`; `SummaryProviders`, a bare
  `QueryClientProvider` over `makeQueryClient()`, no Realtime.
- `e2e/test_landing_today_refresh.md` - agent-driven journey: Refresh refetches today in place.

## Implementation Plan

### Phase 1: Foundation

Pure helpers and their tests (`utcDay`, `pastDaysWindow`, `toSummaryDay`), the tag split, and the
new query key. Nothing renders differently yet.

### Phase 2: Core Implementation

The two data boundary reads replacing `getDailySummary`, the shared `SummaryDayCard`, the
`SummaryProviders` provider, the client `TodaySummary` card, and the page restructured into the
clock-reading island with the two sub-islands and their two `"use cache"` scopes.

### Phase 3: Integration

The webhook and action keep iterating `historyTags`, which now drops `summary:today`; comments,
`README.md`, `AGENTS.md` and `.adw/project.md` are brought in line; the landing journey is
re-checked and the new Refresh journey is added; the full validation suite and a build run.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the framework docs

- Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`,
  `cacheLife.md`, `cacheTag.md`, `revalidateTag.md` and `updateTag.md` (same directory) and the
  README sections "What is prerendered and what is not" and "Two caches, one source".

### 2. Pure helpers in `src/lib/daily-summary.ts`

- Add `utcDay(ms: number): string`: the UTC calendar day (`YYYY-MM-DD`) of an epoch in
  milliseconds, built with the UTC getters and the existing `pad2`. Pure: the caller passes the
  time. Document that it is the one place the request-time clock value becomes a day.
- Add `pastDaysWindow(today: string, days: number): { from: string; to: string }`: the `days`
  days strictly before `today` (`to` is the day before `today`, `from` is `days` days before
  `today`), built on `summaryWindowStart` (e.g. `to = summaryWindowStart(today, 2)`,
  `from = summaryWindowStart(today, days + 1)`). The data layer's SQL mirrors it with
  `.gte("day", from).lt("day", today)`.
- Add `toSummaryDay(rows, projects, day): SummaryDay | null`: the one day's `SummaryDay` from the
  view's rows, through `toSummaryReport` (rows of other days ignored, hidden projects dropped,
  same ordering and totals), or `null` when no visible project finished a run that day. This is
  what both the server prefetch and the browser refetch return, so the shape cannot drift.
- Update the file's header comment (window now ends on the explicit `today`, not the newest day
  in the view).

### 3. Unit tests in `src/lib/daily-summary.test.ts`

- `utcDay`: `Date.parse("2026-10-05T23:59:00Z")` is `2026-10-05`; `Date.parse("2026-10-06T00:01:00Z")`
  is `2026-10-06`; exactly `2026-10-06T00:00:00.000Z` is `2026-10-06`; `2025-12-31T23:59:59.999Z`
  is `2025-12-31`; a `+02:00` offset timestamp is placed on its UTC day.
- The split (the issue's case): with `today = utcDay(Date.parse("2026-10-06T12:00:00Z"))`, a run
  finished at `2026-10-05T23:59:00Z` has `utcDay` equal to `pastDaysWindow(today, 30).to` (past
  days), and one finished at `2026-10-06T00:01:00Z` has `utcDay` equal to `today` (today card),
  not inside the past window (`< today` is false).
- `pastDaysWindow`: `("2026-10-06", 30)` is `{ from: "2026-09-06", to: "2026-10-05" }`; a
  one-day window is the day before; crosses a month (`2026-03-01`, leap and common year) and a
  year boundary (`2026-01-01` gives `to: "2025-12-31"`).
- `toSummaryDay`: `null` for no rows; `null` when the only rows are of another day or of a hidden
  project; equals `toSummaryReport(...).rows[0]` for that day's rows; does not mutate its inputs.
- Keep every existing `summaryWindowStart`/`toSummaryReport` case.

### 4. Tags in `src/lib/history-tags.ts` and its test

- Replace `summaryTag()` with `summaryPastTag()` returning `"summary:past"` (past days scope,
  never dropped by a completion: past days are immutable, the scope's lifetime and the date in its
  key are what move it) and `summaryTodayTag()` returning `"summary:today"`.
- `historyTags(slug)` returns `[historyTag(slug), runsTag(slug), summaryTodayTag()]`, history
  first; update the header and function comments.
- `src/lib/history-tags.test.ts`: pin `summary:past` and `summary:today`, and the three-tag tuple
  ending in `summary:today`; assert `historyTags` never contains `summary:past`.

### 5. Query key in `src/data/query-keys.ts`

- Add `summaryToday: (day: string) => ["summary-today", day] as const`, documented as the landing
  page's today card: prefetched by `getTodayState`, read by `TodaySummary`. The day is part of the
  hash, so an entry can never be read for another day (the issue names the key `summaryToday`; a
  function of the day is what makes the server and browser keys match by construction).

### 6. Data boundary in `src/data/index.ts`

- Extract the project-list read of `getDailySummary` into a private `getSummaryProjects()`
  (`projects`: `id, slug, display_name`, ordered by slug, error thrown as `projects: ...`).
- Replace `getDailySummary(days)` with `getSummaryPast(today, days): Promise<SummaryReport>`:
  `pastDaysWindow(today, days)`; projects and `daily_summary` rows with
  `.gte("day", from).lt("day", today).order("day", { ascending: false })` read in one
  `Promise.all`; `toSummaryReport(rows, projects, { days, from, to })`. No anchor read. Server
  only, only from the page's `getPastDays` scope, never a `queryFn`.
- Add `getSummaryToday(today): Promise<SummaryDay | null>`: projects and `daily_summary` rows with
  `.eq("day", today)` in one `Promise.all`, through `toSummaryDay`. Also the `queryFn` of
  `queryKeys.summaryToday(today)`: on the server only inside `getTodayState`, in the browser on
  Refresh. Reads no clock; `today` always comes from the caller.
- Both keep the single `DailySummary[]` cast on `DAILY_SUMMARY_COLUMNS` (one cast per read site,
  same as now). Update the file's header comment (the summary page now reads two halves) and the
  JSDoc of both functions.

### 7. Shared `SummaryDayCard`

- Create `src/components/SummaryDayCard.tsx` with no `"use client"` and no state: props
  `day: SummaryDay`, optional `title?: ReactNode` (default the `formatDay(day.day)` `<time>`),
  optional `actions?: ReactNode` rendered at the end of the header row. Move the `<article>` body
  of `DailySummaryList` into it verbatim (counts with `STATUS_COLORS`, `ClassDistributionBar`,
  `ProjectBreakdownTable` with `label`).
- `DailySummaryList` maps `report.rows` to `SummaryDayCard`. Its empty state reads "No finished
  runs in the previous 30 days." (built from `report.days`), and the window line keeps its form
  ("30 days to <yesterday>, all projects"), since `report.to` is now the day before today and is
  never `null` (drop the `report.to === null` branch only if the type allows; otherwise keep it).

### 8. `SummaryProviders`

- Create `src/app/summary-providers.tsx` (`"use client"`): `useState(makeQueryClient)` and
  `<QueryClientProvider client={queryClient}>`. Nothing else: no `startRealtime`, no
  `useRouter`, no `ConnectionIndicator`. Comment why it is not `Providers` (that one opens the
  Realtime channel; #70 keeps `/` off it) and that it is mounted only around the today island.

### 9. `TodaySummary` client card

- Create `src/components/TodaySummary.tsx` (`"use client"`), props `{ today: string }` (the day
  comes from the server; the component never computes it).
- `useSuspenseQuery({ queryKey: queryKeys.summaryToday(today), queryFn: () => getSummaryToday(today), staleTime: "static" })`,
  reading `data`, `refetch`, `isFetching`, `isRefetchError`.
- Render a `SummaryDayCard` with `title` "Today, <formatDay(today) in a `<time>`>" and the
  Refresh button in `actions`; when `data` is `null`, an `<article>` with the same title row and
  button and the line "No finished runs yet today." (same card styling, dashed border like the
  list's empty state).
- The button: `type="button"`, `onClick={() => void refetch()}`, `disabled={isFetching}`,
  `aria-busy={isFetching}`, label "Refresh" and "Refreshing..." while pending (subtle: muted text
  and reduced opacity, no spinner component). No `router.refresh()`, no server action, no link.
- On a failed refetch React Query keeps `data` (`useSuspenseQuery`'s `throwOnError` only throws
  when there is no data, see `@tanstack/react-query` `suspense.js` `defaultThrowOnError`), so the
  card keeps showing the old figures and adds a `role="status"` line "Refresh failed. Showing the
  last loaded figures." with `STATUS_COLORS.failed.text` and a "Retry" button calling `refetch()`.
- No `Date.now()`, no `new Date()`, no relative label in render.

### 10. Landing page `src/app/page.tsx`

- Remove `getSummary` and the `summaryTag` import.
- Add the past scope:
  ```ts
  async function getPastDays(today: string) {
    "use cache";
    cacheTag(summaryPastTag());
    cacheLife({ stale: 300, revalidate: 86400, expire: 172800 });
    return getSummaryPast(today, SUMMARY_DEFAULT_DAYS);
  }
  ```
  (`stale` 300 keeps `staleTimes.dynamic` at or under it; revalidate a day bounds metrics written
  after midnight for a run finished just before it; expire two days.)
- Add the today scope, a one-liner around `prefetch` like the dashboard's state functions:
  ```ts
  async function getTodayState(today: string) {
    "use cache";
    cacheTag(summaryTodayTag());
    cacheLife({ stale: 60, revalidate: 60, expire: 300 });
    return prefetch(queryKeys.summaryToday(today), () => getSummaryToday(today));
  }
  ```
  (short lifetime bounds failed/halted runs and late metrics, which fire no tag drop; completions
  are dropped at once by the webhook; `expire` stays at 5 minutes, not under.)
- Restructure the hole:
  - `SummaryContent` (async): `await connection();` then `const today = utcDay(Date.now());` (the
    second and last argument-less clock read in the codebase, request time only; comment it and
    point to `AGENTS.md`), then render, in this order, a `SectionBoundary` around `TodayIsland`
    (fallback "Loading today...", detail "Today's figures did not load.") and a `SectionBoundary`
    around `PastDays` (fallback "Loading past days...", detail "The past days did not load."),
    both passed `today`. One clock read feeds both, so the halves can never disagree on the day.
  - `TodayIsland({ today })` (async server): `const { state } = await getTodayState(today);` and
    return `<SummaryProviders><HydrationBoundary state={state}><QueryBoundary fallback=... detail="Today's figures did not load."><TodaySummary today={today} /></QueryBoundary></HydrationBoundary></SummaryProviders>`.
  - `PastDays({ today })` (async server): `await getPastDays(today)` into `DailySummaryList`.
  - Keep the outer `SectionBoundary` around `SummaryContent` (it is the request-time hole). The
    page body (h1, intro, note) is unchanged and stays the static shell; `metadata` unchanged.
- Update the comments on the page to describe the split.

### 11. Webhook and action comments

- `src/app/api/revalidate/route.ts` and `src/app/actions/revalidate-history.ts`: code unchanged
  (both iterate `historyTags(slug)`); rewrite the comments that say they drop `summary` to say
  `summary:today` (today's card), and that `summary:past` is never dropped. Private projects are
  ignored before any drop, which is right for `summary:today`: `/` only shows public projects.

### 12. Documentation

- `README.md`, "Summary": rewrite "The window", "Cache" and "Revalidation" for the split
  (today's UTC date from the one request-time clock read after `connection()`; past days are the
  30 days before it, `getPastDays` tagged `summary:past` with the long lifetime and the date in the
  key as the rollover; today is `getTodayState` tagged `summary:today`, prefetched and hydrated
  into `SummaryProviders`, refreshed in place by the button; the webhook and action drop
  `summary:today`). "Data": `getSummaryPast`/`getSummaryToday` in place of `getDailySummary`.
  "Labels: no clock in render": name the second server clock site. "The query layer": add
  `summaryToday`. "Webhook revalidation": the third tag is `summary:today`.
- `AGENTS.md`: amend the clock rule (two sites, the second named precisely), the data boundary
  export list (`getSummaryPast` server only from `getPastDays`; `getSummaryToday` from
  `getTodayState` and as the `TodaySummary` `queryFn`), the query key list and the
  `useSuspenseQuery` readers (`TodaySummary`), the `makeQueryClient` users (`SummaryProviders`),
  the `prefetch` users (`getTodayState`), the `"use client"` list (`TodaySummary`,
  `SummaryProviders`), the stateless component list (`SummaryDayCard`; note `ClassDistributionBar`,
  `ProjectBreakdownTable` and `SummaryDayCard` are also rendered by the client `TodaySummary` and
  must stay stateless), the action rule ("the third, `summary:today`, was decided"), the tag
  rule (`summaryPastTag`, `summaryTodayTag`; never write `summary:` inline), and the whole
  "Summary" section (two scopes with their lifetimes; window anchored on today's UTC date, not on
  the newest view row; today is a React Query entry under `SummaryProviders` with no Realtime and
  no catch-up; never `router.refresh()` or a server action from Refresh; past is never dropped by
  a completion). Keep "Do not mount `Providers` or start Realtime on `/`" and add that
  `SummaryProviders` is the only provider on `/`. No em-dashes.
- `.adw/project.md`: Tests section lists `e2e/test_landing_today_refresh.md`; Review section's `/`
  description gains "the today card with a Refresh button above the past day cards". Headings
  untouched.

### 13. E2E journeys

- Browser coverage is warranted (a new interactive control on `/`) and the profile has no code
  E2E suite (`none`), so the evidence is an agent-driven journey plus the review screenshots. A
  journey is the right layer here because what must be proven (Refresh issues only today's
  Supabase reads, no document or RSC request, no navigation) is network behaviour that no unit
  test in `src/**/*.test.ts` can observe.
- Create `e2e/test_landing_today_refresh.md` per `.claude/commands/test_e2e.md` (`## User Story`,
  numbered `## Test Steps` with `**Verify**` lines, `## Success Criteria`):
  1. Navigate to `/`; **Verify** the `h1`, then an `article` whose level-2 heading starts with
     `Today,` and holds a `button` named `Refresh`, followed by past day cards (or the past empty
     state) and the window line ending `all projects`; **Verify** the today card's date is the
     day after the window line's end date.
  2. **Verify** the server-rendered HTML already holds the today card (`browser_evaluate` a
     `fetch("/")` text contains `Today,` and `Refresh`).
  3. Clear/record the network log (`browser_network_requests`), click `Refresh`.
  4. **Verify** the requests issued after the click are only Supabase REST reads: exactly one
     `GET .../rest/v1/daily_summary` whose query has `day=eq.<today>`, at most one
     `.../rest/v1/projects`, and no request to the app origin (no document, no `_rsc`, no POST
     server action).
  5. **Verify** the URL is still exactly `/`, the button is back to `Refresh`, no
     `Refresh failed` text, and the past day cards are unchanged.
  6. Screenshot before and after the click.
- Re-read `e2e/test_landing_no_filters.md`: its "first day card" and "window line" steps still
  hold (the today card is an `article` with a level-2 date heading, the window line now ends on
  yesterday and still says `30 days ... all projects`); adjust its wording only if a step no
  longer matches.
- Review phase: screenshot `/` at 1920x1080 and 375x667 (full page): the today card on top with
  its Refresh button in the header row (wrapping cleanly on mobile), past day cards below.

### 14. Validation

- Run every command in `Validation Commands`, fix anything they report, and confirm with
  `NEXT_PRIVATE_DEBUG_CACHE=1` on a production start (port from `.ports.env`) that a second GET
  of `/` adds no `generated entry` line for `getPastDays`.

## Testing Strategy

### Unit Tests

- `src/lib/daily-summary.test.ts`: `utcDay` (UTC day boundaries, offset input, year end), the
  issue's 23:59-yesterday versus 00:01-today split against `pastDaysWindow` and `today`,
  `pastDaysWindow` (30-day bounds excluding today, month/leap/year crossings), `toSummaryDay`
  (null cases, equality with `toSummaryReport` for the day, no mutation).
- `src/lib/history-tags.test.ts`: the two new spellings and the new `historyTags` tuple; past tag
  absent from it.

### Test Coverage

- `src/lib/daily-summary.test.ts` (unit, vitest): `utcDay` and `pastDaysWindow` cases catch a run
  finished at 23:59 UTC landing in today or at 00:01 UTC landing in past days (an off-by-one or a
  local-time getter), which nothing tests today because the window is anchored on the view.
  Fails without the feature: the helpers do not exist.
- `src/lib/daily-summary.test.ts` (unit): `toSummaryDay` catches a server/browser shape drift
  for the today card and a hidden project leaking into it.
- `src/lib/history-tags.test.ts` (unit): pins `summary:past`/`summary:today` and that completions
  drop `summary:today` but never `summary:past`; fails against the current `summary` spelling.
- No unit test for `TodaySummary`, `SummaryProviders` or the page: the profile has no component
  test layer; their behaviour (Refresh issues only today's reads, no navigation) is covered by the
  `e2e/test_landing_today_refresh.md` journey task above and the review screenshots.

### Edge Cases

- No finished run today yet: `getSummaryToday` returns `null`; the card shows "No finished runs
  yet today." and Refresh still works.
- No finished run in the past 30 days: past empty state; today card unaffected.
- A run finished at 23:59:59.999 UTC yesterday is a past day; one at 00:00:00.000 today is today.
- Midnight rollover: the first request after 00:00 UTC computes a new `today`, so new
  `getPastDays` and `getTodayState` keys; the old entries simply age out.
- Page left open across midnight: Refresh keeps reading the day the page was rendered for (the
  prop); a reload moves it on. Documented, not fixed (no clock read in client render).
- Refresh fails (offline): old figures stay, error line with Retry; no error boundary takes over.
- Double click: the button is disabled while `isFetching`; React Query dedupes anyway.
- A private project's run: RLS hides it on both server and browser reads, and the webhook ignores
  it before any tag drop.
- A run finishing `failed`/`halted` or late metrics: no tag drop; the 60-second `revalidate` on
  `getTodayState` and the Refresh button bound it; for yesterday's rows the one-day `revalidate`.

## Acceptance Criteria

- `/` prerenders the header, `h1`, intro and UTC note as the static shell; the build passes.
- The today card is in the server HTML of `/` (first paint is server-rendered), above the past
  day cards, and carries a Refresh button.
- Past days are exactly the 30 UTC days before today; today's rows never appear in them.
- Clicking Refresh issues only browser Supabase reads for today's day (plus at most the project
  list), no request to the app origin, no navigation; the button shows a pending state; on error
  the old figures stay with a retry message.
- `getPastDays` is `"use cache"` with `cacheTag(summaryPastTag())` and
  `cacheLife({ stale: 300, revalidate: 86400, expire: 172800 })`, called only after
  `connection()`; `getTodayState` is `"use cache"` with `cacheTag(summaryTodayTag())` and a short
  `cacheLife`, built on `prefetch`.
- `historyTags(slug)` is `[history:<slug>, runs:<slug>, summary:today]`; no `summary` tag and no
  inline `summary:` literal remain anywhere in `src/`.
- `/` mounts `SummaryProviders` only around the today island; no Realtime channel, no connection
  indicator on `/`.
- Exactly two argument-less clock reads exist in `src/` (`fetched_at` and the summary island's),
  and `AGENTS.md`/`README.md` say so.
- `.next/cache/fetch-cache` holds no Supabase entry after `yarn build`.
- All validation commands pass; `README.md`, `AGENTS.md` and `.adw/project.md` describe the split.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint` - ESLint over the changed files (part of the commit hook).
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`: the new boundary signatures, query key and
  component props.
- `yarn knip` - no dead export left behind (`getDailySummary`, `summaryTag`) and every new export
  used.
- `yarn format:check` - Prettier on every touched file.
- `yarn test` - the vitest suite, including the new `daily-summary` and `history-tags` cases.
- `yarn build` - proves the shell still prerenders, the clock read sits only after `connection()`
  (a misplaced one fails the build with `next-prerender-current-time`), and the scopes compile;
  needs `.env.local`.
- `grep -rn "Date.now()\|new Date()" src --include=*.ts --include=*.tsx | grep -v "\.test\.ts"` -
  must list exactly the two permitted sites (`src/data/index.ts` `fetched_at`, `src/app/page.tsx`
  summary island).
- `grep -rn '"summary"\|summary:' src --include=*.ts --include=*.tsx | grep -v history-tags` -
  must print nothing (tag spellings only in `src/lib/history-tags.ts`).
- `ls .next/cache/fetch-cache 2>/dev/null | xargs -I{} grep -l supabase .next/cache/fetch-cache/{} 2>/dev/null` -
  must print nothing (no Supabase body stored in Next's data cache).

## Notes

- No new dependency.
- Deviation from the issue, deliberate: the key is `queryKeys.summaryToday(day)`, a function of
  the day, so the server prefetch and the browser read hash identically and an entry can never be
  served for another day. The browser path is the browser Supabase client (option one in the
  issue), not a route handler: `getSupabase()` already works there with the publishable key and
  RLS, and a handler would add a second public endpoint for nothing.
- Refresh transfers today's `daily_summary` rows plus the small project list (names the rows and
  drops hidden projects, the same as the server read). If "one request" must be literal, a later
  change can embed the project names through PostgREST resource embedding on the view; it is not
  needed for correctness.
- The issue asks for a Playwright test; the profile declares no `@playwright/test` suite (E2E code
  suite `none`), so the network assertion lives in the `e2e/test_landing_today_refresh.md`
  journey, run through the Playwright MCP server by the test phase.
- Router cache: `staleTimes.dynamic` (300 s) is above `getTodayState`'s `stale` (60 s). That rule
  in `AGENTS.md` exists for History, which has no in-place refresh; for the today card a revisit
  within 5 minutes may show the router-cached figures, and the Refresh button is the remedy.
  Leave `staleTimes` unchanged and say so in the `AGENTS.md` Summary section.
- Future: once issue #3 lands a leaf-level clock store, the today card could roll over at
  midnight without a reload; out of scope here.
