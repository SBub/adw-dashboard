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
  anywhere for runs.
- No clock reads outside the cached boundary. The only argument-less
  `new Date()` / `Date.now()` in the codebase is `getActiveRuns`'s
  `fetched_at` stamp (`new Date(ms)` on a parsed input, as in
  `formatTimestamp`, is not a clock read), which
  on the server only ever executes inside the page's `"use cache"` scope (in
  the browser it runs as a `queryFn` on a cache miss and in the realtime
  catch-up, where a clock read is fine). `getQueue` reads no clock either and
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
  `src/lib/run-view.test.ts` with fixed timestamps. Every change to the label
  format goes with a test case; do not move label derivation into SQL.
- Wiring happens at one boundary, `src/data/`. Pages and components import
  `getProjects`, `getActiveRuns`, `getCompletedRuns` and `getQueue` from
  `@/data` and nothing else for data. The fifth export, `getProjectSlug(projectId)`, is
  read only by the `/api/revalidate` route handler (it turns a webhook's
  `project_id` into the slug the tags are keyed by); never call it from a
  page, a component or a `queryFn`. `getProjects`, `getActiveRuns` and
  `getQueue` are also the `queryFn`s, passed directly, with no fetcher wrapper in between (a function that only calls the
  boundary adds nothing; do not reintroduce one); `getCompletedRuns` is never
  a `queryFn`. All four are async database reads: `getProjects` reads the
  `project_summaries` view, `getActiveRuns` reads the same view by slug and
  then the `runs` table by `project_id` with `status in (running, failed)`,
  `getCompletedRuns(slug, bookmark, q)` the same with `status = completed`
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
  query layer (`query-keys.ts`, `query-client.ts`) holds keys and the client
  factory only; it never reads Supabase.
- The boundary casts the untyped Supabase rows (`ProjectSummary` for the view,
  `Run[]` for `runs`, `QueueItem[]` for `queue_items`) in `src/data/index.ts`.
  Those casts are the only place the shapes are asserted; do not add another
  in a page or component. When touching the `runs` select, keep the column
  list equal to the fields of `Run`, and `QUEUE_COLUMNS` equal to the fields
  of `QueueItem`, both in `src/types/adw.ts`.
- `getActiveRuns` is called on the server only from inside `getRunsState`,
  the page's `"use cache"` function: both the page body and `generateMetadata`
  go through it. Do not call `getActiveRuns` directly from a page, layout or
  metadata function; its `fetched_at` clock read is only allowed inside a cache
  scope, and the cached call deduplicates the read per slug. Likewise
  `getCompletedRuns` is called only from `getHistory`, the page's second
  `"use cache"` function, tagged `historyTag(slug)`; that tag is the contract
  with the `revalidateHistory` action and the `/api/revalidate` route handler,
  and all three take the spelling from `src/lib/history-tags.ts`. `getQueue`
  is called on the server only from `getQueueState`, the page's third
  `"use cache"` function (untagged: no server writer drops it), awaited
  together with `getRunsState` in one `Promise.all`; `generateMetadata` does
  not call it.
- The Queue section sits above Active through `ActiveRunsView`'s `queue` slot
  prop: the page builds it (its own `HydrationBoundary` around its own
  `QueryBoundary` around `QueueView`) and passes it in, and `ActiveRunsView`
  renders it between `PageHeader` and the Active section, never in the
  not-found branch. Do not read the queue inside `ActiveRunsView`, merge it
  into the runs entry, or share one boundary between the two. The Queue and
  Active headings arrive the same way, as the `heading` slot props of
  `QueueView` and `ActiveRunsView`, and the not-found branch renders neither.
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
  reintroduce `justify-between`.
- The project route is `projects/[owner]/[repo]`. The slug is assembled from
  `owner` and `repo` only in the page (`${owner}/${repo}`, once); no other
  file splits or joins it, and everything below the page (data boundary,
  `queryKeys.runs(slug)`, `runsTag`/`historyTag`, the bookmark,
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
  `generateStaticParams`), and `getActiveRuns()` and `getCompletedRuns()` run
  at build time for every slug (page prefetch and history scope), so
  `yarn build` needs `.env.local` with the two
  Supabase variables. A missing file fails the build on purpose; do not add a
  fallback that returns an empty list.
- Every query key is defined in `src/data/query-keys.ts` (`queryKeys.projects`,
  `queryKeys.runs(slug)`, the active runs, `queryKeys.queue(slug)`, the queued
  items, and the catch-up prefixes `queryKeys.allRuns` and
  `queryKeys.allQueues`) and imported from there: in the layout's and the
  page's prefetches, in `ProjectNav`'s, `ActiveRunsView`'s and `QueueView`'s
  `useSuspenseQuery`,
  and in every `setQueryData` the Realtime listeners do. Never build a key inline and never
  add a key literal elsewhere: a key that differs by one element is a cache
  miss, which means a second fetch in the browser. The slug is part of the runs
  key's hash; the slug is assembled once in the page; pass it as is.
- `makeQueryClient()` in `src/data/query-client.ts` is the one `QueryClient`
  factory. Every server prefetch and `Providers` build from it; do not call
  `new QueryClient()` anywhere else, or the dehydrate rule drifts between sides.
- `prefetch(queryKey, queryFn)` in the same file is the one server prefetch.
  Every `"use cache"` state function (the layout's `getProjectsState`, the
  page's `getRunsState` and `getQueueState`) is a one-liner around it that adds only its
  `cacheTag`s; do not inline `makeQueryClient` + `query()` + `dehydrate()`
  again in a page or layout, and do not add a `.catch` to the helper (an empty
  dehydrated cache ships the fallback silently). Whatever it returns must stay
  plain JSON, because it is a `"use cache"` result.
- A project page's not-found decision is read off the `data` half of
  `getRunsState`'s result (`data === null`), not from a second
  `getActiveRuns` call and not by searching the dehydrated state's queries by
  hash, and never from the queue (`getQueue` returns `[]` for an unknown
  slug); the History islands render only after that decision, so
  `getCompletedRuns` returning an empty page for an unknown slug is never shown.
- Two boundaries, never a bare `Suspense`. Any `useSuspenseQuery` is rendered
  inside `QueryBoundary` (`src/components/QueryBoundary.tsx`); any
  server-rendered section that can fail independently of its siblings (the
  page's `HistoryPagination` and `CompletedRuns`, one boundary each) is
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
  `Providers`, where the query it guards has its client.
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
- `src/types/adw.ts` keeps database-row types (`Project`, `Run`, `QueueItem`) and the view
  model (`ProjectSummary`) in clearly separated sections. Row types mirror the
  schema column for column; `ProjectSummary` is produced by the data layer.
  There is no run or queue item view model; do not add one for a label that a component can
  format from the row's own fields.
- Server components by default; `"use client"` only where the browser must
  hold state (the React Query provider in `src/app/providers.tsx`,
  `ProjectNav`, which reads the pathname and the query cache,
  `ActiveRunsView`, which reads the active runs from the query cache,
  `QueueView`, which reads the queued items from the query cache,
  `ConnectionIndicator`, which subscribes to its store, `HistorySearch`, which
  holds the search box's local text and calls the router, and
  `HistoryTransition`, which holds the one `useTransition` the box and
  `HistoryResults` share). `HistoryLinks` and
  `RunHistoryList` are server components with no state; do not put
  `"use client"` on them or give them a filter that needs one. The left and
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
- The visible text of every timestamp comes from `formatTimestamp` in
  `src/lib/format-date.ts` (`DD.MM.YYYY HH:MM UTC`, UTC getters on a parse of
  the input, unit-tested in `src/lib/format-date.test.ts`), called only by
  `Timestamp`, whose `<time>` keeps the ISO value in `dateTime`. The output
  depends on the input string alone, so server and client markup agree. Do not
  introduce `toLocaleString`, `Intl` or runtime-time-zone formatting, and every
  change to the format goes with a test case.
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
  lifetime). The Active scope (`runs:<slug>`) stays in the
  shell on purpose; the browser keeps it current.
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
  unawaited and never awaits it, nor do `getRunsState` or `generateMetadata`,
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
  deciding what an anonymous caller can do with it. `updateTag`, not
  `revalidateTag(tag, "max")`: the latter is stale-while-revalidate and the
  refresh would be served the old history (see
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md`).
- The `runs:<slug>` tag is dropped alongside `history:<slug>` on purpose: it
  is the Active prefetch scope, and on a full regeneration of the page (or a
  host whose cache handler behaves differently) leaving it would let the
  refresh (and the next visitor) hydrate an Active list that still holds the
  completed run. Know that on a resumed prerender the tag does not reach that
  scope (it is in the static shell); Realtime, the hydration rule and the
  catch-up cover Active there. Both tag spellings live in one place,
  `src/lib/history-tags.ts` (`historyTag`, `runsTag`, and `historyTags`, which
  returns both): the page's `cacheTag` calls, the action's `updateTag` calls
  and the route handler's `revalidateTag` calls all import from it, and
  `src/lib/history-tags.test.ts` pins the strings. Never write
  `history:`/`runs:` inline anywhere.
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
  wiring layer around them. `applyRunChange` holds the Active list only and
  removes a run whose new status is `completed`; do not make it keep or
  re-add completed rows. `applyQueueChange` holds state `queued` only and
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
  identity. Never read another field off `ev.old`. The previous status a
  counts delta (and `isHistoryChange`) needs is read from the Active cache
  with `runStatusIn` BEFORE the entry is rewritten, and passed explicitly;
  keep that order when touching `applyRunEvent`, and keep the
  `onHistoryChange` call last, after both `setQueryData` writes. Likewise the
  previous queue membership is read with `queuedIn` BEFORE the queue entry is
  rewritten in `applyQueueEvent`, and passed to `applyQueueChangeToSummaries`.
- The catch-up read runs on every `SUBSCRIBED` (first connect and every
  reconnect, one path, no flag) and writes with `setQueryData` through the
  boundary functions (`getProjects`, `getActiveRuns`, `getQueue`). It must
  never throw out of the socket callback: failures are `console.warn`ed and
  swallowed. Enumerate the cached runs entries with `queryKeys.allRuns` and
  the cached queue entries with `queryKeys.allQueues`, the prefixes in
  `query-keys.ts`, not an inline `["runs"]` or `["queue"]`. It never reads
  history.
- One channel, named `adw`, opened by `startRealtime` and started only from
  `Providers`, which is also the only place the `onHistoryChange` option is
  wired (it needs `useRouter`). All three listeners (projects, runs,
  queue_items) live on that channel; do not open a second one or start it from another component.
