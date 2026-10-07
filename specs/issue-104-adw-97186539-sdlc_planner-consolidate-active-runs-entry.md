# Bug: Active runs: one shared cache entry, shown on /projects and filtered per project

## Metadata

issue_number: `104`
adw_id: `97186539`
issue_json: `{"number":104,"title":"Active runs: one shared cache entry, shown on /projects and filtered per project","body":"Goal: /projects shows every active run (running and failed-resumable) across all projects, and the per-project pages and the sidebar counts read the same data, so they cannot disagree. Closes #62. Closes #69. (Full body: one query entry queryKeys.activeRuns; per-request streamed server prefetch in the dashboard layout after connection(), not in \"use cache\"; /projects lists active runs grouped by project; project pages read the same entry with a per-project select; sidebar running/failed counts derived from the entry; catch-up re-reads the one entry; tests in apply-run-change.test.ts, hydration.test.ts, a select/counts test and an e2e journey.)"}`

## Bug Description

Two live caches describe the same runs and are fed independently:

- the per-project Active entry `queryKeys.runs(slug)` (`ActiveRuns { project, active, fetched_at }`), prefetched by the project page's `"use cache"` scope `getRunsState` (tags `runs`, `runs:<slug>`) and patched by `applyRunChange`;
- the sidebar's `queryKeys.projects` entry, whose `running` and `failed` counts come from `adw.project_summaries` and are patched by status delta in `applyRunChangeToSummaries`.

Symptoms:

- **#62**: a run completes with a page open; Active and the sidebar count disagree. The counts reducer needs the previous status, which it reads from the per-slug runs entry (`runStatusIn`); when that project's page was never opened in the session, the previous status is unknown and the running/failed counts are left as they were, so the sidebar keeps showing `1 running` after the run is gone (or never shows the new one correctly).
- **#69**: a run starts for a project whose page was never opened; the runs listener's updater is `current => current && applyRunChange(...)`, the entry is absent, so the event is dropped. When the page is then opened, `getRunsState` serves the Active list from the prerendered static shell (its scope's Resume Data Cache is frozen at build time, `updateTag("runs:<slug>")` does not reach it) and the new run is missing until a catch-up happens to cover that slug.
- `/projects` shows a "Select a project" placeholder; there is no place that lists every active run.

Expected: one entry with every active run of every visible project, hydrated per request, patched by one reducer; `/projects` lists it grouped by project, each project page filters it, and the sidebar running/failed counts are counted from it, so all three always agree.

## Problem Statement

Replace the per-project Active entries and the separately patched running/failed counters with one all-projects Active entry (`queryKeys.activeRuns`) that is read once per request (never frozen in the static shell), hydrated before any consumer renders, patched by one reducer, re-read on every SUBSCRIBED, and read by `/projects`, the project page and the sidebar.

## Solution Statement

1. **Data boundary**: `getActiveRuns()` (no argument) reads every active run of every visible project (`adw.runs`, `status in (running, failed)`, `updated_at desc`) and returns `ActiveRuns { active: Run[]; fetched_at: string }` (no `project` any more). The per-slug `getActiveRuns(slug)` is removed (nothing would call it; knip would fail). `fetched_at` is kept for issue #3.
2. **Query layer**: `queryKeys.activeRuns` (`["active-runs"]`) replaces `queryKeys.runs(slug)` and `queryKeys.allRuns`. `activeRunsQuery` (React Query `queryOptions`: key, `queryFn: getActiveRuns`, `staleTime: "static"`, `refetchOnMount: false`) in a new client-safe module `src/data/active-runs-query.ts`, so the key and the reader are defined once and every `useSuspenseQuery` spreads it.
3. **Per-request prefetch**: a new server-only module `src/data/active-runs-state.ts` exports `getActiveRunsState`, a React `cache()`-wrapped function that `await connection()` and then returns `prefetch(queryKeys.activeRuns, getActiveRuns)`. Not `"use cache"`: it is never frozen into the shell. React `cache()` makes every island that calls it in one request share one read and one dehydrated state (layout and page are one RSC request). Each consumer island renders its own `HydrationBoundary` with that state as its ancestor, so a consumer never renders before the entry exists (a sibling boundary resolving later would otherwise let `useSuspenseQuery` miss and fetch during SSR). Hydrating the same state twice is a no-op the second time (equal `dataUpdatedAt`, pinned in `hydration.test.ts`).
4. **Layout**: the sidebar's `ProjectNav` moves into a request-time island `SidebarActiveRuns` (under a `SectionBoundary`, inside the existing projects `HydrationBoundary`): it awaits `getActiveRunsState()` and renders `<HydrationBoundary state><QueryBoundary><ProjectNav /></QueryBoundary></HydrationBoundary>`. The `Projects` heading and the connection pill stay static.
5. **Pure helpers** in a new `src/lib/active-runs.ts` (tested): `activeRunsOf(runs, projectId)` (the per-project select), `activeRunCounts(runs)` (running and failed per `project_id`), `groupActiveRuns(runs, projects)` (`[{ project, runs }]` in sidebar order, projects with no active run omitted, runs of a project not in the list dropped).
6. **/projects** renders a static `SectionHeading` ("Active", copy in the page) and an island (`SectionBoundary` around an async component awaiting `getActiveRunsState()`, then `HydrationBoundary` and `QueryBoundary`) around a new client component `ActiveRunsOverview`, which reads `activeRunsQuery` and `queryKeys.projects`, calls `groupActiveRuns`, and renders per project a heading (`display_name`, linking to `/projects/<slug>`) and `RunRow`s (`variant="active"`), or "No runs in progress." when empty.
7. **Project page**: not-found, header and metadata come from a new page-level `"use cache"` `getProject(slug)` (tag `projects`) that finds the slug in `getProjects()`. `getRunsState` and `runsTag` go away. `PageHeader` is rendered by the page (server). Active is an island (`SectionBoundary` around an async `ProjectActiveRuns` that awaits `getActiveRunsState()`, then `HydrationBoundary`, `QueryBoundary`, `ActiveRunsView`). `ActiveRunsView` takes `projectId`, `slug`, `heading`, `queue`, reads `useSuspenseQuery({ ...activeRunsQuery, select: data => activeRunsOf(data.active, projectId) })`, and no longer renders the header or a not-found branch. The queue slot, its boundaries and `getQueueState` are unchanged.
8. **Realtime**: `applyRunEvent` reads the previous status with `runStatusIn(activeRuns entry, projectId, adwId)`, patches only `queryKeys.activeRuns`, then the project list, then fires `onHistoryChange`. `applyRunChange` matches runs on `(project_id, adw_id)` (the primary key; `adw_id` is only unique per project). `applyRunChangeToSummaries` stops touching `running` and `failed` (they are counted from the entry now) and keeps `completed` (+1 on an INSERT of a completed row, and on an UPDATE from a known active status to completed) and `last_run_at`. `catchUp` writes `getActiveRuns()` under `queryKeys.activeRuns` unconditionally (it is a complete list, not a one-row seed); the queue loop is unchanged.
9. **Tags**: `runsTag` is deleted; `historyTags(slug)` returns `[historyTag(slug), summaryTodayTag()]`. The action and route handler iterate it unchanged.
10. **Docs**: README, AGENTS.md and `.adw/project.md` updated to describe the new design.

## Steps to Reproduce

1. `yarn build && yarn start` (on `$PORT` from `.ports.env`), open `/projects/<slug-A>` in a browser and wait for the pill to say `live`.
2. Start a run for project B (never opened in this tab). Observe: the sidebar's `running` count for B does not change reliably (the counts delta has no previous status for a later UPDATE), and opening `/projects/<slug-B>` shows Active without the run when the page is served from the prerendered shell (#69).
3. Let the run for B complete while `/projects/<slug-A>` is open: B's sidebar `running` count stays at `1` (UPDATE with unknown previous status leaves counts alone) (#62).
4. Open `/projects`: only "Select a project" is shown, no list of active runs.

Unit-level reproduction (fails before the fix): the new `src/data/apply-run-change.test.ts` cases for a multi-project entry, `src/lib/active-runs.test.ts`, and the `hydration.test.ts` #69 case do not compile or fail against the unfixed code (`queryKeys.activeRuns`, `activeRunsOf`, `activeRunCounts` do not exist; `runStatusIn` matches on `adw_id` only).

## Root Cause Analysis

- Two independent sources of truth: Active rows live per slug, counts live in the project summaries; each is patched by its own reducer from the same event, and the counts reducer depends on the per-slug entry for the previous status (Supabase sends `old` with primary-key columns only). When that entry is absent (page never opened) the delta cannot be computed, so the two diverge (#62).
- The per-slug entry exists only after visiting the page; the listener (correctly) never seeds an absent entry, so events before the first visit are lost (#69).
- The per-slug prefetch scope `getRunsState` is prerendered into the static shell; on a resumed request it is read from the frozen Resume Data Cache, which no tag drop reaches. A visit therefore hydrates a build-time Active list, and the catch-up only covers entries already in the cache at SUBSCRIBED time.

One all-projects entry, read per request after `connection()` and hydrated on the layout level before any consumer renders, removes all three causes: the entry always exists, the previous status is always known for an active run, and the counts are derived from the rows rather than patched separately.

## Relevant Files

Use these files to fix the bug:

- `README.md`: sections "Data: projects and runs from the database", "The query layer", "Labels: no clock in render", "Prefetch and hydration of the sidebar", "Runs: active and history" (incl. "The move", "Webhook revalidation", "What is prerendered and what is not"), "Where live updates go", "Event to cache", "Catch-up on SUBSCRIBED", "Routing". Describe the old per-slug entry; must be rewritten.
- `AGENTS.md`: rules naming `getActiveRuns(slug)`, `getRunsState`, `queryKeys.runs`/`allRuns`, `runsTag`, the clock rule, the not-found rule, the `"use client"` list, the realtime rules (`runStatusIn` order, catch-up), the tag rules. Must be updated in step.
- `.adw/project.md`: Review section describes `/projects` as "Select a project"; Tests section lists the journeys. Update without renaming or reordering the nine headings.
- `src/data/index.ts`: `getActiveRuns(slug)` and `ActiveRuns`; replaced by the all-projects read.
- `src/data/query-keys.ts`: `allRuns`, `runs(slug)`; replaced by `activeRuns`.
- `src/data/query-client.ts`: `prefetch` (reused unchanged), comments naming `getActiveRuns`.
- `src/data/realtime.ts`: `applyRunEvent`, `catchUp`, `cachedSlugs`.
- `src/data/apply-run-change.ts`: `runStatusIn`, `applyRunChange`, `applyRunChangeToSummaries`.
- `src/data/apply-run-change.test.ts`: reducer tests to adapt and extend.
- `src/data/hydration.test.ts`: uses `queryKeys.runs`; extend with the #69 shape.
- `src/data/supabase.ts`: comment naming `getRunsState`.
- `src/app/(dashboard)/layout.tsx`: projects prefetch; gets the active runs island around `ProjectNav`.
- `src/app/(dashboard)/projects/page.tsx`: "Select a project" placeholder; becomes the all-projects Active list.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: `getRunsState`, `generateMetadata`, not-found, Active boundary.
- `src/app/(dashboard)/projects/[owner]/[repo]/loading.tsx`: comment mentions runs streaming in; adjust wording.
- `src/components/ActiveRunsView.tsx`: per-slug query, header, not-found branch.
- `src/components/ProjectNav.tsx`: running/failed counts.
- `src/components/RunRow.tsx`, `src/components/SectionHeading.tsx`, `src/components/PageHeader.tsx`, `src/components/SectionBoundary.tsx`, `src/components/QueryBoundary.tsx`: reused as is.
- `src/app/providers.tsx`: comment about the Active HydrationBoundary on refresh and the tags the action drops.
- `src/app/actions/revalidate-history.ts`, `src/app/api/revalidate/route.ts`: doc comments list the `runs:<slug>` tag; code iterates `historyTags`.
- `src/lib/history-tags.ts`, `src/lib/history-tags.test.ts`: `runsTag` and the three-tag tuple.
- `src/app/page.tsx`: comment line 94 refers to `getActiveRuns`'s `fetched_at`; adjust wording.
- `src/types/adw.ts`: `ProjectSummary` keeps `running`/`failed` (they mirror the view); no change needed beyond comments.
- `e2e/test_landing_no_filters.md`: format model for the new journey.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`, `.../cacheLife.md`, `.../updateTag.md`, `.../revalidateTag.md`, and the Cache Components guide under `node_modules/next/dist/docs/`: read before touching the prefetch and tags.
- `node_modules/@tanstack/query-core/build/modern/hydration.js`: the overwrite rule the hydration test pins.

### New Files

- `src/data/active-runs-query.ts`: `activeRunsQuery` (client-safe `queryOptions`).
- `src/data/active-runs-state.ts`: `getActiveRunsState` (server only: React `cache()`, `connection()`, `prefetch`).
- `src/lib/active-runs.ts`: `activeRunsOf`, `activeRunCounts`, `groupActiveRuns`.
- `src/lib/active-runs.test.ts`: their unit tests.
- `src/components/ActiveRunsOverview.tsx`: `/projects` client list.
- `e2e/test_active_runs_shared_entry.md`: the journey the issue asks for.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the framework docs

- Read `connection.md`, `cacheLife.md`, `updateTag.md`, `revalidateTag.md` and the Cache Components guide under `node_modules/next/dist/docs/01-app/`, and React Query's `queryOptions` and `select` typing in the installed `@tanstack/react-query` (`useSuspenseQuery` with `select` returns the selected type).

### 2. Data boundary: one all-projects read

- In `src/data/index.ts`, change `ActiveRuns` to `{ active: Run[]; fetched_at: string }` (drop `project`; doc comment: every visible project's running and failed runs, most recently updated first).
- Replace `getActiveRuns(slug)` with `getActiveRuns(): Promise<ActiveRuns>`: `getSupabase().from("runs").select(RUN_COLUMNS).in("status", ["running", "failed"]).order("updated_at", { ascending: false })`, throw `runs: <message>` on error, cast `Run[]` once, stamp `fetched_at: new Date().toISOString()`. RLS on `adw.runs` limits rows to public projects. Rewrite its doc comment: queryFn of `queryKeys.activeRuns`; on the server it runs only inside `getActiveRunsState`, after `connection()` (request time, so the clock read is allowed and nothing is frozen into the shell); in the browser on a cache miss and in the catch-up.
- Update the file header comment (Active is one entry for all projects) and the `getCompletedRuns`/`getQueue` comments that say "the page has already decided not-found from getActiveRuns" (now from the projects list).
- Keep `getProjectBySlug` (still used by `getCompletedRuns` and `getQueue`).

### 3. Query layer

- `src/data/query-keys.ts`: remove `allRuns` and `runs(slug)`; add `activeRuns: ["active-runs"] as const` with a comment (the one Active entry: prefetched per request by `getActiveRunsState`, read by `ProjectNav`, `ActiveRunsOverview` and `ActiveRunsView`, written by the runs listener and the catch-up). Keep `allQueues`, `queue`, `projects`, `summaryToday`.
- New `src/data/active-runs-query.ts` (no `"use client"`, no server import): `export const activeRunsQuery = queryOptions({ queryKey: queryKeys.activeRuns, queryFn: getActiveRuns, staleTime: "static", refetchOnMount: false })`, with the `staleTime: "static"` reason comment moved from `ActiveRunsView`.
- New `src/data/active-runs-state.ts`: `export const getActiveRunsState = cache(async () => { await connection(); return prefetch(queryKeys.activeRuns, getActiveRuns); })` (`cache` from `react`, `connection` from `next/server`). Doc comment: not `"use cache"` on purpose (a prerendered scope is served from the frozen Resume Data Cache; see #69); React `cache()` dedupes the read per request across the layout and page islands; each consumer island hydrates the returned state itself so the entry exists before its consumer renders. Only server components import this file.
- `src/data/query-client.ts`: update the comments that mention `getActiveRuns` building a plain object / the project page's runs prefetch.

### 4. Pure helpers and their tests

- New `src/lib/active-runs.ts`:
  - `activeRunsOf(runs: Run[], projectId: string): Run[]`: the rows with that `project_id`, order kept.
  - `activeRunCounts(runs: Run[]): Map<string, { running: number; failed: number }>`.
  - `groupActiveRuns(runs: Run[], projects: ProjectSummary[]): { project: ProjectSummary; runs: Run[] }[]`: in `projects` order, only projects with at least one run, runs of an unknown project dropped, run order kept.
- New `src/lib/active-runs.test.ts`: `activeRunsOf` keeps only the project's rows and their order, empty for an unknown id; `activeRunCounts` counts running and failed per project and has no entry for a project without active runs; `groupActiveRuns` orders by the project list, omits empty projects, drops runs of unknown projects.

### 5. Reducers

- `src/data/apply-run-change.ts`:
  - `runStatusIn(current, projectId, adwId)` matches on both columns.
  - `applyRunChange` matches the row on `(project_id, adw_id)` in INSERT (duplicate check), UPDATE (replace / remove) and DELETE (`ev.old.project_id`, `ev.old.adw_id`); same semantics otherwise (completed is removed, failed kept, unknown live UPDATE prepended, identity returned when nothing changed).
  - `applyRunChangeToSummaries`: stop changing `running` and `failed`. `completed`: +1 on INSERT with status completed; +1 on UPDATE whose new status is completed and `oldStatus` is `running` or `failed`; -1 (floored at 0) on UPDATE from completed is not knowable (old is never completed in the Active cache), so otherwise unchanged; DELETE unchanged. `last_run_at` handling unchanged. Update the doc comments (the running and failed counts are derived from the Active entry in `ProjectNav`).
  - Header comment: the Active entry is all projects.
- `src/data/apply-run-change.test.ts`: change `active()` to the new shape (no `project`), add a second project's rows and cover: INSERT running adds the row; duplicate INSERT (same project and adw_id) is a no-op returning identity; the same `adw_id` under another project is a distinct row; UPDATE running to completed removes it; UPDATE running to failed keeps it in place; DELETE removes only the matching `(project_id, adw_id)`; `runStatusIn` with project and adw_id. Update the summaries tests: running/failed untouched, completed +1 on INSERT completed and on running to completed, unchanged when `oldStatus` is undefined, `last_run_at` as before.

### 6. Realtime wiring

- `src/data/realtime.ts`:
  - `applyRunEvent`: resolve the project from `queryKeys.projects` as today (needed for the slug of `onHistoryChange`; drop the event when absent). `oldStatus` = INSERT ? undefined : `ev.old.status ?? runStatusIn(getQueryData<ActiveRuns>(queryKeys.activeRuns), projectId, adwId)`, read BEFORE the write. Then `setQueryData<ActiveRuns>(queryKeys.activeRuns, current => current && applyRunChange(current, ev))`, then the projects write, then `onHistoryChange` last.
  - `catchUp`: after the projects write, `setQueryData<ActiveRuns>(queryKeys.activeRuns, await getActiveRuns())` (unconditional: a complete list read from the database, not a one-event seed); keep the queue loop over `cachedSlugs(queryClient, queryKeys.allQueues)`. Update the cost comment (one `project_summaries` read, one `runs` read, two reads per cached queue).
  - Update the comments that reference per-slug runs entries.

### 7. Tags, action, route handler

- `src/lib/history-tags.ts`: delete `runsTag`; `historyTags(slug): readonly [string, string]` returns `[historyTag(slug), summaryTodayTag()]`; update the header and doc comments.
- `src/lib/history-tags.test.ts`: drop the `runsTag` case; the completion case expects `["history:SBub/adw-toolkit", "summary:today"]`.
- `src/app/actions/revalidate-history.ts` and `src/app/api/revalidate/route.ts`: code unchanged; update the comments to two tags (no Active scope any more: Active is read per request and patched in the browser).
- `src/app/providers.tsx`: update the `onHistoryChange` comment (no Active tag; the refresh re-renders History and the Active island re-reads per request, and hydration skips a state not newer than the live entry).

### 8. Dashboard layout: sidebar island

- `src/app/(dashboard)/layout.tsx`: add an async `SidebarActiveRuns` component that awaits `getActiveRunsState()` and returns `<HydrationBoundary state={state}><QueryBoundary fallback=... detail="The project list did not load."><ProjectNav /></QueryBoundary></HydrationBoundary>`. Inside the existing projects `HydrationBoundary`, replace the `QueryBoundary`/`ProjectNav` with `<SectionBoundary fallback={<p ...>Loading...</p>} detail="The project list did not load."><SidebarActiveRuns /></SectionBoundary>`. The `Projects` heading and `ConnectionIndicator` stay static. Comment why (request-time hole, per-request read, never frozen).

### 9. ProjectNav counts

- `src/components/ProjectNav.tsx`: add `const { data: counts } = useSuspenseQuery({ ...activeRunsQuery, select: (data) => activeRunCounts(data.active) })`; pass each item `running={counts.get(project.id)?.running ?? 0}` and `failed={...}` and render those instead of `project.running` / `project.failed`. Queued, completed and `last_run_at` still come from the project row. Update the comment.

### 10. ActiveRunsView: per-project select, no header

- `src/components/ActiveRunsView.tsx`: props `{ projectId: string; slug: string; heading: ReactNode; queue: ReactNode }`. `const { data: runs } = useSuspenseQuery({ ...activeRunsQuery, select: (data) => activeRunsOf(data.active, projectId) })`. Remove `PageHeader` and the not-found branch. Render the Active section (heading slot, "No runs in progress." or `RunRow`s with `projectSlug={slug}`) and then the `queue` slot. Update the doc comment.

### 11. Project page

- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`:
  - Add `async function getProject(slug: string) { "use cache"; cacheTag("projects"); return (await getProjects()).find((p) => p.slug === slug) ?? null; }` (no clock read; the scope dedupes metadata and body and shares the layout's tag).
  - `generateMetadata` reads `getProject(slug)`.
  - Delete `getRunsState`, the `runsTag` import, `getActiveRuns` import, and the long comment paragraph about the Active scope in the Resume Data Cache (replace with a short note that Active is a request-time island).
  - Body: `const [project, queue] = await Promise.all([getProject(slug), getQueueState(slug)]); if (project === null) notFound();`. Render `<PageHeader title={project.display_name} subtitle={project.slug} repoUrl={project.repo_url} />` first, then `<SectionBoundary fallback={<p ...>Loading runs...</p>} detail="This project's runs did not load."><ProjectActiveRuns projectId={project.id} slug={slug} heading={activeHeading} queue={queueSection} /></SectionBoundary>`, then History unchanged.
  - `ProjectActiveRuns` (async, in the page file): awaits `getActiveRunsState()`, returns `<HydrationBoundary state={state}><QueryBoundary fallback=... detail="This project's runs did not load."><ActiveRunsView ... /></QueryBoundary></HydrationBoundary>`.
  - Fix the `generateStaticParams` comment (`"_/none"` is not in the project list).
- `loading.tsx`: adjust the comment wording only.

### 12. /projects: every active run

- New `src/components/ActiveRunsOverview.tsx` (`"use client"`): reads `useSuspenseQuery(activeRunsQuery)` and `useSuspenseQuery({ queryKey: queryKeys.projects, queryFn: getProjects, staleTime: "static", refetchOnMount: false })`; `groupActiveRuns(data.active, projects)`; empty: the dashed "No runs in progress." panel (same classes as ActiveRunsView); otherwise for each group a `<section>` with an `<h2>` holding a `next/link` to `/projects/${project.slug}` with `display_name` (and the slug in mono, muted), then `<ul className="space-y-3">` of `RunRow` (`variant="active"`, `projectSlug={project.slug}`). Takes a `heading` slot rendered first. No status colour classes inline.
- `src/app/(dashboard)/projects/page.tsx`: static `SectionHeading` "Active" (description: running runs and failed runs that can be resumed, across every project; detail as on the project page) built in the page, and `<SectionBoundary fallback={<p ...>Loading runs...</p>} detail="Active runs did not load."><AllActiveRuns heading={heading} /></SectionBoundary>`, where `AllActiveRuns` (async, in the page file) awaits `getActiveRunsState()` and returns `<HydrationBoundary state><QueryBoundary ...><ActiveRunsOverview heading={heading} /></QueryBoundary></HydrationBoundary>`. Add `export const metadata = { title: "Projects | ADW Dashboard" }` only if a title is already expected elsewhere; otherwise leave metadata as is. The projects entry is hydrated by the layout's projects `HydrationBoundary`, already settled and earlier in tree order than `children`, so the overview's projects read is a cache hit; verify in the served HTML.

### 13. Hydration test

- `src/data/hydration.test.ts`: use `queryKeys.activeRuns` for the key. Add the #69 case: client entry `{ active: [], fetched_at }` set at `updatedAt: 2_000`; apply an INSERT of a running run through `setQueryData(key, current => current && applyRunChange(current, insert))` (updatedAt now `> 2_000`); `hydrate` a server state holding `{ active: [] }` stamped `1_500`; expect the running row still present. Keep the four existing cases.

### 14. Documentation

- `README.md`: rewrite the listed sections to the new design: one `queryKeys.activeRuns` entry; `getActiveRuns()` all projects; `getActiveRunsState` per request after `connection()`, React `cache()` dedupe, one `HydrationBoundary` per consumer island; `/projects` lists active runs grouped by project; project page header/not-found/metadata from `getProject(slug)` (projects list, tag `projects`); `ActiveRunsView` select; sidebar running/failed derived via `activeRunCounts`; `applyRunChangeToSummaries` keeps completed and `last_run_at`; catch-up re-reads the one entry; two tags in `historyTags`; "What is prerendered": the sidebar list and Active are now request-time holes, the `Projects` heading, pill, project header and History heading are in the shell.
- `AGENTS.md`: update every rule listed under Relevant Files. In particular: the clock rule (the `fetched_at` site now runs on the server only after `connection()` in `getActiveRunsState`); the data boundary paragraph (`getActiveRuns()` signature and read); a rule for `getActiveRunsState` (the one server caller of `getActiveRuns`, never `"use cache"`, every consumer island hydrates its state as its own ancestor, never a bare `Suspense`); `activeRunsQuery` is the one spelling of the Active query options; not-found from `getProject(slug)`; `"use client"` list gains `ActiveRunsOverview`; `src/lib/active-runs.ts` is pure and tested, every change with a test case; realtime rules (`runStatusIn(current, projectId, adwId)` before the write, catch-up writes `queryKeys.activeRuns` unconditionally, `queryKeys.allQueues` only); tags (`historyTags` returns history and today; no `runsTag`); `ProjectNav` running/failed come only from `activeRunCounts`; `applyRunChangeToSummaries` never touches running or failed.
- `.adw/project.md`: Review section: `/projects` shows the project sidebar plus every active run grouped by project ("No runs in progress" when none). Tests section: add `e2e/test_active_runs_shared_entry.md` to the journey list. Keep the nine headings and their order.
- No em-dashes anywhere.

### 15. E2E journey (requested by the issue)

- New `e2e/test_active_runs_shared_entry.md`, modelled on `e2e/test_landing_no_filters.md` (`## User Story`, `## Test Steps` with `**Verify**` lines, `## Success Criteria`). Steps: open `/projects`, wait for the pill `live`; **Verify** the `Active` heading; if the list is empty **Verify** `No runs in progress` and that every sidebar project shows `0 running` and `0 failed`, screenshot, stop; otherwise take the first group, note its project name, run `adw_id`s and its count of rows by status; **Verify** the sidebar entry for that project shows the same `running` and `failed` numbers; click the group heading; **Verify** the project page's Active section lists the same `adw_id`s; **Verify** the sidebar counts unchanged; screenshots at each stage. The journey is an acceptance gate (the hosted database is read-only for ADW, so it cannot create a run); the regression coverage is the unit layer below.

### 16. Validation

- Run every command in `Validation Commands`. After `yarn build`, `yarn start` on `$PORT` and fetch `/projects` and the first project page: the served HTML (inline or as a streamed `$RC` completion) contains the run rows' `<code>` `adw_id`s when a run is active, `No runs in progress.` otherwise, and the project page's `<h1>` holds the project name. Check `.next/cache/fetch-cache` has no Supabase entry.

## Test Coverage

Unit layer (`yarn test`, vitest, `src/**/*.test.ts`), the only regression layer the profile lists:

- `src/data/apply-run-change.test.ts`: the reducer on the one multi-project entry (INSERT running adds, duplicate INSERT no-op, same `adw_id` in another project is distinct, running to completed removes, running to failed keeps, DELETE removes the matching `(project_id, adw_id)` only) and `applyRunChangeToSummaries` no longer moving running/failed. Catches a reducer that keys on `adw_id` alone or reintroduces the separate counters (#62).
- `src/lib/active-runs.test.ts`: the per-project select, the derived running/failed counts per project and the grouping. Catches a project page or sidebar count that disagrees with the shared rows (#62).
- `src/data/hydration.test.ts`, #69 shape: an INSERT applied to the live entry survives hydration of an older server state. Catches a design where a later hydration drops an event-delivered run (#69).
- `src/lib/history-tags.test.ts`: `historyTags` is history plus today only.

All fail against the unfixed code (missing exports, two-column match, three-tag tuple). The e2e journey is listed as a task, not here.

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- `yarn test`: before the fix the new cases fail; after it every unit test passes (reducers, helpers, hydration, tags).
- `yarn lint`: lint, incl. React hooks purity (no clock read in render).
- `yarn typecheck`: `next typegen` and `tsc --noEmit`; catches leftover `queryKeys.runs`, `runsTag`, `getActiveRuns(slug)` callers.
- `yarn knip`: no dead export left behind (`runsTag`, `allRuns`, the per-slug read, `cachedSlugs` if unused).
- `yarn format:check`: Prettier.
- `yarn build`: Cache Components prerender passes (no clock read outside a cache scope or before `connection()`), and the route table shows `/projects` and the project pages as Partial Prerender.
- `grep -rn "queryKeys.runs\|allRuns\|runsTag\|getRunsState\|runs:" src`: no hit left (apart from unrelated strings).

## Notes

- No new dependency. `queryOptions` comes from the installed `@tanstack/react-query`, `cache` from `react`, `connection` from `next/server`.
- Trade-off: the sidebar list and the project page's Active section are now request-time holes (streamed per request) rather than static shell. This is what the issue asks for (never frozen) and what fixes #69; the `Projects` heading, the pill, the project header and the History heading stay in the shell.
- A project added after the last `projects` cache fill 404s until that scope refills (default 15 minutes or `revalidateTag("projects")`), the same lifetime the sidebar already has.
- `ProjectSummary.running` and `failed` stay in the type (they mirror the view) but nothing renders them; the reducer leaves them as read.
- React `cache()` is used for `getActiveRunsState` only (one per-request read shared by the layout and page islands). The AGENTS rule against a `cache()` wrapper is about `getHistory`, whose dedupe Next already does for `"use cache"`; keep that rule and state the distinction in AGENTS.
- Commits: Conventional Commits, no trailers (profile Documentation section).
