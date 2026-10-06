# Feature: Queue rail with ordinals and wait time

## Metadata

issue_number: `72`
adw_id: `bb4ca4fe`
issue_json: `{"number":72,"title":"Queue: rail with ordinals and wait time to make first-in-first-out explicit","body":"The Queue section lists items in run order but nothing marks position, so it reads as an unordered list (observed with toolkit items #40, #41, #36).\n\nRender the queue as a rail:\n\n1. A thin vertical line down the left gutter with one dot per row. The head row's dot is filled and labelled `next`; the others are hollow and carry their ordinal (2, 3, ...). Position is computed from the data (ascending `queued_at`, as the runner orders it), never from the array index, so a later reorder only changes positions.\n2. Under each row's title, the wait so far from `queued_at`(\"waiting 12 min\"), rendered through the existing no-clock-in-render convention (same approach as`Timestamp`; it must not break the client prerender). The head row adds \"starts when the running run finishes\" when the project has a running run, otherwise \"starts with the next runner\".\n3. The section description becomes: \"First in, first out. The top item starts when the running one finishes.\" Keep the label hint about `adw:queued`.\n4. Keep each row a self-contained component (`QueueRow`) with a stable key per issue and the left gutter reserved for the dot and a future drag handle (see the reorder issue). The realtime queue reducer stays pure; no behaviour change there.\n5. Unit tests for the position derivation and the wait label; a Playwright snapshot of a project with three queued items.\n\nColour: the rail and dots use the queued amber from `src/lib/status-colors.ts`; the hollow dots the muted border colour.\n"}`

## Feature Description

The Queue section of a project page (`/projects/<owner>/<repo>`) lists the
project's `queued` items in the order they will run, but nothing on screen says
so: the rows look like an unordered list of cards. This feature renders the
queue as a rail:

- A thin amber vertical line down a reserved left gutter, with one marker per
  row. The head row's marker is filled amber and reads `next`; every other row
  has a hollow marker (muted neutral border) carrying its ordinal (`2`, `3`,
  ...). The ordinal is derived from the data (the ledger order), never from the
  array index.
- Under each row's title, a second line with the wait so far
  (`waiting 12 min`), and on the head row a start hint: `starts when the
running run finishes` when the project has a `running` run in Active, else
  `starts with the next runner`.
- The section description becomes "First in, first out. The top item starts
  when the running one finishes." followed by the existing `adw:queued` label
  hint.

The value: a glance tells which issue runs next, how many are ahead of a given
one and how long each has waited, which today needs the toolkit's CLI.

## User Story

As a developer watching a project's ADW queue on the dashboard
I want to see each queued issue's place in line, which one is next and how long it has waited
So that I know when my issue will start without running `adw_queue.py` on the machine

## Problem Statement

`QueueView` renders an `<ol>` of bordered cards with no visible ordinal, no
"next" marker and no age beyond an absolute `Queued <timestamp>`. Users read it
as an unordered set (observed with toolkit items #40, #41, #36). The wait time
needs the current time, which this codebase deliberately never reads in render
(`cacheComponents` fails the server prerender and silently drops a client
component out of the static HTML on the first clock read), so a naive
`Date.now()` in the row is not an option.

## Solution Statement

1. **Position from the data.** A pure helper `queuePositions(items)` in a new
   `src/lib/queue-order.ts` sorts a copy of the items by the ledger comparator
   (`position asc, issue_number asc`) and returns a `Map<issue_number, ordinal>`
   (1-based). `QueueView` calls it once and passes `position` to each
   `QueueRow`; the head is ordinal 1. The comparator moves from
   `src/data/apply-queue-change.ts` into that module as `byQueuePosition`, and
   the reducer imports it (same function, no behaviour change; the existing
   reducer tests prove it).

   Deviation from the issue text, on purpose: the issue says "ascending
   `queued_at`, as the runner orders it". The runner does not order by
   `queued_at`. In the toolkit, `Queue.next_queued()`
   (`adw-toolkit/adws/adw_modules/queue_ops.py`) takes the first `queued` item
   in ledger list order, `move_issue` reorders the list without touching
   `queued_at`, and `retry_issue`/`apply_classification` restamp `queued_at`
   without moving the item. The ledger index is mirrored as
   `queue_items.position` ("0-based index in the ledger, the FIFO order",
   toolkit `supabase/README.md`), and `getQueue` and `applyQueueChange` already
   order by it. Ranking by `queued_at` would label a moved or retried item with
   the wrong ordinal and could put `next` on a row that is not next. Ranking by
   `position` honours the issue's actual requirement (computed from data, not
   the index, so a reorder only changes positions). `position` is a ledger
   index that also counts non-queued items, so the ordinal is the rank among
   the queued items, not `position + 1`.

2. **Wait label without a clock in render.** A pure helper
   `waitLabel(queuedAt, now)` in `src/lib/queue-order.ts` (no clock, unit
   tested with fixed timestamps) formats the span. The current time comes from
   a new `useNow()` hook in `src/hooks/use-now.ts`, a `useSyncExternalStore`
   over a module store whose value is `null` until the first subscriber
   attaches:
   - `getServerSnapshot` returns `null`, so the server prerender and the client
     prerender read no clock and render no wait text (the row itself, with its
     marker, title and hint, is in the static HTML as today).
   - `getSnapshot` returns the stored value (a number or `null`) and reads no
     clock, so React's render reads no clock in the browser either.
   - The only clock read is in `subscribe` (stamp on first attach, then a
     30-second `setInterval` that re-stamps and notifies), which React calls
     after commit, never in render. One shared interval for all subscribers,
     cleared when the last one detaches.
     This is the leaf-level shape issue #3 proposes, applied to a single leaf:
     `QueueWait`, a tiny `"use client"` component that calls `useNow()` and
     `waitLabel`. Its server snapshot is `null` rather than a data-derived
     `fetched_at` because `getQueue` has no `fetched_at` (and must not get one:
     AGENTS.md says it reads no clock), and a frozen build-time "waiting" in the
     shell would be wrong for up to the shell's lifetime anyway. A tick
     re-renders only the `QueueWait` leaves, never `QueueView` or `QueueRow`.

3. **Head hint from the Active entry.** `QueueView` reads the project's runs
   entry (`queryKeys.runs(slug)`, already hydrated by the page's runs
   `HydrationBoundary`, which encloses the queue slot) with a second
   `useSuspenseQuery` using the same options as `ActiveRunsView`
   (`staleTime: "static"`, `refetchOnMount: false`) plus a `select` through a
   pure `hasRunningRun(data)` helper. It is a cache hit, so no fetch and no
   clock; it follows Realtime because the runs listener writes that same entry.
   The hint text comes from a pure `queueStartHint(hasRunning)` helper. This
   does not merge the queue into the runs entry or read the queue inside
   `ActiveRunsView` (both forbidden); it reads a second key in the queue view.

4. **Rail layout.** `QueueRow` keeps rendering one `<li>`, keyed by
   `issue_number` in `QueueView`, now as `flex` with a fixed-width gutter
   (`w-10 shrink-0`, reserved for the marker and a future drag handle) and the
   existing card beside it. The vertical line is one `aria-hidden` element
   positioned behind the gutter's centre on the `<ol>` (`relative`), drawn as a
   left border with `STATUS_COLORS.queued.border`. The head marker uses
   `STATUS_COLORS.queued.dot` with white text reading `next`; the hollow
   markers use `STATUS_COLORS.neutral.border` on the page background with the
   ordinal in muted text. No inline `amber` class anywhere
   (`src/lib/status-colors.test.ts` scans for it).

## Relevant Files

Use these files to implement the feature:

- `README.md` - The "Prefetch and hydration" Queue paragraph (`QueueView`/`QueueRow` description) and the clock section (labels, issue #3, `fetched_at`) must be updated in place to describe the rail, `useNow` and `QueueWait`.
- `AGENTS.md` - Rule book. The clock rule ("the only argument-less `new Date()`/`Date.now()` ... is `getActiveRuns`'s `fetched_at`"), the client components list, the "no view model" rule and the Queue section rules all need amending in the same change.
- `.adw/project.md` - ADW profile; read for commands. No script, port, env file or docs location changes, so it is not edited.
- `src/components/QueueView.tsx` - Client view of the queue entry; gains the runs `select` read, the `queuePositions` call and the rail `<ol>`.
- `src/components/QueueRow.tsx` - One row; gains the gutter marker, the second line (`QueueWait` plus the head hint) and the `position`/`hasRunning` props. Stays without `"use client"`.
- `src/components/ActiveRunsView.tsx` - Reference for the runs `useSuspenseQuery` options to mirror; not changed.
- `src/components/Timestamp.tsx` - Reference for the pure-formatting leaf pattern; not changed.
- `src/components/StatusBadge.tsx` - Stays at the end of each row; not changed.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx` - Holds the Queue `SectionHeading` copy; the description changes here.
- `src/data/apply-queue-change.ts` - Its private `byPosition` comparator moves to `src/lib/queue-order.ts` and is imported back; no behaviour change.
- `src/data/apply-queue-change.test.ts` - Must still pass untouched (proves the comparator move changed nothing).
- `src/data/query-keys.ts` - `queryKeys.runs(slug)` is imported by `QueueView`; not changed.
- `src/data/index.ts` - `getActiveRuns` is the `queryFn` for the runs read in `QueueView`; not changed.
- `src/lib/status-colors.ts` - Source of `STATUS_COLORS.queued.border`, `.queued.dot` and `.neutral.border`; not changed.
- `src/lib/status-colors.test.ts` - Scans `src/` for inline status hues; must keep passing.
- `src/lib/run-view.ts` - Reference for the pure label helper style (`formatDuration`); not changed.
- `src/types/adw.ts` - `QueueItem`, `Run`, `ActiveRuns` shapes; not changed (no view model added).
- `node_modules/next/dist/docs/` - Read the `cacheComponents` / prerender guide on clock reads in client components before writing `useNow`.

### New Files

- `src/lib/queue-order.ts` - Pure: `byQueuePosition`, `queuePositions`, `waitLabel`, `hasRunningRun`, `queueStartHint`. No clock, no IO.
- `src/lib/queue-order.test.ts` - Vitest cases for all of the above.
- `src/hooks/use-now.ts` - `useNow(): number | null`, the browser-only ticking store over `useSyncExternalStore` (server snapshot `null`).
- `src/components/QueueWait.tsx` - `"use client"` leaf: `useNow()` then `waitLabel(queuedAt, now)`; renders nothing while `now` or the label is `null`.

## Implementation Plan

### Phase 1: Foundation

Pure helpers and their tests in `src/lib/queue-order.ts`, and the comparator
move out of the reducer. Then the `useNow` store in `src/hooks/use-now.ts`.

### Phase 2: Core Implementation

`QueueWait` leaf, the rail markup in `QueueRow` (gutter, marker, second line),
and `QueueView` wiring (positions, running flag, rail line on the `<ol>`).

### Phase 3: Integration

New Queue section description in the page, README and AGENTS.md updated in
place, then the full validation run and a check of the served HTML that the
queue rows (and the Active rows) are still in the document.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the framework guide and the existing patterns

- Read the `cacheComponents` prerender docs under `node_modules/next/dist/docs/` (search for `current-time`, `Date.now` and `useSyncExternalStore`) to confirm that a clock read inside a `useSyncExternalStore` `subscribe` (post-commit) does not abort the client prerender, while one in render or `getSnapshot` would.
- Re-read `src/lib/run-view.ts`, `src/components/Timestamp.tsx`, `src/components/ActiveRunsView.tsx` and `src/data/apply-queue-change.ts`.

### 2. Create `src/lib/queue-order.ts`

- Header comment in the style of `src/lib/queue-source.ts`: ledger order and the queue's labels; pure, no clock.
- `export function byQueuePosition(a: QueueItem, b: QueueItem): number`: exactly the current `byPosition` body (`a.position - b.position || a.issue_number - b.issue_number`), with the doc comment moved along.
- `export function queuePositions(items: readonly QueueItem[]): Map<number, number>`: `[...items].sort(byQueuePosition)`, then `issue_number -> index + 1`. Never mutates the input. Doc comment: the ordinal is the rank among queued items in ledger order (`queue_items.position`, the runner's FIFO order, see `next_queued` in the toolkit), not `position + 1` (the ledger index also counts non-queued items) and not the array index; and why not `queued_at` (a retry restamps it without moving the item, a move reorders without restamping).
- `export function waitLabel(queuedAt: string | null, now: number): string | null`:
  - `null` for `queuedAt === null` or an unparseable value (`Number.isNaN(Date.parse(...))`).
  - Span `now - Date.parse(queuedAt)`, clamped at zero (clock skew), floored to whole minutes.
  - `< 1 min`: `waiting under 1 min`; `< 60 min`: `waiting N min`; `< 24 h`: `waiting H h MM min` (`MM` zero-padded); from 24 h: `waiting D d HH h` (`HH` zero-padded). No em-dashes.
- `export function hasRunningRun(data: ActiveRuns | null): boolean` (use the existing return type of `getActiveRuns`; import the type the same way `ActiveRunsView` infers it, or `Awaited<ReturnType<typeof getActiveRuns>>` if no named type is exported; check `src/data/index.ts`). `true` iff `data?.active` has a run with `status === "running"`; a `failed` run alone is `false`.
- `export function queueStartHint(hasRunning: boolean): string`: `"starts when the running run finishes"` or `"starts with the next runner"`.

### 3. Point the reducer at the shared comparator

- In `src/data/apply-queue-change.ts`, delete the local `byPosition` and import `byQueuePosition` from `@/lib/queue-order`; replace its call sites. No other edit.

### 4. Create `src/lib/queue-order.test.ts`

- `queuePositions`:
  - Items given out of ledger order (`position` 5, 0, 2) get ordinals 3, 1, 2 by `issue_number`, i.e. not their array index.
  - Non-contiguous positions (0, 3, 7) give 1, 2, 3.
  - Equal positions tie-break by `issue_number`.
  - A move (swap two items' `position`) swaps their ordinals and leaves the third unchanged.
  - Ordinals ignore `queued_at`: an item with the newest `queued_at` but the lowest `position` is 1.
  - Empty list gives an empty map; the input array is not mutated (`Object.freeze` it).
- `byQueuePosition`: sorts by `position`, then `issue_number`.
- `waitLabel` with fixed ISO timestamps and a fixed `now` (`Date.parse("2026-10-06T12:00:00Z")`): `null` input, garbage input, 0 s and 59 s (`under 1 min`), exactly 1 min, 12 min, 59 min 59 s (`59 min`), 60 min (`1 h 00 min`), 2 h 05 min, 23 h 59 min, 24 h (`1 d 00 h`), 3 d 4 h, a `queued_at` in the future (clamped, `under 1 min`), a `+02:00` offset input equal to a UTC one.
- `hasRunningRun`: `null`, empty `active`, only `failed`, one `running` among `failed`.
- `queueStartHint`: both strings pinned.

### 5. Create `src/hooks/use-now.ts`

- No `"use client"` needed on a hook module (follow `src/hooks/use-debounced-callback.ts`).
- Module state: `let now: number | null = null`, `const listeners = new Set<() => void>()`, `let timer: ReturnType<typeof setInterval> | null = null`, `const TICK_MS = 30_000`.
- `subscribe(listener)`: add listener; if it is the first, set `now = Date.now()` and start `setInterval(() => { now = Date.now(); listeners.forEach((l) => l()); }, TICK_MS)`, then notify; return an unsubscribe that removes the listener and, when the set is empty, clears the interval.
- `getSnapshot = () => now`; `getServerSnapshot = () => null`.
- `export function useNow(): number | null { return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot); }`
- Doc comment: the clock is read only in `subscribe` and the interval callback, which React runs after commit and never in render, so neither prerender pass reads it (server and client prerender use the `null` server snapshot); hydration renders `null` like the server did, then the post-commit subscribe fills it in; 30 s is enough at minute resolution; one interval for every subscriber; `getSnapshot` returns a stored primitive so it is stable between ticks. Reference issue #3 as the same shape at the leaf.

### 6. Create `src/components/QueueWait.tsx`

- `"use client"`; props `{ queuedAt: string | null }`.
- `const now = useNow(); const label = now === null ? null : waitLabel(queuedAt, now); return label && <span className="tabular-nums">{label}</span>;` (return `null`, not `""`, when absent).
- Doc comment: the one leaf that depends on the time; a tick re-renders only it; absent from the static HTML by design.

### 7. Rework `src/components/QueueRow.tsx` into a rail row

- Props: `item`, `projectSlug`, `position: number` (1-based ordinal from `queuePositions`), `hasRunning: boolean`. Still no `"use client"`.
- `<li className="relative flex gap-3">`:
  - Gutter `<div className="flex w-10 shrink-0 justify-center pt-4">` (reserved for the marker now and a drag handle later; say so in a comment).
  - Marker for `position === 1`: `<span className={\`relative z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium text-white ${STATUS_COLORS.queued.dot}\`}>next</span>`.
  - Marker otherwise: `<span className={\`relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border bg-white text-xs tabular-nums text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400 ${STATUS_COLORS.neutral.border}\`}>{position}</span>`. Match the page background used by the layout (check `src/app/layout.tsx`/`globals.css` for the actual dark background class and use the same).
  - Card: the existing bordered `div` content (move the classes from the `<li>` to a `<div className="min-w-0 flex-1 rounded-lg border ... p-4">`), keeping the first line exactly as today (number link, title, source badges, `Queued <Timestamp>`, `StatusBadge`).
  - Second line below the first: `<p className="mt-1 flex flex-wrap gap-x-2 text-xs text-neutral-500 dark:text-neutral-400"><QueueWait queuedAt={item.queued_at} />{position === 1 && <span>{queueStartHint(hasRunning)}</span>}</p>`. Render the `<p>` only when it can have content (`position === 1` or `item.queued_at !== null`), so non-head rows without `queued_at` do not get an empty line.
- Update the doc comment: the marker and the ordinal come from the `position` prop, the wait from the `QueueWait` leaf, nothing here reads the clock.

### 8. Wire `src/components/QueueView.tsx`

- Add a second `useSuspenseQuery`: `queryKey: queryKeys.runs(slug)`, `queryFn: () => getActiveRuns(slug)`, `staleTime: "static"`, `refetchOnMount: false`, `select: hasRunningRun`. Comment: the page's runs `HydrationBoundary` encloses the queue slot, so this is a cache hit on the same entry Active renders; the runs listener keeps it live; the queue is not merged into it.
- `const positions = queuePositions(items);`
- The `<ol className="relative space-y-3">` gets a first child `<span aria-hidden className={\`pointer-events-none absolute top-6 bottom-6 left-5 border-l ${STATUS_COLORS.queued.border}\`} />`(centre of the`w-10`gutter; adjust to the marker centre so the line runs from the first marker to the last). Only render it when`items.length > 1`.
- Each row: `<QueueRow key={item.issue_number} item={item} projectSlug={slug} position={positions.get(item.issue_number) ?? 0} hasRunning={hasRunning} />`. (The map always has every item; the `?? 0` only satisfies the type. Alternatively make `queuePositions` return a function that throws on a miss; keep the map, it is simpler.)
- Update the doc comment to describe the rail.

### 9. Change the Queue section copy in the page

- In `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`, `queueHeading.description` becomes: `First in, first out. The top item starts when the running one finishes. An issue joins when its repository labels it <code>adw:queued</code>; removing the label withdraws it.` (keep the existing `<code>` classes).
- `detail` keeps the manual-marker sentence and adds: `The numbers follow the queue ledger's order, so moving an item changes them.`

### 10. Update `README.md` in place

- The `QueueView`/`QueueRow` paragraph: the rail (gutter, amber line and markers from `STATUS_COLORS`, `next` and ordinals from `queuePositions` in ledger order and why not `queued_at`), the second line (`QueueWait` with `waitLabel`, the head hint from the runs entry via `hasRunningRun`/`queueStartHint`), and the new section description.
- The clock section: state that issue #3's leaf shape now exists for one leaf, `QueueWait` through `useNow` (`src/hooks/use-now.ts`), whose clock read lives only in the store's subscribe and tick, whose server snapshot is `null`, so the wait is absent from the static HTML and appears after hydration. Run labels are unchanged and still tracked in issue #3.

### 11. Update `AGENTS.md` in place

- Clock rule: amend "The only argument-less `new Date()` / `Date.now()` in the codebase is `getActiveRuns`'s `fetched_at` stamp" to name the second one: the `useNow` store in `src/hooks/use-now.ts`, read only in its `subscribe` and interval callback (post-commit, browser only), with `getSnapshot` returning the stored value and `getServerSnapshot` returning `null`. Never read the clock in `getSnapshot`, in a component or in a hook body; `QueueWait` is the one consumer; a new time-dependent label is a new leaf like it, never a clock read in `QueueRow`, `QueueView` or `RunRow`.
- Client components list: add `QueueWait`, which subscribes to the `useNow` store.
- Queue rules: ordinals come only from `queuePositions` in `src/lib/queue-order.ts` (ledger `position` order, not `queued_at`, not the array index); `byQueuePosition` is the one ledger comparator, shared by `queuePositions` and `applyQueueChange`; `waitLabel`, `hasRunningRun` and `queueStartHint` are pure and tested in `src/lib/queue-order.test.ts`, and every change to them goes with a test case; `QueueView` reads `queryKeys.runs(slug)` only with `select: hasRunningRun` for the head hint, never merges it into the queue entry; the gutter stays reserved for the marker and the future drag handle; the rail and the `next` marker take colours from `STATUS_COLORS.queued`, hollow markers from `STATUS_COLORS.neutral.border`.
- No em-dashes in any edit.

### 12. Review-phase browser evidence (no E2E suite in this project)

- The profile's Tests section says E2E code suite is `none` and there is no Playwright suite; the issue's "Playwright snapshot" is therefore delivered as review-phase screenshots, not a new test layer.
- The reviewer opens `http://localhost:$PORT/` and picks a project whose sidebar shows a non-zero queued count (preferably three or more; the issue cites `SBub/adw-toolkit` with #40, #41, #36), then `/projects/<owner>/<repo>` for it, and captures desktop 1920x1080 and mobile 375x667 full page, after the connection indicator reads `live`.
- What it must show: the Queue section below Active with the new description; a vertical amber line in the left gutter; the top row's filled amber marker reading `next`; hollow neutral markers `2`, `3` on the following rows; under each title `waiting N min` (or `h`/`d` form), and on the top row `starts when the running run finishes` if Active shows a running run, otherwise `starts with the next runner`. On mobile the gutter stays, the card wraps.
- Served HTML check: `curl -s http://localhost:$PORT/projects/<owner>/<repo>` must contain the queue rows (the `next` marker text and each `#<issue_number>` link) and the Active rows (an `adw_id` in a `<code>`), and must not contain `waiting` (absent from the static HTML by design).
- No `e2e/*.md` journey: arranging three queued items needs a write to the hosted Supabase project, which the profile's Protected section forbids, and the static checks above plus the unit tests cover the behaviour.

### 13. Run the Validation Commands

- Run every command below from the worktree root, unfiltered, and fix anything they report.

## Testing Strategy

### Unit Tests

All in `src/lib/queue-order.test.ts` (vitest, the project's one test layer):

- `queuePositions` derives ordinals from `position` with the `issue_number` tie-break, independent of array order and of `queued_at`, and does not mutate its input.
- `byQueuePosition` orders by `position`, then `issue_number`.
- `waitLabel` formats each band with fixed timestamps, clamps negative spans, returns `null` for `null` or unparseable input.
- `hasRunningRun` is true only for a `running` run in `active`.
- `queueStartHint` pins both strings.
- `src/data/apply-queue-change.test.ts` runs unchanged and proves the comparator move kept the reducer's behaviour.

### Test Coverage

- `src/lib/queue-order.test.ts` (unit, vitest): catches an ordinal taken from the array index or from `queued_at` instead of the ledger order, and a wait label in the wrong band or format. It fails without this feature (the module does not exist).
- `useNow`, `QueueWait`, `QueueRow` and `QueueView` get no automated test: the project has no component or hook test layer (`src/**/*.test.ts` only, node environment) and no Playwright suite, and inventing one is out of scope. Their evidence is the review screenshots and the served-HTML check in task 12. All logic they carry is delegated to the tested helpers.

### Edge Cases

- Empty queue: `Nothing queued.` panel unchanged, no rail line.
- One item: `next` marker, no line, head hint shown.
- Items with non-contiguous `position` (other ledger states in between): ordinals still 1..n.
- A Realtime move (UPDATE changing `position`): the reducer re-sorts and `queuePositions` re-ranks, so ordinals follow and keys (`issue_number`) stay stable.
- `queued_at` is `null`: no wait text; the head row still shows its hint; non-head rows render no empty second line.
- `queued_at` in the future (clock skew): `waiting under 1 min`.
- Very old item: day form (`waiting 3 d 04 h`).
- Active has only `failed` runs: hint is `starts with the next runner`.
- A run starts or finishes while the page is open: the runs listener updates the entry and the hint flips without a reload.
- Server render and hydration: the wait text is absent in both and appears after mount, with no hydration mismatch warning in the console.
- Not-found project: the queue slot is not rendered, so the runs read in `QueueView` never sees `null` from that branch; `hasRunningRun(null)` is still `false`.

## Acceptance Criteria

- The Queue section shows a vertical amber line in a reserved left gutter with one marker per row; the head marker is filled amber with `next`, the others hollow with a neutral border and ordinals `2`, `3`, ....
- Ordinals come from `queuePositions` (ledger `position`, `issue_number` tie-break), never from the array index.
- Each row with a `queued_at` shows `waiting ...` under its title in the browser; the static HTML contains no `waiting` text and still contains the queue and Active rows.
- The head row shows `starts when the running run finishes` when Active has a `running` run, else `starts with the next runner`, and updates live.
- The description reads "First in, first out. The top item starts when the running one finishes." followed by the `adw:queued` label hint.
- `QueueRow` stays one self-contained component without `"use client"`, keyed by `issue_number`; `applyQueueChange` behaviour is unchanged and its tests pass untouched.
- No inline `amber`/`emerald`/`sky`/`rose`/`red` class outside `src/lib/status-colors.ts`; `status-colors.test.ts` passes.
- No clock read in render: the only new `Date.now()` is in `src/hooks/use-now.ts`'s subscribe and interval callback.
- README and AGENTS.md describe the rail, `useNow`/`QueueWait` and the new rules; no em-dashes added.
- All validation commands pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint` - ESLint over the new and changed files.
- `yarn typecheck` - `next typegen` then `tsc --noEmit`; catches the new `QueueRow` props and the `select` typing.
- `yarn knip` - every new export in `src/lib/queue-order.ts` and `src/hooks/use-now.ts` is used.
- `yarn format:check` - Prettier on the new and changed files.
- `yarn test` - the new `src/lib/queue-order.test.ts`, the untouched `apply-queue-change.test.ts` and the status colour scan.
- `yarn build` - proves the client prerender of the project page still succeeds with the new client leaf and the runs read in `QueueView` (a clock read in render would abort it or fail it).

## Notes

- No new dependency.
- The issue's "ascending `queued_at`" ordering is replaced by ledger `position` order on purpose; the reasoning (toolkit `next_queued`, `move_issue`, `retry_issue`) is in the Solution Statement and should go into the PR description so the issue author can confirm.
- The issue's "Playwright snapshot" cannot be a test here: the profile has no Playwright suite (`E2E code suite: none`) and no component layer. The review screenshots in task 12 stand in for it. If a Playwright suite is ever added, a three-item fixture needs seeded data, which the hosted database rules out today.
- The wait label is absent until hydration by design. If a server-side value is ever wanted, the queue would need a `fetched_at` stamped inside `getQueueState`'s cache scope, which means amending the AGENTS.md rule that `getQueue` reads no clock.
- `useNow` is deliberately generic; issue #3's run labels (`TimeAgo`, `StaleBadge`, `RunningDuration`) can reuse it as leaves later, with their own decision on the server snapshot.
- The gutter's fixed width leaves room for the drag handle of the reorder issue; that issue should place the handle in the same gutter, beside or instead of the marker on hover.
