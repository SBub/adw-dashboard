# Patch: observe the five-minute router cache expiry on a production server

## Metadata

adw_id: `1d6a606b`
review_change_request: `Issue #1: Acceptance criterion 'After five minutes, a navigation to a project refetches its dynamic part' (issue #29, spec step 6) was not verified. The Playwright browser_wait_for(310s) returned after about 30 seconds (the page clock read 12:24:12 against a 12:23:36 start), and the structured-output deadline arrived before the background 290-second wait finished. So no navigation after the window was ever observed. The config value (300, under experimental.staleTimes, the documented field) and the Next docs suggest it behaves as described, but that is reading, not observation. Resolution: The code on this branch probably needs no change. The check needs to be re-run. On yarn build + PORT=$PORT yarn start, open /, click a project in the sidebar (A), click another (B), wait more than 300 seconds without a full page load, click A again, and confirm with browser_network_requests (filter projects.*_rsc) that a new ?_rsc= GET for A appears. Record the timestamps and the request line. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-29-adw-1d6a606b-sdlc_planner-extend-router-cache-dynamic-stale-time.md`
**Issue:** Spec step 6's third check (after five minutes, a navigation to a project refetches its dynamic part) was never observed. A single `browser_wait_for` with a 310 second time returns after about 30 seconds, so the second click on A happened inside the window and proved nothing about expiry.
**Solution:** No code change. `next.config.ts` already sets `experimental.staleTimes.dynamic: 300`, the field the installed `staleTimes.md` documents. Re-run the check on a production server with a wait that really exceeds 300 seconds: split it into short `browser_wait_for` calls (30 seconds or less each) and read the page clock through `browser_evaluate` before and after, so the elapsed time comes from a measurement, not from the requested wait. A marker on `window` proves that no full page load happened in between. Record the timestamps and the `?_rsc=` request line as evidence. If the request does not appear after a measured wait above 300 seconds, that is a real defect and goes back to review. Do not change the config value to make the check pass.

## Files to Modify

Use these files to implement the patch:

- None under `src/`, and no change to `next.config.ts`, `README.md` or `AGENTS.md`.
- Evidence only, not committed (`agents/` must never be staged): `agents/1d6a606b/patch_agent/router-cache-expiry.md`.

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Build and start the production server on this run's port

- `yarn build` from the worktree root (reads `.env.local`, which exists here). Confirm the route table still lists `/projects/[owner]/[repo]` as Partial Prerender.
- Source `.ports.env` (`PORT=9208`) and start `PORT=$PORT yarn start` in the background. Never `yarn dev` (its router cache does not match production) and never port 3000. Wait until `http://localhost:$PORT/` answers 200.

### Step 2: Set up the session without a full page load afterwards

- `browser_navigate` to `http://localhost:$PORT/`. This is the only full page load in the check.
- `browser_evaluate`: `() => { window.__noReload = "1d6a606b"; return new Date().toISOString(); }` and record the value as T0. The marker disappears on any full load, so finding it at the end proves the whole check ran as client navigations.
- `browser_snapshot`, pick the first two projects in the sidebar as A and B (use the sidebar's own links; if `/projects/SBub/issebya-homes-ai-system` is listed, it may be A).

### Step 3: Visit A, then B, then confirm the in-window control

- Click A in the sidebar. Wait for the History list (a `<code>` with an `adw_id`, or the empty state) to render. Record the time via `browser_evaluate(() => new Date().toISOString())` as T_A1.
- Click B, wait for its History, record T_B.
- Control (within the window): `browser_network_requests`, filter `projects.*_rsc`, note the count of `?_rsc=` GETs whose path is A's. Optional but useful: click A again right away and confirm no new `?_rsc=` GET for A appears and no "Loading history..." fallback shows, then click B again. This repeats the passing check from the review and ensures the later request is caused by expiry, not by a router cache that never holds anything.
- Note: after the optional control, A's cache entry time is still T_A1 (a cache hit does not renew it), so the window is measured from T_A1.

### Step 4: Wait more than 300 seconds, measured

- Call `browser_wait_for` with `time: 30` repeatedly (at least 11 times). Do not rely on one long call: it returns after about 30 seconds. Do not navigate, reload or click anything in between.
- After the calls, `browser_evaluate(() => new Date().toISOString())` and compute the elapsed time since T_A1. Continue with further 30-second waits until it is at least 320 seconds. Record the final value as T_wait_end.

### Step 5: Click A and record the request

- Click A in the sidebar. Record the click time via `browser_evaluate(() => new Date().toISOString())` as T_A2.
- `browser_network_requests` (filter `projects.*_rsc`): a new `GET` for A's path with `?_rsc=` must appear after the ones noted in Step 3. Copy the full request line (method, URL, status).
- `browser_evaluate(() => window.__noReload)` must return `"1d6a606b"` (no full page load happened).
- Write `agents/1d6a606b/patch_agent/router-cache-expiry.md` with: A and B slugs, T0, T_A1, T_B, T_wait_end, T_A2, elapsed seconds between T_A1 and T_A2, the in-window control result, the `?_rsc=` request line(s) for A before and after the wait, and the marker result.
- Pass: elapsed above 300 s, a new `?_rsc=` GET for A, marker intact. Fail: elapsed above 300 s and no new request; report it as a defect in the config and stop, without editing `next.config.ts`.

### Step 6: Stop the server this run started

- Stop only the `yarn start` process started in Step 1 (its background job / PID). Never touch a process on another port or one this run did not start. Close the browser.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `yarn lint`
- `yarn typecheck`
- `yarn knip`
- `yarn format:check`
- `yarn test`
- `yarn build` (route table still shows the project pages as Partial Prerender)
- `git status --porcelain` lists nothing under `agents/`, `.ports.env`, `.env*` or `next-env.d.ts` as staged, and no tracked file changed by this patch.

## Patch Scope

**Lines of code to change:** 0 (evidence file only, untracked)
**Risk level:** low
**Testing required:** Manual production-server observation of the router cache expiry with a measured wait above 300 seconds, plus the profile's full check suite.
