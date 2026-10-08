# Bug: History pagination jumps to the top and shows no pending state on a page turn

## Metadata

issue_number: `148`
adw_id: `d2fdf4c1`
issue_json: `{"number":148,"title":"History pagination: keep the scroll position and show the pending state on a page turn"}`

## Bug Description

On a project page (`/projects/<owner>/<repo>`) with more than one History page, clicking the older
arrow (`Older runs`) or the newer arrow (`Newer runs`) in the History heading row behaves like a
full page reload:

- For the length of the RSC round trip (about 0.9 s at 800 ms latency) nothing on screen changes:
  the list is not dimmed, `aria-busy` stays `false`, the click looks ignored.
- When the new page lands, the window jumps to the top (`scrollY` 573 to 0), away from History.

Nothing re-mounts (header, Active, Queue and History headings are the same DOM nodes before and
after), `loading.tsx` and the `SectionBoundary` fallbacks never show; the navigation is one client
RSC request.

Expected: the page stays where it is and only the History list dims (with `aria-busy="true"`)
until the new rows arrive, exactly as a History search already behaves.

Side observation from the issue: the page turn was followed by a browser read of
`adw.queue_items`. It must be explained; fixed here if this navigation causes it, otherwise noted
in the PR.

## Problem Statement

The two arrows in `src/components/HistoryLinks.tsx` are plain `next/link` links. A `Link`
navigation (1) scrolls to the top of the page segment by default, and (2) runs in the router's own
transition, not in the shared `HistoryTransition`, so `HistoryResults` never sees it as pending.

## Solution Statement

Add one small client leaf, `src/components/HistoryPageLink.tsx`, used for each arrow by
`HistoryLinks` (which stays a stateless server component). It renders `next/link` (a real
`<a href>`, so middle-click, open in a new tab, no-JS and the automatic production prefetch keep
working) with `scroll={false}` and an `onNavigate` handler. `onNavigate` only fires for a plain
same-tab SPA navigation (Next already skips modifier keys, non-primary buttons and `target`), so
the handler is: `e.preventDefault()`, then
`startTransition(() => router.push(href, { scroll: false }))` with `startTransition` from
`useHistoryTransition()`. The arrows (in the `actions` slot of the History `SectionHeading`) and
`HistoryResults` are already inside the same `<HistoryTransition>` in the project page, so no
provider has to move; `HistoryResults` dims the list and sets `aria-busy` while the push is
pending. `router.push` (not `replace`) keeps each page in the browser history, as the links did.

No URL building, bookmark decoding or page-number computation moves: `HistoryPagination` still
builds both hrefs with `historyHref`.

## Steps to Reproduce

1. `yarn build && PORT=$PORT yarn start` (source `.ports.env` for `PORT`; fall back to 3000 only
   when it is absent).
2. Open `http://localhost:$PORT/projects/SBub/adw-dashboard` (or the first project the sidebar on
   `/projects` lists whose History shows `1 of N`, N > 1) at 1280x720.
3. Scroll so the History heading is at the top of the viewport; note `window.scrollY`.
4. With network throttling (or a Playwright `page.route` delaying `rsc` requests by ~1 s), click
   `Older runs`.
5. Observe: during the delay the History list wrapper's `aria-busy` stays `false` and the list is
   not dimmed; after it lands `window.scrollY` is `0`.

## Root Cause Analysis

- Scroll: `next/link` defaults to `scroll={true}`. On navigation the App Router scrolls to the
  first visible element of the changed page segment (here the top of the project page), so the
  window lands at `scrollY` 0. `HistorySearch` avoids this with `router.replace(href, { scroll:
false })`.
- No pending state: `HistoryResults` reads `isPending` from the `useTransition` held by
  `HistoryTransition`. Only navigations started through that `startTransition` mark it pending.
  `HistorySearch` uses it; `Link` starts its navigation in the router's internal transition, so the
  shared `isPending` never flips and the old rows stay fully opaque until the new ones replace them.
- Queue read (side observation): `QueueView`'s query is `staleTime: "static"` with
  `refetchOnMount: false`, and nothing re-mounts, so a page turn should not refetch it, and the
  re-rendered `HydrationBoundary` only writes the server state into the cache (no fetch). The only
  browser path that reads `queue_items` is `catchUp` in `src/data/realtime.ts`, run on every Realtime
  `SUBSCRIBED` (first join and every rejoin, for each cached queue key). The likely cause is a
  catch-up that coincided with the click (a click within the first seconds after load, or a rejoin
  under 800 ms throttling), which reads `project_summaries`, `runs` and `queue_items` together. The
  implementer confirms this in Step 5 before deciding.

## Relevant Files

Use these files to fix the bug:

- `README.md`: repository overview (read first).
- `AGENTS.md`: rules (Yarn only, no em-dashes, conventional commits, docs per feature, profile kept
  in step).
- `.adw/project.md`: the ADW profile; its Tests section lists the `e2e/*.md` journeys and must name
  the new one.
- `docs/conditional-docs.md`: index; the `screens-and-components` and `project-page` lines match.
- `app_docs/screens-and-components.md`: the `"use client"` list and the rule that the arrows are
  "plain `next/link` hrefs"; must name `HistoryPageLink` and the new navigation.
- `app_docs/project-page.md`: History paging description; must describe the page-turn behaviour.
- `src/components/HistoryLinks.tsx`: the two arrows; switch both from `Link` to `HistoryPageLink`,
  update its doc comment.
- `src/components/HistoryTransition.tsx`: the shared transition and `HistoryResults`; only its doc
  comments change (the transition is now shared by the search and the page arrows).
- `src/components/HistorySearch.tsx`: the reference pattern (`useHistoryTransition`,
  `router.replace(..., { scroll: false })`). Not changed.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: confirms the arrows (`HistoryPagination`
  in the `actions` slot) and `HistoryResults` are both inside `<HistoryTransition>`; only the comment
  above `<HistoryTransition>` changes ("the search box navigates in" becomes the search box and the
  page arrows).
- `src/data/realtime.ts`: `catchUp`, the one browser reader of `queue_items`; read for the side
  observation.
- `src/components/QueueView.tsx`: queue query options (`staleTime: "static"`,
  `refetchOnMount: false`); read for the side observation.
- `e2e/test_history_card_fields.md`: model for the new journey's shape.
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`: `scroll` and
  `onNavigate` semantics in the installed Next 16.3.8.

### New Files

- `src/components/HistoryPageLink.tsx`: client leaf, one per arrow.
- `e2e/test_history_page_turn.md`: agent-driven journey for the page turn (see Test Coverage for
  why a journey).

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the Next docs for the link

- Read the `scroll` and `onNavigate` sections of
  `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` and the `useRouter`
  `push` options, to confirm `onNavigate` only fires for SPA navigations (not for modifier-key,
  middle-click or `target` clicks) and that `e.preventDefault()` cancels the Link's own navigation.

### 2. Create `src/components/HistoryPageLink.tsx`

- `"use client"`. Props: `href: string`, `label: string` (the `aria-label`), `className: string`,
  `children: ReactNode`.
- Renders `<Link href={href} aria-label={label} className={className} scroll={false}
onNavigate={...}>`.
- `onNavigate(e)`: `e.preventDefault();` then
  `startTransition(() => { router.push(href, { scroll: false }); });` where `router` is
  `useRouter()` from `next/navigation` and `startTransition` comes from `useHistoryTransition()`.
- Doc comment in the style of `HistorySearch`: one History arrow; a real link (middle-click, new tab,
  no-JS, prefetch); a plain click navigates inside the shared History transition with
  `scroll: false`, so the window stays put and `HistoryResults` dims the list. It builds no URL.
- If Step 1 shows `onNavigate` does not behave as described, fall back to a plain `<a href>` whose
  `onClick` returns early unless `e.button === 0` and none of `metaKey`, `ctrlKey`, `shiftKey`,
  `altKey` is set and `!e.defaultPrevented`, then does the same `preventDefault` and push, and add
  `router.prefetch(href)` on `onMouseEnter` and `onFocus`.

### 3. Use it in `src/components/HistoryLinks.tsx`

- Replace both `<Link ...>` elements with `<HistoryPageLink href={newerHref} label="Newer runs"
className={ARROW}>←</HistoryPageLink>` and the `olderHref` / `"Older runs"` / `→` counterpart.
- Remove the `next/link` import. Keep the hidden placeholders, the indicator and `ARROW` unchanged.
  No `"use client"`, no state.
- Update the doc comment: the arrows are `HistoryPageLink`s that navigate inside the shared History
  transition without scrolling.

### 4. Update comments that name the transition's users

- `src/components/HistoryTransition.tsx`: the `HistoryTransition` comment ("The one transition the
  History search navigates in, shared by the box that starts it") and `HistoryResults` ("while a
  search navigation is pending") now cover the page arrows too.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: the comment above `<HistoryTransition>`
  ("the one transition the search box navigates in") names the arrows as well. No code change.

### 5. Investigate the `queue_items` read

- Run the production build (`yarn build`, then `yarn start` on `$PORT`), open the project page,
  wait for the indicator to read `live` and a few seconds more, then turn a page with the Playwright
  MCP server and list network requests (`browser_network_requests`).
- If no `queue_items` request follows the page turn once the channel is settled, and a read seen
  earlier comes with `project_summaries` and `runs` reads (the catch-up set), it is the Realtime
  catch-up, not the navigation: change nothing and record that in the PR description.
- Only if a `queue_items` read reliably follows the page turn on its own, trace its initiator
  (stack of the request) and fix the cause in this change, keeping `staleTime: "static"` and
  `refetchOnMount: false`.
- Stop the server this step started.

### 6. Documentation

- `app_docs/screens-and-components.md`:
  - Add `HistoryPageLink` to the `"use client"` list: "`HistoryPageLink`, which navigates the
    History pages inside the shared History transition".
  - Extend the `HistoryTransition` entry so it is shared by the box, the arrows and
    `HistoryResults`.
  - `HistoryLinks` stays in the stateless list.
  - Replace "The left and right arrows of `HistoryLinks` are plain `next/link` hrefs that ..." with:
    the arrows are `HistoryPageLink`s with the hrefs `HistoryPagination` builds with `historyHref`;
    a plain click pushes the href with `scroll: false` inside the shared transition; do not decode a
    bookmark, build a URL or compute a page number in either component. Keep the rest of the rule.
- `app_docs/project-page.md` (How it works, the paging paragraph): add that a page turn keeps the
  scroll position, pushes the new URL (each page stays in the browser history) inside the shared
  `HistoryTransition`, and `HistoryResults` dims the list (`aria-busy="true"`) until the new rows
  arrive; the arrows remain real links, so middle-click and new tab open the same URL. Update the
  last sentence of the search paragraph so `HistoryTransition` shares the transition of the box and
  the arrows.
- `docs/conditional-docs.md`: no new doc; the `screens-and-components` and `project-page` lines
  already cover this. Leave unchanged unless a wording no longer matches.
- No em-dashes anywhere.

### 7. Add the journey `e2e/test_history_page_turn.md`

- Shape of `e2e/test_history_card_fields.md`: title, short intro (read only, never writes to the
  database), `## User Story`, `## Test Steps` with `**Verify**` lines, `## Success Criteria`.
- Steps:
  1. Navigate to `/projects`, wait for the `status` element to read `live`.
  2. Find a project whose History indicator reads `1 of N` with N > 1 (try the sidebar's projects in
     order, starting with `SBub/adw-dashboard` if listed); if none has more than one page, note it,
     take one screenshot and pass.
  3. Resize to 1280x720. Scroll so the History `h2` is at the top of the viewport
     (`scrollIntoView({ block: "start" })`), then record `window.scrollY` (must be greater than 0),
     the first History row's text and the `href` of the `Older runs` link.
  4. With `browser_run_code_unsafe`, install `page.route` on requests carrying the `rsc` header (or
     `_rsc` query) that delays them 1500 ms before `route.continue()`; click `Older runs`; within the
     delay, read the History list wrapper (the `[aria-busy]` ancestor of the History rows).
     **Verify** `aria-busy="true"` while pending.
  5. Wait for the indicator to read `2 of N`. **Verify**: the URL contains `?after=` and equals the
     recorded `href` (resolved against the origin); the first row's text changed; `window.scrollY`
     equals the recorded value (within 1px); the wrapper's `aria-busy` is `"false"`.
  6. Record the `Newer runs` `href`, click it (still delayed). **Verify** `aria-busy="true"` while
     pending, then the indicator reads `1 of N`, the URL equals that `href` (no `?after=` or
     `?before=`), the first row is the one recorded in step 3, and `window.scrollY` is unchanged.
  7. **Verify** each arrow is an `a` element with an `href` (so middle-click and open in a new tab
     use it) and keeps its `aria-label`. Remove the route.
  8. Take a screenshot at 1280x720.
- Success Criteria: scroll kept on both arrows, list busy while pending, URL, indicator and rows
  change, hrefs are the navigated URLs, 1 screenshot.

### 8. Update `.adw/project.md`

- In the Tests section, add `e2e/test_history_page_turn.md` to the list of journeys. Do not touch
  the headings.

### 9. Run the validation commands

- Run every command in `Validation Commands` and fix anything they report.

## Test Coverage

Regression coverage is the agent-driven journey `e2e/test_history_page_turn.md`. It fails on the
unfixed code (scrollY drops to 0 and `aria-busy` never becomes `true`) and passes after the fix. A
journey is used because the profile has no code E2E suite (`E2E code suite: none`) and no component
test layer: the one code layer is `src/**/*.test.ts` in vitest's node environment, which cannot
click a link, run an App Router navigation or measure window scroll. The behaviour is scroll position
and a transition's pending state in a real browser, so a unit test of `HistoryLinks` markup would
not catch a regression. No unit test is added: no reducer or helper changes (`historyHref` and the
bookmark code are untouched and already covered by `src/lib/history-bookmark.test.ts`).

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- `yarn lint`: ESLint over the new client leaf and the edited components.
- `yarn typecheck`: `next typegen` then `tsc --noEmit`; proves the `onNavigate` and `router.push`
  types (never stage the rewritten `next-env.d.ts`).
- `yarn knip`: no unused export or dependency (the `next/link` import moves to the new file).
- `yarn format:check`: Prettier on all files, including the docs and the journey.
- `yarn test`: unit tests, unchanged behaviour (history bookmark, skeletons, hydration rule).
- `yarn build`: production build; then `yarn start` on `$PORT` and
  `curl -s http://localhost:$PORT/projects/SBub/adw-dashboard | grep -c 'Older runs'` (non-zero
  when the project has more than one page) and check the served HTML still contains the run rows
  (for example a known run's branch text), so the arrows and rows are still server-rendered. Stop
  the server afterwards.
- Before and after the fix: Steps to Reproduce 3 to 5 against the build show `scrollY` 0 and no
  `aria-busy="true"` before, and an unchanged `scrollY` with `aria-busy="true"` while pending after
  (the journey automates this).

## Notes

- No new dependency.
- `HistoryPageLink` renders `next/link` (with `onNavigate`) rather than a hand-written `<a>`: it is
  still a real `<a href>`, Next's own click filter decides what is a plain left click, and the
  production viewport prefetch of the neighbouring page is kept, which covers the issue's optional
  prefetch without extra code. The plain `<a>` variant in Step 2 is the fallback.
- `router.push`, not `replace`: the arrows were links, so each page was a history entry; search
  uses `replace` because every keystroke would otherwise be one.
- Do not lift or move `HistoryTransition`: the arrows and `HistoryResults` are already under it, and
  it reads no request data, so the History section stays in the static shell.
- The Queue `queue_items` read: report the Step 5 finding in the PR description.
- Search is untouched (`HistorySearch` is not edited).
