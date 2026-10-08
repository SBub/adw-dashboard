# Project page: Active, Queue and History sections

**Specifications:**

- specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md
- specs/issue-134-adw-b6fb710c-sdlc_planner-remove-halted-from-summary.md
- specs/issue-137-adw-b37d7caa-sdlc_planner-simplify-queue-row-layout.md
- specs/issue-146-adw-7a7f315b-sdlc_planner-show-history-run-cost.md
- specs/issue-147-adw-50c77227-sdlc_planner-history-card-pr-link.md
- specs/issue-148-adw-d2fdf4c1-sdlc_planner-history-page-turn-keep-scroll.md

## Overview

The project page at `/projects/<owner>/<repo>` (`src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`): its Active section, the Queue rail below it, and the server-rendered History with keyset paging and search through `?q`.

## How it works

### Runs: active and history

The project page splits a project's runs by lifetime, and the two halves take
two different paths to the screen.

**Active** (status `running` or `failed`) is live. It is one React Query entry
for every project, `queryKeys.activeRuns`, holding the `ActiveRuns` payload:
read per request on the server, hydrated, and patched in the browser by the
Realtime listener. The project page selects its own rows from it
(`activeRunsOf`); `/projects` lists all of them grouped by project.
A failed run is still in it because the toolkit can resume a failed run; it
leaves the list only by completing or being deleted.

**History** (status `completed`) is immutable, so it is not in the query cache
at all. The page renders it on the server inside a `"use cache"` scope tagged
`history:<slug>`; no realtime event touches it and the catch-up never reads it.
It changes only when the server is told to re-render it.

Each section's heading, one-line description and info-button detail are
rendered by `SectionHeading`, and the copy lives in the project page
(`src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`) next to the sections.
The detail popover sits on `TOOLTIP_LAYER` (`z-50`, `src/lib/layers.ts`),
above the queue rail markers (`z-10`) and anything else positioned below a
heading.

Each run row shows the issue title (`adw.runs.issue_title`, published by the
toolkit) in full after the issue number, wrapping onto as many lines as it
needs (a long unbroken token such as a URL or a path breaks too), with every
other element of the row (the class badge, the `adw_id`, and on Active rows
`Updated <time>` and the status pill) top-aligned on the title's first line
(History rows have no status pill and end the top row with the `adw_id`); runs published before
the toolkit wrote it have no title and show the number alone. The title keeps a
10rem flex basis, so on a narrow screen the issue class badge and the `adw_id`
wrap to the next line instead of squeezing the title to a single character.

The project page renders its header and Active like this:

1. `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx` has a `"use cache"`
   function `getProject(slug)`, tagged `projects` (the layout's tag), that
   finds the slug in `getProjects()`. It reads no clock. The page body and
   `generateMetadata` both read it, so the slug costs one cached read.
2. The page decides not-found from it: `getProject(slug) === null` means
   `notFound()` before any boundary renders. `generateStaticParams` is
   unchanged. The caveat from before stands: for a slug outside
   `generateStaticParams` the static shell has already gone out with a 200
   when `notFound()` runs, so the not-found panel streams in as a soft 404.
   A project added after the last `projects` fill 404s until that scope
   refills (15 minutes, or `revalidateTag("projects")`), the lifetime the
   sidebar already has.
3. It renders `PageHeader` (the project's name, slug and repository link)
   itself, then a `SectionBoundary` around
   `ProjectActiveRuns`, an async server component that awaits
   `getActiveRunsState()` (per request, see `app_docs/active-runs.md`, "Prefetch and hydration of the
   Active runs") and renders `<HydrationBoundary state={state}>` around
   `<QueryBoundary><ActiveRunsView projectId slug heading queue /></QueryBoundary>`.
   Both boundaries take the same fallback element, built by the page:
   `ActiveRunsViewSkeleton` with the real Active heading and two skeleton run
   rows, then `QueueViewSkeleton` with the real Queue heading and two
   skeleton rail rows. The headings are therefore in the static shell at their
   final position while the rows stream in.

   The queue is a second entry beside it. A `"use cache"` function,
   `getQueueState(slug)`, returns
   `prefetch(queryKeys.queue(slug), () => getQueue(slug))`, untagged (no server
   writer drops it; it lives in the static shell and the browser
   keeps it current). The page awaits it together with `getProject` in one
   `Promise.all`, so the two reads do not waterfall; the not-found decision
   reads only the project. The queue gets its own
   `<HydrationBoundary state={queue.state}>` around its own
   `<QueryBoundary fallback={<QueueViewSkeleton heading={queueHeading} />}><QueueView slug={slug} heading={queueHeading} /></QueryBoundary>`,
   passed to `ActiveRunsView` as its `queue` slot, which renders it after the
   Active section: the Queue sits below Active, and a failed queue read shows
   its panel in that slot while the header and Active stay up. The page builds the Queue and Active
   headings (`SectionHeading`, with their copy) and passes them in as the
   `heading` slots of `QueueView` and `ActiveRunsView`, so the headings stay
   server components inside the two client views.

4. `src/components/ActiveRunsView.tsx` is a client component that reads
   `useSuspenseQuery({ ...activeRunsQuery, select })`, the select being
   `activeRunsOf(data.active, projectId)`, and renders the Active section
   (its `heading` slot, then `RunRow`, variant `active`, or "No runs in
   progress.") from the rows as stored; no view model is built and no clock
   is read. It has no header and no not-found branch: both are the page's.
   `src/components/QueueView.tsx` is its counterpart for the queue: the same
   `useSuspenseQuery` options under `queryKeys.queue(slug)`, its `heading` slot
   ("First in, first out. The top item starts when the running one finishes."
   plus the `adw:queued` label hint), and either the dashed `Nothing queued.`
   panel or the queue rail: an ordered list of `QueueRow`
   (`src/components/QueueRow.tsx`), keyed by `issue_number`. Each row reserves
   a fixed left gutter (the marker now, a drag handle later) with a marker on
   an amber line (`STATUS_COLORS.queued.border`, drawn per row from its marker
   to the next and hidden on the last): the head row's is filled
   (`STATUS_COLORS.queued.dot`) and reads `next`, the others are hollow
   (`STATUS_COLORS.neutral.border`) and carry their ordinal. Ordinals come from
   `queuePositions` in `src/lib/queue-order.ts`, the rank among the queued items
   in ledger order (`position`, then `issue_number`, the comparator
   `byQueuePosition` that `applyQueueChange` uses too), never from the array
   index and not from `queued_at`: the toolkit's runner takes the first queued
   item in ledger order, a move reorders the ledger without restamping
   `queued_at`, and a retry restamps it without moving the item. Beside the
   marker, the card holds the issue number as a GitHub
   link, the title (omitted when `null`) and the status pill, in one row that
   does not wrap: the title is shown in full, wrapping and taking the
   remaining width, and every element, the pill included, is top-aligned on
   the title's first line, the pill right-aligned at every width. `source`
   and `queued_at` are read but not rendered. The rail line runs from marker
   centre to marker centre whatever the card's height.
   Every row ends with the amber `queued` `StatusBadge`, the same component
   and colour map as a run row's status.

History is rendered below that, by the same page:

5. `getHistory(slug, bookmark, q)` is a second `"use cache"` function in the
   page, tagged `history:<slug>`, with an explicit
   `cacheLife({ stale: 300, revalidate: 86400, expire: 2592000 })`, that
   returns `getCompletedRuns(slug, bookmark, q)`: one page of plain rows plus
   `costs`, each shown run's cost, read by `getCompletedRuns` inside the same
   tagged `"use cache"` scope (so the costs drop with `history:<slug>`
   together with the rows), no clock read, no React Query. The page renders the History heading row
   itself, statically: a `SectionHeading` whose `<h2>History</h2>`,
   description and info button sit outside every boundary, and whose
   `controls` slot holds the `HistorySearchBox` island, right after the
   title, in a `SectionBoundary` (fallback the same box, disabled; detail
   "Search did not load."), and whose `actions` slot holds the
   `HistoryPagination` island in another (fallback `HistoryLinksSkeleton`,
   the two arrow slots and an "N of M" bar; detail
   "Pagination did not load."), at the right edge of the row and, below
   `md`, on a second line, right-aligned. Below the row, the
   `CompletedRuns` island sits in a third `SectionBoundary` (fallback a
   `RunListSkeleton` of `HISTORY_PAGE_SIZE` history rows, detail "This
   project's history did not load.").
   The islands are async server components in the page file; each awaits the
   page's `searchParams`. `HistorySearchBox` normalises `?q` and hands it to
   the client `HistorySearch` as its initial text; the other two decode
   `?after` and `?before` with `readHistoryBookmark` and `?q` with
   `readHistoryQuery`, and call `getHistory`. `HistoryPagination` renders
   `HistoryLinks` with the two arrow links (`newerHref`, `olderHref`, built
   with `historyHref`, `null` when there is nothing in that direction) and
   the page's `page` and `pageCount`; `CompletedRuns` renders `RunHistoryList` with
   the page's `items` and `costs`, the slug and the empty-state text ("No completed runs
   yet.", or "No completed runs match ..." during a search), and
   `RunHistoryList` passes each run's cost to its `RunRow`. Each boundary keeps Active and the other
   island on screen when its island fails: if `getHistory` throws (database
   down, an RLS change), the boundary shows its panel ("Could not load.", its
   detail, Retry) in its own slot, instead of the segment's `error.tsx`
   replacing the whole pane. Retry there refreshes the route
   (`router.refresh()`) and then resets the boundary, so the island is
   re-rendered by the server rather than replayed from the failed render; see
   "SectionBoundary" below. The `searchParams` read makes each island a
   request-time hole, which is what lets the tag revalidation below reach it;
   see `app_docs/history-revalidation.md`, "What is prerendered and what is not". `src/components/HistoryLinks.tsx`
   and `src/components/RunHistoryList.tsx` are server components with no
   state: the all/completed/failed toggle is gone because history is
   completed-only now. `RunRow` in the `history` variant shows Branch (in
   full, spanning two of the 4 `sm` columns), Finished, Duration, PR (only
   when the run has a `pr_number`: `#<n>` linking to
   `https://github.com/<slug>/pull/<n>` in a new tab, built by
   `pullRequestHref`) and Cost (only when the run has a metrics row,
   formatted by `costLabel`), on one row from `lg` (a grid where Branch takes
   the flexible width and Finished, Duration, PR and Cost their content
   width, so Finished is never ellipsized; at `sm` the 4-column grid puts PR
   and Cost on a second row) and stacked at 375px; it has no `completed` pill, no `Final
phase` and no `Started`.

   History is paged three runs at a time. The URL of a later page carries
   `?after=<bookmark>` or `?before=<bookmark>`, an opaque base64url JSON
   `{ slug, direction, finished_at, adw_id }` (`finished_at` kept verbatim,
   microseconds included). An `after` bookmark is the last row the previous
   page showed, and the page is the rows strictly older than that tuple in the
   order `finished_at desc, adw_id desc` (`adw_id` is unique within a project,
   so the order is total). `updated_at` is not the key: a trigger stamps it on
   every write, so a backfill or a late `pr_number` would reorder History,
   while `finished_at` is written once by the terminal save. A bookmark of the
   older `updated_at` shape reads as page one. A `before` bookmark is the first row the following
   page showed, and the page is the rows strictly newer than it, read oldest
   first and reversed for display. A run completing while a visitor is on page
   two adds a row to page one and never shifts page two. The bookmark is
   decoded in each island, outside the cache scope; a missing, malformed or
   repeated parameter, one handed out for another project, one in the
   parameter of the other direction (the direction is checked), or `?after`
   and `?before` together, is page one, never an error. The History header is
   one row: the title on the left, then a left arrow, the indicator `N of M`
   and a right arrow. The right arrow is `?after=` of the last shown row; the
   left arrow is `?before=` of the first shown row, or page one itself when
   the newer rows fit on one page, so the head of the list is always the full
   page one. A missing arrow keeps its slot, and the whole row is absent when
   there is a single page. A page turn keeps the scroll position: the arrows
   (`src/components/HistoryPageLink.tsx`) push the new URL with
   `scroll: false` (each page stays in the browser history) inside the
   shared `HistoryTransition`, and `HistoryResults` dims the list
   (`aria-busy="true"`) until the new rows arrive. The arrows remain real
   links, so middle-click and open in a new tab use the same URL. `N of M`
   is never in the URL: `N` is one plus the
   count of newer completed runs divided by the page size (rounded up), `M`
   is the total divided by the page size (rounded up, never less than `N`),
   both counted in the same cached `getHistory` entry as the rows. Every page
   of a project shares the one `history:<slug>` tag on purpose: the bookmark
   argument is part of the cache key (one entry per page), and one tag drop
   after a completion expires all of them, since a new row changes page one
   and every page's `N of M`, which is recomputed with the rows. There is no
   per-page tag. The
   lifetime is explicit: stale after 5 minutes, refreshed in the background
   after a day, expired after 30 days; a completion drops the tag long before
   that.

   History is searchable through the URL: the box next to the title
   (`src/components/HistorySearch.tsx`, a client component with local text)
   writes `?q=<text>` 300 ms after the last keystroke (a small `setTimeout`
   hook, `src/hooks/use-debounced-callback.ts`) with `router.replace` inside a
   transition, always to page one (`historyHref(slug, null, q)`, so `?after`
   and `?before` are dropped), and its Clear button removes `q`. The islands read `q` beside
   the bookmark; `readHistoryQuery` in `src/lib/history-search.ts` trims it, cuts
   it at 60 characters and removes `*`, and `historySearchFilter` turns it
   into a PostgREST `or` of `ilike` on the issue title, the branch name and
   the run id (with `%`, `_` and `\` matched literally) plus the issue number
   when the text is an integer, ANDed with the keyset filter. Each search is
   its own cache entry under the same `history:<slug>` tag, so a completion
   still expires every one, and both arrows carry `q`, so paging stays
   inside the search, and `N of M` counts only the matching runs. `HistoryTransition` shares the transition of the box and the arrows with
   `HistoryResults`, which dims the list while the new page streams in
   instead of falling back to its skeleton.

## Rules

- The Queue section sits below Active through `ActiveRunsView`'s `queue` slot
  prop: the page builds it (its own `HydrationBoundary` around its own
  `QueryBoundary` around `QueueView`) and passes it in, and `ActiveRunsView`
  renders it after the Active section. Do
  not read the queue inside `ActiveRunsView`, merge it into the runs entry,
  or share one boundary between the two. The Queue and
  Active headings arrive the same way, as the `heading` slot props of
  `QueueView` and `ActiveRunsView`. The project header (`PageHeader`) is
  rendered by the page, not by `ActiveRunsView`, which has no not-found
  branch.
- The Queue is a rail. A row's ordinal (`next` for 1) comes only from
  `queuePositions` in `src/lib/queue-order.ts`: the rank in ledger order
  (`position`, then `issue_number`), never `queued_at` and never the array
  index. `byQueuePosition` in the same file is the one ledger comparator,
  shared by `queuePositions` and `applyQueueChange`; both are pure and tested
  in `src/lib/queue-order.test.ts`, and every change to them goes with a test
  case. A row holds the issue link, the title and the status pill, and nothing
  else (no source badge, no queued time); the title is shown in full and
  wraps (never `truncate`, `line-clamp` or a `title` tooltip for it), every
  element is top-aligned on the title's first line, and the pill stays on
  that line at every width; it shows no label chip, no wait
  and no start hint. Rows stay keyed by `issue_number`, and the
  left gutter stays reserved for the marker and the future drag handle. The
  rail line and the `next` marker take their colours from
  `STATUS_COLORS.queued`, the hollow markers from
  `STATUS_COLORS.neutral.border`.
- History is server-rendered and never enters the React Query cache. It is
  read by `getCompletedRuns` inside the page's `getHistory` (`"use cache"`,
  ``cacheTag(`history:${slug}`)``), and so are the shown runs' costs, by the
  same call, never in the query cache, and rendered by the page's two async
  islands, `HistoryPagination` and `CompletedRuns`, each under its own
  `SectionBoundary` (the third island, `HistorySearchBox`, reads only `?q`
  and no history rows). No `queryKeys` entry, no `useSuspenseQuery`, no
  `setQueryData`, no realtime reducer and no catch-up read may touch completed
  runs. If a component needs history rows, it gets them as props from the
  page.
- The queue never touches History: a queue event fires no `onHistoryChange`,
  calls no server action and drops no tag.
- History is paged by a keyset bookmark. Everything that decides a page lives
  in `src/lib/history-bookmark.ts` (pure, tested in
  `src/lib/history-bookmark.test.ts`): `HISTORY_PAGE_SIZE` (defined there and
  nowhere else), the base64url codec (the payload carries its `direction`),
  `readHistoryBookmark`, `historyKeysetFilter`, `historyNewerFilter`,
  `historyOrderAscending`, `historyItems`, `toHistoryPage` and `historyHref`.
  Every change to the bookmark, the filters, the order or the page split goes
  with a test case.
- History is searched through `?q`. It is normalised by `readHistoryQuery` in
  `src/lib/history-search.ts` (trim, `*` removed, cut at
  `HISTORY_QUERY_MAX_LENGTH`, empty or repeated is `null`) in the islands,
  outside the cache scope, and turned into the PostgREST filter only by
  `historySearchFilter` (LIKE and PostgREST escaping, `issue_number` only for
  an integer that fits `int4`), both pure and tested in
  `src/lib/history-search.test.ts`. Every change to either goes with a test
  case. The search never touches Active, and never filters on the client.
- A static heading sits outside the boundary of the hole it labels: the
  `History` `<h2>` is rendered by the page, beside and above the islands, never inside a
  `SectionBoundary` or its fallback, so it is in the static shell.
- `HistorySearchBox`, `HistoryPagination` and `CompletedRuns` are the only
  readers of `searchParams`, and each awaits it itself. The page passes the promise down
  unawaited and never awaits it, nor do `getProject` or `generateMetadata`,
  or the whole page turns request-time. `?after` and `?before` are decoded by
  `readHistoryBookmark` and `?q` by `readHistoryQuery` in the islands,
  outside the cache scope (an error thrown inside `"use cache"` loses its
  class), and never surface an error: anything invalid or foreign, a cursor
  of the other direction, or both parameters at once is page one.
- Every page of a project shares `historyTag(slug)`; never add a per-page or
  per-query tag. The bookmark and the search text are `getHistory` arguments,
  so they are already part of the cache key, and one tag drop must expire
  every page and every search a completion changes.
- Two islands calling `getHistory` with the same arguments are one cache read
  per request: Next joins an identical `"use cache"` invocation within the
  request (debug line `joining intra-request invocation`). Do not add a React
  `cache()` wrapper or pass one island's result to the other.
  `getHistory` keeps its explicit
  `cacheLife({ stale: 300, revalidate: 86400, expire: 2592000 })`; never an
  `expire` under 5 minutes.
