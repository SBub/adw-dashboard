# Patch: Document the History run cost in the four feature docs

## Metadata

adw_id: `7a7f315b`
review_change_request: `Issue #1: Spec step 10 and its acceptance criterion ('app_docs/data-boundary.md, app_docs/types.md, app_docs/project-page.md and app_docs/screens-and-components.md describe the change') are not implemented. The issue also explicitly asks for docs in data-boundary.md, types.md and project-page.md. git diff origin/develop --stat lists no file under app_docs/, and grepping app_docs/ finds no mention of run_metrics reads for History, CompletedRunsPage, RunMetrics, costLabel's new home or a History Cost field. AGENTS.md requires each feature doc to be updated with the change. Resolution: update data-boundary.md, types.md, project-page.md and screens-and-components.md as spec step 10 describes, with no em-dashes, then run yarn format:check. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-146-adw-7a7f315b-sdlc_planner-show-history-run-cost.md`
**Issue:** The code for the History card's Cost field is done (`RunMetrics` in `src/types/adw.ts`,
`RUN_METRICS_COLUMNS`, `getRunCosts` and `CompletedRunsPage` in `src/data/index.ts`, `costLabel` and
`runCosts` in `src/lib/run-view.ts`, the `costs` prop through `getHistory`, `CompletedRuns`,
`RunHistoryList` and `RunRow`). No doc under `app_docs/` was updated, so spec step 10 and its
acceptance criterion are unmet.
**Solution:** Edit only the four feature docs, in place, so they describe the change exactly as
spec step 10 says. No code, test, index or other doc changes. `docs/conditional-docs.md` stays as
it is: its `data-boundary.md` line already covers "adding a database read" (spec step 10 says to
leave it). `app_docs/summary.md` never said where `costLabel` lives, so it stays as it is too.

## Files to Modify

Use these files to implement the patch:

- `app_docs/data-boundary.md`
- `app_docs/types.md`
- `app_docs/project-page.md`
- `app_docs/screens-and-components.md`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

Do not use em-dashes anywhere. Use commas, periods, colons or parentheses. Keep each doc's
existing wrapping style and its headings.

### Step 1: `app_docs/data-boundary.md`

- In "How it works", the `getCompletedRuns(slug, bookmark, q)` bullet (around line 53): after it
  says what it returns, add that a non-empty page also reads `adw.run_metrics` once for the shown
  runs (`adw_id, cost_usd` where `project_id = <id>` and `adw_id in (<the page's ids>)`), in the
  same `Promise.all` as the newer count, and returns their costs as `costs` keyed by `adw_id`
  (a run with no metrics row has no key; an empty page or an unknown slug gets `costs: {}` and
  no read).
- In the list of screen-facing reads (around line 105): change
  `getCompletedRuns(slug, bookmark, q): Promise<HistoryPage>` to
  `getCompletedRuns(slug, bookmark, q): Promise<CompletedRunsPage>`, where `CompletedRunsPage`
  (exported from `src/data/index.ts`) is `HistoryPage` plus `costs: Record<string, number>` (each
  shown run's cost in US dollars keyed by `adw_id`). Keep the existing `HistoryPage` and
  `HistoryCursor` definitions.
- In the casts paragraph (around line 120): add the `run_metrics` rows to `RunMetrics[]`
  (`RUN_METRICS_COLUMNS`, exactly the fields of `RunMetrics`).
- In Rules, the "All four are async database reads" bullet (around line 291): add to the
  `getCompletedRuns` clause, after the `toHistoryPage` assembly: then, for a non-empty page, one
  read of `run_metrics` (`adw_id, cost_usd`, `project_id = <id>`, `adw_id in (<the page's ids>)`)
  in the same `Promise.all` as the newer count, assembled by `runCosts` (`src/lib/run-view.ts`)
  into `costs`. That is one extra read per page, never one per run, and it is never in the query
  cache (it is read inside the same `history:<slug>` cache scope and drops with the tag). End
  with the rule: "Do not read run metrics per run."
- In the casts rule (around line 311): add `RunMetrics[]` for `run_metrics` to the list, and
  "`RUN_METRICS_COLUMNS` equal to the fields of `RunMetrics`" to the column-list sentence.

### Step 2: `app_docs/types.md`

- In "How it works" (around line 17): add that `RunMetrics` mirrors the `run_metrics` columns
  the History page reads (`adw_id`, `cost_usd`; the table also holds tokens and a per-phase
  breakdown the app does not read, and a run that published no metrics has no row).
- In Rules (around line 29): add `RunMetrics` to the types that sit with the view models (it
  mirrors the `run_metrics` columns the History page reads). Keep "There is no run or queue item
  view model" and add that the cost travels beside the rows as a prop (`costs` keyed by
  `adw_id`), not on a run view model.

### Step 3: `app_docs/project-page.md`

- Step 5 (around line 130): say `getHistory` returns the page with `costs` (one page of plain rows
  plus each shown run's cost, read by `getCompletedRuns` inside the same tagged `"use cache"`
  scope, so the costs drop with `history:<slug>` together with the rows).
- Around line 151: `CompletedRuns` renders `RunHistoryList` with the page's `items` and `costs`,
  the slug and the empty-state text. `RunHistoryList` passes each run's cost to its `RunRow`.
- Around line 165: `RunRow` in the `history` variant shows Branch (in full, spanning two
  columns), Finished, Duration and Cost (only when the run has a metrics row, formatted by
  `costLabel`), on one row from `lg` (a 5-column grid; at `sm` the 4-column grid puts Cost on a
  second row) and stacked at 375px. Keep "no `completed` pill, no `Final phase` and no
  `Started`".
- In Rules, the History bullet (around line 248): add that the costs are read by the same
  `getCompletedRuns` call inside `getHistory`, never in the query cache.

### Step 4: `app_docs/screens-and-components.md`

- In "How it works", the History card sentence (around line 38): fields are the branch in full
  (with its link), Finished, Duration and Cost (only for a run with metrics).
- In Rules, the pure-helper sentence (around line 58): add `costLabel(cost)` from
  `src/lib/run-view.ts` to what `RunRow` calls (shared with the summary's charts and table), and
  say `RunRow` and `RunHistoryList` also take the run's cost as a prop (`cost`, `costs`), read
  by the data layer, not computed by the component.
- Add the rule: a run with no metrics row shows no Cost field, never `$0.00`.

### Step 5: Check the result

- `grep -nP "\x{2014}" app_docs/data-boundary.md app_docs/types.md app_docs/project-page.md app_docs/screens-and-components.md` (no output expected: no em-dashes)
  prints nothing.
- `grep -n "CompletedRunsPage\|RunMetrics\|run_metrics\|costLabel\|Cost" app_docs/` finds each doc.
- Run `yarn format` if `yarn format:check` reports one of the four files, then re-check.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `yarn lint`
- `yarn typecheck`
- `yarn knip`
- `yarn format:check`
- `yarn test`
- `yarn build`

## Patch Scope

**Lines of code to change:** about 40 lines of Markdown across four docs, no source lines
**Risk level:** low
**Testing required:** docs only: `yarn format:check` must pass and the em-dash grep must be empty;
the rest of the profile's checks are run to confirm nothing else regressed.
