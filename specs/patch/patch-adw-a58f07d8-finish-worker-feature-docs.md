# Patch: Finish the worker widget's feature-doc updates (spec step 7)

## Metadata

adw_id: `a58f07d8`
review_change_request: `Issue #3: The feature-doc updates from spec step 7 are only partly done. (a) app_docs/clock-and-prerender.md: the Overview (line 9) still says "the two clock reads the codebase allows", which contradicts its own Rules ("exactly three"); the "### The worker store's clock read" subsection under "How it works" is missing, and so is the specs line. (b) app_docs/data-boundary.md: the workers read was added only to the Rules; step 7 also asks for it in "How it works" (adw.workers, WORKER_COLUMNS, no order, the freshest row picked by workerState), and the specs line is missing. (c) app_docs/screens-and-components.md: the sidebar bullet mentions the widget but does not describe it (online under 90 s, offline with the last beat or "never seen", "Worker status..." before the first read, never host, pid or started_at), and the specs line is missing. None of the three docs lists specs/issue-158-adw-a58f07d8-sdlc_planner-worker-status-widget.md. Use no em-dashes, then run yarn format:check. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-158-adw-a58f07d8-sdlc_planner-worker-status-widget.md`
**Issue:** Step 7 of the spec was applied only to the Rules sections. The clock doc's Overview still claims two clock reads and has no "How it works" subsection for the third; the data-boundary doc's "How it works" never mentions the workers read; the screens doc's sidebar bullet does not describe the widget's states or the fields it never shows; none of the three docs lists the issue-158 spec under **Specifications:**.
**Solution:** Docs-only edits in three files under `app_docs/`: fix the Overview count, add one subsection and two short paragraphs/sentences describing what the code already does (`src/components/WorkerStatus.tsx`, `src/lib/worker-state.ts`, `getWorkers()` in `src/data/index.ts`), and append the issue-158 spec line to each doc's specs list. No code, Rules or index changes (those are already done in the diff).

## Files to Modify

Use these files to implement the patch:

- `app_docs/clock-and-prerender.md`
- `app_docs/data-boundary.md`
- `app_docs/screens-and-components.md`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: `app_docs/clock-and-prerender.md`

- Under `**Specifications:**`, append `- specs/issue-158-adw-a58f07d8-sdlc_planner-worker-status-widget.md` after the issue-127 line.
- Overview (line 9): change "the two clock reads the codebase allows" to "the three clock reads the codebase allows".
- In "How it works", after the paragraph that starts "There is one other argument-less clock read: `utcDay(Date.now())`..." (it ends "(see `app_docs/summary.md`)."), and before `## Rules`, add a new subsection, wrapped near 80 columns like its neighbours:
  - Heading `### The worker store's clock read`.
  - Body, roughly: "The third and last argument-less clock read is `Date.now()` in the worker store's `poll` callback (`src/components/WorkerStatus.tsx`). It runs only in the browser, only after `getWorkers()` resolves, never in render or a hook body, and its value goes straight into the pure `nextWorkerSnapshot(previous, rows, nowMs)` (`src/lib/worker-state.ts`), which returns the previous snapshot itself when nothing changed, so a poll that finds the same state re-renders nothing. The store's `getServerSnapshot` is the constant `unknown` state and reads no clock, so the static shell and hydration both render "Worker status..." and the first poll after subscribe supplies the real state. It is the first instance of the shape the Rules prescribe for a time-dependent label: a client leaf with a `useSyncExternalStore` store whose server snapshot is data-free."
- Change "There is one other argument-less clock read" to "There is a second argument-less clock read" only if needed for consistency with "three"; otherwise leave it.
- Do not touch `## Rules` (it already says "exactly three" and "Do not add a fourth").

### Step 2: `app_docs/data-boundary.md`

- Under `**Specifications:**`, append `- specs/issue-158-adw-a58f07d8-sdlc_planner-worker-status-widget.md`.
- At the end of "### Data: projects and runs from the database" (after the paragraph ending "falls through to `notFound()` at request time.", before `### The query layer`), add a short paragraph: "`getWorkers()` reads `adw.workers`, the toolkit's queue-worker heartbeat table, selecting `WORKER_COLUMNS` with no order: `workerState` (`src/lib/worker-state.ts`) picks the freshest row by `last_heartbeat_at` in the browser. It is the one read outside the query layer: only the worker store in `WorkerStatus` calls it, by polling in the browser (the table is not in the Realtime publication), so it has no cache scope, no query key and no server call (see `app_docs/screens-and-components.md`)." Match the column name to the `Worker` type in `src/types/adw.ts` before writing it.
- Do not touch `## Rules` (already updated).

### Step 3: `app_docs/screens-and-components.md`

- Under `**Specifications:**`, append `- specs/issue-158-adw-a58f07d8-sdlc_planner-worker-status-widget.md` after the issue-152 line.
- In the sidebar bullet, right after "Below `md` the widget follows the strip." (line 31), insert a description of the widget: "The widget (`WorkerStatus`) shows whether the toolkit's queue worker is running: "Worker online" (emerald dot) while the freshest heartbeat is under 90 s old, "Worker offline" (rose ring) otherwise, each followed by "last beat" and the beat's `Timestamp`, or "never seen" when there is no row. Before its first read (the static shell, hydration, the first poll in flight) it reads "Worker status..." with a dashed neutral ring. It never shows the worker's host, pid or `started_at`."
- Do not touch `## Rules` (the `"use client"` list and status-colour rule already name `WorkerStatus`).

### Step 4: Check em-dashes and format

- `grep -n $'\xe2\x80\x94' app_docs/clock-and-prerender.md app_docs/data-boundary.md app_docs/screens-and-components.md` must print nothing (the pattern is the UTF-8 bytes of an em-dash, so this spec itself stays free of them).
- Run `yarn format`, then `yarn format:check`.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `grep -c "issue-158-adw-a58f07d8" app_docs/clock-and-prerender.md app_docs/data-boundary.md app_docs/screens-and-components.md`: each count is at least 1.
- `grep -n "two clock reads\|### The worker store's clock read" app_docs/clock-and-prerender.md`: only the subsection heading matches.
- `grep -rn $'\xe2\x80\x94' app_docs/`: no output.
- `yarn format:check`
- `yarn lint && yarn typecheck && yarn knip && yarn test` (lefthook's commit and push checks; docs-only, expected unchanged).

## Patch Scope

**Lines of code to change:** about 30 lines of Markdown across three docs, no code.
**Risk level:** low
**Testing required:** Prettier check on the docs plus the grep checks above; the hook checks must stay green.
