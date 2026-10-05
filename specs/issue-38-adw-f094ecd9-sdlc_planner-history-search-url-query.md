# Feature: Search completed history by issue title, number, branch or run id

## Metadata

issue_number: `38`
adw_id: `f094ecd9`
issue_json: `{"number":38,"title":"Search completed history by issue title, number, branch or run id","body":"A search box next to the History title, as a client component, that filters the server-rendered History through the URL. HistorySearch (client): local text state, debounced 300 ms (a small setTimeout hook, no library), then router.replace with ?q=<text> on the current page inside useTransition, dropping any ?after= bookmark. A Clear button appears when the box has text. isPending dims the list while the new hole streams. The box receives initial from the server. The history hole reads q from searchParams next to after and calls getHistory(slug, bookmark, q). getCompletedRuns(slug, bookmark, q): or(issue_title.ilike.*q*, branch_name.ilike.*q*, adw_id.ilike.*q*) and, when q is an integer, also issue_number.eq.q. Trim and cap q at 60 characters; escape % and _. Older links carry q and after. Tests: the query normaliser and the bookmark helper unchanged. README: a sentence in the Runs section. Out of scope: searching Active runs, client-side filtering, highlighting matches."}`

## Feature Description

A search box in the History heading row of a project page. Typing filters the project's completed runs by issue title, branch name, run id (`adw_id`) or, when the text is an integer, issue number. The filter lives in the URL (`?q=forest`), so the server-rendered History hole stays the single source of the list: the box only rewrites the URL (debounced, inside a transition), the islands read `q` next to `after`, and `getHistory(slug, bookmark, q)` reads the matching page from its own cache entry under the same `history:<slug>` tag. A shared or reloaded URL with `?q=` opens with the text filled in and the filtered list rendered. Pagination inside a search keeps the filter.

## User Story

As a developer watching a project's ADW runs
I want to type part of an issue title, an issue number, a branch name or a run id into a box next to History
So that I can find a finished run without paging back through the history three rows at a time

## Problem Statement

History is paged three completed runs at a time with only Newer/Older links. Finding a specific past run (by issue, branch or `adw_id`) means paging through every newer run first. There is no way to link someone to "the runs for issue 38".

## Solution Statement

Drive the filter from the URL so nothing about History's caching or rendering model changes:

1. A pure module `src/lib/history-search.ts` normalises the raw `?q` (trim, cap at 60 characters, strip PostgREST's `*` wildcard alias, empty means no filter) and builds the PostgREST `or` filter (three `ilike` clauses with `%`, `_` and `\` escaped for `LIKE`, values double-quoted and `"`/`\` escaped for PostgREST, plus `issue_number.eq.<n>` when the text is an integer). Unit-tested.
2. `getCompletedRuns(slug, bookmark, q)` adds that filter as a second `.or(...)` (PostgREST ANDs repeated filter parameters, so it composes with the keyset `.or`). `getHistory(slug, bookmark, q)` passes it through; `q` is a plain string or `null`, so it is part of the cache key. Same single tag, so a completion still drops every search page.
3. `historyHref(slug, cursor, q?)` carries `q` on Newer and Older links. The existing two-argument behaviour and its tests are unchanged.
4. A new request-time island `HistorySearchBox` in the page awaits `searchParams`, normalises `q` and renders the client `HistorySearch` with `initial`. The box keeps local state, debounces 300 ms with a small `setTimeout` hook, and calls `router.replace(historyHref(slug, null, normalised), { scroll: false })` inside `startTransition` (dropping `?after`). A Clear button appears when the box has text.
5. The transition is shared through a tiny client provider, `HistoryTransition`, wrapping the static History `<section>`; `HistoryResults` (same file) reads `isPending` and dims the list. A search-param-only navigation does not recreate the page segment (`router.bfcacheId` docs in the installed `use-router.md`), and a transition never re-hides already revealed Suspense content, so the list dims instead of flashing "Loading history...".

## Relevant Files

Use these files to implement the feature:

- `README.md` - "Runs: active and history" (item 5 and the paging paragraph) gets the URL-driven search sentence and the `getHistory(slug, bookmark, q)` signature; "What is prerendered and what is not" names the islands that read `searchParams`.
- `AGENTS.md` - Rules that name `getCompletedRuns(slug, bookmark)`, `getHistory`'s arguments, "the only readers of `searchParams`" and the list of `"use client"` components; update each to the new state in the same change.
- `.adw/project.md` - Read only: no script, port, env file or docs location changes, so the profile stays untouched.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx` - `getHistory`, `readHistory`, `HistoryPagination`, `CompletedRuns` and the History `<section>`; gets `q`, the new `HistorySearchBox` island and the transition wrappers.
- `src/data/index.ts` - `getCompletedRuns` gains the `q` argument and the search `.or`.
- `src/lib/history-bookmark.ts` - `historyHref` gains an optional `q`.
- `src/lib/history-bookmark.test.ts` - Existing cases stay as they are; new `historyHref` cases for `q`.
- `src/components/RunHistoryList.tsx` - Empty state text must say "no match" during a search; takes it as a prop.
- `src/components/HistoryLinks.tsx` - Unchanged (hrefs are passed in), read for context.
- `src/components/SectionBoundary.tsx` - The boundary around the new island; unchanged.
- `src/lib/slug.ts`, `src/lib/history-tags.ts` - Context: tag spelling and slug shape; unchanged.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` - `router.replace` options (`scroll: false`) and the note that search-param-only navigations keep the segment.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md` - Why the box does not use `useSearchParams` (it would make a client bailout hole); `initial` comes from the server island instead.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheLife.md` - Re-read before touching `getHistory`; its `cacheLife` stays as is.
- `node_modules/@supabase/postgrest-js/dist/index.mjs` - `or()` appends a second `or=` parameter rather than replacing the first.

### New Files

- `src/lib/history-search.ts` - Pure: `HISTORY_QUERY_MAX_LENGTH` (60), `readHistoryQuery(raw)` and `historySearchFilter(q)`.
- `src/lib/history-search.test.ts` - Unit tests for both.
- `src/hooks/use-debounced-callback.ts` - The small `setTimeout` debounce hook (`schedule`/`cancel`, timer cleared on unmount).
- `src/components/HistoryTransition.tsx` - `"use client"`: `HistoryTransition` (provider holding one `useTransition`), `useHistoryTransition()` and `HistoryResults` (dims its children while pending).
- `src/components/HistorySearch.tsx` - `"use client"`: the box, the Clear button, and `HistorySearchFallback` (the same box, disabled, for the island's Suspense fallback).

## Implementation Plan

### Phase 1: Foundation

Pure helpers with tests: `src/lib/history-search.ts` (normaliser and PostgREST filter) and the `q` argument of `historyHref`. Nothing else depends on React or Next, so these are written and tested first.

### Phase 2: Core Implementation

Thread `q` through the data boundary (`getCompletedRuns`) and the page's cache scope (`getHistory`) and islands (`readHistory`, `HistoryPagination`, `CompletedRuns`). Build the client pieces: the debounce hook, the shared transition, the search box.

### Phase 3: Integration

Place the box in the History heading row as its own request-time island under a `SectionBoundary`, wrap the section in `HistoryTransition` and the list boundary in `HistoryResults`, give the empty state a search-aware message, then update README and AGENTS and verify in the browser that the page is still a partial prerender and no fallback flashes.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read before coding

- Read `AGENTS.md` in full, README "Runs: active and history", "What is prerendered and what is not" and "Client router cache", and the installed `use-router.md` and `use-search-params.md`.

### 2. Create `src/lib/history-search.ts`

- Header comment in the style of `history-bookmark.ts`: pure, imports nothing from `@/data` or `next/*`, reads no clock.
- `export const HISTORY_QUERY_MAX_LENGTH = 60;`
- `export function readHistoryQuery(raw: string | string[] | undefined): string | null`:
  - Not a string (absent or repeated `?q`) is `null`, like `readHistoryBookmark`.
  - Remove every `*` (PostgREST rewrites `*` to `%` inside a like pattern and it cannot be escaped, so it is never a literal), trim, cap with `slice(0, HISTORY_QUERY_MAX_LENGTH)`, trim again (a cut can leave a trailing space). Empty is `null`.
  - The result is the canonical text: it is the cache-key argument, the URL value the box writes and the box's `initial`.
- `export function historySearchFilter(q: string): string` (q already normalised):
  - LIKE escape: `\` to `\\`, then `%` to `\%`, `_` to `\_` (Postgres `ILIKE` uses `\` as its default escape).
  - PostgREST quoting: in the escaped text, `\` to `\\` and `"` to `\"`; wrap as `"*<text>*"`. Quoting makes `,`, `(`, `)`, `.` and `:` safe inside the `or` grammar.
  - Clauses: `issue_title.ilike.<v>`, `branch_name.ilike.<v>`, `adw_id.ilike.<v>`, joined with `,`.
  - When `q` matches `/^\d{1,9}$/` (an integer that fits `int4`; a static literal regexp, as the lint rules require), append `issue_number.eq.<Number(q)>`. Nine digits keeps a pasted long number from making PostgREST answer a 400 on an out-of-range integer.
- Keep exports to these three; every one is imported by the page, the data layer or the box, so knip stays clean.

### 3. Create `src/lib/history-search.test.ts`

- `readHistoryQuery`: `undefined`, `["a","b"]`, `""`, `"   "` and `"***"` give `null`; `"  forest  "` gives `"forest"`; a 61+ character input is cut to 60; an input whose 60th character is followed by text and whose cut ends in a space comes back trimmed; `"fo*rest"` gives `"forest"`.
- `historySearchFilter`: `"forest"` gives exactly `issue_title.ilike."*forest*",branch_name.ilike."*forest*",adw_id.ilike."*forest*"`; `"50%_off"` escapes to `50\\%\\_off` inside the quotes (one LIKE backslash, doubled for PostgREST); `"a\"b"` and `"a\\b"` are escaped; `"feat/x,(y)"` stays inside the quotes; `"38"` appends `,issue_number.eq.38`; `"0038"` appends `issue_number.eq.38`; `"38a"`, `"-3"`, `"3.5"` and `"1234567890"` add no `issue_number` clause.

### 4. Extend `historyHref` in `src/lib/history-bookmark.ts`

- Signature `historyHref(slug: string, cursor: string | null, q: string | null = null)`. Build the query with `q` first (`q=${encodeURIComponent(q)}`) then `after=${cursor}`, joined with `&`; no `?` when both are null. Update its doc comment.
- In `src/lib/history-bookmark.test.ts` leave the existing two `historyHref` cases untouched and add: `q` only (`?q=forest`), `q` and cursor (`?q=forest&after=<cursor>`), a `q` with a space, `&`, `#` and `/` is percent-encoded, `q` `null` with a cursor equals the two-argument call.

### 5. Thread `q` through `getCompletedRuns` in `src/data/index.ts`

- Signature `getCompletedRuns(slug: string, bookmark: HistoryBookmark | null, q: string | null)`; import `historySearchFilter` from `@/lib/history-search`.
- After the bookmark `.or`, `if (q) query = query.or(historySearchFilter(q));`. Two `or=` parameters are ANDed by PostgREST (`or()` appends, see postgrest-js). Order, limit and the cast are unchanged; `toHistoryPage` is unchanged, so a search page's cursor is the same keyset bookmark.
- Update the doc comment: `q` is already normalised by the caller outside the cache scope; it narrows the page, never the order.

### 6. Thread `q` through the page's History

In `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`:

- `getHistory(slug, bookmark, q: string | null)` returns `getCompletedRuns(slug, bookmark, q)`. Same `cacheTag(historyTag(slug))`, same `cacheLife`. Add to its comment: each query is its own entry (arguments are the key), all under the one tag, never a per-query tag.
- `readHistory`: `const { after, q: rawQuery } = await searchParams;`, `const q = readHistoryQuery(rawQuery);`, `getHistory(slug, bookmark, q)`, return `{ bookmark, q, ...page }`. Both islands still call it with the same arguments, so Next still joins them into one read.
- `HistoryPagination`: `newerHref={bookmark ? historyHref(slug, null, q) : null}`, `olderHref={nextCursor ? historyHref(slug, nextCursor, q) : null}`.
- `CompletedRuns`: pass `emptyMessage={q ? \`No completed runs match "${q}".\` : "No completed runs yet."}`to`RunHistoryList`.

### 7. Make the empty message a prop of `RunHistoryList`

- Add `emptyMessage: string` to `RunHistoryListProps` and render it in the existing dashed panel. The component still computes nothing; the page decides the text.

### 8. Create `src/hooks/use-debounced-callback.ts`

- `"use client"` is not needed in a hook module; it is imported only by `HistorySearch`.
- `useDebouncedCallback<A extends unknown[]>(callback: (...args: A) => void, delayMs: number)` returning `{ schedule: (...args: A) => void; cancel: () => void }`, both stable (`useCallback` or `useMemo`). A `useRef` holds the timer id; `schedule` clears it and sets a new `setTimeout`; `cancel` clears it. The latest `callback` is kept in a ref written in a `useEffect` (no ref write during render). One `useEffect` with an empty dependency list clears the timer on unmount: that is the only effect, and it synchronises with an external system (the timer), per the no-unnecessary-effects rule. No clock read (`setTimeout` is not one).

### 9. Create `src/components/HistoryTransition.tsx`

- `"use client"`. A context holding `{ isPending, startTransition }` from one `useTransition()` in `HistoryTransition({ children })`, which renders the provider around `children` and nothing else, so it can wrap the static History section without reading request data (it stays in the static shell).
- `useHistoryTransition()` returns the context and throws a plain `Error` when used outside the provider.
- `HistoryResults({ children })` renders `<div aria-busy={isPending} className={isPending ? "opacity-50 transition-opacity" : "transition-opacity"}>{children}</div>`.

### 10. Create `src/components/HistorySearch.tsx`

- `"use client"`. Props `{ slug: string; initial: string }`.
- `const [text, setText] = useState(initial)`; `const router = useRouter()`; `const { startTransition } = useHistoryTransition()`.
- `navigate(next: string)`: `startTransition(() => router.replace(historyHref(slug, null, readHistoryQuery(next)), { scroll: false }))`. Cursor `null` drops `?after`; a whitespace-only box drops `q`. The URL is built only by `historyHref`, never by hand or from `usePathname`.
- `const { schedule, cancel } = useDebouncedCallback(navigate, 300)`. `onChange`: `setText(e.target.value); schedule(e.target.value)`. No effect watches `text`.
- Clear button (`type="button"`, rendered only when `text !== ""`): `cancel(); setText(""); navigate("");`.
- Markup: `<input type="search" aria-label="Search history" placeholder="Title, #, branch or id" maxLength={HISTORY_QUERY_MAX_LENGTH} ...>` with the WebKit cancel button hidden (`[&::-webkit-search-cancel-button]:appearance-none`) so there is one clear control; neutral Tailwind classes matching `HistoryLinks` (text-sm, neutral borders, dark variants); `w-full sm:w-64`.
- `HistorySearchFallback()` in the same file: the same input, `disabled`, no handlers, so the static shell reserves the box's space and nothing typed before the hole resolves is lost.
- No `useSearchParams`, no `Date`, no fetch.

### 11. Place the box and the transition in the page

- New island beside the others:
  ```tsx
  async function HistorySearchBox({ slug, searchParams }: HistoryIslandProps) {
    const { q } = await searchParams;
    return <HistorySearch slug={slug} initial={readHistoryQuery(q) ?? ""} />;
  }
  ```
  It reads `searchParams` itself (a request-time hole) and calls no cache scope.
- History `<section>` becomes:
  ```tsx
  <HistoryTransition>
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">History</h2>
        <SectionBoundary fallback={<HistorySearchFallback />} detail="Search did not load.">
          <HistorySearchBox slug={slug} searchParams={searchParams} />
        </SectionBoundary>
        <SectionBoundary fallback={null} detail="Pagination did not load.">
          <HistoryPagination ... />
        </SectionBoundary>
      </div>
      <HistoryResults>
        <SectionBoundary fallback={...Loading history...} detail="This project's history did not load.">
          <CompletedRuns ... />
        </SectionBoundary>
      </HistoryResults>
    </section>
  </HistoryTransition>
  ```
  The `<h2>` stays outside every boundary (static shell). The page body still never awaits `searchParams`. Update the long comment above the islands: three islands read `searchParams`; the search island is a hole for `initial`, not for a cache scope.

### 12. Update docs

- README "Runs: active and history": one sentence (plus the signature changes in item 5): History is searchable through the URL; the box next to the title writes `?q=` (debounced 300 ms, `router.replace` inside a transition, dropping `?after`), the islands read it beside `after`, `getHistory(slug, bookmark, q)` filters by issue title, branch or run id (`ilike`) and issue number when the text is an integer, each query is its own cache entry under the one `history:<slug>` tag, and Newer/Older keep `q`. Mention `HistoryTransition`/`HistoryResults` dimming instead of the fallback. In "What is prerendered and what is not", list the search island as a third hole.
- AGENTS.md: `getCompletedRuns(slug, bookmark, q)`; `getHistory`'s arguments include `q`; "`HistoryPagination`, `CompletedRuns` and `HistorySearchBox` are the only readers of `searchParams`"; `?q` is normalised by `readHistoryQuery` in `src/lib/history-search.ts` outside the cache scope, and the filter is built only by `historySearchFilter` (pure, tested in `history-search.test.ts`; every change goes with a test case); never a per-query tag; add `HistorySearch` (local text, router) and `HistoryTransition` (shared `useTransition`) to the `"use client"` list; the box builds its URL only through `historyHref`. No em-dashes.
- `.adw/project.md`: no change (no script, port, env file or docs location moves).

### 13. Browser evidence for the review phase (E2E is `none` in the profile)

No E2E suite and no `e2e/*.md` journey: the behaviour is a debounce, a transition and a server-rendered list, which the review phase's screenshots cover; a journey would add an agent-driven run for what a reviewer can see in two screenshots. The review phase opens, at desktop 1920x1080 and mobile 375x667, full page:

- `/projects/SBub/issebya-homes-ai-system` (or the first project in the sidebar): the History row shows the title, the search box and Newer/Older; with an empty box the full list.
- Type a word from a visible completed run's title (for example "forest" if present): after ~300 ms the list narrows, the URL gains `?q=`, and the list is dimmed (not replaced by "Loading history...") while pending. The Clear button is visible.
- Reload that URL: the box is filled and the filtered list renders.
- If more than three runs match, click Older: the URL carries `q` and `after` and the list stays filtered; Newer returns to the filtered page one.
- Type the issue number of a visible run: it matches. Type text that matches nothing: "No completed runs match ...".
- Click Clear: box empty, URL without `q` and `after`, full list back.
- At 375x667 the heading row wraps with the box on its own line, nothing overflows.

### 14. Validate

- Run every command in `Validation Commands`. After `yarn build`, confirm in the build output that `/projects/[owner]/[repo]` is still a partial prerender (the `◐` marker), and that `.next/cache/fetch-cache` has no Supabase entry.

## Testing Strategy

### Unit Tests

- `src/lib/history-search.test.ts`: normaliser (absent, repeated, empty, whitespace, `*` stripping, trim, cap at 60 with re-trim) and filter (exact string for a plain word, LIKE escaping of `%`, `_`, `\`, PostgREST quoting of `"`, `\`, reserved characters, numeric detection with and without leading zeros, rejection of signs, decimals and over-long numbers).
- `src/lib/history-bookmark.test.ts`: existing cases unchanged; new `historyHref` cases with `q`.

### Test Coverage

- `src/lib/history-search.test.ts` (vitest, `src/**/*.test.ts`): catches a search text that breaks the PostgREST `or` grammar or turns `%`/`_`/`*` into wildcards, an integer test that would send an out-of-range `issue_number`, and an un-normalised `q` that splits the cache key; fails without the feature because the module does not exist.
- `src/lib/history-bookmark.test.ts`, new `historyHref` cases (vitest): catches pagination links that drop the filter or a `q` that is not percent-encoded; fails without the feature because `historyHref` ignores a third argument.
- The client box, the debounce and the dimming have no test layer here (no component tests, E2E `none`); their evidence is the review phase's screenshots listed in task 13.

### Edge Cases

- `?q=` empty, whitespace-only or only `*`: same as no search, same cache entry as today.
- `?q=a&q=b` (repeated): no search, like a repeated `?after`.
- Over 60 characters in the URL: cut on the server; the input's `maxLength` stops typing past 60.
- Text with `%`, `_`, `\`, `"`, `,`, `(`, `)`: matched literally, no PostgREST 400.
- `38`, `0038`: match `issue_number = 38` as well as any title, branch or id containing the text; `1234567890`: text match only.
- A search with `?after` from a different search, or from no search: still a valid keyset (strictly older), never an error; the box always drops `after` on change.
- A completion while a search is on screen: the action drops `history:<slug>`, every query's entry expires with it, the refresh re-renders the filtered list.
- Clear while a debounce is pending: the pending replace is cancelled, so the URL does not flip back to the old text.
- Unmount with a pending timer (navigating to another project): timer cleared.
- Back/forward to a URL with a different `q`: the list follows the URL; the box keeps its local text (search-param navigations keep the segment). Acceptable for this issue, noted below.

## Acceptance Criteria

- Typing "forest" (or any word in a completed run's title) narrows History after the 300 ms debounce, with the list dimmed while pending and no "Loading history..." flash.
- Issue number, branch name and `adw_id` substrings also match; `%` and `_` match literally.
- Clear empties the box, removes `q` and `after` from the URL and restores the full list.
- Reloading `?q=forest` renders the filtered list and the box holds "forest".
- Older and Newer inside a search carry `q`, and the next page is still filtered.
- The History `<h2>` is in the static shell; the page body and `generateMetadata` never await `searchParams`; `/projects/[owner]/[repo]` is still a partial prerender in `yarn build`.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` all pass.
- README and AGENTS describe the search; no em-dashes anywhere.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint` - ESLint, including the regexp safety and React hooks rules the new hook and helper must satisfy.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`: the new `getCompletedRuns`/`getHistory` signatures and props compile (do not stage `next-env.d.ts`).
- `yarn knip` - No unused export or file from the new modules.
- `yarn format:check` - Prettier on every touched file.
- `yarn test` - Vitest: the new `history-search` tests and the extended `history-bookmark` tests, plus every existing suite.
- `yarn build` - Production build reading the database: proves the page still prerenders as a partial prerender with three History holes and that the new filter does not break the build-time reads.

## Notes

- No new dependency: the debounce is a ten-line hook, as the issue asks.
- `useSearchParams` is deliberately not used: under `cacheComponents` it would make the box a client-rendered bailout; the server island hands `initial` instead, and `historyHref` builds the URL from the slug.
- Two `.or()` calls rely on PostgREST ANDing repeated filter parameters (postgrest-js appends `or=` each time). If a search on page two ever returns rows outside the filter, compose both into one `and(or(...),or(...))` expression instead; check this on the dev server during review by paging inside a search.
- Follow-up, out of scope: syncing the box text on back/forward navigation to a different `q` (would need a key or a URL subscription without remounting on every keystroke), searching Active runs, highlighting matches, a database index for `ilike` (history per project is small today).
- `staleTimes.dynamic` (300 s) also caches each visited `?q=` URL in the router cache; a completion's `updateTag` clears the client cache, as for pages today.
