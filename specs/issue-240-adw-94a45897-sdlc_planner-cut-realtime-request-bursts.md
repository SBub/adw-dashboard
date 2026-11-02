# Chore: Cut Realtime and REST request bursts per page load (deferred channel, backoff, debounced catch-up)

## Metadata

issue_number: `240`
adw_id: `94a45897`
issue_json: `{"number":240,"title":"Cut Realtime and REST request bursts per page load (deferred channel, backoff, debounced catch-up)"}`

## Chore Description

Supabase edge logs on 2026-10-27 show a handful of IPs making 300 to 800 requests each in 60 to 90 s
(hundreds of websocket opens plus hundreds of `project_summaries`, `runs` and `workers` reads). The
pattern matches a crawler doing about 100 full page loads a minute across the dashboard URLs. Each full
load is expensive, and two of the causes also hurt real visitors:

1. `Providers` (`src/app/providers.tsx`) calls `startRealtime` on mount, and the first `SUBSCRIBED`
   runs `catchUp`, so even a one-second visit costs a socket and three to N reads.
2. `catchUp` runs on every `SUBSCRIBED`, with no debounce, and realtime-js's reconnect backoff
   (`[1000, 2000, 5000, 10000]`, `RECONNECT_INTERVALS` in
   `node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js`) resets its try counter on every
   successful open (`reconnectTimer.reset()` in `onConnOpen`, `node_modules/@supabase/phoenix`). A
   socket that opens then drops reconnects every ~4 s forever, with a full catch-up each time.
3. `WorkerStatus`'s `onVisibility` polls `getWorkers` on every `visibilitychange`, unthrottled.

The fix:

1. **Defer the channel**: open it only after the page has been visible for 2 s (and, if it never
   opened, again 2 s after it becomes visible). Hidden before the 2 s elapse: the timer is cleared.
   Client navigation inside `(dashboard)` keeps the one channel (Providers stays mounted).
2. **Backoff that does not reset on a short connection**: `realtime.reconnectAfterMs` in
   `getSupabase()`, growing delay with jitter, capped at 30 s; the attempt counter resets only after the
   channel has stayed `SUBSCRIBED` for 60 s.
3. **Coalesced catch-up**: `SUBSCRIBED` callbacks within 1 s give one catch-up; never two at once; skip
   a catch-up requested less than 10 s after the previous one finished. The first `SUBSCRIBED` still
   catches up.
4. **Throttled worker poll on visibility**: a `visibilitychange` to visible polls only if no poll
   started in the last 10 s. The 30 s interval stays.
5. Docs: `app_docs/realtime.md`, `app_docs/clock-and-prerender.md`, `app_docs/data-boundary.md`.

Key design decision: **every new time rule is built from `setTimeout`/`clearTimeout` only, with no
`Date.now()`, `performance.now()` or `new Date()`**. "Stayed up 60 s", "finished less than 10 s ago" and
"last poll started at least 10 s ago" are each a timer that flips a flag. This keeps the "exactly three
argument-less clock reads ... Do not add a fourth" invariant in `app_docs/clock-and-prerender.md`
untouched, keeps the helpers pure enough to test with Vitest fake timers, and satisfies the issue's "no
clock read in render or a hook body" constraint trivially.

Constraints carried from the issue (all binding): live events still reach the cache through the
unchanged reducers; the pill is still written only through `setConnectionStatus` from the channel status
callback and shows `connecting` during the deferral; `waitForLive` (15 s) passes in every spec; no schema
change, no new env variable, no new Realtime table; `getSupabase()` stays the one `createClient`; no
Realtime on `/`, `/writing`, `/hire`; no em-dashes; Conventional commits without trailers.

## Relevant Files

Use these files to resolve the chore:

- `README.md`, `AGENTS.md`: repository rules (Yarn only, no em-dashes, docs layout, invariants).
- `.adw/project.md`: profile; Tests section gives the validation commands, Ports section the `PORT`
  from `.ports.env`. No profile change is needed (no script, port, env file or docs location changes).
- `docs/conditional-docs.md`: index; the matching lines are realtime, clock-and-prerender, data-boundary,
  screens-and-components (worker widget) and analytics (Realtime connection events). Its lines need no
  edit (no doc is added or removed).
- `app_docs/realtime.md`: the channel, "Catch-up on SUBSCRIBED" section, its cost paragraph, the
  strict-mode note and the Rules ("The catch-up read runs on every `SUBSCRIBED` ... one path, no flag"
  is an invariant this change rewrites, so the rule changes in the same commit).
- `app_docs/clock-and-prerender.md`: the worker store's poll (section "The worker store's clock read")
  and the three-clock-reads rule this change must not break.
- `app_docs/data-boundary.md`: "The client" section and the `getSupabase` rule; gains the
  `realtime.reconnectAfterMs` option.
- `app_docs/analytics.md`: `realtime_connected` / `realtime_disconnected`; read to confirm the tracker
  still sees every state (it does: `onStatus` is unchanged). Add one sentence that a visit shorter than
  2 s now sends no Realtime event, if that doc describes when the first event fires.
- `app_docs/screens-and-components.md`: worker status widget description; update if it states the
  visibility poll.
- `src/app/providers.tsx`: the `useEffect` that calls `startRealtime`; gets the visibility deferral.
- `src/data/realtime.ts`: `startRealtime` subscribe callback and `catchUp`; gets the coalesced runner
  and the backoff up/down signals.
- `src/data/supabase.ts`: `getSupabase()`, the one `createClient`; gets `realtime.reconnectAfterMs`.
- `src/components/WorkerStatus.tsx`: the worker store (`poll`, `onVisibility`, `subscribe`); gets the
  10 s visibility gate.
- `src/components/ConnectionIndicator.tsx`: `setConnectionStatus`, read only (no change; its initial
  state is already `Connecting`, which is what the deferral shows).
- `src/lib/analytics.ts`: `createRealtimeTracker`, read only.
- `node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js` (lines ~16 and ~661) and
  `node_modules/@supabase/phoenix/priv/static/phoenix.cjs.js` (`Timer`, ~line 216): how
  `reconnectAfterMs(tries)` is called and why `tries` restarts at 1 after every open (so the new
  function ignores `tries` and keeps its own counter).
- `e2e/fixtures.ts`: `test`, `expect`, `waitForLive`, `sidebarProjectLinks`; the new spec imports from
  here only.
- `e2e/connection_indicator_scope.spec.ts`, `e2e/worker_status_widget.spec.ts`: existing specs that
  must still pass; the model for the new spec's style.
- `vitest.config.ts`: unit tests are `src/**/*.test.ts`, node environment.
- `knip.json`: every new export must be used (tests count as usage).
- `playwright.config.ts`: two local workers, 30 s default timeout; the new spec sets its own timeouts.

### New Files

- `src/lib/request-pacing.ts`: clock-free, timer-based helpers, no React, no Supabase, no `document`
  global (a document-like object is passed in):
  - `createReconnectBackoff(options?)` returning `{ next(): number; up(): void; down(): void }`.
  - `createCoalescedRunner(run, options?)` returning `{ request(): void; cancel(): void }`.
  - `createCooldownGate(ms)` returning `{ tryPass(): boolean; arm(): void; reset(): void }`.
  - `deferWhileVisible(doc, delayMs, start)` returning a stop function.
- `src/lib/request-pacing.test.ts`: Vitest, fake timers, covering all four.
- `e2e/realtime_request_budget.spec.ts`: the request budget spec (five scenarios from the issue).

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read before coding

- Read `app_docs/realtime.md`, `app_docs/clock-and-prerender.md`, `app_docs/data-boundary.md`,
  `app_docs/analytics.md` (Realtime events part) and the worker widget part of
  `app_docs/screens-and-components.md` in full, including their Rules.
- Read the Realtime and client-component guides under `node_modules/next/dist/docs/` that the profile
  points at for anything about caching or Realtime (nothing here touches caching; confirm).
- Read `reconnectAfterMs` handling in `RealtimeClient.js` and the phoenix `Timer` class to confirm
  `reconnectAfterMs` is called as `timerCalc(tries + 1)` and `tries` resets on open.

### 2. Add `src/lib/request-pacing.ts`

Header comment: why these exist (issue #240, the crawler and the reconnect loop) and that the module
reads no clock: every duration is a `setTimeout`, so the codebase's three clock sites stay three.

- `createReconnectBackoff({ baseMs = 2_000, capMs = 30_000, stableMs = 60_000, random = Math.random } = {})`:
  - Internal `attempts = 0` and a `stableTimer`.
  - `next()`: `attempts += 1`; returns
    `Math.min(capMs, Math.round(Math.min(capMs, baseMs * 2 ** (attempts - 1)) * (1 + 0.25 * random())))`.
    So 2, 4, 8, 16, 30, 30 ... s, each up to 25% longer, never above 30 s. It ignores the `tries`
    argument realtime-js passes (that counter resets on every open, which is the bug).
  - `up()`: clears any pending stable timer and starts one for `stableMs` that sets `attempts = 0`.
  - `down()`: clears the stable timer (attempts keep growing).
  - Why these numbers (put in a comment): with a socket that drops 3 s after each open, opens fall at
    about 2, 7, 14, 25, 44 s and then every 33 s, so at most 5 or 6 sockets in the first minute instead
    of 15.
- `createCoalescedRunner(run: () => Promise<void>, { debounceMs = 1_000, cooldownMs = 10_000 } = {})`:
  - `request()`: if a debounce timer is pending, do nothing (coalesce); else start one for `debounceMs`.
  - When the debounce timer fires: if a run is in flight, or the cooldown flag is set, skip; else set
    in flight, `await run()` in a `try/finally`, clear in flight, set the cooldown flag and start a
    `cooldownMs` timer that clears it.
  - `cancel()`: clears the debounce and cooldown timers and resets the flags (used by the closer, so a
    restarted channel begins like a fresh page and its first `SUBSCRIBED` catches up).
  - `run` must not throw out (catchUp already swallows); still guard with `try/finally` so the in-flight
    flag always clears.
- `createCooldownGate(ms)`:
  - `arm()`: sets the closed flag and (re)starts a `ms` timer that clears it.
  - `tryPass()`: returns `false` while closed; otherwise arms and returns `true`.
  - `reset()`: clears the timer and the flag.
- `deferWhileVisible(doc, delayMs, start)` where
  `doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">` and
  `start: () => () => void`:
  - If `doc.visibilityState === "visible"`, start a `delayMs` timer.
  - Listen to `visibilitychange`: hidden clears a pending timer; visible starts one if none is pending
    and `start` has not run.
  - When the timer fires: call `start()` once, keep its closer, remove the listener (the channel, once
    open, stays open while hidden, as today).
  - Returned stop: clears the timer, removes the listener, calls the closer if `start` ran.

### 3. Add `src/lib/request-pacing.test.ts`

Vitest with `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` in `afterEach`. Cases:

- Backoff, `random: () => 0`: `next()` five times gives `2000, 4000, 8000, 16000, 30000`, then
  `30000`; with `random: () => 1` every value is at most 30000 and the first is 2500.
- Backoff: `up()`, advance 59 s, `down()`, `next()` continues the sequence (no reset); `up()`, advance
  60 s, `next()` is back to 2000.
- Runner: three `request()` calls at 0, 400, 900 ms, advance timers and flush promises: `run` called
  once.
- Runner: after a run finishes, `request()` 5 s later, advance 2 s: `run` not called again; a
  `request()` 11 s after the finish runs it.
- Runner: a `run` that is still pending when a second debounce fires is not called twice.
- Runner: `cancel()` then `request()` right after a finished run: runs (cooldown cleared).
- Gate: ten `tryPass()` calls 1 s apart (all inside 10 s) give exactly one `true`; after 10 s the next
  is `true`; `arm()` closes it for 10 s. Name this case for what it guards: "the worker store polls
  once for ten visibility flips inside 10 s" (the store's `onVisibility` is `gate.tryPass()`).
- Defer: a fake document (an `EventTarget` with a mutable `visibilityState`): visible, advance 1.9 s:
  `start` not called; advance to 2 s: called once. Hidden at 1 s: never called; then visible: called
  2 s later. The stop function before 2 s: never called; after: the closer is called once.

### 4. Backoff in `getSupabase()` (`src/data/supabase.ts`)

- Create one module-level `realtimeBackoff = createReconnectBackoff()` and export it (realtime.ts reads
  it; it is not a second client).
- Add `realtime: { reconnectAfterMs: () => realtimeBackoff.next() }` to the `createClient` options,
  for the browser branch only is fine but both is harmless; keep `db` and the server `global.fetch`
  exactly as they are. Still the one `createClient` call.
- Extend the doc comment: why the default backoff is replaced (reset on every open) and that the
  counter resets only after 60 s `SUBSCRIBED`, signalled from `realtime.ts`.

### 5. Coalesced catch-up and backoff signals in `src/data/realtime.ts`

- Inside `startRealtime`, create `const catchUpRunner = createCoalescedRunner(() => catchUp(queryClient))`.
- In the subscribe callback: `SUBSCRIBED` sets `Live` (unchanged), calls `realtimeBackoff.up()` and
  `catchUpRunner.request()` (replaces `void catchUp(queryClient)`). `CHANNEL_ERROR` and `TIMED_OUT`
  set `Reconnecting` and call `realtimeBackoff.down()`; `CLOSED` sets `Connecting` and calls
  `realtimeBackoff.down()`. `setConnectionStatus` stays the only status writer; `onStatus` call
  unchanged.
- The closer also calls `catchUpRunner.cancel()` before removing the channel.
- Rewrite the `catchUp` doc comment: it now runs once per burst of `SUBSCRIBED` (1 s debounce), never
  concurrently, and is skipped within 10 s of the previous finish; the first `SUBSCRIBED` still
  catches up (the static shell can be 15 minutes old). Update the cost paragraph and drop the "strict
  mode runs it twice" line (the deferral now absorbs strict mode's mount, cleanup, mount).
- Reducers, `applyRunEvent`, `applyQueueEvent`, `cachedSlugs` and what `catchUp` reads: unchanged.

### 6. Deferred start in `src/app/providers.tsx`

- The effect becomes
  `deferWhileVisible(document, REALTIME_DEFER_MS, () => startRealtime(queryClient, { ... }))` with
  `const REALTIME_DEFER_MS = 2_000` at module scope; the options object (`onHistoryChange`,
  `onStatus`) is moved verbatim. The effect returns the stop function.
- Rewrite the effect comment: the channel opens once the page has been visible for 2 s (a visit or a
  crawler load shorter than that opens no socket and runs no catch-up); the pill shows `connecting`
  meanwhile (its initial state); in development strict mode's mount, cleanup, mount clears the first
  timer, so dev also connects once.
- Do not move Providers, do not mount it outside `(dashboard)`.

### 7. Visibility gate in `src/components/WorkerStatus.tsx`

- Module-level `const VISIBILITY_GAP_MS = 10_000` and `const visibilityGate = createCooldownGate(VISIBILITY_GAP_MS)`.
- Every poll start arms the gate (call `visibilityGate.arm()` at the top of `poll()` after the
  in-flight check), so the first poll and the 30 s interval also count as "the last poll".
- `onVisibility`: `if (document.visibilityState === "visible" && visibilityGate.tryPass()) void poll();`
  (`tryPass` arms too; the arm in `poll` is then a restart, harmless).
- On the last unsubscribe, `visibilityGate.reset()` so a remount polls at once.
- `Date.now()` stays where it is (the third clock read); add none.
- Update the file's header comment ("once more whenever the tab becomes visible" becomes "when the tab
  becomes visible, unless a poll started in the last 10 s").

### 8. New spec `e2e/realtime_request_budget.spec.ts`

Import only from `./fixtures` (`test`, `expect`, `waitForLive`, `sidebarProjectLinks`, `type Page`).
A helper `countRequests(page)` attached before `page.goto`: `page.on("websocket", ws => ...)` counts
URLs containing `/realtime/`; `page.on("request", req => ...)` counts by `new URL(req.url()).pathname`
for paths starting `/rest/v1/` (keyed `project_summaries`, `runs`, `workers`, `queue_items`). Each test
calls `test.setTimeout(...)` to fit its duration plus 60 s. Use `page.waitForTimeout` for the fixed
observation windows (this spec measures over time by design; comment why).

1. Steady: `goto("/projects")`, `waitForLive`, wait until 60 s since `goto`; expect 1 socket,
   `project_summaries <= 2`, `runs <= 2`, `workers <= 4` (strict mode polls twice on mount under `next dev`), pill still `live`.
2. Drops: before `goto`, `page.routeWebSocket(/\/realtime\//, ws => { const server = ws.connectToServer(); setTimeout(() => ws.close(), 3_000); })`
   (forward messages both ways is the default once `connectToServer` is called; confirm against the
   installed `@playwright/test` docs); `goto("/projects")`, wait 60 s; expect sockets `<= 6` and
   `project_summaries <= 6`.
3. Visibility: `goto("/projects")`, then every 500 ms for 30 s
   `page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")))` (headless Chromium
   reports `visible`); expect `workers <= 4` counted from `goto`.
4. Short visits: from `/projects`, read up to 20 `sidebarProjectLinks` hrefs (cycle through them if
   fewer than 20, adding `/projects` and `/projects/log` to the pool); for each, `page.goto(href)` and
   wait 1 s; expect total sockets `<= 2` across all 20 loads.
5. Live event still lands: `goto("/projects")`, `waitForLive`, expect exactly one socket and at least
   one `project_summaries` read after the socket opened (the first catch-up ran). The existing live
   specs (`connection_indicator_scope`, `worker_status_widget`, and every spec calling `waitForLive`)
   cover the rest and must pass unchanged in the full suite.

Comment at the top: what the spec guards (issue #240's budget), and that the numbers are ceilings with
headroom over the steady case, not exact counts.

### 9. Negative check (evidence for the pull request)

- Run `PORT=$PORT yarn test:e2e e2e/realtime_request_budget.spec.ts` with the fix: all pass. Save the
  output.
- Put the fix aside with a temporary WIP commit, never a bare `git stash` (the stash stack is shared
  across worktrees): `git add -A && git commit -m "wip: issue 240"` (hooks run; they pass by now).
- Restore the old app code only: `git checkout 9c6455b -- src/app/providers.tsx src/data/realtime.ts src/data/supabase.ts src/components/WorkerStatus.tsx`
  (the new `src/lib/request-pacing*.ts` can stay, nothing old imports them; the spec stays). Run
  `PORT=$PORT yarn test:e2e e2e/realtime_request_budget.spec.ts`: scenarios 2, 3 and 4 must fail with
  numbers near 15 sockets / 15 reads, about 30 `workers`, and 20 sockets. Save the output.
- Restore the fix with `git checkout HEAD -- src`, confirm `git status` is clean, then
  `git reset --soft HEAD~1` to drop the WIP commit. Both outputs go into the pull request body.

### 10. Documentation

- `app_docs/realtime.md`:
  - Overview and "The channel": the channel is opened from `Providers` 2 s after the page is visible
    (via `deferWhileVisible` in `src/lib/request-pacing.ts`); replace the strict-mode paragraph.
  - "Catch-up on SUBSCRIBED": now coalesced (1 s), never concurrent, skipped within 10 s of the last
    finish; the first `SUBSCRIBED` still catches up. New cost paragraph: one catch-up per page that
    stays at least 2 s, plus at most one per reconnect burst; reconnects follow
    `createReconnectBackoff` (2, 4, 8, 16, 30 s, +25% jitter, reset after 60 s up), with the measured
    before and after numbers from the spec.
  - New short subsection "Request budget" pointing at `e2e/realtime_request_budget.spec.ts`.
  - Rules: rewrite the catch-up rule ("runs on every `SUBSCRIBED`") to "is requested on every
    `SUBSCRIBED` through the coalesced runner; do not call `catchUp` directly from the callback, do not
    drop the debounce or the cooldown"; add: "Do not start the channel before the 2 s visibility
    deferral, and do not replace `reconnectAfterMs` with one that resets on open"; add: "The pacing
    helpers read no clock; durations are timers."
  - Add this spec to the Specifications list.
- `app_docs/clock-and-prerender.md`: in "The worker store's clock read", say the visibility poll is
  gated by a 10 s timer (`createCooldownGate`), with no extra clock read; in the Rules, after "Do not add
  a fourth", add one clause that the request pacing helpers in `src/lib/request-pacing.ts` are
  timer-based and read no clock. Add this spec to the Specifications list.
- `app_docs/data-boundary.md`: "The client" gains the `realtime.reconnectAfterMs` option and why; the
  `getSupabase` rule still says one `createClient`. Add this spec to the Specifications list.
- `app_docs/screens-and-components.md` and `app_docs/analytics.md`: update only the sentences that
  state the visibility poll or when the first Realtime event fires.
- `docs/conditional-docs.md`: if the realtime line does not mention the reconnect backoff or the
  deferral, append "the reconnect backoff or the channel's start delay" to its "read when" list.

### 11. Validate

- Run every command in `Validation Commands`, then
  `grep -rnP "\x{2014}" src e2e app_docs` (must print nothing).

## Test Coverage

- Unit (`src/lib/request-pacing.test.ts`, Vitest, fake timers): the backoff grows, caps at 30 s and
  resets only after 60 s up; three `SUBSCRIBED` within 1 s run one catch-up; a request 5 s after a
  finished catch-up runs none; ten visibility flips inside 10 s pass the worker gate once; the deferral
  starts nothing before 2 s visible. Nothing tests pacing today; each case fails on the current code
  (the functions do not exist, and realtime-js's own backoff resets on open).
- E2E (`e2e/realtime_request_budget.spec.ts`, Playwright, chromium): the request budget per scenario
  (steady, drops, visibility flips, 20 short visits, live still reached). It catches a regression in the
  wiring (the helpers not used, the deferral bypassed), which the unit layer cannot see. Scenarios 2, 3
  and 4 fail against the current code (shown by the negative check in step 9).

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint`: ESLint, including react-hooks purity (no clock in render).
- `yarn typecheck`: `next typegen` then `tsc --noEmit`; the new options type-check against
  `createClient`'s `realtime` options. Never stage the rewritten `next-env.d.ts`.
- `yarn knip`: every new export (`realtimeBackoff`, the four helpers) is used.
- `yarn format:check`: Prettier on the new and changed files.
- `yarn test`: Vitest, including `src/lib/request-pacing.test.ts`.
- `yarn build`: the production build still prerenders the dashboard shell (Providers' effect is
  browser-only).
- `yarn check:og`: post metadata check after the build, unchanged but part of the profile's order.
- `PORT=$PORT yarn test:e2e e2e/realtime_request_budget.spec.ts`: the new budget spec (source `PORT`
  from `.ports.env`; fall back to 3000 only if it is absent).
- `PORT=$PORT yarn test:e2e`: the whole suite, including `connection_indicator_scope` and
  `worker_status_widget`, still passes with the 2 s deferral.
- `grep -rnP "\x{2014}" src e2e app_docs`: no em-dashes; prints nothing.

## Notes

- No new dependency, no env variable, no schema change, no profile change.
- Server side: `getSupabase()` on the server never subscribes a channel, so `reconnectAfterMs` is
  inert there; the shared module-level `realtimeBackoff` is harmless.
- `reconnectAfterMs` replaces the socket's reconnect delay only. The channel's own `rejoinAfterMs` is
  left at its default: on a socket drop the channel rejoins when the socket reopens, so the socket
  backoff paces both.
- The catch-up skip window means events missed by a reconnect less than 10 s after the previous
  catch-up are recovered at the next catch-up or event, the same "next event corrects it" stance the
  doc already takes for in-flight reads. Say this in `app_docs/realtime.md`.
- `waitForLive` has 15 s; the deferral adds 2 s to time-to-live, well inside it.
- Scenario 3 dispatches synthetic `visibilitychange` events; the gate is what limits them, not the
  real visibility state.
- Blocking the crawler (Vercel firewall, `robots.txt`) and Supabase settings are out of scope.
- Commit: `fix: cut realtime and rest request bursts per page load`, no trailers. Paste the step 9
  outputs (with and without the fix) into the pull request body.
- Review: a reviewer opening `/projects` should see the pill read `connecting` for about 2 s, then
  `live`; the worker widget unchanged.

## Negative check results

Step 9, run on 2026-10-27 against the `/prepare_app` dev server on this run's port, with
`PORT=$PORT yarn test:e2e e2e/realtime_request_budget.spec.ts --reporter=list`. The "without fix"
run put the branch aside in a temporary WIP commit, restored `src/app/providers.tsx`,
`src/data/realtime.ts`, `src/data/supabase.ts` and `src/components/WorkerStatus.tsx` from
`9c6455b`, then restored the fix with `git checkout HEAD -- src` and `git reset --soft HEAD~1`.

| Scenario                                           | Assertion that decides it            | With fix | Without fix          |
| -------------------------------------------------- | ------------------------------------ | -------- | -------------------- |
| 1. one socket and a few reads in a steady minute   | sockets `1`, `workers` at most 4     | pass     | pass (informational) |
| 2. a socket that drops every 3 s backs off         | sockets at most 6                    | pass     | fail, received 15    |
| 3. visibility flips poll the worker table ...      | `workers` at most 5                  | pass     | fail, received 61    |
| 4. twenty one-second visits open almost no sockets | sockets at most 2                    | pass     | fail, received 21    |
| 5. the channel still goes live and catches up once | one socket, a catch-up read after it | pass     | pass (informational) |

Scenarios 2, 3 and 4 fail on the old code, as Test Coverage requires. Scenario 3 fails its
loosened ceiling of 5 by a wide margin (61), so the ceiling stays. Scenario 1 passes on both, as
expected: its ceilings guard against a regression in the steady state, not the burst.

Raw outputs (gitignored, not committed): `agents/94a45897/negative_check/with-fix.txt` and
`agents/94a45897/negative_check/without-fix.txt`.
