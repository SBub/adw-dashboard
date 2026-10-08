# Screens and components

**Specifications:**

- specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md
- specs/issue-141-adw-ab53aaef-sdlc_planner-sticky-header.md
- specs/issue-142-adw-0093e1de-sdlc_planner-friendly-run-phase-labels.md
- specs/issue-145-adw-6726a682-sdlc_planner-history-card-full-branch.md
- specs/issue-152-adw-a6b99270-sdlc_planner-fix-between-phase-complete-label.md

## Overview

The two-pane `/projects` screen (the sidebar in `src/app/(dashboard)/layout.tsx` and the right pane with a project's Active, Queue and History sections) and the rules every component follows: typed props, row layout, section headings, the server and client split, timestamps, the page background and status colours. Components live under `src/components/`, pure formatting helpers under `src/lib/`.

## How it works

A public dashboard for runs of the AI Developer Workflow (ADW) toolkit across
projects, in two sections. `/`, the landing page, is the summary (full width,
see `app_docs/summary.md`). `/projects` is a two-pane screen:

- The left pane is a persistent sidebar listing every project with its
  queued, running, completed and failed counts and the time its last run started. It
  lives in a shared layout (`src/app/(dashboard)/layout.tsx`), so it keeps its
  state and scroll position when the selection changes. Below the `md`
  breakpoint it becomes a horizontal strip above the detail. From `md` up it
  is sticky: it sits `--header-height` + 1.5rem from the top, below the
  sticky root header, and its max height subtracts the header height and both
  1.5rem gaps, so its last item stays reachable through its own scroll.
  Every run and queue state has one colour wherever it appears (queued
  amber, running emerald with a pulsing dot, completed sky, failed rose, a
  zero count neutral), taken from the one map in `src/lib/status-colors.ts`;
  the sidebar's connection pill keeps its own colours.
- The right pane shows the selected project's runs and queue: an Active
  section for live runs, status `running` or `failed` (a failed run can be
  resumed, so it is still live), with phase, branch and the absolute time of
  the last update, then a Queue section for the issues waiting in the
  project's queue ledger, in the order they will run, and a History section
  for `completed` runs, its card showing the branch in full (wrapping, one
  click selects it, with a small link to the branch on GitHub), Finished,
  Duration and Cost (only for a run with metrics), with no status pill, no final phase and no start time. The Active
  row's phase is shown as a label (Planning, Building, ..., Complete), with
  the raw step key as the hover title; a run between phases shows the
  finished step's done label (e.g. `Build done`), never `Complete`. History's `?q`
  search matches the raw column, not the label (searching "Planning" finds
  nothing).
  Active is a React Query entry patched by Realtime; History is rendered on
  the server from a cache scope and re-rendered when a run completes (see
  `app_docs/project-page.md`). `/projects` shows an empty "Select a
  project" panel; `/projects/<owner>/<repo>` selects a project and is the deep
  link.

## Rules

- Components take typed props only. They never fetch, compute or count
  business values; they render what they are given. `RunRow` and
  `RunHistoryList` take `Run` rows as stored (the page's `HistoryPagination`
  and `CompletedRuns` are the async components that await data, and they live
  in the page file, not under `src/components/`). The one formatting a component may do is call a
  pure helper from `src/lib/` on the row's own fields (`RunRow` calls
  `durationLabel(run.started_at, run.finished_at)` and
  `branchTreeHref(projectSlug, run.branch_name)` and `costLabel(cost)` (shared
  with the summary's charts and table) from `src/lib/run-view.ts`, and
  `phaseLabel(run.phase)` from `src/lib/run-phase.ts`);
  no view model is built anywhere for runs. `RunRow` and `RunHistoryList`
  also take the run's cost as a prop (`cost`, `costs`), read by the data
  layer, not computed by the component; a run with no metrics row shows no
  Cost field, never `$0.00`. Run and queue row titles are shown in full and wrap; the
  row is `items-start` and every element sits in a 24px first-line box
  (`leading-6` or an `h-6 items-center` wrapper), so the status pill is on the
  title's first line. The detail grid's `Field` keeps its `truncate`, except
  History's Branch, which opts out (`wrap`): shown in full with `break-all`,
  `select-all` on the name only, and the GitHub tree link beside it, never on
  the name. History's card has no status pill; do not add one back.
- A run row's phase label comes only from `phaseLabel` in
  `src/lib/run-phase.ts` (one helper, never a second mapping in a
  component). Exact keys match first (`queue:classification` contains a
  colon), then the `:composer` suffix on any prefix, then `:complete`: on a
  known step with a done label it returns that label, on any other prefix (a
  composer) it is `Complete`. The toolkit writes `<step>:complete` after each
  phase (the run is still `running`) and `<composer>:complete` when the run is
  done. Then `:failed` on a known step. An unknown value, including `:failed` on an
  unknown step, is shown raw so a new toolkit step is never hidden. The
  costed step keys are shared with `PHASE_ORDER` in `src/lib/phase-usage.ts`
  (the label table is typed `Record<PhaseKey, ...>` with a required done
  label). Every change to the
  mapping goes with a test case in `src/lib/run-phase.test.ts`.

  | Raw value                                       | Label                    |
  | ----------------------------------------------- | ------------------------ |
  | `ensure_adw_id`, `<composer>:composer`          | Starting                 |
  | `queue:classification`                          | Classifying              |
  | `adw_plan_iso`                                  | Planning                 |
  | `adw_build_iso`                                 | Building                 |
  | `adw_test_iso`                                  | Testing                  |
  | `adw_review_iso`                                | Reviewing                |
  | `adw_document_iso`                              | Documenting              |
  | `adw_ci_iso`                                    | Checking CI              |
  | `adw_patch_iso`                                 | Patching                 |
  | `<step>:failed` with a known step               | the step's label         |
  | `adw_plan_iso:complete`                         | Plan done                |
  | `adw_build_iso:complete`                        | Build done               |
  | `adw_test_iso:complete`                         | Tests done               |
  | `adw_review_iso:complete`                       | Review done              |
  | `adw_document_iso:complete`                     | Docs done                |
  | `adw_ci_iso:complete`                           | CI done                  |
  | `adw_patch_iso:complete`                        | Patch done               |
  | `<composer>:complete` (prefix not a known step) | Complete                 |
  | `null`                                          | none (muted, as before)  |
  | anything else                                   | the raw value, unchanged |

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
  reintroduce `justify-between`. The detail popover takes `TOOLTIP_LAYER`
  from `src/lib/layers.ts` (defined nowhere else), the topmost layer of the
  page; no other element may take a z-index at or above it, and
  `src/lib/layers.test.ts` scans `src/` and fails on one.
- Server components by default; `"use client"` only where the browser must
  hold state (the React Query provider in `src/app/providers.tsx`,
  `ProjectNav`, which reads the pathname and the query cache,
  `ActiveRunsView`, which reads one project's active runs from the query cache,
  `ActiveRunsOverview`, which reads every project's active runs and the
  project list from the query cache on `/projects`,
  `QueueView`, which reads the queued items from the query cache,
  `ConnectionIndicator`, which subscribes to its store, `HeaderLink`, which
  reads the pathname to mark the header's current section, `HistorySearch`, which
  holds the search box's local text and calls the router, and
  `HistoryPageLink`, which navigates the History pages inside the shared
  History transition, and `HistoryTransition`, which holds the one
  `useTransition` the box, the arrows and `HistoryResults` share, `SummaryProviders` in `src/app/summary-providers.tsx`,
  the summary page's bare query client, and `TodaySummary`, which reads today's
  card from the query cache and refetches it). `HistoryLinks`,
  `RunHistoryList`, `SectionNav`,
  `DailySummaryList`, `SummaryDayCard`, `DayCharts`, `ColumnChart`,
  `ClassColumnChart`, `ModelColumnChart`, `PhaseColumnChart`,
  `ClassDistributionBar`, `ProjectBreakdownTable`, `Skeleton` and the
  skeletons in `LoadingSkeletons.tsx` are components with no
  state; do not put
  `"use client"` on them or give them a filter that needs one.
  `SummaryDayCard`, `DayCharts`, `ColumnChart`, `ClassColumnChart`,
  `ModelColumnChart`, `PhaseColumnChart`, `ClassDistributionBar` and
  `ProjectBreakdownTable` are also rendered by the client `TodaySummary`, so they must stay stateless and
  free of server-only imports. The left and
  right arrows of `HistoryLinks` are `HistoryPageLink`s with the hrefs
  `HistoryPagination` builds with `historyHref` and passes in with `page` and
  `pageCount` (`null` hides an arrow); a plain click pushes the href with
  `scroll: false` inside the shared transition. Do not decode a bookmark,
  build a URL or compute a page number in either component. The page number is derived from
  the counts in the cached page and never carried in the URL.
  `HistorySearch` builds its URL only through `historyHref(slug, null, q)`
  (page one, so `?after` and `?before` are dropped), never by hand, from `usePathname` or
  with `useSearchParams` (its initial text comes from the `HistorySearchBox`
  island); it debounces with `useDebouncedCallback` in
  `src/hooks/use-debounced-callback.ts` and navigates with
  `router.replace` inside the shared transition. `src/lib/run-view.ts` and
  `src/lib/run-phase.ts` are plain and importable from anywhere. `QueueRow` has no `"use client"` (it is rendered
  by `QueueView`, like `RunRow`).
- The visible text of every timestamp comes from `formatTimestamp` in
  `src/lib/format-date.ts` (`DD.MM.YYYY HH:MM UTC`, UTC getters on a parse of
  the input, unit-tested in `src/lib/format-date.test.ts`), called only by
  `Timestamp`, whose `<time>` keeps the ISO value in `dateTime`. The output
  depends on the input string alone, so server and client markup agree. The
  summary's calendar days (`YYYY-MM-DD`, no time) are the one other case:
  `formatDay` in the same file (`DD.MM.YYYY`, same parse and UTC getters,
  same test file). Do not
  introduce `toLocaleString`, `Intl` or runtime-time-zone formatting, and every
  change to the format goes with a test case.
- The page background is defined only in `src/app/globals.css` (the
  `--background` and `--foreground` tokens, switched by
  `prefers-color-scheme`, with `color-scheme: light dark` on `:root`) and
  painted only on `html` and `body`. `html` must keep it: the canvas, the
  scrollbar gutter and the overscroll area are painted from the root. No
  page-level wrapper (`body` classes, `main`, a layout shell, a page root)
  takes a `bg-` class, with one exception: the sticky root header takes
  `bg-background` so content does not show through while scrolling under it;
  `html` keeps painting the canvas. That header, and any element that must
  match the page colour (the queue rail's hollow marker), uses
  `bg-background`, never a copied `bg-white dark:bg-neutral-950`.
- The root header in `src/app/layout.tsx` is `sticky top-0` with
  `HEADER_LAYER` (`src/lib/layers.ts`, below `TOOLTIP_LAYER` and above every
  other z-index in `src/`, pinned by `src/lib/layers.test.ts`), on every route
  and at every width. The document keeps scrolling as a whole: never make
  `main`, `body` or a layout shell an `overflow` scroll container (scroll
  restoration, scroll-to-top on navigation, pull-to-refresh and the mobile
  address bar depend on window scroll). Its single-row height has one source,
  `--header-height` in `src/app/globals.css`; a change to the header's padding
  or line height updates it.
- Status colours come only from `STATUS_COLORS` in `src/lib/status-colors.ts`
  (queued amber, running emerald with the pulse dot, completed sky, failed
  rose, `neutral` for zeros), written as full literal class strings so
  Tailwind sees them; never interpolate a hue name. No component writes an
  `emerald`, `amber`, `sky`, `rose` or `red` class inline;
  `src/lib/status-colors.test.ts` scans `src/` and fails on one. The
  connection pill in `ConnectionIndicator` is the one exemption (it describes
  the socket, not a run). Issue class badges are not states and use hues
  outside the palette.
