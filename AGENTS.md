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

## Architecture

- Components take typed props only. They never fetch, compute or count
  business values; they render what they are given. `RunRow` and `RunHistory`
  take `Run` rows as stored (the page's `HistorySection` is the one async
  component that awaits data, and it lives in the page file, not under
  `src/components/`). The one formatting a component may do is call a
  pure helper from `src/lib/` on the row's own fields (`RunRow` calls
  `durationLabel(run.started_at, run.finished_at)`); no view model is built
  anywhere for runs.
- No clock reads outside the cached boundary. The only `new Date()` /
  `Date.now()` in the codebase is `getActiveRuns`'s `fetched_at` stamp, which
  on the server only ever executes inside the page's `"use cache"` scope (in
  the browser it runs as a `queryFn` on a cache miss and in the realtime
  catch-up, where a clock read is fine). `getCompletedRuns` reads no clock and
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
  `src/lib/run-view.test.ts` with fixed timestamps. Every change to the label
  format goes with a test case; do not move label derivation into SQL.
- Wiring happens at one boundary, `src/data/`. Pages and components import
  `getProjects`, `getActiveRuns` and `getCompletedRuns` from `@/data` and
  nothing else for data. The first two are also the `queryFn`s, passed
  directly, with no fetcher wrapper in between (a function that only calls the
  boundary adds nothing; do not reintroduce one); `getCompletedRuns` is never
  a `queryFn`. All three are async database reads: `getProjects` reads the
  `project_summaries` view, `getActiveRuns` reads the same view by slug and
  then the `runs` table by `project_id` with `status in (running, failed)`,
  `getCompletedRuns` the same with `status = completed`. Changing what is read
  means changing `src/data/index.ts` while keeping those signatures, and
  nothing elsewhere; pagination of history goes into `getCompletedRuns`. The
  query layer (`query-keys.ts`, `query-client.ts`) holds keys and the client
  factory only; it never reads Supabase.
- The boundary casts the untyped Supabase rows (`ProjectSummary` for the view,
  `Run[]` for the table) in `src/data/index.ts`. Those casts are the only place
  the shapes are asserted; do not add another in a page or component. When
  touching the `runs` select, keep the column list equal to the fields of
  `Run`, in `src/types/adw.ts`.
- `getActiveRuns` is called on the server only from inside `getRunsState`,
  the page's `"use cache"` function: both the page body and `generateMetadata`
  go through it. Do not call `getActiveRuns` directly from a page, layout or
  metadata function; its `fetched_at` clock read is only allowed inside a cache
  scope, and the cached call deduplicates the read per slug. Likewise
  `getCompletedRuns` is called only from `getHistory`, the page's second
  `"use cache"` function, tagged `history:<slug>`; that tag is the contract
  with the `revalidateHistory` action, so keep the two spellings identical.
- `generateStaticParams` in `src/app/(dashboard)/projects/[...slug]/page.tsx`
  must never return an empty array. Under `cacheComponents` an empty result
  fails the build (nothing to prerender the segment with), so the empty-list
  branch returns the placeholder `{ slug: ["_", "none"] }`, which the page
  turns into `notFound()` at request time. Keep that guard when touching the
  function.
- `getProjects()` runs at build time (layout prefetch and
  `generateStaticParams`), and `getActiveRuns()` and `getCompletedRuns()` run
  at build time for every slug (page prefetch and history scope), so
  `yarn build` needs `.env.local` with the two
  Supabase variables. A missing file fails the build on purpose; do not add a
  fallback that returns an empty list.
- Every query key is defined in `src/data/query-keys.ts` (`queryKeys.projects`,
  `queryKeys.runs(slug)`, the active runs) and imported from there: in the
  layout's and the page's prefetch, in `ProjectNav`'s and `ActiveRunsView`'s
  `useSuspenseQuery`,
  and in every `setQueryData` the Realtime listeners do. Never build a key inline and never
  add a key literal elsewhere: a key that differs by one element is a cache
  miss, which means a second fetch in the browser. The slug is part of the runs
  key's hash, so join it the same way on both sides (`parts.join("/")`, as the
  page does).
- `makeQueryClient()` in `src/data/query-client.ts` is the one `QueryClient`
  factory. Every server prefetch and `Providers` build from it; do not call
  `new QueryClient()` anywhere else, or the dehydrate rule drifts between sides.
- `prefetch(queryKey, queryFn)` in the same file is the one server prefetch.
  Every `"use cache"` state function (the layout's `getProjectsState`, the
  page's `getRunsState`) is a one-liner around it that adds only its
  `cacheTag`s; do not inline `makeQueryClient` + `query()` + `dehydrate()`
  again in a page or layout, and do not add a `.catch` to the helper (an empty
  dehydrated cache ships the fallback silently). Whatever it returns must stay
  plain JSON, because it is a `"use cache"` result.
- A project page's not-found decision is read off the `data` half of
  `getRunsState`'s result (`data === null`), not from a second
  `getActiveRuns` call and not by searching the dehydrated state's queries by
  hash; `HistorySection` renders only after that decision, so
  `getCompletedRuns` returning `[]` for an unknown slug is never shown.
- Any `useSuspenseQuery` is rendered inside `QueryBoundary`
  (`src/components/QueryBoundary.tsx`), never a bare `Suspense`. Without an
  error boundary a failed fetch escapes to the segment's `error.tsx` and
  unmounts the whole shell; without `onReset={reset}` from
  `useQueryErrorResetBoundary` the Retry button re-reads the cached error.
  `QueryBoundary` sits inside `Providers`, where the query it guards has its
  client.
- `queryClient.prefetchQuery` and `prefetchInfiniteQuery` are deprecated in
  the installed React Query; use `queryClient.query()` and `infiniteQuery()`.
  Do not swallow their rejection on the server prefetch: an empty dehydrated
  cache ships the fallback silently, a thrown error fails the build loudly.
- `cacheComponents` treats `Date.now()` as IO in both prerender passes. On the
  server, anything that reads the clock (React Query's `query()` and
  `dehydrate` do) must sit inside a `"use cache"` function or the build fails.
  In client components it does not fail the build: the first clock read
  silently aborts the client prerender and the component ships as its Suspense
  fallback. That is why the sidebar and runs queries have
  `staleTime: "static"`; keep it, and check the served HTML (not just the
  build) when adding client hooks to the prerendered shell: the run rows (an
  `adw_id` in a `<code>`) must be in the document. A `useSyncExternalStore`
  hook with a data-derived `getServerSnapshot` (`fetched_at`) is how a client
  component could depend on the time without that read; that is the shape
  issue #3 proposes, at the leaf level. When you
  check, know that a pre-rendered project page may legitimately carry the runs
  pane either inline or as a streamed Suspense completion (fallback plus
  hidden segment plus `$RC` swap in the same document); the latter is the
  page's cold SSR client chunk, not a cache miss or a clock read. See README,
  "Prefetch and hydration of a project's runs".
- `src/types/adw.ts` keeps database-row types (`Project`, `Run`) and the view
  model (`ProjectSummary`) in clearly separated sections. Row types mirror the
  schema column for column; `ProjectSummary` is produced by the data layer.
  There is no run view model; do not add one for a label that a component can
  format from the row's own fields.
- Server components by default; `"use client"` only where the browser must
  hold state (the React Query provider in `src/app/providers.tsx`,
  `ProjectNav`, which reads the pathname and the query cache,
  `ActiveRunsView`, which reads the active runs from the query cache, and
  `ConnectionIndicator`, which subscribes to its store). `RunHistory` is a
  server component with no state; do not put `"use client"` back on it or
  give it a filter that needs one. `src/lib/run-view.ts` is plain and
  importable from anywhere.
- `Timestamp` renders ISO strings by substring on purpose so server and client
  markup agree. Do not introduce locale or timezone formatting in components.
- The connection status in `src/components/ConnectionIndicator.tsx` is written
  only through its exported `setConnectionStatus`, with a `ConnectionStatus`
  enum member, never a bare string. Do not export the `status` variable, add a
  second setter, or mirror the value into React state or the query cache; the
  channel status callback in `src/data/realtime.ts` is its one caller.

## Runs: active and history

- Active means status `running` or `failed`; History means `completed` only.
  A failed run can be resumed, so it is live and stays in the Active entry.
  Do not move failed runs into History or add a status toggle to it.
- History is server-rendered and never enters the React Query cache. It is
  read by `getCompletedRuns` inside the page's `getHistory` (`"use cache"`,
  `cacheTag(\`history:${slug}\`)`) and rendered by the async `HistorySection`under its own`Suspense`. No `queryKeys`entry, no`useSuspenseQuery`, no
`setQueryData`, no realtime reducer and no catch-up read may touch completed
  runs. If a component needs history rows, it gets them as props from the
  page.
- Any `"use cache"` scope that must reflect on-demand revalidation on a
  prerendered route awaits `connection()` (from `next/server`) before the
  cached call, as `HistorySection` does before `getHistory`. A scope that is
  prerendered into the static shell is read from the shell's embedded Resume
  Data Cache on every resumed request, frozen at build time, and no
  `updateTag`, `revalidateTag` or `revalidatePath` reaches it; a request-time
  hole is resolved from the live cache handler and keeps its lifetime (see
  README, "What is prerendered and what is not"). The `await connection()`
  stays the first statement of `HistorySection`, the `Suspense` stays around
  it, and `getHistory` stays out of the page body and `generateMetadata`,
  where it would be prerendered again. Do not swap it
  for a short `cacheLife` (`expire` under 5 minutes also makes a hole but
  gives up the long lifetime). The Active scope (`runs:<slug>`) stays in the
  shell on purpose; the browser keeps it current.
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
  true, and `Providers` does
  `revalidateHistory(slug).then(() => router.refresh())`. Never call
  `router.refresh()` before the action resolves (the history scope would still
  be cached and the refresh would re-render the old list), and never skip the
  refresh (the action's own re-render is not the contract). The action's
  rejection is swallowed; do not surface it in the UI.
- `src/app/actions/revalidate-history.ts` is a public endpoint. It validates
  the slug against `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$` and returns early
  otherwise; for a valid slug it calls `updateTag(\`history:${slug}\`)`and`updateTag(\`runs:${slug}\`)`and does nothing else. Do not add a database
read or write, a parameter beyond the slug, a return value, or a third tag
without deciding what an anonymous caller can do with it.`updateTag`, not
`revalidateTag(tag, "max")`: the latter is stale-while-revalidate and the
refresh would be served the old history (see
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md`).
- The `runs:<slug>` tag is dropped alongside `history:<slug>` on purpose: it
  is the Active prefetch scope, and on a full regeneration of the page (or a
  host whose cache handler behaves differently) leaving it would let the
  refresh (and the next visitor) hydrate an Active list that still holds the
  completed run. Know that on a resumed prerender the tag does not reach that
  scope (it is in the static shell); Realtime, the hydration rule and the
  catch-up cover Active there. Keep the two `cacheTag` spellings in the page
  equal to the two `updateTag` spellings in the action.
- Hydration after a refresh is safe because React Query only overwrites an
  existing entry when the incoming `dataUpdatedAt` is strictly newer
  (`src/data/hydration.test.ts` pins this against the installed
  `@tanstack/query-core`). Do not work around hydration with a key change or
  a manual `setQueryData` in the page; if that test ever fails after an
  upgrade, read `hydration.js` again before touching the move.
- A DELETE of a run the Active list does not hold counts as a history change
  (`isHistoryChange(ev, undefined)` is true) and runs the same action. Do not
  special-case it.
- An unwatched completion (no browser had the channel open) leaves that
  project's History stale until the cache lifetime. That is known; the fix is
  a database webhook into a Route Handler using
  `revalidateTag(tag, { expire: 0 })`, not a client-side poll.

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
  variable with a `NEXT_PUBLIC_` prefix. `.env.example` is tracked with
  placeholders; `.env.development` (dev) and `.env.local` (all modes,
  including build and start) hold the real values and are gitignored.
- Every Realtime write to the query cache goes through a pure, unit-tested
  reducer and `setQueryData`: `applyProjectChange` in
  `src/data/apply-project-change.ts` for `adw.projects` events,
  `applyRunChange` and `applyRunChangeToSummaries` in
  `src/data/apply-run-change.ts` for `adw.runs` events, with `isHistoryChange`
  (same file) deciding whether to fire `onHistoryChange`. The reducers take no
  cache, client or clock and never mutate their input; new event handling goes
  into a reducer and gets a test case, and `src/data/realtime.ts` stays a thin
  wiring layer around them. `applyRunChange` holds the Active list only and
  removes a run whose new status is `completed`; do not make it keep or
  re-add completed rows. Never `invalidateQueries` or `refetchQueries` from
  the realtime module: every query here is `staleTime: "static"` and both skip
  static queries silently.
- Every updater passed to `setQueryData` from the realtime module has the form
  `current => current && reducer(current, ev)`. Never default an absent entry
  (`current = []`, `current ?? {...}`): an entry that is not in the cache must
  stay absent, or a single event seeds a one-row list that looks complete and
  is not.
- A runs event names its project by `project_id` only. Resolve the slug from
  the cached project list (`queryClient.getQueryData(queryKeys.projects)`) and
  drop the event when the project is not there; never fetch to resolve it.
- `ev.old` carries only the primary key columns (`adw.runs`: `project_id`,
  `adw_id`; `adw.projects`: `id`), because the tables use the default replica
  identity. Never read another field off `ev.old`. The previous status a
  counts delta (and `isHistoryChange`) needs is read from the Active cache
  with `runStatusIn` BEFORE the entry is rewritten, and passed explicitly;
  keep that order when touching `applyRunEvent`, and keep the
  `onHistoryChange` call last, after both `setQueryData` writes.
- The catch-up read runs on every `SUBSCRIBED` (first connect and every
  reconnect, one path, no flag) and writes with `setQueryData` through the
  boundary functions (`getProjects`, `getActiveRuns`). It must never throw
  out of the socket callback: failures are `console.warn`ed and swallowed.
  Enumerate the cached runs entries with `queryKeys.allRuns`, the prefix in
  `query-keys.ts`, not an inline `["runs"]`. It never reads history.
- One channel, named `adw`, opened by `startRealtime` and started only from
  `Providers`, which is also the only place the `onHistoryChange` option is
  wired (it needs `useRouter`). Both listeners (projects, runs) live on that
  channel; do not open a second one or start it from another component.
