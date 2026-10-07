# History revalidation and caching

**Specifications:**

- specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md

## Overview

How a completed run crosses from Active to History: the `revalidateHistory` action and `router.refresh()` for a watched completion, the `/api/revalidate` webhook for an unwatched one, and the caches involved (the `"use cache"` scopes, the fetch cache, the prerendered shell and the client router cache).

## How it works

### The move: how a completion crosses from Active to History

When a run completes, three things happen in the browser, in this order:

1. The Realtime listener folds the UPDATE into the Active entry through the
   `applyRunChange` reducer, which **removes** a run whose new status is
   `completed` (and the summaries reducer adds one to the sidebar's
   `completed`; its `running` and `failed` are counted from the Active entry,
   so they drop by themselves). The run is gone from Active, the sidebar and
   `/projects` at once.
2. The listener's `onHistoryChange(slug)` callback (wired in
   `src/app/providers.tsx`) calls the server action
   `revalidateHistory(slug)` in `src/app/actions/revalidate-history.ts`. The
   action validates the slug with `isProjectSlug` (`src/lib/slug.ts`, the
   pattern `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`) and returns early otherwise;
   for a valid slug it calls `updateTag` on each tag of `historyTags(slug)`
   (`src/lib/history-tags.ts`: `history:<slug>` and
   `summary:today`, the same helpers the pages' `cacheTag` calls use), and
   nothing else. The second tag is the summary page's (`/`) today scope (see
   "Summary"); its past days tag is never dropped. There is no Active tag:
   Active is read per request and never cached on the server.
3. Only after the action resolves, and only if the route in the address bar is
   that project's page, `router.refresh()` re-renders the route on the server.
   The history scope is a cache miss, so the History islands read
   `getCompletedRuns` from the database and the new row appears. Step 2 runs
   for every completion whatever is on screen (it drops the server cache for
   that project, so its next render is fresh for whoever opens it); step 3 only
   re-renders the current route, which is useful only when that route is the
   changed project's page. On the overview or another project's page the
   refresh would be a server round trip that changes nothing, so it is skipped.
   The check is `isProjectPath(window.location.pathname, slug)` from
   `src/lib/project-route.ts`, read inside the callback after the action has
   resolved rather than through `usePathname()`, so `Providers` does not
   subscribe to navigation and re-render on every route change. The pathname is
   decoded first: Next decodes every route param, so a percent-encoded character
   in a segment renders the same page while `window.location.pathname` keeps it
   encoded; a malformed sequence answers false instead of throwing.

`updateTag`, not `revalidateTag`. The installed Next docs
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md`
and `revalidateTag.md`) make the distinction: `updateTag` is the Server
Action form for read-your-own-writes, it expires the tag at once and the next
read waits for fresh data; `revalidateTag(tag, "max")` is
stale-while-revalidate, so the refresh that follows would be served the old
History and the new row would show up on a later visit instead. The
one-argument `revalidateTag(tag)` behaves like `updateTag` but is deprecated.
Per `02-guides/server-actions.md` ("Revalidation"), an action that calls
`updateTag` also ships a re-render of the current route in its own response;
the explicit `router.refresh()` afterwards is the guarantee that the order is
revalidate, then render, whatever the action response carried.

### Webhook revalidation: completions nobody is watching

The move above is driven by a browser that received the Realtime event. If no
browser had the channel open when a run completed (a dashboard nobody has on
screen at the time), nothing calls the action, and the server's History for
that project stays as the cache has it until the lifetime ends or until a
completion someone does see. The route handler `src/app/api/revalidate/route.ts`
closes that gap from the database side: the toolkit's database tells the
dashboard about every history change, watched or not, and the handler drops
the same two tags the action drops (`history:<slug>` and `summary:today`).

**The trigger.** The toolkit owns the database, so the trigger lives in the
toolkit repository (`adw-toolkit`, `supabase/migrations/*_history_webhook.sql`,
documented in its `supabase/README.md`). The function
`adw.notify_history_change()` is attached to `adw.runs` by three triggers,
`runs_history_webhook_insert`, `runs_history_webhook_update` and
`runs_history_webhook_delete` (one per event, because Postgres does not let a
multi-event trigger's `WHEN` clause reference `OLD` when `INSERT` is among the
events, `NEW` when `DELETE` is, or `TG_OP` at all). They fire only on a history
change: a row inserted or updated to `completed`, a `completed` row updated to
something else, or a `completed` row deleted. The function reads the dashboard
URL and the secret from two database settings; while either is unset it returns
without doing anything, so the migration is inert on a database whose dashboard
is not deployed yet. Otherwise it enqueues, through `pg_net`, a POST of the
Supabase database-webhook shape `{ type, schema: "adw", table: "runs", record,
old_record }` (`record` is null on DELETE, `old_record` on INSERT) with the
secret in the `x-adw-secret` header. The enqueue is wrapped so that no failure
of it (extension missing, queue full) can fail the toolkit's own write of the
row.

**The handler.** `POST` only; any other method is 405 by Next's routing. In
order:

1. If `ADW_REVALIDATE_SECRET` is unset in the server's environment, every
   request is answered 503 and the fact is logged once per process; nothing is
   ever allowed through by default. Otherwise the `x-adw-secret` header is
   compared with the configured value in constant time
   (`crypto.timingSafeEqual` on equal-length buffers; a different length is a
   mismatch) and anything else is 401.
2. A body that is not JSON is 400. A JSON body that is not an `adw.runs` event
   with a UUID `project_id` in `record` or `old_record` (another table, a
   malformed payload) is answered `200 { "ignored": true }`.
3. The slug is resolved with `getProjectSlug(projectId)` from `src/data`, a
   read of `adw.projects` with the publishable key. RLS shows it only public
   projects, and a private or unknown project has no page whose cache could be
   stale, so a null result is `{ "ignored": true }`, as is a slug that fails
   `isProjectSlug` (no page is served for it). A failed lookup is 502.
4. `revalidateTag(tag, { expire: 0 })` for each tag of `historyTags(slug)`,
   and the response `{ "revalidated": "<slug>" }`.

The handler does nothing else: no write, no other read, no other side effect.
It is reachable by anyone who has the secret, and the worst such a caller can do
is make the next render of one project page read the database once.

**Why `revalidateTag(tag, { expire: 0 })` and not `updateTag`.** The installed
docs are explicit:
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md`
says `updateTag` "can **only** be called from within Server Actions. It cannot
be used in Route Handlers", and points to `revalidateTag` for them.
`revalidateTag.md` ("Revalidation Behavior") lists the second argument's forms:
`"max"` is stale-while-revalidate (the next visitor would be served the old
History once), and `{ expire: 0 }` means "stale content is never served, so the
next request is a blocking revalidate/cache miss", to be used "when the caller
needs the data gone immediately and you cannot use `updateTag`"; its closing
example is exactly a webhook Route Handler calling
`revalidateTag(tag, { expire: 0 })`. The one-argument form behaves the same but
is deprecated. So the handler reaches the same end state as the action. With
`NEXT_PRIVATE_DEBUG_CACHE=1` on `yarn start`, a successful call logs one
`FileSystemCache: revalidateTag` line per tag.

**The secret.** `ADW_REVALIDATE_SECRET` is a server-only variable (no
`NEXT_PUBLIC_` prefix, so Next never inlines it into the browser bundle) that
exists in exactly two places: the dashboard host's environment (locally,
`.env.local`) and the database setting the trigger reads. Generate it once with
`openssl rand -hex 32`. `.env.example` carries a placeholder and a comment, no
real value; no real value is committed anywhere, which is why the migration
reads the URL and the secret from settings instead of containing them.

**Wiring it after deployment.** The migration lands first and is inert. Once
the dashboard is deployed with the variable set, run these two statements
against the toolkit's hosted database (SQL editor, or
`supabase db query --linked`), with the dashboard's public origin and the same
secret:

```sql
alter database postgres set app.settings.dashboard_revalidate_url
  = 'https://<dashboard-host>/api/revalidate';
alter database postgres set app.settings.dashboard_revalidate_secret
  = '<the value of ADW_REVALIDATE_SECRET>';
```

Database-level settings apply to new connections, so the first completion
written over a connection opened before the statements ran still goes out
silently; PostgREST's pool recycles on its own, and restarting the project's API
forces it. From then on every completion revalidates the dashboard whether or
not a browser is open, and the browser-side action and the conditional refresh
keep doing their part for whoever is watching. The toolkit's `supabase/README.md`
has the same statements and a way to test the trigger by hand.

### Two caches, one source

The `"use cache"` scope is the only server cache in front of the database. On
the server, the Supabase client's REST calls go through Next's patched `fetch`,
and per the installed guide (`node_modules/next/dist/docs/01-app/02-guides/
migrating-to-cache-components.md`, "`fetch` cache options") a fetch inside a
`"use cache"` scope is cached automatically: Next stored each Supabase response
in its own data cache (`.next/cache/fetch-cache`, `kind: "FETCH"`) with the
scope's lifetime and no tags. `updateTag("history:<slug>")` expired the scope
and `getHistory` re-executed, but the request inside it was answered from that
untagged entry, so the regenerated History was built from the stale body. For
that reason `getSupabase()` (`src/data/supabase.ts`) gives the server-side
client a fetch that sets `cache: "no-store"` on every request (`fetch.md`,
`options.cache`: fetched from the remote server on every request). Inside a
`"use cache"` scope that is permitted: it stops the inner request from being
stored separately and leaves the scope's own output cached and tagged, so
dropping the tag is the whole story and the next render reads the database.
The browser's fetch is not patched and keeps the default. After a build,
`.next/cache/fetch-cache` holds no Supabase entry.

### What is prerendered and what is not

A pre-rendered project page has two kinds of content. The sidebar's
`Projects` heading and connection pill, the project list's dehydrated state
(the layout's `projects` scope), the project header (`getProject`) and the
queue (`getQueueState`) are in the **static shell**: their `"use cache"`
results are resolved at build time and embedded in the shell as its Resume
Data Cache. So is the History heading, which the page renders outside any
boundary, and on `/projects` the `Active` heading. The Active islands (the
sidebar list, `/projects`' list and the project page's Active section) are
**request-time holes**: they await `getActiveRunsState()`, which awaits
`connection()`, so the shell carries their skeletons and the rows
stream in on every request. The three History
islands (`HistorySearchBox`, `HistoryPagination` and `CompletedRuns`) are
**request-time holes**: each awaits `searchParams` (the latter two before
`getHistory`; the search island calls no cache scope and only needs `?q` for
its initial text), a request-time read that stops prerendering at the
island's own `SectionBoundary`, so the shell carries a disabled box in the
search slot, a pagination skeleton in the pagination slot and a skeleton of
the history rows for the list, and all three stream in on each server request (a client navigation back to a page seen
within the last five minutes makes no request; see "Client router cache"
below). They are the only readers of `searchParams` (for
`?after`, `?before` and `?q`), and there is no `connection()` call (it would be a redundant second
marker), so the shell stays the same for every page of History. The build's
route table shows the project pages as "Partial Prerender" for this reason.

The summary (`/`) is built the same way: its heading, intro and reading note
are the static shell, and the report island awaits `connection()` before it
reads today's UTC date and calls its two `"use cache"` scopes (`getTodayState`,
tag `summary:today`, and `getPastDays`, tag `summary:past`); it reads no
`searchParams`, so `connection()` is its one request-time marker. The report is
a request-time hole and the route is a partial prerender too.

Two islands do not mean two reads. `getHistory` is a `"use cache"` function
keyed by its arguments, the slug, a plain bookmark object and the search text, with the same
values in both islands, and the installed Next joins an identical invocation
within one request instead of running it again
(`node_modules/next/dist/server/use-cache/use-cache-wrapper.js`,
"Intra-request deduplication"). With `NEXT_PRIVATE_DEBUG_CACHE=1`, one GET
shows one `generated entry` (on a miss) or one hit for the history scope.
On a `?after` or `?before` page the second island adds a `joining intra-request
invocation` line; on page one (bookmark `null`) the second call is answered
before that point and logs nothing, still without a second read.

The distinction matters because of how a prerendered route is served. Under
`cacheComponents`, a request for a prerendered page resumes the shell, and a
`"use cache"` scope that was part of the shell is read from the shell's
embedded Resume Data Cache (debug log, `NEXT_PRIVATE_DEBUG_CACHE=1`:
`use-cache: Resume Data Cache entry found`), frozen at build time. The live
cache handler is never consulted for it. `updateTag("history:<slug>")` did
expire the live entry and `getHistory` did re-execute with fresh rows, but
every later request kept resuming the shell and reading the build-time rows;
`revalidatePath` changes nothing about that. A hole is resolved from the
live cache handler on every request, so a tag update reaches it, and the
scope keeps its long explicit lifetime, so `getHistory` still runs only on a miss
(build, then once after each tag update), not per request. The documented
alternative is a `cacheLife` with `expire` under 5 minutes, which also
excludes the scope from prerenders (`node_modules/next/dist/docs/01-app/
03-api-reference/04-functions/cacheLife.md`, "Prerendering behavior"); the
`searchParams` read is used instead because it keeps the long lifetime.

The same limitation is why Active is not a cache scope at all. It used to be
one per slug, in the shell, and a run that started after the build was missing
from a resumed page until a catch-up happened to cover that slug (issue #69).
Read per request after `connection()`, it is never frozen.

How to prove any of this: make a database change **after** the build (a run
completing, or a test row inserted), call the action, and look for the change
in the next response's HTML. A row that already existed at build time proves
nothing, because the shell carries it whether or not the tag worked; the
earlier fix in this file was verified that way and looked correct until a
post-build row showed it was not. With the debug log on, a fresh
`use-cache: ... generated entry` line for the `getHistory` scope after the
action, and none between two plain GETs, is the mechanical half of the proof.

On that refresh the Active islands re-read the entry and their
`HydrationBoundary` receives a dehydrated state again. React Query's `hydrate()` (`@tanstack/query-core`, `hydration.js`)
overwrites an existing entry only when the incoming `state.dataUpdatedAt` is
strictly newer than the entry's (the `hasNewerSyncData` branch applies only to
a dehydrated pending promise, which the awaited `prefetch` never produces).
Two cases, both without a visible flicker:

- The Active state is read on that request, after the completion event: it is
  newer than the browser's `setQueryData`, so it **does** overwrite, with rows
  read after the completion, which agree with what the reducer produced. (If
  the server clock lags the browser's, the browser's write wins instead; the
  content is the same.)
- Any cached scope (the layout's `projects` state, the queue) carries its
  fill-time stamp, which is older than every browser write since the
  catch-up, so it is skipped and the live entry stays. The same holds for an
  event the browser applied to Active before a later, older hydration (a run
  inserted while the page loaded, #69): the live entry is newer and is kept.

This rule is pinned in `src/data/hydration.test.ts` against the installed
version. The one edge: an event that lands between the server's database read
and the hydration is overwritten by rows that predate it; the next event for
that row corrects it, as with the catch-up.

Two caveats of the design:

- The server action is a public endpoint: anyone who can reach the site can
  call it with any string. That is why it validates the slug strictly and does
  nothing but drop two tags; the worst a caller can do is make the next
  render of one project page, and of the summary's (`/`) today card, read the
  database once.
- A completion nobody is watching is not moved by the browser. The move is
  triggered by a browser that received the event; if no browser had the
  channel open when the run completed, nothing calls the action. The database
  webhook ("Webhook revalidation" above) covers that case from the server
  side, dropping the same two tags through the route handler. Until its two
  database settings are set, History stays as it was until the cache lifetime
  (`getHistory`'s explicit `cacheLife`: a background refresh once an entry is
  a day old) or until the next completion anyone sees. The Active half has no such gap: the catch-up re-reads it on every
  `SUBSCRIBED`.

A DELETE of a run that is not in the Active list is treated as a history
change too (`isHistoryChange`), since under the default replica identity the
event cannot say what the deleted run was, and a completed run that no longer
exists should leave History on the next render rather than at cache expiry.

One rendering detail to know when reading the served HTML of a pre-rendered
project page. Active and History both stream in behind their Suspense
boundaries on every request (see "What is prerendered and what is not"), so
in the served document the Active and History skeletons (`aria-busy="true"`
containers) sit at their sections' positions, the rendered rows follow in
hidden segments, and React's inline `$RC` script swaps them in as the
document parses, before any bundle loads and without a fetch. That is not the
query cache (the views' queries are cache hits during the server render,
hydrated by their islands) and not a clock read. What would be a problem is
the rows missing from the document altogether, which is what a clock read in
a client component during the prerender produces.

### Client router cache

`experimental.staleTimes.dynamic` is 300 seconds in `next.config.ts`. Holes
are not prefetched, and the router cache would otherwise keep dynamic content
for 0 seconds, so every sidebar navigation would make an RSC request for the
page's dynamic part and flash the History skeleton. With the window, a project
page visited within it is rendered from the client router cache on a sidebar
navigation, with no RSC request and no History fallback; after the window, the
next navigation refetches the dynamic part. Two paths keep it correct. For the
project on screen, the completion handler calls `revalidateHistory` and then
`router.refresh()`, which re-renders the route from the server; the action's
`updateTag` also clears the whole client cache (installed `cacheLife.md`,
"Client cache behavior"), so in a tab with the channel open any completion
empties it. For a project not on screen, the refetch after the window reads a
server cache already dropped by tag (action or webhook). The residual case: a
completion this tab received no event for (channel down at that moment; the
catch-up re-reads Active only) can leave a revisited page's History up to
five minutes old. `staleTimes.static` stays at its default, since it also sets
the `default` cacheLife profile's `stale`.

## Rules

- Any `"use cache"` scope that must reflect on-demand revalidation on a
  prerendered route is called only after a request-time read, under a
  `SectionBoundary`: here the islands' `await searchParams` (through
  `readHistory`), the first thing each does before `getHistory`
  (`HistorySearchBox` reads it too, for its initial text, and calls no cache
  scope). A scope that
  is prerendered into the static shell is read from the shell's embedded
  Resume Data Cache on every resumed request, frozen at build time, and no
  `updateTag`, `revalidateTag` or `revalidatePath` reaches it; a request-time
  hole is resolved from the live cache handler and keeps its lifetime (see
  "What is prerendered and what is not" above). Do not add `connection()`
  back as a redundant second marker. The `SectionBoundary` (whose inner
  `Suspense` is the streaming boundary) stays around each island, and
  `getHistory` stays out of the page body and `generateMetadata`, where it
  would be prerendered again. Do not swap the hole for a short `cacheLife`
  (`expire` under 5 minutes also makes a hole but gives up the long
  lifetime). Active has no cache scope at all: it is read per request after
  `connection()` (`getActiveRunsState`) and kept current in the browser.
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
- Proof rule for anything about revalidation: verify with a database change
  made **after** `yarn build` (a test row inserted, a run completing), call
  the action, and look for the change in the next response's HTML. A row that
  existed at build time is in the shell regardless and proves nothing. With
  `NEXT_PRIVATE_DEBUG_CACHE=1` on `yarn start`, a plain GET must not add a
  `use-cache: ... generated entry` line for the `getHistory` scope, and the
  first GET after the action must.
- A completion triggers revalidate THEN refresh, in that order and only in
  that order. The realtime module removes the run from the Active entry
  (`applyRunChange`), calls `onHistoryChange(slug)` when `isHistoryChange` is
  true, and `Providers` calls `revalidateHistory(slug)` and, in its `.then`,
  `router.refresh()` guarded by `isProjectPath(window.location.pathname, slug)`.
  Never call `router.refresh()` before the action resolves (the history scope
  would still be cached and the refresh would re-render the old list), and
  never skip the refresh when that project's page is on screen (the action's
  own re-render is not the contract). The action's rejection is swallowed; do
  not surface it in the UI.
- The refresh is conditional on the viewed route, the action is not. The
  action drops the project's server cache for everyone, so it runs on every
  completion; `router.refresh()` only re-renders the route in the address
  bar, so on the overview or another project's page it is a round trip that
  changes nothing and is skipped. Read the route off `window.location` inside
  the callback (after the action resolves), through `isProjectPath` in
  `src/lib/project-route.ts`; do not switch `Providers` to `usePathname()`,
  which would subscribe the whole tree to navigation and re-render it on
  every route change. `isProjectPath` decodes the pathname before comparing
  (Next decodes route params, so a percent-encoded character in a segment
  renders the same page) and answers false for a malformed sequence; keep it pure and tested
  in `src/lib/project-route.test.ts`.
- `src/app/actions/revalidate-history.ts` is a public endpoint. It validates
  the slug with `isProjectSlug` from `src/lib/slug.ts` (the pattern
  `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`, defined nowhere else) and returns early
  otherwise; for a valid slug it calls `updateTag` on each tag of
  `historyTags(slug)` and does nothing else. Do not add a database read or
  write, a parameter beyond the slug, a return value, or a third tag without
  deciding what an anonymous caller can do with it. The second, `summary:today`,
  was decided: an anonymous caller can make the next render of the summary's
  (`/`) today card read the database once, nothing else. `updateTag`, not
  `revalidateTag(tag, "max")`: the latter is stale-while-revalidate and the
  refresh would be served the old history (see
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md`).
- Hydration after a refresh is safe because React Query only overwrites an
  existing entry when the incoming `dataUpdatedAt` is strictly newer
  (`src/data/hydration.test.ts` pins this against the installed
  `@tanstack/query-core`). Do not work around hydration with a key change or
  a manual `setQueryData` in the page; if that test ever fails after an
  upgrade, read `hydration.js` again before touching the move.
- A DELETE of a run the Active list does not hold counts as a history change
  (`isHistoryChange(ev, undefined)` is true) and runs the same action. Do not
  special-case it.
- An unwatched completion (no browser had the channel open) is covered by
  the database webhook, not by a client-side poll: the toolkit's trigger on
  `adw.runs` posts to `src/app/api/revalidate/route.ts`, which drops the same
  `historyTags(slug)`. Rules for that handler:
  - It does nothing but validate and revalidate. Check the secret, parse the
    body, resolve the slug through `getProjectSlug`, call `revalidateTag` on
    `historyTags(slug)`, respond. No write, no other read, no other side
    effect, and no other method than `POST`.
  - `ADW_REVALIDATE_SECRET` is server-only: no `NEXT_PUBLIC_` prefix, never
    read in client code, never a real value in `.env.example` or any tracked
    file. The handler compares it with `crypto.timingSafeEqual` (a length
    difference is a mismatch, not a throw) and, when the variable is unset,
    rejects everything with 503 and logs once. Never add a fallback that lets
    an unconfigured deployment accept requests.
  - `revalidateTag(tag, { expire: 0 })`, not `updateTag` (Server Actions only,
    throws in a route handler) and not `"max"` (stale-while-revalidate, the
    next visitor would see the old History once). Both facts are in the
    installed `updateTag.md` and `revalidateTag.md`; re-read them before
    changing the call.
  - Anything that is not an `adw.runs` event with a UUID `project_id` in
    `record` or `old_record`, or whose project the publishable key cannot see,
    is answered `200 { ignored: true }`, not an error: the trigger does not
    read the response and a 4xx would only make a healthy setup look broken
    in the `net._http_response` table.
  - The trigger, its `WHEN` clauses and the two database settings
    (`app.settings.dashboard_revalidate_url`, `..._secret`) are the toolkit's
    (`adw-toolkit/supabase`). Changing the payload shape or the header name
    here means changing them there in the same change.
- Server-side Supabase reads must not be stored in Next's data cache. On the
  server, `getSupabase()` builds the client with a fetch that sets
  `cache: "no-store"` on every request; keep that, and do not add a server
  read that bypasses `getSupabase()` or passes its own `fetch`. Every server
  read already runs inside a `"use cache"` scope, and Next would otherwise
  also store the REST response as an untagged `kind: "FETCH"` entry with the
  scope's lifetime, so `updateTag` would expire the scope while the
  re-executed function reads the stale body (see "Two caches, one
  source"). `no-store` inside a `"use cache"` scope is permitted and leaves
  the scope's output cached and tagged. Check after `yarn build` that
  `.next/cache/fetch-cache` has no Supabase entry.
