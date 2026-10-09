# Feature: Sidebar worker status widget (online/offline from the heartbeat)

## Metadata

issue_number: `158`
adw_id: `a58f07d8`
issue_json: `{"number":158,"title":"Sidebar: worker status widget (online/offline from the heartbeat)"}`

## Feature Description

A small widget pinned to the bottom of the project sidebar (the `(dashboard)` layout: `/projects`
and every project page, never `/`) that says whether the ADW queue worker (`adw_worker.py run`,
the LaunchAgent on the operator's Mac) is alive:

```
● Worker online       last beat 08.10.2026 19:37 UTC
○ Worker offline      last beat 07.10.2026 21:58 UTC
○ Worker offline      never seen
◌ Worker status...    (server render, before the first read)
```

The data is the toolkit's `adw.workers` table (one row per worker, upserted every 30 seconds,
deleted on a clean exit; readable with the publishable key; deliberately not in the Realtime
publication). A live read on 2026-10-09 returned two rows: a stale leftover (pid 50192, last beat
2026-10-07 21:58 UTC) and the live worker (pid 1401, `started_at` in 1976, the toolkit clock issue
the issue mentions). Row shape: `id` (uuid string), `host` (text), `pid` (integer), `started_at`
and `heartbeat_at` (ISO timestamptz), `version` (text).

The worker is online when the freshest `heartbeat_at` across all rows is under 90 seconds old
(three missed beats), offline otherwise. Stale rows are ignored, never counted as a second worker.
Only the state and the last beat are shown, never `host`, `pid` or `started_at`.

## User Story

As the operator watching ADW runs
I want to see from the dashboard sidebar whether the queue worker is running
So that I know why labelled issues sit in the Queue when nothing picks them up

## Problem Statement

When the worker is off, the Queue section shows waiting issues and nothing on the dashboard says
why. The heartbeat data exists in `adw.workers`, but the dashboard never reads it. Telling
online from offline needs the current time, and under `cacheComponents` the codebase allows only
two clock reads (`app_docs/clock-and-prerender.md`), neither of them in render. So the widget
must read the clock somewhere new, outside render and outside both prerender passes, without
dropping the client prerender of the sidebar.

## Solution Statement

- **Types:** a new `Worker` row type in `src/types/adw.ts`, mirroring `adw.workers` column for
  column.
- **Boundary:** a new `getWorkers(): Promise<Worker[]>` in `src/data/index.ts` selecting
  `WORKER_COLUMNS` (exactly the fields of `Worker`), cast once at the boundary, throwing on error
  like every other read. It is not a `queryFn`, not in a cache scope, not on Realtime, and is
  called only from the worker store in the browser.
- **Pure decision:** `src/lib/worker-state.ts` with `workerState(rows, nowMs)` (online/offline
  plus the freshest last beat, or `null`) and `nextWorkerSnapshot(prev, rows, nowMs)`, which
  returns `prev` itself when the state and last beat did not change. That is what keeps the
  `useSyncExternalStore` snapshot referentially stable between polls. Both are unit-tested with
  fixed timestamps.
- **Store and leaf:** `src/components/WorkerStatus.tsx`, a `"use client"` leaf with a
  module-level store read through `useSyncExternalStore`, in the same shape as
  `ConnectionIndicator`. The first subscriber starts the polling: one `getWorkers()` right away,
  then every 30 s, plus one on `visibilitychange` to visible. The last unsubscribe stops it. The
  poll callback is the one place the clock is read (`Date.now()`, after the rows arrive, never in
  render). `getServerSnapshot` returns a module constant `{ state: "unknown" }` and reads no
  clock, so the prerendered shell and hydration show "Worker status..." and the client prerender
  is not aborted. A failed read keeps the last snapshot and logs a `console.warn`. Before the
  first successful read the state stays `unknown`.
- **Placement:** from `md` up the sticky `aside` becomes a full-height flex column (same top
  offset and the same height expression it uses as a max height today). The header row stays on
  top, the project list scrolls inside a `min-h-0 flex-1 overflow-y-auto` wrapper, and the widget
  sits at the bottom (`shrink-0`), always visible. Below `md` the aside is a plain column, so the
  widget renders after the project strip.
- **Colours:** use `STATUS_COLORS` entries, with no new exemption. Online uses the `running`
  entry (emerald dot and text: "alive right now"), offline uses the `failed` entry (rose: "needs
  attention", the queue is not moving), and unknown uses `neutral`. No pulse: the pulse dot marks
  a running run. This keeps `src/lib/status-colors.test.ts` unchanged and keeps
  `ConnectionIndicator` as the one exemption. It is documented in
  `app_docs/screens-and-components.md`.
- **Rules and docs:** the clock rule in `app_docs/clock-and-prerender.md` gets a documented third
  site. The client component list, the boundary exports and the colour choice go into
  `app_docs/screens-and-components.md` and `app_docs/data-boundary.md`, the `Worker` type into
  `app_docs/types.md`, plus a new `docs/conditional-docs.md` trigger. These rules live in
  `app_docs/` since issue #127 (`AGENTS.md` says never to describe a feature there), so the
  issue's "AGENTS.md" items land in the feature docs' Rules sections and `AGENTS.md` is not
  edited.

## Relevant Files

Use these files to implement the feature:

- `README.md`: repository overview. Read only, no change: it links into the docs and does not
  describe features.
- `AGENTS.md`: repository rules (Yarn only, no em-dashes, conventional commits with no trailers,
  feature rules live in `app_docs/`). Read only.
- `.adw/project.md`: the ADW profile. Its Tests section lists the `e2e/*.md` journeys (add the
  new one). Its Review section describes the sidebar (add the widget, and that "Worker offline"
  is not a defect when the worker is not running). Never rename or reorder its nine `##`
  headings.
- `docs/conditional-docs.md`: the doc index. Extend the triggers of the three docs touched.
- `app_docs/clock-and-prerender.md`: the "exactly two clock read sites" rule. It gets the third
  site (the worker store's poll callback) and the server snapshot shape.
- `app_docs/data-boundary.md`: the boundary exports list and the "casts / columns equal the
  fields" rule. Add `getWorkers` / `WORKER_COLUMNS` / `Worker`, called only from the worker store.
- `app_docs/screens-and-components.md`: the sidebar layout (the sticky offset and max height
  become a full-height column), the client component list (add `WorkerStatus`) and the
  status-colour rule (the widget uses the map).
- `app_docs/types.md`: documents `src/types/adw.ts`. Add `Worker` to the database rows.
- `app_docs/realtime.md`: read only. It confirms `workers` is not on the channel, and the doc
  must not gain a listener.
- `src/types/adw.ts`: add the `Worker` interface in the "Database rows" section and mention it
  in the header comment.
- `src/data/index.ts`: add `WORKER_COLUMNS` and `getWorkers()`, and a line in the file's header
  comment.
- `src/data/supabase.ts`: `getSupabase()`, the only client (schema `adw`). Read only.
- `src/app/(dashboard)/layout.tsx`: the `aside` to restructure and where `<WorkerStatus />` is
  rendered.
- `src/components/ConnectionIndicator.tsx`: the module-level store plus `useSyncExternalStore`
  pattern to copy, including its comment style.
- `src/components/Timestamp.tsx`: renders the last beat (`formatTimestamp`, no clock).
- `src/lib/status-colors.ts`, `src/lib/status-colors.test.ts`: the colour map the widget reads,
  and the hue guard it must pass with no new exemption.
- `src/lib/run-view.ts`, `src/lib/run-view.test.ts`, `src/lib/format-date.test.ts`: the style for
  a pure helper and its fixed-timestamp tests.
- `src/components/ProjectNav.tsx`: the list's own classes (`md:flex-col md:overflow-visible`,
  horizontal strip on mobile). It must keep working inside the new scroll wrapper.
- `e2e/test_sticky_header.md`: step 5 scrolls "the sidebar" to its own bottom. The scroll
  container becomes the list wrapper inside the aside, so update the wording and add the check
  that the widget is inside the viewport.
- `e2e/test_connection_indicator_scope.md`: it relies on the pill being the only `role=status`
  on dashboard routes. The widget must therefore not take `role="status"`.
- `vitest.config.ts`, `knip.json`, `eslint.config.mjs`, `lefthook.yml`: the test glob
  (`src/**/*.test.ts`, node environment), dead-code scan and lint rules (`react-hooks/purity`
  forbids a clock read in a component body; the poll callback is a plain function).
- `node_modules/next/dist/docs/`: read the `cacheComponents` / prerender guidance on client
  components and `useSyncExternalStore` before touching the layout.

### New Files

- `src/lib/worker-state.ts`: `WORKER_STALE_MS = 90_000`, the `WorkerSnapshot` type,
  `workerState(rows, nowMs)` and `nextWorkerSnapshot(prev, rows, nowMs)`. Pure, no clock.
- `src/lib/worker-state.test.ts`: unit tests with fixed timestamps.
- `src/components/WorkerStatus.tsx`: the client leaf plus its module-level polling store.
- `e2e/test_worker_status_widget.md`: agent-driven journey (see Testing Strategy for why).

## Implementation Plan

### Phase 1: Foundation

Add the `Worker` row type and the `getWorkers()` boundary read. Then add the pure
`workerState` / `nextWorkerSnapshot` helpers and their unit tests. Nothing renders yet.

### Phase 2: Core Implementation

Build `WorkerStatus.tsx`: the store (subscribe/unsubscribe, which starts and stops the interval
and the visibility listener; a poll that reads rows, then the clock, then
`nextWorkerSnapshot`, notifying only when the snapshot object changed; a warn-and-keep on
error), a constant server snapshot, and the markup for the three states.

### Phase 3: Integration

Restructure the dashboard layout's `aside` into a full-height column with an inner scrolling
list and the widget at its bottom. Update the feature docs, the index, the profile and the
sticky-header journey. Add the worker widget journey. Run every validation command.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the framework guidance

- Read the relevant guides under `node_modules/next/dist/docs/` on `cacheComponents`,
  prerendering of client components and dynamic APIs, so the leaf's server snapshot approach
  matches the installed Next 16.

### 2. Add the `Worker` type

- In `src/types/adw.ts`, "Database rows" section, add:
  ```ts
  /** One adw.workers row: a queue worker's heartbeat, upserted every 30 s, deleted on a clean exit. */
  export interface Worker {
    id: string;
    host: string;
    pid: number;
    started_at: string;
    heartbeat_at: string;
    version: string | null;
  }
  ```
- Mention `Worker` in the file's header comment (the first section mirrors database tables).
  `host`, `pid` and `started_at` stay in the type because they are table columns. The UI never
  renders them.

### 3. Add `getWorkers()` to the boundary

- In `src/data/index.ts`, beside the other column constants:
  `/** The columns of adw.workers the worker widget reads, which are exactly the fields of Worker. */`
  `const WORKER_COLUMNS = "id, host, pid, started_at, heartbeat_at, version";`
- Add `export async function getWorkers(): Promise<Worker[]>`: `getSupabase().from("workers")
.select(WORKER_COLUMNS)`, no order (the helper picks the freshest), throw
  `new Error(\`workers: ${error.message}\`)`on error, return`(data ?? []) as Worker[]` with the
  usual "one place the shape is asserted" comment.
- Its doc comment says: called only from the worker store in `WorkerStatus` (the browser), never
  on the server, never a `queryFn`, no cache scope, not on Realtime (the table is not in the
  publication), reads no clock.
- Add one paragraph to the file's header comment about the workers read.

### 4. Add the pure decision helpers

- Create `src/lib/worker-state.ts`:
  - `export const WORKER_STALE_MS = 90_000;` (three missed 30 s beats). Export it only if the
    test imports it; otherwise keep it module-private for knip.
  - `export type WorkerSnapshot = { state: "unknown" } | { state: "online" | "offline"; lastBeat: string | null };`
  - `export function workerState(rows: Pick<Worker, "heartbeat_at">[], nowMs: number)`: find the
    row with the greatest `Date.parse(heartbeat_at)`. No rows gives
    `{ state: "offline", lastBeat: null }`. Otherwise `online` when
    `nowMs - freshest < WORKER_STALE_MS` (strictly under, so exactly 90 s is offline), else
    `offline`, with `lastBeat` set to the freshest row's `heartbeat_at` string as stored. Stale
    rows only lose the max, so they are never a second worker.
  - `export function nextWorkerSnapshot(prev: WorkerSnapshot, rows, nowMs): WorkerSnapshot`:
    compute `workerState`. Return `prev` when `prev.state` and `prev.lastBeat` are equal to it,
    otherwise return the new object.
  - A header comment: pure, the clock comes in as `nowMs`, same discipline as `durationLabel`.
- Create `src/lib/worker-state.test.ts` with fixed ISO timestamps and a fixed `NOW`:
  - no rows: offline, `lastBeat: null`;
  - one fresh row (10 s old): online with that beat;
  - one stale row (5 min old): offline with that beat;
  - fresh plus stale, in both orders: online with the fresh beat;
  - exactly at the threshold (`NOW - 90_000`): offline; at `NOW - 89_999`: online;
  - two stale rows: offline with the freshest of the two;
  - `nextWorkerSnapshot` returns the same object (`toBe`) when a later poll yields the same state
    and beat, a new object when the beat moves, and a new object on online to offline with the
    same beat (time passed);
  - `nextWorkerSnapshot` from `{ state: "unknown" }` returns a new known snapshot.

### 5. Build the `WorkerStatus` leaf and its store

- Create `src/components/WorkerStatus.tsx` with `"use client"` and a header comment in the
  style of `ConnectionIndicator`: why a module-level store, why the server snapshot is a
  constant, and why this file holds the third clock read (in the poll callback, never in render).
- Module state: `const UNKNOWN: WorkerSnapshot = { state: "unknown" };`,
  `let snapshot = UNKNOWN;`, `const listeners = new Set<() => void>()`, `let timer` and a
  generation counter (or `active` flag) so a response that lands after the last unsubscribe is
  dropped, plus an in-flight guard so a visibility poll does not overlap an interval poll.
- `async function poll()`: `const rows = await getWorkers();` then
  `const next = nextWorkerSnapshot(snapshot, rows, Date.now());` (the only clock read, after the
  read, outside render). If `next !== snapshot`, assign it and notify the listeners. On a
  rejection: `console.warn("worker status: ...", error)` and leave `snapshot` alone (unknown stays
  unknown, a known state stays as it was).
- `function onVisibility()`: when `document.visibilityState === "visible"`, call `poll()`.
- `subscribe(listener)`: add it. When it is the first listener, `poll()` once, start
  `setInterval(poll, 30_000)` and add the `visibilitychange` listener. Return an unsubscribe that
  removes it and, on the last one, clears the interval, removes the visibility listener and bumps
  the generation.
- `getSnapshot = () => snapshot`, `getServerSnapshot = () => UNKNOWN` (no clock, no data).
- `export function WorkerStatus()`: `useSyncExternalStore(subscribe, getSnapshot,
getServerSnapshot)`. Render a single row (`flex items-center gap-2 text-xs`):
  - online: filled dot `STATUS_COLORS.running.dot`, label "Worker online" in
    `STATUS_COLORS.running.text`, then muted "last beat <Timestamp value={lastBeat} />";
  - offline: hollow ring (`border` plus `STATUS_COLORS.failed.border`), "Worker offline" in
    `STATUS_COLORS.failed.text`, then "last beat <Timestamp/>" or muted "never seen" when
    `lastBeat` is `null`;
  - unknown: dashed neutral ring (`STATUS_COLORS.neutral.border`), muted "Worker status..."
    (three ASCII dots; the journey searches the served HTML for this exact text).
  - Wrap it in a `div` with `aria-live="polite"`. Do **not** use `role="status"`: the
    connection pill is the one `status` element on dashboard routes and
    `e2e/test_connection_indicator_scope.md` depends on that. No test id: the journey finds the
    widget by its text.
  - No pulse, no `host`, `pid` or `started_at`. No inline `emerald`, `amber`, `sky`, `rose` or
    `red` class (the hue guard scans `src/`).

### 6. Make the sidebar a full-height column with the widget at its bottom

- In `src/app/(dashboard)/layout.tsx`, change the `aside` to
  `flex shrink-0 flex-col gap-4 md:sticky md:top-[calc(var(--header-height)+1.5rem)] md:h-[calc(100vh-var(--header-height)-3rem)] md:w-72`
  (the height expression is today's `max-h`, now a fixed height; `overflow-y-auto` moves off the
  aside).
- Keep the `Projects` heading row with `ConnectionIndicator` first (`shrink-0`). Wrap the
  existing projects `HydrationBoundary` / `SectionBoundary` in
  `<div className="md:min-h-0 md:flex-1 md:overflow-y-auto">`, so the list scrolls inside the
  column. The mobile strip keeps its own horizontal scroll from `ProjectNav`.
- Below it, outside every boundary (it reads no query and must never sit inside a fallback):
  `<div className="shrink-0 border-t border-neutral-200 px-1 pt-3 dark:border-neutral-800"><WorkerStatus /></div>`.
  On mobile it follows the project strip in the column flow.
- Update the comment above the pill and add one for the widget: it is here because the
  `(dashboard)` layout is the operator's view, `/` has no sidebar and no widget, and it reads no
  query.
- Check the `/` route tree has no `WorkerStatus` import (only the dashboard layout renders it).

### 7. Update the feature docs and the index

- `app_docs/clock-and-prerender.md`: in Overview, "How it works" (a new "### The worker store's
  clock read" subsection) and the Rules, change "exactly two" to exactly three argument-less
  clock sites. The third is `Date.now()` in the worker store's poll callback in
  `src/components/WorkerStatus.tsx`: client only, after `getWorkers()` resolves, never in render
  or a hook body, and fed into the pure `nextWorkerSnapshot`. Its `getServerSnapshot` is the
  constant `unknown` state, so the shell and hydration render "Worker status...". "Do not add a
  fourth." The rule's prescribed shape for a time-dependent label stays the same, with this as
  its first instance. Add the specs line.
- `app_docs/data-boundary.md`: in "How it works" add the workers read (`adw.workers`,
  `WORKER_COLUMNS`, no order, the freshest row picked by `workerState`). In the Rules add the
  eighth export `getWorkers()`, called only from the worker store in `WorkerStatus` (browser),
  never on the server, never a `queryFn`, no cache scope, no query key, not on Realtime. Add
  `Worker[]` for `workers` to the casts rule, and `WORKER_COLUMNS` equal to the fields of
  `Worker` to the columns rule. Add the specs line.
- `app_docs/screens-and-components.md`: in the sidebar bullet, replace the "max height ... its
  own scroll" sentence. The aside is now a full-height column at the same offset, the project
  list scrolls inside it, and the worker widget sits at its bottom, always visible. Below `md`
  the widget follows the strip. Describe the widget (online under 90 s, offline with the last beat
  or "never seen", "Worker status..." before the first read, never host, pid or started_at).
  Rules: add `WorkerStatus`, which subscribes to its polling store, to the `"use client"` list.
  In the status-colour rule, say the worker widget takes `STATUS_COLORS.running` (online),
  `failed` (offline) and `neutral` (unknown) from the map, so `ConnectionIndicator` stays the one
  exemption, and the widget has no `role="status"` (the pill is the one status element). Add the
  specs line.
- `app_docs/types.md`: add `Worker` to the database rows, mirroring `adw.workers`.
- `docs/conditional-docs.md`: extend the screens line ("...; when changing the worker status
  widget or the sidebar's column layout"), the data-boundary line ("...; when touching
  `getWorkers`") and the clock line ("...; when changing the worker store's poll").
- No em-dashes anywhere.

### 8. Update the ADW profile

- `.adw/project.md` Tests: add `e2e/test_worker_status_widget.md` to the journey list.
- Review: in the `/projects` description mention the worker widget at the bottom of the sidebar.
  Add a bullet: the widget reads "Worker status..." until the first read and "Worker offline"
  whenever the worker is not running on the operator's machine. Neither is a defect unless the
  spec is about the widget. Keep the nine headings untouched.

### 9. Update the sticky-header journey

- `e2e/test_sticky_header.md` step 5: the `aside`'s `top` check is unchanged, and its `bottom`
  must be at most `innerHeight`. Change "Scroll the sidebar to its own bottom" to scroll the
  project list's scroll container inside the sidebar. Add: **Verify** the "Worker" widget is
  inside the aside's box and the viewport without scrolling. Update its Success Criteria line.

### 10. Add the worker widget journey

- Create `e2e/test_worker_status_widget.md` (`## User Story`, `## Test Steps` with numbered
  `**Verify**` lines, `## Success Criteria`), modelled on `e2e/test_connection_indicator_scope.md`:
  1. Fetch the raw HTML of `/projects` (for example `browser_evaluate` with
     `fetch('/projects').then(r => r.text())`). **Verify** it contains `Worker status...` and at
     least one run row's `adw_id` in a `<code>` (or "No runs in progress." when none), so the
     client prerender was not aborted.
  2. Navigate to `/projects` at 1920x1080. Wait for the pill to read `live`.
  3. **Verify** within 30 s the widget text is `Worker online` or `Worker offline`, followed by
     `last beat DD.MM.YYYY HH:MM UTC` or `never seen`, and never `host`, a pid or `started`. Note
     which. When the worker LaunchAgent is running on the machine, it must be `Worker online`.
  4. **Verify** with `getBoundingClientRect` that the widget is the last child area of the `aside`
     (its bottom within 1px of the aside's bottom minus its padding) and fully inside the
     viewport. Take a screenshot.
  5. Open the first project page from the sidebar. **Verify** the widget is still present at the
     bottom of the sidebar.
  6. Resize to 375x667. **Verify** the widget renders after the project strip (its `top` is
     greater than the strip's `bottom`). Take a screenshot.
  7. Navigate to `/`. **Verify** the accessibility snapshot has no `Worker online`,
     `Worker offline` or `Worker status...` text (judge from `browser_snapshot`, not a DOM
     query: Next keeps the previous route's hidden `Activity` subtree in the document).
  - Success Criteria: served HTML holds the server snapshot and the run rows. A known state
    appears within 30 s. The widget sits at the sidebar's bottom on desktop and after the list on
    mobile. `/` has none. 2 screenshots are taken.
- Why a journey: the profile has no code E2E suite and no component test layer. The issue's
  e2e asks (served HTML holding the server snapshot next to the run rows, the widget's position
  in the real layout, a known state against the live database) need a running app. The unit
  tests cover the decision and snapshot stability.

### 11. Run the validation commands

- Run every command in `Validation Commands`, from the root, unfiltered, and fix anything that
  fails without weakening a rule, a type or a test.

## Testing Strategy

### Unit Tests

`src/lib/worker-state.test.ts` (vitest, node), all with fixed ISO timestamps and a fixed `nowMs`,
no fake timers or clock:

- `workerState`: no rows; one fresh row; one stale row; fresh plus stale (both orders); exactly
  90 000 ms (offline) and 89 999 ms (online); several stale rows (freshest beat shown).
- `nextWorkerSnapshot`: the same object back when nothing changed (the store's snapshot is
  referentially stable between polls, so `useSyncExternalStore` does not re-render); a new
  object when the beat moves or the state flips; unknown to known.
- The existing `src/lib/status-colors.test.ts` hue guard covers the new component unchanged
  (it scans `src/`), which proves the "map, not exemption" colour choice.

### Test Coverage

- `src/lib/worker-state.test.ts` (unit, the profile's one test layer): catches a wrong
  online/offline decision (a stale row counted, an off-by-one at the 90 s threshold, the wrong
  last beat) and a snapshot rebuilt on every poll. It fails without the feature because the
  module does not exist.
- The store wiring, the server snapshot in the served HTML and the sidebar placement have no
  code layer here (no component tests, no Playwright suite, per the profile). They are covered
  by the agent-driven journey `e2e/test_worker_status_widget.md` (task 10) and the review phase's
  screenshots, not by a `Test Coverage` entry.

### Edge Cases

- No rows at all (clean exit): offline, "never seen".
- Only stale rows (killed worker): offline with the freshest stale beat. The leftover pid 50192
  row next to a live one must not change "online".
- A heartbeat exactly 90 s old: offline.
- The first read fails: stays "Worker status..." and a `console.warn` is logged. A later failure
  keeps the last state.
- The tab is hidden for a long time, then visible: a poll on `visibilitychange` corrects a stale
  "online" at once.
- Unmount (navigating to `/`) stops the interval and the listener. A response that lands after
  that is dropped, and the next mount starts fresh polling from the cached snapshot.
- `started_at` in 1976 on the live worker: never read or shown.
- A Supabase timestamp with microseconds and an offset (`+00:00`) parses with `Date.parse` and
  renders through `Timestamp`.
- The project list is longer than the viewport on desktop: the list scrolls and the widget stays
  visible. Mobile: the strip scrolls horizontally and the widget sits below it.

## Acceptance Criteria

- On `/projects` and every project page the sidebar shows the widget at its bottom (desktop,
  always visible, with the list scrolling above it) or after the project strip (mobile). `/` has
  no widget.
- With the worker LaunchAgent running, it reads "Worker online" and "last beat <DD.MM.YYYY
  HH:MM UTC>" within 30 s of load. After `launchctl bootout` (or killing the worker) it turns
  "Worker offline" within about two minutes, showing the last beat time. With no rows it reads
  "never seen".
- The served HTML of `/projects` contains "Worker status..." and still contains the run rows.
- `host`, `pid` and `started_at` are never displayed.
- `getWorkers` lives in `src/data/index.ts`, selects `WORKER_COLUMNS` equal to the fields of
  `Worker`, is not a `queryFn`, has no cache scope or query key, and is never called on the
  server.
- The only new clock read is in the worker store's poll callback, and
  `app_docs/clock-and-prerender.md` documents it as the third site.
- `STATUS_COLORS` supplies the widget's colours and `src/lib/status-colors.test.ts` passes
  unchanged.
- The docs, the index, the profile and the sticky-header journey are updated, with no em-dashes.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test` and `yarn build`
  pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint`: ESLint, including `react-hooks/purity` (no clock read in a component or hook body).
- `yarn typecheck`: `next typegen` then `tsc --noEmit` on the new type, boundary, helper and
  component (do not stage the rewritten `next-env.d.ts`).
- `yarn knip`: no unused export (for example `WORKER_STALE_MS` or `WorkerSnapshot` exported
  without a reader).
- `yarn format:check`: Prettier on the code, the docs, the spec and the journeys.
- `yarn test`: vitest, including the new `src/lib/worker-state.test.ts` and the unchanged
  status-hue and layer guards.
- `yarn build`: the production build with `.env.local`. It proves the layout change and the new
  client leaf do not fail either prerender pass.
- `grep -rn "Date.now()\|new Date()" src --include=*.ts --include=*.tsx`: expect exactly three
  code sites (`src/data/index.ts` `fetched_at`, `src/app/page.tsx` `requestToday`,
  `src/components/WorkerStatus.tsx` poll), besides comments.
- `grep -rn "WorkerStatus" src/app`: expect only `src/app/(dashboard)/layout.tsx`, so `/` has no
  widget.

## Notes

- No new dependency.
- `AGENTS.md` is not edited. The issue asks for its clock, client-list, boundary and colour rules
  to change, but since issue #127 those rules live in the Rules sections of `app_docs/`, and
  `AGENTS.md` itself says never to describe a feature there. The same rules change in
  `app_docs/clock-and-prerender.md`, `app_docs/data-boundary.md` and
  `app_docs/screens-and-components.md`.
- Colour choice: `STATUS_COLORS` entries, not an exemption. Online maps cleanly to `running`
  ("alive right now") and unknown to `neutral`. Offline takes `failed` because a stopped worker
  means the queue is not moving. If review finds rose too loud for a routinely off worker, the
  one-line alternative is `neutral` for offline, still with no exemption.
- The widget deliberately has no `role="status"`, because the connection pill is the one status
  element the existing journeys key on.
- Polling runs every 30 s even in a hidden tab, as the issue specifies. Skipping polls while
  hidden would be a follow-up if the read volume ever matters.
- The live table on 2026-10-09 had the stale pid 50192 row (last beat 2026-10-07 21:58 UTC) next
  to the live worker, and a `started_at` in 1976 on the live one. That is the case the helper's
  fresh plus stale test pins.
