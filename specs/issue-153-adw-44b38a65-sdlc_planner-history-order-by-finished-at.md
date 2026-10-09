# Bug: History order: sort by finished_at, not updated_at

## Metadata

issue_number: `153`
adw_id: `44b38a65`
issue_json: `{"number":153,"title":"History order: sort by finished_at, not updated_at"}`

## Bug Description

History (the project page's list of completed runs) is ordered and keyset-paged by
`runs.updated_at desc, adw_id desc`. `updated_at` is not "when the run finished": the
`runs_set_updated_at` trigger stamps it on every update, so any write to a completed run (a
backfill, a late `pr_number` publish, a manual status fix) moves that run to the head of History.

On 2026-10-08 the toolkit migration `20261008160000_runs_pr_number.sql` backfilled `pr_number` on
79 completed runs, giving them all the same `updated_at` (16:01:24); 4 more shared a manual fix
timestamp (10:12). With 83 of 86 completed runs on two timestamps, History fell back to the
`adw_id desc` tiebreaker and showed runs in effectively random order.

Expected: History lists completed runs newest finished first (`finished_at desc, adw_id desc`), and
an update that leaves `finished_at` alone never changes the order.
Actual: the order follows the last write to each row.

## Problem Statement

The sort key and the keyset bookmark of History use a column that changes on every write. They must
use `finished_at`, which is written once by the terminal save and is set for every completed run.

## Solution Statement

Swap the History key from `updated_at` to `finished_at` everywhere the order is decided, keeping
`adw_id` as the tiebreaker:

- `src/lib/history-bookmark.ts`: the bookmark payload becomes `{ slug, direction, finished_at, adw_id }`;
  the older/newer filters compare `finished_at`; cursors are built from a row's `finished_at`. A
  bookmark of the old shape (no `finished_at`) fails validation and so reads as page one through the
  existing lenient `readHistoryBookmark` path. Extra keys are already ignored, so an old payload that
  only has `updated_at` is rejected for the missing `finished_at`, never silently mis-ordered.
- `src/data/index.ts` (`getCompletedRuns`): `.order("finished_at", { ascending })` then `adw_id`.
  `completedRuns` additionally filters `finished_at is not null`, so the rows and both counts share
  one filter and every row has a key (every completed run has one today; this keeps the keyset total
  and the type narrowing honest).
- Docs updated to the new order.

`Run.finished_at` is `string | null` in `src/types/adw.ts` (running runs have none), so the key is
typed `{ finished_at: string; adw_id: string }` and derived from a row by one small helper that
returns `null` for a row without `finished_at`; `cursorOf` and the data layer's newer-count anchor
use it. Do not widen the key type or fall back to `updated_at` (a fallback would make the filter and
the cursor disagree).

No change to the History search, cache tags, `getHistory` scope, revalidation, or `src/types/adw.ts`.
No index migration (toolkit concern, not needed at today's row counts).

## Steps to Reproduce

1. Read-only, against the hosted project (never write to it, see Protected): list the completed runs
   of a project ordered as History orders them today and as it should:
   `select adw_id, updated_at, finished_at from adw.runs where project_id = <id> and status = 'completed' order by updated_at desc, adw_id desc;`
   versus `order by finished_at desc, adw_id desc`. Any run whose `updated_at` was bumped after it
   finished shows up at a different position in the first list.
2. In code: `historyKeysetFilter(bookmark)` returns `updated_at.lt."..."`, and `getCompletedRuns`
   calls `.order("updated_at", ...)`. A unit test in `src/lib/history-bookmark.test.ts` whose rows
   have equal `finished_at` but different `updated_at` (or the reverse) shows the cursor carrying
   `updated_at`, not `finished_at`.

## Root Cause Analysis

The History keyset was built on `updated_at` on the assumption that a completed run never changes.
That assumption is false: the `runs_set_updated_at` trigger rewrites `updated_at` on every update,
including writes that do not change the run's outcome (backfills, `pr_number` publishes, manual
fixes). The order therefore reflects the time of the last write, and a bulk write collapses many
rows onto one timestamp so only the `adw_id` tiebreaker is left. `finished_at` is the column that
means "when the run finished" and is written once.

## Relevant Files

Use these files to fix the bug:

- `src/lib/history-bookmark.ts`: the bookmark type, codec, keyset filters, read order, display order,
  page split and cursors. The core of the fix.
- `src/lib/history-bookmark.test.ts`: the unit tests every change to the bookmark, filters or order
  must extend (a Rule in `app_docs/project-page.md`).
- `src/data/index.ts`: `completedRuns` (the shared filter of rows and counts) and `getCompletedRuns`
  (the order and the newer-count anchor), plus its doc comment stating the order.
- `src/types/adw.ts`: read only; `Run.finished_at` is `string | null`, which is why the key needs a
  narrowing helper.
- `app_docs/project-page.md`: describes the bookmark payload and the order under History paging.
- `app_docs/data-boundary.md`: describes `getCompletedRuns`' order, its SQL and the boundary summary.
- `docs/conditional-docs.md`: the index; the lines for `project-page.md` and `data-boundary.md` match
  this task. No new doc, so no new line.
- `AGENTS.md`: checked; it does not currently state the History order, so it needs no edit (the
  issue asks to update it "wherever it states" the order).

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Re-key the bookmark module on finished_at

In `src/lib/history-bookmark.ts`:

- Header comment: the display order is `finished_at desc, adw_id desc`; say why (`updated_at` is
  stamped by a trigger on every write, `finished_at` is written once by the terminal save).
- `HistoryBookmark`: replace `updated_at: string` with `finished_at: string`.
- `HistoryKey`: `{ finished_at: string; adw_id: string }` (no longer `Pick<Run, ...>`, since
  `Run.finished_at` is nullable).
- Add `export function historyKeyOf(row: Run): HistoryKey | null`, returning
  `{ finished_at, adw_id }` or `null` when `row.finished_at` is `null`. Document that a completed run
  always has one and that the read filters out any row without it.
- `encodeHistoryBookmark` / `decodeHistoryBookmark`: payload `{ slug, direction, finished_at, adw_id }`;
  validate `finished_at` with `isTimestamp` (kept verbatim). A payload without a valid `finished_at`
  (the old `updated_at` shape included) throws `UnknownCursorError`, which `readHistoryBookmark`
  already turns into page one. Update the JSDoc.
- `historyOlderFilter` / `historyNewerFilter`: `finished_at.lt."<ts>",and(finished_at.eq."<ts>",adw_id.lt."<id>")`
  and the `gt` mirror; update their comments.
- `cursorOf(slug, direction, row)`: build from `historyKeyOf(row)`; return `HistoryCursor | null`
  (null when the row has no key). In `toHistoryPage`, `newerCursor` / `olderCursor` become `null`
  when `cursorOf` does; otherwise unchanged.
- `historyOrderAscending`, `historyItems`: logic unchanged; update any comment naming `updated_at`.

### 2. Order and filter the data layer by finished_at

In `src/data/index.ts`:

- `completedRuns`: add `.not("finished_at", "is", null)` after the status filter, so the rows, the
  total and the newer count share it.
- `getCompletedRuns`: `.order("finished_at", { ascending })` then `.order("adw_id", { ascending })`.
- The newer-count anchor: `const anchor = (items[0] && historyKeyOf(items[0])) ?? bookmark;` (or an
  equivalent that passes a `HistoryKey` to `historyNewerFilter`; a `HistoryBookmark` is
  structurally a `HistoryKey`). Import `historyKeyOf`.
- Doc comment of `getCompletedRuns`: the order is `finished_at desc, adw_id desc`.
- Leave `getActiveRuns` ordered by `updated_at` (Active is about live runs, not this bug).

### 3. Extend the unit tests

In `src/lib/history-bookmark.test.ts`:

- Fixture `run(adw_id, finished_at, updated_at = finished_at)`; the shared `bookmark` uses
  `finished_at`. Every existing expectation that names `updated_at` (round trips, malformed list,
  filter strings, decoded cursors) moves to `finished_at`.
- New: the filters compare `finished_at`:
  `finished_at.lt."2026-10-01T12:34:56.123456+00:00",and(finished_at.eq."2026-10-01T12:34:56.123456+00:00",adw_id.lt."d2e29be0")`
  and the `gt` mirror.
- New: an old-shape bookmark `json({ slug, direction: "after", updated_at: <ts>, adw_id })` throws
  `UnknownCursorError` from `decodeHistoryBookmark` and reads as page one (`null`) through
  `readHistoryBookmark` (both `?after` and `?before`).
- New: a cursor is built from `finished_at`, not `updated_at`: a row whose `updated_at` is later
  than its `finished_at` (a bumped row) yields an `olderCursor` decoding to the row's `finished_at`.
- New: ties on `finished_at` are broken by `adw_id`: two rows with the same `finished_at` give
  distinct cursors whose newer/older filters include the `adw_id` clause with the right id.
- New: `historyKeyOf` returns the key of a completed row and `null` for a row with
  `finished_at: null`; `toHistoryPage` with such a last row has `olderCursor: null`.

### 4. Update the docs

- `app_docs/project-page.md`: History paging paragraph, bookmark `{ slug, direction, finished_at, adw_id }`
  (`finished_at` kept verbatim) and order `finished_at desc, adw_id desc`; add one sentence that
  `updated_at` is not the key because every write stamps it, so a backfill never reorders History.
  An old-shape `updated_at` cursor reads as page one.
- `app_docs/data-boundary.md`: both `getCompletedRuns` descriptions ("shown `finished_at desc, adw_id desc`")
  and the SQL block (`finished_at is not null`, the `?after`/`?before` predicates, the `order by`,
  and the newer count). Leave the Active lines (`updated_at desc`) as they are.
- `AGENTS.md` and `README.md` state no History order: no edit. No em-dashes anywhere.

### 5. Browser evidence for the review phase

E2E code suite is `none`. The review phase opens `http://localhost:$PORT/projects/SBub/issebya-homes-ai-system`
(or the first project the sidebar lists) at 1920x1080 and 375x667: History lists runs whose
Finished timestamps descend down the page and across pages; turning right through every page and
back left shows each run once. The existing journey `e2e/test_history_page_turn.md` already covers
paging; no new journey is needed (the order rule is proven by the unit tests).

### 6. Validate

Run the `Validation Commands` below.

## Test Coverage

Unit layer, `src/lib/history-bookmark.test.ts` (vitest): the keyset filters produce
`finished_at.lt/gt/eq` clauses, cursors carry the row's `finished_at` even when its `updated_at` is
later, ties on `finished_at` are broken by `adw_id`, and an old-shape `updated_at` bookmark reads as
page one. Each of these fails against the unfixed module (which emits and requires `updated_at`).
The `getCompletedRuns` order call is a database read with no test layer here; it is proven by the
read-only order check below and the review screenshots.

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- `grep -n "updated_at" src/lib/history-bookmark.ts` before and after: before it prints the key and
  filter lines; after it prints nothing except, at most, the comment explaining why it is not the key.
- `grep -n 'order("updated_at"' src/data/index.ts`: after the fix only the `getActiveRuns` line remains.
- `yarn lint`: lint, as the commit hook runs it.
- `yarn typecheck`: the nullable `finished_at` narrowing compiles.
- `yarn knip`: `historyKeyOf` is used, no dead export.
- `yarn format:check`: formatting.
- `yarn test`: the extended `history-bookmark.test.ts` and every other unit test pass.
- `yarn build`: reads the hosted database with `.env.local`; proves the PostgREST order and the
  `finished_at is not null` filter are accepted.
- Read-only order check against the hosted project (select only, see Steps to Reproduce): the
  `finished_at desc, adw_id desc` list matches what History shows page by page on the built app.

## Notes

- Protected forbids writing to the hosted Supabase project, so the acceptance step
  `update adw.runs set pr_number = pr_number where ...` must not be run by ADW. It is the
  maintainer's to run (then revalidate) after merge; the plan proves the same thing read-only, since
  after the fix nothing that History reads depends on `updated_at`.
- Old bookmarks in open tabs or shared links fall back to page one, by design (no error).
- The issue mentions an AGENTS.md proof rule and an AGENTS.md statement of the order; neither exists
  in the current `AGENTS.md`, so it is left unchanged.
- No new dependency. The optional index on `adw.runs (project_id, status, finished_at desc, adw_id desc)`
  is a toolkit migration, out of scope.
