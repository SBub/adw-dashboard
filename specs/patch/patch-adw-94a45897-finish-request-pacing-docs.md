# Patch: Finish step 10, document the request pacing in the feature docs

## Metadata

adw_id: `94a45897`
review_change_request: `Issue #1: Step 10 (Documentation) is largely not implemented. app_docs/realtime.md overview, "The channel" and the "Catch-up on SUBSCRIBED" cost paragraph still describe catch-up on every SUBSCRIBED, the strict-mode reconnect and per (re)connect cost; the coalescing, cooldown, backoff, 10 s skip-window note, "Request budget" subsection and Specifications entry are missing. app_docs/clock-and-prerender.md, app_docs/data-boundary.md and docs/conditional-docs.md are unchanged. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-240-adw-94a45897-sdlc_planner-cut-realtime-request-bursts.md`
**Issue:** The code now defers the `adw` channel 2 s after the page is visible (`deferWhileVisible`), coalesces the catch-up (`createCoalescedRunner`: 1 s debounce, no concurrent runs, 10 s cooldown), paces socket reconnects with `createReconnectBackoff` through `realtime.reconnectAfterMs` in `getSupabase()`, and gates the worker widget's visibility poll with a 10 s `createCooldownGate`. Only the Rules bullets of `app_docs/realtime.md` say so; the rest of that doc contradicts the code, and the other three docs named in step 10 have no change.
**Solution:** Docs only. Rewrite the three stale passages in `app_docs/realtime.md` and add the missing description, skip-window note, "Request budget" subsection and Specifications entry; add the cooldown gate, the no-clock clause and the spec to `app_docs/clock-and-prerender.md`; document `realtime.reconnectAfterMs` in `app_docs/data-boundary.md`; extend the realtime line in `docs/conditional-docs.md`. No code change, no em-dashes.

## Files to Modify

Use these files to implement the patch:

- `app_docs/realtime.md`
- `app_docs/clock-and-prerender.md`
- `app_docs/data-boundary.md`
- `docs/conditional-docs.md`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

Before editing, read `src/lib/request-pacing.ts`, `src/data/supabase.ts` (the `realtimeBackoff` comment), `src/data/realtime.ts`, `src/app/providers.tsx`, `src/components/WorkerStatus.tsx` and `e2e/realtime_request_budget.spec.ts`, so every number and name below matches the code. If a number in the code differs from this plan, the code wins and the doc states the code's value.

### Step 1: `app_docs/realtime.md`, overview and "The channel"

- Specifications list (top): append `- specs/issue-240-adw-94a45897-sdlc_planner-cut-realtime-request-bursts.md`.
- Overview (line 10): replace "the catch-up read on every `SUBSCRIBED`" with wording that says the channel is opened 2 s after the page is visible, and the catch-up is requested on every `SUBSCRIBED` through a coalesced runner, e.g. "opened by `startRealtime` in `src/data/realtime.ts` from `Providers` once the page has been visible for 2 s: the pure reducers that write each event into the query cache, the coalesced catch-up read requested on every `SUBSCRIBED`, the reconnect backoff, and the connection indicator."
- "The channel", the `src/app/providers.tsx` paragraph (around lines 75-82): say `Providers` starts it from a `useEffect` through `deferWhileVisible` (`src/lib/request-pacing.ts`): the channel opens only after the page has been visible for 2 s, a page hidden before then clears the timer, and a page that never opened it tries again 2 s after it becomes visible. The deferral's stop function is the effect's cleanup and calls the closer if the channel was opened. Keep the `onHistoryChange` sentence as is. Delete the sentence "In development React's strict mode runs mount, cleanup, mount, so the indicator shows one connect, close and reconnect; production connects once." and replace it with: strict mode's mount, cleanup, mount clears the first timer before it fires, so development opens the channel once, like production. Also note that the indicator reads `Connecting` for those first 2 s. Also update "`SUBSCRIBED` also runs the catch-up read (below)" to "`SUBSCRIBED` also requests the catch-up read (below)" and mention that the callback signals the backoff up on `SUBSCRIBED` and down on `CHANNEL_ERROR`, `TIMED_OUT` and `CLOSED`, if `realtime.ts` does so; state that the closer also cancels the catch-up runner.

### Step 2: `app_docs/realtime.md`, "Catch-up on SUBSCRIBED" and "Request budget"

- In the first paragraph, change "on **every** `SUBSCRIBED`, `realtime.ts` calls `getProjects()`" so the trigger is "on **every** `SUBSCRIBED`, `realtime.ts` requests a catch-up from `createCoalescedRunner` (`src/lib/request-pacing.ts`), which then calls `getProjects()` ...". Keep the read order and the `setQueryData` explanation unchanged.
- Add a paragraph before "Cost:" describing the runner: requests are coalesced with a 1 s debounce, so a burst of `SUBSCRIBED` runs one catch-up; a run never starts while one is in flight (a request during a run is held and runs once after it); a request less than 10 s after the previous run finished is skipped. The first `SUBSCRIBED` of a page always catches up. Skip-window note (required by the spec's Notes): events missed by a reconnect less than 10 s after the previous catch-up are recovered at the next catch-up or the next event for that row, the same "next event corrects it" stance as the in-flight case below.
- Add a paragraph on the reconnect backoff: the socket's reconnect delay comes from `createReconnectBackoff` (`realtimeBackoff` in `src/data/supabase.ts`, passed as `realtime.reconnectAfterMs`): 2, 4, 8, 16, then 30 s, each with up to +25% jitter, and the attempt counter resets only after the channel has stayed `SUBSCRIBED` for 60 s. realtime-js's own default resets on every open, so a socket that opens and drops kept reconnecting every few seconds with a full catch-up each time. Link to `data-boundary.md` "The client" for the option.
- Rewrite the "Cost:" paragraph: one `project_summaries` read, one `runs` read and one `getQueue` (two reads) per cached queue entry, once per page that stays visible at least 2 s, plus at most one per reconnect burst (coalesced and cooled down as above), with reconnects spaced by the backoff. Remove "per (re)connect" and the sentence "in development React's strict mode connects twice on mount, so it runs twice there." Keep the `console.warn` failure sentence and the in-flight event sentence.
- Add a `### Request budget` subsection directly after "Catch-up on SUBSCRIBED" (before "The indicator"): `e2e/realtime_request_budget.spec.ts` pins the budget in the browser: a page left visible opens one websocket and runs one catch-up; a page closed before 2 s opens none; a socket forced to drop every few seconds reconnects on the backoff schedule with far fewer catch-ups than reconnects; repeated `visibilitychange` events trigger at most one worker poll per 10 s. Describe only the scenarios the spec file actually asserts, with its actual limits.
- Leave the Rules section as already changed on this branch.

### Step 3: `app_docs/clock-and-prerender.md`

- Specifications list: append `- specs/issue-240-adw-94a45897-sdlc_planner-cut-realtime-request-bursts.md`.
- "The worker store's clock read": add a short paragraph: the poll that a page becoming visible triggers is gated by a 10 s `createCooldownGate` (`src/lib/request-pacing.ts`), armed at the start of every poll, so a burst of `visibilitychange` events starts at most one poll per 10 s. The gate is a timer and adds no clock read; the store still has exactly one, in `poll`.
- Rules, right after "Do not add a fourth.": add "The request pacing helpers in `src/lib/request-pacing.ts` (`createReconnectBackoff`, `createCoalescedRunner`, `createCooldownGate`, `deferWhileVisible`) are timer-based and read no clock; a duration there is a `setTimeout`, never a `Date.now()` difference."

### Step 4: `app_docs/data-boundary.md` and `docs/conditional-docs.md`

- `app_docs/data-boundary.md` Specifications list: append `- specs/issue-240-adw-94a45897-sdlc_planner-cut-realtime-request-bursts.md`.
- "The client" (line 285): add a paragraph: `createClient` is called with `realtime: { reconnectAfterMs: () => realtimeBackoff.next() }`. `realtimeBackoff` (exported from the same file, built by `createReconnectBackoff`) replaces realtime-js's default reconnect delay (1, 2, 5, 10 s), whose `tries` counter restarts after every successful open, so a socket that opens then drops reconnected every few seconds forever. The replacement keeps its own counter (2, 4, 8, 16, 30 s, up to +25% jitter), reset only after the channel has stayed `SUBSCRIBED` for 60 s, signalled from `src/data/realtime.ts`. Only the socket delay is replaced; the channel's `rejoinAfterMs` keeps its default and rejoins when the socket reopens. On the server no channel subscribes, so the option is inert there. It is still the one `createClient` call (the Rules bullet stays as is).
- `docs/conditional-docs.md` line 14: append ", the reconnect backoff or the channel's start delay" to the realtime "read when" list, before the final "; when a live update does not reach the screen." clause, e.g. "... the catch-up read or the connection pill, the reconnect backoff or the channel's start delay; when a live update does not reach the screen."

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `grep -nP "\x{2014}" app_docs/realtime.md app_docs/clock-and-prerender.md app_docs/data-boundary.md docs/conditional-docs.md`: prints nothing.
- `grep -n "strict mode\|per (re)connect\|catch-up read on every" app_docs/realtime.md`: none of the stale phrases remain.
- `grep -n "issue-240-adw-94a45897" app_docs/realtime.md app_docs/clock-and-prerender.md app_docs/data-boundary.md` lists all three files; `grep -n "createCooldownGate" app_docs/clock-and-prerender.md`, `grep -n "reconnectAfterMs" app_docs/data-boundary.md`, `grep -n "realtime_request_budget" app_docs/realtime.md` and `grep -n "start delay" docs/conditional-docs.md` each match.
- `yarn format:check` (Prettier on the edited Markdown; run `yarn format` if it fails).
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn test`: unchanged by a docs-only patch, run to keep the commit hooks green (never stage the rewritten `next-env.d.ts`).

## Patch Scope

**Lines of code to change:** about 60 to 80 lines of Markdown across four docs, no source code
**Risk level:** low
**Testing required:** none beyond the greps and the commit-hook checks; docs only, so no build or E2E rerun is needed
