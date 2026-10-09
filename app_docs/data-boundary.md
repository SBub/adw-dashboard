# Data boundary and query layer

**Specifications:**

- specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md

## Overview

Every read of the database goes through one boundary, `src/data/index.ts`, and the React Query layer beside it (`query-keys.ts`, `query-client.ts`, the server prefetch). This doc covers the projects view, the reads behind each section, the sidebar's prefetch and hydration, the environment variables and the one Supabase client.

## How it works

### Data: projects and runs from the database

The project list is live. `getProjects()` reads the `adw.project_summaries`
view of the toolkit's Supabase project (one row per project with its
`running`, `completed` and `failed` counts and `last_run_at`, computed in the
database, see the toolkit's `supabase/README.md`). The view runs with
`security_invoker`, so the publishable key sees only public projects. The list
is ordered by `last_run_at` descending with projects that have no runs yet
last. Realtime (`app_docs/realtime.md`) then patches that list in the browser as `adw.projects`
rows change. The view also carries `queued`, the number of issues waiting in
the project's queue ledger (the toolkit's), shown in the sidebar as the first
count and in bold amber when above zero (no pulse dot: that marks running). It moves live with the queue listener
(see "Event to cache" in `app_docs/realtime.md`) and is corrected by a page load or the realtime
catch-up. The sidebar's `running` and `failed` counts are not the view's: they
are counted in the browser from the one Active entry (`app_docs/active-runs.md`), so they always
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
  and `finished_at` is not null (and, when the search text `q` is not
  `null`, that match it), shown `finished_at desc, adw_id desc`, and returns
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
  count. A non-empty page also reads `adw.run_metrics` once for the shown
  runs (`adw_id, cost_usd` where `project_id = <id>` and
  `adw_id in (<the page's ids>)`), in the same `Promise.all` as the newer
  count, and returns their costs as `costs` keyed by `adw_id` (a run with no
  metrics row has no key; an empty page or an unknown slug gets `costs: {}`
  and no read). It reads no clock.

In SQL terms:

```sql
select project_id, adw_id, issue_number, issue_title, issue_class, branch_name,
       pr_number, phase, status, state, toolkit_version, started_at, updated_at, finished_at
  from adw.runs where status in ('running', 'failed')
 order by updated_at desc;                                    -- Active, all projects
select * from adw.project_summaries where slug = $1;
select <same columns>
  from adw.runs where project_id = $2 and status = 'completed'
   and finished_at is not null
   and (finished_at < $3 or (finished_at = $3 and adw_id < $4)) -- ?after
   -- ?before: (finished_at > $3 or (finished_at = $3 and adw_id > $4)), order asc
   and (issue_title ilike $5 or branch_name ilike $5 or adw_id ilike $5
        or issue_number = $6)                                -- a search; $6 if an integer
 order by finished_at desc, adw_id desc
 limit 3;
select count(*) from adw.runs where project_id = $2 and status = 'completed'
   and finished_at is not null and <the same search>;        -- total
select count(*) from adw.runs where project_id = $2 and status = 'completed'
   and finished_at is not null and <the same search>
   and (finished_at > $7 or (finished_at = $7 and adw_id > $8)); -- newer than the first row
```

The rows are the raw `Run` type; no label is derived on the server (see
`app_docs/clock-and-prerender.md`). There are no fixtures any more; `src/data/fixtures.ts` is
gone.

`src/data/index.ts` is the single boundary the screens read through. Its
screen-facing reads are four functions (plus the shape the second one
returns):

- `getProjects(): Promise<ProjectSummary[]>`
- `getActiveRuns(): Promise<ActiveRuns>`, where `ActiveRuns` is
  `{ active: Run[]; fetched_at: string }`
- `getCompletedRuns(slug, bookmark, q): Promise<CompletedRunsPage>`, where
  `CompletedRunsPage` (exported from `src/data/index.ts`) is `HistoryPage`
  plus `costs: Record<string, number>` (each shown run's cost in US dollars
  keyed by `adw_id`), `HistoryPage` is `{ items: Run[]; page: number; pageCount: number;
hasNewer: boolean; newerCursor: HistoryCursor | null; olderCursor:
HistoryCursor | null }` and `HistoryCursor` is `{ direction: "after" |
"before"; cursor: string }` (from `src/lib/history-bookmark.ts`)
- `getQueue(slug): Promise<QueueItem[]>`

The summary page (`/`) reads two more, `getSummaryPast(today, days)` and
`getSummaryToday(today)` (see `app_docs/summary.md`).

Nothing under `src/app/` or `src/components/` imports from anywhere else for
data; the query keys and the `QueryClient` factory (next section) are cache
plumbing, not data, and the server action in `src/app/actions/` touches no
data at all (it drops cache tags). The Supabase client is untyped (no
generated `Database` type yet), so the boundary casts rows once: the view's
rows to `ProjectSummary`, the runs rows to `Run[]` (the shared `RUN_COLUMNS`
select is exactly the fields of `Run`) and the queue rows to `QueueItem[]`
(`QUEUE_COLUMNS`, exactly the fields of `QueueItem`) and the `run_metrics`
rows to `RunMetrics[]` (`RUN_METRICS_COLUMNS`, exactly the fields of
`RunMetrics`). Generating types for the
`adw` schema is a follow-up.

Because the layout prefetch and `generateStaticParams` both call
`getProjects()`, and the page calls `getQueue()` and
`getCompletedRuns()` for every slug, the database is read at **build time** as well as at request
time (`getActiveRuns()` runs at request time only, see `app_docs/active-runs.md`, "Prefetch and hydration
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
  prefetch of the Active entry (server only; see `app_docs/active-runs.md`, "Prefetch and hydration of
  the Active runs").

Each boundary function runs on the server during its prefetch (and at build
time, through it) and in the browser only on a cache miss, which the hydration
makes rare.

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

## Rules

- Wiring happens at one boundary, `src/data/`. Pages and components import
  `getProjects`, `getActiveRuns`, `getCompletedRuns` and `getQueue` from
  `@/data` and nothing else for data. The fifth export, `getProjectSlug(projectId)`, is
  read only by the `/api/revalidate` route handler (it turns a webhook's
  `project_id` into the slug the tags are keyed by); never call it from a
  page, a component or a `queryFn`. The sixth, `getSummaryPast(today, days)`,
  is called only from the summary page's `getPastDays` scope (see `app_docs/summary.md`),
  never a `queryFn`. The seventh, `getSummaryToday(today)`, is called on the
  server only from the summary page's `getTodayState` scope and is the
  `queryFn` of `TodaySummary`; it reads no clock (`today` always comes from
  the caller). Both read `daily_model_summary` and `daily_phase_summary` for
  the same days in the same `Promise.all` as their `daily_summary` read. The
  eighth, `getWorkers()`, reads `adw.workers` (`WORKER_COLUMNS`, no order;
  `workerState` picks the freshest row) and is called only from the worker
  store in `WorkerStatus`, in the browser: never on the server, never a
  `queryFn`, no cache scope, no query key, not on Realtime. `getProjects`, `getActiveRuns` and
  `getQueue` are also the `queryFn`s, passed directly, with no fetcher wrapper in between (a function that only calls the
  boundary adds nothing; do not reintroduce one); `getCompletedRuns` is never
  a `queryFn`. All four are async database reads: `getProjects` reads the
  `project_summaries` view, `getActiveRuns()` (no argument) reads the `runs`
  table with `status in (running, failed)` for every visible project,
  `updated_at desc`, and returns `{ active, fetched_at }`,
  `getCompletedRuns(slug, bookmark, q)` the view by slug and then `runs` by
  `project_id` with `status = completed` and a `finished_at`
  (narrowed by `historySearchFilter(q)` when `q` is not `null`), one
  keyset page at a time in either direction (rows strictly older than an
  `after` bookmark, or strictly newer than a `before` bookmark read ascending
  and reversed by `historyItems`; shown `finished_at desc, adw_id desc`;
  `HISTORY_PAGE_SIZE` rows plus two counts on the same filter, the total and
  the rows newer than the first shown row, assembled by `toHistoryPage` into
  `{ items, page, pageCount, hasNewer, newerCursor, olderCursor }`; never an
  offset; then, for a non-empty page, one read of `run_metrics`
  (`adw_id, cost_usd`, `project_id = <id>`, `adw_id in (<the page's ids>)`)
  in the same `Promise.all` as the newer count, assembled by `runCosts`
  (`src/lib/run-view.ts`) into `costs`: one extra read per page, never one
  per run, and never in the query cache, since it is read inside the same
  `history:<slug>` cache scope and drops with the tag), `getQueue(slug)`
  the same view by slug (unknown slug: `[]`) and then `queue_items` by
  `project_id` with `state = queued`, ordered `position asc, issue_number asc`.
  Changing what is read
  means changing `src/data/index.ts` while keeping those signatures, and
  nothing elsewhere. The
  query layer (`query-keys.ts`, `query-client.ts`, `active-runs-query.ts`,
  `active-runs-state.ts`) holds keys, the client factory, the Active query
  options and the Active prefetch only; it calls boundary functions and never
  reads Supabase itself. Do not read run metrics per run.
- The boundary casts the untyped Supabase rows (`ProjectSummary` for the view,
  `Run[]` for `runs`, `QueueItem[]` for `queue_items`, `DailySummary[]` for
  `daily_summary`, `DailyModelSummary[]` for `daily_model_summary`,
  `DailyPhaseSummary[]` for `daily_phase_summary`, `RunMetrics[]` for
  `run_metrics`, `Worker[]` for `workers`) in
  `src/data/index.ts`.
  Those casts are the only place the shapes are asserted; do not add another
  in a page or component. When touching the `runs` select, keep the column
  list equal to the fields of `Run`, `QUEUE_COLUMNS` equal to the fields
  of `QueueItem`, `DAILY_SUMMARY_COLUMNS` equal to the fields of
  `DailySummary`, `DAILY_MODEL_SUMMARY_COLUMNS` equal to the fields of
  `DailyModelSummary`, `DAILY_PHASE_SUMMARY_COLUMNS` equal to the fields
  of `DailyPhaseSummary`, `RUN_METRICS_COLUMNS` equal to the fields of
  `RunMetrics`, and `WORKER_COLUMNS` equal to the fields of `Worker`, all in `src/types/adw.ts`.
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
- `queryClient.prefetchQuery` and `prefetchInfiniteQuery` are deprecated in
  the installed React Query; use `queryClient.query()` and `infiniteQuery()`.
  Do not swallow their rejection on the server prefetch: an empty dehydrated
  cache ships the fallback silently, a thrown error fails the build loudly.
- The Supabase client is only ever obtained via `getSupabase()` from
  `src/data/supabase.ts`. Never call `createClient` anywhere else; a second
  client is a second websocket.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are
  public by design (browser bundle, RLS-limited). The secret / service role
  key must never be added to this repo, to any `.env*` file in it, or to any
  variable with a `NEXT_PUBLIC_` prefix. `ADW_REVALIDATE_SECRET` is the one
  server-only variable: it stays without the prefix and is read only in the
  route handler. `.env.example` is tracked with
  placeholders; `.env.development` (dev) and `.env.local` (all modes,
  including build and start) hold the real values and are gitignored.
