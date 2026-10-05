# Feature: Queue section on the project page with live updates

## Metadata

issue_number: `31`
adw_id: `edee4f21`
issue_json: `{"number":31,"title":"Queue section on the project page with live updates","body":"Follows the sidebar queued count. Depends on `adw.queue_items`existing (SBub/adw-toolkit \"Publish the queue ledger to the ADW UI\").\n\n- Project page: a \"Queue\" section above Active listing items in`position` order: issue number (link), title, source (`label`or`manual`, with a hint that a manual item is not removed by removing the label), queued time. Only items in state `queued`; other states are runs. Empty state \"Nothing queued.\" Read in the data boundary, prefetched and hydrated under `queryKeys.queue(slug)`, read with `useSuspenseQuery`inside`QueryBoundary`, same pattern as Active.\n- Realtime: a `queue_items`listener on the existing channel; pure reducer`applyQueueChange`with tests; the projects reducer adjusts`queued` on insert and delete; catch-up on SUBSCRIBED refreshes the queue entries.\n- README and AGENTS.md updated for the new key and reducer."}`

## Feature Description

The toolkit now mirrors each project's queue ledger into `adw.queue_items` (migration `20261005150000_queue_items.sql` in SBub/adw-toolkit): one row per ledger item, primary key `(project_id, issue_number)`, with `state` (`queued | running | merged | declined | conflict | held | failed | skipped | gated`), `source` (`manual` or `label:<name>`, nullable), `position` (0-based ledger index), `issue_title`, `queued_at`, `adw_id`, `note` and `updated_at`. RLS exposes rows of public projects to the publishable key, and the table is in the `supabase_realtime` publication. The publisher upserts every item on every ledger save and then deletes rows whose issue left the ledger.

The sidebar already shows `N queued` per project (issue #30), read from `project_summaries.queued`. This feature adds a **Queue** section to the project page, between the page header and the Active section, listing the project's items in state `queued` in `position` order: the issue number as a GitHub link, the issue title, the source (`label` with the label name, or `manual`, with a hint that a manually added item is not removed by removing the label) and the queued time. When nothing is queued the section says "Nothing queued." The list is prefetched on the server, hydrated under `queryKeys.queue(slug)`, and kept live in the browser by a `queue_items` listener on the existing `adw` channel, which also keeps the sidebar's `queued` count moving.

## User Story

As a person watching ADW work on a project
I want to see which issues are waiting in that project's queue, in the order they will run, and watch the list change as items are added, started or withdrawn
So that I know what ADW will pick up next without opening the ledger file or the terminal

## Problem Statement

The project page shows what is running (Active) and what finished (History), but nothing about what is waiting. The sidebar count says how many issues are queued but not which ones, in which order, or how they got there; and that count only changes on a page load or a reconnect, never live. A manually queued item also behaves differently from a labelled one (removing the label does not dequeue it), and nothing on screen tells the user that.

## Solution Statement

Follow the Active pattern end to end, adding one resource beside it rather than changing the runs one:

1. **Type**: `QueueItem` (row type, column for column) and `QueueState` in `src/types/adw.ts`.
2. **Boundary**: `getQueue(slug): Promise<QueueItem[]>` in `src/data/index.ts`. It resolves the project with the existing private `getProjectBySlug` (an unknown slug returns `[]`; the page has already decided not-found from the runs data), then reads `queue_items` by `project_id`, `state = 'queued'`, ordered `position asc, issue_number asc`, with an explicit `QUEUE_COLUMNS` list equal to the fields of `QueueItem`, cast once there. It reads no clock. It is the `queryFn` for the new key and is called by the catch-up.
3. **Keys**: `queryKeys.queue(slug)` (`["queue", slug]`) and the enumeration prefix `queryKeys.allQueues` (`["queue"]`) in `src/data/query-keys.ts`.
4. **Prefetch**: a third `"use cache"` state function in the page, `getQueueState(slug)`, a one-liner around `prefetch(queryKeys.queue(slug), () => getQueue(slug))`, awaited alongside `getRunsState` with `Promise.all` so the two reads do not waterfall. Like the Active scope it lives in the static shell; the browser keeps it current (Realtime, hydration rule, catch-up). It gets no per-slug tag: nothing on the server drops it, and the action and route handler stay exactly as they are (see Notes).
5. **View**: a client component `QueueView` (`useSuspenseQuery`, `staleTime: "static"`, `refetchOnMount: false`, same as `ActiveRunsView`) rendering a presentational `QueueRow` per item. A pure helper `queueSource(source)` in `src/lib/queue-source.ts` turns the stored `source` string into `{ kind: "label", name }`, `{ kind: "manual" }` or `null`; it is the one parse of that column and is unit-tested.
6. **Placement**: the Queue section must sit above Active, but `ActiveRunsView` renders the header and the Active section together from the runs entry. `ActiveRunsView` gains one `queue: ReactNode` slot prop, rendered between `PageHeader` and the Active `<section>`. The page passes its own `HydrationBoundary` (queue state) wrapping its own `QueryBoundary` wrapping `QueueView`, so a failed queue read shows its panel in the queue's slot while header and Active stay up, and the queue never renders in the not-found branch.
7. **Realtime**: a third listener on the `adw` channel for `adw.queue_items`, wired through `applyQueueEvent` in `realtime.ts`, around two pure reducers in `src/data/apply-queue-change.ts`:
   - `applyQueueChange(current: QueueItem[], ev): QueueItem[]` holds the queued list only: INSERT or UPDATE with state `queued` adds or replaces the item by `issue_number` and re-sorts by `position, issue_number`; UPDATE to any other state removes it; DELETE removes the `issue_number` in `ev.old`. Identity when nothing changed.
   - `applyQueueChangeToSummaries(current: ProjectSummary[], ev, wasQueued: boolean | undefined)` moves the matching project's `queued` by the delta `(now queued ? 1 : 0) - (was queued ? 1 : 0)`, never below 0, and leaves the list (by identity) when the delta is 0 or `wasQueued` is unknown on an UPDATE or DELETE. The issue says "on insert and delete"; UPDATE is included because the publisher upserts, so an item starting (`queued` to `running`) or being re-queued arrives as an UPDATE, and without it the sidebar count would never drop when a queued item starts.
   - `queuedIn(current: QueueItem[] | undefined, issueNumber): boolean | undefined` reads the previous membership from the cached queue entry BEFORE it is rewritten (`ev.old` carries only `project_id` and `issue_number` under the default replica identity). `undefined` when the entry is not cached; the realtime module treats an uncached INSERT as `false` (an inserted row was not queued before).
   - Every updater has the form `current => current && reducer(current, ev)`; a project not in the cached project list drops the event; no fetch to resolve it.
8. **Catch-up**: on every `SUBSCRIBED`, after the projects and runs writes, every cached queue entry (found with `queryKeys.allQueues`) is re-read with `getQueue(slug)` and written with `setQueryData`. Same try/catch, failures warned and swallowed.
9. **Docs**: README and AGENTS.md describe the new boundary function, key, reducers, listener, catch-up and component; `.adw/project.md`'s Review section names the Queue section on the project page.

## Relevant Files

Use these files to implement the feature:

- `README.md`: sections "Data: projects and runs from the database", "The query layer", "Prefetch and hydration of a project's runs" (under "Runs: active and history"), "Where live updates go", "The channel", "Event to cache", "Catch-up on SUBSCRIBED", "Types". Each gets the queue counterpart of what it says about Active.
- `AGENTS.md`: the rule book. Rules to extend: the data-boundary export list and `queryFn` list, the runs-select column rule (now also `queue_items`), the query-key list, the `"use client"` list, the reducer list, the `ev.old` primary-key rule (`adw.queue_items`: `project_id`, `issue_number`), the catch-up rule (also `queryKeys.allQueues`), the `"use cache"` state-function list, the not-found rule (the queue is not consulted). No rule is weakened.
- `.adw/project.md`: Review section lists the project page's sections; add Queue. Do not rename or reorder its `##` headings.
- `src/types/adw.ts`: add `QueueState` and `QueueItem` to the "Database rows" section; update the file's header comment (three row types).
- `src/data/index.ts`: add `QUEUE_COLUMNS` and `getQueue(slug)`; update the file header comment.
- `src/data/query-keys.ts`: add `allQueues` and `queue(slug)`.
- `src/data/query-client.ts`: read only; `prefetch` is reused unchanged (update the header comment's list of prefetches).
- `src/data/realtime.ts`: add the listener, `applyQueueEvent`, and the queue half of `catchUp`; update the doc comments.
- `src/data/apply-run-change.ts`, `src/data/apply-run-change.test.ts`: the model for the new reducer file and its tests (fixture builders, `base` payload, identity assertions).
- `src/data/apply-project-change.ts`: read only; it keeps `queued` through project UPDATEs already.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: add `getQueueState`, await it with `getRunsState`, pass the queue slot.
- `src/components/ActiveRunsView.tsx`: add the `queue` slot prop; the model for `QueueView`.
- `src/components/RunRow.tsx`: the model for `QueueRow` (issue link markup, title truncation, `Timestamp`).
- `src/components/QueryBoundary.tsx`, `src/components/Timestamp.tsx`, `src/components/IssueClassBadge.tsx`: reused; the badge's styling is the model for the source badge.
- `src/data/hydration.test.ts`: read only; the hydration rule it pins also protects the queue entry on a `router.refresh()`.
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md` (and `cacheTag.md`): re-read before adding the third `"use cache"` function.
- `/Users/sveta/Dev/adw-toolkit/supabase/migrations/20261005150000_queue_items.sql`: the table definition the type mirrors (read only, outside this repo).

### New Files

- `src/data/apply-queue-change.ts`: `QueueChange` type, `queuedIn`, `applyQueueChange`, `applyQueueChangeToSummaries`.
- `src/data/apply-queue-change.test.ts`: vitest cases for the three functions.
- `src/lib/queue-source.ts`: `queueSource(source: string | null)`.
- `src/lib/queue-source.test.ts`: vitest cases for it.
- `src/components/QueueView.tsx`: `"use client"`, the Queue section.
- `src/components/QueueRow.tsx`: one queued item, props only, no `"use client"` (it is rendered by a client component, like `RunRow`).

## Implementation Plan

### Phase 1: Foundation

Confirm the table is readable, add the row type, the boundary read, the two keys and the source helper with its tests. Nothing renders yet; `yarn knip` will flag the unused exports until Phase 2 wires them, so do Phases 1 and 2 before the first commit.

### Phase 2: Core Implementation

The two reducers and the membership read with their tests, then `QueueRow`, `QueueView`, the `ActiveRunsView` slot and the page's `getQueueState` and slot wiring.

### Phase 3: Integration

The Realtime listener and the catch-up in `realtime.ts`, then README, AGENTS.md and the profile, then validation and the review-phase evidence.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Confirm the dependency is in place (read only)

- With the publishable key and URL from `.env.local` (never print the key), `GET {NEXT_PUBLIC_SUPABASE_URL}/rest/v1/queue_items?select=project_id,issue_number,state,source,position,issue_title,queued_at,adw_id,note,updated_at&limit=1` with headers `apikey`, `Authorization: Bearer <key>` and `Accept-Profile: adw`. A 200 (an empty array is fine) means proceed. An error naming the relation or a column means the toolkit migration is not applied: stop and report it. Never write to the database.

### 2. Row type

- In `src/types/adw.ts`, "Database rows" section, after `Run`:
  - `export type QueueState = "queued" | "running" | "merged" | "declined" | "conflict" | "held" | "failed" | "skipped" | "gated";` with a one-line comment that it is the table's check constraint (the toolkit's `queue_ops` `STATE_*`).
  - `export interface QueueItem { project_id: string; issue_number: number; state: QueueState; source: string | null; position: number; issue_title: string | null; queued_at: string | null; adw_id: string | null; note: string | null; updated_at: string; }`, column for column, in table order.
- Update the header comment: the first section now mirrors three tables; `QueueItem` has no view model either.

### 3. Boundary read

- In `src/data/index.ts`:
  - `const QUEUE_COLUMNS = "project_id, issue_number, state, source, position, issue_title, queued_at, adw_id, note, updated_at";` with a doc comment like `RUN_COLUMNS`'s.
  - `export async function getQueue(slug: string): Promise<QueueItem[]>`: `getProjectBySlug(slug)`; `null` returns `[]`; then `getSupabase().from("queue_items").select(QUEUE_COLUMNS).eq("project_id", project.id).eq("state", "queued").order("position", { ascending: true }).order("issue_number", { ascending: true })`; throw `new Error(\`queue_items: ${error.message}\`)`on error; return`(data ?? []) as QueueItem[]` (the one cast for this table).
  - Doc comment: queryFn for `queryKeys.queue(slug)`; on the server only from the page's `getQueueState` scope; in the browser on a cache miss and in the catch-up; reads no clock and has no `fetched_at` (nothing needs one; issue #3 is about run labels); only state `queued` is read because every other state is a run and shows in Active or History; an unknown slug is an empty list because the page decided not-found from the runs data first.
  - Update the file header comment to mention the third read.

### 4. Query keys

- In `src/data/query-keys.ts` add, after `runs`:
  - `allQueues: ["queue"] as const`, documented like `allRuns` (a prefix for `findAll` in the catch-up, nothing is stored under it).
  - `queue: (slug: string) => ["queue", slug] as const`, documented like `runs` (prefetched by the page, read by `QueueView`, written by the queue listener and the catch-up).

### 5. Source helper and its tests

- `src/lib/queue-source.ts`: `export type QueueSource = { kind: "label"; name: string } | { kind: "manual" };` and `export function queueSource(source: string | null): QueueSource | null`. `"manual"` gives `{ kind: "manual" }`; `"label:<name>"` with a non-empty name gives `{ kind: "label", name }` (split at the first colon only, so a label containing a colon keeps it); `null`, `""`, `"label:"` and any other string give `null`. Pure, no clock.
- `src/lib/queue-source.test.ts`: one case per branch above, including `"label:adw:queue"` keeping `adw:queue` as the name.

### 6. Queue reducers and their tests

- `src/data/apply-queue-change.ts`, header comment in the style of `apply-run-change.ts`:
  - `export type QueueChange = RealtimePostgresChangesPayload<QueueItem>;`
  - `export function queuedIn(current: QueueItem[] | undefined, issueNumber: number): boolean | undefined`: `undefined` when `current` is `undefined`, otherwise whether an item with that `issue_number` is in it. Documented as the previous-state read the realtime module does BEFORE the entry is rewritten, because `ev.old` has only the primary key.
  - A private `byPosition(a, b)` comparator (`position`, then `issue_number`) and a private `without(items, issueNumber)` returning the same array when nothing was removed.
  - `export function applyQueueChange(current: QueueItem[], ev: QueueChange): QueueItem[]`:
    - INSERT: state not `queued`, or already present: return `current`. Otherwise `[...current, ev.new].sort(byPosition)`.
    - UPDATE: state `queued`: replace the item with the same `issue_number` (or add it when absent, the event carries the full row) and sort by `byPosition` (a `move` changes positions). Any other state: `without(current, ev.new.issue_number)` (identity when absent).
    - DELETE: `ev.old.issue_number` undefined: `current`; otherwise `without(...)`.
    - Never mutates its input (sort a copy).
  - `export function applyQueueChangeToSummaries(current: ProjectSummary[], ev: QueueChange, wasQueued: boolean | undefined): ProjectSummary[]`:
    - `project_id` from `ev.old` on DELETE, `ev.new` otherwise; absent or not in the list: `current`.
    - `isQueued` is `ev.new.state === "queued"` for INSERT and UPDATE, `false` for DELETE. `wasQueued` is `false` on INSERT when passed `undefined`; on UPDATE and DELETE an `undefined` means no change (no delta can be computed, the next catch-up corrects it, same reasoning as `applyRunChangeToSummaries`).
    - `delta = Number(isQueued) - Number(wasQueued)`; `0` returns `current` by identity; otherwise map the matching project to `{ ...project, queued: Math.max(0, project.queued + delta) }`. Touches no other count and never `last_run_at`. The list keeps its order.
- `src/data/apply-queue-change.test.ts`, fixtures modelled on `apply-run-change.test.ts` (`item(issue, overrides)`, `summary(id, overrides)` with every `ProjectSummary` field, a `base` payload with `table: "queue_items"`, `insert`/`update`/`remove` builders where `remove` sets `old: { project_id, issue_number }` only). Cases:
  - `applyQueueChange`: INSERT of a queued item lands in position order between two others; INSERT of a `running` item is ignored (identity); duplicate INSERT is a no-op (identity); UPDATE `queued` to `running` removes the item; UPDATE of a position (a move) reorders the list; UPDATE of a queued item not in the list adds it; UPDATE to a non-queued state of an absent item returns the input by identity; DELETE removes by `issue_number`; DELETE of an absent item returns the input by identity; equal positions fall back to `issue_number`; the input array is not mutated (deep-freeze or compare a copy).
  - `applyQueueChangeToSummaries`: INSERT queued is `+1` with `wasQueued` `undefined`; INSERT of a non-queued state is unchanged (identity); UPDATE `queued` to `running` with `wasQueued: true` is `-1`; UPDATE `running` to `queued` with `wasQueued: false` is `+1`; UPDATE with `wasQueued: undefined` is unchanged (identity); UPDATE `queued` to `queued` with `wasQueued: true` is unchanged (the every-save upsert); DELETE with `wasQueued: true` is `-1`; DELETE with `wasQueued: undefined` is unchanged; never below 0; other projects and the other counts untouched; a project not in the list returns the input.
  - `queuedIn`: `undefined` for an absent entry, `true`/`false` by membership.

### 7. QueueRow

- `src/components/QueueRow.tsx`, no `"use client"`, props `{ item: QueueItem; projectSlug: string }`. An `<li>` with the same border and padding as `RunRow`:
  - `#{item.issue_number}` as `https://github.com/${projectSlug}/issues/${item.issue_number}` (`target="_blank"`, `rel="noreferrer"`, same classes as `RunRow`'s link).
  - `item.issue_title` when not null, truncated with `title`, same classes as `RunRow`.
  - The source from `queueSource(item.source)`: `label` renders a badge reading `label: <name>`; `manual` renders a badge reading `manual` plus, right after it, a muted `text-xs` hint visible on every viewport (a `title` alone is invisible on touch): "Removing the label does not remove it." with the badge's `title` carrying the longer form "Added by hand with adw_queue.py add. Removing the issue's label does not take it out of the queue." `null` renders nothing. Badge styling from `IssueClassBadge`.
  - `Queued <Timestamp value={item.queued_at} />` (muted `text-xs`, `ml-auto`, like `RunRow`'s "Updated"), or `Queued` followed by a muted `none` when `queued_at` is null.
  - No clock read, no computation beyond the helper call (the AGENTS rule allows calling a pure `src/lib` helper on the row's own fields).

### 8. QueueView

- `src/components/QueueView.tsx`, `"use client"`, `export function QueueView({ slug }: { slug: string })`:
  - `useSuspenseQuery({ queryKey: queryKeys.queue(slug), queryFn: () => getQueue(slug), staleTime: "static", refetchOnMount: false })` with the same comments as `ActiveRunsView` (why static, why no refetch, live updates come from `realtime.ts`).
  - `<section className="mb-10">` with `<h2 className="mb-3 text-lg font-semibold">Queue</h2>`; empty list: the same dashed panel as Active with the text `Nothing queued.`; otherwise `<ol className="space-y-3">` of `QueueRow` keyed by `issue_number` (an ordered list: the order is the run order).
  - The project slug for the link is the `slug` prop (it is the project's slug, assembled once by the page); do not read it off another entry.

### 9. ActiveRunsView slot

- In `src/components/ActiveRunsView.tsx`, props become `{ slug: string; queue: ReactNode }`. Render `{queue}` between `<PageHeader ... />` and the Active `<section>`. The not-found branch does not render it. Update the doc comment: the header and Active come from the runs entry; the Queue section is a separate entry under its own boundaries, slotted here so it sits above Active.

### 10. Page wiring

- In `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`:
  - Import `getQueue` from `@/data` and `QueueView`.
  - Add, after `getRunsState`: `async function getQueueState(slug: string) { "use cache"; return prefetch(queryKeys.queue(slug), () => getQueue(slug)); }`, with a doc comment: same shape and same reason for the scope as `getRunsState` (`query()` and `dehydrate` read the clock); `getQueue` itself reads no clock; no tag because no server writer drops it (the queue is not part of the completion move; the browser keeps it current through Realtime, the hydration rule and the catch-up, as with Active in the static shell).
  - In `ProjectPage`: `const [{ data, state }, queue] = await Promise.all([getRunsState(slug), getQueueState(slug)]);`. The not-found decision stays `data === null`, read off the runs half only. `generateMetadata` is unchanged and does not call `getQueueState`.
  - Pass the slot: `<ActiveRunsView slug={slug} queue={<HydrationBoundary state={queue.state}><QueryBoundary fallback={<p className="text-sm text-neutral-500 dark:text-neutral-400">Loading queue...</p>} detail="This project's queue did not load."><QueueView slug={slug} /></QueryBoundary></HydrationBoundary>} />`. Extract it to a local `const queueSection = (...)` above the return for readability. Update the comment over the `HydrationBoundary` to say there are two, one per entry.
  - `searchParams` is still not awaited in the page.

### 11. Realtime listener and catch-up

- In `src/data/realtime.ts`:
  - Add `.on<QueueItem>("postgres_changes", { event: "*", schema: "adw", table: "queue_items" }, (ev) => { applyQueueEvent(queryClient, ev); })` after the runs listener, on the same `adw` channel. Update `startRealtime`'s doc comment (three tables).
  - `function applyQueueEvent(queryClient: QueryClient, ev: QueueChange)`: key from `ev.old` on DELETE, `ev.new` otherwise; return when `project_id` or `issue_number` is undefined; resolve the project from `queryClient.getQueryData<ProjectSummary[]>(queryKeys.projects)` by id and return when absent; `queueKey = queryKeys.queue(project.slug)`; `const wasQueued = queuedIn(queryClient.getQueryData<QueueItem[]>(queueKey), issueNumber);` read BEFORE any write; then `setQueryData<QueueItem[]>(queueKey, (current) => current && applyQueueChange(current, ev))`; then `setQueryData<ProjectSummary[]>(queryKeys.projects, (current) => current && applyQueueChangeToSummaries(current, ev, wasQueued))`. No history callback: the queue is not history. Doc comment in the style of `applyRunEvent`.
  - `catchUp`: after the runs loop, enumerate `queryKeys.allQueues` the same way (factor the slug enumeration into a small local `cachedSlugs(queryClient, prefix)` used by both loops), `getQueue(slug)` each and `setQueryData(queryKeys.queue(slug), items)`. Inside the existing `try`; failures still warned and swallowed. Update the cost paragraph (two more reads per cached queue entry) and the "History needs no catch-up" paragraph stays.
  - Never `invalidateQueries` or `refetchQueries`.

### 12. README

- "Data: projects and runs from the database": a paragraph on `adw.queue_items` and `getQueue` (state `queued` only, position order, unknown slug empty, no clock).
- "The query layer": `getQueue` joins the `queryFn` list; `queryKeys.queue(slug)` (`["queue", slug]`) and `queryKeys.allQueues` in the key list; `getQueueState` as the third one-liner around `prefetch`.
- "Prefetch and hydration of a project's runs": the page awaits both state functions in parallel; two `HydrationBoundary`s; the Queue section is slotted into `ActiveRunsView` above Active under its own `QueryBoundary`; the not-found decision still reads only the runs data.
- "Where live updates go", "The channel", "Event to cache", "Catch-up on SUBSCRIBED": the third listener, `applyQueueChange`, `applyQueueChangeToSummaries`, `queuedIn` and why UPDATE moves the count (upserts), the queue catch-up and its cost, and the known gap (an UPDATE or DELETE for a project whose queue was not loaded this session does not move its sidebar count until the next catch-up or page load).
- "Types": `QueueItem` and `QueueState`.
- The source column and the manual hint, one sentence where the page sections are described.

### 13. AGENTS.md

- Architecture: the data boundary now exports `getQueue` too (a `queryFn`, async database read of `queue_items` by `project_id`, `state = queued`, `position asc, issue_number asc`); "the first two are also the `queryFn`s" becomes `getProjects`, `getActiveRuns` and `getQueue`; the column-list rule covers `QUEUE_COLUMNS` and `QueueItem`; the query-key list adds `queryKeys.queue(slug)` and `queryKeys.allQueues`, read by `QueueView`; the `"use cache"` state functions list adds the page's `getQueueState`; the `"use client"` list adds `QueueView`; the not-found rule notes the queue is not consulted; the clock rule notes `getQueue` reads no clock.
- A rule for the slot: the Queue section sits above Active through `ActiveRunsView`'s `queue` slot, under its own `HydrationBoundary` and `QueryBoundary`; do not read the queue inside `ActiveRunsView` or merge it into the runs entry.
- Realtime: the reducer list adds `applyQueueChange` and `applyQueueChangeToSummaries` in `src/data/apply-queue-change.ts`; `applyQueueChange` holds state `queued` only and removes an item whose new state is anything else; `ev.old` for `adw.queue_items` carries only `project_id` and `issue_number`, and the previous membership is read with `queuedIn` BEFORE the entry is rewritten; the catch-up also enumerates `queryKeys.allQueues` and calls `getQueue`; the one channel now carries three listeners.
- Runs: active and history: the queue never touches History, triggers no `onHistoryChange` and no server action.

### 14. ADW profile

- In `.adw/project.md`, Review section: the project page shows "header, Queue section, Active section, History section". No heading renamed or reordered.

### 15. Review-phase browser evidence

- The profile has E2E `none` and no component test layer, so evidence comes from the review screenshots. With `.ports.env`'s `PORT`, open `/projects/SBub/issebya-homes-ai-system` (or the first project the sidebar on `/` lists if that is 404) at desktop 1920x1080 and mobile 375x667, full page, after the indicator reads `live`.
- What it must show: the header, then a `Queue` heading above `Active`; either the queued items in position order, each with a `#N` link to the GitHub issue, its title, a `label: <name>` or `manual` badge (manual with the visible hint), and `Queued DD.MM.YYYY HH:MM UTC`; or the dashed panel `Nothing queued.` The sidebar's `N queued` for that project equals the number of rows. At 375px the hint wraps under the badge rather than overflowing.
- Check the served HTML (`curl -s http://localhost:$PORT/projects/<slug>`) contains `Queue` and either the queued issue numbers or `Nothing queued.` inside the document (inline or as a streamed completion in the same document, see AGENTS.md), proving the section is server-rendered, not a client fallback.
- Live behaviour cannot be exercised by the review (no writes to the hosted project are allowed); it is covered by the reducer tests.

### 16. Run the validation commands

- Run every command in `Validation Commands` below; all must pass.

## Testing Strategy

### Unit Tests

- `src/data/apply-queue-change.test.ts`: the list reducer (insert, ignore non-queued, duplicate, start removes, move reorders, add-on-update, delete, identity on no-op, no mutation, tie-break), the counts reducer (every delta case, unknown previous state, floor at 0, other projects and counts untouched), and `queuedIn`.
- `src/lib/queue-source.test.ts`: `manual`, `label:<name>`, a label with a colon, `null`, empty string, `label:` with no name, an unknown string.

### Test Coverage

- `src/data/apply-queue-change.test.ts` (vitest unit layer, `src/**/*.test.ts`): catches a queue listener that leaves a started (`queued` to `running`) item on screen, misorders the list after a `move`, double-counts the every-save upsert in the sidebar, or seeds a count from an unknown previous state. None of this exists today, so every case fails without the feature (the module does not exist).
- `src/lib/queue-source.test.ts` (same layer): catches a mis-parse of `label:<name>` (a label with a colon, an empty name) that would render the wrong source or call a manual item a label item; fails without the feature.
- `QueueView`, `QueueRow`, the slot and the page wiring have no test: the profile has no component test layer and no E2E suite. Their evidence is `yarn build` (the queue is prefetched at build time for every slug) and the review-phase screenshots and served-HTML check in step 15.
- `getQueue` has no unit test, like the other boundary reads (it is a database read); `yarn build` exercises it against the live table.

### Edge Cases

- Empty queue: `Nothing queued.` on first paint, from the server HTML.
- An item moves from `queued` to `running`: it leaves the Queue and the sidebar count drops by one (cached queue), while the run appears in Active through the runs listener.
- A failed or held item re-queued (UPDATE back to `queued`): it reappears at its position and the count goes up.
- `adw_queue.py move`: a burst of UPDATEs with transiently equal positions; the tie-break keeps the order deterministic and the last event leaves the ledger order.
- The every-save upsert of unchanged rows: UPDATEs with `queued` to `queued`, no count change, no reorder beyond a stable sort.
- An item removed from the ledger (DELETE): it disappears; the count drops only if the queue entry was cached.
- Event for a project whose page was not visited: the queue entry is absent and stays absent; INSERT still moves the sidebar count, UPDATE and DELETE do not (until catch-up).
- Event for a private project or one not in the cached list: dropped.
- `source` null (items queued before the ledger stored it): no badge. `issue_title` null: no title. `queued_at` null: `Queued none`.
- Unknown slug: the page calls `notFound()` from the runs data; `getQueue` returned `[]` and is never shown.
- The queue read fails: the queue's `QueryBoundary` panel shows in its slot with Retry; the header and Active stay on screen.

## Acceptance Criteria

- The project page shows a `Queue` section between the header and `Active`, listing only `state = queued` items in `position` order, each with an issue link, title, source (`label: <name>` or `manual` with the visible hint) and queued time from `Timestamp`; `Nothing queued.` when empty.
- The queue is prefetched in a `"use cache"` state function through `prefetch`, hydrated under `queryKeys.queue(slug)`, read by `QueueView` with `useSuspenseQuery` inside its own `QueryBoundary`; the section is in the served HTML.
- `queryKeys.queue(slug)` and `queryKeys.allQueues` are defined only in `src/data/query-keys.ts`; no key literal elsewhere.
- `getQueue` is the only reader of `queue_items`, casts once in `src/data/index.ts`, reads no clock, and selects exactly the fields of `QueueItem`.
- One `adw` channel with three listeners; queue events go through `applyQueueChange` and `applyQueueChangeToSummaries` with `current => current && ...` updaters; the previous membership is read before the write; the catch-up refreshes every cached queue entry.
- The sidebar `queued` count moves on queue INSERT, DELETE and state-changing UPDATE when the previous state is known.
- History, the server action, the route handler and `src/lib/history-tags.ts` are unchanged.
- README, AGENTS.md and `.adw/project.md` describe the new key, reducers, listener, catch-up and section; no em-dashes anywhere.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint`: ESLint over the new components, reducers, helper and tests.
- `yarn typecheck`: proves `QueueItem` matches every use, the slot prop is passed, and the reducers' event types line up.
- `yarn knip`: every new export (`getQueue`, `queryKeys.queue`/`allQueues`, the reducers, `queuedIn`, `queueSource`) is used; no dead file.
- `yarn format:check`: Prettier on the changed files, the docs and this spec.
- `yarn test`: the new reducer and helper cases, plus the existing hydration, reducer and helper suites unchanged.
- `yarn build`: reads `queue_items` at build time for every slug inside `getQueueState`; fails loudly if the table is missing or a clock read escaped a cache scope.
- `grep -rl supabase .next/cache/fetch-cache || echo "no supabase fetch-cache entry"`: after the build, no Supabase entry in the fetch cache (the new read goes through `getSupabase()` and its `no-store` fetch); any file listed is a failure.

## Notes

- Depends on the toolkit migration `20261005150000_queue_items.sql` (SBub/adw-toolkit PR #21, merged) being applied to the hosted project; step 1 checks it read only.
- No new dependency.
- No server tag for the queue scope. Adding `queue:<slug>` would mean deciding who drops it: the revalidate action and route handler are public and fixed to `historyTags(slug)` by AGENTS.md, and the toolkit's webhook fires on `adw.runs` only. Like Active, the queue lives in the static shell and is kept current in the browser. A first visitor after a long idle may see a build-time queue until the channel joins and the catch-up rewrites it (seconds). Making the server-rendered queue fresher (a tag plus a `queue_items` webhook in the toolkit) is a possible follow-up.
- The issue says the projects reducer adjusts `queued` "on insert and delete". UPDATE is included on purpose: the publisher upserts every item on every save, so `queued` to `running` (the common way an item leaves the queue) is an UPDATE. The counts reducer lives in `apply-queue-change.ts`, beside the list reducer, the same way `applyRunChangeToSummaries` lives beside `applyRunChange`; `applyProjectChange` handles `adw.projects` events only and is unchanged.
- Why a slot rather than splitting `PageHeader` out of `ActiveRunsView`: the header reads the runs entry, and moving it would add a third `useSuspenseQuery` boundary for no gain. The slot keeps the Queue's own error and suspense boundaries independent of Active's.
- The `note`, `adw_id` and `updated_at` columns are read (the type mirrors the table) but not shown: a queued item has no run yet, and the note is for stopped or held items, which are not in this list.
