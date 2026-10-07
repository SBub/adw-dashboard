# ADW Dashboard

A public dashboard for runs of the AI Developer Workflow (ADW) toolkit across
projects, in two sections. `/`, the landing page, is the summary (full width,
see "Summary" below). `/projects` is a two-pane screen:

- The left pane is a persistent sidebar listing every project with its
  queued, running, completed and failed counts and the time its last run started. It
  lives in a shared layout (`src/app/(dashboard)/layout.tsx`), so it keeps its
  state and scroll position when the selection changes. Below the `md`
  breakpoint it becomes a horizontal strip above the detail.
  Every run and queue state has one colour wherever it appears (queued
  amber, running emerald with a pulsing dot, completed sky, failed rose, a
  zero count neutral), taken from the one map in `src/lib/status-colors.ts`;
  the sidebar's connection pill keeps its own colours.
- The right pane shows the selected project's runs and queue: an Active
  section for live runs, status `running` or `failed` (a failed run can be
  resumed, so it is still live), with phase, branch and the absolute time of
  the last update, then a Queue section for the issues waiting in the
  project's queue ledger, in the order they will run, and a History section
  for `completed` runs (final phase, timings, duration).
  Active is a React Query entry patched by Realtime; History is rendered on
  the server from a cache scope and re-rendered when a run completes (see
  "Runs: active and history" below). `/projects` shows an empty "Select a
  project" panel; `/projects/<owner>/<repo>` selects a project and is the deep
  link.

The summary at `/` shows finished runs per UTC day across projects: issue
classes, total duration, tokens (fresh input, cache read, output) and cost (see
"Summary" below). The header's brand links to `/`, its "Projects" link to
`/projects`. The link of the current section carries `aria-current="page"`, and
"Projects" is emphasised on `/projects` and on every project page. On a project
page added after the deploy (not among the pre-rendered slugs) the shell carries
the unmarked link and the highlight arrives with the streamed pathname. The old address `/summary` is a permanent redirect to a bare `/`
(its query string is dropped).

## Data: projects and runs from the database

The project list is live. `getProjects()` reads the `adw.project_summaries`
view of the toolkit's Supabase project (one row per project with its
`running`, `completed` and `failed` counts and `last_run_at`, computed in the
database, see the toolkit's `supabase/README.md`). The view runs with
`security_invoker`, so the publishable key sees only public projects. The list
is ordered by `last_run_at` descending with projects that have no runs yet
last. Realtime (below) then patches that list in the browser as `adw.projects`
rows change. The view also carries `queued`, the number of issues waiting in
the project's queue ledger (the toolkit's), shown in the sidebar as the first
count and in bold amber when above zero (no pulse dot: that marks running). It moves live with the queue listener
(see "Event to cache" below) and is corrected by a page load or the realtime
catch-up. The sidebar's `running` and `failed` counts are not the view's: they
are counted in the browser from the one Active entry (below), so they always
agree with the rows `/projects` and the project pages show. The view's
`running` and `failed` columns stay in `ProjectSummary` but nothing renders
them.

A project's queue is read by `getQueue(slug)`: the project row by slug (an
unknown slug is an empty list, the page has already decided not-found from
the project list), then the rows of `adw.queue_items` (the toolkit's mirror of the
queue ledger, one row per ledger item, primary key `(project_id,
issue_number)`) where `project_id` matches **and `state` is `queued`**,
ordered `position asc, issue_number asc` (ledger order, with a deterministic
tie-break while a move is in flight). Every other state (`QueueState` in
`src/types/adw.ts`: `running`, `merged`, `failed`, `held`, `skipped` and the
rest) means the item has left the queue: a started item is a run and shows in
Active or History, a held or skipped one is not shown. It selects `QUEUE_COLUMNS`, exactly the fields of
`QueueItem`, and reads no clock.

The runs are read in two halves, because they have two lifetimes:

- `getActiveRuns()` (no argument) reads the rows of `adw.runs` **whose
  `status` is `running` or `failed`**, for every project the publishable key
  can see (RLS), ordered by `updated_at` descending, and returns them as
  `{ active, fetched_at }`, stamped with `fetched_at`, the ISO time the rows
  were read. It is one entry for every project: the sidebar counts it,
  `/projects` groups it and each project page selects its own rows from it
  (`src/lib/active-runs.ts`).
- `getCompletedRuns(slug, bookmark, q)` reads the project row from
  `adw.project_summaries` by slug, then one
  page of the rows of `adw.runs` for that id where `status` is `completed`
  (and, when the search text `q` is not `null`, that match it),
  shown `updated_at desc, adw_id desc`, and returns
  `{ items, page, pageCount, hasNewer, newerCursor, olderCursor }` (page 1 of
  1 with no rows for an unknown slug, which the page has already excluded).
  It is keyset-paginated in either direction, three runs per page
  (`HISTORY_PAGE_SIZE` in `src/lib/history-bookmark.ts`): `bookmark` is
  `null` for page one, an `after` bookmark (the last row the previous page
  showed) reads the rows strictly older than it, and a `before` bookmark (the
  first row the next page showed) reads the rows strictly newer than it,
  oldest first, reversed for display. Beside the rows it reads two counts on
  the same filter, the total and the rows strictly newer than the first shown
  row (than the bookmark itself when a bookmarked page comes back empty, so
  the left arrow still leads back), which give the page number and the page
  count. It reads no clock.

In SQL terms:

```sql
select project_id, adw_id, issue_number, issue_title, issue_class, branch_name,
       phase, status, state, toolkit_version, started_at, updated_at, finished_at
  from adw.runs where status in ('running', 'failed')
 order by updated_at desc;                                    -- Active, all projects
select * from adw.project_summaries where slug = $1;
select <same columns>
  from adw.runs where project_id = $2 and status = 'completed'
   and (updated_at < $3 or (updated_at = $3 and adw_id < $4)) -- ?after
   -- ?before: (updated_at > $3 or (updated_at = $3 and adw_id > $4)), order asc
   and (issue_title ilike $5 or branch_name ilike $5 or adw_id ilike $5
        or issue_number = $6)                                -- a search; $6 if an integer
 order by updated_at desc, adw_id desc
 limit 3;
select count(*) from adw.runs where project_id = $2 and status = 'completed'
   and <the same search>;                                    -- total
select count(*) from adw.runs where project_id = $2 and status = 'completed'
   and <the same search>
   and (updated_at > $7 or (updated_at = $7 and adw_id > $8)); -- newer than the first row
```

The rows are the raw `Run` type; no label is derived on the server (see
"Labels" below). There are no fixtures any more; `src/data/fixtures.ts` is
gone.

`src/data/index.ts` is the single boundary the screens read through. Its
screen-facing reads are four functions (plus the shape the second one
returns):

- `getProjects(): Promise<ProjectSummary[]>`
- `getActiveRuns(): Promise<ActiveRuns>`, where `ActiveRuns` is
  `{ active: Run[]; fetched_at: string }`
- `getCompletedRuns(slug, bookmark, q): Promise<HistoryPage>`, where
  `HistoryPage` is `{ items: Run[]; page: number; pageCount: number;
hasNewer: boolean; newerCursor: HistoryCursor | null; olderCursor:
HistoryCursor | null }` and `HistoryCursor` is `{ direction: "after" |
"before"; cursor: string }` (from `src/lib/history-bookmark.ts`)
- `getQueue(slug): Promise<QueueItem[]>`

The summary page (`/`) reads two more, `getSummaryPast(today, days)` and
`getSummaryToday(today)` (see "Summary").

Nothing under `src/app/` or `src/components/` imports from anywhere else for
data; the query keys and the `QueryClient` factory (next section) are cache
plumbing, not data, and the server action in `src/app/actions/` touches no
data at all (it drops cache tags). The Supabase client is untyped (no
generated `Database` type yet), so the boundary casts rows once: the view's
rows to `ProjectSummary`, the runs rows to `Run[]` (the shared `RUN_COLUMNS`
select is exactly the fields of `Run`) and the queue rows to `QueueItem[]`
(`QUEUE_COLUMNS`, exactly the fields of `QueueItem`). Generating types for the
`adw` schema is a follow-up.

Because the layout prefetch and `generateStaticParams` both call
`getProjects()`, and the page calls `getQueue()` and
`getCompletedRuns()` for every slug, the database is read at **build time** as well as at request
time (`getActiveRuns()` runs at request time only, see "Prefetch and hydration
of the Active runs"). `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
must therefore be present for `yarn build`, which reads `.env.local` (not
`.env.development`); without them `getSupabase()` throws and the build fails
loudly instead of shipping an empty sidebar. `generateStaticParams` never
returns an empty array: under `cacheComponents` that fails the build, so an
empty project list yields one placeholder slug (`_/none`) that falls through
to `notFound()` at request time.

### The query layer

`src/data/query-keys.ts`, `src/data/query-client.ts`,
`src/data/active-runs-query.ts` and `src/data/active-runs-state.ts` sit beside
the boundary and are the query layer over it: what the server and the browser share so the
two sides of the React Query cache cannot drift apart. There are no fetcher
wrappers; the boundary functions `getProjects`, `getActiveRuns`, `getQueue`
and `getSummaryToday` are the `queryFn`s themselves, passed straight from
`@/data` at every call site. `getCompletedRuns` and `getSummaryPast` are not
`queryFn`s: history and the summary's past days are server-rendered and never
enter the query cache.

- `queryKeys` in `query-keys.ts`, the single home of every query key:
  `queryKeys.projects` (`["projects"]`) for the project list,
  `queryKeys.activeRuns` (`["active-runs"]`) for the one Active entry (every
  project's running and failed runs; there is no per-project runs key),
  `queryKeys.queue(slug)` (`["queue", slug]`) for a project's queued items,
  `queryKeys.summaryToday(day)` (`["summary-today", day]`) for the summary
  page's today card, and the prefix `queryKeys.allQueues`
  (`["queue"]`) that the catch-up enumerates cached queue entries with. A key is
  imported from there wherever a resource is prefetched, read or written by the
  Realtime listener; no key is ever built inline, and no key literal exists
  anywhere else.
- `makeQueryClient()` in `query-client.ts`, the one `QueryClient` factory for
  both sides. Its `shouldDehydrateQuery` rule includes pending queries, so a
  prefetch that is still in flight can be handed to the browser instead of
  fetched twice.
- `prefetch(queryKey, queryFn)` in the same file, the one server prefetch:
  it builds a client from the factory, awaits `queryClient.query()` and
  returns `{ data, state }`, the resolved value next to `dehydrate()` of the
  client. Every `"use cache"` state function (the layout's `getProjectsState`,
  the project page's `getQueueState`, the summary page's
  `getTodayState`) is a one-liner around it, and so is `getActiveRunsState`
  (after `connection()`, not in a cache scope), so
  the prefetches
  cannot drift apart, and a caller that needs the value reads `data` instead
  of searching the dehydrated queries by hash.
  (`prefetchQuery` is deprecated in React Query 5.104; `query()` is its
  replacement and, unlike `prefetchQuery`, it rejects when the fetcher throws.
  `prefetch` does not catch that on purpose: a swallowed failure would
  dehydrate an empty cache and ship the fallback silently, so the build or the
  request fails instead.) The returned object is plain JSON, as a result of a
  `"use cache"` function must be.
- `activeRunsQuery` in `active-runs-query.ts`, the one spelling of the Active
  query options (`queryKeys.activeRuns`, `queryFn: getActiveRuns`,
  `staleTime: "static"`, `refetchOnMount: false`). `ProjectNav`,
  `ActiveRunsOverview` and `ActiveRunsView` spread it into
  `useSuspenseQuery` and add only a `select`.
- `getActiveRunsState()` in `active-runs-state.ts`, the per-request server
  prefetch of the Active entry (server only; see "Prefetch and hydration of
  the Active runs").

Each boundary function runs on the server during its prefetch (and at build
time, through it) and in the browser only on a cache miss, which the hydration
makes rare.

### Labels: no clock in render

Every value a run row shows is a stored column, rendered as is, plus one pure
derivation: `durationLabel(startedAt, finishedAt)` in `src/lib/run-view.ts`
formats a finished run's `started_at` to `finished_at` as `47m 26s` under an
hour and `1h 03m` from an hour up (hours are not capped), and returns `null`
while `finished_at` is `null`, so a running run shows no duration. It reads no
clock and is unit-tested with fixed timestamps in `src/lib/run-view.test.ts`.

The labels that need the current time, "updated 2m ago", the stale badge for a
running run with no progress for 30 minutes, and the elapsed time of a run
still in progress, are removed for now and tracked in issue #3. An active row
shows the absolute `updated_at` ("Updated 03.10.2026 11:52 UTC") through the
`Timestamp` component instead, which formats every timestamp through the pure
`formatTimestamp` helper in `src/lib/format-date.ts` (UTC getters, no clock, no
locale). The reason they are not simply computed in
render: under `cacheComponents` the time is the one thing neither prerender
pass may read (details in the sections below), so a clock-dependent label needs
a `useSyncExternalStore` hook with a data-derived server snapshot, and the
first version of that re-rendered the whole pane on every tick. Issue #3
describes the leaf-level replacement.

`fetched_at` itself is `new Date().toISOString()` taken inside
`getActiveRuns`, which on the server only ever runs inside
`getActiveRunsState`, after `await connection()`: at request time, never in a
prerender pass, where the same read would fail the build. Nothing in the UI
reads `fetched_at` today; it stays in `ActiveRuns`
because the realtime catch-up re-stamps it and issue #3 needs it as the
clock-free server snapshot. `getCompletedRuns` reads no clock at all: history
needs no snapshot, and its cache scope exists for the tag, not for a
clock-read permission.

There is one other argument-less clock read: `utcDay(Date.now())` in the
summary page's `requestToday` (`src/app/page.tsx`), which turns the request
time into today's UTC date. It runs only after `await connection()`, so only at
request time, never in a prerender pass and never in client render, and the
day it yields is passed down as an argument (see "Summary").

### Prefetch and hydration of the sidebar

The sidebar follows the "server prefetch with hydration" pattern, so the
project list is in the server HTML at first paint and the browser never
fetches it again on mount:

1. `src/app/(dashboard)/layout.tsx` (a server component) calls
   `prefetch(queryKeys.projects, getProjects)` and keeps the `state` half of
   the result (the sidebar reads the list from the cache, so the layout has no
   use for `data`). This happens inside a `"use cache"` function
   (`getProjectsState`, tagged `projects`). The scope is required: React Query
   stamps the settled query with `Date.now()`,
   and with `cacheComponents` on, reading the current time outside a cache
   scope fails the prerender of `/projects` (`next-prerender-current-time`). Cached,
   the stamp is the cache fill time.
2. The layout renders `<Providers>` around the whole two-pane shell and
   `<HydrationBoundary state={…}>` around the sidebar only; the page renders
   outside it. `src/app/providers.tsx` is a client component holding one
   `QueryClient` per browser session (lazy `useState` from the same factory).
   It must sit above every boundary, because each boundary writes into the
   client the provider holds.
3. `src/components/ProjectNav.tsx` is a client component that reads the list
   with `useSuspenseQuery` under the same imported `queryKeys.projects`, with
   `refetchOnMount: false` and `staleTime: "static"`. On the first render the
   key is a cache hit, so nothing suspends and nothing fetches.

   `staleTime: "static"` is the second `cacheComponents` constraint, on the
   client side this time. Next also prerenders client components, and in that
   pass `Date.now()` counts as IO: the first clock read aborts the client
   prerender, and whatever has not rendered yet is served as its Suspense
   fallback and rendered in the browser instead. With any numeric `staleTime`
   React Query reads the clock in `isStaleByTime` on every render, so the
   sidebar would ship as its skeleton in the static HTML. `"static"` returns
   before that read, and it suits this list: it changes only when something
   writes it with `setQueryData`, never on a timer. Note that
   `invalidateQueries` and `refetchQueries` skip static queries; updates go
   through `setQueryData`, or `refetch()` from the hook.

   `ProjectNav` also reads the Active entry (its running and failed counts,
   `activeRunCounts`), which is read per request, so the list itself is a
   request-time island, `SidebarActiveRuns`, under a `SectionBoundary` inside
   the projects `HydrationBoundary` (next section). The `Projects` heading and
   the connection pill are in the static HTML; the list streams in behind the
   boundary's skeleton (`ProjectNavSkeleton`, three placeholder cards; the
   inner `QueryBoundary` takes the same element).

### Prefetch and hydration of the Active runs

Active (status `running` or `failed`) is one React Query entry for every
project, `queryKeys.activeRuns`, read on the server **per request** and
never cached there:

1. `getActiveRunsState()` in `src/data/active-runs-state.ts` is React `cache()`
   around `await connection()` and then
   `prefetch(queryKeys.activeRuns, getActiveRuns)`. `connection()` makes the
   caller a request-time hole, so the read and both clock reads (React
   Query's settled-query stamp and `fetched_at`) never run in a prerender
   pass and nothing is frozen into the static shell. It is deliberately not
   `"use cache"`: a scope prerendered into the shell is read on every resumed
   request from the shell's frozen Resume Data Cache, and a run that started
   after the build would be missing (issue #69). React `cache()` dedupes per
   request only, so the layout's and the page's islands share one read and
   one dehydrated state.
2. Three async server components consume it, each under its own
   `SectionBoundary` and each rendering its own `HydrationBoundary` with the
   state as the ancestor of its consumer, so the entry exists before the
   consumer renders: `SidebarActiveRuns` in the dashboard layout
   (`ProjectNav`), `AllActiveRuns` on `/projects` (`ActiveRunsOverview`) and
   `ProjectActiveRuns` on the project page (`ActiveRunsView`). Hydrating the
   same state a second time is a no-op (equal `dataUpdatedAt`, pinned in
   `src/data/hydration.test.ts`).
3. The readers narrow the entry with the pure helpers in
   `src/lib/active-runs.ts`: `activeRunsOf(runs, projectId)` (a project's
   rows), `activeRunCounts(runs)` (running and failed per project) and
   `groupActiveRuns(runs, projects)` (the overview's groups, in sidebar
   order). All three read the same rows, so the sidebar, `/projects` and a
   project page cannot disagree.

The browser keeps the entry current through Realtime (one reducer, see
"Event to cache") and the catch-up on every `SUBSCRIBED`, which re-reads it.

### Runs: active and history

The project page splits a project's runs by lifetime, and the two halves take
two different paths to the screen.

**Active** (status `running` or `failed`) is live. It is one React Query entry
for every project, `queryKeys.activeRuns`, holding the `ActiveRuns` payload:
read per request on the server, hydrated, and patched in the browser by the
Realtime listener. The project page selects its own rows from it
(`activeRunsOf`); `/projects` lists all of them grouped by project.
A failed run is still in it because the toolkit can resume a failed run; it
leaves the list only by completing or being deleted.

**History** (status `completed`) is immutable, so it is not in the query cache
at all. The page renders it on the server inside a `"use cache"` scope tagged
`history:<slug>`; no realtime event touches it and the catch-up never reads it.
It changes only when the server is told to re-render it.

Each section's heading, one-line description and info-button detail are
rendered by `SectionHeading`, and the copy lives in the project page
(`src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`) next to the sections.
The detail popover sits on `TOOLTIP_LAYER` (`z-50`, `src/lib/layers.ts`),
above the queue rail markers (`z-10`) and anything else positioned below a
heading.

Each run row shows the issue title (`adw.runs.issue_title`, published by the
toolkit) in full after the issue number, wrapping onto as many lines as it
needs (a long unbroken token such as a URL or a path breaks too), with every
other element of the row (the class badge, the `adw_id`, `Updated <time>` and
the status pill) top-aligned on the title's first line; runs published before
the toolkit wrote it have no title and show the number alone. The title keeps a
10rem flex basis, so on a narrow screen the issue class badge and the `adw_id`
wrap to the next line instead of squeezing the title to a single character.

The project page renders its header and Active like this:

1. `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx` has a `"use cache"`
   function `getProject(slug)`, tagged `projects` (the layout's tag), that
   finds the slug in `getProjects()`. It reads no clock. The page body and
   `generateMetadata` both read it, so the slug costs one cached read.
2. The page decides not-found from it: `getProject(slug) === null` means
   `notFound()` before any boundary renders. `generateStaticParams` is
   unchanged. The caveat from before stands: for a slug outside
   `generateStaticParams` the static shell has already gone out with a 200
   when `notFound()` runs, so the not-found panel streams in as a soft 404.
   A project added after the last `projects` fill 404s until that scope
   refills (15 minutes, or `revalidateTag("projects")`), the lifetime the
   sidebar already has.
3. It renders `PageHeader` (the project's name, slug and repository link)
   itself, then a `SectionBoundary` around
   `ProjectActiveRuns`, an async server component that awaits
   `getActiveRunsState()` (per request, see "Prefetch and hydration of the
   Active runs") and renders `<HydrationBoundary state={state}>` around
   `<QueryBoundary><ActiveRunsView projectId slug heading queue /></QueryBoundary>`.
   Both boundaries take the same fallback element, built by the page:
   `ActiveRunsViewSkeleton` with the real Active heading and two skeleton run
   rows, then `QueueViewSkeleton` with the real Queue heading and two
   skeleton rail rows. The headings are therefore in the static shell at their
   final position while the rows stream in.

   The queue is a second entry beside it. A `"use cache"` function,
   `getQueueState(slug)`, returns
   `prefetch(queryKeys.queue(slug), () => getQueue(slug))`, untagged (no server
   writer drops it; it lives in the static shell and the browser
   keeps it current). The page awaits it together with `getProject` in one
   `Promise.all`, so the two reads do not waterfall; the not-found decision
   reads only the project. The queue gets its own
   `<HydrationBoundary state={queue.state}>` around its own
   `<QueryBoundary fallback={<QueueViewSkeleton heading={queueHeading} />}><QueueView slug={slug} heading={queueHeading} /></QueryBoundary>`,
   passed to `ActiveRunsView` as its `queue` slot, which renders it after the
   Active section: the Queue sits below Active, and a failed queue read shows
   its panel in that slot while the header and Active stay up. The page builds the Queue and Active
   headings (`SectionHeading`, with their copy) and passes them in as the
   `heading` slots of `QueueView` and `ActiveRunsView`, so the headings stay
   server components inside the two client views.

4. `src/components/ActiveRunsView.tsx` is a client component that reads
   `useSuspenseQuery({ ...activeRunsQuery, select })`, the select being
   `activeRunsOf(data.active, projectId)`, and renders the Active section
   (its `heading` slot, then `RunRow`, variant `active`, or "No runs in
   progress.") from the rows as stored; no view model is built and no clock
   is read. It has no header and no not-found branch: both are the page's.
   `src/components/QueueView.tsx` is its counterpart for the queue: the same
   `useSuspenseQuery` options under `queryKeys.queue(slug)`, its `heading` slot
   ("First in, first out. The top item starts when the running one finishes."
   plus the `adw:queued` label hint), and either the dashed `Nothing queued.`
   panel or the queue rail: an ordered list of `QueueRow`
   (`src/components/QueueRow.tsx`), keyed by `issue_number`. Each row reserves
   a fixed left gutter (the marker now, a drag handle later) with a marker on
   an amber line (`STATUS_COLORS.queued.border`, drawn per row from its marker
   to the next and hidden on the last): the head row's is filled
   (`STATUS_COLORS.queued.dot`) and reads `next`, the others are hollow
   (`STATUS_COLORS.neutral.border`) and carry their ordinal. Ordinals come from
   `queuePositions` in `src/lib/queue-order.ts`, the rank among the queued items
   in ledger order (`position`, then `issue_number`, the comparator
   `byQueuePosition` that `applyQueueChange` uses too), never from the array
   index and not from `queued_at`: the toolkit's runner takes the first queued
   item in ledger order, a move reorders the ledger without restamping
   `queued_at`, and a retry restamps it without moving the item. Beside the
   marker, the card holds the issue number as a GitHub
   link, the title (omitted when `null`), the source hint and `Queued <time>`
   (`none` when `queued_at` is `null`), then the status pill, in one row: the
   title shown in full and wrapping, every element top-aligned on its first
   line. The rail line runs from marker centre to marker centre whatever the
   card's height.
   The source is parsed from the stored `source` column by `queueSource` in
   `src/lib/queue-source.ts`: `manual` renders a `manual` badge plus a visible
   hint that removing the label does not remove the item, since a manually
   queued item is not taken out by unlabelling the issue; anything else
   (`label:<name>` included, or `null`) renders no badge, because the section
   description already explains the label.
   Every row ends with the amber `queued` `StatusBadge`, the same component
   and colour map as a run row's status.

History is rendered below that, by the same page:

5. `getHistory(slug, bookmark, q)` is a second `"use cache"` function in the
   page, tagged `history:<slug>`, with an explicit
   `cacheLife({ stale: 300, revalidate: 86400, expire: 2592000 })`, that
   returns `getCompletedRuns(slug, bookmark, q)`: one page of plain rows, no
   clock read, no React Query. The page renders the History heading row
   itself, statically: a `SectionHeading` whose `<h2>History</h2>`,
   description and info button sit outside every boundary, and whose
   `controls` slot holds the `HistorySearchBox` island, right after the
   title, in a `SectionBoundary` (fallback the same box, disabled; detail
   "Search did not load."), and whose `actions` slot holds the
   `HistoryPagination` island in another (fallback `HistoryLinksSkeleton`,
   the two arrow slots and an "N of M" bar; detail
   "Pagination did not load."), at the right edge of the row and, below
   `md`, on a second line, right-aligned. Below the row, the
   `CompletedRuns` island sits in a third `SectionBoundary` (fallback a
   `RunListSkeleton` of `HISTORY_PAGE_SIZE` history rows, detail "This
   project's history did not load.").
   The islands are async server components in the page file; each awaits the
   page's `searchParams`. `HistorySearchBox` normalises `?q` and hands it to
   the client `HistorySearch` as its initial text; the other two decode
   `?after` and `?before` with `readHistoryBookmark` and `?q` with
   `readHistoryQuery`, and call `getHistory`. `HistoryPagination` renders
   `HistoryLinks` with the two arrow links (`newerHref`, `olderHref`, built
   with `historyHref`, `null` when there is nothing in that direction) and
   the page's `page` and `pageCount`; `CompletedRuns` renders `RunHistoryList` with
   the page's `items`, the slug and the empty-state text ("No completed runs
   yet.", or "No completed runs match ..." during a search). Each boundary keeps Active and the other
   island on screen when its island fails: if `getHistory` throws (database
   down, an RLS change), the boundary shows its panel ("Could not load.", its
   detail, Retry) in its own slot, instead of the segment's `error.tsx`
   replacing the whole pane. Retry there refreshes the route
   (`router.refresh()`) and then resets the boundary, so the island is
   re-rendered by the server rather than replayed from the failed render; see
   "SectionBoundary" below. The `searchParams` read makes each island a
   request-time hole, which is what lets the tag revalidation below reach it;
   see "What is prerendered and what is not". `src/components/HistoryLinks.tsx`
   and `src/components/RunHistoryList.tsx` are server components with no
   state: the all/completed/failed toggle is gone because history is
   completed-only now. `RunRow` in the `history` variant still shows Finished
   and Duration.

   History is paged three runs at a time. The URL of a later page carries
   `?after=<bookmark>` or `?before=<bookmark>`, an opaque base64url JSON
   `{ slug, direction, updated_at, adw_id }` (`updated_at` kept verbatim,
   microseconds included). An `after` bookmark is the last row the previous
   page showed, and the page is the rows strictly older than that tuple in the
   order `updated_at desc, adw_id desc` (`adw_id` is unique within a project,
   so the order is total); a `before` bookmark is the first row the following
   page showed, and the page is the rows strictly newer than it, read oldest
   first and reversed for display. A run completing while a visitor is on page
   two adds a row to page one and never shifts page two. The bookmark is
   decoded in each island, outside the cache scope; a missing, malformed or
   repeated parameter, one handed out for another project, one in the
   parameter of the other direction (the direction is checked), or `?after`
   and `?before` together, is page one, never an error. The History header is
   one row: the title on the left, then a left arrow, the indicator `N of M`
   and a right arrow. The right arrow is `?after=` of the last shown row; the
   left arrow is `?before=` of the first shown row, or page one itself when
   the newer rows fit on one page, so the head of the list is always the full
   page one. A missing arrow keeps its slot, and the whole row is absent when
   there is a single page. `N of M` is never in the URL: `N` is one plus the
   count of newer completed runs divided by the page size (rounded up), `M`
   is the total divided by the page size (rounded up, never less than `N`),
   both counted in the same cached `getHistory` entry as the rows. Every page
   of a project shares the one `history:<slug>` tag on purpose: the bookmark
   argument is part of the cache key (one entry per page), and one tag drop
   after a completion expires all of them, since a new row changes page one
   and every page's `N of M`, which is recomputed with the rows. There is no
   per-page tag. The
   lifetime is explicit: stale after 5 minutes, refreshed in the background
   after a day, expired after 30 days; a completion drops the tag long before
   that.

   History is searchable through the URL: the box next to the title
   (`src/components/HistorySearch.tsx`, a client component with local text)
   writes `?q=<text>` 300 ms after the last keystroke (a small `setTimeout`
   hook, `src/hooks/use-debounced-callback.ts`) with `router.replace` inside a
   transition, always to page one (`historyHref(slug, null, q)`, so `?after`
   and `?before` are dropped), and its Clear button removes `q`. The islands read `q` beside
   the bookmark; `readHistoryQuery` in `src/lib/history-search.ts` trims it, cuts
   it at 60 characters and removes `*`, and `historySearchFilter` turns it
   into a PostgREST `or` of `ilike` on the issue title, the branch name and
   the run id (with `%`, `_` and `\` matched literally) plus the issue number
   when the text is an integer, ANDed with the keyset filter. Each search is
   its own cache entry under the same `history:<slug>` tag, so a completion
   still expires every one, and both arrows carry `q`, so paging stays
   inside the search, and `N of M` counts only the matching runs. `HistoryTransition` shares the box's transition with
   `HistoryResults`, which dims the list while the new page streams in
   instead of falling back to its skeleton.

#### The move: how a completion crosses from Active to History

When a run completes, three things happen in the browser, in this order:

1. The Realtime listener folds the UPDATE into the Active entry through the
   `applyRunChange` reducer, which **removes** a run whose new status is
   `completed` (and the summaries reducer adds one to the sidebar's
   `completed`; its `running` and `failed` are counted from the Active entry,
   so they drop by themselves). The run is gone from Active, the sidebar and
   `/projects` at once.
2. The listener's `onHistoryChange(slug)` callback (wired in
   `src/app/providers.tsx`) calls the server action
   `revalidateHistory(slug)` in `src/app/actions/revalidate-history.ts`. The
   action validates the slug with `isProjectSlug` (`src/lib/slug.ts`, the
   pattern `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`) and returns early otherwise;
   for a valid slug it calls `updateTag` on each tag of `historyTags(slug)`
   (`src/lib/history-tags.ts`: `history:<slug>` and
   `summary:today`, the same helpers the pages' `cacheTag` calls use), and
   nothing else. The second tag is the summary page's (`/`) today scope (see
   "Summary"); its past days tag is never dropped. There is no Active tag:
   Active is read per request and never cached on the server.
3. Only after the action resolves, and only if the route in the address bar is
   that project's page, `router.refresh()` re-renders the route on the server.
   The history scope is a cache miss, so the History islands read
   `getCompletedRuns` from the database and the new row appears. Step 2 runs
   for every completion whatever is on screen (it drops the server cache for
   that project, so its next render is fresh for whoever opens it); step 3 only
   re-renders the current route, which is useful only when that route is the
   changed project's page. On the overview or another project's page the
   refresh would be a server round trip that changes nothing, so it is skipped.
   The check is `isProjectPath(window.location.pathname, slug)` from
   `src/lib/project-route.ts`, read inside the callback after the action has
   resolved rather than through `usePathname()`, so `Providers` does not
   subscribe to navigation and re-render on every route change. The pathname is
   decoded first: Next decodes every route param, so a percent-encoded character
   in a segment renders the same page while `window.location.pathname` keeps it
   encoded; a malformed sequence answers false instead of throwing.

`updateTag`, not `revalidateTag`. The installed Next docs
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md`
and `revalidateTag.md`) make the distinction: `updateTag` is the Server
Action form for read-your-own-writes, it expires the tag at once and the next
read waits for fresh data; `revalidateTag(tag, "max")` is
stale-while-revalidate, so the refresh that follows would be served the old
History and the new row would show up on a later visit instead. The
one-argument `revalidateTag(tag)` behaves like `updateTag` but is deprecated.
Per `02-guides/server-actions.md` ("Revalidation"), an action that calls
`updateTag` also ships a re-render of the current route in its own response;
the explicit `router.refresh()` afterwards is the guarantee that the order is
revalidate, then render, whatever the action response carried.

#### Webhook revalidation: completions nobody is watching

The move above is driven by a browser that received the Realtime event. If no
browser had the channel open when a run completed (a dashboard nobody has on
screen at the time), nothing calls the action, and the server's History for
that project stays as the cache has it until the lifetime ends or until a
completion someone does see. The route handler `src/app/api/revalidate/route.ts`
closes that gap from the database side: the toolkit's database tells the
dashboard about every history change, watched or not, and the handler drops
the same two tags the action drops (`history:<slug>` and `summary:today`).

**The trigger.** The toolkit owns the database, so the trigger lives in the
toolkit repository (`adw-toolkit`, `supabase/migrations/*_history_webhook.sql`,
documented in its `supabase/README.md`). The function
`adw.notify_history_change()` is attached to `adw.runs` by three triggers,
`runs_history_webhook_insert`, `runs_history_webhook_update` and
`runs_history_webhook_delete` (one per event, because Postgres does not let a
multi-event trigger's `WHEN` clause reference `OLD` when `INSERT` is among the
events, `NEW` when `DELETE` is, or `TG_OP` at all). They fire only on a history
change: a row inserted or updated to `completed`, a `completed` row updated to
something else, or a `completed` row deleted. The function reads the dashboard
URL and the secret from two database settings; while either is unset it returns
without doing anything, so the migration is inert on a database whose dashboard
is not deployed yet. Otherwise it enqueues, through `pg_net`, a POST of the
Supabase database-webhook shape `{ type, schema: "adw", table: "runs", record,
old_record }` (`record` is null on DELETE, `old_record` on INSERT) with the
secret in the `x-adw-secret` header. The enqueue is wrapped so that no failure
of it (extension missing, queue full) can fail the toolkit's own write of the
row.

**The handler.** `POST` only; any other method is 405 by Next's routing. In
order:

1. If `ADW_REVALIDATE_SECRET` is unset in the server's environment, every
   request is answered 503 and the fact is logged once per process; nothing is
   ever allowed through by default. Otherwise the `x-adw-secret` header is
   compared with the configured value in constant time
   (`crypto.timingSafeEqual` on equal-length buffers; a different length is a
   mismatch) and anything else is 401.
2. A body that is not JSON is 400. A JSON body that is not an `adw.runs` event
   with a UUID `project_id` in `record` or `old_record` (another table, a
   malformed payload) is answered `200 { "ignored": true }`.
3. The slug is resolved with `getProjectSlug(projectId)` from `src/data`, a
   read of `adw.projects` with the publishable key. RLS shows it only public
   projects, and a private or unknown project has no page whose cache could be
   stale, so a null result is `{ "ignored": true }`, as is a slug that fails
   `isProjectSlug` (no page is served for it). A failed lookup is 502.
4. `revalidateTag(tag, { expire: 0 })` for each tag of `historyTags(slug)`,
   and the response `{ "revalidated": "<slug>" }`.

The handler does nothing else: no write, no other read, no other side effect.
It is reachable by anyone who has the secret, and the worst such a caller can do
is make the next render of one project page read the database once.

**Why `revalidateTag(tag, { expire: 0 })` and not `updateTag`.** The installed
docs are explicit:
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md`
says `updateTag` "can **only** be called from within Server Actions. It cannot
be used in Route Handlers", and points to `revalidateTag` for them.
`revalidateTag.md` ("Revalidation Behavior") lists the second argument's forms:
`"max"` is stale-while-revalidate (the next visitor would be served the old
History once), and `{ expire: 0 }` means "stale content is never served, so the
next request is a blocking revalidate/cache miss", to be used "when the caller
needs the data gone immediately and you cannot use `updateTag`"; its closing
example is exactly a webhook Route Handler calling
`revalidateTag(tag, { expire: 0 })`. The one-argument form behaves the same but
is deprecated. So the handler reaches the same end state as the action. With
`NEXT_PRIVATE_DEBUG_CACHE=1` on `yarn start`, a successful call logs one
`FileSystemCache: revalidateTag` line per tag.

**The secret.** `ADW_REVALIDATE_SECRET` is a server-only variable (no
`NEXT_PUBLIC_` prefix, so Next never inlines it into the browser bundle) that
exists in exactly two places: the dashboard host's environment (locally,
`.env.local`) and the database setting the trigger reads. Generate it once with
`openssl rand -hex 32`. `.env.example` carries a placeholder and a comment, no
real value; no real value is committed anywhere, which is why the migration
reads the URL and the secret from settings instead of containing them.

**Wiring it after deployment.** The migration lands first and is inert. Once
the dashboard is deployed with the variable set, run these two statements
against the toolkit's hosted database (SQL editor, or
`supabase db query --linked`), with the dashboard's public origin and the same
secret:

```sql
alter database postgres set app.settings.dashboard_revalidate_url
  = 'https://<dashboard-host>/api/revalidate';
alter database postgres set app.settings.dashboard_revalidate_secret
  = '<the value of ADW_REVALIDATE_SECRET>';
```

Database-level settings apply to new connections, so the first completion
written over a connection opened before the statements ran still goes out
silently; PostgREST's pool recycles on its own, and restarting the project's API
forces it. From then on every completion revalidates the dashboard whether or
not a browser is open, and the browser-side action and the conditional refresh
keep doing their part for whoever is watching. The toolkit's `supabase/README.md`
has the same statements and a way to test the trigger by hand.

#### Two caches, one source

The `"use cache"` scope is the only server cache in front of the database. On
the server, the Supabase client's REST calls go through Next's patched `fetch`,
and per the installed guide (`node_modules/next/dist/docs/01-app/02-guides/
migrating-to-cache-components.md`, "`fetch` cache options") a fetch inside a
`"use cache"` scope is cached automatically: Next stored each Supabase response
in its own data cache (`.next/cache/fetch-cache`, `kind: "FETCH"`) with the
scope's lifetime and no tags. `updateTag("history:<slug>")` expired the scope
and `getHistory` re-executed, but the request inside it was answered from that
untagged entry, so the regenerated History was built from the stale body. For
that reason `getSupabase()` (`src/data/supabase.ts`) gives the server-side
client a fetch that sets `cache: "no-store"` on every request (`fetch.md`,
`options.cache`: fetched from the remote server on every request). Inside a
`"use cache"` scope that is permitted: it stops the inner request from being
stored separately and leaves the scope's own output cached and tagged, so
dropping the tag is the whole story and the next render reads the database.
The browser's fetch is not patched and keeps the default. After a build,
`.next/cache/fetch-cache` holds no Supabase entry.

#### What is prerendered and what is not

A pre-rendered project page has two kinds of content. The sidebar's
`Projects` heading and connection pill, the project list's dehydrated state
(the layout's `projects` scope), the project header (`getProject`) and the
queue (`getQueueState`) are in the **static shell**: their `"use cache"`
results are resolved at build time and embedded in the shell as its Resume
Data Cache. So is the History heading, which the page renders outside any
boundary, and on `/projects` the `Active` heading. The Active islands (the
sidebar list, `/projects`' list and the project page's Active section) are
**request-time holes**: they await `getActiveRunsState()`, which awaits
`connection()`, so the shell carries their skeletons and the rows
stream in on every request. The three History
islands (`HistorySearchBox`, `HistoryPagination` and `CompletedRuns`) are
**request-time holes**: each awaits `searchParams` (the latter two before
`getHistory`; the search island calls no cache scope and only needs `?q` for
its initial text), a request-time read that stops prerendering at the
island's own `SectionBoundary`, so the shell carries a disabled box in the
search slot, a pagination skeleton in the pagination slot and a skeleton of
the history rows for the list, and all three stream in on each server request (a client navigation back to a page seen
within the last five minutes makes no request; see "Client router cache"
below). They are the only readers of `searchParams` (for
`?after`, `?before` and `?q`), and there is no `connection()` call (it would be a redundant second
marker), so the shell stays the same for every page of History. The build's
route table shows the project pages as "Partial Prerender" for this reason.

The summary (`/`) is built the same way: its heading, intro and reading note
are the static shell, and the report island awaits `connection()` before it
reads today's UTC date and calls its two `"use cache"` scopes (`getTodayState`,
tag `summary:today`, and `getPastDays`, tag `summary:past`); it reads no
`searchParams`, so `connection()` is its one request-time marker. The report is
a request-time hole and the route is a partial prerender too.

Two islands do not mean two reads. `getHistory` is a `"use cache"` function
keyed by its arguments, the slug, a plain bookmark object and the search text, with the same
values in both islands, and the installed Next joins an identical invocation
within one request instead of running it again
(`node_modules/next/dist/server/use-cache/use-cache-wrapper.js`,
"Intra-request deduplication"). With `NEXT_PRIVATE_DEBUG_CACHE=1`, one GET
shows one `generated entry` (on a miss) or one hit for the history scope.
On a `?after` or `?before` page the second island adds a `joining intra-request
invocation` line; on page one (bookmark `null`) the second call is answered
before that point and logs nothing, still without a second read.

The distinction matters because of how a prerendered route is served. Under
`cacheComponents`, a request for a prerendered page resumes the shell, and a
`"use cache"` scope that was part of the shell is read from the shell's
embedded Resume Data Cache (debug log, `NEXT_PRIVATE_DEBUG_CACHE=1`:
`use-cache: Resume Data Cache entry found`), frozen at build time. The live
cache handler is never consulted for it. `updateTag("history:<slug>")` did
expire the live entry and `getHistory` did re-execute with fresh rows, but
every later request kept resuming the shell and reading the build-time rows;
`revalidatePath` changes nothing about that. A hole is resolved from the
live cache handler on every request, so a tag update reaches it, and the
scope keeps its long explicit lifetime, so `getHistory` still runs only on a miss
(build, then once after each tag update), not per request. The documented
alternative is a `cacheLife` with `expire` under 5 minutes, which also
excludes the scope from prerenders (`node_modules/next/dist/docs/01-app/
03-api-reference/04-functions/cacheLife.md`, "Prerendering behavior"); the
`searchParams` read is used instead because it keeps the long lifetime.

The same limitation is why Active is not a cache scope at all. It used to be
one per slug, in the shell, and a run that started after the build was missing
from a resumed page until a catch-up happened to cover that slug (issue #69).
Read per request after `connection()`, it is never frozen.

How to prove any of this: make a database change **after** the build (a run
completing, or a test row inserted), call the action, and look for the change
in the next response's HTML. A row that already existed at build time proves
nothing, because the shell carries it whether or not the tag worked; the
earlier fix in this file was verified that way and looked correct until a
post-build row showed it was not. With the debug log on, a fresh
`use-cache: ... generated entry` line for the `getHistory` scope after the
action, and none between two plain GETs, is the mechanical half of the proof.

On that refresh the Active islands re-read the entry and their
`HydrationBoundary` receives a dehydrated state again. React Query's `hydrate()` (`@tanstack/query-core`, `hydration.js`)
overwrites an existing entry only when the incoming `state.dataUpdatedAt` is
strictly newer than the entry's (the `hasNewerSyncData` branch applies only to
a dehydrated pending promise, which the awaited `prefetch` never produces).
Two cases, both without a visible flicker:

- The Active state is read on that request, after the completion event: it is
  newer than the browser's `setQueryData`, so it **does** overwrite, with rows
  read after the completion, which agree with what the reducer produced. (If
  the server clock lags the browser's, the browser's write wins instead; the
  content is the same.)
- Any cached scope (the layout's `projects` state, the queue) carries its
  fill-time stamp, which is older than every browser write since the
  catch-up, so it is skipped and the live entry stays. The same holds for an
  event the browser applied to Active before a later, older hydration (a run
  inserted while the page loaded, #69): the live entry is newer and is kept.

This rule is pinned in `src/data/hydration.test.ts` against the installed
version. The one edge: an event that lands between the server's database read
and the hydration is overwritten by rows that predate it; the next event for
that row corrects it, as with the catch-up.

Two caveats of the design:

- The server action is a public endpoint: anyone who can reach the site can
  call it with any string. That is why it validates the slug strictly and does
  nothing but drop two tags; the worst a caller can do is make the next
  render of one project page, and of the summary's (`/`) today card, read the
  database once.
- A completion nobody is watching is not moved by the browser. The move is
  triggered by a browser that received the event; if no browser had the
  channel open when the run completed, nothing calls the action. The database
  webhook ("Webhook revalidation" above) covers that case from the server
  side, dropping the same two tags through the route handler. Until its two
  database settings are set, History stays as it was until the cache lifetime
  (`getHistory`'s explicit `cacheLife`: a background refresh once an entry is
  a day old) or until the next completion anyone sees. The Active half has no such gap: the catch-up re-reads it on every
  `SUBSCRIBED`.

A DELETE of a run that is not in the Active list is treated as a history
change too (`isHistoryChange`), since under the default replica identity the
event cannot say what the deleted run was, and a completed run that no longer
exists should leave History on the next render rather than at cache expiry.

One rendering detail to know when reading the served HTML of a pre-rendered
project page. Active and History both stream in behind their Suspense
boundaries on every request (see "What is prerendered and what is not"), so
in the served document the Active and History skeletons (`aria-busy="true"`
containers) sit at their sections' positions, the rendered rows follow in
hidden segments, and React's inline `$RC` script swaps them in as the
document parses, before any bundle loads and without a fetch. That is not the
query cache (the views' queries are cache hits during the server render,
hydrated by their islands) and not a clock read. What would be a problem is
the rows missing from the document altogether, which is what a clock read in
a client component during the prerender produces.

#### Client router cache

`experimental.staleTimes.dynamic` is 300 seconds in `next.config.ts`. Holes
are not prefetched, and the router cache would otherwise keep dynamic content
for 0 seconds, so every sidebar navigation would make an RSC request for the
page's dynamic part and flash the History skeleton. With the window, a project
page visited within it is rendered from the client router cache on a sidebar
navigation, with no RSC request and no History fallback; after the window, the
next navigation refetches the dynamic part. Two paths keep it correct. For the
project on screen, the completion handler calls `revalidateHistory` and then
`router.refresh()`, which re-renders the route from the server; the action's
`updateTag` also clears the whole client cache (installed `cacheLife.md`,
"Client cache behavior"), so in a tab with the channel open any completion
empties it. For a project not on screen, the refetch after the window reads a
server cache already dropped by tag (action or webhook). The residual case: a
completion this tab received no event for (channel down at that moment; the
catch-up re-reads Active only) can leave a revisited page's History up to
five minutes old. `staleTimes.static` stays at its default, since it also sets
the `default` cacheLife profile's `stale`.

### QueryBoundary

`src/components/QueryBoundary.tsx` is how every suspended query is wrapped: a
`Suspense` boundary for the pending state inside a `react-error-boundary`
`ErrorBoundary` for the failed one. `useSuspenseQuery` throws a failed fetch to
the nearest error boundary, and React Query keeps that error on the query. A
plain error boundary reset would re-mount the child, which reads the same
errored query and throws again, so Retry would loop. `QueryBoundary` takes
`reset` from `useQueryErrorResetBoundary()` and passes it as the boundary's
`onReset`, so Retry resets the query error state and the next render
refetches. It renders a default panel ("Could not load.", an optional `detail`
line, a Retry button) or whatever `errorFallback(retry)` returns. It renders
inside `Providers`, where the query it guards has its client. The layout wraps
`ProjectNav` in it and the project page wraps `ActiveRunsView` in it.

### SectionBoundary

`src/components/SectionBoundary.tsx` is the second boundary, for a
server-rendered section that is not a query: the same shape (a `Suspense` for
the streaming state inside a `react-error-boundary` `ErrorBoundary` for the
failed one, the same default panel from `src/components/ErrorPanel.tsx`), but
a different Retry. The section it wraps is an async server component whose
render already happened on the server, so there is no query error to reset
(`useQueryErrorResetBoundary` is not used) and a local boundary reset alone
would only re-mount the same failed output. Retry calls `router.refresh()`
first, which asks the server to render the route again (the section's cache
scope is read again and, on a miss, the database), and then resets the
boundary, so the re-mounted child is the fresh server result streaming in
behind the fallback. The project page wraps `HistorySearchBox`,
`HistoryPagination` and `CompletedRuns` each in one; the hole semantics come from their `searchParams`
read and are unchanged by the boundary, since a server component is a
legitimate child of a client boundary and the Suspense inside is still the
streaming boundary the shell carries the fallback for.

Which one to use: a `useSuspenseQuery` goes in `QueryBoundary`; a
server-rendered section that can fail independently goes in
`SectionBoundary`; neither is ever rendered under a bare `Suspense`.

### Where live updates go

Live updates write into the same cache entry. `src/data/realtime.ts` (below)
calls `queryClient.setQueryData(queryKeys.projects, ...)` on every change; the sidebar
re-renders from the cache and the layout, the boundary and the key do not
change. Because the query is static, `setQueryData` is the update path (not
`invalidateQueries`). A server side source can also refresh the prefetch with
`revalidateTag("projects", ...)`, so the next visitor's HTML starts from fresh
data. The active runs follow suit: the runs listener writes with
`queryClient.setQueryData(queryKeys.activeRuns, ...)`, the one entry the
sidebar, `/projects` and every project page read; it has no server tag, since
it is read per request.
The queue too: the queue listener writes with
`queryClient.setQueryData(queryKeys.queue(slug), ...)`; its prefetch scope has
no tag.
History is not a cache entry: its one update path is the server action
dropping `history:<slug>` followed by a route refresh (see "The move" above).

## Realtime

### Environment

The browser connects straight to Supabase Realtime, and the server reads the
project list through the same client, so both need two public values,
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Both
are public by design: the `NEXT_PUBLIC_` prefix inlines them into the client
bundle, and the publishable key has no privileges of its own, Row Level
Security limits it to the public projects. The secret (service role) key is a
different key and is never used or stored in this repo. The variables are
required at build time too (see Data above).

| File               | Tracked | Loaded by                                                        |
| ------------------ | ------- | ---------------------------------------------------------------- |
| `.env.example`     | yes     | nobody; the two names with placeholder values, copy it to start  |
| `.env.development` | no      | `yarn dev` only (Next loads it when `NODE_ENV` is `development`) |
| `.env.local`       | no      | every mode: `yarn dev`, `yarn build` and `yarn start`            |

Next does not read `.env.development` for a production build or `next start`
(those read `.env.production` and `.env`), which is why the real values go in
`.env.local` as well: it is loaded in every mode and gitignored. Keep the two
files identical. `.gitignore` ignores `.env` and `.env.*` and un-ignores
`.env.example`.

### The client

`src/data/supabase.ts` exports `getSupabase()`, the only way to get the
Supabase client. It builds one `SupabaseClient` on first call (schema `adw`)
and returns that instance afterwards, so a page holds one websocket. It throws
if either variable is missing rather than connecting to nowhere. The same
client serves the server-side read of `project_summaries` in `getProjects()`;
on the server no channel is ever subscribed, so no socket is opened there.

### The channel

`src/data/realtime.ts` exports `startRealtime(queryClient, options)`, where
`options.onHistoryChange?: (slug) => void` is the hook `Providers` uses to
start the move (above). It opens one channel named `adw` with three
`postgres_changes` listeners, every event on `adw.projects`, `adw.runs` and
`adw.queue_items`. A projects event goes through
`applyProjectChange` (next section) and the result is written under
`queryKeys.projects`. A runs event is resolved to a project first: the event
names the project by `project_id` (on DELETE from `ev.old`, which carries the
primary key `(project_id, adw_id)` and nothing else under the default replica
identity), the slug is looked up in the cached project list, and an event for a
project that list does not hold is dropped silently (a private project, or no
list in the cache: nothing on screen could show it). The event then goes
through two reducers from `src/data/apply-run-change.ts`, `applyRunChange` for
the one Active entry under `queryKeys.activeRuns` and
`applyRunChangeToSummaries` for the completed count and `last_run_at` in the
project list, in that order, because the second one needs
the run's previous status and the event does not carry it (see "Event to
cache"); last, if `isHistoryChange` says the event touched the project's
completed runs, `onHistoryChange(slug)` is called. A queue event is resolved
to a project the same way (`ev.old` carries `(project_id, issue_number)` only),
then goes through `applyQueueChange` for `queryKeys.queue(slug)` and
`applyQueueChangeToSummaries` for the project's `queued` count, with no
history callback: the queue is not history.
Every write is `setQueryData`, and every updater has the form
`current => current && reducer(current, ev)`: **an entry that is not in the
cache stays absent.** `setQueryData` ignores an `undefined` result, so a single
event can never seed a one-row list that looks complete and is not (the earlier
version defaulted a missing list to `[]`, which could do exactly that).

The channel's subscribe callback is the one writer of the connection
indicator: `SUBSCRIBED` sets `Live`, `CHANNEL_ERROR` and `TIMED_OUT` set
`Reconnecting`, `CLOSED` sets `Connecting`. `SUBSCRIBED` also runs the
catch-up read (below). The function returns a closer that removes the channel
and resets the indicator to `Connecting`.

`src/app/providers.tsx` starts it from a `useEffect`, passing
`onHistoryChange: (slug) => { void revalidateHistory(slug).then(() => { if (isProjectPath(window.location.pathname, slug)) router.refresh(); }).catch(() => {}) }`
(revalidate first, refresh second and only when that project's page is the
route on screen; a failed action is swallowed and leaves History stale until
the cache lifetime). The returned closer is the effect's
cleanup, so the channel is removed when the provider unmounts. In development React's strict mode runs
mount, cleanup, mount, so the indicator shows one connect, close and reconnect;
production connects once.

### Event to cache

`src/data/apply-project-change.ts` exports `applyProjectChange(current, ev)`,
a pure function from the cached `ProjectSummary[]` and one
`RealtimePostgresChangesPayload<Project>` to the next list. INSERT prepends
the row as a summary with zero counts and `last_run_at: null` (and is a no-op
if the id is already present); UPDATE merges the row into the matching entry,
keeping its counts (`queued` included), which are not table columns and so
are not in the event;
DELETE removes by `ev.old.id`, the only field Supabase guarantees in `old`
unless the table's replica identity is FULL. It never mutates its input.

It is covered by `src/data/apply-project-change.test.ts` (vitest): the three
events, a duplicate insert, an update that keeps `queued` and an update for an
unknown id. Run with
`yarn test`; `vitest.config.ts` maps the `@/` alias and picks up
`src/**/*.test.ts`.

`src/data/apply-run-change.ts` holds the two reducers for an `adw.runs` event
(type `RunChange`, a `RealtimePostgresChangesPayload<Run>`), both pure and
covered by `src/data/apply-run-change.test.ts`:

- `applyRunChange(current: ActiveRuns, ev): ActiveRuns` returns every
  project's active runs after the event. A run is matched on its primary key
  `(project_id, adw_id)`, never on `adw_id` alone, which is unique per project
  only. INSERT prepends the row when its status is
  `running` or `failed` and ignores a `completed` row (that is history); it is
  a no-op if the run is already in the list. UPDATE replaces
  the row in place while its status is live (a `failed` run set
  back to `running` stays where it was, now `running`) and **removes** it when
  the new status is `completed`; a live run that is not in the list is added
  as an insert would, since the event carries the full row. DELETE removes the
  run keyed by `ev.old`. `fetched_at` is never touched: it records when
  the rows were read, which an event does not change. The input is returned
  by identity when nothing changed.
- `isHistoryChange(ev, previousStatus): boolean` says whether the event
  changed the project's completed runs, which the cache does not hold: true
  for an INSERT or UPDATE whose new status is `completed`, and for a DELETE of
  a run the active list did not hold (`previousStatus` undefined; the event
  cannot say what the deleted run was, and one that was not live was, as far
  as the browser knows, completed). The realtime module calls
  `onHistoryChange(slug)` when it is true.
- `applyRunChangeToSummaries(current: ProjectSummary[], ev, oldStatus)`
  returns the project list with the matching project's `completed` count and
  `last_run_at` adjusted. It never touches `running` or `failed`: the sidebar
  counts those from the Active entry (`activeRunCounts`), so they cannot
  disagree with the rows (issue #62). `completed` comes from the
  `project_summaries` view, and the projects listener never sees it change (a
  runs row does not touch `adw.projects`), so it is moved here: `+1` on an
  INSERT of a completed row and on an UPDATE to `completed` from a known
  `running` or `failed` status; unchanged otherwise (DELETE included, since
  the event cannot say the deleted run was completed). `last_run_at` is the
  view's `max(runs.updated_at)`, so INSERT and UPDATE move it forward to
  `ev.new.updated_at` when that is later (compared as instants, since the view
  and the event may format the same moment differently); DELETE never moves it
  back. `queued` is not a run status and is never moved by a run event. The
  list keeps its order so projects do not jump under the pointer.

  `oldStatus` is a parameter because the event does not have it: Supabase
  sends `old` with the primary key columns only unless the table's replica
  identity is FULL, and `adw.runs` uses the default. The realtime module reads
  the run's current status out of the Active entry with
  `runStatusIn(current, project_id, adw_id)` **before** applying
  `applyRunChange`, and passes it in. Because the entry holds every project's
  active runs, the previous status of any active run is known, whichever page
  is open. When it is unknown (the run is not active, so it was already
  completed), an UPDATE to `completed` is a correction to a history row and
  does not count again. Known gap: the DELETE of a completed run does not
  lower the `completed` count until the next catch-up or page load.

`src/data/apply-queue-change.ts` holds the two reducers for an
`adw.queue_items` event (type `QueueChange`), both pure and covered by
`src/data/apply-queue-change.test.ts`:

- `applyQueueChange(current: QueueItem[], ev): QueueItem[]` holds the queued
  items only. INSERT or UPDATE with state `queued` adds or replaces the item by
  `issue_number` and re-sorts by `position, issue_number` (a move changes
  positions); an UPDATE to any other state removes it (the item started or was
  stopped); DELETE removes the `issue_number` in `ev.old`. A duplicate INSERT
  or a non-queued INSERT is a no-op, and the input is returned by identity
  when nothing changed.
- `applyQueueChangeToSummaries(current, ev, wasQueued)` moves the project's
  `queued` by `(queued now) - (queued before)`, never below 0, touching no
  other count. UPDATE is included, not only INSERT and DELETE, because the
  toolkit upserts every item on every ledger save: an item starting (`queued`
  to `running`) or being re-queued arrives as an UPDATE, and the unchanged
  upsert (`queued` to `queued`) is a zero delta. `wasQueued` is read with
  `queuedIn(current, issue_number)` from the cached queue entry **before** it
  is rewritten, for the same replica-identity reason as `oldStatus`. It is
  `undefined` when the queue is not cached; an INSERT then counts as not
  queued before, an UPDATE or DELETE leaves the count alone. Known gap: an
  UPDATE or DELETE for a project whose queue was not loaded this session does
  not move its sidebar count until the next catch-up or page load.

### Catch-up on SUBSCRIBED

Events that happen while the channel is down are never delivered, so after a
reconnect the cache must be re-read. The first connect has the same gap: the
page's entries come from a static shell whose cache may be up to 15 minutes old
(the server-side `cacheLife`), and anything that changed between that fill and
the moment the channel joined was never an event this browser saw. Both are
handled by one path: on **every** `SUBSCRIBED`, `realtime.ts` calls
`getProjects()` and writes the result under `queryKeys.projects`, then calls
`getActiveRuns()` and writes the result under `queryKeys.activeRuns`
unconditionally (it is the complete list read from the database, not a
one-event seed, so the `current &&` rule does not apply), then for every
queue entry in the cache (`queryClient.getQueryCache().findAll(...)` with `queryKeys.allQueues`, the `["queue"]` prefix exported from
`query-keys.ts`) calls `getQueue(slug)` and writes the result under `queryKeys.queue(slug)`.
There is no "was I disconnected" flag to keep in step; the first `SUBSCRIBED`
and a reconnect are the same case. History needs no catch-up: it is not in the
cache, and a completion this browser missed is the "unwatched completion"
caveat above.

It writes with `setQueryData`, not `invalidateQueries` or `refetchQueries`:
both skip queries with `staleTime: "static"`, which every query here has, so
they would be a silent no-op. The reads go through the boundary functions
themselves, so the refreshed entries have exactly the shape the prefetch put
there. `getActiveRuns` stamps a fresh `fetched_at`, which nothing in the UI
reads today.

Cost: one `project_summaries` read, one `runs` read, and one `getQueue` (two
reads) per cached queue entry, per (re)connect. The cache holds the project
list, the one Active entry and the queue of each project visited this
session, so this is a handful of small reads;
in development React's strict mode connects twice on mount, so it runs twice
there. A failed catch-up is logged with `console.warn` and swallowed: the cache
stays as it was and the next event or reconnect tries again. An event that
arrives while a catch-up read is in flight is applied first and then
overwritten by the read's result, which can predate it by the round-trip time;
the next event for that row corrects it.

### The indicator

The dashboard's sidebar shows a connection indicator, beside the Projects
heading, `src/components/ConnectionIndicator.tsx`:
a pill with a dot and one of three labels, `connecting` (amber, pulsing), `live`
(green) or `reconnecting` (red). It has `role="status"` and `aria-live="polite"`
so a screen reader announces changes. The three states are the string enum
`ConnectionStatus` (`Connecting = "connecting"`, `Live = "live"`,
`Reconnecting = "reconnecting"`) exported from the same file; the enum value is
the rendered label, and the style table is keyed by it. It is rendered only in
the `(dashboard)` layout, beside `Providers`, so it exists exactly where the
channel does: leaving the group (to the summary at `/`) unmounts both, and returning
remounts both (the closer resets the store to `Connecting`, the next
`SUBSCRIBED` sets `Live`).

The store for that state lives in the same file, deliberately: a module-level
`status` variable, a `Set` of listeners, and the `subscribe` / `getSnapshot` /
`getServerSnapshot` trio that the component hands to `useSyncExternalStore`.
It is not React state because there is one writer outside React and the only
thing that should re-render on a change is the pill. The server snapshot is the
constant `ConnectionStatus.Connecting`: the socket does not exist on the
server, and the SSR markup must match the first client render, so every page
hydrates as `connecting` and moves on from there.

The one way in is the exported `setConnectionStatus(next)`. `startRealtime`
calls it from the channel's status callback and nothing else; the sidebar's
live updates (above) go through the query cache, not this store.

## Types

`src/types/adw.ts` has two sections. `Project`, `Run` and `QueueItem` (with
`QueueState`, the table's state check constraint) mirror the database tables
column for column. `ProjectSummary` is the one view model the screens
need that the database does not store (the counts and `last_run_at`); it comes
from the data layer (the `project_summaries` view computes them). Runs and
queue items have no view model: the screens take `Run` rows as stored, and a finished run's
duration is formatted at render time by `durationLabel` in
`src/lib/run-view.ts`.

## Routing

A project slug is exactly `owner/repo`, so the detail page has two named
segments, `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`.
`/projects/SBub/adw-dashboard` arrives as
`{ owner: "SBub", repo: "adw-dashboard" }`; the page assembles the slug once,
and everything below it (the data boundary, the query key, the cache tags, the
History bookmark, the `revalidateHistory` action) takes the slug as is.

URLs never carry the project id: it is a UUID and an internal key. The slug
stays the key because it is what the toolkit derives from the git remote, it is
the tenant key in the database, and it mirrors the GitHub URL.

Project pages are pre-rendered at build time from the project list
(`generateStaticParams` awaits `getProjects()`, so the database is read during
the build, and splits each slug into an `{ owner, repo }` pair; an empty list
yields the placeholder pair `_` / `none`, because an empty result fails the
build under `cacheComponents`); a slug that is not in that list still renders
on demand. The segment's `loading.tsx` is the Suspense boundary
that lets the shell prerender while the page streams in (its fallback is
`ProjectPageSkeleton`, a skeleton of the header, Active, Queue and History),
and its `error.tsx` is
the client error boundary (message, digest, Retry) for anything the page body
throws. A failure inside one of the pane's own boundaries (`QueryBoundary`
around Active, `SectionBoundary` around History) stays in that section and
never reaches it.
An unknown slug calls Next's `notFound()`, which renders
`src/app/(dashboard)/not-found.tsx` inside the two-pane shell; URLs that match
no route at all fall through to the root `src/app/not-found.tsx`, with a 404
status. That includes a path with one or three segments under `/projects`
(`/projects/SBub`, `/projects/SBub/adw-dashboard/extra`) and an encoded slash
(`/projects/SBub%2Fadw-dashboard`, one segment): the router answers them, no
slug lookup happens.

The summary is the root route `/` (`src/app/page.tsx`) and sits outside the
`(dashboard)` group: no project sidebar, no project prefetch, no `Providers`
and no Realtime channel, so `/` shows no connection pill: the pill is rendered
by the `(dashboard)` layout beside `Providers`, where the channel is. The
project overview (every active run of every project, grouped by project in
sidebar order, each group headed by a link to its project page, or "No runs in
progress.") is `src/app/(dashboard)/projects/page.tsx`
at `/projects`, beside the `projects/[owner]/[repo]` segment. `/summary`, the
summary's old address, is a permanent (308) redirect to `/` answered by the
route handler `src/app/summary/route.ts`. It is not a `next.config.ts`
redirect because Next always merges the request's query string into a config
redirect's destination; the handler answers a bare, relative `/` and reads
nothing from the request, so old filtered links land on the plain page.

## Summary

`/` shows what the toolkit finished per UTC day, newest first, today on top
in its own card with a Refresh button: runs
completed and failed (halted when there are any), then three bordered chart
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
rounded tops and a capped width; the value (run count, token label or cost in
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
`failed` or `halted` (neither fires the action or the webhook), and tokens and
cost (per-model and per-phase usage included) that the toolkit writes after
the completion. The model and phase rows are read in the same scopes as the day rows, so the same tags
and lifetimes cover them. The 60-second `revalidate`
of the today scope and the Refresh button bound both. The router cache's
`staleTimes.dynamic` (300 seconds) is above that `stale`, so a client
navigation back to `/` within five minutes may show the router-cached today
card; Refresh is the remedy. The page has no Realtime listener: it is outside
`(dashboard)`.

## Running it

Requires Node 24 (see `.nvmrc`) and Yarn 4.6.0 via corepack. Yarn only, never
npm or npx.

```sh
yarn install   # also installs the git hooks (lefthook) through postinstall
cp .env.example .env.development && cp .env.example .env.local   # then fill in the real values
yarn dev       # http://localhost:3000, or PORT=3101 yarn dev
```

## ADW

This repository can be worked by the [ADW toolkit](https://github.com/SBub/adw-toolkit): a
GitHub issue goes in, and a plan, an implementation, a test run, a review and a pull request
against `develop` come out, each run in its own git worktree under `trees/<adw_id>/` on its own
port. The toolkit is never committed here; it is symlinked in from its own checkout.

The one way onto the queue is the GitHub label `adw:queued` on an issue. The webhook trigger (or
the runner's offline sweep) puts the issue in the queue, and `uv run adws/adw_queue.py run --apply`
works it one issue at a time, merging each pull request before the next starts; see the
toolkit's `adws/QUEUE.md`. GitHub access is whatever `gh auth login` provides; no personal access
token is configured.

What the toolkit reads here:

- `.adw/project.md`, the committed ADW profile: how to install, build and test this app, which
  port it runs on, what is protected, and where plans (`specs/`) and documentation (this file and
  `AGENTS.md`) go. Its nine headings are a contract with the toolkit's slash commands.
- `.env.development`, which carries the toolkit's keys (`CLAUDE_CODE_PATH`, `ADW_PROJECT_ROOT`,
  `ADW_BASE_BRANCH`, `ADW_UI_DISPLAY_NAME`; see `.env.example`) next to the app's own.
- `.mcp.json` and `playwright-mcp-config.json`, the Playwright MCP server the review phase
  screenshots the app with. Every Claude invocation runs with `--strict-mcp-config`, so only servers
  declared there reach a run.

One-time setup in a checkout, after cloning the toolkit beside this repository:

```sh
ln -s /path/to/adw-toolkit/adws adws
mkdir -p .claude && ln -s /path/to/adw-toolkit/commands .claude/commands
```

`adws`, `.claude`, `agents/`, `trees/` and `.ports.env` are gitignored.

## Scripts

| Script              | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `yarn dev`          | Next dev server                                      |
| `yarn build`        | Production build                                     |
| `yarn start`        | Serve the production build                           |
| `yarn typecheck`    | `next typegen` then `tsc --noEmit`                   |
| `yarn lint`         | ESLint (Next, Prettier compat, security, no-secrets) |
| `yarn lint:fix`     | ESLint with autofix                                  |
| `yarn format`       | Prettier, write                                      |
| `yarn format:check` | Prettier, check only                                 |
| `yarn knip`         | Unused files, exports and dependencies               |
| `yarn test`         | Unit tests (vitest, `src/**/*.test.ts`)              |

## Git hooks

`lefthook.yml` runs format (staged files, re-staged), lint, typecheck and knip
in parallel on every commit, and `yarn test` on every push. Hooks are installed
by `yarn install`; there is no manual step.

## Stack

Next.js 16 (App Router), React 19, TypeScript 5.9 strict, Tailwind CSS v4 via
`@tailwindcss/postcss`, TanStack React Query 5 for the query cache (sidebar and
active runs; history is server-rendered),
`@supabase/supabase-js` for Realtime, vitest for unit tests. No component or
icon library. Light and dark themes follow the system
preference through Tailwind's `dark:` variants. The page colour is defined once,
as `--background` and `--foreground` in `src/app/globals.css`, painted on both
`html` and `body` with `color-scheme: light dark` (so the canvas, scrollbar
gutter and overscroll match the content), and exposed to Tailwind as
`bg-background` for an element that must match it.
