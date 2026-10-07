# Agent instructions

Behavioural rules for working in this repository. Reference material (what the
app is, how to run it, scripts) lives in `README.md`, not here.

## Tooling

- Yarn only (4.6.0 Berry, pinned via `packageManager` and corepack). Never npm
  or npx; `yarn dlx` if a one-off binary is unavoidable.
- lefthook runs on every commit: Prettier on staged files (re-staged
  automatically), `yarn lint`, `yarn typecheck`, `yarn knip`; and `yarn test`
  on every push. Hooks install through `postinstall` on `yarn install`. Do not
  bypass them.
- Conventional-commit messages (`feat:`, `fix:`, `chore:`, `docs:`). No
  trailers of any kind: no `Co-Authored-By`, no `Signed-off-by`.
- Default branch is `develop`.
- `next dev` in Next 16 wants to write its own `AGENTS.md` and `CLAUDE.md`.
  That is switched off in `next.config.ts` (`agentRules: false`); these two
  files are maintained by hand. Still read the relevant guide under
  `node_modules/next/dist/docs/` before Next.js work; the framework moves
  faster than training data.
- No em-dashes in any file. Use commas, periods, colons or parentheses.
- `.adw/project.md` is this repository's ADW profile; the toolkit's slash commands
  read it before anything else. When a change renames a script, moves a port,
  adds an env file or changes where docs live, update the profile in the same
  change, and never rename or reorder its nine `##` headings.

## Architecture

- Components take typed props only. They never fetch, compute or count
  business values; they render what they are given. `RunRow` and
  `RunHistoryList` take `Run` rows as stored (the page's `HistoryPagination`
  and `CompletedRuns` are the async components that await data, and they live
  in the page file, not under `src/components/`). The one formatting a component may do is call a
  pure helper from `src/lib/` on the row's own fields (`RunRow` calls
  `durationLabel(run.started_at, run.finished_at)`); no view model is built
  anywhere for runs. Run and queue row titles are shown in full and wrap; the
  row is `items-start` and every element sits in a 24px first-line box
  (`leading-6` or an `h-6 items-center` wrapper), so the status pill is on the
  title's first line. The detail grid's `Field` keeps its `truncate`.
- No clock reads outside the cached boundary. There are exactly two
  argument-less `new Date()` / `Date.now()` sites in the codebase
  (`new Date(ms)` on a parsed input, as in `formatTimestamp`, is not a clock
  read): `getActiveRuns`'s `fetched_at` stamp, which
  on the server only ever executes inside `getActiveRunsState`, directly
  after its `await connection()`, so only at request time (in
  the browser it runs as a `queryFn` on a cache miss and in the realtime
  catch-up, where a clock read is fine), and `utcDay(Date.now())` in the
  summary page's `requestToday` (`src/app/page.tsx`, a plain function, not a
  component body, which `react-hooks/purity` forbids), directly after its
  `await connection()`, so only at request time, never in a prerender pass and
  never in client render. Its day is passed down as an argument; nothing below
  it reads the clock again. Do not add a third. A future time-dependent label is a
  new client leaf with a `useSyncExternalStore` store whose server snapshot
  does not read the clock (issue #3), never a clock read in `QueueRow`,
  `QueueView` or `RunRow`. `getQueue` reads no clock either and
  has no `fetched_at`. `getCompletedRuns` reads no clock and
  must stay that way: it has no `fetched_at`, and its cache scope is there for
  the tag, not for a clock-read permission. No clock read in client render at all:
  never call `Date.now()` or `new Date()` in a component, a hook body, a
  `queryFn` outside a cache scope, `generateMetadata` or `generateStaticParams`.
  Under `cacheComponents` the server form fails the build and the client form
  silently aborts the client prerender and drops the component out of the
  static HTML (it ships as its Suspense fallback). Relative labels ("updated 2m
  ago", the stale badge, a running run's elapsed time) were removed for this
  reason and are tracked in issue #3; do not reintroduce them with a clock read
  in render. Keep `fetched_at` in the boundary's return value, as an ISO
  string (it travels through the dehydrated cache as JSON), even though nothing
  in the UI reads it today; issue #3 needs it as the server snapshot.
- `durationLabel` in `src/lib/run-view.ts` is pure (two timestamps in, reads no
  clock, `null` while `finished_at` is `null`) and unit-tested in
  `src/lib/run-view.test.ts` with fixed timestamps; `secondsLabel` in the same
  file formats the summary's `duration_sum_s` in the same format through
  the same helper. Every change to the label format goes with a test case; do
  not move label derivation into SQL.
- Wiring happens at one boundary, `src/data/`. Pages and components import
  `getProjects`, `getActiveRuns`, `getCompletedRuns` and `getQueue` from
  `@/data` and nothing else for data. The fifth export, `getProjectSlug(projectId)`, is
  read only by the `/api/revalidate` route handler (it turns a webhook's
  `project_id` into the slug the tags are keyed by); never call it from a
  page, a component or a `queryFn`. The sixth, `getSummaryPast(today, days)`,
  is called only from the summary page's `getPastDays` scope (see "Summary"),
  never a `queryFn`. The seventh, `getSummaryToday(today)`, is called on the
  server only from the summary page's `getTodayState` scope and is the
  `queryFn` of `TodaySummary`; it reads no clock (`today` always comes from
  the caller). Both read `daily_model_summary` and `daily_phase_summary` for
  the same days in the same `Promise.all` as their `daily_summary` read. `getProjects`, `getActiveRuns` and
  `getQueue` are also the `queryFn`s, passed directly, with no fetcher wrapper in between (a function that only calls the
  boundary adds nothing; do not reintroduce one); `getCompletedRuns` is never
  a `queryFn`. All four are async database reads: `getProjects` reads the
  `project_summaries` view, `getActiveRuns()` (no argument) reads the `runs`
  table with `status in (running, failed)` for every visible project,
  `updated_at desc`, and returns `{ active, fetched_at }`,
  `getCompletedRuns(slug, bookmark, q)` the view by slug and then `runs` by
  `project_id` with `status = completed`
  (narrowed by `historySearchFilter(q)` when `q` is not `null`), one
  keyset page at a time in either direction (rows strictly older than an
  `after` bookmark, or strictly newer than a `before` bookmark read ascending
  and reversed by `historyItems`; shown `updated_at desc, adw_id desc`;
  `HISTORY_PAGE_SIZE` rows plus two counts on the same filter, the total and
  the rows newer than the first shown row, assembled by `toHistoryPage` into
  `{ items, page, pageCount, hasNewer, newerCursor, olderCursor }`; never an
  offset), `getQueue(slug)`
  the same view by slug (unknown slug: `[]`) and then `queue_items` by
  `project_id` with `state = queued`, ordered `position asc, issue_number asc`.
  Changing what is read
  means changing `src/data/index.ts` while keeping those signatures, and
  nothing elsewhere. The
  query layer (`query-keys.ts`, `query-client.ts`, `active-runs-query.ts`,
  `active-runs-state.ts`) holds keys, the client factory, the Active query
  options and the Active prefetch only; it calls boundary functions and never
  reads Supabase itself.
- The boundary casts the untyped Supabase rows (`ProjectSummary` for the view,
  `Run[]` for `runs`, `QueueItem[]` for `queue_items`, `DailySummary[]` for
  `daily_summary`, `DailyModelSummary[]` for `daily_model_summary`,
  `DailyPhaseSummary[]` for `daily_phase_summary`) in
  `src/data/index.ts`.
  Those casts are the only place the shapes are asserted; do not add another
  in a page or component. When touching the `runs` select, keep the column
  list equal to the fields of `Run`, `QUEUE_COLUMNS` equal to the fields
  of `QueueItem`, `DAILY_SUMMARY_COLUMNS` equal to the fields of
  `DailySummary`, `DAILY_MODEL_SUMMARY_COLUMNS` equal to the fields of
  `DailyModelSummary`, and `DAILY_PHASE_SUMMARY_COLUMNS` equal to the fields
  of `DailyPhaseSummary`, all in `src/types/adw.ts`.
- Active is one query entry for every project, `queryKeys.activeRuns`. On
  the server `getActiveRuns` is called only from `getActiveRunsState` in
  `src/data/active-runs-state.ts`: React `cache()` around
  `await connection()` and then `prefetch(queryKeys.activeRuns,
getActiveRuns)`. It is never `"use cache"` (a prerendered scope is served
  from the frozen Resume Data Cache, issue #69), and never called from a page
  body, a layout body or `generateMetadata`: only from the request-time
  islands that consume it (`SidebarActiveRuns` in the dashboard layout,
  `AllActiveRuns` on `/projects`, `ProjectActiveRuns` on the project page),
  each under a `SectionBoundary`, each rendering its own `HydrationBoundary`
  with the returned state as the ancestor of its consumer, so the entry
  exists before the consumer renders. React `cache()` makes them one read per
  request; this is the one `cache()` in the codebase (the rule against a
  `cache()` wrapper below is about `getHistory`, which Next already joins).
  `activeRunsQuery` in `src/data/active-runs-query.ts` is the one spelling of
  the Active query options (key, `queryFn: getActiveRuns`,
  `staleTime: "static"`, `refetchOnMount: false`); every reader spreads it and
  adds only a `select`. `getCompletedRuns` is called only from `getHistory`, the page's second
  `"use cache"` function, tagged `historyTag(slug)`; that tag is the contract
  with the `revalidateHistory` action and the `/api/revalidate` route handler,
  and all three take the spelling from `src/lib/history-tags.ts`. `getQueue`
  is called on the server only from `getQueueState`, a page
  `"use cache"` function (untagged: no server writer drops it), awaited
  together with `getProject` in one `Promise.all`; `generateMetadata` does
  not call it.
- Every screen narrows the one Active entry through the pure helpers in
  `src/lib/active-runs.ts` (tested in `src/lib/active-runs.test.ts`; every
  change to them goes with a test case): `activeRunsOf(runs, projectId)` is
  `ActiveRunsView`'s `select`, `activeRunCounts(runs)` is `ProjectNav`'s, and
  `groupActiveRuns(runs, projects)` groups the `/projects` overview in
  sidebar order. The sidebar's running and failed counts come only from
  `activeRunCounts`, never from `ProjectSummary.running` or `.failed` (those
  mirror the view and nothing renders them), so the sidebar, `/projects` and
  every project page show the same rows.
- The Queue section sits below Active through `ActiveRunsView`'s `queue` slot
  prop: the page builds it (its own `HydrationBoundary` around its own
  `QueryBoundary` around `QueueView`) and passes it in, and `ActiveRunsView`
  renders it after the Active section. Do
  not read the queue inside `ActiveRunsView`, merge it into the runs entry,
  or share one boundary between the two. The Queue and
  Active headings arrive the same way, as the `heading` slot props of
  `QueueView` and `ActiveRunsView`. The project header (`PageHeader`) is
  rendered by the page, not by `ActiveRunsView`, which has no not-found
  branch.
- Section headings come from `SectionHeading` (`src/components/SectionHeading.tsx`),
  a server component with no state: title, an always-visible muted
  description, and an optional detail behind an info button. The detail is
  CSS-only (group hover and `focus-within`), always in the DOM and referenced
  by the button's `aria-describedby`, with an id derived from the title. The
  section copy lives in the page, which builds all three headings and passes
  Queue's and Active's into `QueueView` and `ActiveRunsView` as `heading`
  slots; do not import `SectionHeading` into a client component or move the
  copy into one. History's heading takes the search boundary in its
  `controls` slot and the pagination boundary in its `actions` slot, so the
  `<h2>` stays outside every `SectionBoundary`. The heading row owns that
  layout (search next to the title, pagination at the right edge, both
  independent of the results), so do not put both in one slot or
  reintroduce `justify-between`. The detail popover takes `TOOLTIP_LAYER`
  from `src/lib/layers.ts` (defined nowhere else), the topmost layer of the
  page; no other element may take a z-index at or above it, and
  `src/lib/layers.test.ts` scans `src/` and fails on one.
- The project route is `projects/[owner]/[repo]`. The slug is assembled from
  `owner` and `repo` only in the page (`${owner}/${repo}`, once); no other
  file splits or joins it, and everything below the page (data boundary,
  `queryKeys.queue(slug)`, `historyTag`, the bookmark,
  `revalidateHistory`) takes the slug as is. `generateStaticParams` in the
  same file is the one place that splits a slug, into the two params. URLs
  never carry the project id. Do not reintroduce a catch-all segment.
- `generateStaticParams` in `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`
  must never return an empty array. Under `cacheComponents` an empty result
  fails the build (nothing to prerender the segment with), so the empty-list
  branch returns the placeholder `{ owner: "_", repo: "none" }`, which the page
  turns into `notFound()` at request time. Keep that guard when touching the
  function.
- `getProjects()` runs at build time (layout prefetch and
  `generateStaticParams`), and `getCompletedRuns()` and `getQueue()` run
  at build time for every slug (history and queue scopes), so
  `yarn build` needs `.env.local` with the two
  Supabase variables. A missing file fails the build on purpose; do not add a
  fallback that returns an empty list.
- Every query key is defined in `src/data/query-keys.ts` (`queryKeys.projects`,
  `queryKeys.activeRuns`, the one Active entry, `queryKeys.queue(slug)`, the
  queued items, the catch-up prefix `queryKeys.allQueues`, and
  `queryKeys.summaryToday(day)`, the summary
  page's today card) and imported from there: in the layout's and the
  pages' prefetches, in `activeRunsQuery`, in `ProjectNav`'s,
  `ActiveRunsOverview`'s, `QueueView`'s and
  `TodaySummary`'s `useSuspenseQuery`,
  and in every `setQueryData` the Realtime listeners do. Never build a key inline and never
  add a key literal elsewhere: a key that differs by one element is a cache
  miss, which means a second fetch in the browser. There is no per-project
  runs key. The slug is part of the queue key's hash; the slug is assembled once in the page; pass it as is.
- `makeQueryClient()` in `src/data/query-client.ts` is the one `QueryClient`
  factory. Every server prefetch, `Providers` and `SummaryProviders` build from it; do not call
  `new QueryClient()` anywhere else, or the dehydrate rule drifts between sides.
- `prefetch(queryKey, queryFn)` in the same file is the one server prefetch.
  Every `"use cache"` state function (the layout's `getProjectsState`, the
  project page's `getQueueState`, the summary page's
  `getTodayState`) is a one-liner around it that adds only its
  `cacheTag`s, and `getActiveRunsState` is a one-liner around it after
  `connection()`; do not inline `makeQueryClient` + `query()` + `dehydrate()`
  again in a page or layout, and do not add a `.catch` to the helper (an empty
  dehydrated cache ships the fallback silently). Whatever it returns must stay
  plain JSON, because it is a `"use cache"` result or dehydrated into the
  HTML.
- A project page's not-found decision is `getProject(slug) === null`:
  `getProject` is the page's `"use cache"` scope (tag `projects`, no clock
  read) that finds the slug in `getProjects()`, shared by the page body,
  the header and `generateMetadata`; never from the Active entry, never by
  searching a dehydrated state's queries by hash, and never from the queue (`getQueue` returns `[]` for an unknown
  slug); the History islands render only after that decision, so
  `getCompletedRuns` returning an empty page for an unknown slug is never shown.
- Two boundaries, never a bare `Suspense`. Any `useSuspenseQuery` is rendered
  inside `QueryBoundary` (`src/components/QueryBoundary.tsx`); any
  server-rendered section that can fail independently of its siblings (the
  page's `HistoryPagination` and `CompletedRuns`, and the three Active
  islands `SidebarActiveRuns`, `AllActiveRuns` and `ProjectActiveRuns`, one
  boundary each) is
  rendered inside `SectionBoundary`
  (`src/components/SectionBoundary.tsx`). Without an error boundary a failed
  read escapes to the segment's `error.tsx` and unmounts the whole pane,
  Active included. The two differ in their Retry and must not be swapped:
  `QueryBoundary` passes `reset` from `useQueryErrorResetBoundary` as
  `onReset`, or Retry re-reads the cached query error; `SectionBoundary` does
  not use `useQueryErrorResetBoundary` (its child is not in the query cache,
  there is nothing to reset) and instead calls `router.refresh()` and then
  `resetErrorBoundary()`, in that order, so the re-mounted server component
  is a fresh server render, not a replay of the failed one. Both share the
  panel in `src/components/ErrorPanel.tsx`. `QueryBoundary` sits inside
  `Providers`, where the query it guards has its client. The one exception
  is `HeaderLink`'s `usePathname` read, which sits in a plain `Suspense` in
  `SectionNav.tsx`: it reads no data and cannot fail, it only suspends during
  prerender on a project page outside `generateStaticParams`. Its fallback is
  the same link inactive, never a spinner or an empty node. No other
  `Suspense` may be bare.
- Every loading fallback on the projects side (the sidebar, `/projects`,
  the project page and its `loading.tsx`) is a skeleton from
  `src/components/LoadingSkeletons.tsx`, built on the one `Skeleton`
  primitive in `src/components/Skeleton.tsx` (a neutral surface,
  `motion-safe:animate-pulse` so reduced motion gets static blocks, always
  `aria-hidden`), inside a `role="status"` container with `aria-busy="true"`
  and an `aria-label`; never a "Loading..." line, a spinner or `null`. No
  other element takes the pulse class for a placeholder. A skeleton mirrors
  its component's box classes (border, radius, padding, gaps) and line
  count, with each text line a bar as tall as its line box, and changes in
  the same commit as that component; `src/components/LoadingSkeletons.test.ts`
  pins the row and field counts, the labels and the reduced-motion rule.
  Nested boundaries around the same component (the outer `SectionBoundary`
  and the inner `QueryBoundary`) take the same element, never two stacked.
  The project page's Active fallback carries the real Active and Queue
  headings (the page builds them before the boundary), so they are in the
  static shell. `HistorySearchFallback` stays the real box, disabled, not a
  skeleton, and the error panels are unchanged. The summary page (`/`) and
  `HeaderLink`'s fallback are not part of this rule.
- `queryClient.prefetchQuery` and `prefetchInfiniteQuery` are deprecated in
  the installed React Query; use `queryClient.query()` and `infiniteQuery()`.
  Do not swallow their rejection on the server prefetch: an empty dehydrated
  cache ships the fallback silently, a thrown error fails the build loudly.
- `cacheComponents` treats `Date.now()` as IO in both prerender passes. On the
  server, anything that reads the clock (React Query's `query()` and
  `dehydrate` do) must sit inside a `"use cache"` function, or after
  `connection()` (as in `getActiveRunsState`), or the build fails.
  In client components it does not fail the build: the first clock read
  silently aborts the client prerender and the component ships as its Suspense
  fallback. That is why the projects and Active queries have
  `staleTime: "static"`; keep it, and check the served HTML (not just the
  build) when adding client hooks to the prerendered shell: the run rows (an
  `adw_id` in a `<code>`) must be in the document. A `useSyncExternalStore`
  hook with a data-derived `getServerSnapshot` (`fetched_at`) is how a client
  component could depend on the time without that read; that is the shape
  issue #3 proposes, at the leaf level. When you
  check, know that the Active rows (sidebar counts, `/projects`, a project's
  Active section) are request-time holes and always arrive as a streamed
  Suspense completion (fallback plus hidden segment plus `$RC` swap in the
  same document), not inline in the shell. See README, "Prefetch and
  hydration of the Active runs".
- The header's current section comes only from `headerSection` in
  `src/lib/header-section.ts` (pure, tested in
  `src/lib/header-section.test.ts`; every change to it goes with a test
  case), read by `HeaderLink`. "Projects" is active on `/projects` and every
  path below `/projects/` (never `/projectsx`) and takes the brand's text
  colour; the brand is active on `/` only and keeps its styling. The active
  link carries `aria-current="page"`, the other none.
- `src/types/adw.ts` keeps database-row types (`Project`, `Run`, `QueueItem`) and the view
  model (`ProjectSummary`) in clearly separated sections. Row types mirror the
  schema column for column; `ProjectSummary` is produced by the data layer.
  `DailySummary`, `DailyModelSummary` and `DailyPhaseSummary` mirror the
  summary views' columns and sit with the view models, beside the report types
  (`SummaryDay`, `SummaryModel`, `SummaryPhase`) assembled from them.
  There is no run or queue item view model; do not add one for a label that a component can
  format from the row's own fields.
- Server components by default; `"use client"` only where the browser must
  hold state (the React Query provider in `src/app/providers.tsx`,
  `ProjectNav`, which reads the pathname and the query cache,
  `ActiveRunsView`, which reads one project's active runs from the query cache,
  `ActiveRunsOverview`, which reads every project's active runs and the
  project list from the query cache on `/projects`,
  `QueueView`, which reads the queued items from the query cache,
  `ConnectionIndicator`, which subscribes to its store, `HeaderLink`, which
  reads the pathname to mark the header's current section, `HistorySearch`, which
  holds the search box's local text and calls the router, and
  `HistoryTransition`, which holds the one `useTransition` the box and
  `HistoryResults` share, `SummaryProviders` in `src/app/summary-providers.tsx`,
  the summary page's bare query client, and `TodaySummary`, which reads today's
  card from the query cache and refetches it). `HistoryLinks`,
  `RunHistoryList`, `SectionNav`,
  `DailySummaryList`, `SummaryDayCard`, `DayCharts`, `ColumnChart`,
  `ClassColumnChart`, `ModelColumnChart`, `PhaseColumnChart`,
  `ClassDistributionBar`, `ProjectBreakdownTable`, `Skeleton` and the
  skeletons in `LoadingSkeletons.tsx` are components with no
  state; do not put
  `"use client"` on them or give them a filter that needs one.
  `SummaryDayCard`, `DayCharts`, `ColumnChart`, `ClassColumnChart`,
  `ModelColumnChart`, `PhaseColumnChart`, `ClassDistributionBar` and
  `ProjectBreakdownTable` are also rendered by the client `TodaySummary`, so they must stay stateless and
  free of server-only imports. The left and
  right arrows of `HistoryLinks` are plain `next/link` hrefs that
  `HistoryPagination` builds with `historyHref` and passes in with `page` and
  `pageCount` (`null` hides an arrow); do not decode a bookmark, build a URL
  or compute a page number in the component. The page number is derived from
  the counts in the cached page and never carried in the URL.
  `HistorySearch` builds its URL only through `historyHref(slug, null, q)`
  (page one, so `?after` and `?before` are dropped), never by hand, from `usePathname` or
  with `useSearchParams` (its initial text comes from the `HistorySearchBox`
  island); it debounces with `useDebouncedCallback` in
  `src/hooks/use-debounced-callback.ts` and navigates with
  `router.replace` inside the shared transition. `src/lib/run-view.ts` is plain and
  importable from anywhere. `QueueRow` has no `"use client"` (it is rendered
  by `QueueView`, like `RunRow`); the one parse of `queue_items.source` is
  `queueSource` in `src/lib/queue-source.ts`, pure and tested in
  `src/lib/queue-source.test.ts`.
- The Queue is a rail. A row's ordinal (`next` for 1) comes only from
  `queuePositions` in `src/lib/queue-order.ts`: the rank in ledger order
  (`position`, then `issue_number`), never `queued_at` and never the array
  index. `byQueuePosition` in the same file is the one ledger comparator,
  shared by `queuePositions` and `applyQueueChange`; both are pure and tested
  in `src/lib/queue-order.test.ts`, and every change to them goes with a test
  case. A row holds the issue link, the title, the manual hint for a manual
  item, `Queued <time>` and the status pill; the title is shown in full and
  wraps (never `truncate`, `line-clamp` or a `title` tooltip for it), and
  every element is top-aligned on the title's first line; it shows no label chip, no wait
  and no start hint. Rows stay keyed by `issue_number`, and the
  left gutter stays reserved for the marker and the future drag handle. The
  rail line and the `next` marker take their colours from
  `STATUS_COLORS.queued`, the hollow markers from
  `STATUS_COLORS.neutral.border`.
- The visible text of every timestamp comes from `formatTimestamp` in
  `src/lib/format-date.ts` (`DD.MM.YYYY HH:MM UTC`, UTC getters on a parse of
  the input, unit-tested in `src/lib/format-date.test.ts`), called only by
  `Timestamp`, whose `<time>` keeps the ISO value in `dateTime`. The output
  depends on the input string alone, so server and client markup agree. The
  summary's calendar days (`YYYY-MM-DD`, no time) are the one other case:
  `formatDay` in the same file (`DD.MM.YYYY`, same parse and UTC getters,
  same test file). Do not
  introduce `toLocaleString`, `Intl` or runtime-time-zone formatting, and every
  change to the format goes with a test case.
- The page background is defined only in `src/app/globals.css` (the
  `--background` and `--foreground` tokens, switched by
  `prefers-color-scheme`, with `color-scheme: light dark` on `:root`) and
  painted only on `html` and `body`. `html` must keep it: the canvas, the
  scrollbar gutter and the overscroll area are painted from the root. No
  page-level wrapper (`body` classes, `main`, a layout shell, a page root)
  takes a `bg-` class, and an element that must match the page colour (the
  queue rail's hollow marker) uses `bg-background`, never a copied
  `bg-white dark:bg-neutral-950`.
- Status colours come only from `STATUS_COLORS` in `src/lib/status-colors.ts`
  (queued amber, running emerald with the pulse dot, completed sky, failed
  rose, `neutral` for zeros), written as full literal class strings so
  Tailwind sees them; never interpolate a hue name. No component writes an
  `emerald`, `amber`, `sky`, `rose` or `red` class inline;
  `src/lib/status-colors.test.ts` scans `src/` and fails on one. The
  connection pill in `ConnectionIndicator` is the one exemption (it describes
  the socket, not a run). Issue class badges are not states and use hues
  outside the palette.
- The connection status in `src/components/ConnectionIndicator.tsx` is written
  only through its exported `setConnectionStatus`, with a `ConnectionStatus`
  enum member, never a bare string. Do not export the `status` variable, add a
  second setter, or mirror the value into React state or the query cache; the
  channel status callback in `src/data/realtime.ts` is its one caller.
- `ConnectionIndicator` is rendered only in `src/app/(dashboard)/layout.tsx`,
  inside `Providers` (beside the sidebar's `Projects` heading), never in the
  root layout or in the summary page `src/app/page.tsx`; a route without the
  channel shows no pill. Do not mount `Providers` or start Realtime on `/`
  (the summary) to make one appear. `SummaryProviders` is the only provider
  on `/`, mounted only around the today island.

## Runs: active and history

- Active means status `running` or `failed`; History means `completed` only.
  A failed run can be resumed, so it is live and stays in the Active entry.
  Do not move failed runs into History or add a status toggle to it.
- History is server-rendered and never enters the React Query cache. It is
  read by `getCompletedRuns` inside the page's `getHistory` (`"use cache"`,
  ``cacheTag(`history:${slug}`)``) and rendered by the page's two async
  islands, `HistoryPagination` and `CompletedRuns`, each under its own
  `SectionBoundary` (the third island, `HistorySearchBox`, reads only `?q`
  and no history rows). No `queryKeys` entry, no `useSuspenseQuery`, no
  `setQueryData`, no realtime reducer and no catch-up read may touch completed
  runs. If a component needs history rows, it gets them as props from the
  page.
- The queue never touches History: a queue event fires no `onHistoryChange`,
  calls no server action and drops no tag.
- Any `"use cache"` scope that must reflect on-demand revalidation on a
  prerendered route is called only after a request-time read, under a
  `SectionBoundary`: here the islands' `await searchParams` (through
  `readHistory`), the first thing each does before `getHistory`
  (`HistorySearchBox` reads it too, for its initial text, and calls no cache
  scope). A scope that
  is prerendered into the static shell is read from the shell's embedded
  Resume Data Cache on every resumed request, frozen at build time, and no
  `updateTag`, `revalidateTag` or `revalidatePath` reaches it; a request-time
  hole is resolved from the live cache handler and keeps its lifetime (see
  README, "What is prerendered and what is not"). Do not add `connection()`
  back as a redundant second marker. The `SectionBoundary` (whose inner
  `Suspense` is the streaming boundary) stays around each island, and
  `getHistory` stays out of the page body and `generateMetadata`, where it
  would be prerendered again. Do not swap the hole for a short `cacheLife`
  (`expire` under 5 minutes also makes a hole but gives up the long
  lifetime). Active has no cache scope at all: it is read per request after
  `connection()` (`getActiveRunsState`) and kept current in the browser.
- History is paged by a keyset bookmark. Everything that decides a page lives
  in `src/lib/history-bookmark.ts` (pure, tested in
  `src/lib/history-bookmark.test.ts`): `HISTORY_PAGE_SIZE` (defined there and
  nowhere else), the base64url codec (the payload carries its `direction`),
  `readHistoryBookmark`, `historyKeysetFilter`, `historyNewerFilter`,
  `historyOrderAscending`, `historyItems`, `toHistoryPage` and `historyHref`.
  Every change to the bookmark, the filters, the order or the page split goes
  with a test case.
- History is searched through `?q`. It is normalised by `readHistoryQuery` in
  `src/lib/history-search.ts` (trim, `*` removed, cut at
  `HISTORY_QUERY_MAX_LENGTH`, empty or repeated is `null`) in the islands,
  outside the cache scope, and turned into the PostgREST filter only by
  `historySearchFilter` (LIKE and PostgREST escaping, `issue_number` only for
  an integer that fits `int4`), both pure and tested in
  `src/lib/history-search.test.ts`. Every change to either goes with a test
  case. The search never touches Active, and never filters on the client.
- A static heading sits outside the boundary of the hole it labels: the
  `History` `<h2>` is rendered by the page, beside and above the islands, never inside a
  `SectionBoundary` or its fallback, so it is in the static shell.
- `HistorySearchBox`, `HistoryPagination` and `CompletedRuns` are the only
  readers of `searchParams`, and each awaits it itself. The page passes the promise down
  unawaited and never awaits it, nor do `getProject` or `generateMetadata`,
  or the whole page turns request-time. `?after` and `?before` are decoded by
  `readHistoryBookmark` and `?q` by `readHistoryQuery` in the islands,
  outside the cache scope (an error thrown inside `"use cache"` loses its
  class), and never surface an error: anything invalid or foreign, a cursor
  of the other direction, or both parameters at once is page one.
- Every page of a project shares `historyTag(slug)`; never add a per-page or
  per-query tag. The bookmark and the search text are `getHistory` arguments,
  so they are already part of the cache key, and one tag drop must expire
  every page and every search a completion changes.
- Two islands calling `getHistory` with the same arguments are one cache read
  per request: Next joins an identical `"use cache"` invocation within the
  request (debug line `joining intra-request invocation`). Do not add a React
  `cache()` wrapper or pass one island's result to the other.
  `getHistory` keeps its explicit
  `cacheLife({ stale: 300, revalidate: 86400, expire: 2592000 })`; never an
  `expire` under 5 minutes.
- `experimental.staleTimes.dynamic` in `next.config.ts` (300 seconds) keeps a
  visited project page's dynamic part in the client router cache. Keep it at
  or under `getHistory`'s `cacheLife` `stale` (300) and never longer than a
  few minutes: within the window a page not on screen is not refetched, so
  the window is the bound on how stale a revisited History can be. Leave
  `staleTimes.static` at its default (it also moves the `default` cacheLife
  profile). Any new live section on a cached page must either be patched
  client-side (React Query and a Realtime reducer, like Active) or be
  re-rendered by the completion handler's `router.refresh()`; never rely on
  a navigation to refetch it.
- Proof rule for anything about revalidation: verify with a database change
  made **after** `yarn build` (a test row inserted, a run completing), call
  the action, and look for the change in the next response's HTML. A row that
  existed at build time is in the shell regardless and proves nothing. With
  `NEXT_PRIVATE_DEBUG_CACHE=1` on `yarn start`, a plain GET must not add a
  `use-cache: ... generated entry` line for the `getHistory` scope, and the
  first GET after the action must.
- A completion triggers revalidate THEN refresh, in that order and only in
  that order. The realtime module removes the run from the Active entry
  (`applyRunChange`), calls `onHistoryChange(slug)` when `isHistoryChange` is
  true, and `Providers` calls `revalidateHistory(slug)` and, in its `.then`,
  `router.refresh()` guarded by `isProjectPath(window.location.pathname, slug)`.
  Never call `router.refresh()` before the action resolves (the history scope
  would still be cached and the refresh would re-render the old list), and
  never skip the refresh when that project's page is on screen (the action's
  own re-render is not the contract). The action's rejection is swallowed; do
  not surface it in the UI.
- The refresh is conditional on the viewed route, the action is not. The
  action drops the project's server cache for everyone, so it runs on every
  completion; `router.refresh()` only re-renders the route in the address
  bar, so on the overview or another project's page it is a round trip that
  changes nothing and is skipped. Read the route off `window.location` inside
  the callback (after the action resolves), through `isProjectPath` in
  `src/lib/project-route.ts`; do not switch `Providers` to `usePathname()`,
  which would subscribe the whole tree to navigation and re-render it on
  every route change. `isProjectPath` decodes the pathname before comparing
  (Next decodes route params, so a percent-encoded character in a segment
  renders the same page) and answers false for a malformed sequence; keep it pure and tested
  in `src/lib/project-route.test.ts`.
- `src/app/actions/revalidate-history.ts` is a public endpoint. It validates
  the slug with `isProjectSlug` from `src/lib/slug.ts` (the pattern
  `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`, defined nowhere else) and returns early
  otherwise; for a valid slug it calls `updateTag` on each tag of
  `historyTags(slug)` and does nothing else. Do not add a database read or
  write, a parameter beyond the slug, a return value, or a third tag without
  deciding what an anonymous caller can do with it. The second, `summary:today`,
  was decided: an anonymous caller can make the next render of the summary's
  (`/`) today card read the database once, nothing else. `updateTag`, not
  `revalidateTag(tag, "max")`: the latter is stale-while-revalidate and the
  refresh would be served the old history (see
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md`).
- There is no Active tag: Active is read per request and never cached on
  the server, so a completion has nothing to drop for it. Do not add a
  `runs:` tag or a `"use cache"` scope for Active back. The tag spellings
  live in one place,
  `src/lib/history-tags.ts` (`historyTag`, `summaryPastTag`,
  `summaryTodayTag`, and `historyTags`, which returns history and
  today, history first, and never the past days tag): the pages'
  `cacheTag` calls, the action's `updateTag` calls
  and the route handler's `revalidateTag` calls all import from it, and
  `src/lib/history-tags.test.ts` pins the strings. Never write
  `history:`/`summary:` inline anywhere.
- Hydration after a refresh is safe because React Query only overwrites an
  existing entry when the incoming `dataUpdatedAt` is strictly newer
  (`src/data/hydration.test.ts` pins this against the installed
  `@tanstack/query-core`). Do not work around hydration with a key change or
  a manual `setQueryData` in the page; if that test ever fails after an
  upgrade, read `hydration.js` again before touching the move.
- A DELETE of a run the Active list does not hold counts as a history change
  (`isHistoryChange(ev, undefined)` is true) and runs the same action. Do not
  special-case it.
- An unwatched completion (no browser had the channel open) is covered by
  the database webhook, not by a client-side poll: the toolkit's trigger on
  `adw.runs` posts to `src/app/api/revalidate/route.ts`, which drops the same
  `historyTags(slug)`. Rules for that handler:
  - It does nothing but validate and revalidate. Check the secret, parse the
    body, resolve the slug through `getProjectSlug`, call `revalidateTag` on
    `historyTags(slug)`, respond. No write, no other read, no other side
    effect, and no other method than `POST`.
  - `ADW_REVALIDATE_SECRET` is server-only: no `NEXT_PUBLIC_` prefix, never
    read in client code, never a real value in `.env.example` or any tracked
    file. The handler compares it with `crypto.timingSafeEqual` (a length
    difference is a mismatch, not a throw) and, when the variable is unset,
    rejects everything with 503 and logs once. Never add a fallback that lets
    an unconfigured deployment accept requests.
  - `revalidateTag(tag, { expire: 0 })`, not `updateTag` (Server Actions only,
    throws in a route handler) and not `"max"` (stale-while-revalidate, the
    next visitor would see the old History once). Both facts are in the
    installed `updateTag.md` and `revalidateTag.md`; re-read them before
    changing the call.
  - Anything that is not an `adw.runs` event with a UUID `project_id` in
    `record` or `old_record`, or whose project the publishable key cannot see,
    is answered `200 { ignored: true }`, not an error: the trigger does not
    read the response and a 4xx would only make a healthy setup look broken
    in the `net._http_response` table.
  - The trigger, its `WHEN` clauses and the two database settings
    (`app.settings.dashboard_revalidate_url`, `..._secret`) are the toolkit's
    (`adw-toolkit/supabase`). Changing the payload shape or the header name
    here means changing them there in the same change.

## Summary

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
- `/summary` is a permanent (308) redirect to a bare `/`, answered by the
  route handler `src/app/summary/route.ts`, which reads nothing from the
  request, so the query string is dropped. It is the only file under
  `src/app/summary/`; do not add a page there, and do not add a
  `next.config.ts` redirect for it (Next merges the query string into a
  config redirect's destination, and config redirects run before the
  handler).
  The project overview (sidebar plus every active run, grouped by project) is
  `/projects`, `src/app/(dashboard)/projects/page.tsx`; its `Active`
  heading is static in the page, above the `SectionBoundary` of its island; the header's
  `SectionNav` links to `/projects` only and the brand, rendered by
  `BrandLink` from the same file, links to `/`.
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

## Realtime and Supabase

- The Supabase client is only ever obtained via `getSupabase()` from
  `src/data/supabase.ts`. Never call `createClient` anywhere else; a second
  client is a second websocket.
- Server-side Supabase reads must not be stored in Next's data cache. On the
  server, `getSupabase()` builds the client with a fetch that sets
  `cache: "no-store"` on every request; keep that, and do not add a server
  read that bypasses `getSupabase()` or passes its own `fetch`. Every server
  read already runs inside a `"use cache"` scope, and Next would otherwise
  also store the REST response as an untagged `kind: "FETCH"` entry with the
  scope's lifetime, so `updateTag` would expire the scope while the
  re-executed function reads the stale body (see README, "Two caches, one
  source"). `no-store` inside a `"use cache"` scope is permitted and leaves
  the scope's output cached and tagged. Check after `yarn build` that
  `.next/cache/fetch-cache` has no Supabase entry.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are
  public by design (browser bundle, RLS-limited). The secret / service role
  key must never be added to this repo, to any `.env*` file in it, or to any
  variable with a `NEXT_PUBLIC_` prefix. `ADW_REVALIDATE_SECRET` is the one
  server-only variable: it stays without the prefix and is read only in the
  route handler. `.env.example` is tracked with
  placeholders; `.env.development` (dev) and `.env.local` (all modes,
  including build and start) hold the real values and are gitignored.
- Every Realtime write to the query cache goes through a pure, unit-tested
  reducer and `setQueryData`: `applyProjectChange` in
  `src/data/apply-project-change.ts` for `adw.projects` events,
  `applyRunChange` and `applyRunChangeToSummaries` in
  `src/data/apply-run-change.ts` for `adw.runs` events, with `isHistoryChange`
  (same file) deciding whether to fire `onHistoryChange`, and
  `applyQueueChange` and `applyQueueChangeToSummaries` in
  `src/data/apply-queue-change.ts` for `adw.queue_items` events. The reducers take no
  cache, client or clock and never mutate their input; new event handling goes
  into a reducer and gets a test case, and `src/data/realtime.ts` stays a thin
  wiring layer around them. `applyRunChange` holds the Active list of every
  project, matches a run on `(project_id, adw_id)` (never `adw_id` alone, it
  is unique per project only), and removes a run whose new status is
  `completed`; do not make it keep or re-add completed rows.
  `applyRunChangeToSummaries` never touches `running` or `failed` (they are
  counted from the Active entry); it keeps `completed` (+1 on an INSERT of a
  completed row and on an UPDATE to completed from a known running or failed
  status) and `last_run_at`. `applyQueueChange` holds state `queued` only and
  removes an item whose new state is anything else; do not make it keep
  started or stopped items (they are runs). Never `invalidateQueries` or `refetchQueries` from
  the realtime module: every query here is `staleTime: "static"` and both skip
  static queries silently.
- Every updater passed to `setQueryData` from the realtime module has the form
  `current => current && reducer(current, ev)`. Never default an absent entry
  (`current = []`, `current ?? {...}`): an entry that is not in the cache must
  stay absent, or a single event seeds a one-row list that looks complete and
  is not.
- A runs or queue event names its project by `project_id` only. Resolve the slug from
  the cached project list (`queryClient.getQueryData(queryKeys.projects)`) and
  drop the event when the project is not there; never fetch to resolve it.
- `ev.old` carries only the primary key columns (`adw.runs`: `project_id`,
  `adw_id`; `adw.queue_items`: `project_id`, `issue_number`; `adw.projects`:
  `id`), because the tables use the default replica
  identity. Never read another field off `ev.old`. The previous status the
  completed count (and `isHistoryChange`) needs is read from the Active entry
  with `runStatusIn(current, projectId, adwId)` BEFORE the entry is
  rewritten, and passed explicitly;
  keep that order when touching `applyRunEvent`, and keep the
  `onHistoryChange` call last, after both `setQueryData` writes. Likewise the
  previous queue membership is read with `queuedIn` BEFORE the queue entry is
  rewritten in `applyQueueEvent`, and passed to `applyQueueChangeToSummaries`.
- The catch-up read runs on every `SUBSCRIBED` (first connect and every
  reconnect, one path, no flag) and writes with `setQueryData` through the
  boundary functions (`getProjects`, `getActiveRuns`, `getQueue`). It must
  never throw out of the socket callback: failures are `console.warn`ed and
  swallowed. It writes `getActiveRuns()` under `queryKeys.activeRuns`
  unconditionally (a complete list read from the database, not a one-event
  seed, so the `current &&` rule above does not apply to it). Enumerate the
  cached queue entries with `queryKeys.allQueues`, the prefix in
  `query-keys.ts`, not an inline `["queue"]`. It never reads
  history.
- One channel, named `adw`, opened by `startRealtime` and started only from
  `Providers`, which is also the only place the `onHistoryChange` option is
  wired (it needs `useRouter`). All three listeners (projects, runs,
  queue_items) live on that channel; do not open a second one or start it from another component.
