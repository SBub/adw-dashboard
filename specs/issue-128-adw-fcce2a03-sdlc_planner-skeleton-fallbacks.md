# Feature: Skeleton fallbacks for every Suspense boundary on the projects pages

## Metadata

issue_number: `128`
adw_id: `fcce2a03`
issue_json: `{"number":128,"title":"Projects pages: skeleton fallbacks for every Suspense boundary"}`

## Feature Description

While the request-time islands of the projects side stream in, their Suspense fallbacks are plain
text lines ("Loading...", "Loading runs...", "Loading queue...", "Loading history...", "Loading
project...") or nothing at all (the History pagination slot). The pane is nearly empty and then
jumps when content arrives. This feature replaces every one of those fallbacks with a skeleton: a
placeholder wireframe with the same outer box, padding, border, radius and line positions as the
real component, built from one shared `Skeleton` primitive that pulses softly (and stays still
under `prefers-reduced-motion`). The page keeps its shape while it loads, and the real content
replaces the skeleton in place.

## User Story

As a person watching ADW runs on the dashboard
I want the projects pages to show the shape of their sections while data streams in
So that the page does not flash nearly empty and then jump when the rows arrive

## Problem Statement

The eleven fallbacks listed in issue #128 are either a one-line `<p>` (about 20px tall) standing in
for a list of cards hundreds of pixels tall, or `null`. Every streamed completion therefore pushes
everything below it down (a visible jump, measurable as cumulative layout shift), and on a project
page the Active island's fallback also hides the Active and Queue headings, which arrive only with
the island.

## Solution Statement

1. Add one stateless primitive, `Skeleton` in `src/components/Skeleton.tsx`: an `aria-hidden`
   rounded block, `bg-neutral-200 dark:bg-neutral-800`, `motion-safe:animate-pulse` (Tailwind's
   pulse only when the user has not asked for reduced motion; reduced motion gets static muted
   blocks). Its size and spacing come from the caller's `className`.
2. Add the composed skeletons, all stateless server-safe components (no `"use client"`, no data
   import, no clock read), in `src/components/LoadingSkeletons.tsx`. Each mirrors the markup and
   Tailwind box classes of the component it stands in for, line for line, and each top-level one is
   wrapped in a container with `role="status"`, `aria-busy="true"` and an `aria-label`:
   - `ProjectNavSkeleton`: three project cards in `ProjectNav`'s `ul` classes ("Loading projects").
   - `ActiveRunsOverviewSkeleton`: one project group (an `h3`-sized name bar and mono slug bar, then
     two active run rows) in `ActiveRunsOverview`'s classes ("Loading active runs").
   - `ActiveRunsViewSkeleton({ heading, queue })`: `section.mb-10` with the `heading` slot and two
     active run rows ("Loading runs"), then the `queue` slot, exactly `ActiveRunsView`'s shape.
   - `QueueViewSkeleton({ heading })`: `section.mb-10` with the `heading` slot and an `ol.space-y-3`
     of two queue rail rows ("Loading queue"), `QueueView`'s shape.
   - `RunListSkeleton({ variant, rows })`: `ul.space-y-3` of `rows` run rows of the given variant
     ("Loading history" for `history`, "Loading runs" for `active`); used for History with
     `rows={HISTORY_PAGE_SIZE}`.
   - `HistoryLinksSkeleton`: `HistoryLinks`' `nav` box (`flex items-center gap-3`): two `w-6` arrow
     slots and a "N of M" bar ("Loading pages").
   - `ProjectPageSkeleton`: the whole project page for `loading.tsx`: a `PageHeader`-shaped block,
     then `ActiveRunsViewSkeleton` and `QueueViewSkeleton` with `SectionHeadingSkeleton` headings,
     then a History section with a `SectionHeadingSkeleton` and `RunListSkeleton` of
     `HISTORY_PAGE_SIZE` history rows ("Loading project").
   - Internal (not exported, so knip stays clean): `RunRowSkeleton`, `QueueRowSkeleton`,
     `ProjectCardSkeleton`, `FieldSkeleton`, `PageHeaderSkeleton`, `SectionHeadingSkeleton`.
3. Wire them into the boundaries. Where a pair of nested boundaries guards the same component (the
   outer `SectionBoundary` and the inner `QueryBoundary` in rows 1/2, 3/4 and 6/7), both receive the
   same skeleton element. They never show at the same time (the inner boundary renders only after
   the outer island resolved), so the skeleton is rendered once, never stacked.
4. On the project page the Active fallback renders the real `activeHeading` and a
   `QueueViewSkeleton` with the real `queueHeading` (both are server elements the page already
   builds before the boundary), so the headings and their copy are in the static shell at their
   final position and only the rows are placeholders. That is what makes the layout shift about 0
   there. `ProjectActiveRuns` takes that same element as a new `fallback` prop for its inner
   `QueryBoundary`.
5. Row 10 (History search) is left as is: `HistorySearchFallback` is the real box, disabled, with
   the exact size of the live one; a skeleton would be less informative and no more stable. Row 11
   (pagination) gets `HistoryLinksSkeleton` instead of `null`.
6. Error fallbacks (`ErrorPanel` in `QueryBoundary` and `SectionBoundary`) are not touched.

## Relevant Files

Use these files to implement the feature:

- `README.md` - describes each boundary and its fallback text ("Loading runs...", "Loading
  queue...", "Loading history...", fallback `null` for pagination, the served-document check around
  lines 280-300, 380-460, 530, 710-725, 820-845, 880-890, 1180). Every mention of a loading line
  must be updated to the skeleton in the same change.
- `AGENTS.md` - the rule book. Add one rule (Architecture, next to "Two boundaries, never a bare
  `Suspense`") for skeleton fallbacks; read the rules on `status-colors.test.ts` (no status hue),
  `layers.test.ts` (no z-index at or above `TOOLTIP_LAYER`), "Server components by default" (the
  list of stateless components) and "A static heading sits outside the boundary".
- `.adw/project.md` - Tests section lists the `e2e/*.md` journeys; add the new journey to that list
  (do not touch the nine headings).
- `src/app/(dashboard)/layout.tsx` - rows 1 and 2: the sidebar's `SectionBoundary` and the
  `QueryBoundary` in `SidebarActiveRuns`.
- `src/app/(dashboard)/projects/page.tsx` - rows 3 and 4: `/projects`' `SectionBoundary` and the
  `QueryBoundary` in `AllActiveRuns`.
- `src/app/(dashboard)/projects/[owner]/[repo]/loading.tsx` - row 5, the segment fallback.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx` - rows 6 to 11: Active `SectionBoundary`,
  `ProjectActiveRuns`' `QueryBoundary`, `queueSection`'s `QueryBoundary`, History list, search and
  pagination `SectionBoundary`s.
- `src/components/ProjectNav.tsx` - the card markup the sidebar skeleton mirrors (`li.w-64 shrink-0
md:w-auto`, `rounded-lg border px-3 py-2.5`, title, slug, `mt-2` counts row, `mt-1.5` last-run
  line) and the `ul` classes.
- `src/components/RunRow.tsx` - the run row markup the run skeleton mirrors (`li.rounded-lg.border.p-4`,
  first line in 24px boxes, `h-6` status column, `dl.mt-3.grid` with three fields for `active` and
  five for `history`).
- `src/components/QueueRow.tsx` - the queue rail row the queue skeleton mirrors (`li.group.relative.flex.gap-3`,
  rail span, `w-10 pt-4` gutter with an `h-6` round marker, `rounded-lg border p-4` card).
- `src/components/ActiveRunsView.tsx`, `src/components/QueueView.tsx`,
  `src/components/ActiveRunsOverview.tsx`, `src/components/RunHistoryList.tsx` - the section and
  list wrappers the skeletons mirror.
- `src/components/HistoryLinks.tsx` - the pagination `nav` box and the `w-6` arrow slot.
- `src/components/PageHeader.tsx`, `src/components/SectionHeading.tsx` - the header and heading
  boxes `loading.tsx` stands in for (`mb-8`, `text-2xl` h1, `mt-1 text-sm` subtitle; `mb-3`,
  `text-lg` h2, `mt-1 text-sm` description).
- `src/components/QueryBoundary.tsx`, `src/components/SectionBoundary.tsx` - unchanged; their
  `fallback` prop receives the skeletons.
- `src/components/HistorySearch.tsx` - `HistorySearchFallback`, kept as is (row 10).
- `src/lib/history-bookmark.ts` - `HISTORY_PAGE_SIZE` (3), imported, never redefined.
- `src/lib/status-colors.ts` - `STATUS_COLORS.neutral.border` for the skeleton's rail line (the
  real rail is `queued` amber; the skeleton is muted).
- `src/lib/status-colors.test.ts`, `src/lib/layers.test.ts` - source scans the new files must pass.
- `vitest.config.ts` - `src/**/*.test.ts` in the node environment; the new test is a `.ts` file
  that renders with `react-dom/server` and `createElement` (tsconfig has `"jsx": "react-jsx"`, so
  the imported `.tsx` transforms).
- `knip.json` - every new export must have a consumer.
- `e2e/test_row_full_title_top_align.md` - the journey format to model the new one on.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` - read
  before touching `loading.tsx`.

### New Files

- `src/components/Skeleton.tsx` - the shared primitive.
- `src/components/LoadingSkeletons.tsx` - the composed skeletons listed above.
- `src/components/LoadingSkeletons.test.ts` - the unit test (row counts, `aria-busy`, labels,
  `aria-hidden` blocks, reduced-motion class).
- `e2e/test_projects_skeleton_fallbacks.md` - the agent-driven journey the issue asks for.

## Implementation Plan

### Phase 1: Foundation

Read `loading.md` in the installed Next docs. Create `Skeleton` (one `<span>` with `aria-hidden`,
`block rounded-md bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-800` plus the caller's
`className`; a span so it is valid inside any inline or flex parent). Bars match line boxes by
height plus vertical margin, so a skeleton line is exactly as tall as the text line it replaces:

| Text line                      | Line box | Skeleton                                        |
| ------------------------------ | -------- | ----------------------------------------------- |
| `text-xs`                      | 16px     | `h-3 my-0.5`                                    |
| `text-sm`                      | 20px     | `h-4 my-0.5`                                    |
| base / `leading-6` / `h-6` box | 24px     | `h-4 my-1`, or a pill `h-5 my-0.5 rounded-full` |
| `text-lg`                      | 28px     | `h-5 my-1`                                      |
| `text-2xl`                     | 32px     | `h-7 my-0.5`                                    |

### Phase 2: Core Implementation

Build the composed skeletons in `LoadingSkeletons.tsx`, copying the box classes from the real
components (border `border-neutral-200 dark:border-neutral-800`, radius, padding, gaps, `space-y-3`,
`mb-10`) and replacing text with bars per the table. Widths are fixed Tailwind widths chosen to
approximate typical content (for example the project card's four count chips `w-14 w-16 w-20 w-14`,
so they wrap like the real `0 queued 0 running 0 completed 0 failed` line in a `w-64` card; check
it in the browser and adjust widths until the skeleton card is the real card's height at 1920 and
375). The containers carry `role="status" aria-busy="true" aria-label="..."`; the inner list
elements (`ul`, `ol`, `li`) sit inside the container with every visible block `aria-hidden`.

### Phase 3: Integration

Replace each fallback (rows 1 to 9 and 11), add the `fallback` prop to `ProjectActiveRuns`, rewrite
`loading.tsx`, update README, AGENTS and the profile's journey list, add the unit test and the
journey, then run the validation commands and check the served HTML.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the framework guide

- Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` and the
  README sections "What is prerendered and what is not" and "Prefetch and hydration of the Active
  runs", so the fallbacks stay what the shell carries.

### 2. Create the `Skeleton` primitive

- `src/components/Skeleton.tsx`, no `"use client"`:
  `export function Skeleton({ className = "" }: { className?: string })` returning
  `<span aria-hidden="true" className={`block rounded-md bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-800 ${className}`} />`.
- Neutral hues only (the status hue scan in `status-colors.test.ts`), no `z-` class (the layer scan
  in `layers.test.ts`), no em-dash in comments. A short doc comment says what it is and that
  `motion-safe:` is how reduced motion gets static blocks.

### 3. Create the composed skeletons

In `src/components/LoadingSkeletons.tsx` (no `"use client"`, imports only `react` types,
`Skeleton`, `STATUS_COLORS` and nothing from `@/data`):

- `ProjectCardSkeleton` (internal): `li.w-64 shrink-0 md:w-auto` > `div.rounded-lg border
border-neutral-200 px-3 py-2.5 dark:border-neutral-800` > title `h-4 my-0.5 w-32`, slug
  `h-3 my-0.5 w-44`, counts row `mt-2 flex flex-wrap gap-x-3 gap-y-1` with four `h-3 my-0.5` bars,
  last-run line `mt-1.5` `h-3 my-0.5 w-40`.
- `ProjectNavSkeleton` (exported): container `div` with `role="status" aria-busy="true"
aria-label="Loading projects"` > `ul.flex gap-2 overflow-x-auto pb-1 md:flex-col
md:overflow-visible md:pb-0` > three `ProjectCardSkeleton`.
- `FieldSkeleton` (internal): `div.min-w-0` > dt bar `h-3 my-0.5 w-12` > dd bar `mt-0.5`
  `h-4 my-0.5 w-28` (wrap the dd bar in a `div.mt-0.5` so the margin matches the real `dd`).
- `RunRowSkeleton({ variant })` (internal): `li.rounded-lg border border-neutral-200 p-4
dark:border-neutral-800` > `div.flex items-start justify-between gap-3` > left group
  `div.flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-2` with number `h-4 my-1 w-10`,
  title `h-4 my-1 min-w-0 flex-1 basis-40`, class chip `h-5 my-0.5 w-14 rounded-md`, mono id
  `h-3 my-1.5 w-16`, and for `active` the updated time `ml-auto h-3 my-1.5 w-40`; right column
  `div.flex h-6 shrink-0 items-center` with the pill `h-5 w-16 rounded-full`. Then
  `div.mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4` with three `FieldSkeleton` for
  `active` and five for `history` (Final phase, Branch, Started, Finished, Duration).
- `RunListSkeleton({ variant, rows })` (exported): container with `role="status"
aria-busy="true"` and `aria-label` `Loading history` or `Loading runs` by variant, > `ul.space-y-3`
  of `rows` `RunRowSkeleton` (keyed by index; static placeholders, so an index key is right here).
- `QueueRowSkeleton` (internal): `li.group relative flex gap-3` > rail
  `span[aria-hidden].pointer-events-none absolute top-7 -bottom-10 left-5 border-l
group-last:hidden ${STATUS_COLORS.neutral.border}` > gutter `div.flex w-10 shrink-0 justify-center
pt-4` with `Skeleton` `relative h-6 w-6 rounded-full` (no `z-` class needed: the rail is drawn
  behind it in DOM order; if it shows through, use `bg-background` on a wrapper, never a z-index) >
  card `div.min-w-0 flex-1 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800` >
  `div.flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2` with number `h-4 my-1 w-10`, title
  `h-4 my-1 min-w-0 flex-1 basis-40`, queued meta `ml-auto h-3 my-1.5 w-40`, pill column
  `span.flex h-6 shrink-0 items-center` with `h-5 w-16 rounded-full`.
- `QueueViewSkeleton({ heading })` (exported): `section.mb-10` > `{heading}` > container
  `role="status" aria-busy="true" aria-label="Loading queue"` > `ol.space-y-3` of two
  `QueueRowSkeleton`.
- `ActiveRunsViewSkeleton({ heading, queue })` (exported): fragment of `section.mb-10` >
  `{heading}` > `RunListSkeleton variant="active" rows={2}`, then `{queue}`, the same order and
  wrappers as `ActiveRunsView`.
- `ActiveRunsOverviewSkeleton` (exported): container `role="status" aria-busy="true"
aria-label="Loading active runs"` > `div.space-y-8` > one `section` > `div.mb-3 flex flex-wrap
items-baseline gap-x-2` (the `h3` box; a `div`, not an `h3`, so the outline has no empty heading)
  with name bar `h-4 my-1 w-40` and slug bar `h-3 w-36` > `ul.space-y-3` of two active
  `RunRowSkeleton`. Use the inner `ul` directly (not `RunListSkeleton`) so there is one `status`
  container, not two.
- `HistoryLinksSkeleton` (exported): container `div` with `role="status" aria-busy="true"
aria-label="Loading pages" className="flex items-center gap-3"` > `span.inline-flex w-6
justify-center` with `h-4 my-0.5 w-4`, the "N of M" bar `h-4 my-0.5 w-12`, the second arrow
  slot. 20px tall like `text-sm`.
- `PageHeaderSkeleton` (internal): `div.mb-8` > `h-7 my-0.5 w-64` > `div.mt-1` > `h-4 my-0.5 w-56`.
- `SectionHeadingSkeleton` (internal): `div.mb-3` > `div.flex items-center` with `h-5 my-1 w-24`
  > `div.mt-1` > `h-4 my-0.5 w-full max-w-xl`.
- `ProjectPageSkeleton` (exported): container `role="status" aria-busy="true"
aria-label="Loading project"` > `PageHeaderSkeleton` > `ActiveRunsViewSkeleton` with
  `heading={<SectionHeadingSkeleton />}` and `queue={<QueueViewSkeleton heading={<SectionHeadingSkeleton />} />}`
  > `section` > `SectionHeadingSkeleton` > `RunListSkeleton variant="history"
rows={HISTORY_PAGE_SIZE}`. Nested `aria-busy` containers inside an outer one are acceptable; if
  > an implementer prefers, the inner ones can take an optional `label` and omit the role when nested,
  > but keep it simple unless a screen-reader check shows repeated announcements.
- Doc comment at the top of the file: each skeleton mirrors one component's box classes; when that
  component's padding, border, gaps or line count changes, its skeleton changes in the same commit.

### 4. Wire the sidebar (rows 1, 2)

- `src/app/(dashboard)/layout.tsx`: replace both `"Loading..."` `<p>` fallbacks with
  `<ProjectNavSkeleton />`. Update the comment that calls the shell's hole "the loading line".

### 5. Wire `/projects` (rows 3, 4)

- `src/app/(dashboard)/projects/page.tsx`: both `"Loading runs..."` fallbacks become
  `<ActiveRunsOverviewSkeleton />`. The static `SectionHeading` above the boundary is unchanged.

### 6. Wire the project page (rows 6 to 9, 11; row 10 kept)

- In `ProjectPage`, after `activeHeading` and `queueHeading` are built:
  `const activeFallback = <ActiveRunsViewSkeleton heading={activeHeading} queue={<QueueViewSkeleton heading={queueHeading} />} />;`
- Active `SectionBoundary`: `fallback={activeFallback}`.
- `ProjectActiveRuns`: add a `fallback: ReactNode` prop, pass `fallback={activeFallback}` from the
  page, and use it as the `QueryBoundary` fallback (rows 6 and 7 share one element; never stacked).
- `queueSection`'s `QueryBoundary`: `fallback={<QueueViewSkeleton heading={queueHeading} />}`.
- History list `SectionBoundary`: `fallback={<RunListSkeleton variant="history" rows={HISTORY_PAGE_SIZE} />}`
  (import `HISTORY_PAGE_SIZE` from `@/lib/history-bookmark`, already imported from for other names).
- History pagination `SectionBoundary`: `fallback={<HistoryLinksSkeleton />}` instead of `null`.
  Known limit, note it in the comment: when the history has one page `HistoryLinks` renders
  nothing, so the skeleton disappears; at `md` and up the actions slot sits on the title row and
  this changes no height, below `md` the slot is its own line (`max-md:basis-full`) and that line
  collapses. Accepted: most projects have more than three completed runs.
- History search `SectionBoundary`: unchanged (`HistorySearchFallback`); add a one-line comment
  that it is deliberately not a skeleton (it is the real box, disabled, already the live size).
- Update the long History comment that says the shell carries "nothing for the links, a loading
  line for the list".
- The `activeHeading` and `queueHeading` elements are now rendered in the fallback and in the
  island. Only one of each is mounted at a time; during streaming the island's copy sits in a
  hidden segment until the `$RC` swap, so the tooltip ids (`section-active-detail`,
  `section-queue-detail`) are briefly duplicated in the DOM, never both visible. Note this in a
  comment.

### 7. Rewrite `loading.tsx` (row 5)

- `src/app/(dashboard)/projects/[owner]/[repo]/loading.tsx` returns `<ProjectPageSkeleton />`;
  update its comment.

### 8. Add the unit test

- `src/components/LoadingSkeletons.test.ts` (a `.ts` file, matched by `vitest.config.ts`): render
  each exported skeleton with `renderToStaticMarkup(createElement(...))` from `react-dom/server`
  and parse the markup with string matching (no DOM library is installed; do not add one). Cases:
  - `ProjectNavSkeleton`: one `aria-busy="true"`, `aria-label="Loading projects"`, `role="status"`,
    exactly 3 `<li`.
  - `RunListSkeleton` `history` with `rows={HISTORY_PAGE_SIZE}`: `HISTORY_PAGE_SIZE` `<li`, label
    `Loading history`, five field blocks per row (count `<dt`-equivalent wrappers by a stable
    marker, for example a `data-skeleton="field"` attribute on `FieldSkeleton`); `active` with 2
    rows: 2 `<li`, three fields per row.
  - `QueueViewSkeleton`: the passed heading text appears, then one `<ol`, 2 `<li`, label
    `Loading queue`.
  - `ActiveRunsViewSkeleton`: the heading appears before the list, 2 `<li` in the runs list, and the
    `queue` slot's text appears after the list.
  - `ActiveRunsOverviewSkeleton`: 2 `<li`, one `aria-busy`.
  - `HistoryLinksSkeleton`: `aria-busy="true"`, label `Loading pages`.
  - `ProjectPageSkeleton`: outer label `Loading project`, 2 active rows + 2 queue rows +
    `HISTORY_PAGE_SIZE` history rows.
  - For every exported skeleton: every element carrying `motion-safe:animate-pulse` also carries
    `aria-hidden="true"`, and no class `animate-pulse` appears without the `motion-safe:` prefix
    (the reduced-motion rule).
- Each case fails today because the module does not exist.

### 9. Add the e2e journey

- `e2e/test_projects_skeleton_fallbacks.md` with `## User Story`, `## Test Steps` (numbered, with
  `**Verify**` lines) and `## Success Criteria`, modelled on `e2e/test_row_full_title_top_align.md`.
  Why a journey: there is no component or Playwright layer here and the behaviour is what the
  streamed document and the browser show while data is pending, which a node unit test cannot see.
  Steps:
  1. Navigate to `/projects`, wait for the connection status `live`, read the first sidebar
     project's href.
  2. With `browser_evaluate`, `fetch` that project page's URL and read the full HTML text (the
     streamed document, fallbacks plus hidden segments). **Verify** it contains
     `aria-label="Loading runs"`, `aria-label="Loading queue"`, `aria-label="Loading history"`
     (or `Loading pages`) with `aria-busy="true"`, and does not contain `Loading runs...`,
     `Loading queue...`, `Loading history...` or `Loading project...`.
  3. Throttle with `browser_run_code_unsafe`: open a CDP session (`page.context().newCDPSession(page)`)
     and `Network.emulateNetworkConditions` with `latency: 2000`, `downloadThroughput: 50000`,
     `uploadThroughput: 50000`, `offline: false`; install a `PerformanceObserver` for
     `layout-shift` (buffered) through `page.addInitScript` that sums `value` of entries without
     `hadRecentInput` into `window.__cls`.
  4. Navigate to the project page and immediately `browser_snapshot`. **Verify** at least one
     element with `aria-busy="true"` is present (sidebar, Active, Queue or History) and the page is
     not just a text line.
  5. Wait until a `<code>` with an `adw_id` or the `History` empty state is visible and no
     `aria-busy="true"` remains. **Verify** `window.__cls` is below `0.1` (the "good" CLS
     threshold; expect about 0 on a project whose Active and Queue have rows).
  6. Remove throttling (`Network.emulateNetworkConditions` with `latency: 0`,
     `downloadThroughput: -1`, `uploadThroughput: -1`).
  7. Emulate `prefers-reduced-motion: reduce` (`page.emulateMedia({ reducedMotion: "reduce" })`),
     re-fetch the HTML of step 2 into a detached element, insert one skeleton block into the page
     and **Verify** its computed `animationName` is `none`.
  8. Take screenshots of the throttled loading state at 1920x1080 and at 375x667.
- Add `e2e/test_projects_skeleton_fallbacks.md` to the journey list in `.adw/project.md` (Tests
  section), keeping the headings untouched.

### 10. Update documentation

- `README.md`: replace every description of a loading line ("Loading...", "Loading runs...",
  "Loading queue...", "Loading history...", "Loading project...", pagination fallback `null`) with
  the skeleton that now stands there, including the served-document check (around line 827: the
  skeletons, not the loading lines, sit at their sections' positions) and the `staleTimes` text
  around line 841 ("flash the History skeleton").
- `AGENTS.md`: add a rule under Architecture beside "Two boundaries, never a bare `Suspense`":
  every fallback on the projects side is a skeleton from `src/components/LoadingSkeletons.tsx` built
  on the one `Skeleton` primitive (`motion-safe:animate-pulse`, neutral surface, `aria-hidden`
  blocks inside a `role="status" aria-busy="true"` container with an `aria-label`); a skeleton
  mirrors its component's box classes and line count and changes with it; nested boundaries around
  the same component take the same element; the project page's Active fallback carries the real
  Active and Queue headings; `HistorySearchFallback` stays the disabled box; error panels are
  unchanged. Add `Skeleton` and the `LoadingSkeletons` components to the list of components with
  no state.

### 11. Verify in the browser and the served HTML

- `yarn build`, then `yarn start` on `$PORT` from `.ports.env` (never a server this run did not
  start). `curl` `/projects` and the review project page and check the raw HTML holds the
  `aria-busy="true"` containers at the fallback positions and still holds the run rows (an
  `adw_id` in a `<code>`) in the streamed completions. Stop the server afterwards.
- Compare skeleton card and row heights to the real ones at 1920x1080 and 375x667 (throttled
  screenshot versus loaded screenshot); adjust bar widths if the project card count chips wrap
  differently.

### 12. Run the validation commands

- Run every command in `Validation Commands`; all must pass.

## Testing Strategy

### Unit Tests

`src/components/LoadingSkeletons.test.ts` renders each exported skeleton to static markup in the
node environment and asserts the row counts (3 project cards, 2 active rows, 2 queue rows,
`HISTORY_PAGE_SIZE` history rows, 3 or 5 fields per run row by variant), the container's
`role="status"`, `aria-busy="true"` and `aria-label`, that every animated block is `aria-hidden`,
that the animation is always `motion-safe:` prefixed, and that the `heading` and `queue` slots are
rendered in `ActiveRunsView`'s order. The existing scans (`status-colors.test.ts`,
`layers.test.ts`) also cover the new files automatically.

### Test Coverage

- `src/components/LoadingSkeletons.test.ts` (unit, vitest): catches a skeleton losing or gaining a
  row, losing its `aria-busy`/label, an animated block not hidden from assistive tech, or a pulse
  that ignores reduced motion; nothing tests fallbacks today and every case fails without the new
  module.
- The existing source scans in `src/lib/status-colors.test.ts` and `src/lib/layers.test.ts` catch a
  status hue or a high z-index slipping into the skeletons (no new code needed).
- Browser evidence (skeletons visible before content, CLS) comes from the journey in task 9, which
  is an acceptance gate, not part of this list.

### Edge Cases

- A project with no active runs or nothing queued: the skeleton's two rows collapse to the shorter
  dashed empty state; a shift up, not down, and below the fold on most viewports. Accepted.
- History with a single page: the pagination skeleton disappears (see task 6), a one-line shift
  below `md` only.
- A long issue title that wraps: the real row is taller than the one-line skeleton row.
- Inner `QueryBoundary` fallback reached on a still-pending hydrated query: same skeleton as the
  outer boundary, never two stacked.
- Reduced motion: blocks are static, no animation.
- Dark mode: `bg-neutral-800` on the `--background` dark page, visible but muted.
- Mobile (375px): the sidebar skeleton scrolls horizontally like the real list (`w-64` cards).
- Error during streaming: the boundary's error panel replaces the skeleton exactly as it replaced
  the loading line.

## Acceptance Criteria

- No `Loading...`, `Loading runs...`, `Loading queue...`, `Loading history...` or
  `Loading project...` text remains in `src/` (`grep -rn "Loading\(\.\.\.\| runs\.\.\.\| queue\.\.\.\| history\.\.\.\| project\.\.\.\)" src` is empty).
- Rows 1 to 9 and 11 of the issue's table render a skeleton; row 10 keeps `HistorySearchFallback`.
- One `Skeleton` primitive in `src/components/Skeleton.tsx` is the only element with the pulse
  class, and the pulse is `motion-safe:animate-pulse`.
- Each skeleton container has `role="status"`, `aria-busy="true"` and an `aria-label`; every
  placeholder block is `aria-hidden`.
- Skeletons render 3 sidebar cards, 2 active run rows, 2 queue rows and `HISTORY_PAGE_SIZE` history
  rows, with the real components' outer classes.
- On a project page the Active and Queue headings are present in the static shell while the rows
  load.
- Cumulative layout shift while a project page with active and queued rows loads under throttling
  is below 0.1 and near 0.
- Error panels unchanged; `QueryBoundary.tsx` and `SectionBoundary.tsx` untouched.
- README, AGENTS and the profile's journey list describe the skeletons; no em-dash anywhere.
- All validation commands pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint` - ESLint over the new components, the test and the edited pages.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`: the new `fallback` prop on
  `ProjectActiveRuns` and the skeleton props type-check (do not stage `next-env.d.ts`).
- `yarn knip` - every new export (`Skeleton`, `ProjectNavSkeleton`, `ActiveRunsOverviewSkeleton`,
  `ActiveRunsViewSkeleton`, `QueueViewSkeleton`, `RunListSkeleton`, `HistoryLinksSkeleton`,
  `ProjectPageSkeleton`) has a consumer, and nothing internal is exported.
- `yarn format:check` - Prettier over every touched file, the spec and the journey included.
- `yarn test` - the new skeleton test plus the status hue and layer scans over the new files.
- `yarn build` - the fallbacks prerender into the static shell under `cacheComponents` and the
  build reads the database as before (needs `.env.local`).

## Notes

- No new dependency. The unit test uses `react-dom/server` (already installed with `react-dom`)
  and string matching; do not add a DOM library or a component test layer.
- Shimmer versus pulse: Tailwind's `animate-pulse` is chosen because it needs no custom keyframes
  in `globals.css` and `motion-safe:` gives the reduced-motion behaviour for free. A sweeping
  shimmer can replace it later inside `Skeleton` alone.
- The `/` summary page and `SectionNav`'s `HeaderLink` fallback are out of scope, as the issue says.
- Issue #3 (relative time labels) is unaffected: no skeleton reads the clock.
- Commits follow the profile: Conventional Commits with a bare type, no trailers.
