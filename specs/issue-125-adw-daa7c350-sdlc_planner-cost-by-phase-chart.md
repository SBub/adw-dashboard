# Feature: Day card third chart, cost by phase

## Metadata

issue_number: `125`
adw_id: `daa7c350`
issue_json: `{"number":125,"title":"Day card: third chart, cost by phase"}`

## Feature Description

Every day card on the summary (`/`), the past days and the client-refreshed today card alike, gets a
third chart card, "Cost by phase" ("What each pipeline step cost that day"), beside "Work by class"
and "Tokens by model". It is built on the same `ColumnChart` and shows one column per pipeline phase
in fixed order (Plan, Build, Test, Review, Document), the day's cost in dollars on the bar (two
decimals, inside or above the bar per `barValueInside`), the phase name under it and a tooltip with
the input, cache read, cache write and output tokens, the total time and the number of runs. CI
(`adw_ci_iso`) has no cost and is omitted. The data is the toolkit's `adw.daily_phase_summary` view
(SBub/adw-toolkit#70), read in the same `Promise.all` as the day rows and the model rows, so no new
round trip and no new cache scope. The three cards share one row on wide screens and stack below.

Prerequisite check done while planning: a read-only REST select on `adw.daily_phase_summary` with
the publishable key returns rows (`project_id, day, phase, runs, input, cache_read, cache_creation,
output, cost_usd, duration_s`, phase keys such as `adw_build_iso`, `adw_ci_iso`,
`adw_document_iso`), so the migration is applied and the work may start.

## User Story

As a visitor reading the ADW public ledger on `/`
I want to see what each pipeline step (plan, build, test, review, document) cost on a day
So that I can tell which step drives the spend and compare it across days

## Problem Statement

The day cards show work by class and tokens by model, but not where in the pipeline the money goes.
The toolkit now publishes per-phase usage (`adw.daily_phase_summary`), and the dashboard does not
read or show it.

## Solution Statement

Follow the model chart's path exactly, one layer at a time:

- A row type `DailyPhaseSummary` and a report type `SummaryPhase` in `src/types/adw.ts`; a
  `phases: SummaryPhase[]` field on `SummaryDay` next to `models`.
- A pure module `src/lib/phase-usage.ts` (in the style of `src/lib/model-usage.ts`): the fixed
  order and display names of the five costed phases, `phaseName(key)`, and `sumPhaseUsage(rows)`
  that sums every numeric column per known phase, rounds cost to 4 decimals, drops `adw_ci_iso` and
  unknown keys, **omits phases with no rows** (the same choice as `classCounts` and
  `sumModelUsage`: absent entries are omitted), returns them in pipeline order, never mutates its
  input.
- `toSummaryReport` and `toSummaryDay` in `src/lib/daily-summary.ts` take a third row array
  (`phaseRows`), drop hidden projects' rows, group them by day and attach `sumPhaseUsage(...)` as
  `phases`, exactly as they do for `models`.
- `getSummaryPast` and `getSummaryToday` in `src/data/index.ts` add a `daily_phase_summary` read
  to their existing `Promise.all` with a `DAILY_PHASE_SUMMARY_COLUMNS` constant equal to the fields
  of `DailyPhaseSummary`, the same error handling and the same cast.
- A stateless `PhaseColumnChart` (no `"use client"`) on `ColumnChart`, colours from a new
  `PHASE_BG` in `src/lib/chart-colors.ts`, the cost from `costLabel`, tokens from `tokensLabel`,
  total time from `secondsLabel`.
- `DayCharts` renders it third and switches from `sm:grid-cols-2` to `lg:grid-cols-3`: the page
  container is `max-w-6xl` (1152px), so from 1024px each card is roughly 330 to 350px wide, enough
  for five `min-w-12` columns with `gap-2`; at `sm` (640px) three cards would be about 180px each,
  too narrow for five columns with their labels. Below `lg` the three stack.

## Relevant Files

Use these files to implement the feature:

- `README.md` - "Summary" section describes the chart cards, the data reads and the layout
  breakpoint; edited in place to describe the third chart, the third view and `lg`.
- `AGENTS.md` - rules for the summary (`getSummaryPast`/`getSummaryToday` reading the model view in
  the same `Promise.all`, boundary casts and column-list constants, stateless chart components,
  fixed chart orders, `DayCharts` layout from `sm`); edited in place for the phase view, the new
  component and helper module, and the breakpoint.
- `.adw/project.md` - Review section names the day cards' two chart cards; update it to three (no
  heading change).
- `src/types/adw.ts` - add `DailyPhaseSummary` (view row) and `SummaryPhase` (report), and
  `phases` on `SummaryDay`; update the header comment.
- `src/lib/model-usage.ts` / `src/lib/model-usage.test.ts` - the pattern to copy for the pure
  aggregation and its tests.
- `src/lib/daily-summary.ts` - `toSummaryReport` and `toSummaryDay` gain the phase rows and assemble
  `phases`; `costLabel`, `tokensLabel`, `barValueInside`, `columnHeights` are reused.
- `src/lib/daily-summary.test.ts` - existing `toSummaryReport models` tests; add the phase
  equivalents and update every call site for the new argument.
- `src/lib/run-view.ts` - `secondsLabel` formats the tooltip's total time (`duration_s`).
- `src/lib/chart-colors.ts` - add `PHASE_BG`, the one place a phase gets a colour.
- `src/lib/status-colors.test.ts` - scans `src/` for status hues; the phase hues must avoid
  `emerald`, `amber`, `sky`, `rose`, `red`.
- `src/data/index.ts` - `getSummaryPast` and `getSummaryToday`: add the third read, constant,
  error check and cast.
- `src/components/ColumnChart.tsx` - the shared chart card, used as is.
- `src/components/ModelColumnChart.tsx` - the pattern for the new chart (empty state, summary,
  aria labels, tooltip detail rows).
- `src/components/DayCharts.tsx` - renders the third card and changes the breakpoint.
- `src/components/SummaryDayCard.tsx` - doc comment mentions "class and model charts"; update.
- `src/components/TodaySummary.tsx` - renders `SummaryDayCard` from the query; no change expected,
  read to confirm it gets `phases` through `getSummaryToday`.
- `e2e/test_day_card_charts.md` - the day card charts journey; extended for the third chart.

### New Files

- `src/lib/phase-usage.ts` - phase keys, fixed order, display names, `phaseName`, `sumPhaseUsage`.
- `src/lib/phase-usage.test.ts` - unit tests for the above.
- `src/components/PhaseColumnChart.tsx` - the "Cost by phase" chart card.

## Implementation Plan

### Phase 1: Foundation

Types, the pure phase module with its tests, and the phase colours. Nothing renders yet.

### Phase 2: Core Implementation

Assembly in `toSummaryReport`/`toSummaryDay` (with tests), the boundary read in `src/data/index.ts`,
and the `PhaseColumnChart` component.

### Phase 3: Integration

`DayCharts` renders the third card at the new breakpoint; both the past days (server) and the
today card (client, via `getSummaryToday` as `queryFn`) pick it up through `SummaryDay.phases`.
Docs and the e2e journey follow.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Types in `src/types/adw.ts`

- Add `DailyPhaseSummary` beside `DailyModelSummary` with a doc comment in the same style:
  `project_id: string; day: string; phase: string; runs: number; input: number; cache_read: number;
cache_creation: number; output: number; cost_usd: number; duration_s: number;`. Note that runs
  that published no per-phase metrics are absent and that `phase` is the toolkit's step key (such
  as `adw_plan_iso`). Before writing which run timestamp `day` keys on, read SBub/adw-toolkit#70's
  migration (`gh pr view` or `gh api` on the toolkit repo, read-only); state what it says, do not
  guess.
- Add `SummaryPhase`: `phase: PhaseKey` (import the type from `@/lib/phase-usage` is not allowed
  in the types file if it creates a cycle; instead declare `phase: string` narrowed by the lib, or
  define `PhaseKey` in the lib and import it as a type, like `chart-colors.ts` imports `ClassKey`;
  prefer the type import), `runs`, `input`, `cache_read`, `cache_creation`, `output`, `cost_usd`,
  `duration_s`, all numbers.
- Add `phases: SummaryPhase[]` to `SummaryDay` and extend its doc comment (pipeline order, empty
  when no run of that day published per-phase metrics). Update the file's header comment to list
  `DailyPhaseSummary`.

### 2. Pure phase module `src/lib/phase-usage.ts`

- Header comment in the style of `model-usage.ts` (pure, no clock, no cache, no IO; tested in
  `src/lib/phase-usage.test.ts`).
- `export const PHASE_ORDER = ["adw_plan_iso", "adw_build_iso", "adw_test_iso", "adw_review_iso",
"adw_document_iso"] as const;` and `export type PhaseKey = (typeof PHASE_ORDER)[number];`
  (`adw_ci_iso` is deliberately not a key: it has no cost). Only export what another file uses
  (knip); keep the map unexported if only `phaseName` reads it.
- `const PHASE_NAMES: Record<PhaseKey, string> = { adw_plan_iso: "Plan", adw_build_iso: "Build",
adw_test_iso: "Test", adw_review_iso: "Review", adw_document_iso: "Document" };` and
  `export function phaseName(phase: PhaseKey): string`.
- A type guard `isPhaseKey(value: string): value is PhaseKey` (not exported unless needed).
- `export function sumPhaseUsage(rows: readonly DailyPhaseSummary[]): SummaryPhase[]`: one entry
  per known phase that has at least one row, every numeric column summed (`runs`, `input`,
  `cache_read`, `cache_creation`, `output`, `cost_usd`, `duration_s`), cost rounded with
  `Math.round(x * 1e4) / 1e4`, `adw_ci_iso` and unknown keys dropped, returned in `PHASE_ORDER`
  order, never mutating its input (build fresh entry objects). The caller filters by day and
  visible project, as for `sumModelUsage`.

### 3. Unit tests `src/lib/phase-usage.test.ts`

Modelled on `model-usage.test.ts`, with a `row(overrides)` factory:

- `phaseName` maps each of the five keys to Plan, Build, Test, Review, Document (`it.each`).
- `PHASE_ORDER` is exactly the five keys in pipeline order and does not contain `adw_ci_iso`.
- `sumPhaseUsage`:
  - empty input gives `[]`;
  - rows given in reverse order (document, review, test, build, plan) come out in pipeline order;
  - two projects' rows of one phase are summed column for column (including `runs` and
    `duration_s`);
  - cost rounding: `0.1 + 0.2` style inputs come out as `0.3`, and a sum such as `1.23456 + 1`
    rounds to `2.2346`;
  - `adw_ci_iso` rows are dropped, and so is an unknown key (`adw_foo_iso`, `""`);
  - a phase with no rows is omitted (only build and test given: two entries);
  - the input array and its row objects are unchanged after the call (deep-equal to a copy taken
    before).

### 4. Phase colours in `src/lib/chart-colors.ts`

- Add `PHASE_BG: Record<PhaseKey, string>` with full literal class strings outside the class,
  model and status palettes, for example `adw_plan_iso: "bg-cyan-500"`, `adw_build_iso:
"bg-blue-500"`, `adw_test_iso: "bg-purple-500"`, `adw_review_iso: "bg-pink-500"`,
  `adw_document_iso: "bg-yellow-500"`. Never `emerald`, `amber`, `sky`, `rose` or `red`
  (`status-colors.test.ts` scans for them). Update the file's header comment (phases are not
  states either).

### 5. Assembly in `src/lib/daily-summary.ts`

- `toSummaryReport(rows, modelRows, phaseRows, projects, options)`: a `phasesByDay` map built like
  `modelsByDay` (skip rows whose `project_id` is not visible), and `phases: sumPhaseUsage(
phasesByDay.get(day) ?? [])` on each day. As with models, a day with phase rows but no
  `daily_summary` row gets no card. Update the doc comment.
- `toSummaryDay(rows, modelRows, phaseRows, projects, day)`: filter `phaseRows` to `day` too and
  pass them through. Update the doc comment ("in all three arrays").
- Keep argument order consistent in both (rows, model rows, phase rows, projects, ...).

### 6. Assembly tests in `src/lib/daily-summary.test.ts`

- Add a `phaseRow(overrides)` factory beside `modelRow` and pass `[]` as the new argument at every
  existing call site.
- New `describe("toSummaryReport phases", ...)`, mirroring the models block: empty when no phase
  rows; a phase summed over two projects and attached to its day only (the other day has `[]`);
  a hidden project's phase rows dropped; phase rows of a day with no `daily_summary` row add no day.
- In the `toSummaryDay` block, a case that phase rows of other days are ignored.

### 7. Boundary read in `src/data/index.ts`

- Add `DAILY_PHASE_SUMMARY_COLUMNS = "project_id, day, phase, runs, input, cache_read,
cache_creation, output, cost_usd, duration_s"` with the same doc comment shape ("exactly the
  fields of DailyPhaseSummary").
- `getSummaryPast`: add a fourth element to the `Promise.all`, `getSupabase().from(
"daily_phase_summary").select(DAILY_PHASE_SUMMARY_COLUMNS).gte("day", from).lt("day", today)`;
  `if (phaseRows.error) throw new Error(\`daily_phase_summary: ${phaseRows.error.message}\`)`; pass
`(phaseRows.data ?? []) as DailyPhaseSummary[]`to`toSummaryReport`.
- `getSummaryToday`: the same with `.eq("day", today)` and `toSummaryDay`.
- Update the file header comment and both functions' doc comments (four reads in parallel, the
  phase view). No new export, no new cache scope, no new query key: `getSummaryToday` stays the
  `queryFn` of `TodaySummary`, so the refetch returns `phases` too.

### 8. Chart component `src/components/PhaseColumnChart.tsx`

- No `"use client"`, no state, no server-only import (it is rendered by the client `TodaySummary`).
- Props `{ phases: SummaryPhase[]; day: string }`.
- `ColumnChart` with `title="Cost by phase"`, `subtitle="What each pipeline step cost that day"`,
  `idPrefix={\`cost-by-phase-${day}\`}`, `empty="No per-phase usage published."`, `summary`of`"Cost by phase: no per-phase usage published."` when empty, else
`` `Cost by phase: ${phases.map((p) => `${phaseName(p.phase)} ${costLabel(p.cost_usd)}`).join(", ")}` ``.
- Columns: `key: p.phase`, `value: p.cost_usd`, `valueLabel: costLabel(p.cost_usd)`,
  `name: phaseName(p.phase)`, `ariaLabel: \`${phaseName(p.phase)}: ${costLabel(p.cost_usd)}\``,
`colorClass: PHASE_BG[p.phase]`, `detail`: `Input`, `Cache read`, `Cache write`, `Output`(each`tokensLabel`), `Time` (`secondsLabel(p.duration_s)`), `Runs` (`String(p.runs)`).
- Doc comment in the style of `ModelColumnChart` (pipeline order, CI omitted, empty state keeps
  caption and plot height).

### 9. Layout in `src/components/DayCharts.tsx` and `SummaryDayCard.tsx`

- Render `<PhaseColumnChart phases={day.phases} day={day.day} />` third.
- Change the grid to `grid gap-3 lg:grid-cols-3` and the doc comment ("three chart cards ... one
  row from 1024px (`lg`), stacked below"). The cards are `min-w-0`, so nothing overflows.
- Update `SummaryDayCard`'s doc comment to name the phase chart.

### 10. Extend the e2e journey `e2e/test_day_card_charts.md`

Extend it rather than adding a new file (the profile's journey list stays unchanged):

- Intro and User Story: three chart cards, "Cost by phase" included.
- Step 2: three `figure`s, the third captioned `Cost by phase` with subtitle
  `What each pipeline step cost that day`, all three with the same `top` at 1920x1080.
- New step after step 4: **Verify** the phase figure's labels are a subsequence of `Plan`,
  `Build`, `Test`, `Review`, `Document`, never `CI`, and each column's value text matches
  `^(\$\d+\.\d{2}|<\$0\.01)$`; or the figure says `No per-phase usage published.`
- Step 6: when the phase figure has a column, hover it and then focus it with Tab and **Verify**
  in both cases the tooltip shows `Input`, `Cache read`, `Cache write`, `Output`, `Time` and
  `Runs`.
- Step 9: the server HTML also contains `Cost by phase`.
- Step 11: at 375x667 the three cards are stacked (each figure's `top` at or below the previous
  one's `bottom`) with no horizontal overflow; add a check at 1024x768 that the three share one
  row and `document.documentElement.scrollWidth <= window.innerWidth`.
- Success Criteria updated accordingly; screenshot count unchanged or bumped to 3 if the 1024
  screenshot is added.

### 11. Documentation

- `README.md` "Summary": three chart cards, one row from 1024px, the "Cost by phase" card (order,
  CI omitted, value, tooltip, empty state); in "Data", the third view read in the same
  `Promise.all`, its cast `DailyPhaseSummary`, `sumPhaseUsage` in `src/lib/phase-usage.ts` into
  each day's `phases`.
- `AGENTS.md`: the boundary-casts list and column-constant rule add `DailyPhaseSummary` and
  `DAILY_PHASE_SUMMARY_COLUMNS`; the data-boundary paragraph says both summary reads also read
  `daily_phase_summary` in the same `Promise.all`; the stateless components list adds
  `PhaseColumnChart` (also rendered by `TodaySummary`); the chart-orders rule adds phases Plan,
  Build, Test, Review, Document from `sumPhaseUsage`, CI omitted; the colours rule adds
  `PHASE_BG`; the `DayCharts` rule says three cards, one row from `lg`, stacked below; a rule that
  phase keys, order and names live only in `src/lib/phase-usage.ts`, pure and tested, every change
  with a test case. `src/types/adw.ts` paragraph mentions `DailyPhaseSummary`. No em-dashes.
- `.adw/project.md` Review section: "work-by-class, tokens-by-model and cost-by-phase chart cards".
  Do not touch any `##` heading.

### 12. Run the Validation Commands

Run every command below from the root and fix anything that fails without weakening a rule, type or
test.

## Testing Strategy

### Unit Tests

- `src/lib/phase-usage.test.ts` (new): phase order, name mapping, CI and unknown keys dropped,
  per-phase summing across projects, cost rounding, empty input, omitted phases, no mutation.
- `src/lib/daily-summary.test.ts` (extended): `phases` assembled per day, hidden projects dropped,
  other days ignored by `toSummaryDay`, no day added from phase rows alone.

### Test Coverage

- `src/lib/phase-usage.test.ts` (unit, vitest): catches a wrong phase order, a wrong display name,
  CI leaking into the chart, unsummed or unrounded cost, and input mutation; nothing tests per-phase
  aggregation today, and the file fails to import without the feature.
- `src/lib/daily-summary.test.ts` new `toSummaryReport phases` cases (unit, vitest): catch phases
  not attached to their day, a hidden project's cost leaking in, or the today card's `toSummaryDay`
  picking up other days; they fail without `phases` on `SummaryDay`.
- The component and layout have no unit layer in this project (no component tests, E2E code suite
  `none`); their browser evidence is the extended journey (task 10) and the review screenshots.

### Edge Cases

- A day with no phase rows: the card keeps caption and 180px plot and says
  "No per-phase usage published."
- A day with only `adw_ci_iso` rows: same empty state (CI dropped).
- A phase with cost under one cent: label `<$0.01`, bar height from `columnHeights`, value above.
- A phase with cost exactly 0 but runs (a free step): kept as a column with `$0.00` (present rows
  are never dropped for a zero value; only absent phases are omitted). Cover in the tests.
- An unknown future phase key from the toolkit: dropped, no crash.
- Phase rows for a hidden project: dropped.
- Phase rows on a day with no finished run: no card is added.
- Floating point noise in summed cost: rounded to 4 decimals.
- Viewport 1023px (stacked) vs 1024px (three-up), and 375px: no horizontal overflow.

## Acceptance Criteria

- Every day card on `/`, past days and today, shows "Cost by phase" as its third chart card with
  the subtitle "What each pipeline step cost that day".
- Columns are a subsequence of Plan, Build, Test, Review, Document; CI never appears.
- Each bar shows its cost as `$X.XX` (or `<$0.01`) inside the bar or above a short bar.
- The tooltip opens on hover and on keyboard focus and shows Input, Cache read, Cache write,
  Output, Time and Runs.
- With no per-phase data, the card keeps its caption and plot height and reads
  "No per-phase usage published."
- The phase rows come from the same `Promise.all` in `getSummaryPast` and `getSummaryToday`; no new
  cache scope, tag, query key or export in `src/data/`.
- The Refresh button on the today card refetches the phase chart with the rest of the card.
- Three cards in one row from 1024px, stacked below, no horizontal overflow at 375px.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test` and `yarn build`
  pass; the extended `e2e/test_day_card_charts.md` journey passes.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint` - ESLint, including `react-hooks/purity` on the new component.
- `yarn typecheck` - the new types, the extra `toSummaryReport`/`toSummaryDay` argument at every
  call site and the cast in `src/data/index.ts`.
- `yarn knip` - no unused export left in `src/lib/phase-usage.ts` or `chart-colors.ts`.
- `yarn format:check` - Prettier on every touched file.
- `yarn test` - the new and extended unit tests, plus `status-colors.test.ts` and `layers.test.ts`
  scanning the new component and colours.
- `yarn build` - the summary scopes read `daily_phase_summary` at build time against the hosted
  project (needs `.env.local`); proves the column list matches the view.

## Notes

- No new dependency.
- Choice recorded for the issue's "omitted or present with zeros": phases with no rows are
  omitted, matching `classCounts` and `sumModelUsage`; a phase present with a zero cost is kept.
- `adw.daily_phase_summary` is live on the linked project (verified read-only while planning).
  Whether its `day` is the UTC day of `started_at` (like the model view) or `finished_at` (like
  `daily_summary`) decides the README wording; check the toolkit migration (#70) before writing it.
- `PHASE_ORDER` holds only the toolkit's current `adw_*_iso` step names; a new step in the toolkit
  is dropped until it is added here with a name, a colour and a test case.
- Commits follow the profile: `feat: ...`, no trailers.
