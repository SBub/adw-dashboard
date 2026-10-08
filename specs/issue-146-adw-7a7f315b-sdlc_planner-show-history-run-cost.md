# Feature: History card shows the cost of each run

## Metadata

issue_number: `146`
adw_id: `7a7f315b`
issue_json: `{"number":146,"title":"History card: show the cost of each run","body":"Show a Cost field on History cards ($4.29, two decimals), after Duration. getCompletedRuns reads the page's runs as today, then one more read of adw.run_metrics for that page's (project_id, adw_id) pairs (select=adw_id,cost_usd, project_id=eq.<id>, adw_id=in.(...)) and returns the cost with the page. Keep the getCompletedRuns signature and the runs select. A RunMetrics row type with its column list constant. A pure costLabel(usd: number): string in src/lib/ next to durationLabel, tested with fixed values (0, sub-cent, rounding, thousands); no Intl, no toLocaleString. A run with no metrics row shows no Cost field. History stays out of the query cache. Docs: data-boundary.md, types.md, project-page.md. Acceptance: cost matches run_metrics.cost_usd rounded to cents, runs without metrics show none, one extra read per History page, lint/typecheck/knip/test pass."}`

## Feature Description

History cards on the project page (`/projects/<owner>/<repo>`) show Branch, Finished and Duration
for each completed run, but not what the run cost. The ADW toolkit already publishes that figure:
`adw.run_metrics` holds one row per run (`project_id`, `adw_id`, `cost_usd`, tokens, a per-phase
breakdown), readable with the publishable key under RLS (confirmed read-only against the hosted
project: rows such as `{"adw_id":"a6d2347d","cost_usd":4.2935,...}`). This feature adds a `Cost`
field after Duration on every History card whose run has a metrics row, formatted in dollars with
two decimals (`$4.29`). A run with no metrics row shows no Cost field at all.

## User Story

As a person reviewing a project's finished ADW runs
I want each History card to show what that run cost
So that I can see which runs were expensive without opening the summary page or the database

## Problem Statement

Run cost exists in the database but is invisible per run. The summary page only shows sums per day,
model and phase, so there is no way to attribute spend to an individual issue from the dashboard.

## Solution Statement

- **Data boundary.** `getCompletedRuns(slug, bookmark, q)` keeps its signature and its `runs`
  select (`RUN_COLUMNS`, exactly `Run`'s fields). After it has the page's `items`, it makes one more
  read: `run_metrics` with `select(RUN_METRICS_COLUMNS)` (`"adw_id, cost_usd"`),
  `.eq("project_id", project.id)` and `.in("adw_id", items.map((run) => run.adw_id))`. It runs in the
  same `Promise.all` as the existing "newer" count (both only depend on `items`), so it adds a read
  but no extra round trip in sequence. It is skipped when `items` is empty (and for an unknown slug),
  so the extra read is at most one per page, never one per run.
- **Return shape.** The least invasive shape: a new `CompletedRunsPage` interface exported from
  `src/data/index.ts` (next to `ActiveRuns`), `HistoryPage & { costs: Record<string, number> }`,
  keyed by `adw_id`. `HistoryPage` and the pure `toHistoryPage` in `src/lib/history-bookmark.ts` stay
  untouched (their ten tests too); `getCompletedRuns` returns `{ ...toHistoryPage(...), costs }`. A
  plain `Record` (not a `Map`) so it serialises through the page's `"use cache"` scope like the rest
  of the page object. No run view model: `Run` rows are still passed as stored, and the cost travels
  beside them as a prop.
- **Assembly.** A pure `runCosts(rows: readonly RunMetrics[]): Record<string, number>` in
  `src/lib/run-view.ts` turns the metrics rows into the map, so the boundary logic is unit-testable
  without mocking Supabase.
- **Types.** `RunMetrics` in `src/types/adw.ts`, `{ adw_id: string; cost_usd: number }`, the columns
  read (like `DailySummary` is the columns read of its view), cast only at the boundary, with
  `RUN_METRICS_COLUMNS` in `src/data/index.ts` equal to its fields.
- **Formatting.** `costLabel` already exists, in `src/lib/daily-summary.ts`
  (`(usd: number | null) => string`: `"n/a"` for null, `"<$0.01"` under a cent, otherwise
  `$` plus `Math.round(usd * 100) / 100` with `toFixed(2)`), used by the summary's
  `ModelColumnChart`, `PhaseColumnChart` and `ProjectBreakdownTable`. A second function of the same
  name would be a duplicate mapping. Instead, **move** it to `src/lib/run-view.ts` next to
  `durationLabel` (as the issue asks), narrowed to `costLabel(usd: number): string` (every existing
  caller passes a `number`: `SummaryModel.cost_usd`, `SummaryPhase.cost_usd`,
  `DailySummary.cost_usd_sum`; the `null` branch is dead), keep its output otherwise identical so
  the summary renders exactly as before, and re-point the three summary components' imports. No
  `Intl`, no `toLocaleString`: thousands print without a separator (`$1234.50`), as the summary
  already does.
- **UI.** `CompletedRuns` in the page passes `costs` to `RunHistoryList`, which passes
  `cost={costs[run.adw_id]}` (`number | undefined` under `noUncheckedIndexedAccess`) to each
  `RunRow`. The History variant renders `<Field label="Cost">{costLabel(cost)}</Field>` after
  Duration only when `cost !== undefined`. The History grid gets a fifth column from `lg` up so the
  four fields still sit on one row at desktop widths.
- History stays out of the React Query cache: no query key, no Realtime reducer; the costs are read
  inside the existing `getHistory` `"use cache"` scope tagged `history:<slug>`, so a completion's
  tag drop refreshes them with the rows. (Metrics are published by the toolkit at the end of a run;
  if a metrics row lands after the completion's revalidation, the cost appears on the next tag drop
  or cache expiry. Noted, not solved here.)

## Relevant Files

Use these files to implement the feature:

- `AGENTS.md` - repository rules (no em-dashes, Yarn only, docs per feature, lefthook).
- `.adw/project.md` - ADW profile: commands, test layers (vitest only, E2E code suite `none`, journeys in `e2e/*.md`), review paths.
- `docs/conditional-docs.md` - index; matching docs are listed below.
- `app_docs/data-boundary.md` - rules for `src/data/index.ts` and adding a database read; must document the `run_metrics` read and `CompletedRunsPage`.
- `app_docs/types.md` - rules for `src/types/adw.ts`; must document `RunMetrics`.
- `app_docs/project-page.md` - History section description (`RunRow` history variant fields, line ~165); must add Cost.
- `app_docs/screens-and-components.md` - History card's fields and the pure helpers a component may call (`durationLabel`, `branchTreeHref`); must add `costLabel` and the Cost field.
- `app_docs/summary.md` - summary page doc; check for any mention of where `costLabel` lives (none today) and leave the summary's behaviour unchanged.
- `src/data/index.ts` - `getCompletedRuns`, the column constants and the boundary casts.
- `src/types/adw.ts` - add `RunMetrics` and update the header comment listing the view-model section.
- `src/lib/run-view.ts` - add `costLabel` (moved) and `runCosts`.
- `src/lib/run-view.test.ts` - tests for `costLabel` and `runCosts`.
- `src/lib/daily-summary.ts` - remove `costLabel` from here.
- `src/lib/daily-summary.test.ts` - its `costLabel` describe block (line ~754) and the `costLabel(totals.cost_usd_sum)` assertion (line ~370) move or re-import.
- `src/components/ModelColumnChart.tsx`, `src/components/PhaseColumnChart.tsx`, `src/components/ProjectBreakdownTable.tsx` - re-point the `costLabel` import to `@/lib/run-view`.
- `src/components/RunRow.tsx` - render the Cost field in the history variant; doc comment.
- `src/components/RunHistoryList.tsx` - accept and pass `costs`.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx` - `getHistory` return type and `CompletedRuns` passing `costs`.
- `src/lib/history-bookmark.ts` - `HistoryPage` and `toHistoryPage` (read only, unchanged).
- `e2e/test_history_card_fields.md` - existing journey that asserts the History card's `dt`s are exactly Branch, Finished, Duration; it would fail once Cost appears and must be updated.

### New Files

None. (The plan file itself is the only new file.)

## Implementation Plan

### Phase 1: Foundation

Add the `RunMetrics` type, move `costLabel` to `src/lib/run-view.ts` (narrowed to `number`) with its
tests, and add the pure `runCosts` helper with tests.

### Phase 2: Core Implementation

Extend `getCompletedRuns` with the one `run_metrics` read per non-empty page, returning
`CompletedRunsPage` (`HistoryPage` plus `costs`).

### Phase 3: Integration

Thread `costs` from the page's `getHistory`/`CompletedRuns` through `RunHistoryList` into `RunRow`,
render the Cost field, widen the History grid, update the existing History journey and the docs.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add the `RunMetrics` type

- In `src/types/adw.ts`, in the view-models section (beside `DailySummary`), add:
  ```ts
  /**
   * The columns of one adw.run_metrics row the History page reads: one run's
   * total cost in US dollars. The table holds one row per run (keyed by
   * project_id and adw_id) with tokens and a per-phase breakdown too; a run
   * that published no metrics has no row.
   */
  export interface RunMetrics {
    adw_id: string;
    cost_usd: number;
  }
  ```
- Update the file's header comment to list `RunMetrics` (the run_metrics columns the History page
  reads) alongside `DailySummary` and friends, and keep the sentence that runs have no view model.

### 2. Move `costLabel` next to `durationLabel`

- Cut `costLabel` from `src/lib/daily-summary.ts` and add it to `src/lib/run-view.ts` after
  `secondsLabel`, narrowed to `export function costLabel(usd: number): string`: `"<$0.01"` when
  `usd > 0 && usd < 0.01`, else `` `$${(Math.round(usd * 100) / 100).toFixed(2)}` ``. Doc comment:
  a cost in US dollars with two decimals, `"<$0.01"` under a cent, no thousands separator (no Intl,
  no toLocaleString), shared by the summary's charts and table and the History card.
- Re-point imports in `src/components/ModelColumnChart.tsx`, `src/components/PhaseColumnChart.tsx`
  and `src/components/ProjectBreakdownTable.tsx`: `tokensLabel` stays from `@/lib/daily-summary`,
  `costLabel` comes from `@/lib/run-view`.
- In `src/lib/daily-summary.test.ts`, remove `costLabel` from the import and delete its describe
  block (it moves to step 3); for the assertion at line ~370 (`costLabel(totals.cost_usd_sum)`),
  import `costLabel` from `./run-view` or assert the raw sum, whichever keeps the test's intent.
- Run `yarn typecheck` to confirm no caller passed `null`.

### 3. Test `costLabel` in `src/lib/run-view.test.ts`

- Add a `describe("costLabel")` with fixed values, no clock:
  - zero: `costLabel(0)` is `"$0.00"`.
  - sub-cent: `costLabel(0.0042)` is `"<$0.01"`; exactly a cent: `costLabel(0.01)` is `"$0.01"`.
  - rounding: `costLabel(4.2935)` is `"$4.29"` (the real row seen in the database);
    `costLabel(12.345)` is `"$12.35"`; `costLabel(0.999)` is `"$1.00"`.
  - thousands: `costLabel(1234.5)` is `"$1234.50"` (no separator).
- Update the import line to include `costLabel` and `runCosts`.

### 4. Add `runCosts` and test it

- In `src/lib/run-view.ts`, add
  `export function runCosts(rows: readonly RunMetrics[]): Record<string, number>` returning
  `Object.fromEntries(rows.map((row) => [row.adw_id, row.cost_usd]))`. Doc comment: the History
  page's cost per run, keyed by adw_id; a run with no metrics row has no key, so the card shows no
  Cost field (never `$0.00`). Import `RunMetrics` as a type from `@/types/adw`.
- In `src/lib/run-view.test.ts`, `describe("runCosts")`: empty rows give `{}`; two rows give the
  two keys with their exact unrounded values (`{ a6d2347d: 4.2935, ... }`); an adw_id not in the
  rows is `undefined` in the result (the "no metrics row, no Cost" contract).

### 5. Read `run_metrics` in `getCompletedRuns`

- In `src/data/index.ts`:
  - Add `/** The columns of adw.run_metrics the History page reads, which are exactly the fields of RunMetrics. */`
    `const RUN_METRICS_COLUMNS = "adw_id, cost_usd";` beside the other constants.
  - Import `RunMetrics` (type) from `@/types/adw` and `runCosts` from `@/lib/run-view`.
  - Export `interface CompletedRunsPage extends HistoryPage { costs: Record<string, number> }` with
    a doc comment: the History page plus each shown run's cost in US dollars keyed by adw_id; a run
    with no `adw.run_metrics` row has no key.
  - Change `getCompletedRuns`'s return type to `Promise<CompletedRunsPage>` (arguments unchanged).
    The unknown-slug early return becomes `{ ...toHistoryPage([], {...}), costs: {} }`.
  - After `items` and `anchor`, run the newer count and the metrics read together:
    ```ts
    const [newer, costs] = await Promise.all([
      anchor ? <existing newer count> : 0,
      items.length > 0 ? getRunCosts(project.id, items) : {},
    ]);
    ```
    where a private helper `getRunCosts(projectId: string, runs: readonly Run[])` does
    `getSupabase().from("run_metrics").select(RUN_METRICS_COLUMNS).eq("project_id", projectId).in("adw_id", runs.map((run) => run.adw_id))`,
    throws `run_metrics: <message>` on error (same style as the others), and returns
    `runCosts((data ?? []) as RunMetrics[])` with the usual "the selected columns are exactly the
    fields of RunMetrics, asserted once at the boundary" comment.
  - Return `{ ...toHistoryPage(items, { slug, newer, total }), costs }`.
  - Extend the function's doc comment and the file header (the History bullet) to say: one more read
    per non-empty page, of `adw.run_metrics` for the shown runs, never per run, inside the same
    cache scope, never in the query cache.
- Do not touch `RUN_COLUMNS`, `HistoryPage` or `toHistoryPage`.

### 6. Thread `costs` through the page

- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: `getHistory` returns
  `Promise<CompletedRunsPage>` (import the type from `@/data`; drop the `HistoryPage` import if it
  becomes unused, knip and lint will tell). `readHistory` already spreads the page, so
  `CompletedRuns` destructures `{ q, items, costs }` and passes `costs={costs}` to
  `RunHistoryList`. `HistoryPagination` is unchanged.
- `src/components/RunHistoryList.tsx`: add a prop
  `/** Each shown run's cost in US dollars by adw_id; a run with no metrics has no key. */ costs: Record<string, number>;`
  and render `<RunRow ... cost={costs[run.adw_id]} />`. Update its doc comment.

### 7. Render the Cost field in `RunRow`

- `src/components/RunRow.tsx`: add an optional prop
  `/** History only: the run's cost in US dollars, undefined when it published no metrics. */ cost?: number;`
- Import `costLabel` from `@/lib/run-view` alongside `durationLabel` and `branchTreeHref`.
- In the history `dl`, after the Duration field:
  `{cost !== undefined && <Field label="Cost">{costLabel(cost)}</Field>}`.
- Change the history `dl` grid from `sm:grid-cols-4` to `sm:grid-cols-4 lg:grid-cols-5` so Branch
  (still `sm:col-span-2`), Finished, Duration and Cost sit on one row from `lg` up; at `sm` to `lg`
  Cost wraps to a second row, below 640px all fields stack as today.
- Update the component's doc comment: costLabel for Cost (shown only when the run has a metrics
  row), the History card shows Branch in full, Finished, Duration and Cost.

### 8. Update the existing History journey

- `e2e/test_history_card_fields.md` asserts the History card's `dt` texts are exactly
  `Branch`, `Finished`, `Duration` and that those three share one row at 1280x800. With this
  feature that is wrong for any run that has metrics. Update it (no new journey; the vitest layer
  covers formatting and assembly, and the profile has no code E2E suite):
  - Description, User Story context and Success Criteria: the card shows Branch, Finished, Duration
    and, when the run published metrics, Cost.
  - Step 5: also return the text of the `dd` after a `Cost` `dt` (or null) and its
    `getBoundingClientRect().top`.
  - Step 6: the `dt` texts are exactly `Branch`, `Finished`, `Duration`, optionally followed by
    `Cost`; when `Cost` is present its value matches `/^\$\d+\.\d{2}$/` or is `<$0.01`, and never
    `$0.00` unless the stored cost rounds to zero; there is no `Final phase`, no `Started`, no
    `completed`; the tops of all present field `dd`s are within 2px (one row at 1280x800).
  - Add a step after 6: if the first card has no `Cost`, page through History (right arrow) until a
    card with a `Cost` field is found, or note that no run in this project published metrics.
    Verify only the format of a found value here; the exact rounding is proven by the unit tests
    and the value against the database is checked by the reviewer (task 9).
  - Step 11 (375x667): the tops of the present `dd`s strictly increase.
- Keep the two screenshots.

### 9. Review-phase browser evidence

- The profile has no code E2E suite. The review phase opens
  `http://localhost:$PORT/projects/SBub/issebya-homes-ai-system` (or the first project the sidebar on
  `/projects` lists if that 404s) at desktop 1920x1080 and mobile 375x667, full page, and must see:
  History cards with a `Cost` field after Duration showing `$x.xx` (for example the run `a6d2347d`
  with `cost_usd` 4.2935 shows `Cost $4.29` if it is in that project's History), on one row with
  Branch, Finished and Duration at 1920 wide, stacked at 375; a card for a run with no metrics row
  shows no Cost field (not `$0.00`). The summary page `/` must look exactly as before (costs in the
  model and phase charts and the per-project table unchanged), since `costLabel` moved but did not
  change output for numbers.

### 10. Update the docs

- `app_docs/data-boundary.md`: in the list of screen-facing reads, `getCompletedRuns(slug, bookmark, q): Promise<CompletedRunsPage>`
  where `CompletedRunsPage` is `HistoryPage & { costs: Record<string, number> }`; in the casts
  paragraph, the `run_metrics` rows to `RunMetrics[]` (`RUN_METRICS_COLUMNS`, exactly its fields);
  in Rules, the `getCompletedRuns` sentence gains: then, for a non-empty page, one read of
  `run_metrics` (`adw_id, cost_usd`, `project_id = <id>`, `adw_id in (<the page's ids>)`) in the same
  `Promise.all` as the newer count, assembled by `runCosts`; one extra read per page, never per run;
  never in the query cache. Add "do not read run metrics per run" as a rule.
- `app_docs/types.md`: `RunMetrics` mirrors the `run_metrics` columns the History page reads and sits
  with the view models; still no run view model (the cost travels beside the rows as a prop).
- `app_docs/project-page.md`: the History description (around line 165): `RunRow` in the history
  variant shows Branch (in full, two columns), Finished, Duration and Cost (only when the run has a
  metrics row, `costLabel`), on one row from `lg`; `getHistory` returns the page with `costs`, which
  `CompletedRuns` passes to `RunHistoryList`. Also note the cost is read inside the same tagged
  cache scope.
- `app_docs/screens-and-components.md`: the pure-helper sentence lists `costLabel(cost)` from
  `src/lib/run-view.ts` (shared with the summary's charts and table), and the History card fields
  include Cost; "a run with no metrics shows no Cost, never `$0.00`" as a rule.
- `docs/conditional-docs.md`: extend the `data-boundary.md` line's situations with "when reading
  `adw.run_metrics`" if not already covered by "adding a database read" (it is; leave unchanged
  unless the wording needs the History cost). No new doc, so no new index line.
- No em-dashes anywhere.

### 11. Run the validation commands

- Run every command in `Validation Commands` below and fix anything that fails without weakening a
  rule, type or test.

## Testing Strategy

### Unit Tests

- `src/lib/run-view.test.ts`, `describe("costLabel")`: 0, sub-cent, exactly one cent, rounding
  (including the real `4.2935` to `$4.29`), carry to a dollar (`0.999`), thousands without a
  separator.
- `src/lib/run-view.test.ts`, `describe("runCosts")`: empty, two rows keyed by adw_id with exact
  values, a missing run has no key.
- `src/lib/daily-summary.test.ts`: still green after the move (the `costLabel` block leaves; the
  totals assertion keeps its intent).

### Test Coverage

- `costLabel` in `src/lib/run-view.test.ts` (vitest unit layer): fails today because `run-view.ts`
  exports no `costLabel`; catches a wrong rounding, a locale-dependent separator or a sub-cent
  shown as `$0.00`.
- `runCosts` in `src/lib/run-view.test.ts` (vitest unit layer): fails today because the helper does
  not exist; catches a cost keyed by the wrong column or a run without metrics getting a `0`
  (which would render `$0.00` instead of no field).
- The Supabase read itself and the rendered card have no code test layer in this project (no
  component tests, no Playwright suite). They are covered by the updated agent journey
  `e2e/test_history_card_fields.md` (task 8) and the review phase's screenshots (task 9).

### Edge Cases

- Empty History page (no completed runs, or a search with no match): no `run_metrics` read at all,
  `costs` is `{}`.
- Unknown slug: early return with `costs: {}`, no read.
- A run with no metrics row: no key, no Cost field (never `$0.00`).
- A run whose cost is exactly 0: shows `$0.00` (a real metrics row with zero cost).
- Sub-cent cost: `<$0.01`.
- Cost of $1,000 or more: `$1234.50`, no separator, no `Intl`.
- A `before` bookmark page (ascending read, reversed): costs are keyed by adw_id, so order does not
  matter.
- `?q` search pages: the metrics read uses the shown items, so it is narrowed the same way.
- A `run_metrics` read error throws `run_metrics: <message>` and fails the History islands through
  their existing `SectionBoundary`, like a `runs` error.
- Summary page: costs render exactly as before after the move.

## Acceptance Criteria

- History cards show `Cost $x.xx` after Duration, matching `adw.run_metrics.cost_usd` rounded to
  cents (`<$0.01` under a cent); runs without a metrics row show no Cost field.
- `getCompletedRuns` keeps its arguments and its `RUN_COLUMNS` select, and makes at most one extra
  database read per History page (none for an empty page), never one per run.
- `RunMetrics` exists in `src/types/adw.ts` and `RUN_METRICS_COLUMNS` equals its fields; the cast
  happens only in `src/data/index.ts`.
- `costLabel(usd: number): string` lives in `src/lib/run-view.ts` next to `durationLabel`, is the
  only `costLabel`, uses no `Intl` and no `toLocaleString`, and is unit tested with fixed values.
- No query key, no Realtime reducer, no run view model added.
- The summary page renders costs exactly as before.
- `app_docs/data-boundary.md`, `app_docs/types.md`, `app_docs/project-page.md` and
  `app_docs/screens-and-components.md` describe the change; `e2e/test_history_card_fields.md`
  accepts the Cost field.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test` and `yarn build`
  pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint` - ESLint over the changed source.
- `yarn typecheck` - `next typegen` then `tsc --noEmit`; proves no caller passes `null` to the narrowed `costLabel` and the new props line up.
- `yarn knip` - no unused export left behind (the old `costLabel` export, an unused `HistoryPage` import).
- `yarn format:check` - Prettier on everything touched, including the docs and the journey.
- `yarn test` - vitest, including the new `costLabel` and `runCosts` cases and the existing `daily-summary` and `history-bookmark` suites.
- `yarn build` - full Next build, reads the database (including the new `run_metrics` read at build time for prerendered History pages), proves the read works with the publishable key.

## Notes

- No new dependency.
- `cost_usd` was checked read-only against the hosted project with the publishable key: it is a
  number (e.g. `4.2935`) and no row currently has it null, so `RunMetrics.cost_usd` is `number`.
  If the toolkit ever makes it nullable, `runCosts` should skip null rows so they show no field.
- Metrics are written by the toolkit at the end of a run. If a run's metrics row is inserted after
  the completion has already dropped `history:<slug>`, the card shows no Cost until the next tag
  drop or cache expiry. A follow-up could have the database webhook on `run_metrics` inserts post to
  `/api/revalidate` as well.
- The issue suggests a `costs: Record<adw_id, number>` on the page object; this plan puts it on a
  `CompletedRunsPage` in the data boundary rather than on `HistoryPage`, so the pure paging module
  and its tests stay untouched.
- Commits: Conventional Commits, bare type, no trailers (profile Documentation section).
