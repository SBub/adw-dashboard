# Bug: E2E navigation waits are flaky under next dev, and develop CI is red

## Metadata

issue_number: `259`
adw_id: `120d6a2a`
issue_json: `{"number":259,"title":"e2e: openFirstProject and page.goto load waits are flaky under next dev (section_tooltip_layering, single_background_color)"}`

## Bug Description

The Playwright suite (`yarn test:e2e`) fails intermittently on specs that have nothing to do with the
change under test, which blocks ADW runs. In run `c640ae9f` (issue #255) four attempts each failed on
a different set of specs:

- `e2e/section_tooltip_layering.spec.ts:94`: `openFirstProject` (`e2e/fixtures.ts:52`) clicked the
  first sidebar project link and `expect(page).toHaveURL(href)` failed after the default 5 s: the page
  was still on `/projects`.
- `e2e/single_background_color.spec.ts:85`: `page.goto("/projects/log")` timed out at 30 s waiting for
  `load`.
- `header_mobile.spec.ts:80` (`page.goto('/writing')` load timeout), `home_page.spec.ts:75` (the door
  click left the URL on `/`), `history_card_fields.spec.ts:154/:207`, `landing_no_filters.spec.ts:59`
  and `landing_today_refresh.spec.ts:61`. Re-run alone, `header_mobile` and `landing_no_filters` pass.

Separately, develop CI at `2d4f48d` (run 40602114628) is red, on one test only:
`e2e/active_runs_narrow_reads.spec.ts:166` "the catch-up after a reconnect reads only changed rows,
narrow", at line 182, `expect(second.bytes).toBeLessThan(first.bytes)`: Expected `< 876`, Received
`4320`.

Expected: the suite passes deterministically, against `next dev` locally (twice in a row) and against
`next start` in CI, with no assertion weakened.

## Problem Statement

1. Client-side clicks in the suite (`openFirstProject`, the `/` door cards) can fire before React has
   hydrated the page or before `next dev` has compiled the target route; the click then does nothing
   (or the navigation outlasts 5 s) and the URL assertion fails.
2. The first `page.goto` of a slow streamed route (`/projects/log`, `/writing`) under `next dev` pays
   the cold compile plus the full stream inside one 30 s test budget, while two workers compete for
   the single dev render thread.
3. `active_runs_narrow_reads.spec.ts` compares the byte size of two live reads whose sizes depend on
   the hosted data, not on the code.

## Solution Statement

1. Make `openFirstProject` wait for the app to be interactive (`waitForLive(page)`: the pill only
   reads `live` after the client has hydrated and joined the channel), click, and assert the URL with
   a timeout that covers a cold compile; if the URL has not changed, click once more. Factor the
   click-and-wait into one small exported helper in `e2e/fixtures.ts` and reuse it for the two door
   cards in `home_page.spec.ts` (which has no pill, so it waits for hydration differently, see tasks).
2. Add a Playwright `globalSetup` that, only when not on CI, requests every route the suite loads
   (`/`, `/projects`, `/projects/log`, `/writing`, `/hire`, `/projects/changelog`, and the first
   project page) once before any test, so no test pays a cold compile. Its reads are GETs against the
   app, so nothing writes to the database.
3. Replace the data-dependent byte comparison in `active_runs_narrow_reads.spec.ts` with direct checks
   of the same property: every row the incremental read returned has `updated_at` at or after the
   `updated_at=gte.` bound in its URL (it read only changed rows), and its bytes per row stay within
   the same 800-byte narrow bound the full read is held to (it is narrow). Both are stricter
   statements of "reads only changed rows, narrow" and neither depends on how many real runs changed.

## Steps to Reproduce

1. `source .ports.env` and make sure the `/prepare_app` server is up on `$PORT` (fresh, so no route
   has compiled yet).
2. `PORT=$PORT yarn test:e2e` and repeat. Failures move between `section_tooltip_layering`,
   `single_background_color`, `header_mobile`, `home_page`, `landing_*`.
3. CI: open https://github.com/SBub/adw-dashboard/actions/runs/40602114628, the `check` job: one
   failure at `e2e/active_runs_narrow_reads.spec.ts:182` (`4320` not `< 876`). It reproduces whenever
   any real run was updated in the 60 s overlap before the cursor while the full read held only one or
   two active runs.

## Root Cause Analysis

- `openFirstProject` does `page.goto("/projects")`, waits only for the link to be visible, then
  clicks. The link is in the server HTML, so it is visible before hydration; a click on a Next `Link`
  before hydration is either lost (the router is not attached and a native navigation can be
  interrupted by hydration) or starts a client navigation whose target route has not compiled under
  `next dev`. `toHaveURL` has the default 5 s, shorter than a cold compile. The same pattern hits the
  door cards on `/` in `home_page.spec.ts:79` and `:88`.
- `page.goto` waits for `load` by default. On `/projects/log` and `/writing` under `next dev` the
  first hit compiles the route and streams every Suspense island before `load` fires; with two workers
  sharing the one dev render thread, that can exceed the 30 s test timeout. Warm routes load in a
  few seconds, which is why the same specs pass when run alone or later in the run.
- `active_runs_narrow_reads.spec.ts:182`: the full read is filtered to running runs plus failed runs
  of the last 7 days (`activeRunsFilter` in `src/data/index.ts`), usually one or two rows plus the
  synthetic one. The incremental read (`getChangedRuns`) returns every run of any status whose
  `updated_at` is at or after the cursor minus `CATCH_UP_OVERLAP_MS` (60 s). On the hosted database
  ADW runs are live: any completed or progressing run in that window adds rows, so the incremental
  read can be larger than the full read. In CI it returned about 8 rows (4320 bytes, about 540 a row,
  so still narrow). The code is right; the assertion compares two data-dependent sizes.

## Relevant Files

Use these files to fix the bug:

- `e2e/fixtures.ts`: `openFirstProject` (the failing helper) and `waitForLive`; home of the new
  click-and-wait helper.
- `e2e/home_page.spec.ts`: the door-card clicks at lines 79 and 88 and the `Watch me build` click at
  101, same pattern.
- `e2e/section_tooltip_layering.spec.ts`, `e2e/single_background_color.spec.ts`: callers of
  `openFirstProject` that failed; no change expected beyond the helper.
- `e2e/active_runs_narrow_reads.spec.ts`: the CI-red assertion at line 182 and its header comment.
- `playwright.config.ts`: gets `globalSetup`; reads `PORT` and `CI` already.
- `src/data/index.ts` (`activeRunsFilter`, `getChangedRuns`) and `src/lib/active-runs.ts`
  (`changedRunsSince`, `CATCH_UP_OVERLAP_MS`): read only, to confirm what the incremental read returns.
- `knip.json`: scans `e2e/**/*.ts`; the new global setup must be reachable (the Playwright plugin
  picks up `globalSetup` from the config).
- `app_docs/ci.md`: read; it covers the CI e2e step. Update only if the CI step changes (it does not).
- `app_docs/realtime.md`, `app_docs/active-runs.md`: background for the catch-up the narrow-reads spec
  tests.
- `README.md`, `AGENTS.md`, `.adw/project.md`: rules (Yarn only, no em-dashes, never `CI=1` in a run,
  never write to Supabase).

### New Files

- `e2e/global-setup.ts`: warms the suite's routes once on a non-CI run.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Reproduce

- `source .ports.env`; confirm the `/prepare_app` server answers on `http://localhost:$PORT/`. Do not
  start or kill any other server.
- Run `PORT=$PORT yarn test:e2e` once and record the failures. Run
  `PORT=$PORT yarn test:e2e e2e/active_runs_narrow_reads.spec.ts` and note `first.bytes` and
  `second.bytes` (add no permanent logging).

### 2. A hydration-safe click helper in `e2e/fixtures.ts`

- Add and export `clickToNavigate(link: Locator, url: string | RegExp): Promise<void>`: clicks `link`,
  then `await expect(page).toHaveURL(url, { timeout: 30_000 })` inside a try; if that first wait fails
  because the URL is still the old one (check `page.url()` against `url` after a short first wait of
  10 s), click once more and assert again with the 30 s budget. Exactly one retry; a second failure
  throws the normal Playwright error.
- Rewrite `openFirstProject`: `page.goto("/projects")`, `await waitForLive(page)` (hydration done,
  and the sidebar loaded), then the existing visible and href checks, then
  `await clickToNavigate(link, href)`. Keep its return value and every existing assertion.

### 3. Use it in `e2e/home_page.spec.ts`

- `/` has no pill. Before the first door click wait for hydration with something that only exists
  after the client runs (inspect the page: for example a client-only attribute or the radio bar's
  play button becoming enabled; pick one that is deterministic and document it in a comment). If
  nothing like that exists, rely on the retry in `clickToNavigate` alone.
- Replace `click()` + `toHaveURL(...)` for both doors (lines 79-80 and 88-89) and for `Watch me build`
  (101-102) with `clickToNavigate`. After `page.goBack()` keep `await expect(page).toHaveURL("/")`.
  All other assertions stay as they are.

### 4. Warm the routes in `e2e/global-setup.ts`

- Default-export an async function taking `FullConfig`. Return immediately when `process.env.CI` is
  set (CI runs `next start` on a fresh build; nothing to compile).
- Read the base URL from `config.projects[0].use.baseURL`. With plain `fetch` (no browser), GET in
  sequence `/`, `/projects`, `/projects/log`, `/writing`, `/hire`, `/projects/changelog`, reading each
  body to the end so the whole stream renders. Then parse the first `href="/projects/<owner>/<repo>"`
  out of the `/projects` HTML and GET it too, and GET the first `/writing/<slug>` link from `/writing`
  and the first `/projects/changelog/<entry>` link the same way. Ignore a non-200 (a spec will report
  it); never retry in a loop; never send a POST.
- In `playwright.config.ts` add `globalSetup: "./e2e/global-setup.ts"` with a one-line comment saying
  it pays the `next dev` compile once so no test does. Global setup runs after `webServer` is up, so
  this works with the adopted `/prepare_app` server.

### 5. Fix the CI-red assertion in `e2e/active_runs_narrow_reads.spec.ts`

- Replace `expect(second.bytes).toBeLessThan(first.bytes)` with:
  - `const since = new URL(second.url).searchParams.get("updated_at")` is `gte.<instant>`; for every
    row in `second.rows`, expect `Date.parse(row.updated_at) >= Date.parse(<instant>)` (only changed
    rows were read).
  - if `second.rows.length > 0`, `expect(second.bytes / second.rows.length).toBeLessThanOrEqual(800)`,
    the same narrow bound as the full read.
- Keep every other assertion. Add a short comment explaining why bytes are compared per row, not
  between the two reads: the incremental read carries every run any status changed in the last
  minute, which on live data can outnumber the active runs.

### 6. Prove the fix

- Before the fix the CI failure reproduces on CI data; locally, confirm the new narrow-reads checks
  pass and that the old check is the one that would fail when real runs change (it depends on data, so
  this is argued from the CI log above, not forced).
- Restart nothing. With the `/prepare_app` server cold if possible (a fresh run), run
  `PORT=$PORT yarn test:e2e` twice in a row: both must report zero failures (skips with a stated
  reason are fine).

### 7. Run the Validation Commands.

## Test Coverage

No new test needed: the change is to the E2E suite itself (its helpers, its setup and one assertion),
and the regression check is the suite: `PORT=<run port> yarn test:e2e` passing twice in a row on a
cold `next dev` server, and `yarn test:e2e` in CI. A spec that tests the test helpers would add noise
without catching anything the suite run does not.

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- `source .ports.env && PORT=$PORT yarn test:e2e e2e/active_runs_narrow_reads.spec.ts e2e/section_tooltip_layering.spec.ts e2e/single_background_color.spec.ts e2e/home_page.spec.ts`: the specs named in the issue and the CI failure.
- `source .ports.env && PORT=$PORT yarn test:e2e`: full suite, first run, zero failures.
- `source .ports.env && PORT=$PORT yarn test:e2e`: full suite again, zero failures (the issue's
  twice-in-a-row bar).
- `yarn lint`: lint, includes `e2e/`.
- `yarn typecheck`: the new setup file and helper types.
- `yarn knip`: the new `e2e/global-setup.ts` and exported helper must be used.
- `yarn format:check`: Prettier.
- `yarn test`: unit suite, unchanged, must stay green.
- `yarn build`: the app still builds (no app code changes, but it is in the test phase).

## Notes

- No app code changes; the bug is in the suite. No documentation change needed (tests only, per the
  profile's Documentation section). `app_docs/ci.md` is unaffected: the CI workflow does not change.
- Never set `CI=1` locally: it would skip the warm-up and switch the server to `yarn start`.
- The narrow-reads replacement does not weaken the test: it checks the filter bound and the per-row
  width directly, which is what "reads only changed rows, narrow" means, instead of a size comparison
  that the hosted data decides.
- No new dependency.
- No em-dashes in any edited file.
