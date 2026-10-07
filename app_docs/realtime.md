# Realtime

**Specifications:**

- specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md

## Overview

Live updates over one Supabase Realtime channel, `adw`, opened by `startRealtime` in `src/data/realtime.ts` from `Providers`: the pure reducers that write each event into the query cache, the catch-up read on every `SUBSCRIBED`, and the connection indicator.

## How it works

### Where live updates go

Live updates write into the same cache entry. `src/data/realtime.ts` (below)
calls `queryClient.setQueryData(queryKeys.projects, ...)` on every change; the sidebar
re-renders from the cache and the layout, the boundary and the key do not
change. Because the query is static, `setQueryData` is the update path (not
`invalidateQueries`). A server side source can also refresh the prefetch with
`revalidateTag("projects", ...)`, so the next visitor's HTML starts from fresh
data. The active runs follow suit: the runs listener writes with
`queryClient.setQueryData(queryKeys.activeRuns, ...)`, the one entry the
sidebar, `/projects` and every project page read; it has no server tag, since
it is read per request.
The queue too: the queue listener writes with
`queryClient.setQueryData(queryKeys.queue(slug), ...)`; its prefetch scope has
no tag.
History is not a cache entry: its one update path is the server action
dropping `history:<slug>` followed by a route refresh (see "The move" in `app_docs/history-revalidation.md`).

### Realtime

### The channel

`src/data/realtime.ts` exports `startRealtime(queryClient, options)`, where
`options.onHistoryChange?: (slug) => void` is the hook `Providers` uses to
start the move (`app_docs/history-revalidation.md`). It opens one channel named `adw` with three
`postgres_changes` listeners, every event on `adw.projects`, `adw.runs` and
`adw.queue_items`. A projects event goes through
`applyProjectChange` (next section) and the result is written under
`queryKeys.projects`. A runs event is resolved to a project first: the event
names the project by `project_id` (on DELETE from `ev.old`, which carries the
primary key `(project_id, adw_id)` and nothing else under the default replica
identity), the slug is looked up in the cached project list, and an event for a
project that list does not hold is dropped silently (a private project, or no
list in the cache: nothing on screen could show it). The event then goes
through two reducers from `src/data/apply-run-change.ts`, `applyRunChange` for
the one Active entry under `queryKeys.activeRuns` and
`applyRunChangeToSummaries` for the completed count and `last_run_at` in the
project list, in that order, because the second one needs
the run's previous status and the event does not carry it (see "Event to
cache"); last, if `isHistoryChange` says the event touched the project's
completed runs, `onHistoryChange(slug)` is called. A queue event is resolved
to a project the same way (`ev.old` carries `(project_id, issue_number)` only),
then goes through `applyQueueChange` for `queryKeys.queue(slug)` and
`applyQueueChangeToSummaries` for the project's `queued` count, with no
history callback: the queue is not history.
Every write is `setQueryData`, and every updater has the form
`current => current && reducer(current, ev)`: **an entry that is not in the
cache stays absent.** `setQueryData` ignores an `undefined` result, so a single
event can never seed a one-row list that looks complete and is not (the earlier
version defaulted a missing list to `[]`, which could do exactly that).

The channel's subscribe callback is the one writer of the connection
indicator: `SUBSCRIBED` sets `Live`, `CHANNEL_ERROR` and `TIMED_OUT` set
`Reconnecting`, `CLOSED` sets `Connecting`. `SUBSCRIBED` also runs the
catch-up read (below). The function returns a closer that removes the channel
and resets the indicator to `Connecting`.

`src/app/providers.tsx` starts it from a `useEffect`, passing
`onHistoryChange: (slug) => { void revalidateHistory(slug).then(() => { if (isProjectPath(window.location.pathname, slug)) router.refresh(); }).catch(() => {}) }`
(revalidate first, refresh second and only when that project's page is the
route on screen; a failed action is swallowed and leaves History stale until
the cache lifetime). The returned closer is the effect's
cleanup, so the channel is removed when the provider unmounts. In development React's strict mode runs
mount, cleanup, mount, so the indicator shows one connect, close and reconnect;
production connects once.

### Event to cache

`src/data/apply-project-change.ts` exports `applyProjectChange(current, ev)`,
a pure function from the cached `ProjectSummary[]` and one
`RealtimePostgresChangesPayload<Project>` to the next list. INSERT prepends
the row as a summary with zero counts and `last_run_at: null` (and is a no-op
if the id is already present); UPDATE merges the row into the matching entry,
keeping its counts (`queued` included), which are not table columns and so
are not in the event;
DELETE removes by `ev.old.id`, the only field Supabase guarantees in `old`
unless the table's replica identity is FULL. It never mutates its input.

It is covered by `src/data/apply-project-change.test.ts` (vitest): the three
events, a duplicate insert, an update that keeps `queued` and an update for an
unknown id. Run with
`yarn test`; `vitest.config.ts` maps the `@/` alias and picks up
`src/**/*.test.ts`.

`src/data/apply-run-change.ts` holds the two reducers for an `adw.runs` event
(type `RunChange`, a `RealtimePostgresChangesPayload<Run>`), both pure and
covered by `src/data/apply-run-change.test.ts`:

- `applyRunChange(current: ActiveRuns, ev): ActiveRuns` returns every
  project's active runs after the event. A run is matched on its primary key
  `(project_id, adw_id)`, never on `adw_id` alone, which is unique per project
  only. INSERT prepends the row when its status is
  `running` or `failed` and ignores a `completed` row (that is history); it is
  a no-op if the run is already in the list. UPDATE replaces
  the row in place while its status is live (a `failed` run set
  back to `running` stays where it was, now `running`) and **removes** it when
  the new status is `completed`; a live run that is not in the list is added
  as an insert would, since the event carries the full row. DELETE removes the
  run keyed by `ev.old`. `fetched_at` is never touched: it records when
  the rows were read, which an event does not change. The input is returned
  by identity when nothing changed.
- `isHistoryChange(ev, previousStatus): boolean` says whether the event
  changed the project's completed runs, which the cache does not hold: true
  for an INSERT or UPDATE whose new status is `completed`, and for a DELETE of
  a run the active list did not hold (`previousStatus` undefined; the event
  cannot say what the deleted run was, and one that was not live was, as far
  as the browser knows, completed). The realtime module calls
  `onHistoryChange(slug)` when it is true.
- `applyRunChangeToSummaries(current: ProjectSummary[], ev, oldStatus)`
  returns the project list with the matching project's `completed` count and
  `last_run_at` adjusted. It never touches `running` or `failed`: the sidebar
  counts those from the Active entry (`activeRunCounts`), so they cannot
  disagree with the rows (issue #62). `completed` comes from the
  `project_summaries` view, and the projects listener never sees it change (a
  runs row does not touch `adw.projects`), so it is moved here: `+1` on an
  INSERT of a completed row and on an UPDATE to `completed` from a known
  `running` or `failed` status; unchanged otherwise (DELETE included, since
  the event cannot say the deleted run was completed). `last_run_at` is the
  view's `max(runs.updated_at)`, so INSERT and UPDATE move it forward to
  `ev.new.updated_at` when that is later (compared as instants, since the view
  and the event may format the same moment differently); DELETE never moves it
  back. `queued` is not a run status and is never moved by a run event. The
  list keeps its order so projects do not jump under the pointer.

  `oldStatus` is a parameter because the event does not have it: Supabase
  sends `old` with the primary key columns only unless the table's replica
  identity is FULL, and `adw.runs` uses the default. The realtime module reads
  the run's current status out of the Active entry with
  `runStatusIn(current, project_id, adw_id)` **before** applying
  `applyRunChange`, and passes it in. Because the entry holds every project's
  active runs, the previous status of any active run is known, whichever page
  is open. When it is unknown (the run is not active, so it was already
  completed), an UPDATE to `completed` is a correction to a history row and
  does not count again. Known gap: the DELETE of a completed run does not
  lower the `completed` count until the next catch-up or page load.

`src/data/apply-queue-change.ts` holds the two reducers for an
`adw.queue_items` event (type `QueueChange`), both pure and covered by
`src/data/apply-queue-change.test.ts`:

- `applyQueueChange(current: QueueItem[], ev): QueueItem[]` holds the queued
  items only. INSERT or UPDATE with state `queued` adds or replaces the item by
  `issue_number` and re-sorts by `position, issue_number` (a move changes
  positions); an UPDATE to any other state removes it (the item started or was
  stopped); DELETE removes the `issue_number` in `ev.old`. A duplicate INSERT
  or a non-queued INSERT is a no-op, and the input is returned by identity
  when nothing changed.
- `applyQueueChangeToSummaries(current, ev, wasQueued)` moves the project's
  `queued` by `(queued now) - (queued before)`, never below 0, touching no
  other count. UPDATE is included, not only INSERT and DELETE, because the
  toolkit upserts every item on every ledger save: an item starting (`queued`
  to `running`) or being re-queued arrives as an UPDATE, and the unchanged
  upsert (`queued` to `queued`) is a zero delta. `wasQueued` is read with
  `queuedIn(current, issue_number)` from the cached queue entry **before** it
  is rewritten, for the same replica-identity reason as `oldStatus`. It is
  `undefined` when the queue is not cached; an INSERT then counts as not
  queued before, an UPDATE or DELETE leaves the count alone. Known gap: an
  UPDATE or DELETE for a project whose queue was not loaded this session does
  not move its sidebar count until the next catch-up or page load.

### Catch-up on SUBSCRIBED

Events that happen while the channel is down are never delivered, so after a
reconnect the cache must be re-read. The first connect has the same gap: the
page's entries come from a static shell whose cache may be up to 15 minutes old
(the server-side `cacheLife`), and anything that changed between that fill and
the moment the channel joined was never an event this browser saw. Both are
handled by one path: on **every** `SUBSCRIBED`, `realtime.ts` calls
`getProjects()` and writes the result under `queryKeys.projects`, then calls
`getActiveRuns()` and writes the result under `queryKeys.activeRuns`
unconditionally (it is the complete list read from the database, not a
one-event seed, so the `current &&` rule does not apply), then for every
queue entry in the cache (`queryClient.getQueryCache().findAll(...)` with `queryKeys.allQueues`, the `["queue"]` prefix exported from
`query-keys.ts`) calls `getQueue(slug)` and writes the result under `queryKeys.queue(slug)`.
There is no "was I disconnected" flag to keep in step; the first `SUBSCRIBED`
and a reconnect are the same case. History needs no catch-up: it is not in the
cache, and a completion this browser missed is the "unwatched completion"
caveat above.

It writes with `setQueryData`, not `invalidateQueries` or `refetchQueries`:
both skip queries with `staleTime: "static"`, which every query here has, so
they would be a silent no-op. The reads go through the boundary functions
themselves, so the refreshed entries have exactly the shape the prefetch put
there. `getActiveRuns` stamps a fresh `fetched_at`, which nothing in the UI
reads today.

Cost: one `project_summaries` read, one `runs` read, and one `getQueue` (two
reads) per cached queue entry, per (re)connect. The cache holds the project
list, the one Active entry and the queue of each project visited this
session, so this is a handful of small reads;
in development React's strict mode connects twice on mount, so it runs twice
there. A failed catch-up is logged with `console.warn` and swallowed: the cache
stays as it was and the next event or reconnect tries again. An event that
arrives while a catch-up read is in flight is applied first and then
overwritten by the read's result, which can predate it by the round-trip time;
the next event for that row corrects it.

### The indicator

The dashboard's sidebar shows a connection indicator, beside the Projects
heading, `src/components/ConnectionIndicator.tsx`:
a pill with a dot and one of three labels, `connecting` (amber, pulsing), `live`
(green) or `reconnecting` (red). It has `role="status"` and `aria-live="polite"`
so a screen reader announces changes. The three states are the string enum
`ConnectionStatus` (`Connecting = "connecting"`, `Live = "live"`,
`Reconnecting = "reconnecting"`) exported from the same file; the enum value is
the rendered label, and the style table is keyed by it. It is rendered only in
the `(dashboard)` layout, beside `Providers`, so it exists exactly where the
channel does: leaving the group (to the summary at `/`) unmounts both, and returning
remounts both (the closer resets the store to `Connecting`, the next
`SUBSCRIBED` sets `Live`).

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

## Rules

- The connection status in `src/components/ConnectionIndicator.tsx` is written
  only through its exported `setConnectionStatus`, with a `ConnectionStatus`
  enum member, never a bare string. Do not export the `status` variable, add a
  second setter, or mirror the value into React state or the query cache; the
  channel status callback in `src/data/realtime.ts` is its one caller.
- `ConnectionIndicator` is rendered only in `src/app/(dashboard)/layout.tsx`,
  inside `Providers` (beside the sidebar's `Projects` heading), never in the
  root layout or in the summary page `src/app/page.tsx`; a route without the
  channel shows no pill. Do not mount `Providers` or start Realtime on `/`
  (the summary) to make one appear. `SummaryProviders` is the only provider
  on `/`, mounted only around the today island.
- Every Realtime write to the query cache goes through a pure, unit-tested
  reducer and `setQueryData`: `applyProjectChange` in
  `src/data/apply-project-change.ts` for `adw.projects` events,
  `applyRunChange` and `applyRunChangeToSummaries` in
  `src/data/apply-run-change.ts` for `adw.runs` events, with `isHistoryChange`
  (same file) deciding whether to fire `onHistoryChange`, and
  `applyQueueChange` and `applyQueueChangeToSummaries` in
  `src/data/apply-queue-change.ts` for `adw.queue_items` events. The reducers take no
  cache, client or clock and never mutate their input; new event handling goes
  into a reducer and gets a test case, and `src/data/realtime.ts` stays a thin
  wiring layer around them. `applyRunChange` holds the Active list of every
  project, matches a run on `(project_id, adw_id)` (never `adw_id` alone, it
  is unique per project only), and removes a run whose new status is
  `completed`; do not make it keep or re-add completed rows.
  `applyRunChangeToSummaries` never touches `running` or `failed` (they are
  counted from the Active entry); it keeps `completed` (+1 on an INSERT of a
  completed row and on an UPDATE to completed from a known running or failed
  status) and `last_run_at`. `applyQueueChange` holds state `queued` only and
  removes an item whose new state is anything else; do not make it keep
  started or stopped items (they are runs). Never `invalidateQueries` or `refetchQueries` from
  the realtime module: every query here is `staleTime: "static"` and both skip
  static queries silently.
- Every updater passed to `setQueryData` from the realtime module has the form
  `current => current && reducer(current, ev)`. Never default an absent entry
  (`current = []`, `current ?? {...}`): an entry that is not in the cache must
  stay absent, or a single event seeds a one-row list that looks complete and
  is not.
- A runs or queue event names its project by `project_id` only. Resolve the slug from
  the cached project list (`queryClient.getQueryData(queryKeys.projects)`) and
  drop the event when the project is not there; never fetch to resolve it.
- `ev.old` carries only the primary key columns (`adw.runs`: `project_id`,
  `adw_id`; `adw.queue_items`: `project_id`, `issue_number`; `adw.projects`:
  `id`), because the tables use the default replica
  identity. Never read another field off `ev.old`. The previous status the
  completed count (and `isHistoryChange`) needs is read from the Active entry
  with `runStatusIn(current, projectId, adwId)` BEFORE the entry is
  rewritten, and passed explicitly;
  keep that order when touching `applyRunEvent`, and keep the
  `onHistoryChange` call last, after both `setQueryData` writes. Likewise the
  previous queue membership is read with `queuedIn` BEFORE the queue entry is
  rewritten in `applyQueueEvent`, and passed to `applyQueueChangeToSummaries`.
- The catch-up read runs on every `SUBSCRIBED` (first connect and every
  reconnect, one path, no flag) and writes with `setQueryData` through the
  boundary functions (`getProjects`, `getActiveRuns`, `getQueue`). It must
  never throw out of the socket callback: failures are `console.warn`ed and
  swallowed. It writes `getActiveRuns()` under `queryKeys.activeRuns`
  unconditionally (a complete list read from the database, not a one-event
  seed, so the `current &&` rule above does not apply to it). Enumerate the
  cached queue entries with `queryKeys.allQueues`, the prefix in
  `query-keys.ts`, not an inline `["queue"]`. It never reads
  history.
- One channel, named `adw`, opened by `startRealtime` and started only from
  `Providers`, which is also the only place the `onHistoryChange` option is
  wired (it needs `useRouter`). All three listeners (projects, runs,
  queue_items) live on that channel; do not open a second one or start it from another component.
