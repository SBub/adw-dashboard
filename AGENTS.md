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
  format business values; they render what they are given.
- Fixtures satisfy the types. `src/data/fixtures.ts` is typed as
  `ProjectSummary[]` and `RunView[]`, so a fixture that drifts from the types
  fails `yarn typecheck`.
- Wiring happens at one boundary, `src/data/`. Pages import `getProjects` and
  `getProjectRuns` from `@/data` and nothing else for data. A real data source
  replaces `src/data/index.ts` while keeping those two signatures.
- The project-list query key lives only in `src/data/projects-query.ts`
  (`projectsKey`). Import it wherever the list is prefetched or read; never
  build `["projects"]` inline. A key that differs by one element is a cache
  miss, which means a second fetch in the browser.
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
  fallback. That is why the sidebar query has `staleTime: "static"`; keep it,
  and check the served HTML (not just the build) when adding client hooks to
  the prerendered shell.
- `src/types/adw.ts` keeps database-row types (`Project`, `Run`) and view
  models (`ProjectSummary`, `RunView`) in clearly separated sections. Row
  types mirror the schema column for column; view models are produced by the
  data layer.
- Server components by default; `"use client"` only where the browser must
  hold state (the History filter in `RunHistory`, the React Query provider in
  `src/app/providers.tsx`, `ProjectNav`, which reads the pathname and the
  query cache, and `ConnectionIndicator`, which subscribes to its store).
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
