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

## Data: projects from the database, runs from fixtures

The project list is live. `getProjects()` reads the `adw.project_summaries`
view of the toolkit's Supabase project (one row per project with its
`running`, `completed` and `failed` counts and `last_run_at`, computed in the
database, see the toolkit's `supabase/README.md`). The view runs with
`security_invoker`, so the publishable key sees only public projects. The list
is ordered by `last_run_at` descending with projects that have no runs yet
last. Realtime (below) then patches that list in the browser as `adw.projects`
rows change.

The runs are still hand-written fixtures in `src/data/fixtures.ts`.
`getProjectRuns(slug)` resolves the project from the fixture project list and
returns the fixture runs for it; a real project without a fixture entry gets
`null`, which the page renders as not found. Wherever the real application
would compute a run label (staleness, duration, "updated 2m ago") the fixture
simply contains it, with a fixture "now" of 2026-10-02T12:00:00Z. Replacing
the runs fetcher with a database read is the next step, and the fixture
project list goes away with it.

`src/data/index.ts` is the single boundary the screens read through. It
exports two functions:

- `getProjects(): Promise<ProjectSummary[]>`
- `getProjectRuns(slug): { project; active; history } | null`

Nothing under `src/app/` or `src/components/` imports from anywhere else for
data. The Supabase client is untyped (no generated `Database` type yet), so
`getProjects` casts the view's rows to `ProjectSummary[]` at the boundary;
generating types for the `adw` schema is a follow-up.

Because the layout prefetch and `generateStaticParams` both call
`getProjects()`, the database is read at **build time** as well as at request
time. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
must therefore be present for `yarn build`, which reads `.env.local` (not
`.env.development`); without them `getSupabase()` throws and the build fails
loudly instead of shipping an empty sidebar. `generateStaticParams` never
returns an empty array: under `cacheComponents` that fails the build, so an
empty project list yields one placeholder slug (`_/none`) that falls through
to `notFound()` at request time.

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
   `makeQueryClient()`, awaits `queryClient.query()` under `projectsKey`, and
   calls `dehydrate()` on it. (`prefetchQuery` is deprecated in React Query
   5.104; `query()` is its replacement and, unlike `prefetchQuery`, it rejects
   when the fetcher throws. The layout does not catch that on purpose: a
   swallowed failure would dehydrate an empty cache and ship the sidebar's
   fallback silently, so the build or the request fails instead.) This happens
   inside a `"use cache"` function (`getProjectsState`, tagged `projects`). The
   scope is required: React Query stamps the settled query with `Date.now()`,
   and with `cacheComponents` on, reading the current time outside a cache
   scope fails the prerender of `/` (`next-prerender-current-time`). Cached,
   the stamp is the cache fill time.
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

   The `QueryBoundary` around `ProjectNav` in the layout shows its fallback in
   two cases: if the server ever hands over a still-pending query, and in the
   partial-prerender shell for a slug outside `generateStaticParams`, where
   `usePathname()` cannot resolve at build time and the sidebar streams in at
   request time behind the boundary. On `/` and the pre-rendered project pages
   the sidebar is in the static HTML.

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
inside `Providers`, where the query it guards has its client. The runs list can
use it once it moves onto the query layer.

### Where live updates go

Live updates write into the same cache entry. `src/data/realtime.ts` (below)
calls `queryClient.setQueryData(projectsKey, ...)` on every change; the sidebar
re-renders from the cache and the layout, the boundary and the key do not
change. Because the query is static, `setQueryData` is the update path (not
`invalidateQueries`). A server side source can also refresh the prefetch with
`revalidateTag("projects")`, so the next visitor's HTML starts from fresh data.

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
channel named `adw` and listens to `postgres_changes` for every event on
`adw.projects`. Each event goes through `applyProjectChange` (next section) and
the result is written to the cache under `projectsKey` with `setQueryData`.
The channel's subscribe callback is the one writer of the connection
indicator: `SUBSCRIBED` sets `Live`, `CHANNEL_ERROR` and `TIMED_OUT` set
`Reconnecting`, `CLOSED` sets `Connecting`. The function returns a closer that
removes the channel and resets the indicator to `Connecting`. A runs listener
will be added to the same channel later (there is a one-line comment where).

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
`duration_label`, `since_update_label`); the data layer is responsible for
producing them.

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
`@tailwindcss/postcss`, TanStack React Query 5 for the sidebar's query cache,
`@supabase/supabase-js` for Realtime, vitest for unit tests. No component or
icon library. Light and dark themes follow the system
preference through Tailwind's `dark:` variants.
