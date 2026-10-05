# Chore: Keep the History title in the static shell; pagination and list as two request-time islands

## Metadata

issue_number: `20`
adw_id: `3887ac30`
issue_json: `{"number":20,"title":"Keep the History title in the static shell; pagination and list as two request-time islands"}`

## Chore Description

After #17, `HistorySection` in `src/app/(dashboard)/projects/[...slug]/page.tsx` awaits `connection()`,
reads `?after` from `searchParams`, calls the cached `getHistory(slug, bookmark)` and renders
`RunHistory` (title row with the `<h2>History</h2>`, the Newer/Older links, the list) inside one
`SectionBoundary`. The whole section, static title included, is therefore the request-time hole: the
shell carries a fallback that repeats the title, and the real title only arrives with the stream.

Under `cacheComponents` a component becomes request-time at its first request-time read
(`searchParams`, `cookies()`, `headers()`, `connection()`), and Next cuts the hole at the nearest
Suspense boundary above that read. So the boundary can move below the title:

- The page renders the History row statically: a flex container with `<h2>History</h2>` on the left
  and, on the right, a `SectionBoundary` (fallback `null`, detail "Pagination did not load.") around a
  new async server component `HistoryPagination`. Below the row, a second `SectionBoundary` (fallback
  "Loading history...", detail "This project's history did not load.") around a new async server
  component `CompletedRuns`.
- Both islands receive `slug` and the **un-awaited** `searchParams` promise, await it themselves,
  decode the bookmark with `readHistoryBookmark` (outside the cache scope) and call
  `getHistory(slug, bookmark)`. The page never awaits `searchParams`.
- Two calls do not mean two reads: `getHistory` is a `"use cache"` function keyed by its arguments,
  and the installed Next dedupes identical invocations within one request
  (`node_modules/next/dist/server/use-cache/use-cache-wrapper.js`, "Intra-request deduplication",
  debug line `joining intra-request invocation`). The bookmark is a plain object with the same values
  in both islands, so its serialized key is identical.
- `await connection()` is redundant once `searchParams` is awaited inside each island (the
  `searchParams` read is now what makes the hole); it is removed together with the `connection`
  import, and every comment and doc that explained it is rewritten.
- `src/components/RunHistory.tsx` is replaced by two server components: `HistoryLinks` (the
  `<nav aria-label="History pages">` with Newer and Older, rendering nothing when both hrefs are
  `null`) and `RunHistoryList` (the `<ul>` of `RunRow variant="history"` or the empty state). The
  title moves to the page. Older/Newer semantics, classes and the empty state stay exactly as in #17.
- README and AGENTS document the new layout and the rules (a static heading sits outside the
  boundary of the hole it labels; `searchParams` is passed down un-awaited and read only by the
  islands).

Out of scope: the bookmark format, `HISTORY_PAGE_SIZE`, the cache tag, `cacheLife`, the action, the
route handler, Realtime.

## Relevant Files

Use these files to resolve the chore:

- `src/app/(dashboard)/projects/[...slug]/page.tsx` - holds `getHistory`, `HistorySection` (to be
  replaced by `HistoryPagination` and `CompletedRuns`), the `connection` import and the History
  `SectionBoundary` with its title-bearing fallback; all comments mentioning `connection()` and
  `HistorySection` live here.
- `src/components/RunHistory.tsx` - the component being split into `HistoryLinks` and
  `RunHistoryList`; deleted afterwards (knip would flag it as unused otherwise).
- `src/components/SectionBoundary.tsx` - the boundary both islands use; read only, unchanged (it
  already accepts any `ReactNode` fallback, `null` included).
- `src/components/RunRow.tsx` - rendered by `RunHistoryList` with `variant="history"`; unchanged.
- `src/lib/history-bookmark.ts` - `readHistoryBookmark`, `historyHref`, `HistoryBookmark`,
  `HistoryPage`; logic unchanged, but the doc comment on `readHistoryBookmark` names
  `HistorySection` and must name the islands instead.
- `src/lib/history-bookmark.test.ts` - existing tests that must still pass unchanged.
- `README.md` - "Runs: active and history" item 5 (lines ~266-312), "The move" (line ~336), "What is
  prerendered and what is not" (lines ~483-511), "SectionBoundary" (lines ~609-626).
- `AGENTS.md` - Architecture bullets (components take typed props, not-found decision, two
  boundaries, server components by default) and the "Runs: active and history" bullets about
  `connection()`, `searchParams` and `HistorySection`.
- `knip.json` - confirms `src/**` is scanned, so the deleted component must have no leftovers and the
  new components must each be imported.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`,
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` (the
  `searchParams` prop) and `.../04-functions/cacheLife.md` - re-read before editing the comments; the
  claim "`searchParams` is a request-time read that stops prerendering at the nearest Suspense" must
  match the installed docs.
- `node_modules/next/dist/server/use-cache/use-cache-wrapper.js` - the intra-request dedupe the
  "two islands, one read" claim relies on.

### New Files

- `src/components/HistoryLinks.tsx` - server component, props `{ newerHref: string | null;
olderHref: string | null }`, renders the Newer/Older `nav` or `null`.
- `src/components/RunHistoryList.tsx` - server component, props `{ runs: Run[]; projectSlug:
string }`, renders the list or the empty state.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read before editing

- Read `connection.md`, the `searchParams` section of `page.md` and the "Prerendering behavior"
  section of `cacheLife.md` in `node_modules/next/dist/docs/`. Confirm that awaiting `searchParams`
  inside a component under a Suspense boundary makes that subtree a request-time hole under
  `cacheComponents` (the same effect `connection()` had).

### 2. Create `src/components/HistoryLinks.tsx`

- Move the `PAGE_LINK` constant and the `nav` block from `RunHistory.tsx` verbatim: `import Link from
"next/link"`, `<nav aria-label="History pages" className="flex items-center gap-4">`, `Newer` when
  `newerHref !== null`, `Older` when `olderHref !== null`, same class names.
- Return `null` when both hrefs are `null` (same condition as today's
  `(newerHref !== null || olderHref !== null)`).
- Keep `next/link` (AGENTS: "plain `next/link` hrefs"); it renders a plain `<a href="...?after=...">`,
  which is what the issue's "plain anchors" means. Do not decode a bookmark or build a URL here.
- Doc comment in the existing style: a server component with no state; the page's
  `HistoryPagination` builds both hrefs with `historyHref` and passes them in; `null` hides a link.

### 3. Create `src/components/RunHistoryList.tsx`

- Move the empty state (`No completed runs yet.`, same dashed-border classes) and the
  `<ul className="space-y-3">` of `RunRow key={run.adw_id} run={run} projectSlug={projectSlug}
variant="history"` verbatim.
- Doc comment: one page of completed runs as stored, most recently updated first; history is
  completed-only (failed runs are live, under Active); rendered by the page's `CompletedRuns` from a
  `"use cache"` scope, not in the query cache, untouched by Realtime.

### 4. Delete `src/components/RunHistory.tsx`

- `git rm` it; nothing else imports it once the page is updated.

### 5. Rewrite the History part of `page.tsx`

- Remove `import { connection } from "next/server"` and `import { RunHistory } ...`; import
  `HistoryLinks` and `RunHistoryList`.
- Add one small non-cached async helper in the page file shared by both islands, e.g.
  `async function readHistory(slug: string, searchParams: Promise<SearchParams>)` that does
  `const { after } = await searchParams; const bookmark = readHistoryBookmark(after, slug);
const page = await getHistory(slug, bookmark); return { bookmark, ...page };`. It is not
  `"use cache"` (the bookmark decode must stay outside the cache scope) and it is not a boundary
  function; it only keeps the two islands from repeating three lines.
- `async function HistoryPagination({ slug, searchParams })`: calls `readHistory`, returns
  `<HistoryLinks newerHref={bookmark ? historyHref(slug, null) : null}
olderHref={nextCursor ? historyHref(slug, nextCursor) : null} />`.
- `async function CompletedRuns({ slug, searchParams })`: calls `readHistory`, returns
  `<RunHistoryList runs={items} projectSlug={slug} />`.
- Replace the big comment above `HistorySection` with one above the islands that explains: the
  `searchParams` read is the first request-time read, so each island is a request-time hole cut at
  its own `SectionBoundary`'s Suspense, while the heading above them stays in the static shell; why a
  hole is needed at all (a scope prerendered into the shell is read from the Resume Data Cache frozen
  at build time and `updateTag` never reaches it; a hole is resolved from the live handler and keeps
  the long `cacheLife`), keeping the existing paragraph about the Active scope; why there is no
  `connection()` (redundant after the `searchParams` read; the alternative `cacheLife` with `expire`
  under 5 minutes is still rejected); why two islands are one read (`getHistory` is keyed by its
  arguments and Next joins an identical invocation within the request, debug line `joining
intra-request invocation`); bookmark decoded outside the cache scope, anything invalid is page one.
- Update the `getHistory` doc comment: "re-renders HistorySection" becomes "re-renders the two
  History islands".
- Update the comment above `ProjectPage`: `searchParams` is handed to `HistoryPagination` and
  `CompletedRuns` unawaited; only those request-time holes read it.
- Replace the History `SectionBoundary` in the page's JSX with:
  ```tsx
  <section>
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold">History</h2>
      <SectionBoundary fallback={null} detail="Pagination did not load.">
        <HistoryPagination slug={slug} searchParams={searchParams} />
      </SectionBoundary>
    </div>
    <SectionBoundary
      fallback={
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading history...</p>
      }
      detail="This project's history did not load."
    >
      <CompletedRuns slug={slug} searchParams={searchParams} />
    </SectionBoundary>
  </section>
  ```
  The `<section>` and the row `div` keep the exact classes of #17, so the rendered layout is
  unchanged. Rewrite the JSX comment above it: server-rendered, not hydrated, so `SectionBoundary`
  not `QueryBoundary`; the heading is static and in the shell; each island streams behind its own
  Suspense; a failure in either shows its panel in its slot and leaves Active and the other island
  on screen.
- The not-found decision stays before any of this (`if (data === null) notFound();`), so neither
  island renders for an unknown slug. `getHistory` stays out of the page body and `generateMetadata`.

### 6. Update the comment in `src/lib/history-bookmark.ts`

- In the `readHistoryBookmark` doc comment, replace "(the page's HistorySection does)" with "(the
  page's History islands do)". No logic change.

### 7. Update `README.md`

- "Runs: active and history", item 5: describe the History row (static `<h2>` plus the
  `HistoryPagination` island on the right, `SectionBoundary` with fallback `null`, detail "Pagination
  did not load.") and the `CompletedRuns` island below it (fallback "Loading history...", detail
  "This project's history did not load."); each awaits the page's `searchParams`, decodes `?after`
  with `readHistoryBookmark` and calls `getHistory`; `RunHistory` is replaced by `HistoryLinks` and
  `RunHistoryList` (`src/components/`), both stateless server components. Replace "the `connection()`
  call makes the section a request-time hole" with the `searchParams` read. Replace "decoded in
  `HistorySection`" with "decoded in each island".
- "The move" (around line 336): "`HistorySection` reads" becomes "the History islands read".
- "What is prerendered and what is not": the static shell now holds the sidebar, Active and the
  History heading; the two History islands are request-time holes because they await `searchParams`
  (no `connection()` any more); the shell carries `null` for the pagination slot and "Loading
  history..." for the list. Add a short paragraph "why two islands do not mean two reads" (cache key
  from the arguments, intra-request join, `NEXT_PRIVATE_DEBUG_CACHE=1` shows one `generated entry`
  or one hit for the history scope per request plus a `joining intra-request invocation` line).
  Rewrite the "documented alternative" sentence: the `searchParams` read is used instead of a short
  `cacheLife` because it keeps the long lifetime.
- "SectionBoundary": the project page wraps `HistoryPagination` and `CompletedRuns` each in one; the
  hole semantics come from the `searchParams` read, not `connection()`.
- No em-dashes anywhere.

### 8. Update `AGENTS.md`

- Architecture, "Components take typed props only": `RunRow` and `RunHistoryList` take `Run` rows as
  stored; the page's `HistoryPagination` and `CompletedRuns` are the async components that await
  data, and they live in the page file.
- Not-found bullet: "the History islands render only after that decision".
- "Two boundaries" bullet: the page's `HistoryPagination` and `CompletedRuns` are each inside a
  `SectionBoundary`.
- "Server components by default": `HistoryLinks` and `RunHistoryList` are server components with no
  state; `HistoryLinks`' `Newer`/`Older` are `next/link` hrefs `HistoryPagination` builds with
  `historyHref`.
- "Runs: active and history": "rendered by the async `HistorySection`" becomes the two islands (and
  fix the missing spaces in that line, "`HistorySection`under its own`SectionBoundary`", while
  touching it). Rewrite the `connection()` bullet: a `"use cache"` scope that must reflect on-demand
  revalidation on a prerendered route is called only after a request-time read (here the islands'
  `await searchParams`, the first statement of each), under a `SectionBoundary`; do not add
  `connection()` back as a redundant second marker; `getHistory` stays out of the page body and
  `generateMetadata`; never a short `cacheLife`.
- Add the new rule: a static heading sits outside the boundary of the hole it labels (the `History`
  `<h2>` is in the page, above both islands, never inside a `SectionBoundary` or its fallback).
- Rewrite the `searchParams` bullet: only `HistoryPagination` and `CompletedRuns` read it, each
  awaits it itself; the page passes the promise down un-awaited and never awaits it, nor do
  `getRunsState` or `generateMetadata`, or the whole page turns request-time.
- Add: two islands calling `getHistory` with the same arguments are one cache read per request
  (intra-request join); do not add a React `cache()` wrapper or pass the page result between them.
- No change to `.adw/project.md`: no script, port, env file or doc location changes.

### 9. Verify the served HTML and the cache behaviour

- `yarn build`; the route table must still show the project pages as Partial Prerender.
- Source `.ports.env` (never edit it), then
  `NEXT_PRIVATE_DEBUG_CACHE=1 PORT=$PORT yarn start` in the background (this run's process only).
- Request a project page (the first slug the sidebar on `/` lists if
  `/projects/SBub/issebya-homes-ai-system` is 404) and inspect the document: the
  `<h2 ...>History</h2>` appears before and outside any `<template id="B:...">` / `<!--$?-->`
  placeholder, and there are two streamed History segments (one with the Newer/Older nav or empty,
  one with the run rows, each an `adw_id` in a `<code>`).
- In the server log for that one GET: at most one `generated entry` (on a miss) or one hit for the
  `getHistory` scope, plus a `joining intra-request invocation` line for the second island; never two
  generations. Repeat with a `?after=<cursor>` taken from the Older link: Newer and Older behave as
  in #17, three rows per page.
- If two generations appear, stop and report it rather than adding a workaround; the plan's premise
  (intra-request dedupe) would be wrong for the installed Next.
- Stop the server this step started.

### 10. Run the Validation Commands

## Test Coverage

No test needed: this is a structural move of server-rendered markup with no new logic. The pure
pieces (`readHistoryBookmark`, `historyHref`, `toHistoryPage`, the page size) are unchanged and stay
covered by `src/lib/history-bookmark.test.ts`. What changes (where the Suspense boundaries sit, the
static heading, the per-request cache join) is only observable in rendered HTML and the server's
cache log, and the profile's one test layer is `src/**/*.test.ts` with no component test layer and
E2E `none`. The evidence is step 9 (served HTML and `NEXT_PRIVATE_DEBUG_CACHE=1`) plus the review
phase's screenshots of `/projects/SBub/issebya-homes-ai-system` (or the first listed project) at
1920x1080 and 375x667, page one and one `?after=` page, where the History title, the Older/Newer
links and the list must look exactly as in #17.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint` - ESLint over the new components and the rewritten page.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`: new props, the removed `connection` import,
  the page's `searchParams` type flowing into both islands.
- `yarn knip` - no leftover export from the deleted `RunHistory.tsx`, both new components used.
- `yarn format:check` - Prettier on the new and edited files, README and AGENTS included.
- `yarn test` - the bookmark, tags, route and reducer tests still pass unchanged.
- `yarn build` - the project pages still build as Partial Prerender with the heading in the shell and
  no clock read or request-time read leaking into the shell.

## Notes

- Keep `next/link` for Newer/Older: AGENTS mandates it and it renders plain `<a>` elements with the
  `?after=` href, which satisfies the issue's "plain anchors".
- The pagination island's fallback is `null`, so on a cold stream the row shows only the title until
  the links arrive; that is intended (no layout shift in the list below, the links are on the right).
- Its error panel renders inside the header row; that is accepted by the issue (detail "Pagination
  did not load.") and a failure there would almost always coincide with the list's own panel since
  both read the same scope.
- Do not stage `next-env.d.ts`, `.ports.env` or any `.env*`. Commit messages: Conventional Commits,
  no trailers (per the profile).
- No em-dashes in any edited file.
