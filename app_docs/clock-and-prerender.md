# Clock reads and prerendering

**Specifications:**

- specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md

## Overview

Why no component reads the clock under `cacheComponents`, the two clock reads the codebase allows, and how labels such as a run's duration are derived from timestamps alone (`src/lib/run-view.ts`).

## How it works

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
pass may read (details in `app_docs/data-boundary.md` and `app_docs/active-runs.md`), so a clock-dependent label needs
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
day it yields is passed down as an argument (see `app_docs/summary.md`).

## Rules

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
  same document), not inline in the shell. See `app_docs/active-runs.md`, "Prefetch and
  hydration of the Active runs".
