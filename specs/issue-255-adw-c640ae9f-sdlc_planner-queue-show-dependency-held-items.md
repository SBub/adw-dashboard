# Feature: show dependency-held items in the Queue section, with their waiting reason

## Metadata

issue_number: `255`
adw_id: `c640ae9f`
issue_json: `{"number":255,"title":"queue: show items held on a dependency in the Queue section, with their waiting reason"}`

## Feature Description

A project's Queue section (`Up next`) lists only `adw.queue_items` rows in state `queued`. Since
SBub/adw-toolkit#148 the runner parks an item that cannot start yet (its dependency has not merged)
in state `held` with a reason that starts with the fixed prefix `waiting on a dependency: `
(`DEPENDENCY_HOLD_PREFIX` in the toolkit's `adws/adw_modules/queue_ops.py`), and moves it back to
`queued` by itself once the dependency merges. Those items vanish from the dashboard today, both on
the server read and in the Realtime fold.

This feature makes the Queue section show every item the queue will still start on its own: state
`queued`, plus state `held` whose reason starts with that prefix. A dependency-held row carries a
distinct `waiting` badge (its own colour token) and the reason after the prefix, on the same single
line, truncated, with the full text in a `title`. A `held` row with any other reason is a run the
merge gate held (a hold label) and keeps showing in Active/History exactly as today.

## User Story

As the owner of a project that the ADW queue builds
I want to see every queued item, including the ones waiting for a dependency to merge, and why each is waiting
So that I can tell at a glance that nothing was dropped and what each item is blocked on

## Problem Statement

On 2026-11-01 edit-issebya had 1 running, 1 queued and 9 dependency-held items, and the dashboard
showed one. The owner asked whether the other nine had been dropped. Three places filter on
`state === "queued"` only:

- `getQueue` in `src/data/index.ts` (`.eq("state", "queued")`, line ~443), with a doc comment saying
  every other state is a run.
- `applyQueueChange` in `src/data/apply-queue-change.ts` (INSERT and UPDATE branches drop any
  non-queued state), so an item entering a dependency hold disappears live.
- `QueueRow` hard-codes the `queued` badge.

## Solution Statement

One pure predicate, owned by one module, applied in all three places:

1. A new pure module `src/lib/queue-hold.ts` exports `DEPENDENCY_HOLD_PREFIX`
   (`"waiting on a dependency: "`, with a comment naming the toolkit's `DEPENDENCY_HOLD_PREFIX` in
   `adws/adw_modules/queue_ops.py` as the contract), `isDependencyHeld(item)`,
   `inQueueSection(item)` (queued, or dependency-held), `dependencyHoldReason(item)` (the reason with
   the prefix stripped, or null) and `QUEUE_SECTION_FILTER`, the PostgREST `or` filter string built
   from the constant.
2. `getQueue` replaces `.eq("state", "queued")` with `.or(QUEUE_SECTION_FILTER)`, ordering unchanged.
3. `applyQueueChange` keeps or adds a row while `inQueueSection(ev.new)` holds and removes it
   otherwise. `queuedIn` (the "was it queued before" read for the sidebar count) is narrowed to
   items whose cached state is `queued`, so the nav count keeps counting `queued` only now that the
   cached list also holds held items. A new `inQueueList` does the "row present at all" check the
   INSERT dedupe needs.
4. `queuePositions` ranks only `queued` items (the runner takes the first queued one); a
   dependency-held row gets a hollow, empty marker in the gutter and no ordinal, so `next` is
   always an item that can actually start.
5. A new status key `waiting` (indigo, light 700/100, dark 400/950, the same scheme as every other
   key) in `src/lib/status-colors.ts`. `QueueRow` shows `waiting` and the stripped reason for a
   dependency-held item, `queued` otherwise.
6. The project nav is left as is: `ProjectSummary.queued` comes from the `adw.project_summaries`
   view, which has no held or waiting column, so a waiting count would need a database change, which
   the issue forbids. The PR says so.

## Relevant Files

Use these files to implement the feature:

- `README.md`, `AGENTS.md`, `.adw/project.md`: rules (Yarn only, no em-dashes, Conventional Commits
  with no trailers, feature-doc invariants are binding).
- `docs/conditional-docs.md`: index; the matching docs are listed below.
- `app_docs/project-page.md`: the Queue rail's description and its Rules. Its Rules say a queue row
  holds "the issue link, the title and the status pill, and nothing else" and shows "no wait and no
  start hint", and that ordinals rank "the queued items". This feature changes those invariants, so
  the doc's Rules change in the same commit.
- `app_docs/realtime.md`: describes `applyQueueChange` as holding "the queued items only" and
  `queuedIn`; update both.
- `app_docs/data-boundary.md`: says `getQueue` reads rows where `state` is `queued` (line ~40) and
  `queryKeys.queue(slug)` holds "a project's queued items"; update.
- `app_docs/screens-and-components.md`: the status colour list (lines ~48 and ~244) gains `waiting`.
- `src/data/index.ts`: `getQueue` (line ~420-452) and its doc comment; `QUEUE_COLUMNS` already
  selects `state` and `reason`.
- `src/data/apply-queue-change.ts`: `queuedIn`, `applyQueueChange`, `applyQueueChangeToSummaries`.
- `src/data/apply-queue-change.test.ts`: the reducer tests to extend.
- `src/data/realtime.ts`: `applyQueueEvent` reads `queuedIn` before the rewrite (no code change
  expected beyond comments, since `queuedIn` keeps its name and meaning "was queued"); the catch-up
  calls `getQueue` for every cached queue (no change).
- `src/lib/queue-order.ts` and `src/lib/queue-order.test.ts`: `queuePositions` ranks queued only.
- `src/lib/status-colors.ts` and `src/lib/status-colors.test.ts`: new `waiting` key, key order test,
  hue test, status hue guard.
- `src/components/StatusBadge.tsx`: renders any `StatusKey`; no change needed (prints the key).
- `src/components/QueueRow.tsx`: badge, reason span, nullable marker.
- `src/components/QueueView.tsx`: doc comment ("items in state queued") and the `position` prop
  passed as `positions.get(...) ?? null`.
- `src/components/ProjectNav.tsx`: line ~56, `Count status="queued"`; unchanged (see Notes).
- `src/types/adw.ts`: `QueueState` (has `held`) and `QueueItem.reason`; no change.
- `e2e/fixtures.ts`: `openFirstProject`, `waitForLive`, `section`, `sectionRows`, `test`, `expect`.
- `e2e/queue_row_single_line.spec.ts`: today asserts every row has the `queued` pill, markers
  `next`, `2`, `3`, and that row chrome never contains `waiting` or `starts `. With dependency-held
  items in the live data this spec would fail, so it is updated to the new contract.
- `e2e/active_runs_narrow_reads.spec.ts`: the pattern for routing the browser's own `/rest/v1/...`
  reads to inject synthetic rows without writing to the hosted database.
- `node_modules/next/dist/docs/`: read the cache components guide before touching the page's
  `"use cache"` scope (no change to it is planned).

### New Files

- `src/lib/queue-hold.ts`: `DEPENDENCY_HOLD_PREFIX`, `isDependencyHeld`, `inQueueSection`,
  `dependencyHoldReason`, `QUEUE_SECTION_FILTER`.
- `src/lib/queue-hold.test.ts`: unit tests for the predicate, the reason helper and the filter
  string.
- `e2e/queue_dependency_held.spec.ts`: the browser spec for the three-row queue at 390 and 1440.

## Implementation Plan

### Phase 1: Foundation

The shared predicate and the colour token: `src/lib/queue-hold.ts` with its tests, the `waiting`
key in `STATUS_COLORS`, and `queuePositions` ranking queued items only.

### Phase 2: Core Implementation

The data path: `getQueue` reads through `QUEUE_SECTION_FILTER`; `applyQueueChange` applies
`inQueueSection`; `queuedIn` keeps meaning "was in state queued" for the nav count.

### Phase 3: Integration

The rendering: `QueueRow` shows the `waiting` badge, the stripped reason and an empty hollow marker
for held rows; `QueueView` passes `null` positions for them. Then the E2E spec, the updated single
line spec, and the four feature docs.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add the queue hold predicate (`src/lib/queue-hold.ts`)

- Header comment: pure and clock-free, the one place that decides whether a `queue_items` row
  belongs in the Queue section.
- `export const DEPENDENCY_HOLD_PREFIX = "waiting on a dependency: ";` with a comment: the contract is
  `DEPENDENCY_HOLD_PREFIX` in the toolkit's `adws/adw_modules/queue_ops.py` (SBub/adw-toolkit#148,
  PR #150); a held item without it is a run the merge gate held and belongs to Active/History.
- `export function isDependencyHeld(item: Pick<QueueItem, "state" | "reason">): boolean`:
  `item.state === "held" && item.reason?.startsWith(DEPENDENCY_HOLD_PREFIX) === true`.
- `export function inQueueSection(item: Pick<QueueItem, "state" | "reason">): boolean`:
  `item.state === "queued" || isDependencyHeld(item)`.
- `export function dependencyHoldReason(item): string | null`: the reason after the prefix,
  trimmed, or null when the item is not dependency-held or nothing follows the prefix.
- `export const QUEUE_SECTION_FILTER`: the same predicate as a PostgREST `or` filter, built from the
  constant:
  `` `state.eq.queued,and(state.eq.held,reason.like."${DEPENDENCY_HOLD_PREFIX}*")` ``.
  The value is double-quoted because `:` (and the space) are reserved inside `or`; `*` is
  PostgREST's `like` wildcard. Comment that the prefix holds no `%`, `_`, `"` or `,`, and that the
  test pins the string.
- Uses only `import type { QueueItem }`.

### 2. Unit-test the predicate (`src/lib/queue-hold.test.ts`)

- queued (reason null) is in; held with `waiting on a dependency: blocked by #30 (queued); starts on
its own once #30 merges` is in and dependency-held; held with another reason (`hold label
adw:hold`) is out; held with a null reason is out; held whose reason contains the prefix but not at
  the start is out; `running`, `merged`, `failed`, `gated` are out.
- `dependencyHoldReason` returns `blocked by #30 (queued); starts on its own once #30 merges` for the
  example, null for a queued item and for a gate-held item.
- `QUEUE_SECTION_FILTER` equals
  `state.eq.queued,and(state.eq.held,reason.like."waiting on a dependency: *")`.

### 3. Add the `waiting` status colour (`src/lib/status-colors.ts`, its test)

- `export type StatusKey = RunStatus | "queued" | "waiting";`
- Add `waiting` right after `queued` in `STATUS_COLORS`, indigo in the existing scheme:
  text `text-indigo-700 dark:text-indigo-400`, badge
  `bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400`, border
  `border-indigo-300 dark:border-indigo-700`, dot `bg-indigo-500`. Indigo because it is unused in
  `src/` (violet is the `/feature` issue class, fuchsia the Work with me button) and reads apart
  from the amber `queued`. Add a `waiting` line to the header comment ("held until a dependency
  merges; starts on its own").
- `status-colors.test.ts`: key order becomes `queued, waiting, running, completed, failed, neutral`;
  add `waiting: "indigo"` to `HUES`; add `indigo` to the `STATUS_HUE` guard regex so the hue lives
  only in the map.

### 4. Rank only queued items (`src/lib/queue-order.ts`, its test)

- `queuePositions` filters to `state === "queued"` before sorting; held items get no entry. Update
  its comment: a dependency-held item cannot start, so it has no ordinal and is never `next`.
- `queue-order.test.ts`: a list of held(position 2), queued(5), held(9), queued(11) gives
  `{5's issue: 1, 11's issue: 2}` and no key for the held items.

### 5. Read dependency-held items in `getQueue` (`src/data/index.ts`)

- Replace `.eq("state", "queued")` with `.or(QUEUE_SECTION_FILTER)` (imported from
  `@/lib/queue-hold`); keep `.eq("project_id", ...)` and both `.order(...)` calls.
- Rewrite the doc comment: state `queued` and state `held` with the dependency prefix (items the
  runner starts on its own); every other state, including a gate-held `held`, is a run shown in
  Active or History.

### 6. Apply the predicate in the Realtime fold (`src/data/apply-queue-change.ts`, its test)

- `queuedIn(current, issueNumber)`: returns undefined when not cached, otherwise whether the cached
  list holds that issue **in state `queued`**. It feeds only `applyQueueChangeToSummaries`, whose
  count is the view's `queued`; without this a held to queued UPDATE would compute delta 0.
- New `export function inQueueList(current: QueueItem[], issueNumber: number): boolean` (or an
  unexported helper if knip allows only internal use; keep it unexported unless a test needs it) for
  the INSERT dedupe.
- INSERT: ignore unless `inQueueSection(ev.new)`; dedupe by `inQueueList`; add and sort.
- UPDATE: `inQueueSection(ev.new)` replaces or adds and re-sorts; anything else removes.
- `applyQueueChangeToSummaries`: unchanged logic (`now` stays `ev.new.state === "queued"`); update
  comments.
- Update the file header and `applyQueueChange` doc comment.
- Tests to add in `apply-queue-change.test.ts`:
  - INSERT of a dependency-held item adds it in position order.
  - INSERT of a gate-held item (other reason) returns the input by identity.
  - UPDATE queued to dependency-held keeps the row and carries the new state and reason.
  - UPDATE dependency-held to queued keeps the row (state now queued).
  - UPDATE dependency-held to running removes it.
  - UPDATE dependency-held to gate-held (reason changes to a hold label) removes it.
  - `queuedIn` is false for a cached dependency-held item, true for a cached queued one,
    undefined when uncached.
  - `applyQueueChangeToSummaries` with `wasQueued` false and an UPDATE held to queued gives +1;
    queued to dependency-held gives -1; INSERT of a dependency-held item gives 0.

### 7. Render the waiting row (`src/components/QueueRow.tsx`, `src/components/QueueView.tsx`)

- `QueueRow` props: `position: number | null` (null for a dependency-held item). Compute
  `const reason = dependencyHoldReason(item)` and `const status = isDependencyHeld(item) ? "waiting" : "queued"`.
- Gutter marker: `position === 1` filled `next` as today; a number shows the hollow ordinal as
  today; `null` shows the same hollow 20px circle (`STATUS_COLORS.waiting.border`, `bg-background`)
  with no text, `aria-hidden`. The rail line keeps `STATUS_COLORS.queued.border`.
- The card's single flex row becomes: issue link, title span (unchanged, wraps, `flex-1`), then for a
  held item a reason span
  `<span title={reason} className="min-w-0 flex-1 truncate text-sm leading-6 text-neutral-500 dark:text-neutral-400">{reason}</span>`,
  then the badge `<StatusBadge status={status} />` in the existing right-aligned `h-6` box. The
  reason never wraps (`truncate`) so it never adds a line, and every element stays top-aligned on
  the title's first line. When `reason` is null for a held item (prefix with nothing after it) no
  span is rendered.
- Update the component doc comment.
- `QueueView`: pass `position={positions.get(item.issue_number) ?? null}`; update the doc comment
  ("items the queue will start: queued, plus held on a dependency").
- `ProjectNav.tsx`: no change (see Notes).

### 8. Update the existing single line spec (`e2e/queue_row_single_line.spec.ts`)

- Each row's pill is `queued` or `waiting` (exact). Markers: the first `queued` row's marker reads
  `next`, later `queued` rows read `2`, `3`... in order; a `waiting` row's marker is empty.
- The forbidden-chrome check (`label:`, `waiting`, `starts `, `manual`, `Removing the label`) runs on
  `queued` rows only, and also excludes the pill text. For a `waiting` row, check only that the
  chrome (minus the title and the reason span) holds no `label:` chip.
- The pill geometry check finds the pill by `queued` or `waiting` text.
- Update the header comment.

### 9. Add the dependency-held E2E spec (`e2e/queue_dependency_held.spec.ts`)

Modelled on `e2e/active_runs_narrow_reads.spec.ts`. The hosted database is never written, so the
browser's own `/rest/v1/queue_items` read is routed and answered with synthetic rows.

- Fixture rows (synthetic issue numbers such as 925501 to 925504, titles `E2E 255 queued`,
  `E2E 255 waiting A`, `E2E 255 waiting B`, `E2E 255 gate held`), `project_id` taken from the
  request's `project_id=eq.<id>` param:
  - held, position 2, reason `waiting on a dependency: blocked by #925502 (queued); starts on its own once #925502 merges`
  - queued, position 5
  - held, position 9, reason `waiting on a dependency: blocked by #925501 (held); starts on its own once #925501 merges`
  - held, position 3, reason `hold label adw:hold` (gate-held)
  - running, position 1
- The route emulates the PostgREST filter of the request it receives, so the spec fails if
  `getQueue` stops asking for held rows: with an `or` param containing `state.eq.queued` and
  `state.eq.held` and `reason.like."waiting on a dependency: *"`, return queued plus held rows whose
  reason starts with the prefix; with `state=eq.queued`, return queued rows only; with any other
  filter, fulfil with status 500 so the mismatch shows. Sort by `position`, then `issue_number`.
- Flow per viewport (`for (const width of [390, 1440])`, height 900, a `test` each):
  `page.setViewportSize`, attach the route before navigation, `openFirstProject(page)`,
  `waitForLive(page)` (the channel's first catch-up calls `getQueue` for the cached queue entry,
  in the browser, through the route), then expect `sectionRows(page, "Up next")` to have count 3.
- Assertions:
  - Row texts in order: `E2E 255 waiting A`, `E2E 255 queued`, `E2E 255 waiting B` (position
    2, 5, 9); `E2E 255 gate held` is nowhere in `Up next`.
  - Rows 1 and 3 hold the `waiting` pill (exact), row 2 the `queued` pill; row 2's marker reads
    `next`, rows 1 and 3 have empty markers.
  - Rows 1 and 3 show their reason without the prefix (`blocked by #925502 (queued); starts on its own once #925502 merges`),
    the text does not contain `waiting on a dependency:`, and the reason element's `title`
    attribute is the full stripped reason.
  - Each row is one line: in the card's flex row, the issue link, the reason span and the pill all
    have a top within 2px of the link's top, and the reason span's height is at most 26px (one 24px
    line box). At 390 the reason is truncated (`scrollWidth > clientWidth` allowed, never a second
    line); `expectNoHorizontalOverflow(page)`.
- Header comment: what it proves, why the route emulates the filter, and that the negative check is
  reverting the `getQueue` predicate (the route then returns one row and the count of 3 fails).

### 10. Negative check of the E2E

- Temporarily change `.or(QUEUE_SECTION_FILTER)` back to `.eq("state", "queued")`, run
  `PORT=<run port> yarn test:e2e e2e/queue_dependency_held.spec.ts`, confirm it fails on the row
  count (1, expected 3), then restore the predicate and confirm it passes. Do not commit the revert.
  Record the outcome in the PR description.

### 11. Update the feature docs

- `app_docs/project-page.md`: the QueueView paragraph (rows are queued plus dependency-held items;
  the `waiting` badge and the stripped reason, truncated with a `title`; ordinals rank queued items
  only, a held row has an empty hollow marker) and the Rules: a row holds the issue link, the title,
  for a dependency-held item its reason (after `DEPENDENCY_HOLD_PREFIX`, one line, `truncate` with a
  `title`), and the pill, nothing else; the "no wait and no start hint" rule now reads that a queued
  row shows none, and a held row shows only the toolkit's reason; `queuePositions` ranks state
  `queued` only; the predicate lives only in `src/lib/queue-hold.ts`. Add this spec to its list.
- `app_docs/realtime.md`: `applyQueueChange` holds the Queue section's items (`inQueueSection`);
  `queuedIn` reads only cached `queued` items so the nav count stays `queued`.
- `app_docs/data-boundary.md`: `getQueue` reads `state = queued` or a dependency hold through
  `QUEUE_SECTION_FILTER`; `queryKeys.queue(slug)` holds the Queue section's items.
- `app_docs/screens-and-components.md`: add `waiting` (indigo) to both status colour lists.
- `docs/conditional-docs.md`: extend the `project-page.md` line with "or which queue items the Queue
  section shows (the dependency hold)" so a later run finds it.
- No em-dashes anywhere.

### 12. Run the validation commands

Run every command in `Validation Commands` and fix anything that fails without weakening a rule,
type or test.

## Testing Strategy

### Unit Tests

- `src/lib/queue-hold.test.ts`: the predicate (queued in, dependency-held in, gate-held out, null
  reason out, prefix not at start out, other states out), the reason helper and the pinned filter
  string.
- `src/data/apply-queue-change.test.ts`: the fold cases listed in step 6, including held to queued
  keeps the row and held to running removes it, plus `queuedIn` and the summary delta for held
  transitions.
- `src/lib/queue-order.test.ts`: held items get no ordinal; queued items rank among themselves.
- `src/lib/status-colors.test.ts`: the `waiting` key, its indigo scheme, and the guard.

### Test Coverage

- Unit, `src/lib/queue-hold.test.ts`: catches a predicate or filter string that lets a gate-held
  run into the queue or drops dependency-held items; nothing covers this today.
- Unit, `src/data/apply-queue-change.test.ts` (extended): catches a live fold that drops an item
  entering a dependency hold, or keeps one that started; today's tests assert the opposite for held.
- Unit, `src/lib/queue-order.test.ts` (extended): catches a held item taking the `next` marker.
- Unit, `src/lib/status-colors.test.ts` (extended): catches a missing or off-scheme `waiting` token.
- E2E, `e2e/queue_dependency_held.spec.ts`: catches `getQueue` not asking for dependency-held rows
  (row count), the row not showing the `waiting` badge or reason, and the row breaking onto a second
  line at 390 or 1440. Fails without the feature (one row, no `waiting` pill).
- E2E, `e2e/queue_row_single_line.spec.ts` (updated): keeps the single line and marker contract on
  live data that now includes held rows.

### Edge Cases

- Held with a null reason, or a reason that contains the prefix later in the text: gate-held, out.
- Held whose reason is exactly the prefix: in the queue, `waiting` badge, no reason span.
- A queue holding only dependency-held items: rows render, no `next` marker anywhere, no
  `Nothing queued.` panel.
- Held to queued UPDATE: the row stays, badge switches to `queued`, the sidebar count rises by 1.
- Queued to dependency-held UPDATE: the row stays as `waiting`, the count falls by 1.
- Dependency-held to running, merged or gate-held: the row leaves.
- Replayed INSERT of a held item already in the list: no duplicate.
- A very long reason at 390 wide: truncated on one line, full text in `title`, no horizontal page
  overflow.

## Acceptance Criteria

- `getQueue` returns `queued` items and `held` items whose reason starts with
  `waiting on a dependency: `, ordered by position then issue number; gate-held items are not
  returned.
- `DEPENDENCY_HOLD_PREFIX` is defined once, in `src/lib/queue-hold.ts`, with a comment naming the
  toolkit's `DEPENDENCY_HOLD_PREFIX` as the contract; the filter string is built from it.
- The Realtime fold keeps or adds a dependency-held item, keeps it when it returns to `queued`, and
  removes it on any other state.
- A dependency-held row shows a `waiting` badge in its own indigo token and the reason after the
  prefix on the same line, truncated, with the full text in `title`; the row stays one line at 390
  and 1440.
- `next` and the ordinals count `queued` items only.
- The sidebar count still counts `queued` only and moves correctly on held/queued transitions.
- Gate-held runs show where they do today; no database or toolkit change.
- The four feature docs and the index line are updated; their changed invariants are rewritten in
  the same change. No em-dashes.
- Lint, typecheck, knip, format, unit, build, the post metadata check and E2E pass; the negative
  check fails on the row count with the predicate reverted.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint`: ESLint over the changed sources and specs.
- `yarn typecheck`: `StatusKey` widening and the nullable `position` prop compile everywhere.
- `yarn knip`: the new module's exports are all used (unexport anything only the module uses).
- `yarn format:check`: Prettier, as the commit hook enforces.
- `yarn test`: the unit tests for the predicate, the fold, the ordinals and the colour map.
- `yarn build`: the app builds and `getQueue`'s new filter is accepted by PostgREST at build time
  reads.
- `yarn check:og`: the post metadata check the test phase runs after the build (unaffected, run for
  zero regressions).
- `PORT=<run port> yarn test:e2e`: the full Playwright suite against this run's server, including
  `e2e/queue_dependency_held.spec.ts` and the updated `e2e/queue_row_single_line.spec.ts` (the port
  comes from `.ports.env`; never `CI=1`).

## Notes

- No new dependency.
- Project nav: left as is. `ProjectSummary.queued` comes from the `adw.project_summaries` view,
  which has no held or waiting column, so a waiting count needs either a database change (forbidden
  here) or a per-project queue read the sidebar does not make today. Say this in the PR.
- The PostgREST `or` value is double-quoted because `:` is reserved inside `or`; if the build or a
  live read rejects the filter, check the quoting first.
- The E2E route answers the catch-up read only; the first server-rendered rows come from the real
  database. Asserting after `waitForLive` and on the synthetic titles keeps it deterministic. A real
  queue event for the opened project could still fold into the list mid-test; the assertions count
  rows within `Up next` by the synthetic set only if that proves flaky (filter rows by the `E2E 255`
  title prefix), but start with the plain count of 3 since it is what the negative check relies on.
- The `waiting` badge text equals the status key, as `StatusBadge` prints the key; keep the key
  lower-case like `queued`.
- Commits: `feat: ...`, no trailers.
