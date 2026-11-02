# Chore: Read less on every Active runs load and catch-up: changed rows only, no state, recent failures only

## Metadata

issue_number: `243`
adw_id: `e2976ef7`
issue_json: `{"number":243,"title":"Read less on every Active runs load and catch-up: changed rows only, no state, recent failures only"}`

## Chore Description

The Active runs list is read in full on every request to every `(dashboard)` route (server,
`getActiveRunsState`) and again in the browser on every catch-up (`catchUp` in
`src/data/realtime.ts`). Each read selects `RUN_COLUMNS`, which includes the `state` jsonb, for every
`running` or `failed` run of every project, with no time bound, so failed runs pile up forever and
egress grows with the number of runs ever failed. Measured on 2026-10-27 against the hosted project
with the publishable key: 2 rows, 2035 bytes with `state`, 1001 bytes without it (about 500 bytes of
`state` per row).

This chore changes **what** each read pulls (issue #240, already merged, changed **how often**; its
coalesced runner, backoff and deferral stay exactly as they are):

1. **No `state`.** Nothing in `src/` reads `Run.state` (verified: `git grep` over the run row,
   history list, run view, run phase, history bookmark and Active components finds no read). Drop
   `state` from `RUN_COLUMNS` (which also narrows the History read that shares it) and from the
   `Run` type. Realtime `postgres_changes` still delivers the full row, so the run reducer copies only
   the screen fields into the cache.
2. **Recent failures only.** Active = every `running` run plus `failed` runs whose `updated_at` is
   within the last `FAILED_RUN_WINDOW_DAYS = 7` days. One constant and one cutoff function, used by
   the server read and by the browser catch-up.
3. **Incremental catch-up for runs.** The first catch-up after `startRealtime` stays a full (narrow,
   windowed) read, because the served page can be old. It sets a cursor: the highest `updated_at`
   (a server timestamp) in what it read. Every run event advances the cursor. Each later catch-up
   reads only runs with `updated_at >= cursor - 60 s`, any status, narrow columns, and merges them:
   running and in-window failed rows are inserted or replaced, rows that became completed (or
   cancelled, or any non-live status) or older failures are removed, and failed rows already in the
   entry that aged past the window are pruned.
4. **Queues unchanged:** the full `getQueue` per cached queue stays (deletions are invisible to an
   incremental read).
5. **Docs:** `app_docs/realtime.md` (catch-up section, its cost paragraph, Rules),
   `app_docs/active-runs.md` (what Active means, now with the 7-day window),
   `app_docs/data-boundary.md`, `app_docs/types.md`, `app_docs/clock-and-prerender.md` and
   `app_docs/project-page.md` where they state the Active definition, the columns or the clock sites.

Constraints carried from the issue: the "since" value is always a server timestamp the tab
received, never a client clock; `getSupabase()` stays the one `createClient`; no schema change, no
new table in the publication, no env variable; no clock read in render or a hook body, and the
codebase keeps exactly three argument-less clock-read sites (see Notes); backoff, deferral and
debounce untouched; Yarn only, lefthook not bypassed, no em-dashes, Conventional Commits with no
trailers.

## Relevant Files

Use these files to resolve the chore:

- `AGENTS.md` - repository rules (no em-dashes, docs rules, every "do not" in a feature doc is an invariant that must be rewritten in the same commit when changed).
- `.adw/project.md` - commands, test layers (Vitest `src/**/*.test.ts`, Playwright `e2e/*.spec.ts`), Protected rules (never write to the hosted Supabase).
- `docs/conditional-docs.md` - index; the matching docs are listed below. Its `active-runs.md` line may mention the window.
- `app_docs/realtime.md` - catch-up section ("Catch-up on SUBSCRIBED"), its Cost paragraph, "Event to cache" (applyRunChange behaviour), Rules (catch-up through boundary functions). Must describe the cursor, the incremental read and the merge.
- `app_docs/active-runs.md` - Rule "Active means status running or failed ... A failed run can be resumed, so it is live and stays in the Active entry": must gain the 7-day window, in the same commit.
- `app_docs/data-boundary.md` - documents `RUN_COLUMNS` (line ~84, lists `state`) and the reads (line ~132); add `getChangedRuns`.
- `app_docs/types.md` - Rule "Row types mirror the schema column for column": `Run` now omits the unread `state` column; rewrite the rule to say so.
- `app_docs/clock-and-prerender.md` - Rules name the three clock-read sites; the first one moves from "getActiveRuns's fetched_at stamp" to the one Active-read clock helper shared by `getActiveRuns` and `getChangedRuns` (still one site, still three in total).
- `app_docs/project-page.md` - says Active is `running` or `failed` and that a failed run stays in it; add the 7-day window.
- `src/data/index.ts` - `RUN_COLUMNS` (line 82), `ActiveRuns` (line ~66), `getActiveRuns` (line ~209); add the windowed filter, the shared clock helper and `getChangedRuns`.
- `src/data/realtime.ts` - `startRealtime`, `applyRunEvent`, `catchUp`: add the cursor, full-then-incremental runs read, cursor advance on run events, reset in the closer.
- `src/data/apply-run-change.ts` - `applyRunChange` stores `ev.new` whole (would keep `state` from the event); add the field picker and the new pure merge `applyChangedRuns`.
- `src/data/apply-run-change.test.ts` - unit tests for the reducer; add the merge and picker cases; drop `state: {}` from the fixture.
- `src/lib/active-runs.ts` - pure Active helpers; add `FAILED_RUN_WINDOW_DAYS`, `failedRunCutoff`, `isInActiveWindow`, `CATCH_UP_OVERLAP_MS`, `changedRunsSince`, `latestUpdatedAt`; `activeRunCounts` comment mentions running and failed.
- `src/lib/active-runs.test.ts` - unit tests for the window and cursor helpers; drop `state: {}` from the fixture.
- `src/types/adw.ts` - `Run` (line 33-48): remove `state`; update the header comment that says the row types mirror the tables column for column.
- `src/components/RunRow.test.ts`, `src/data/hydration.test.ts`, `src/lib/history-bookmark.test.ts` - `Run` fixtures with `state: {}` that stop typechecking once the field is gone.
- `src/data/active-runs-state.ts`, `src/data/active-runs-query.ts` - unchanged callers of `getActiveRuns`; their comments mention `fetched_at` as getActiveRuns's clock read; adjust wording only if it becomes wrong.
- `src/data/query-keys.ts` - the `activeRuns` key comment says "running and failed runs"; add "failed in the last 7 days".
- `src/lib/request-pacing.ts` - the coalesced runner the catch-up goes through (10 s cooldown, 1 s debounce); read to design the e2e timing, do not change.
- `e2e/fixtures.ts` - shared `test`, `expect`, `waitForLive`, `section`, `sectionRows`.
- `e2e/realtime_request_budget.spec.ts` - model for request counting, `page.routeWebSocket` and a forced reconnect; its runs ceiling (at most 2 in a steady minute) must keep passing.
- `node_modules/next/dist/docs/` - per the profile, read the `connection()` guide before touching the server read's clock.

### New Files

- `e2e/active_runs_narrow_reads.spec.ts` - the byte, row and "completed while disconnected" spec described under Test Coverage.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 0. Confirm nothing reads `Run.state`

- Run `git grep -nE "\.state\b|\bstate\b" -- src ':!*.test.ts'` and confirm every hit is a queue item's `state`, `useState`/`ConnectionStatus`/worker state, or analytics, never a `Run`'s. If a reader of `Run.state` turns up, stop and keep `state` out of the Active read only (a narrower type for the Active entry), and record that in the PR.
- Read `src/lib/request-pacing.ts` (`createCoalescedRunner`) to confirm the 10 s cooldown the e2e spec has to wait out.

### 1. Drop `state` from the type and the column list

- `src/types/adw.ts`: remove `state: Record<string, unknown>;` from `Run`. Update the file header and the `Run` doc so they say the row types mirror the columns the dashboard reads, and that `runs.state` (the toolkit's jsonb run state) is deliberately not read (issue #243).
- `src/data/index.ts`: remove `state` from `RUN_COLUMNS`. Keep its comment "exactly the fields of Run". This narrows the History read too (it shares the constant); History renders no `state`.
- Remove `state: {},` from the `Run` fixtures in `src/components/RunRow.test.ts`, `src/data/apply-run-change.test.ts`, `src/data/hydration.test.ts`, `src/lib/active-runs.test.ts` and `src/lib/history-bookmark.test.ts`.

### 2. Pure window and cursor helpers in `src/lib/active-runs.ts`

Add, all pure, no clock read (`new Date(ms)` on a parsed or passed value is not a clock read):

- `export const FAILED_RUN_WINDOW_DAYS = 7;` with a comment: a failed run can be resumed, so it stays in Active for 7 days after its last update; older ones leave the Active list.
- `export function failedRunCutoff(nowMs: number): string`: `new Date(nowMs - FAILED_RUN_WINDOW_DAYS * 86_400_000).toISOString()`.
- `export function isInActiveWindow(run: Pick<Run, "status" | "updated_at">, failedSince: string): boolean`: `running` is always in; `failed` is in when `Date.parse(run.updated_at) >= Date.parse(failedSince)`; every other status (completed, and any future status such as cancelled) is out. Parsed, not string-compared (Postgres and `toISOString` format the same instant differently).
- `export const CATCH_UP_OVERLAP_MS = 60_000;` with a comment: the overlap that covers writes committed slightly out of `updated_at` order.
- `export function changedRunsSince(cursor: string): string`: `new Date(Date.parse(cursor) - CATCH_UP_OVERLAP_MS).toISOString()`.
- `export function latestUpdatedAt(runs: readonly Pick<Run, "updated_at">[], seen: string | null): string | null`: the greatest `updated_at` among `seen` and the rows by `Date.parse`, returned verbatim (the original string), `seen` when no row is later, `null` only when both are empty.
- Update the file header comment ("every visible project's running and failed runs") to "running runs and failed runs from the last 7 days".

### 3. The windowed full read and the incremental read in `src/data/index.ts`

- Import `failedRunCutoff`, `changedRunsSince` from `@/lib/active-runs`.
- Add one private clock helper, the single argument-less clock-read site for both Active reads, for example:
  ```ts
  /** The one clock read of the Active reads: their fetched_at and the failed-run window's cutoff. */
  function activeReadClock(): { fetched_at: string; failed_since: string } {
    const now = Date.now();
    return { fetched_at: new Date(now).toISOString(), failed_since: failedRunCutoff(now) };
  }
  ```
  Comment why it is allowed: on the server it only runs inside `getActiveRuns`, which only runs inside `getActiveRunsState` after `connection()`; in the browser it runs in the `queryFn` on a cache miss and in the catch-up callback, never in render.
- Add a private `activeRunsFilter(failedSince: string): string` returning the PostgREST `or` filter `status.eq.running,and(status.eq.failed,updated_at.gte."<failedSince>")`, quoted like `historyOlderFilter` in `src/lib/history-bookmark.ts` (the timestamp holds `.` and `:`).
- `getActiveRuns()`: take `activeReadClock()` first, then `.select(RUN_COLUMNS).or(activeRunsFilter(failed_since)).order("updated_at", { ascending: false })`. Return `{ active, fetched_at }` (the `ActiveRuns` shape is unchanged). Update its doc comment: running plus failed in the last `FAILED_RUN_WINDOW_DAYS`, narrow columns, and that it is also the catch-up's first (full) read.
- Update the `ActiveRuns.active` doc: "status running, or failed with updated_at in the last 7 days, most recently updated first".
- Add and export:
  ```ts
  /** What the incremental catch-up read returns: every run changed since the cursor, any status. */
  export interface ChangedRuns {
    changed: Run[];
    failed_since: string;
    fetched_at: string;
  }
  export async function getChangedRuns(cursor: string): Promise<ChangedRuns>;
  ```
  It takes `activeReadClock()`, then `.from("runs").select(RUN_COLUMNS).gte("updated_at", changedRunsSince(cursor)).order("updated_at", { ascending: false })`, throws `runs: <message>` on error like `getActiveRuns`, and returns the rows cast to `Run[]` with the two stamps. Doc comment: browser only, called only by the catch-up after a full read set the cursor; any status, because a run that became completed must be seen to be removed; cannot see deleted runs (the next page load's full read drops them).
- Update the file header block ("Active (status running or failed ...)") with the window.

### 4. The field picker and the merge in `src/data/apply-run-change.ts`

- Add `export function toRun(row: Run): Run` that copies exactly the fields of `Run` (`project_id`, `adw_id`, `issue_number`, `issue_title`, `issue_class`, `branch_name`, `pr_number`, `phase`, `status`, `toolkit_version`, `started_at`, `updated_at`, `finished_at`). Comment: a Realtime event carries the whole row (including the `state` jsonb the dashboard does not read); only the screen fields enter the cache.
- `applyRunChange`: store `toRun(ev.new)` instead of `ev.new` on INSERT and UPDATE. No window check here (no clock in the event path): an UPDATE stamps `updated_at` through the database trigger, so a failed event is always fresh; the next catch-up prunes anything older.
- Add `export function applyChangedRuns(current: ActiveRuns, read: ChangedRuns): ActiveRuns`:
  - Start from `current.active` minus every failed run with `!isInActiveWindow(run, read.failed_since)` (aged out).
  - For each row of `read.changed` (in read order, newest first), keyed on `(project_id, adw_id)` with `isRun`: if `isInActiveWindow(row, read.failed_since)`, replace the row with the same key in place, or collect it as new; otherwise remove the row with that key (completed, cancelled, any non-live status, or a failure older than the window).
  - Prepend the new in-window rows in read order (newest first), matching `applyRunChange`'s INSERT.
  - A row present twice (the 60 s overlap re-reads rows the tab already holds) just replaces itself: no duplicate.
  - Return `{ active, fetched_at: read.fetched_at }`. Never mutate the input.
  - Doc comment in the file's style, including why a completed row must be read to be removed.
- Update the file header and `isActive` comment to mention the window.

### 5. Cursor and incremental catch-up in `src/data/realtime.ts`

- In `startRealtime`, hold the cursor in the closure: `const runsCursor: { seen: string | null } = { seen: null };` (or an equivalent small object passed by reference). Pass it to `catchUp(queryClient, runsCursor)` and to `applyRunEvent`.
- `catchUp` runs order stays: `getProjects()` first, then runs, then queues. The runs step:
  - `runsCursor.seen === null` (first catch-up, or every previous full read failed or returned no row): `const active = await getActiveRuns(); setQueryData(queryKeys.activeRuns, active); runsCursor.seen = latestUpdatedAt(active.active, null);`
  - otherwise: `const read = await getChangedRuns(runsCursor.seen);` then `setQueryData<ActiveRuns>(queryKeys.activeRuns, (current) => current ? applyChangedRuns(current, read) : current)`. If the entry is absent (nothing to merge into), fall back to `runsCursor.seen = null` so the next catch-up is a full read, rather than seeding a partial list. Then `runsCursor.seen = latestUpdatedAt(read.changed, runsCursor.seen)`.
  - The cursor is only advanced after its write succeeded; a thrown read leaves it as it was (same "cache left as it was" stance).
- `applyRunEvent`: after the writes, for INSERT and UPDATE, advance the cursor only when it is already set (`if (cursor.seen !== null) cursor.seen = latestUpdatedAt([ev.new], cursor.seen)`), so an event that lands before the first catch-up cannot turn that first catch-up incremental. Do it even when the event's project is not in the cached list? No: keep the existing early return; an event dropped for an unknown project does not advance the cursor (the overlap and the next full read cover it). State this in the comment.
- The closer sets `runsCursor.seen = null` after `catchUpRunner.cancel()`, so a restart begins with a full read, like a fresh page.
- Rewrite the `catchUp` doc comment: the first catch-up is a full windowed read because the served page can be old; later ones read changed rows since the cursor minus 60 s; the cursor is a server `updated_at`, never the client clock; queues stay full reads because deletions are invisible to an incremental read; a deleted run, or a project that turned private, stays until the next page load; the Cost paragraph (one `project_summaries` read, one `runs` read that is the windowed list the first time and only the changed rows afterwards, one `getQueue` per cached queue).
- Do not touch `createCoalescedRunner`, `realtimeBackoff`, the 2 s deferral or the status switch.

### 6. Unit tests (Vitest)

- `src/lib/active-runs.test.ts`:
  - `failedRunCutoff` returns exactly 7 days before the given milliseconds as ISO.
  - `isInActiveWindow`: running with an ancient `updated_at` is in; failed at the cutoff is in (inclusive); failed one millisecond before is out; failed with a `+00:00` offset and microseconds compares by instant; completed is out.
  - `changedRunsSince` subtracts 60 s; `latestUpdatedAt` picks the latest by instant, returns the original string, keeps `seen` when no row is later, returns null for empty input and null `seen`.
- `src/data/apply-run-change.test.ts`, new `describe("applyChangedRuns")`:
  - a new running run is prepended;
  - an updated running run is replaced in place (order kept);
  - a run that became completed is removed (and a non-live status like `"cancelled"` cast to `RunStatus` is removed too);
  - a changed failed run older than the window is removed, and an untouched failed run already in the entry that aged out is pruned;
  - a row the entry already holds unchanged (the overlap) leaves no duplicate and the same rows;
  - a completed row the entry never held changes nothing else;
  - `fetched_at` comes from the read; the input is not mutated.
- `src/data/apply-run-change.test.ts`, `applyRunChange`: an INSERT and an UPDATE whose `ev.new` carries an extra `state` key (cast through `as unknown as Run`) store a row without `state` (`expect(row).not.toHaveProperty("state")`).

### 7. E2E spec `e2e/active_runs_narrow_reads.spec.ts`

Model it on `e2e/realtime_request_budget.spec.ts`; import from `./fixtures`; never write to the database: every changed row is produced by `page.route` on the browser's `/rest/v1/runs` request, never by a write.

- Shared setup on `/projects`:
  - Record every `/rest/v1/runs` response with `page.on("response")`: URL, row count (`JSON.parse(await res.text()).length`) and body bytes (`(await res.body()).length`).
  - Capture the first `project_summaries` response to take a real visible `project_id`.
  - `page.route("**/rest/v1/runs?*", ...)`: for a request without `updated_at=gte.` (the full read), `route.fetch()`, append one synthetic run (`adw_id: "e2e243aa"`, `issue_title: "E2E 243 synthetic run"`, `status: "running"`, the captured project id, narrow fields only, `updated_at` equal to the greatest real `updated_at` in the body, or to the response's own `Date` header in ISO when the body is empty) and `route.fulfill({ response, json })`. For a request with `updated_at=gte.` (the incremental read), fetch, and when the test has flipped its `completeSynthetic` flag, append the same synthetic run with `status: "completed"` and a later `finished_at`/`updated_at`; fulfill.
  - `page.routeWebSocket(/\/realtime\//, ws => { ws.connectToServer(); keep the first ws handle })`.
- Test "the catch-up after a reconnect reads only changed rows, narrow":
  - Goto `/projects`, `waitForLive`, wait until the first browser `runs` response is recorded and the synthetic title is visible in Building now.
  - Assert that response's URL has no `updated_at=gte.` and its `select` has no `state`; every row has no `state` key; when it has rows, bytes per row are at most 800 (measured: about 500 narrow, about 1000 with `state`).
  - Wait out the coalesced runner's 10 s cooldown (`page.waitForTimeout(11_000)`, with a comment pointing at `createCoalescedRunner`, the same by-design timing as the budget spec), then close the first socket. Wait for `live` again and for a second `runs` response.
  - Assert the second response's URL carries `updated_at=gte.`, has no `or=` status filter, its `select` has no `state`, every row has no `state` key, and its body is strictly smaller than the first's (the first holds at least the synthetic row; the overlap returns only rows changed in the last minute).
- Test "a run that completes while the socket is closed is gone after the reconnect": same setup; after the synthetic row is visible and the cooldown has passed, set `completeSynthetic = true`, close the socket, wait for `live` and the incremental response, then `expect(section(page, "Building now").getByText("E2E 243 synthetic run")).toHaveCount(0)`.
- Give each test `test.setTimeout(90_000)`. Comment the spec header with issue #243 and why routed data is used (Protected: never write to the hosted database).

### 8. Negative probes (must not appear in the final diff)

- (a) Put `state` back in `RUN_COLUMNS` (and in `Run`), run `PORT=$PORT yarn test:e2e e2e/active_runs_narrow_reads.spec.ts`: the narrow-read test must fail on the `state` key or the bytes-per-row assertion. Save the failing output for the PR, then revert.
- (b) Make `applyChangedRuns` upsert every changed row regardless of status (skip the removal branch), rerun the spec: the "completes while the socket is closed" test must fail. Save the output, then revert.
- Confirm `git diff` shows neither probe.

### 9. Measure the server's Active read before and after

- In a dev run, log the server Active read's row count and `JSON.stringify(data).length` once (a temporary `console.log` in `getActiveRuns`, removed afterwards), on `origin/develop`'s column list and on the new one. Baseline measured while planning: 2 rows, 2035 bytes before, about 1001 bytes after dropping `state` (the windowed filter drops nothing today because the one failed run is from 2026-10-21). Paste both numbers in the PR. Remove the log.

### 10. Documentation

- `app_docs/realtime.md`:
  - "Catch-up on SUBSCRIBED": the first catch-up of a `startRealtime` is a full windowed read (`getActiveRuns`) because the served page can be old; it sets the runs cursor to the highest `updated_at` read; every run event advances it once set; later catch-ups call `getChangedRuns(cursor)` (`updated_at >= cursor - 60 s`, any status, narrow columns) and merge through `applyChangedRuns`; the cursor is always a server timestamp; the closer resets it. Queues stay full reads (deletions). A run deleted, or a project made private, while the tab is open stays until the next page load.
  - Rewrite the Cost paragraph accordingly (the runs read is the windowed narrow list the first time and only the rows changed in the last cursor interval afterwards; no `state`).
  - "Event to cache": `applyRunChange` stores only the `Run` fields (`toRun`), never the `state` the event carries; no window check in the event path.
  - Rules: add "the incremental catch-up never compares the client clock with `updated_at`: its since value comes from the cursor"; "do not seed the Active entry from an incremental read"; keep the existing rules about the runner and `setQueryData`.
  - Add this spec to its Specifications list.
- `app_docs/active-runs.md`: Overview and the rule "Active means status `running` or `failed`" become "every `running` run and `failed` runs whose `updated_at` is within `FAILED_RUN_WINDOW_DAYS` (7) days (`src/lib/active-runs.ts`); older failed runs leave the Active list and the sidebar's failed count. History still means `completed` only: an older failed run is not shown on the project page at all (the Daily log still counts it)." Keep "Do not move failed runs into History". Name the helpers added to `src/lib/active-runs.ts` and their tests. Add this spec to Specifications.
- `app_docs/project-page.md`: the Active paragraph gets the 7-day window.
- `app_docs/data-boundary.md`: the `RUN_COLUMNS` listing loses `state`; describe the windowed `or` filter, `getChangedRuns` and `ChangedRuns`.
- `app_docs/types.md`: `Run` mirrors the `runs` columns the dashboard reads; `state` is not read (issue #243). Rewrite the "column for column" rule to state that exception.
- `app_docs/clock-and-prerender.md`: the first of the three clock-read sites becomes `activeReadClock()` in `src/data/index.ts`, shared by `getActiveRuns` (its `fetched_at` and the window cutoff) and `getChangedRuns`; same placement guarantees; still "Do not add a fourth".
- `docs/conditional-docs.md`: the `active-runs.md` line adds "the failed-run window"; the `realtime.md` line adds "the runs cursor or the incremental catch-up".
- No em-dashes in any of it.

### 11. Run the Validation Commands

- Run every command below from the worktree root and fix anything that fails without weakening a rule, type or test.

## Test Coverage

- **Unit (Vitest, `src/lib/active-runs.test.ts`)**: `failedRunCutoff`, `isInActiveWindow`, `changedRunsSince`, `latestUpdatedAt`. Catches a wrong window length, an exclusive or string-compared cutoff, or a cursor that moves backwards; none of these exist today.
- **Unit (Vitest, `src/data/apply-run-change.test.ts`)**: `applyChangedRuns` (new, updated in place, completed removed, non-live status removed, failed older than 7 days removed, aged-out entry row pruned, overlap duplicate harmless, input not mutated) and `applyRunChange` storing no `state` from an event. Catches a merge that ignores status changes or duplicates rows, and an event path that puts the jsonb back in the cache.
- **E2E (Playwright, `e2e/active_runs_narrow_reads.spec.ts`)**: the reconnect catch-up's `runs` request carries `updated_at=gte.`, returns no `state`, and is smaller than the first read; a run completed while the socket was closed disappears from Building now after the reconnect. Catches a regression to full reads on every reconnect, `state` returning to the select (probe a), and a merge that ignores status (probe b), none of which any existing spec observes.
- Existing `e2e/realtime_request_budget.spec.ts` must still pass unchanged (runs at most twice in a steady minute).

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn format:check` - Prettier over the changed files.
- `yarn lint` - ESLint, including `react-hooks/purity` (no clock in render).
- `yarn typecheck` - proves `Run` without `state` compiles everywhere, fixtures included.
- `yarn knip` - every new export (`toRun`, `applyChangedRuns`, `getChangedRuns`, `ChangedRuns`, the window helpers) is used.
- `yarn test` - the new and existing unit tests.
- `yarn build` - the server read with the new filter works at build and prerender time without a clock read in a prerender pass.
- `yarn check:og` - the post metadata check the profile runs after a build.
- `PORT=$(grep '^PORT=' .ports.env | cut -d= -f2) yarn test:e2e` - the whole suite, including the new spec and the request budget spec, against the `/prepare_app` server on this run's port (never `CI=1`).
- `grep -rnP "\x{2014}" src e2e app_docs docs specs/issue-243-adw-e2976ef7-sdlc_planner-narrow-active-runs-reads.md` - prints nothing (no em-dashes).
- `git grep -n "state" -- src/data/index.ts src/types/adw.ts` - shows no `state` in `RUN_COLUMNS` or `Run` (only comments explaining why it is not read, and queue `state`).

## Notes

- **Clock sites.** The issue requires the cutoff to be computed "where clock reads are already allowed"; `app_docs/clock-and-prerender.md` also forbids a fourth argument-less clock site. Folding `getActiveRuns`'s `fetched_at` read and the cutoff into one `activeReadClock()` helper used by both Active reads keeps the count at three. The 7-day cutoff uses the reader's clock (server after `connection()`, browser in the catch-up callback), which the issue explicitly allows; only the incremental "since" must be, and is, a server timestamp.
- **Cursor source.** The issue suggests seeding the cursor from the dehydrated state. It is not needed: the first catch-up is always a full read (issue step 3) and sets the cursor from its own rows, so the hydrated entry would only be overwritten. An empty Active list leaves the cursor null and the next catch-up does another full read, which is then tiny.
- **Not "History/Log views that already show them".** History is `completed` only (`app_docs/active-runs.md`, `app_docs/project-page.md`), so a failed run older than 7 days is no longer listed anywhere on the project page; the Daily log still counts it. Say this in the PR so the reviewer expects it; changing History is out of scope.
- **Known gaps, documented, not fixed:** an incremental read cannot see a deleted run or a project made private while the tab is open; both correct on the next page load. An older failed run (outside the window) that completes yields `oldStatus` undefined, so the sidebar's completed count is corrected only at the next catch-up's `getProjects`, the existing stance.
- `ev.old.status` is still read for `runStatusIn`; unchanged.
- The publishable key is read-only by RLS; the e2e spec fakes changed rows through `page.route`, never a database write (Protected).
- Commit with `chore:`; no trailers; never stage `.ports.env`, `.env*` or `next-env.d.ts`.
