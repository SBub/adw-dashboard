# Feature: Paginate a project's completed history with a keyset bookmark, three per page

## Metadata

issue_number: `17`
adw_id: `d2e29be0`
issue_json: `{"number":17,"title":"Paginate a project's completed history with a keyset bookmark, three per page", ...}` (full body as given to /feature: bookmark helper, keyset read, cache lifetime, `?after=` URL, header layout, revalidation unchanged)

## Feature Description

History on `/projects/[...slug]` is a project's completed runs, server-rendered by `HistorySection`
from the cached `getHistory(slug)` (tag `history:<slug>`), resolved at request time through
`await connection()`, and refreshed by the `revalidateHistory` server action or the database webhook.
Today it renders every completed run, the one read in the app that grows without bound.

This feature pages it, three runs per page, with keyset (bookmark) pagination rather than offsets:
the URL carries an opaque `?after=<bookmark>` naming the last row the previous page showed
(`{ slug, updated_at, adw_id }`, base64url JSON), and the next page is the rows strictly older than
that tuple in the order `updated_at desc, adw_id desc`. The History header becomes a flex row with
`Newer` and `Older` links on the right. Caching, tags and revalidation keep their current model:
every page of a project shares the one `history:<slug>` tag, so a completion drops all of them at
once, and `getHistory` gains an explicit `cacheLife`.

## User Story

As a developer watching a project's ADW runs on the dashboard
I want the History section to show the three most recent completed runs with links to older and newer pages
So that a project with a long history stays fast and readable, and paging stays stable while new runs complete

## Problem Statement

`getCompletedRuns` returns every completed run of a project and `RunHistory` renders all of them.
The list grows with every run, so the cached History scope, the streamed HTML and the page length
all grow without bound. An offset-based page would shift whenever a run completes (page two would
repeat the last row of page one), so pagination has to be stable under inserts at the head.

## Solution Statement

- A pure module `src/lib/history-bookmark.ts` owns the page size, the bookmark codec (encode and a
  throwing decode following the shop's cursor contract: `UnknownCursorError` for garbage, a scope
  mismatch error for a bookmark handed out for another project), a lenient reader that turns any
  bad `?after` into `null` (page one), the PostgREST keyset filter string, the page splitter
  (`HISTORY_PAGE_SIZE + 1` rows in, `{ items, nextCursor }` out), and the href builder.
- `getCompletedRuns(slug, bookmark)` in `src/data/index.ts` applies the filter, orders
  `updated_at desc, adw_id desc`, limits to `HISTORY_PAGE_SIZE + 1` and hands the rows to the
  splitter. It returns `{ items: Run[], nextCursor: string | null }`.
- `getHistory(slug, bookmark)` in the page keeps `"use cache"` and `cacheTag(historyTag(slug))` for
  every page (no per-page tag) and adds `cacheLife({ stale: 300, revalidate: 86400, expire: 2592000 })`.
  The bookmark object is a serialisable argument, so it is part of the cache key: one entry per
  page, all under the same tag.
- `HistorySection` keeps `await connection()` as its first statement, then awaits the page's
  `searchParams` promise (passed down unawaited from `ProjectPage`), decodes `after` with the lenient
  reader OUTSIDE the cache scope (an error thrown inside `"use cache"` loses its class), and calls
  `getHistory`. Only this hole reads search params, so the shell stays prerendered.
- `RunHistory` takes `runs`, `projectSlug`, `newerHref` and `olderHref` (each `string | null`,
  built in `HistorySection` with the pure href helper) and renders the header as one flex row:
  `History` left, `Newer` / `Older` links right, each only when its href is not `null`. Links are
  anchors with no client state (`next/link`'s `Link`, which renders a plain `<a>`, as `ProjectNav`
  does; see Notes). The empty state is unchanged.
- Revalidation code is untouched; README and AGENTS.md document the per-project tag, the bookmark
  and the explicit lifetime.

## Relevant Files

Use these files to implement the feature:

- `README.md` - "Runs: active and history" (step 5 describes `getHistory`/`HistorySection`), "What
  is prerendered and what is not" and the caveat paragraph that quotes "15 minutes, the default
  `cacheLife`": all must describe the bookmark, the shared tag and the explicit lifetime.
- `AGENTS.md` - the rule book. Its Architecture section names `getCompletedRuns`'s purpose and
  says "pagination of history goes into `getCompletedRuns`"; its "Runs: active and history" section
  pins `getHistory`, `HistorySection` and `connection()`. New invariants (bookmark decoded outside
  the cache scope, one tag per project for every page, explicit `cacheLife`, only the history hole
  reads `searchParams`) go there as rules.
- `.adw/project.md` - ADW profile. No script, port, env file or docs location changes, so it stays
  as is; read only.
- `src/data/index.ts` - `getCompletedRuns` changes signature and query; `RUN_COLUMNS` and the `Run[]`
  cast stay the one shape assertion.
- `src/app/(dashboard)/projects/[...slug]/page.tsx` - `ProjectPageProps` gains `searchParams`;
  `getHistory` gains the bookmark argument and `cacheLife`; `HistorySection` reads `?after`.
- `src/components/RunHistory.tsx` - header row with the pagination links; new props.
- `src/components/ProjectNav.tsx` - reference for how the app links to a project page (`Link`,
  `/projects/${slug}`).
- `src/lib/history-tags.ts` - tag spellings; unchanged, still the only place `history:` is spelled.
- `src/lib/slug.ts` / `src/lib/slug.test.ts` - `isProjectSlug` and the test style (describe/it, fixed inputs).
- `src/types/adw.ts` - `Run` (the `updated_at` and `adw_id` fields the bookmark carries). No new type here.
- `src/app/actions/revalidate-history.ts`, `src/app/api/revalidate/route.ts` - revalidation; unchanged,
  read to confirm the per-project tag already covers every page.
- `knip.json`, `vitest.config.ts`, `package.json` - dead-code scope (every new export must be used),
  unit test glob (`src/**/*.test.ts`), scripts.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheLife.md` - inline profile
  object, "Prerendering behavior" (stale 300 and expire 30 days keep the scope out of no thresholds
  that would change hole semantics; `connection()` still makes it the hole).
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` - `searchParams`
  is a promise and a request-time API; where it is awaited decides the shell.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`,
  `cacheTag.md`, `updateTag.md` - re-read before touching the scope.
- `/Users/sveta/Dev/issebya/issebya-homes-ai-system/apps/website/src/lib/shop/pagination.ts` and its
  `__tests__/pagination.unit.test.ts` - the monorepo's cursor contract to follow: base64url via
  `btoa`/`atob` + `TextEncoder`/`TextDecoder`, `UnknownCursorError`, mismatch error per scope field,
  decode before the cached call, unique-id tie-breaker, `nextCursor` null on an exact multiple.
  (Outside this repository; reference only, nothing is imported from it.)

### New Files

- `src/lib/history-bookmark.ts` - page size, bookmark codec, lenient reader, keyset filter, page splitter, href builder. Pure.
- `src/lib/history-bookmark.test.ts` - unit tests for all of the above with fixed inputs.

## Implementation Plan

### Phase 1: Foundation

Write the pure module and its tests first: everything that decides what a page is (bookmark shape,
validation, the strict "older than" tuple, the `N + 1` split, the URL) lives in `src/lib/` where it
is testable without Supabase or Next. No new dependency: the dashboard has no `zod`, so shape
validation is a few hand-written checks with static regexps (the lint config forbids non-literal
regexps).

### Phase 2: Core Implementation

Change `getCompletedRuns` to the keyset read, then the page's `getHistory` (argument, `cacheLife`)
and `HistorySection` (`searchParams` after `connection()`), then `RunHistory`'s header.

### Phase 3: Integration

No change to revalidation, Realtime, query keys or Active. Update README and AGENTS.md, run every
check, confirm with `yarn build` that project pages are still Partial Prerender and that
`.next/cache/fetch-cache` holds no Supabase entry, and hand the review phase the paths to screenshot.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read before coding

- Read `AGENTS.md` in full, README "Runs: active and history" through "What is prerendered and what is not".
- Read the installed `cacheLife.md`, `connection.md`, `page.md` (`searchParams`), `updateTag.md`.
- Read the shop's `pagination.ts` (reference above) for the codec and error classes.

### 2. Create `src/lib/history-bookmark.ts`

Header comment in the style of `slug.ts`/`history-tags.ts`: what the module is, that it is pure and
imports nothing from `@/data` or `next/*`. Contents:

- `export const HISTORY_PAGE_SIZE = 3;` The one page size; the data layer fetches `HISTORY_PAGE_SIZE + 1`.
- `export interface HistoryBookmark { slug: string; updated_at: string; adw_id: string }` - the last
  row a page showed, scoped to its project.
- `export interface HistoryPage { items: Run[]; nextCursor: string | null }` (`import type { Run } from "@/types/adw"`).
- `export class UnknownCursorError extends Error` (name `"UnknownCursorError"`, message `"Unknown cursor"`)
  and `export class CursorScopeMismatchError extends Error` (a well-formed bookmark handed out for
  another project), mirroring the shop's classes.
- base64url helpers `toBase64Url` / `fromBase64Url` copied in shape from the shop (`btoa`/`atob`,
  `TextEncoder`/`TextDecoder`, no `Buffer`), not exported.
- Validation (not exported), static regexps only:
  - `slug`: `isProjectSlug` from `@/lib/slug` (no second slug pattern).
  - `updated_at`: a string matching an ISO 8601 timestamp with a zone,
    e.g. `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/`, and
    `!Number.isNaN(Date.parse(value))`. The string is kept VERBATIM (Postgres `timestamptz` has
    microseconds; a round trip through `Date` would truncate to milliseconds and the `eq` branch of
    the tie-break would never match). `Date.parse` on the input is not a clock read.
  - `adw_id`: a short identifier, `/^[A-Za-z0-9_-]{1,64}$/` (adw ids are 8 hex chars today; the
    looser pattern still excludes every character PostgREST's `or` grammar reserves).
  - The parsed value must be a plain object with exactly those three string fields; extra keys are ignored.
- `export function encodeHistoryBookmark(b: HistoryBookmark): string` -
  `toBase64Url(JSON.stringify({ slug, updated_at, adw_id }))` (fixed key order).
- `export function decodeHistoryBookmark(cursor: string, slug: string): HistoryBookmark` - throws
  `UnknownCursorError` when base64url/JSON/shape fails, `CursorScopeMismatchError` when `slug`
  differs; returns a fresh object.
- `export function readHistoryBookmark(after: string | string[] | undefined, slug: string): HistoryBookmark | null` -
  the lenient entry point the page uses: `null` for `undefined`, for an array (a repeated `?after`),
  for an empty string, and when `decodeHistoryBookmark` throws either error. Doc comment says it
  must run outside `"use cache"` (the shop's reason: an error thrown inside a cache scope loses its class).
- `export function historyKeysetFilter(b: HistoryBookmark): string` - the PostgREST `or` filter for
  "strictly older than the bookmark":
  `` `updated_at.lt."${b.updated_at}",and(updated_at.eq."${b.updated_at}",adw_id.lt."${b.adw_id}")` ``.
  Values double-quoted because the timestamp contains `:` and `.`; validation already guarantees no
  `"`, `,`, `(` or `)` can appear.
- `export function toHistoryPage(rows: readonly Run[], slug: string): HistoryPage` - `rows` is the
  query result of at most `HISTORY_PAGE_SIZE + 1`, already ordered. `items = rows.slice(0, HISTORY_PAGE_SIZE)`;
  `nextCursor` is `encodeHistoryBookmark({ slug, updated_at, adw_id })` of the last item when
  `rows.length > HISTORY_PAGE_SIZE`, else `null`. Never mutates its input.
- `export function historyHref(slug: string, cursor: string | null): string` - `/projects/${slug}`
  with `?after=${cursor}` when `cursor` is not `null` (base64url needs no encoding). The Newer link
  is `historyHref(slug, null)`.
- Every export must be used outside its file or by its test (knip). If knip reports the error
  classes as unused exports because only the test imports them, confirm the test file counts as an
  entry (vitest plugin); otherwise keep them exported for the test, which is the shop's pattern.

### 3. Create `src/lib/history-bookmark.test.ts`

Fixed inputs only (a `run(adw_id, updated_at)` factory building a full `Run` with constant other
fields, slug `"SBub/adw-toolkit"`). Cases:

- Round trip: `decodeHistoryBookmark(encodeHistoryBookmark(b), b.slug)` equals `b`, including an
  `updated_at` with microseconds and `+00:00` (proves no `Date` round trip).
- Encoded cursor is URL-safe: matches `/^[A-Za-z0-9_-]+$/`.
- Scope mismatch: a bookmark encoded for `"SBub/other"` decoded for `"SBub/adw-toolkit"` throws
  `CursorScopeMismatchError`; `readHistoryBookmark` returns `null` for it.
- Malformed input, each throwing `UnknownCursorError` from decode and `null` from read: `"!!!"`,
  base64url of `"not json"`, base64url of `"[]"`, `"null"`, a missing field, a non-string field,
  an invalid timestamp (`"yesterday"`, `"2026-13-45T99:00:00Z"`), an `adw_id` with a comma or quote,
  an invalid slug inside.
- `readHistoryBookmark(undefined, s)`, `(""; s)` and `(["a", "b"], s)` are `null`.
- `toHistoryPage` with exactly three rows: three items, `nextCursor` `null`.
- `toHistoryPage` with four rows: first three items, `nextCursor` decodes to the THIRD row's
  `{ slug, updated_at, adw_id }`.
- `toHistoryPage` with zero rows: `{ items: [], nextCursor: null }`; input array not mutated.
- `historyKeysetFilter` pins the exact string for a fixed bookmark (the strict `lt` plus the
  `eq`/`adw_id.lt` tie-break).
- `historyHref`: page one has no query; with a cursor ends in `?after=<cursor>`.
- `HISTORY_PAGE_SIZE` is 3.

### 4. Change `getCompletedRuns` in `src/data/index.ts`

- Signature `getCompletedRuns(slug: string, bookmark: HistoryBookmark | null): Promise<HistoryPage>`.
- Unknown slug: `{ items: [], nextCursor: null }`.
- Query: `.eq("project_id", project.id).eq("status", "completed")`, then
  `if (bookmark) query = query.or(historyKeysetFilter(bookmark))`, then
  `.order("updated_at", { ascending: false }).order("adw_id", { ascending: false }).limit(HISTORY_PAGE_SIZE + 1)`.
  `adw_id` is unique within a project (primary key `(project_id, adw_id)`), so the order is total.
- Cast `(data ?? []) as Run[]` stays the one shape assertion, then `return toHistoryPage(rows, slug)`.
- Rewrite the doc comment: keyset paging, the bookmark is decoded by the caller, the "Pagination goes
  here later" paragraph is replaced by what it does now. Still reads no clock.
- Keep the file's header comment accurate (History bullet mentions pages under one tag).

### 5. Change the project page `src/app/(dashboard)/projects/[...slug]/page.tsx`

- `ProjectPageProps` gains `searchParams: Promise<{ [key: string]: string | string[] | undefined }>`.
- `getHistory(slug: string, bookmark: HistoryBookmark | null): Promise<HistoryPage>`:
  `"use cache"; cacheTag(historyTag(slug)); cacheLife({ stale: 300, revalidate: 86400, expire: 2592000 });`
  then `return getCompletedRuns(slug, bookmark);`. Import `cacheLife` from `next/cache`. Update its
  comment: one tag for every page on purpose (a completion shifts every page's content, so it must
  drop all of them), the bookmark argument is part of the cache key, the lifetime is explicit.
- `HistorySection({ slug, searchParams })`: `await connection();` stays FIRST; then
  `const { after } = await searchParams;`, `const bookmark = readHistoryBookmark(after, slug);`,
  `const { items, nextCursor } = await getHistory(slug, bookmark);`, and render
  `<RunHistory runs={items} projectSlug={slug} newerHref={bookmark ? historyHref(slug, null) : null} olderHref={nextCursor ? historyHref(slug, nextCursor) : null} />`.
  Comment: decoded here, outside the cache scope; an invalid or foreign `?after` is page one.
- `ProjectPage({ params, searchParams })` passes the `searchParams` promise to `HistorySection`
  WITHOUT awaiting it. The page body, `getRunsState` and `generateMetadata` never touch it.
- The `SectionBoundary` fallback keeps its "History" heading; optionally give its `h2` the same
  wrapper as `RunHistory`'s header so the swap does not shift layout (cosmetic, not required).

### 6. Change `src/components/RunHistory.tsx`

- Props: `runs: Run[]`, `projectSlug: string`, `newerHref: string | null`, `olderHref: string | null`.
- Header: `<div className="mb-3 flex items-center justify-between gap-4">` with `<h2 className="text-lg font-semibold">History</h2>`
  left and a `<nav aria-label="History pages">` right holding `Newer` (when `newerHref`) and `Older`
  (when `olderHref`) as `Link` (from `next/link`) with small neutral text styling matching the
  section (e.g. `text-sm text-neutral-600 hover:underline dark:text-neutral-400`). Render the
  `nav` only when at least one link exists.
- Empty state markup unchanged. Doc comment updated (one page of completed runs, links given as props).
- No `"use client"`, no computation: hrefs come in as props.

### 7. Documentation

- README "Runs: active and history" step 5: `getHistory(slug, bookmark)`, `HistorySection` awaits
  `searchParams` after `connection()`, three per page, `?after=` opaque base64url bookmark of the last
  row shown `{ slug, updated_at, adw_id }`, order `updated_at desc, adw_id desc`, strictly-older
  keyset so a run completing never shifts page two, invalid or foreign bookmark is page one, the
  `Newer`/`Older` links. A few sentences: the `history:<slug>` tag is per project on purpose (every
  page under one tag, one `updateTag` drops them all; no per-page tag), and the explicit
  `cacheLife({ stale: 300, revalidate: 86400, expire: 2592000 })`.
- README caveat that says History stays stale "until the cache lifetime (15 minutes, the default
  `cacheLife`)": update to the explicit one (background refresh after one day).
- README "What is prerendered and what is not": only the History hole reads `searchParams`; the
  build still lists project pages as Partial Prerender.
- AGENTS.md: update the `getCompletedRuns` sentences (returns `{ items, nextCursor }`, takes the
  decoded bookmark, keyset not offset) and the `getHistory`/`HistorySection` rules; add rules:
  `?after` is decoded by `readHistoryBookmark` in `HistorySection` outside the cache scope and never
  surfaces an error; only `HistorySection` reads `searchParams`, after `connection()`; every page
  shares `historyTag(slug)`, never a per-page tag; `getHistory` keeps its explicit `cacheLife` (no
  `expire` under 5 minutes); `HISTORY_PAGE_SIZE` is defined only in `src/lib/history-bookmark.ts`,
  and every change to the bookmark or page split goes with a test case.
- No em-dashes anywhere. `.adw/project.md` needs no change (no script, port, env file or doc location moved).

### 8. Browser evidence for the review phase (E2E is `none` in the profile)

No spec is added: the profile has no E2E or component layer. The review phase opens, at desktop
1920x1080 and mobile 375x667, full page, after the indicator shows `live`:

- `/projects/SBub/issebya-homes-ai-system` (or the first sidebar project with four or more
  completed runs; if none has four, note it and use one with the most): History header is one row,
  title left, only `Older` right, exactly three completed rows.
- Follow `Older`: URL has `?after=...`, the next rows (none repeated from page one), `Newer` shown,
  `Older` only if more remain. Follow `Newer`: back to page one without `?after`.
- `/projects/SBub/issebya-homes-ai-system?after=garbage` and `?after=` + a bookmark built for
  another project: both render page one, no error panel. On mobile the header row must not overflow.

### 9. Run the validation commands

Run every command in `Validation Commands`, fix anything that fails without weakening a rule, type
or test. After `yarn build`, check the route table marks `/projects/[...slug]` as Partial Prerender
and that `.next/cache/fetch-cache` holds no Supabase entry.

## Testing Strategy

### Unit Tests

`src/lib/history-bookmark.test.ts` (vitest, the project's one test layer): codec round trip,
URL-safety, scope mismatch, malformed input, the lenient reader, the `N + 1` split at three and
four rows, the empty page, the pinned keyset filter string, the href builder. The Supabase query and
the page wiring have no test layer here; they are covered by `yarn build` (which runs
`getCompletedRuns(slug, null)` for every slug) and the review screenshots.

### Test Coverage

- `src/lib/history-bookmark.test.ts` (unit, vitest): catches a bookmark that does not survive the
  URL (round trip, base64url alphabet), a foreign or malformed `?after` turning into an error page
  instead of page one, an off-by-one in the page split (a cursor to an empty trailing page at exactly
  three, or a bookmark built from the fourth row instead of the third), a tie-break that is not
  strictly older (duplicates across pages when two runs share `updated_at`), and a timestamp
  truncated to milliseconds. None of this exists today, so every case fails without the feature.
- No test for `RunHistory` or the page: the profile has no component or E2E layer; their evidence
  is the build and the review phase's screenshots (task 8).

### Edge Cases

- Exactly three completed runs: no `Older`, no cursor to an empty page.
- Zero completed runs: empty state unchanged, no pagination links.
- Two runs with the same `updated_at` straddling a page boundary: tie-break on `adw_id desc` keeps
  them on separate pages without duplication or skipping.
- `updated_at` with microseconds and `+00:00`: kept verbatim, the `eq` branch matches.
- A run completes while a visitor is on page two: the refresh re-reads page two's scope (tag
  dropped) but the keyset is strictly older than the bookmark, so page two's rows are unchanged;
  page one gains the new run.
- A bookmark whose row was deleted: the tuple still bounds the read; nothing breaks.
- A bookmark beyond the end (stale link): empty state with the `Newer` link.
- `?after` repeated, empty, not base64url, valid base64url but not JSON, JSON of the wrong shape,
  wrong slug, slug with a percent sequence: all page one.
- A filter-injection attempt (`adw_id` containing `,` `)` or `"`): rejected by validation, page one.

## Acceptance Criteria

- With four or more completed runs, page one shows three runs and an `Older` link; following it
  shows the rest; `Newer` returns to page one.
- A run completing while a visitor is on page two does not change what page two shows; page one
  gains the new run after the refresh.
- An invalid or foreign `?after` renders page one, never an error panel or error page.
- `getCompletedRuns(slug, bookmark)` returns `{ items, nextCursor }`, orders `updated_at desc, adw_id desc`,
  fetches `HISTORY_PAGE_SIZE + 1`; `HISTORY_PAGE_SIZE = 3` is exported once.
- `getHistory(slug, bookmark)` keeps `"use cache"` and `cacheTag(historyTag(slug))` for every page
  and has `cacheLife({ stale: 300, revalidate: 86400, expire: 2592000 })`; no per-page tag.
- `HistorySection` keeps `await connection()` first and is the only reader of `searchParams`;
  `yarn build` still lists the project pages as Partial Prerender.
- The History header is one flex row, title left, pagination right, links shown only when they apply;
  `RunHistory` stays a server component without state.
- `revalidateHistory` and `/api/revalidate` are unchanged.
- README's runs section describes the bookmark, the shared tag and the explicit lifetime; AGENTS.md
  carries the new rules.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint` - ESLint, including the security plugin's non-literal-regexp rule on the new validation.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`: the new `searchParams` prop, the
  `getCompletedRuns` signature and `RunHistory`'s props line up (do not stage `next-env.d.ts`).
- `yarn knip` - every new export in `src/lib/history-bookmark.ts` is used; nothing left dead.
- `yarn format:check` - Prettier over the new and changed files.
- `yarn test` - vitest, including `src/lib/history-bookmark.test.ts` and the existing suites.
- `yarn build` - needs `.env.local`; runs `getCompletedRuns(slug, null)` for every slug against the
  hosted database (proves the PostgREST order/limit is valid) and must list `/projects/[...slug]` as
  Partial Prerender.
- `ls .next/cache/fetch-cache 2>/dev/null | wc -l` after the build, and grep any entries for the
  Supabase host - must show no Supabase entry (the `no-store` rule still holds).

## Notes

- No new dependency. The shop uses `zod`; the dashboard does not have it, and three string checks
  do not justify adding it.
- The issue lists `HISTORY_PAGE_SIZE` under the read (`src/data/index.ts`); it is defined in
  `src/lib/history-bookmark.ts` instead so the pure page splitter and its test can use it without
  importing the Supabase boundary, and `src/data/index.ts` imports it from there. One definition,
  exported once.
- Links: the issue asks for plain anchors with no client state. `next/link`'s `Link` renders a
  plain `<a>`, holds no state of ours and is how `ProjectNav` links to project pages; a soft
  navigation also keeps the Realtime socket and query cache alive, where a bare `<a>` would reload
  the app and reconnect. If the reviewer reads "plain anchors" as a bare `<a>`, switching is a
  two-line change in `RunHistory`.
- The keyset predicate runs in SQL through PostgREST's `or`, not in a pure filter over a full
  list as the shop does, because history is unbounded; the pure part (the filter string, the
  split) is what is tested.
- Writing to the hosted database is protected, so the "completion while on page two" acceptance
  is argued from the keyset (strictly older than the bookmark) and the unit tests, and observed in
  review only if a real run completes during it.
- Out of scope: infinite scrolling, page numbers, a total count, client-side caching of history.
- Commit as `feat: ...` with no trailers (profile, Documentation section).
