# Feature: History pagination as arrows with a derived page number

## Metadata

issue_number: `40`
adw_id: `52e59eaf`
issue_json: `{"number":40,"title":"History pagination as arrows with a derived page number","body":"## Problem\n\nThe Newer and Older links read as a direction, not a position. Replace them with a left arrow, a page indicator, and a right arrow, while keeping pagination server-rendered and the keyset bookmark.\n\n## What to build\n\n- Right arrow: today's Older link, ?after=<bookmark of the last shown row> (plus q once search exists).\n- Left arrow: the mirror query, ?before=<bookmark of the first shown row>: rows newer than the bookmark, limited to the page size, reversed for display. Both arrows are plain anchors from the server component; hidden when there is nothing in that direction.\n- Page indicator \"N of M\", derived inside the same cached getHistory entry, never carried in the URL: N is one plus the count of completed runs newer than the first shown row divided by the page size (ceil), M is ceil(total completed / page size). Both counts are queries on the indexed (project_id, status, updated_at) path and drop with the history:<slug> tag, so after a completion the label is recomputed with the rows.\n- Bookmark helper gains a direction (after | before) in its payload so a before bookmark cannot be fed to after and vice versa; invalid or foreign values render page one.\n- Tests: the before query selection and reversal, the derived page number for first, middle and last pages, and the direction check.\n- README: replace the Newer/Older sentence.\n\n## Acceptance\n\n- Page one shows no left arrow and \"1 of M\"; stepping right then left returns the same rows; the indicator changes only when the data does.\n- With a run completing while on a middle page, the rows under the bookmark stay the same and the indicator updates on the next render.\n- Gates pass; project pages remain partial prerenders.\n\n## Out of scope\n\nJumping to an arbitrary page number (needs offset paging), search integration beyond passing q through."}`

## Feature Description

The History heading row of a project page today ends in two text links, `Newer` (always back to page one) and `Older` (`?after=<bookmark>`). They say which way to go but not where the visitor is. This feature replaces them with a left arrow, a page indicator `N of M` and a right arrow:

- The right arrow is today's `Older` link: `?after=<bookmark of the last shown row>` (with `q` first when a search is active).
- The left arrow is the mirror: `?before=<bookmark of the first shown row>`, which reads the rows strictly newer than the bookmark, oldest first, limited to the page size, and reverses them for display. When the rows newer than the first shown row fit on one page, the left arrow links to page one itself (`historyHref(slug, null, q)`) instead, so the head of the list is always the canonical full page one and never a short `?before` page.
- `N of M` is derived inside the same cached `getHistory` entry, never carried in the URL: `N = 1 + ceil(newer / HISTORY_PAGE_SIZE)` where `newer` is the count of completed runs (matching `q`) strictly newer than the first shown row, and `M = ceil(total / HISTORY_PAGE_SIZE)`, clamped to at least `N`. Both counts are `count: "exact", head: true` reads on the same `project_id` / `status = completed` filter, so they live and die with the `history:<slug>` tag like the rows.
- The bookmark payload gains a `direction` (`"after"` or `"before"`), so a `before` bookmark pasted into `?after` (or the reverse) is rejected; every invalid, foreign, mismatched or legacy (direction-less) value renders page one.

Pagination stays fully server-rendered (plain `next/link` anchors from a server component, no `"use client"`), keyset-based and under the one per-project tag.

## User Story

As a developer watching a project's ADW runs
I want History to show where I am ("2 of 5") and let me step back and forth with arrows
So that I can tell how deep into the history I am and walk back one page at a time instead of jumping to page one

## Problem Statement

`Newer` and `Older` read as directions, not positions. A visitor on page three has no idea how many pages there are or which one they are on, and `Newer` throws them back to page one instead of one page back, because the keyset bookmark only supports "strictly older than".

## Solution Statement

Extend the pure bookmark module with a direction and a mirror keyset, extend the data boundary's history read with two counts, and render arrows plus the indicator from the cached page:

1. `src/lib/history-bookmark.ts`:
   - `HistoryDirection = "after" | "before"`; `HistoryBookmark` gains `direction`. `encodeHistoryBookmark` writes `{ slug, direction, updated_at, adw_id }`; `decodeHistoryBookmark(cursor, slug, direction)` validates the field and throws a new `CursorDirectionMismatchError` when the payload's direction is not the expected one (a payload with no or an unknown direction is `UnknownCursorError`).
   - `readHistoryBookmark(after, before, slug)`: decodes `?after` as an `after` bookmark and `?before` as a `before` bookmark; both present, or any invalid, foreign or mismatched value, is `null` (page one).
   - `historyNewerFilter(key)` (rows strictly newer than `{ updated_at, adw_id }`: `updated_at.gt."…",and(updated_at.eq."…",adw_id.gt."…")`) beside the existing older filter; `historyKeysetFilter(bookmark)` picks the older filter for `after` and the newer filter for `before`.
   - `historyOrderAscending(bookmark)`: `true` only for a `before` bookmark (the read walks towards the head, oldest first).
   - `historyItems(rows, bookmark)`: the shown rows in display order: the first `HISTORY_PAGE_SIZE` rows, reversed for a `before` bookmark. Never mutates its input.
   - `toHistoryPage(items, { slug, newer, total })` replaces the N + 1 split: returns `HistoryPage` `{ items, page, pageCount, hasNewer, newerCursor, olderCursor }` where `page = 1 + ceil(newer / size)`, `pageCount = max(ceil(total / size), page)`, `hasNewer = newer > 0`, `newerCursor` is a `before` cursor of `items[0]` only when `newer > size` (otherwise `null`, meaning page one when `hasNewer`), and `olderCursor` is an `after` cursor of the last item when `newer + items.length < total`.
   - `historyHref(slug, cursor, q)` takes the cursor as `{ direction, cursor } | null` and writes `?after=` or `?before=` accordingly (`q` still first).
2. `src/data/index.ts`, `getCompletedRuns(slug, bookmark, q)` (same signature): one private builder for the completed-runs filter (project, status, optional `q`); the rows read applies `historyKeysetFilter(bookmark)`, orders `updated_at`/`adw_id` by `historyOrderAscending(bookmark)`, limits to `HISTORY_PAGE_SIZE`; the `total` count runs in parallel with it; `historyItems` puts the rows in display order; then the `newer` count (rows strictly newer than `items[0]`, or `0` when no row is shown on page one, or newer than the bookmark itself when a bookmarked page is empty) runs; `toHistoryPage` assembles the page. All inside the existing `getHistory` cache scope, so the counts drop with `history:<slug>`.
3. `src/components/HistoryLinks.tsx` (server component, no state): props `newerHref`, `olderHref`, `page`, `pageCount`. Renders a `<nav aria-label="History pages">` with the left arrow (`←`, `aria-label="Newer runs"`), the `N of M` text and the right arrow (`→`, `aria-label="Older runs"`); a missing arrow is an invisible, `aria-hidden` placeholder of the same width so the indicator does not jump; nothing at all when there is a single page and no arrow.
4. The page: `readHistory` reads `after` and `before`; `HistoryPagination` builds `newerHref` (`hasNewer ? historyHref(slug, newerCursor, q) : null`) and `olderHref` (`olderCursor ? historyHref(slug, olderCursor, q) : null`) and passes `page` and `pageCount`.

Why the counts and not the N + 1 row: one source decides both arrows and the indicator, so they can never disagree, and the `before` direction needs a count anyway to know whether the head is reached. The counts are on the same indexed `(project_id, status, updated_at)` path the rows use.

## Relevant Files

Use these files to implement the feature:

- `README.md` - "Runs: active and history": the `getCompletedRuns` paragraph (one row more than a page, `{ items, nextCursor }`), the boundary signature list (`HistoryPage` shape), item 5 (`HistoryLinks` with `newerHref`/`olderHref`) and the paging paragraph with the `Newer`/`Older` sentence and the bookmark JSON shape; the search paragraph (`Newer`/`Older` carry `q`).
- `AGENTS.md` - Rules that describe the history read (`HISTORY_PAGE_SIZE + 1` rows split by `toHistoryPage` into `{ items, nextCursor }`), the `Newer`/`Older` links of `HistoryLinks`, the list of what lives in `src/lib/history-bookmark.ts`, and "`?after` is decoded by `readHistoryBookmark`"; each is updated to the new state in the same change.
- `.adw/project.md` - Read only: no script, port, env file or docs location changes; the profile stays untouched.
- `src/lib/history-bookmark.ts` - The direction, the mirror filter, the order flag, `historyItems`, the new `toHistoryPage`, `historyHref` with a direction.
- `src/lib/history-bookmark.test.ts` - Existing cases updated to the new signatures; new cases listed under Testing Strategy.
- `src/data/index.ts` - `getCompletedRuns`: direction-aware rows read and the two counts.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx` - `readHistory` (reads `before`), `HistoryPagination` (new props), the comments that name `Newer/Older` and `nextCursor`.
- `src/components/HistoryLinks.tsx` - Arrows and indicator.
- `src/lib/history-search.ts` - Read only: `historySearchFilter(q)` is applied to the two counts too, so `N of M` counts within the search.
- `src/components/HistorySearch.tsx` - Read only: calls `historyHref(slug, null, q)`; the `null` cursor still means page one, so the call is unchanged.
- `src/lib/history-tags.ts` - Read only: the counts are under the same `historyTag(slug)`; no new tag.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheLife.md` and `.../cacheTag.md` - Read before touching `getHistory`; its tag and `cacheLife` stay as they are.

## Implementation Plan

### Phase 1: Foundation

The pure bookmark module: direction in the payload and the decoder, the mirror keyset filter, the order flag, the display reversal, the count-based page split, and a direction-aware `historyHref`, each with test cases (red first, then green).

### Phase 2: Core Implementation

`getCompletedRuns` reads one page in either direction and the two counts, assembling the new `HistoryPage` through `toHistoryPage`. `HistoryLinks` renders arrows and the indicator.

### Phase 3: Integration

The page's `readHistory` and `HistoryPagination` read `?before` and pass the new props; README and AGENTS describe the new state; the gates and a production build prove the project page is still a partial prerender.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the rules and the docs

- Read `AGENTS.md` sections "Architecture" and "Runs: active and history" and the README "Runs: active and history" and "What is prerendered and what is not" sections.
- Read the installed `cacheTag.md` and `cacheLife.md` under `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/`. Nothing about the cache scope changes: `getHistory`'s signature, tag and `cacheLife` stay exactly as they are.

### 2. Write the failing bookmark tests

In `src/lib/history-bookmark.test.ts` (update the `bookmark` fixture with `direction: "after"`, add a `before` fixture and a helper that builds `n` rows newest first):

- Codec: round trip keeps `direction`; `decodeHistoryBookmark(after-cursor, SLUG, "before")` throws `CursorDirectionMismatchError` and the reverse too; a payload without `direction` or with `direction: "sideways"` throws `UnknownCursorError`.
- `readHistoryBookmark(after, before, slug)`: a valid `after` cursor in `?after` returns it; a valid `before` cursor in `?before` returns it; a `before` cursor in `?after` and an `after` cursor in `?before` are `null`; both params present is `null`; absent, empty, repeated and foreign remain `null`.
- `historyKeysetFilter`: an `after` bookmark gives the existing strictly-older string; a `before` bookmark gives the strictly-newer string (`updated_at.gt."…",and(updated_at.eq."…",adw_id.gt."…")`), equal to `historyNewerFilter` of the same key.
- `historyOrderAscending`: `null` and `after` are `false`, `before` is `true`.
- `historyItems`: for `null`/`after` it returns the first `HISTORY_PAGE_SIZE` rows as given; for `before` it takes the first `HISTORY_PAGE_SIZE` of the ascending rows and reverses them, so the display order is newest first; never mutates the input (freeze it).
- `toHistoryPage` with 8 completed rows (size 3):
  - first page (`newer = 0`, `total = 8`, 3 items): `page 1`, `pageCount 3`, `hasNewer false`, `newerCursor null`, `olderCursor` an `after` cursor of the third row.
  - middle page (`newer = 3`, 3 items): `page 2`, `pageCount 3`, `hasNewer true`, `newerCursor null` (the left arrow is page one), `olderCursor` set.
  - last page (`newer = 6`, 2 items): `page 3`, `pageCount 3`, `hasNewer true`, `newerCursor` a `before` cursor of the first item, `olderCursor null`.
  - a page after a completion on a middle page (`newer = 4`, `total = 9`): `page 3`, `pageCount 3`; and a misaligned case where `ceil(total / size) < page` reports `pageCount === page`.
  - empty history (`newer = 0`, `total = 0`, no items): `page 1`, `pageCount 1`, no cursors.
- `historyHref`: `{ direction: "after", cursor }` writes `?after=`, `{ direction: "before", cursor }` writes `?before=`, `q` stays first, `null` is page one; the existing cases are updated to the new cursor shape.
- Round trip "right then left returns the same rows": from the rows of page one, the `after` cursor of the last item through `readHistoryBookmark` and `historyItems` of the next three rows, then `newer = 3` gives `hasNewer` with `newerCursor null`, which is page one: the same three rows. One test, pure.

Run `yarn test` and confirm the new cases fail.

### 3. Implement the bookmark module

In `src/lib/history-bookmark.ts`, as described in the Solution Statement, keeping the module pure (no `@/data`, no `next/*`, no clock). Update the file header comment: the cursor is `?after=` or `?before=`, the page split is count-based. Keep `HISTORY_PAGE_SIZE = 3` and keep it defined only here. Remove `nextCursor` and anything only it used. Run `yarn test` until green.

### 4. Change the data boundary

In `src/data/index.ts`, `getCompletedRuns(slug, bookmark, q)` (signature unchanged):

- Unknown slug: `{ items: [], page: 1, pageCount: 1, hasNewer: false, newerCursor: null, olderCursor: null }` (build it with `toHistoryPage([], { slug, newer: 0, total: 0 })`).
- A private helper that returns the base filter (`from("runs")`, `eq("project_id")`, `eq("status", "completed")`, `.or(historySearchFilter(q))` when `q`) for a given `select` and options, so the rows read and both counts share one definition. Keep `RUN_COLUMNS` for the rows; the counts select `adw_id` with `{ count: "exact", head: true }`.
- Rows: `.or(historyKeysetFilter(bookmark))` when a bookmark is set, both orders with `ascending: historyOrderAscending(bookmark)`, `.limit(HISTORY_PAGE_SIZE)`. The total count in the same `Promise.all`.
- `items = historyItems(rows, bookmark)`; `newer` = count with `.or(historyNewerFilter(items[0]))` when there is a first item; `0` when there is none and no bookmark; when a bookmarked page is empty, the count newer than the bookmark key itself (a `before` read that returned nothing gives `0`, an `after` page past the end gives everything newer, so the left arrow leads back).
- Every error is thrown as `runs: <message>`, as today; nothing is swallowed. Keep the single `Run[]` cast.
- Update the function's doc comment (keyset in both directions, two counts, no N + 1 row, no clock).

### 5. Render arrows and the indicator

Rewrite `src/components/HistoryLinks.tsx`: props `newerHref: string | null`, `olderHref: string | null`, `page: number`, `pageCount: number`. Return `null` when `pageCount <= 1` and both hrefs are `null`. Otherwise a `<nav aria-label="History pages" className="flex items-center gap-3">` with: the left arrow `<Link href={newerHref} aria-label="Newer runs">←</Link>` or an `aria-hidden` invisible placeholder `<span>` with the same classes; `<span className="text-sm tabular-nums ...">{page} of {pageCount}</span>`; the right arrow likewise (`aria-label="Older runs"`, `→`). No `"use client"`, no URL building, no em-dash. Update the doc comment.

### 6. Wire the page

In `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`:

- `readHistory`: `const { after, before, q: rawQuery } = await searchParams;` and `readHistoryBookmark(after, before, slug)`.
- `HistoryPagination`: destructure `q, page, pageCount, hasNewer, newerCursor, olderCursor`; pass `newerHref={hasNewer ? historyHref(slug, newerCursor, q) : null}`, `olderHref={olderCursor ? historyHref(slug, olderCursor, q) : null}`, `page`, `pageCount`.
- Update the comments that name "the Newer/Older links" and `?after` (now `?after` / `?before`), and the `getHistory` doc comment (a completion changes the counts as well as page one, which is why every page shares the tag).
- Do not await `searchParams` anywhere else, do not touch `getRunsState`, `getQueueState` or `generateMetadata`, and leave `getHistory`'s tag and `cacheLife` alone.

### 7. Update README and AGENTS

- `README.md`: the `getCompletedRuns` paragraph (either direction, `HISTORY_PAGE_SIZE` rows, two counts, returns `{ items, page, pageCount, hasNewer, newerCursor, olderCursor }`); the boundary signature list's `HistoryPage` shape; item 5 (`HistoryLinks` renders the left arrow, `N of M` and the right arrow); the paging paragraph: replace the `Newer`/`Older` sentence with the arrows and the indicator, describe `?before=`, the bookmark JSON `{ slug, direction, updated_at, adw_id }`, the direction check, the left arrow falling back to page one when the newer rows fit one page, and that `N of M` is computed in the same cached entry (so a completion recomputes it with the rows, under the same tag); the search paragraph: the arrows carry `q` and the counts are within the search.
- `AGENTS.md`: the `getCompletedRuns` description in "Architecture" (keyset in either direction, `HISTORY_PAGE_SIZE` rows, two counts, `toHistoryPage` into the new shape; never an offset); the `HistoryLinks` rule (left and right arrows and the indicator, hrefs built by `HistoryPagination` with `historyHref`, `null` hides an arrow, the page number is never in the URL); the list of what lives in `history-bookmark.ts` (add `historyNewerFilter`, `historyOrderAscending`, `historyItems`); the decoding rule (`?after` and `?before` decoded by `readHistoryBookmark`, a direction mismatch is page one). No em-dashes.

### 8. Browser evidence for the review phase

E2E is `none` in the profile, so the review phase provides the browser evidence. The reviewer opens `http://localhost:$PORT/projects/SBub/issebya-homes-ai-system` (or the first project the sidebar lists) at desktop 1920x1080 and mobile 375x667 and checks:

- Page one: no left arrow (its slot is empty), `1 of M`, a right arrow when M > 1.
- After clicking the right arrow: the URL has `?after=`, the indicator reads `2 of M`, a left arrow is shown; clicking it returns to the exact rows of page one at `/projects/<slug>` (no `?before`, since the newer rows fit one page).
- On page three or later: the left arrow's href carries `?before=` and leads to page `N - 1` with the same rows as stepping right showed.
- With `?q=` set, both arrows keep `q` and `M` counts only matching runs.
- A hand-edited `?after=` holding a `before` cursor (copy a left arrow's value into `?after`) renders page one.
- The heading row does not wrap awkwardly at 375 wide.

No `e2e/*.md` journey: every rule behind the arrows and the indicator is in pure helpers covered by unit tests, and the rendering is checked by the review screenshots.

### 9. Run the validation commands

Run every command in `Validation Commands` below, in order, and fix anything that fails without weakening a rule, a type or a test. After `yarn build`, check that the build output still marks the project route as partial prerender (`◐`) and that `.next/cache/fetch-cache` has no Supabase entry.

## Testing Strategy

### Unit Tests

All in `src/lib/history-bookmark.test.ts` (vitest node pool, the project's only test layer):

- Direction in the codec and the mismatch error in both directions; legacy and unknown direction rejected.
- `readHistoryBookmark` with `after` / `before` params, mismatches and both present.
- The `before` query selection (`historyKeysetFilter` / `historyNewerFilter` strings and `historyOrderAscending`) and the reversal (`historyItems`).
- The derived page number and page count for first, middle and last pages, after a completion, misaligned and empty.
- `historyHref` for both directions with and without `q`.
- The pure right-then-left round trip.

The data boundary (`getCompletedRuns`) and `HistoryLinks` have no test layer here (no Supabase mock, no component tests); they stay thin over the tested helpers and are covered by the build and the review screenshots.

### Test Coverage

- `src/lib/history-bookmark.test.ts`, "decodeHistoryBookmark rejects a cursor of the other direction" (unit): catches a `before` cursor being accepted as `after` or vice versa; fails today because the payload has no direction.
- `src/lib/history-bookmark.test.ts`, "historyKeysetFilter selects rows strictly newer for a before bookmark" and "historyItems reverses a before page" (unit): catches a mirror query that walks the wrong way or shows the rows oldest first; fails today because neither exists.
- `src/lib/history-bookmark.test.ts`, "toHistoryPage derives page and pageCount for first, middle and last pages" (unit): catches an off-by-one in `N of M` and arrows that disagree with the indicator; fails today because `toHistoryPage` has no counts.
- `src/lib/history-bookmark.test.ts`, "historyHref writes ?before= for a before cursor" (unit): catches a left arrow that silently pages older; fails today.

### Edge Cases

- Exactly one page of runs: no arrows, no nav at all.
- Empty history (or an empty search): no nav; the list shows its empty message.
- Total a multiple of the page size: last page full, no right arrow.
- A run completes while on a middle page: the rows under the `after` bookmark are unchanged, `newer` and `total` grow by one, the indicator moves (e.g. `2 of 3` becomes `3 of 3`), and the left arrow becomes a `?before=` link that ends in page one.
- `pageCount` never smaller than `page` (misaligned pages after completions or deletions).
- `?before` and `?after` both present, a mismatched direction, a legacy direction-less cursor, another project's cursor, garbage: all page one, never an error.
- A `before` bookmark whose newer rows were all deleted: empty list, `1 of M`, right arrow back to older rows.
- An `after` bookmark past the end: empty list with a left arrow back.
- Search text with `q`: both arrows keep `q`, the counts use the same search filter.

## Acceptance Criteria

- Page one shows no left arrow and `1 of M`; stepping right then left returns the same rows; the indicator is computed in the cached `getHistory` entry and changes only when the data does (the page number is never in the URL).
- The right arrow is `?after=<bookmark of the last shown row>`, the left arrow is `?before=<bookmark of the first shown row>` (or page one when the newer rows fit one page), both plain `next/link` anchors from a server component, each hidden when there is nothing in that direction; both keep `q`.
- A cursor carries its direction; a cursor in the wrong parameter, or any invalid or foreign value, renders page one.
- With a run completing while on a middle page, the rows under the bookmark stay the same and the indicator updates on the next render (the counts drop with `history:<slug>`; no new tag).
- New unit tests cover the `before` selection and reversal, the page number for first, middle and last pages, and the direction check, and fail without the change.
- README's Newer/Older sentence is replaced and AGENTS describes the new rules.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test` and `yarn build` pass, and the project route is still a partial prerender.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint` - ESLint, including the unsafe-regex rule the bookmark module is written around.
- `yarn typecheck` - `next typegen` then `tsc --noEmit`: the new `HistoryPage` and `HistoryLinks` props across boundary, page and component.
- `yarn knip` - No orphaned export (`nextCursor` helpers removed, new helpers all used).
- `yarn format:check` - Prettier on every touched file.
- `yarn test` - The new and updated bookmark cases, plus every existing suite.
- `yarn build` - Reads the database at build time and prerenders every project; must succeed with the project route still marked partial prerender.

## Notes

- No new dependency. Counts use supabase-js `select(..., { count: "exact", head: true })`, already available in `@supabase/supabase-js` 2.x.
- The left arrow linking to page one whenever the newer rows fit on one page is a deliberate refinement of the issue's `?before=` rule: a `before` read at the head would return a short page, while page one is full, canonical and shares page one's cache entry. With unchanged data it yields exactly the `?before=` rows, so "right then left returns the same rows" holds.
- The issue's formula uses `ceil`, so after a completion a page's number can exceed the plain position (`newer = 4` gives page 3): it counts the steps back to page one along the left arrow. `pageCount` is clamped to at least `page` so the label never reads `3 of 2`.
- Old `?after=` URLs (direction-less payloads) render page one after deployment; the cursor is opaque and short-lived, so no migration.
- The `(project_id, status, updated_at)` index is the toolkit's (`adw-toolkit/supabase`); nothing here changes the schema. With a search the counts also apply the `ilike` filter, which is fine at this table's size.
- Out of scope: jumping to an arbitrary page number, search changes beyond passing `q` through.
