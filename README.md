# ADW Dashboard

A public dashboard for runs of the AI Developer Workflow (ADW) toolkit across
projects. One two-pane screen:

- The left pane is a persistent sidebar listing every project with its
  running, completed and failed counts and the time its last run started. It
  lives in a shared layout (`src/app/(dashboard)/layout.tsx`), so it keeps its
  state and scroll position when the selection changes. Below the `md`
  breakpoint it becomes a horizontal strip above the detail.
- The right pane shows the selected project's runs: an Active section for
  runs in progress (phase, branch, last update, a stale marker) and a History
  section for finished runs (final phase, timings, duration) with an
  all/completed/failed toggle. `/` shows an empty "Select a project" panel;
  `/projects/<owner>/<repo>` selects a project and is the deep link.

## Data: projects and runs from the database

The project list is live. `getProjects()` reads the `adw.project_summaries`
view of the toolkit's Supabase project (one row per project with its
`running`, `completed` and `failed` counts and `last_run_at`, computed in the
database, see the toolkit's `supabase/README.md`). The view runs with
`security_invoker`, so the publishable key sees only public projects. The list
is ordered by `last_run_at` descending with projects that have no runs yet
last. Realtime (below) then patches that list in the browser as `adw.projects`
rows change.

The runs are live too. `getProjectRuns(slug)` makes two reads through the same
client: the project row from `adw.project_summaries` where `slug` matches (the
same shape the sidebar shows, so the header and the sidebar agree; no row means
`null`, which the page renders as not found), then the rows of `adw.runs` where
`project_id` is that project's id, ordered by `updated_at` descending. In SQL
terms:

```sql
select * from adw.project_summaries where slug = $1;
select project_id, adw_id, issue_number, issue_class, branch_name, phase, status,
       state, toolkit_version, started_at, updated_at, finished_at
  from adw.runs where project_id = $2 order by updated_at desc;
```

The function splits the rows into `active` (status `running`) and `history`
(everything else), both newest first as returned, and stamps the result with
`fetched_at`, the ISO time the rows were read. The rows are the raw `Run` type;
no label is derived on the server (see "Derived labels" below). There are no
fixtures any more; `src/data/fixtures.ts` is gone.

`src/data/index.ts` is the single boundary the screens read through. It
exports two functions and the shape the second one returns:

- `getProjects(): Promise<ProjectSummary[]>`
- `getProjectRuns(slug): Promise<ProjectRuns | null>`, where `ProjectRuns` is
  `{ project: ProjectSummary; active: Run[]; history: Run[]; fetched_at: string }`

Nothing under `src/app/` or `src/components/` imports from anywhere else for
data; the query keys and the `QueryClient` factory (next section) are cache
plumbing, not data. The Supabase client is untyped (no generated `Database` type
yet), so both functions cast rows at the boundary: `getProjects` and the project
lookup in `getProjectRuns` cast the view's rows to `ProjectSummary`, and
`getProjectRuns` casts the table's rows to `Run[]`. Generating types for the
`adw` schema is a follow-up.

Because the layout prefetch and `generateStaticParams` both call
`getProjects()`, and the page prefetch calls `getProjectRuns()` for every slug,
the database is read at **build time** as well as at request
time. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
must therefore be present for `yarn build`, which reads `.env.local` (not
`.env.development`); without them `getSupabase()` throws and the build fails
loudly instead of shipping an empty sidebar. `generateStaticParams` never
returns an empty array: under `cacheComponents` that fails the build, so an
empty project list yields one placeholder slug (`_/none`) that falls through
to `notFound()` at request time.

### The query layer

`src/data/query-keys.ts` and `src/data/query-client.ts` sit beside the boundary
and are the query layer over it: what the server and the browser share so the
two sides of the React Query cache cannot drift apart. There are no fetcher
wrappers; the boundary functions `getProjects` and `getProjectRuns` are the
`queryFn`s themselves, passed straight from `@/data` at every call site.

- `queryKeys` in `query-keys.ts`, the single home of every query key:
  `queryKeys.projects` (`["projects"]`) for the project list and
  `queryKeys.runs(slug)` (`["runs", slug]`) for a project's runs. A key is
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
  client. Both `"use cache"` state functions (the layout's `getProjectsState`,
  the page's `getRunsState`) are one-liners around it, so the two prefetches
  cannot drift apart, and a caller that needs the value (the page's not-found
  decision) reads `data` instead of searching the dehydrated queries by hash.
  (`prefetchQuery` is deprecated in React Query 5.104; `query()` is its
  replacement and, unlike `prefetchQuery`, it rejects when the fetcher throws.
  `prefetch` does not catch that on purpose: a swallowed failure would
  dehydrate an empty cache and ship the fallback silently, so the build or the
  request fails instead.) The returned object is plain JSON, as a result of a
  `"use cache"` function must be.

Each boundary function runs on the server during its prefetch (and at build
time, through it) and in the browser only on a cache miss, which the hydration
makes rare.

### Derived labels: a clock seeded with `fetched_at`

The three labels a run row shows that are not columns (`is_stale`,
`duration_label`, `since_update_label`) depend on what time it is, and under
`cacheComponents` the time is the one thing neither prerender pass may read
(details in the sections below). So they are derived in the browser, from a
ticking clock, by two small modules under `src/lib/`:

- `src/lib/run-view.ts` exports `toRunView(run, now): RunView` and
  `STALE_AFTER_MS`. It is pure (the caller passes `now` in epoch milliseconds)
  and unit-tested with fixed timestamps in `src/lib/run-view.test.ts`. A running
  run whose `updated_at` is more than `STALE_AFTER_MS` (30 minutes) before `now`
  is stale; finished runs never are. `duration_label` is `started_at` to
  `finished_at`, or to `now` while running, as `47m 26s` under an hour and
  `1h 03m` from an hour up. `since_update_label` is `just now` under 30 seconds,
  then `2m ago`, `3h ago`, `2d ago`.
- `src/lib/use-now.ts` exports `useNow(serverNow)`, a `useSyncExternalStore`
  hook over a module-level store: one `setInterval` of 30 seconds, started with
  the first subscriber and stopped with the last, whose snapshot is the current
  time. Its server snapshot is `Date.parse(serverNow)`.

`ProjectRunsView` calls `useNow(data.fetched_at)` once and maps every run
through `toRunView(run, now)` before handing `RunView`s to `RunRow` and
`RunHistory`, which are unchanged and know nothing about the clock. The seed is
what makes this safe under `cacheComponents`: during the server render and
during hydration React uses the server snapshot, so no clock is read while
prerendering and the first client render matches the server markup; right after
hydration React notices the live snapshot differs and re-renders once with it,
and the labels tick from there. The consequence to know: **the labels in the
static HTML are relative to `fetched_at`**, the moment the cached rows were
read (the build, or the last refill of the `runs:<slug>` cache entry), not the
moment the page is viewed. A page served from the cache a day later says
"updated 1d ago" in its HTML and corrects itself as soon as it hydrates.

`fetched_at` itself is `new Date().toISOString()` taken inside
`getProjectRuns`, which only ever runs inside the page's `"use cache"` scope on
the server. A clock read inside a cache scope is allowed (the value is cached
with the rows, so every visitor sees the same one until revalidation); the same
read outside one fails the prerender. That is also why `generateMetadata` goes
through the cached `getRunsState` rather than calling `getProjectRuns`
directly.

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
   scope fails the prerender of `/` (`next-prerender-current-time`). Cached,
   the stamp is the cache fill time.
2. The layout renders `<Providers>` around the whole two-pane shell and
   `<HydrationBoundary state={…}>` around the sidebar's `QueryBoundary` only,
   since `ProjectNav` is the one consumer of that state; the page renders
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
   sidebar would ship as "Loading..." in the static HTML. `"static"` returns
   before that read, and it suits this list: it changes only when something
   writes it with `setQueryData`, never on a timer. Note that
   `invalidateQueries` and `refetchQueries` skip static queries; updates go
   through `setQueryData`, or `refetch()` from the hook.

   The `QueryBoundary` around `ProjectNav` in the layout shows its fallback in
   two cases: if the server ever hands over a still-pending query, and in the
   partial-prerender shell for a slug outside `generateStaticParams`, where
   `usePathname()` cannot resolve at build time and the sidebar streams in at
   request time behind the boundary. On `/` and the pre-rendered project pages
   the sidebar is in the static HTML.

### Prefetch and hydration of a project's runs

The project page follows the same pattern, one cache entry per slug:

1. `src/app/(dashboard)/projects/[...slug]/page.tsx` has a `"use cache"`
   function `getRunsState(slug)`, tagged `runs` and `runs:<slug>`, that returns
   `prefetch(queryKeys.runs(slug), () => getProjectRuns(slug))`: the same
   one-liner shape as the layout's `getProjectsState`. The cache scope is
   required for the same reason as in the layout (React Query stamps the
   settled query with `Date.now()`), and `getProjectRuns` reads the clock once
   more for `fetched_at`, which is permitted for the same reason: inside the
   scope, the value is cached with the rows. The rows carry no derived labels;
   those are computed in the browser against a clock seeded with `fetched_at`
   (see "Derived labels" above). The rejection is not caught, as in the layout.
2. The page decides not-found from the prefetched data: it destructures
   `{ data, state }` from `getRunsState`, and `data === null` means
   `notFound()` before any boundary renders, so the data layer is read once
   per slug, not twice, and nothing searches the dehydrated queries by hash.
   `generateMetadata` reads the title through the same `getRunsState`, so the
   slug costs one database round trip, not two, and the `fetched_at` clock read
   stays inside the cache scope. `generateStaticParams` is unchanged. The caveat from
   before stands: for a slug outside `generateStaticParams` the static shell
   has already gone out with a 200 when `notFound()` runs, so the not-found
   panel streams in as a soft 404.
3. It renders `<HydrationBoundary state={state}>` around
   `<QueryBoundary fallback="Loading runs..."><ProjectRunsView slug={slug} /></QueryBoundary>`.
   That boundary does not nest inside the layout's, which is scoped to the
   sidebar; the two are siblings in effect, and React Query hydrates both
   dehydrated states into the one client `Providers` holds, so the sidebar's
   entry and the project's entry sit side by side in the same cache.
4. `src/components/ProjectRunsView.tsx` is a client component that reads
   `useSuspenseQuery` under `queryKeys.runs(slug)` with `staleTime: "static"` and
   `refetchOnMount: false` (same two reasons as the sidebar), seeds `useNow`
   with the data's `fetched_at`, maps the rows through `toRunView` and renders
   the header, the Active section (`RunRow`) and the History section
   (`RunHistory`) from the result. It renders the not-found panel for `null`
   data as a guard only; the server has already excluded that case.

One rendering detail to know when reading the served HTML of a pre-rendered
project page. The pane is in the static HTML; in the current build it is
rendered inline (the "Loading runs..." fallback occurs only inside the RSC
payload, as the boundary's `fallback` prop). An earlier build shipped the same
pane as a streamed Suspense completion instead: the fallback at the pane's
position, the rendered rows in a hidden segment a few kilobytes later, and
React's inline `$RC` script swapping them in as the document parses, before any
bundle loads and without a fetch. Both are legitimate. The streamed form is not
the query cache (the view's query is a cache hit during the server render) and
not a clock read; it is the SSR module for `ProjectRunsView` living in the
page's own client chunk, which React may still be loading when the prerender
first reaches the element, so it suspends on the lazy module reference and
completes the boundary once the chunk is in. What would be a problem is the
rows missing from the document altogether, which is what a clock read in a
client component during the prerender produces.

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
`ProjectNav` in it and the project page wraps `ProjectRunsView` in it.

### Where live updates go

Live updates write into the same cache entry. `src/data/realtime.ts` (below)
calls `queryClient.setQueryData(queryKeys.projects, ...)` on every change; the sidebar
re-renders from the cache and the layout, the boundary and the key do not
change. Because the query is static, `setQueryData` is the update path (not
`invalidateQueries`). A server side source can also refresh the prefetch with
`revalidateTag("projects")`, so the next visitor's HTML starts from fresh data.
The runs follow suit: the runs listener writes with
`queryClient.setQueryData(queryKeys.runs(slug), ...)`, and `revalidateTag("runs")` or
``revalidateTag(`runs:${slug}`)`` refreshes the page prefetch for every project
or for one.

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

`src/data/realtime.ts` exports `startRealtime(queryClient)`. It opens one
channel named `adw` with two `postgres_changes` listeners, every event on
`adw.projects` and every event on `adw.runs`. A projects event goes through
`applyProjectChange` (next section) and the result is written under
`queryKeys.projects`. A runs event is resolved to a project first: the event
names the project by `project_id` (on DELETE from `ev.old`, which carries the
primary key `(project_id, adw_id)` and nothing else under the default replica
identity), the slug is looked up in the cached project list, and an event for a
project that list does not hold is dropped silently (a private project, or no
list in the cache: nothing on screen could show it). The event then goes
through two reducers from `src/data/apply-run-change.ts`, `applyRunChange` for
the runs entry under `queryKeys.runs(slug)` and `applyRunChangeToSummaries` for
the counts in the project list, in that order, because the second one needs the
run's previous status and the event does not carry it (see "Event to cache").
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

`src/app/providers.tsx` starts it: `useEffect(() => startRealtime(queryClient),
[queryClient])`. The returned closer is the effect's cleanup, so the channel is
removed when the provider unmounts. In development React's strict mode runs
mount, cleanup, mount, so the indicator shows one connect, close and reconnect;
production connects once.

### Event to cache

`src/data/apply-project-change.ts` exports `applyProjectChange(current, ev)`,
a pure function from the cached `ProjectSummary[]` and one
`RealtimePostgresChangesPayload<Project>` to the next list. INSERT prepends
the row as a summary with zero counts and `last_run_at: null` (and is a no-op
if the id is already present); UPDATE merges the row into the matching entry,
keeping its counts, which are not table columns and so are not in the event;
DELETE removes by `ev.old.id`, the only field Supabase guarantees in `old`
unless the table's replica identity is FULL. It never mutates its input.

It is covered by `src/data/apply-project-change.test.ts` (vitest): the three
events, a duplicate insert and an update for an unknown id. Run with
`yarn test`; `vitest.config.ts` maps the `@/` alias and picks up
`src/**/*.test.ts`.

`src/data/apply-run-change.ts` holds the two reducers for an `adw.runs` event
(type `RunChange`, a `RealtimePostgresChangesPayload<Run>`), both pure and
covered by `src/data/apply-run-change.test.ts`:

- `applyRunChange(current: ProjectRuns, ev): ProjectRuns` returns the
  project's runs after the event. INSERT prepends the row to `active` when its
  status is `running`, otherwise to `history`, and is a no-op if a run with
  that `adw_id` is already in either list. UPDATE replaces the row by `adw_id`
  in place when its status stayed on the same side, and moves it between the
  lists when it did not (a run that finishes goes from `active` to the top of
  `history`; one set back to `running` goes the other way); a run in neither
  list is added as an insert would, since the event carries the full row.
  DELETE removes the `adw_id` named in `ev.old` from both lists. `fetched_at`
  is never touched: it only seeds the browser clock during hydration, and the
  live clock has taken over by the time any event arrives.
- `applyRunChangeToSummaries(current: ProjectSummary[], ev, oldStatus)`
  returns the project list with the matching project's counts moved by status
  delta: INSERT is `+1` for the new status, UPDATE is `-1` for `oldStatus` and
  `+1` for the new status, DELETE is `-1` for `oldStatus`. The counts come from
  the `project_summaries` view, and the projects listener never sees them
  change (a runs row does not touch `adw.projects`), so this is the only thing
  keeping the sidebar's numbers moving between page loads. `last_run_at` is the
  view's `max(runs.updated_at)`, so INSERT and UPDATE move it forward to
  `ev.new.updated_at` when that is later (compared as instants, since the view
  and the event may format the same moment differently); DELETE never moves it
  back. The list keeps its order so projects do not jump under the pointer.

  `oldStatus` is a parameter because the event does not have it: Supabase
  sends `old` with the primary key columns only unless the table's replica
  identity is FULL, and `adw.runs` uses the default. The realtime module reads
  the run's current status out of the runs cache with `runStatusIn(current,
adw_id)` (the third export) **before** applying `applyRunChange`, and passes
  it in. When it is unknown (the project's runs were never loaded this session,
  or the run is not among them), an UPDATE leaves the counts alone and only
  moves `last_run_at`, and a DELETE is a no-op: without the previous status
  there is no delta to apply, and guessing `+1` would inflate a count on every
  phase heartbeat. Such counts are corrected by the next catch-up or page load.
  Known gap: a run of a project whose page was not visited this session, that
  started before the page loaded and finishes while it is open, does not move
  that project's counts until then.

### Catch-up on SUBSCRIBED

Events that happen while the channel is down are never delivered, so after a
reconnect the cache must be re-read. The first connect has the same gap: the
page's entries come from a static shell whose cache may be up to 15 minutes old
(the server-side `cacheLife`), and anything that changed between that fill and
the moment the channel joined was never an event this browser saw. Both are
handled by one path: on **every** `SUBSCRIBED`, `realtime.ts` calls
`getProjects()` and writes the result under `queryKeys.projects`, then for
every runs entry in the cache (`queryClient.getQueryCache().findAll({ queryKey:
queryKeys.allRuns })`, the `["runs"]` prefix exported from `query-keys.ts`)
calls `getProjectRuns(slug)` and writes the result under `queryKeys.runs(slug)`.
There is no "was I disconnected" flag to keep in step; the first `SUBSCRIBED`
and a reconnect are the same case.

It writes with `setQueryData`, not `invalidateQueries` or `refetchQueries`:
both skip queries with `staleTime: "static"`, which every query here has, so
they would be a silent no-op. The reads go through the boundary functions
themselves, so the refreshed entries have exactly the shape the prefetch put
there. `getProjectRuns` stamps a fresh `fetched_at`, which is harmless after
hydration.

Cost: one `project_summaries` read plus one `getProjectRuns` (two reads) per
cached runs entry, per (re)connect. The cache holds the project list and the
runs of each project visited this session, so this is a handful of small reads;
in development React's strict mode connects twice on mount, so it runs twice
there. A failed catch-up is logged with `console.warn` and swallowed: the cache
stays as it was and the next event or reconnect tries again. An event that
arrives while a catch-up read is in flight is applied first and then
overwritten by the read's result, which can predate it by the round-trip time;
the next event for that row corrects it.

### The indicator

The header shows a connection indicator, `src/components/ConnectionIndicator.tsx`:
a pill with a dot and one of three labels, `connecting` (amber, pulsing), `live`
(green) or `reconnecting` (red). It has `role="status"` and `aria-live="polite"`
so a screen reader announces changes. The three states are the string enum
`ConnectionStatus` (`Connecting = "connecting"`, `Live = "live"`,
`Reconnecting = "reconnecting"`) exported from the same file; the enum value is
the rendered label, and the style table is keyed by it.

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

`src/types/adw.ts` has two sections. `Project` and `Run` mirror the database
tables column for column. `ProjectSummary` and `RunView` are view models the
screens need that the database does not store (counts, `is_stale`,
`duration_label`, `since_update_label`). `ProjectSummary` comes from the data
layer (the `project_summaries` view computes the counts); `RunView` comes from
`toRunView` in `src/lib/run-view.ts`, applied in the browser to a `Run` and the
current time.

## Routing

Project slugs are `owner/repo`, so the detail page is a catch-all segment,
`src/app/(dashboard)/projects/[...slug]/page.tsx`. `/projects/SBub/adw-toolkit`
arrives as `["SBub", "adw-toolkit"]` and is joined back into the slug. Project
pages are pre-rendered at build time from the project list
(`generateStaticParams` awaits `getProjects()`, so the database is read during
the build); a slug that is not in that list still renders on demand. The segment's `loading.tsx` is the Suspense boundary
that lets the shell prerender while the page streams in, and its `error.tsx` is
the client error boundary (message, digest, Retry) for anything the page throws.
An unknown slug calls Next's `notFound()`, which renders
`src/app/(dashboard)/not-found.tsx` inside the two-pane shell; URLs that match
no route at all fall through to the root `src/app/not-found.tsx`.

## Running it

Requires Node 24 (see `.nvmrc`) and Yarn 4.6.0 via corepack. Yarn only, never
npm or npx.

```sh
yarn install   # also installs the git hooks (lefthook) through postinstall
cp .env.example .env.development && cp .env.example .env.local   # then fill in the real values
yarn dev       # http://localhost:3000, or PORT=3101 yarn dev
```

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
runs),
`@supabase/supabase-js` for Realtime, vitest for unit tests. No component or
icon library. Light and dark themes follow the system
preference through Tailwind's `dark:` variants.
