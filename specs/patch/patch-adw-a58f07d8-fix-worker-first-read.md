# Patch: Apply the worker store's first read after a resubscribe

## Metadata

adw_id: `a58f07d8`
review_change_request: `Issue #1: The store throws away its first read, so the widget stays on "Worker status..." for about 30 s after every page load. React's subscribe, unsubscribe, subscribe cycle (StrictMode in dev, and any remount while a read is in flight) leaves the second subscribe's poll() blocked by the global inFlight flag, while the first poll drops its result because started !== generation. Nothing polls again until setInterval fires 30 s later. Resolution: make the in-flight guard belong to a generation (let inFlightGeneration: number | null = null), so a new subscription is never blocked by a poll from an old one, and keep the rule that a response landing after the last unsubscribe is dropped. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-158-adw-a58f07d8-sdlc_planner-worker-status-widget.md`
**Issue:** In `src/components/WorkerStatus.tsx` the `inFlight` guard is global. Under React's
subscribe, unsubscribe, subscribe cycle (StrictMode in `yarn dev`, or a remount during a read),
the first `poll()` sets `inFlight = true`, the unsubscribe bumps `generation`, the second
subscribe's `poll()` returns at once because `inFlight` is still true, and the first poll then
resolves, sees `started !== generation` and drops its rows. The widget stays on
"Worker status..." until the interval poll 30 s later, failing the acceptance criterion and
step 3 of `e2e/test_worker_status_widget.md` ("within 30 seconds").
**Solution:** Tie the in-flight guard to the generation that started the read. Replace
`let inFlight = false` with `let inFlightGeneration: number | null = null`. `poll()` returns early
only when `inFlightGeneration === generation`, sets `inFlightGeneration = generation` before the
await, and in `finally` clears it only if it still equals `started`. A poll from an old
generation then never blocks the new subscription's first read, and the existing
`started !== generation` check still drops any response landing after the last unsubscribe.

## Files to Modify

Use these files to implement the patch:

- `src/components/WorkerStatus.tsx`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Replace the global in-flight flag with a per-generation one

- In `src/components/WorkerStatus.tsx`, replace `let inFlight = false;` (line 42) with
  `let inFlightGeneration: number | null = null;`.
- Add a one-line comment above it in the file's style, for example:
  `// The generation whose read is in flight, so an old read never blocks a new subscriber's.`

### Step 2: Rewrite the guard in poll()

- Reorder the top of `poll()` to:
  ```ts
  async function poll() {
    if (inFlightGeneration === generation) return;
    const started = generation;
    inFlightGeneration = started;
    try {
  ```
- Leave the `try` body unchanged, including `if (started !== generation) return;` after
  `await getWorkers()` (that is the "dropped after the last unsubscribe" rule).
- Change the `finally` block from `inFlight = false;` to:
  ```ts
  } finally {
    if (inFlightGeneration === started) inFlightGeneration = null;
  }
  ```
- Do not touch `subscribe`, the unsubscribe, `generation`, `POLL_MS`, the clock read or the
  rendering. No doc change: no file under `app_docs/` mentions the in-flight guard, and the
  header comment's described behaviour (poll once on the first subscriber, every 30 s, on
  visibility, drop after the last unsubscribe) is unchanged.

### Step 3: Confirm in the running dev app

- Source `.ports.env` (fall back to 3000 only if absent) and start `yarn dev` (the profile allows
  ADW to start it). Open `http://localhost:$PORT/projects` with the Playwright MCP server and take
  `browser_snapshot` a few seconds after load: the widget must read `Worker online` or
  `Worker offline`, not `Worker status...`, well before 30 s. Check
  `/projects/SBub/issebya-homes-ai-system` the same way. Stop only the server this run started.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `yarn lint`
- `yarn typecheck` (do not stage the rewritten `next-env.d.ts`)
- `yarn knip`
- `yarn format:check`
- `yarn test`
- `yarn build`
- `grep -rn "Date.now()\|new Date()" src --include=*.ts --include=*.tsx`: still exactly three
  code sites (`src/data/index.ts`, `src/app/page.tsx`, `src/components/WorkerStatus.tsx`).
- Dev-server check from Step 3: on `/projects` a known state appears within a few seconds of load.

## Patch Scope

**Lines of code to change:** about 6
**Risk level:** low
**Testing required:** the profile's lint, typecheck, knip, format, unit and build checks, plus a
browser check against `yarn dev` (StrictMode) that the widget leaves `Worker status...` within a
few seconds on `/projects` and the project page.
