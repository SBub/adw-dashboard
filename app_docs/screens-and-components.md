# Screens and components

**Specifications:**

- specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md
- specs/issue-141-adw-ab53aaef-sdlc_planner-sticky-header.md
- specs/issue-142-adw-0093e1de-sdlc_planner-friendly-run-phase-labels.md
- specs/issue-145-adw-6726a682-sdlc_planner-history-card-full-branch.md
- specs/issue-169-adw-98e70d08-sdlc_planner-who-you-are-home-page.md
- specs/issue-147-adw-50c77227-sdlc_planner-history-card-pr-link.md
- specs/issue-152-adw-a6b99270-sdlc_planner-fix-between-phase-complete-label.md
- specs/issue-158-adw-a58f07d8-sdlc_planner-worker-status-widget.md
- specs/issue-164-adw-cf1087b2-sdlc_planner-hire-me-page-contact-form.md
- specs/issue-211-adw-c1f6991d-sdlc_planner-nts-slow-focus-radio-bar.md
- specs/issue-214-adw-b4882b73-sdlc_planner-header-one-row-floating-hire.md
- specs/issue-216-adw-155628ce-sdlc_planner-radio-bar-sticky-footer.md
- specs/issue-258-adw-106aa5eb-sdlc_planner-history-branch-text-pr-link.md

## Overview

The two-pane `/projects` screen (the sidebar in `src/app/(dashboard)/layout.tsx` and the right pane with a project's Active, Queue and History sections) and the rules every component follows: typed props, row layout, section headings, the server and client split, timestamps, the page background and status colours. Components live under `src/components/`, pure formatting helpers under `src/lib/`.

## How it works

A public dashboard for runs of the AI Developer Workflow (ADW) toolkit across
projects. `/`, the landing page, is a static intro (see `app_docs/home.md`).
`/projects` is a two-pane screen, shared by the overview, the daily log at `/projects/log` (the summary, see `app_docs/summary.md`) and every project page:

- The left pane is a persistent sidebar listing every project with its
  queued, running, completed and failed counts and the time its last run started. It
  lives in a shared layout (`src/app/(dashboard)/layout.tsx`), so it keeps its
  state and scroll position when the selection changes. Below the `md`
  breakpoint it becomes a horizontal strip above the detail. From `md` up it
  is sticky: it sits `--header-height` + 1.5rem from the top, below the
  sticky root header, and it is a full-height column (its height subtracts the
  header height, the radio footer's `--radio-bar-height` and both 1.5rem gaps, so
  the column ends above the footer): the project list scrolls inside it and
  the Daily log and Changelog entries (`SidebarEntryLink`, links to
  `/projects/log` and `/projects/changelog` styled like a project entry; Daily
  log current only on its page, Changelog on its index and every entry) and
  the worker status widget sit at its bottom, always visible. Below `md` both follow the strip.
  The widget (`WorkerStatus`) shows whether the toolkit's queue worker is
  running: "Ready to build" (emerald dot) while the freshest heartbeat is under
  90 s old, "Offline" (rose ring) otherwise, each followed by "last
  beat" and the beat's `Timestamp`, or "never seen" when there is no row.
  Before its first read (the static shell, hydration, the first poll in
  flight) it reads "Checking status..." with a dashed neutral ring. It never
  shows the worker's host, pid or `started_at`.
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
  click selects it, as plain monospace text, never a link, because the
  toolkit deletes merged and superseded branches (adw-toolkit#167); the
  card's link goes to the pull request, the PR field, when the run has one,
  otherwise there is none), Finished,
  Duration, PR (only for a run with a `pr_number`, linking the pull request
  in a new tab) and Cost (only for a run with metrics), with no status pill, no final phase and no start time. The Active
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
  `durationLabel(run.started_at, run.finished_at)`,
  `pullRequestHref(projectSlug, run.pr_number)` and `costLabel(cost)` (shared
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
  `select-all` on the name only, and never a link: do not link a finished
  run's branch to GitHub (its branch is deleted once merged or superseded,
  adw-toolkit#167); the pull request link is the PR field. History's card has no status pill; do not add one back.
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
  `ConnectionIndicator`, which subscribes to its store, `WorkerStatus`, which
  subscribes to its polling store, `IdentifyButton`, which subscribes to
  PostHog's feature flags and distinct id, `RadioBar`, which holds the player
  state and the `<audio>`, `HeaderLink`, which
  reads the pathname to mark the header's current section, `HistorySearch`, which
  holds the search box's local text and calls the router, and
  `HistoryPageLink`, which navigates the History pages inside the shared
  History transition, and `HistoryTransition`, which holds the one
  `useTransition` the box, the arrows and `HistoryResults` share, `SidebarEntryLink`,
  which reads the pathname to mark the sidebar's Daily log and Changelog entries, and `TodaySummary`, which reads today's
  card from the query cache and refetches it, `SubmitButton`, which reads its
  form's pending state, `TurnstileScript`, which renders the Turnstile
  widget on mount, and `PostMinimapViewport`, which measures the post and reads
  the window's scroll to draw a post's minimap and frame its visible part). `HistoryLinks`,
  `RunHistoryList`, `SectionNav`,
  `DailySummaryList`, `SummaryDayCard`, `DayCharts`, `ColumnChart`,
  `ClassColumnChart`, `ModelColumnChart`, `PhaseColumnChart`,
  `ClassDistributionBar`, `ProjectBreakdownTable`, `PostMinimap`, `Skeleton` and the
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
  takes a `bg-` class, with two exceptions: the sticky root header and the
  radio footer take `bg-background` so content does not show through while
  scrolling under them; `html` keeps painting the canvas. Those two, and any element that must
  match the page colour (the queue rail's hollow marker), uses
  `bg-background`, never a copied `bg-white dark:bg-neutral-950`.
- The root header in `src/app/layout.tsx` is `sticky top-0` with
  `HEADER_LAYER` (`src/lib/layers.ts`, below `TOOLTIP_LAYER` and above every
  other z-index in `src/`, pinned by `src/lib/layers.test.ts`), on every route
  and at every width. The radio bar (`app_docs/radio.md`) is a footer fixed
  to the bottom of the viewport on `FOOTER_LAYER`, rendered after `main`;
  `body` reserves its height. The document keeps scrolling as a whole: never make
  `main`, `body` or a layout shell an `overflow` scroll container (scroll
  restoration, scroll-to-top on navigation, pull-to-refresh and the mobile
  address bar depend on window scroll). Its single-row height has one source,
  `--header-height` in `src/app/globals.css`; a change to the header's padding
  or line height updates it.
- The header is one row (57px) at every width from 320px. The tagline ("Built
  with ADW, my AI developer workflow") shows only from `lg`. Below `sm` the
  Work with me button floats in the bottom-right corner (`fixed`, 1rem from the
  right edge and 1rem above the radio footer, that is `--radio-bar-height` +
  1rem + the safe-area inset from the bottom, at least 44px tall, with a soft
  shadow), the owner's Login / Logout button floats above it, the right
  group is `display: contents` so it takes no room in the row, and the left
  group's `min-h-8` keeps the row at the `--header-height` it has from `sm` up.
  Both floating buttons take `FLOATING_LAYER` (`src/lib/layers.ts`, `z-30`):
  below `HEADER_LAYER`, so the header and the section tooltip draw over them,
  and above `FOOTER_LAYER` and every other z-index in `src/`, pinned by
  `src/lib/layers.test.ts`. Below `sm`, `main` takes a bottom padding of 5rem
  on top of the body's footer padding so the last line of every page clears
  the button when scrolled to the end. Never render
  a second Work with me link for phones (the one `HireLink` changes position
  by width), and never put the floating buttons at or above `HEADER_LAYER`.
- Status colours come only from `STATUS_COLORS` in `src/lib/status-colors.ts`
  (queued amber, running emerald with the pulse dot, completed sky, failed
  rose, `neutral` for zeros), written as full literal class strings so
  Tailwind sees them; never interpolate a hue name. No component writes an
  `emerald`, `amber`, `sky`, `rose` or `red` class inline;
  `src/lib/status-colors.test.ts` scans `src/` and fails on one. The
  connection pill in `ConnectionIndicator` (it describes the socket, not a
  run) is the one exemption. The worker widget takes its colours from the map
  (`running` online, `failed` offline, `neutral` unknown), not an exemption,
  and has no `role="status"`: the pill is the one status element. Issue class badges are not states and use hues
  outside the palette. The summary's class chart uses the badge hues; its model
  and phase chart bars are one neutral gray (`MODEL_BG`, `PHASE_BG` in
  `src/lib/chart-colors.ts`), their names carrying identity.
- The header's Work with me button and the `/hire` Send button take their colour
  only from `HIRE_ACCENT` in `src/lib/accent.ts` (fuchsia 700, hover 800, the
  `/bug` class hue, not a status hue), so the two always match; never write
  a button's fuchsia fill inline.
