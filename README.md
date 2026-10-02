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

## Status: unwired UI

This iteration is bare UI rendered from hand-written fixture data in
`src/data/fixtures.ts`. There is no database, no network fetching, no
environment variables, no realtime and no computed values: wherever the real
application would compute something (counts, staleness, duration labels,
"updated 2m ago"), the fixture simply contains it. The fixture "now" is
2026-10-02T12:00:00Z. The sidebar's project list already travels through a
React Query cache (see below), so a live source can update it later without
restructuring.

`src/data/index.ts` is the single boundary the screens read through. It
exports two functions:

- `getProjects(): ProjectSummary[]`
- `getProjectRuns(slug): { project; active; history } | null`

Wiring a real data source means replacing that one file while keeping those
two signatures. Nothing under `src/app/` or `src/components/` imports from
anywhere else for data.

### The query layer

`src/data/projects-query.ts` sits beside the boundary and is the query layer
over it: what the server and the browser share so the two sides of the React
Query cache cannot drift apart. It exports three things:

- `projectsKey`, the one query key (`["projects"]`) for the project list. It is
  imported wherever the list is prefetched or read; it is never built inline.
- `fetchProjects()`, the fetcher, which calls `getProjects()` through the
  boundary. It runs on the server during the prefetch, and in the browser only
  on a cache miss.
- `makeQueryClient()`, the one `QueryClient` factory for both sides. Its
  `shouldDehydrateQuery` rule includes pending queries, so a prefetch that is
  still in flight can be handed to the browser instead of fetched twice.

The run detail pages do not use the query layer; they read `getProjectRuns`
directly as server components.

### Prefetch and hydration of the sidebar

The sidebar follows the "server prefetch with hydration" pattern, so the
project list is in the server HTML at first paint and the browser never
fetches it again on mount:

1. `src/app/(dashboard)/layout.tsx` (a server component) builds a client from
   `makeQueryClient()`, awaits `prefetchQuery` under `projectsKey`, and calls
   `dehydrate()` on it. This happens inside a `"use cache"` function
   (`getProjectsState`, tagged `projects`). The scope is required: React Query
   stamps the settled query with `Date.now()`, and with `cacheComponents` on,
   reading the current time outside a cache scope fails the prerender of `/`
   (`next-prerender-current-time`). Cached, the stamp is the cache fill time.
2. The layout renders `<Providers><HydrationBoundary state={…}>` around the
   sidebar and the page. `src/app/providers.tsx` is a client component holding
   one `QueryClient` per browser session (lazy `useState` from the same
   factory). It must sit above the boundary, because the boundary writes into
   the client the provider holds.
3. `src/components/ProjectNav.tsx` is a client component that reads the list
   with `useSuspenseQuery` under the same imported `projectsKey`, with
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

   The `<Suspense>` around `ProjectNav` in the layout shows its fallback in two
   cases: if the server ever hands over a still-pending query, and in the
   partial-prerender shell for a slug outside `generateStaticParams`, where
   `usePathname()` cannot resolve at build time and the sidebar streams in at
   request time behind the boundary. On `/` and the pre-rendered project pages
   the sidebar is in the static HTML.

### Where live updates go

Nothing is live yet. When a realtime source is wired, the subscription belongs
in `ProjectNav` at the commented extension point: take the client with
`useQueryClient()`, subscribe in an effect, and on each change write the new
list with `queryClient.setQueryData(projectsKey, next)`. The sidebar re-renders
from the cache; the layout, the boundary and the key do not change. Because the
query is static, `setQueryData` is the update path (not `invalidateQueries`). A
server side source can also refresh the prefetch with
`revalidateTag("projects")`, so the next visitor's HTML starts from fresh data.

## Types

`src/types/adw.ts` has two sections. `Project` and `Run` mirror the database
tables column for column. `ProjectSummary` and `RunView` are view models the
screens need that the database does not store (counts, `is_stale`,
`duration_label`, `since_update_label`); the data layer is responsible for
producing them.

## Routing

Project slugs are `owner/repo`, so the detail page is a catch-all segment,
`src/app/(dashboard)/projects/[...slug]/page.tsx`. `/projects/SBub/adw-toolkit`
arrives as `["SBub", "adw-toolkit"]` and is joined back into the slug. Project
pages are pre-rendered at build time from the project list
(`generateStaticParams` reads `getProjects()`); a slug that is not in that list
still renders on demand. The segment's `loading.tsx` is the Suspense boundary
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

## Git hooks

`lefthook.yml` runs format (staged files, re-staged), lint, typecheck and knip
in parallel on every commit. Hooks are installed by `yarn install`; there is no
manual step. There is no pre-push hook because this iteration has no test
script; add one together with the first tests.

## Stack

Next.js 16 (App Router), React 19, TypeScript 5.9 strict, Tailwind CSS v4 via
`@tailwindcss/postcss`, TanStack React Query 5 for the sidebar's query cache.
No component or icon library. Light and dark themes follow the system
preference through Tailwind's `dark:` variants.
