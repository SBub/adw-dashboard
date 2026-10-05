# Chore: Keep project pages in the client router cache so navigating back does not refetch history

## Metadata

issue_number: `29`
adw_id: `1d6a606b`
issue_json: `{"number":29,"title":"Keep project pages in the client router cache so navigating back does not refetch history","body":"## Problem\n\nSwitching between projects in the sidebar shows the History loading fallback every time, even when returning to a project visited seconds ago. The history section is a request-time hole (it awaits `searchParams`), and Next's client router cache keeps dynamic content for 0 seconds by default, so every navigation refetches the page's dynamic part from the server and the freshly mounted Suspense boundary shows its fallback while the response streams. The server answers from its cache; the round trip and the flash are the cost.\n\n## What to build\n\n- In `next.config.ts`, set `experimental: { staleTimes: { dynamic: 300 } }`(seconds). Leave`static` at its default. Keep the existing options (`cacheComponents`, `turbopack.root`, `agentRules`).\n- Comment above it: why (dynamic holes are not prefetched; the router cache's dynamic lifetime defaults to 0), and why correctness holds: the completion handler calls `router.refresh()`when the completed run's project page is on screen, and a project not on screen is refetched on its next visit once the window has passed; History also drops server-side via the tag, so a refetch always sees fresh data.\n- README: a short paragraph in the Runs or Routing section describing the client cache window and the two paths that keep it correct. AGENTS.md: one rule that`staleTimes.dynamic`must stay below the server-side history`cacheLife.stale`'s intent (never longer than a few minutes) and that any new live section must either be patched client-side or refreshed by the completion handler.\n\n## Acceptance\n\n- Visiting project A, then B, then A within five minutes renders A's History immediately with no loading fallback and no request for the page's dynamic part (verify with the browser's network panel: no RSC request for the page on the second visit).\n- A completion for the project on screen still updates History through the existing refresh.\n- After five minutes, a navigation to a project refetches its dynamic part.\n- Build still shows the project pages as partial prerenders; `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` pass.\n\n## Out of scope\n\nPrefetching the history hole, moving history into the query cache, or testing shell revalidation on Vercel."}`

## Chore Description

The two History islands of a project page (`HistoryPagination` and `CompletedRuns` in
`src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`) are request-time holes: each awaits
`searchParams` before `getHistory`. Holes are not part of the prefetched shell, and the installed
Next's client router cache keeps dynamic content for `staleTimes.dynamic`, which defaults to 0
seconds (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md`;
`02-guides/prefetching.md`, "Client Cache TTL: Off, unless enabled"). So every sidebar navigation,
including a return to a project seen seconds ago, makes an RSC round trip for the page's dynamic part,
and the remounted `SectionBoundary` shows "Loading history..." while it streams.

The chore sets `experimental.staleTimes.dynamic` to `300` seconds in `next.config.ts`, so a project
page visited within the last five minutes is served from the client router cache with no request and
no fallback. `static` stays at its default (5 minutes). This is a config change plus documentation;
no source file under `src/` changes.

Why correctness holds within the window (to be stated in the config comment and the README):

1. Project on screen: a completion runs `revalidateHistory(slug)` then `router.refresh()` when
   `isProjectPath(window.location.pathname, slug)` is true (`src/app/providers.tsx`). The refresh
   re-renders the current route from the server, bypassing the router cache entry for it.
2. Project not on screen: its cached entry is used for at most five minutes; once the window has
   passed, the next visit refetches the dynamic part. The server side drops `history:<slug>` through
   the action (or the webhook route handler), so whatever refetch happens sees fresh rows.
3. Additionally, per `03-api-reference/04-functions/cacheLife.md` (line ~258), calling `updateTag`
   from a Server Action clears the entire client cache immediately, bypassing the stale time. The
   `revalidateHistory` action does exactly that, so in a tab with the Realtime channel open any
   completion (for any project) also empties the router cache. The residual staleness is bounded to
   the five-minute window and only for a completion this tab did not receive an event for (channel
   down at that moment; the `SUBSCRIBED` catch-up refreshes Active only, never History). That is
   accepted and is why the window stays short.

Active is unaffected: it lives in the React Query cache, patched by Realtime and the catch-up, and
the sidebar the same; the router cache only holds the RSC payload.

## Relevant Files

Use these files to resolve the chore:

- `next.config.ts`: the one code change. Add `experimental.staleTimes.dynamic` with a comment, keep
  `reactStrictMode`, `cacheComponents`, `turbopack.root`, `agentRules` as they are.
- `README.md`: add a short paragraph on the client router cache window under "Runs: active and
  history" (a new `####` subsection after "What is prerendered and what is not", before the caveats
  continue, or directly after "The move: how a completion crosses from Active to History"), and keep
  the existing sentence in "What is prerendered and what is not" that says the islands "stream in on
  each request" accurate by qualifying it (each request to the server; a client navigation within
  the window is answered from the router cache without a request).
- `AGENTS.md`: one new rule under "Runs: active and history".
- `src/app/providers.tsx`: read only. The `onHistoryChange` callback (`revalidateHistory` then
  guarded `router.refresh()`) is the on-screen correctness path the comment refers to. Not changed.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: read only. `getHistory`'s
  `cacheLife({ stale: 300, revalidate: 86400, expire: 2592000 })` is the server-side `stale` the new
  rule is measured against. Not changed.
- `src/app/actions/revalidate-history.ts`: read only. Its `updateTag` calls are what clear the client
  cache from a Server Action.
- `.adw/project.md`: read only. No script, port, env file or documentation location changes, so the
  profile needs no update.
- Installed Next docs (read before editing, the framework moves faster than training data):
  - `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md`
  - `node_modules/next/dist/docs/01-app/02-guides/prefetching.md` (table "Client Cache TTL")
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheLife.md` ("stale",
    "Good to know" on `staleTimes` vs `cacheLife`, and the Server Action client cache clearing note)
  - `node_modules/next/dist/server/config-shared.d.ts` (line ~396: `experimental.staleTimes` is
    typed `{ dynamic?: number; static?: number }`, so the config typechecks as written).

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the installed Next docs

- Read the four doc locations listed above. Confirm `staleTimes` is still under `experimental` in the
  installed version and that `dynamic` defaults to 0 and `static` to 5 minutes. Note that updating
  `static` would also change the `default` cacheLife profile's `stale`; that is a further reason to
  leave it alone.

### 2. Set `staleTimes.dynamic` in `next.config.ts`

- Add, after `agentRules: false` (or after `turbopack`), keeping all existing keys and comments:

  ```ts
  // Keep a visited project page's dynamic part in the client router cache
  // for five minutes. The History islands are request-time holes (they await
  // searchParams), holes are not prefetched, and the router cache keeps
  // dynamic content for 0 seconds by default, so without this every sidebar
  // navigation, even back to a project seen seconds ago, is a server round
  // trip and a "Loading history..." flash. `static` stays at its default.
  //
  // Correctness within the window: when a run completes on the project on
  // screen, Providers calls revalidateHistory and then router.refresh(), which
  // re-renders that route from the server; the action's updateTag also clears
  // the whole client cache. A project not on screen is refetched on its next
  // visit once the window has passed, and its history tag has been dropped on
  // the server (action or webhook), so that refetch sees fresh rows. Keep this
  // at or under getHistory's cacheLife stale (300 s); see AGENTS.md.
  experimental: {
    staleTimes: {
      dynamic: 300,
    },
  },
  ```

- Wording may be tightened, but no em-dashes, and the comment must cover both the why and both
  correctness paths.

### 3. Update `README.md`

- In "Runs: active and history", add a `#### Client router cache` subsection (place it after "What
  is prerendered and what is not" and its caveats, before "### QueryBoundary", or after "The move")
  with one short paragraph: `staleTimes.dynamic` is 300 seconds in `next.config.ts`; a project page
  visited within that window is rendered from the client router cache on a sidebar navigation, with
  no RSC request and no History fallback; after it, the next navigation refetches the dynamic part.
  Then the paths that keep it correct: the completion handler's `router.refresh()` for the project on
  screen (plus the Server Action's `updateTag`, which clears the whole client cache per the installed
  `cacheLife.md`), and, for a project not on screen, the refetch after the window against a server
  cache already dropped by tag. State the residual case honestly: a completion this tab received no
  event for can leave a revisited page's History up to five minutes old.
- In "What is prerendered and what is not", qualify "both stream in on each request" so it reads as
  each server request, with a pointer to the new subsection for client navigations.
- Keep the README free of em-dashes.

### 4. Update `AGENTS.md`

- Add one bullet under "Runs: active and history", for example:

  ```md
  - `experimental.staleTimes.dynamic` in `next.config.ts` (300 seconds) keeps a
    visited project page's dynamic part in the client router cache. Keep it at
    or under `getHistory`'s `cacheLife` `stale` (300) and never longer than a
    few minutes: within the window a page not on screen is not refetched, so
    the window is the bound on how stale a revisited History can be. Leave
    `staleTimes.static` at its default (it also moves the `default` cacheLife
    profile). Any new live section on a cached page must either be patched
    client-side (React Query and a Realtime reducer, like Active) or be
    re-rendered by the completion handler's `router.refresh()`; never rely on
    a navigation to refetch it.
  ```

- No em-dashes.

### 5. Format

- Run `yarn format` so Prettier settles `next.config.ts`, `README.md`, `AGENTS.md` and this spec.

### 6. Manual acceptance (production server, review phase)

- `yarn build`, then `yarn start` on `$PORT` from `.ports.env` (never 3000 unless `PORT` is absent;
  do not start `yarn dev`, which does not exercise the production router cache). With the browser's
  network panel (Playwright `browser_network_requests`):
  - Open project A, navigate to project B in the sidebar, back to A within five minutes: no RSC
    request (`?_rsc=` / `RSC: 1`) for A's page on the second visit, and History is rendered with no
    "Loading history..." fallback.
  - A completion on the project on screen still updates History through the refresh (only if a run
    happens to complete; never write to the hosted Supabase project to provoke one).
  - After five minutes, navigating to a project makes the RSC request again.
- Build output still lists the project pages as Partial Prerender.

### 7. Run the Validation Commands

- Run every command below; all must pass.

## Test Coverage

No test needed: the change is one framework config value plus documentation. The project's only test
layer is `src/**/*.test.ts` (pure reducers and helpers under vitest); router cache behaviour lives in
Next's client runtime and cannot be exercised there, there is no component or E2E layer (profile:
E2E `none`), and a test that asserted the literal in `next.config.ts` would only restate the config.
The behaviour is verified by the manual network-panel check in step 6 and by `yarn build` (the config
is validated against Next's schema, and the route table must still show Partial Prerender). No user
visible markup changes, so no new review screenshots beyond the profile's standard two paths.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint`: ESLint over the changed config file.
- `yarn typecheck`: confirms `experimental.staleTimes` matches `NextConfig` in the installed Next.
- `yarn knip`: no dead code or unused exports introduced.
- `yarn format:check`: Prettier clean for `next.config.ts`, `README.md`, `AGENTS.md` and the spec.
- `yarn test`: the existing unit suite still passes (no behaviour under `src/` changed).
- `yarn build`: Next accepts the config, reads the database, and the route table still shows the
  project pages as Partial Prerender.

## Notes

- `staleTimes.dynamic` is the client router cache only. It does not change any `"use cache"` scope,
  tag, or the server-side `cacheLife` of `getHistory`; the request-time hole, the `SectionBoundary`
  around each island and the `searchParams` read all stay exactly as they are.
- Do not add `prefetch={true}` to sidebar links or move History into the query cache: both are out
  of scope for issue #29.
- `router.refresh()` and Server Action revalidation both bypass the stale time; that is why the
  existing "revalidate THEN refresh" order needs no change.
- Commit with a bare Conventional Commit type, no scope and no trailers, e.g.
  `chore: keep project pages in the client router cache for five minutes`.
