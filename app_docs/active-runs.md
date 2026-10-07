# Active runs

**Specifications:**

- specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md

## Overview

The one Active query entry shared by the sidebar, `/projects` and every project page: read per request by `getActiveRunsState` in `src/data/active-runs-state.ts`, hydrated by three islands, and narrowed per screen through the helpers in `src/lib/active-runs.ts`.

## How it works

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

## Rules

- Active is one query entry for every project, `queryKeys.activeRuns`. On
  the server `getActiveRuns` is called only from `getActiveRunsState` in
  `src/data/active-runs-state.ts`: React `cache()` around
  `await connection()` and then `prefetch(queryKeys.activeRuns,
getActiveRuns)`. It is never `"use cache"` (a prerendered scope is served
  from the frozen Resume Data Cache, issue #69), and never called from a page
  body, a layout body or `generateMetadata`: only from the request-time
  islands that consume it (`SidebarActiveRuns` in the dashboard layout,
  `AllActiveRuns` on `/projects`, `ProjectActiveRuns` on the project page),
  each under a `SectionBoundary`, each rendering its own `HydrationBoundary`
  with the returned state as the ancestor of its consumer, so the entry
  exists before the consumer renders. React `cache()` makes them one read per
  request; this is the one `cache()` in the codebase (the rule against a
  `cache()` wrapper in `app_docs/project-page.md` is about `getHistory`, which Next already joins).
  `activeRunsQuery` in `src/data/active-runs-query.ts` is the one spelling of
  the Active query options (key, `queryFn: getActiveRuns`,
  `staleTime: "static"`, `refetchOnMount: false`); every reader spreads it and
  adds only a `select`. `getCompletedRuns` is called only from `getHistory`, the page's second
  `"use cache"` function, tagged `historyTag(slug)`; that tag is the contract
  with the `revalidateHistory` action and the `/api/revalidate` route handler,
  and all three take the spelling from `src/lib/history-tags.ts`. `getQueue`
  is called on the server only from `getQueueState`, a page
  `"use cache"` function (untagged: no server writer drops it), awaited
  together with `getProject` in one `Promise.all`; `generateMetadata` does
  not call it.
- Every screen narrows the one Active entry through the pure helpers in
  `src/lib/active-runs.ts` (tested in `src/lib/active-runs.test.ts`; every
  change to them goes with a test case): `activeRunsOf(runs, projectId)` is
  `ActiveRunsView`'s `select`, `activeRunCounts(runs)` is `ProjectNav`'s, and
  `groupActiveRuns(runs, projects)` groups the `/projects` overview in
  sidebar order. The sidebar's running and failed counts come only from
  `activeRunCounts`, never from `ProjectSummary.running` or `.failed` (those
  mirror the view and nothing renders them), so the sidebar, `/projects` and
  every project page show the same rows.
- Active means status `running` or `failed`; History means `completed` only.
  A failed run can be resumed, so it is live and stays in the Active entry.
  Do not move failed runs into History or add a status toggle to it.
- There is no Active tag: Active is read per request and never cached on
  the server, so a completion has nothing to drop for it. Do not add a
  `runs:` tag or a `"use cache"` scope for Active back. The tag spellings
  live in one place,
  `src/lib/history-tags.ts` (`historyTag`, `summaryPastTag`,
  `summaryTodayTag`, and `historyTags`, which returns history and
  today, history first, and never the past days tag): the pages'
  `cacheTag` calls, the action's `updateTag` calls
  and the route handler's `revalidateTag` calls all import from it, and
  `src/lib/history-tags.test.ts` pins the strings. Never write
  `history:`/`summary:` inline anywhere.
