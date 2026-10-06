# Bug: header shows "connecting" on /summary; the indicator does not belong there

## Metadata

issue_number: `70`
adw_id: `202b053d`
issue_json: `{"number":70,"title":"bug: header shows \"connecting\" on /summary; the indicator does not belong there","body":"Symptom: the header's connection indicator shows \"live\" on `/`and`/projects/<owner>/<repo>`but \"connecting\" on`/summary`. Cause: the root layout renders the header with `ConnectionIndicator`on every route, while the realtime connection is started only by`Providers`, mounted in `src/app/(dashboard)/layout.tsx`. Decision: the Summary page does not need a live connection and must not show the indicator. Do not mount `Providers`or start realtime on`/summary`. Implementation: 1. Move the indicator out of the root header into the dashboard route group. 2. Nothing on `/summary`subscribes to realtime. 3. Check:`/summary`renders no indicator;`/`and project pages still reach \"live\"; navigating`/projects/... -> /summary -> /projects/...` restarts the connection and shows \"live\" again. Add a Playwright check for the three states."}`

## Bug Description

The connection pill (`ConnectionIndicator`) is rendered by the root layout's header, so it appears on every route. On `/` and `/projects/<owner>/<repo>` it reaches `live`, because the `(dashboard)` layout mounts `Providers`, which starts the Realtime channel. On `/summary` nothing starts the channel, so the pill sits at `connecting` (amber, pulsing) forever, and after navigating there from a project page it is actively reset to `connecting` by the channel closer that runs in `Providers`' effect cleanup.

Expected: `/summary` shows no connection indicator at all (it is a cached server read, not a live section). `/` and project pages still show the pill and reach `live`. Going project page, then `/summary`, then a project page again shows the pill reaching `live` again.

Actual: `/summary` shows a permanently pulsing `connecting` pill that suggests a broken connection.

## Problem Statement

The indicator describes a socket that only exists inside the `(dashboard)` route group, but it is rendered outside that group, in `src/app/layout.tsx`, on routes where the socket is never opened.

## Solution Statement

Render `ConnectionIndicator` only inside the `(dashboard)` layout, which is where `Providers` (and therefore `startRealtime`) is mounted, and remove it from the root header. The root header keeps the title, the `SectionNav` (Projects / Summary) and the tagline on every route. The pill goes into the sidebar's heading row in `src/app/(dashboard)/layout.tsx`, beside the `Projects` `<h2>`: it describes exactly the live data in that pane, it is visible at the top of the page on both desktop (sticky sidebar) and mobile (sidebar stacked first), and the change is one removal and one insertion with no new component, slot or layout.

Nothing on `/summary` changes: no `Providers`, no `startRealtime`, no client component. Remount on return to a project page already works (the `(dashboard)` layout remounts, `Providers` runs its effect again, `SUBSCRIBED` sets `Live`); it only becomes visible and correct once the indicator lives in the same subtree.

Rejected alternatives: a header slot filled through a parallel route (`@indicator`) in the root layout adds a routing concept for one pill; moving the whole header into each group's layout would also require a new `src/app/summary/layout.tsx` and a header in the root `not-found.tsx`. Both are more change than the bug needs.

## Steps to Reproduce

1. `source .ports.env` (fall back to 3000 if absent) and start the app with `yarn dev` (or use the server the run already prepared on `$PORT`).
2. Open `http://localhost:$PORT/`; wait for the header pill to read `live`.
3. Click `Summary` in the header (or open `http://localhost:$PORT/summary` directly).
4. Observe: the header pill reads `connecting` (amber, pulsing) and never changes.
5. Before the fix, `curl -s http://localhost:$PORT/summary | grep -c 'role="status"'` prints `1` (the pill is in the served HTML).

## Root Cause Analysis

- `src/app/layout.tsx` (root layout) imports and renders `<ConnectionIndicator />` in the header on every route.
- `ConnectionIndicator` reads a module-level store whose server snapshot and initial value are `ConnectionStatus.Connecting`; the only writer is `startRealtime`'s channel status callback (`src/data/realtime.ts`), and its closer resets the store to `Connecting`.
- `startRealtime` is called only from `Providers` (`src/app/providers.tsx`), which is mounted only by `src/app/(dashboard)/layout.tsx`.
- `src/app/summary/` is outside `(dashboard)` by design (README, "Routing": no sidebar, no prefetch, no `Providers`, no Realtime). So on `/summary` the pill is rendered with nothing to drive it: on a direct load it stays at its initial `connecting`; on a client navigation from a project page the `(dashboard)` layout unmounts, `Providers`' cleanup calls the closer, and the pill is set back to `connecting`.
- The README even documents the symptom ("so the header's connection pill stays at `connecting` there"); the defect is the placement, not the store.

## Relevant Files

Use these files to fix the bug:

- `src/app/layout.tsx`: root layout; renders the header with `ConnectionIndicator`. Remove the indicator and its import here; keep the title link, `SectionNav` and the tagline.
- `src/app/(dashboard)/layout.tsx`: the `(dashboard)` layout that mounts `Providers`; the indicator goes into its sidebar heading row, inside `Providers`.
- `src/components/ConnectionIndicator.tsx`: the pill and its store. No behavioural change; its doc comment says "in the site header" and must be corrected.
- `src/data/realtime.ts`: header comment says the module "drives the header's connection indicator"; correct the wording only.
- `src/app/providers.tsx`: read only, to confirm the mount/cleanup path that restarts the channel on remount. No change.
- `src/app/summary/page.tsx`: read only, to confirm nothing on `/summary` subscribes. No change.
- `README.md`: "Routing" (the `/summary` paragraph that says the pill stays at `connecting`), "The indicator" (says "The header shows a connection indicator"), the realtime paragraph mentioning the indicator. Update to describe the new placement.
- `AGENTS.md`: add the invariant that the indicator is rendered only inside the `(dashboard)` layout (where `Providers` is) and never on `/summary` or in the root layout.
- `.adw/project.md`: Review section says "The header's connection indicator moves from `connecting` to `live`" and Tests section says no `e2e/` directory exists. Update both in the same change (keep the nine `##` headings and their order).
- `.claude/commands/test_e2e.md`: the contract for the agent-driven journey file (read only).

### New Files

- `e2e/test_connection_indicator_scope.md`: agent-driven Playwright journey for the three states the issue asks to check (see the task below for why a journey and not a spec).

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Reproduce before the fix

- Source `.ports.env` (fall back to 3000 only if absent); reuse the run's server on `$PORT` or start `yarn dev` (never touch a server on another port).
- `curl -s http://localhost:$PORT/summary | grep -c 'role="status"'` prints `1`; record it.

### 2. Remove the indicator from the root header

- In `src/app/layout.tsx`, delete the `ConnectionIndicator` import and the `<ConnectionIndicator />` element. Keep the right-hand `div` with the `AI Developer Workflow runs` tagline (it still right-aligns via `ml-auto`), the title link and `<SectionNav />` unchanged.

### 3. Render the indicator inside the (dashboard) layout

- In `src/app/(dashboard)/layout.tsx`, import `ConnectionIndicator` from `@/components/ConnectionIndicator`.
- Wrap the sidebar's `Projects` `<h2>` in a row, `<div className="mb-2 flex items-center justify-between gap-2 px-1">`, move `mb-2` and `px-1` from the `<h2>` to that row, and render `<ConnectionIndicator />` after the `<h2>` in it. It must stay inside `<Providers>` and outside the `HydrationBoundary` / `QueryBoundary` (it reads no query, and must not be hidden by the sidebar's fallback or error panel).
- Add a short comment above the row in the file's style: the indicator lives here, not in the root header, because the channel it describes is opened by `Providers` in this layout; `/summary` has no channel and no pill.
- Do not touch `ConnectionIndicator`'s store, `setConnectionStatus`, `startRealtime` or `Providers`. Do not add `Providers` or any client component to `src/app/summary/`.

### 4. Correct comments that name the header

- `src/components/ConnectionIndicator.tsx`: first doc line "The Realtime connection indicator in the site header" becomes "in the dashboard sidebar" (or equivalent), noting it is rendered only inside the `(dashboard)` layout.
- `src/data/realtime.ts` line 3: "drives the header's connection indicator" becomes "drives the connection indicator".

### 5. Add the agent-driven journey for the three states

- Why a journey: the issue asks for a Playwright check, and the behaviour is a live websocket reaching `live` across a client navigation that unmounts and remounts `Providers`. The profile's only test layer is vitest on `src/**/*.test.ts` (pure helpers and reducers, no DOM), and there is no Playwright suite; adding one would be inventing a layer. The Playwright MCP journey run by the test phase is the only existing way to prove it.
- Create `e2e/test_connection_indicator_scope.md` following `.claude/commands/test_e2e.md`, with `## User Story`, `## Test Steps` (numbered, with `**Verify**` lines) and `## Success Criteria`. Steps:
  1. Navigate to `/`. **Verify** a `status` element is present and within 15 seconds its text is `live`. Screenshot.
  2. Click the first project link in the sidebar's `Projects` navigation. **Verify** the URL is `/projects/<owner>/<repo>` and the `status` element reads `live`.
  3. Click `Summary` in the header's `Sections` navigation. **Verify** the URL is `/summary`, the `Summary` heading is present, and the accessibility snapshot contains no `status` element and no text `connecting`, `live` or `reconnecting` outside the summary content. Screenshot.
  4. Click `Projects` in the header, then the same project link as in step 2 (or navigate back twice). **Verify** a `status` element is present and within 15 seconds reads `live` again. Screenshot.
  5. Navigate directly (full load) to `/summary`. **Verify** no `status` element is present.
- Success criteria: the pill reaches `live` on `/` and on a project page, is absent on `/summary` both after client navigation and on a full load, and reaches `live` again after returning to a project page.
- Note that the journey's `status` role check relies on `ConnectionIndicator`'s `role="status"`; the `SectionBoundary`/`QueryBoundary` panels do not use that role (confirm with a grep before finalising the step wording).

### 6. Update documentation and the profile

- `README.md`:
  - "Routing", `/summary` paragraph: replace "so the header's connection pill stays at `connecting` there" with a statement that `/summary` shows no connection pill, because the pill is rendered by the `(dashboard)` layout beside `Providers`.
  - "The indicator": "The header shows a connection indicator" becomes "The dashboard's sidebar shows a connection indicator, beside the Projects heading"; add one sentence that it is rendered only in the `(dashboard)` layout, so it exists exactly where the channel does, and that leaving the group (to `/summary`) unmounts both and returning remounts both (the closer resets the store to `Connecting`, the next `SUBSCRIBED` sets `Live`).
  - Any other "header's connection indicator/pill" wording (grep `-n "header's connection"`) is corrected.
- `AGENTS.md`: under the `ConnectionIndicator` rule in "Architecture", add: `ConnectionIndicator` is rendered only in `src/app/(dashboard)/layout.tsx`, inside `Providers`, never in the root layout or under `src/app/summary/`; a route without the channel shows no pill. Do not mount `Providers` or start Realtime on `/summary` to make one appear.
- `.adw/project.md`:
  - Review: "The header's connection indicator" becomes "The sidebar's connection indicator (dashboard routes only; `/summary` has none)".
  - Tests: replace "No `e2e/` directory exists; the test phase treats that as nothing to run" with the fact that E2E code suite is still `none`, and that `e2e/*.md` holds agent-driven journeys (currently `e2e/test_connection_indicator_scope.md`) that the test phase runs through the Playwright MCP server. Keep the nine `##` headings untouched.
- No em-dashes anywhere.

### 7. Reproduce after the fix

- `curl -s http://localhost:$PORT/summary | grep -c 'role="status"'` prints `0`.
- `curl -s http://localhost:$PORT/ | grep -c 'role="status"'` prints `1` (the pill is still in the dashboard shell).

### 8. Run the validation commands

- Run every command in `Validation Commands` below; all must pass.

## Test Coverage

No unit test needed: the fix moves one JSX element between two layouts and changes no helper, reducer or store; the profile's only automated layer is vitest on pure `src/**/*.test.ts` modules with no DOM, so no unit test could fail before and pass after. The regression check is the agent-driven journey `e2e/test_connection_indicator_scope.md` (task 5), which the test phase runs: it fails on the unfixed code at step 3 (a `status` pill reading `connecting` on `/summary`) and passes after the fix, and it also guards that the pill still reaches `live` on `/`, on a project page, and again after returning from `/summary`.

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- `curl -s http://localhost:$PORT/summary | grep -c 'role="status"'` : reproduces the bug before the fix (`1`) and proves it after (`0`); `$PORT` from `.ports.env`.
- `curl -s http://localhost:$PORT/ | grep -c 'role="status"'` : the pill is still in the dashboard shell (`1`).
- `grep -rn "ConnectionIndicator" src/app` : only `src/app/(dashboard)/layout.tsx` imports it.
- `yarn lint` : lint passes.
- `yarn typecheck` : types pass (do not stage the rewritten `next-env.d.ts`).
- `yarn knip` : no unused export or file after the import moves.
- `yarn format:check` : Prettier formatting of the changed files and the new journey.
- `yarn test` : the unit suite (including `src/lib/status-colors.test.ts`, which scans `src/` for inline status hues; `ConnectionIndicator` stays the one exemption) still passes.
- `yarn build` : the root layout and the `(dashboard)` layout still prerender (the pill's constant server snapshot keeps it in the static shell).

## Notes

- The issue asks for "a Playwright check". The profile has no Playwright suite and its only test layer is pure vitest, so the check is an agent-driven `e2e/*.md` journey run through the Playwright MCP server, not a new `@playwright/test` dependency. No new library is added.
- The `ml-auto` right column of the root header keeps the tagline, which is `hidden sm:inline`; on mobile that column is empty, which is harmless.
- In development, strict mode runs the `Providers` effect mount, cleanup, mount, so the pill flashes `connecting` once before `live`; production connects once. The journey's 15-second wait covers both.
- Commit as `fix: ...` with no trailers, per the profile's Documentation section.
