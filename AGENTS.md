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

- Components take typed props only. They never fetch, compute, count or
  format business values; they render what they are given. The one container
  that turns rows into view models is `ProjectRunsView`, and it does so only
  by calling the pure `toRunView`; `RunRow`, `RunHistory` and every other leaf
  take a finished `RunView`.
- No clock reads anywhere except two places: `useNow` in `src/lib/use-now.ts`
  (the browser's ticking clock) and `getProjectRuns`'s `fetched_at` stamp,
  which only ever executes inside the page's `"use cache"` scope. Never call
  `Date.now()` or `new Date()` in a component, a hook body, a `queryFn` outside
  a cache scope, `generateMetadata` or `generateStaticParams`; under
  `cacheComponents` the server form fails the build and the client form
  silently drops the component out of the static HTML.
- `toRunView` in `src/lib/run-view.ts` is pure (takes `now` as an argument,
  reads no clock) and unit-tested in `src/lib/run-view.test.ts` with fixed
  timestamps. Every change to a label format or to `STALE_AFTER_MS` goes with
  a test case; do not move label derivation into a component or into SQL.
- `fetched_at` on `ProjectRuns` is the hydration seed: `useNow(data.fetched_at)`
  returns it on the server and during hydration, and the live clock after.
  Keep it in the boundary's return value, keep it an ISO string (it travels
  through the dehydrated cache as JSON) and always pass it to `useNow`; a hook
  seeded with anything else produces a hydration mismatch or a clock read in
  the prerender.
- Wiring happens at one boundary, `src/data/`. Pages and components import
  `getProjects` and `getProjectRuns` from `@/data` and nothing else for data;
  those two functions are also the `queryFn`s, passed directly, with no
  fetcher wrapper in between (a function that only calls the boundary adds
  nothing; do not reintroduce one). Both are async database reads:
  `getProjects` reads the `project_summaries` view, `getProjectRuns` reads the
  same view by slug and then the `runs` table by `project_id`. Changing what is
  read means changing `src/data/index.ts` while keeping those two signatures,
  and nothing elsewhere. The query layer (`query-keys.ts`, `query-client.ts`)
  holds keys and the client factory only; it never reads Supabase.
- The boundary casts the untyped Supabase rows (`ProjectSummary` for the view,
  `Run[]` for the table) in `src/data/index.ts`. Those casts are the only place
  the shapes are asserted; do not add another in a page or component. When
  touching the `runs` select, keep the column list equal to the fields of
  `Run`, in `src/types/adw.ts`.
- `getProjectRuns` is called on the server only from inside `getRunsState`,
  the page's `"use cache"` function: both the page body and `generateMetadata`
  go through it. Do not call `getProjectRuns` directly from a page, layout or
  metadata function; its `fetched_at` clock read is only allowed inside a cache
  scope, and the cached call deduplicates the read per slug.
- `generateStaticParams` in `src/app/(dashboard)/projects/[...slug]/page.tsx`
  must never return an empty array. Under `cacheComponents` an empty result
  fails the build (nothing to prerender the segment with), so the empty-list
  branch returns the placeholder `{ slug: ["_", "none"] }`, which the page
  turns into `notFound()` at request time. Keep that guard when touching the
  function.
- `getProjects()` runs at build time (layout prefetch and
  `generateStaticParams`), and `getProjectRuns()` runs at build time for every
  slug (page prefetch), so `yarn build` needs `.env.local` with the two
  Supabase variables. A missing file fails the build on purpose; do not add a
  fallback that returns an empty list.
- Every query key is defined in `src/data/query-keys.ts` (`queryKeys.projects`,
  `queryKeys.runs(slug)`) and imported from there: in the layout's and the
  page's prefetch, in `ProjectNav`'s and `ProjectRunsView`'s `useSuspenseQuery`,
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
  `getProjectRuns` call and not by searching the dehydrated state's queries by
  hash. Keep it that way when the runs become a database read, or every
  unknown slug costs two reads.
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
  hook with a data-derived `getServerSnapshot` (the pattern `useNow` uses) is
  how a client component may depend on the time without that read. When you
  check, know that a pre-rendered project page may legitimately carry the runs
  pane either inline or as a streamed Suspense completion (fallback plus
  hidden segment plus `$RC` swap in the same document); the latter is the
  page's cold SSR client chunk, not a cache miss or a clock read. See README,
  "Prefetch and hydration of a project's runs".
- `src/types/adw.ts` keeps database-row types (`Project`, `Run`) and view
  models (`ProjectSummary`, `RunView`) in clearly separated sections. Row
  types mirror the schema column for column; `ProjectSummary` is produced by
  the data layer and `RunView` by `toRunView` in `src/lib/run-view.ts`.
- Server components by default; `"use client"` only where the browser must
  hold state (the History filter in `RunHistory`, the React Query provider in
  `src/app/providers.tsx`, `ProjectNav`, which reads the pathname and the
  query cache, `ProjectRunsView`, which reads the runs from the query cache
  and the clock through `useNow`, and `ConnectionIndicator`, which subscribes
  to its store). `src/lib/use-now.ts` is `"use client"` too; `src/lib/run-view.ts`
  is plain and importable from anywhere.
- `Timestamp` renders ISO strings by substring on purpose so server and client
  markup agree. Do not introduce locale or timezone formatting in components.
- The connection status in `src/components/ConnectionIndicator.tsx` is written
  only through its exported `setConnectionStatus`, with a `ConnectionStatus`
  enum member, never a bare string. Do not export the `status` variable, add a
  second setter, or mirror the value into React state or the query cache; the
  channel status callback in `src/data/realtime.ts` is its one caller.

## Realtime and Supabase

- The Supabase client is only ever obtained via `getSupabase()` from
  `src/data/supabase.ts`. Never call `createClient` anywhere else; a second
  client is a second websocket.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are
  public by design (browser bundle, RLS-limited). The secret / service role
  key must never be added to this repo, to any `.env*` file in it, or to any
  variable with a `NEXT_PUBLIC_` prefix. `.env.example` is tracked with
  placeholders; `.env.development` (dev) and `.env.local` (all modes,
  including build and start) hold the real values and are gitignored.
- `applyProjectChange` in `src/data/apply-project-change.ts` is pure (no
  cache, client, clock or mutation) and unit-tested. Keep it that way: new
  event handling goes into the function and gets a test case; the realtime
  module stays a thin wiring layer around it.
- One channel, named `adw`, opened by `startRealtime` and started only from
  `Providers`. Add further listeners (runs) to that channel, do not open a
  second one or start it from another component.
