# Bug: Column charts: equal spacing between columns

## Metadata

issue_number: `131`
adw_id: `1e16f170`
issue_json: `{"number":131,"title":"Column charts: equal spacing between columns","body":"In the day card charts the gaps between columns are uneven. In \"Cost by phase\" the gap before \"Document\" is visibly wider than the others, because each column is sized from its content: in ColumnChart.tsx the columns are <li> items in a flex justify-center row with a gap, each grow with max-w-20 and a 48px floor (min-w-12) on the plot. ... Change in src/components/ColumnChart.tsx (shared by all three charts): 1. equal-width slot (CSS grid repeat(n, minmax(0, 1fr)) or equivalent) independent of label length. 2. bar centred in its slot, same width for every bar (capped as today). 3. label centred under its bar, wraps (or truncates with full text in tooltip and aria-label), never pushing bars apart. 4. Same in all three charts; check 2, 3 and 5 columns and a narrow (mobile) card. 5. Unit or e2e check: horizontal distance between centres of adjacent bars equal within 1 px."}`

## Bug Description

On `/` every day card shows three chart cards ("Work by class", "Tokens by model", "Cost by phase"),
all rendered by `src/components/ColumnChart.tsx`. The space between neighbouring bars is uneven: in
"Cost by phase" the gap before "Document" is visibly wider than between Plan, Build, Test and
Review. The same happens in any chart whose names differ in length (for example a long model short
name next to "Opus").

Expected: every column gets the same slot width, every bar has the same width and is centred in its
slot, so the distance between the centres of adjacent bars is identical (within 1px) regardless of
the names under them. Actual: a column with a longer name is wider, so its bar sits further from its
neighbours.

## Problem Statement

The column width is derived from content. The `<ul>` is `flex items-start justify-center` with a
gap, and each `<li>` is `grow max-w-20` whose plot box has a `min-w-12` floor. A flex item's base
size is its content width, so the `<li>` is as wide as the wider of its plot and its name row (up to
80px). Free space is then split equally by `grow` on top of unequal bases, the bar (`w-full
max-w-14`) is centred in that unequal box, and the bar centres end up unequally spaced.

## Solution Statement

In `ColumnChart.tsx` only, replace the flex row with a CSS grid whose tracks are all equal and
independent of content:

- `<ul>` becomes `relative grid items-start justify-center` plus the existing gap classes
  (`gap-1` for five or more columns, `gap-2 sm:gap-4` otherwise), with
  `style={{ gridTemplateColumns: \`repeat(${columns.length}, minmax(0, 5rem))\` }}`.
`minmax(0, 5rem)` keeps today's 80px cap (`max-w-20`) so a two- or three-column chart is still a
compact centred group (`justify-center`is`justify-content: center`on a grid), and the`0`
  minimum means no track is sized from its content: the free space is distributed equally, so all
  slots are always the same width, including on a narrow card. An inline style is used because the
  track count is data-driven, the same way the bar height already is.
- `<li>`: drop `max-w-20` and `grow` (the track sets the width), add `min-w-0`; keep `group
relative flex flex-col items-center` and the focus outline.
- Plot box: drop the `min-w-12` floor (it would make a plot wider than a slot narrower than 48px
  and break the equal spacing); keep `flex h-45 w-full flex-col items-center justify-end`.
- Bar: unchanged `w-full max-w-14` (56px cap as today). Since every slot is the same width, every
  bar is the same width and centred in its slot.
- Name row: keep `mt-2 flex flex-wrap items-center justify-center gap-1 text-center text-xs` (the
  e2e journey selects `li > span.mt-2`), add `w-full min-w-0`, and wrap `{column.name}` in
  `<span className="min-w-0 wrap-anywhere">` so a name wider than its slot first wraps under its
  dot (flex-wrap, as today) and only then breaks inside the word, staying inside its slot and never
  widening the column. The name is never truncated, so the full text stays visible (the journey's
  `scrollWidth <= clientWidth` check keeps holding) and `aria-label` is unchanged.
- Tooltip, value placement (`barValueInside`), guide lines, empty state: unchanged.

Update the component's doc comment, the AGENTS.md chart-geometry rule and the README summary
paragraph to describe equal slots instead of content-sized columns.

## Steps to Reproduce

1. `yarn dev` (port from `.ports.env`), open `http://localhost:$PORT/` at 1920x1080.
2. Find a day card whose "Cost by phase" has all five phases.
3. In the console:
   ```js
   [...document.querySelectorAll("figure")]
     .filter((f) => f.querySelector("figcaption")?.textContent?.startsWith("Cost by phase"))[0]
     .querySelectorAll("li > span:first-child > span[style]");
   ```
   map each bar's `getBoundingClientRect()` to `left + width / 2` and diff adjacent centres: the
   Review to Document distance is larger than Plan to Build by several pixels.
4. Repeat at 1024x768 and 375x667: the difference persists.

## Root Cause Analysis

Content-sized flex items. `flex-grow` distributes free space equally but on top of each item's
content-based base size, so an item whose name row is wider ("Document", about 8px dot plus gap
plus a long word) starts wider and stays wider. The bar is centred inside its item, so its centre
moves by half of the extra width, and the gap between bar edges grows on both sides while the
`gap` between item boxes is constant. The `min-w-12` floor on the plot and `max-w-20` cap on the
item are also content-relative bounds and do not equalise widths. A grid with `minmax(0, <cap>)`
tracks removes the content from track sizing entirely.

## Relevant Files

Use these files to fix the bug:

- `src/components/ColumnChart.tsx`: the shared chart; the only code change (ul layout, li, plot box,
  name row, doc comment).
- `src/components/ClassColumnChart.tsx`, `src/components/ModelColumnChart.tsx`,
  `src/components/PhaseColumnChart.tsx`: the three callers; read only, to confirm nothing passes
  layout and all three get the fix (2 to 5 columns).
- `src/components/DayCharts.tsx`: the three-card grid (one row from `lg`, stacked below); read only,
  it sets the card widths the slots divide.
- `src/lib/daily-summary.ts`: `columnHeights`, `barValueInside`; unchanged, the bar height and value
  placement must keep coming only from them.
- `e2e/test_day_card_charts.md`: the existing journey for the chart cards; extended with the
  equal-spacing check.
- `AGENTS.md` (Summary section, the "A column grows from its content with a 48px floor" rule):
  rewritten to the equal-slot rule.
- `README.md` (`## Summary`): one sentence about the columns' equal slots.
- `.adw/project.md`: read only; no script, port or doc location changes, so no profile update.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Switch `ColumnChart` to equal grid slots

- In `src/components/ColumnChart.tsx`, change the `<ul>` to
  `className={\`relative grid items-start justify-center ${gap}\`}`and`style={{ gridTemplateColumns: \`repeat(${columns.length}, minmax(0, 5rem))\` }}`. Keep the `gap`
  constant as is.
- On the `<li>`, replace `max-w-20 grow` with `min-w-0`; keep every other class.
- On the plot `<span>`, remove `min-w-12`.
- Leave the bar `<span>` (`w-full max-w-14`, height style, value placement) unchanged.
- On the name row `<span className="mt-2 ...">`, add `w-full min-w-0`, and wrap `{column.name}` in
  `<span className="min-w-0 wrap-anywhere">`. Do not add `truncate`, `line-clamp` or a `title`.
- Rewrite the doc comment's geometry sentences: every column takes an equal grid slot (at most
  80px, `minmax(0, 5rem)`), independent of its name; the bar is capped at 56px and centred in its
  slot, so adjacent bars are equally spaced; a name wider than its slot wraps under its dot and then
  inside the word, never widening the slot; five or more columns take a 4px gap. Keep "Stateless and
  without \"use client\"". No em-dashes.

### 2. Update the documentation rules

- `AGENTS.md`, Summary section: replace "A column grows from its content with a 48px floor
  (`min-w-12` on its plot box, no fixed width, no `truncate`), so a name is never cut: when the
  column is narrower than its dot and name, the name wraps under the dot, and a chart with five or
  more columns uses `gap-1` ..." with: every column takes an equal grid slot
  (`repeat(n, minmax(0, 5rem))`, never sized from its content), the bar is capped (`max-w-14`) and
  centred in it so adjacent bars are equally spaced; a name never widens its slot and is never cut
  (no `truncate`): it wraps under its dot and then inside the word (`wrap-anywhere`); a chart with
  five or more columns uses `gap-1` so the row fits a one-third card at `lg` and a stacked card at
  375px; keep the `h-45` and `barValueInside` clauses.
- `README.md`, `## Summary`: after "bars with rounded tops and a capped width", add that every
  column takes the same slot width whatever its name, so the bars are evenly spaced.

### 3. Extend the chart journey with the spacing check

- In `e2e/test_day_card_charts.md`, add a step after step 6: **Verify** with `browser_evaluate`,
  for each of the three figures of the card that has two or more columns, that the bars (each
  `li`'s coloured bar, the element with an inline `height` style inside the plot) all have the same
  `getBoundingClientRect().width` within 1px, and that the distances between the centres
  (`left + width / 2`) of adjacent bars are equal within 1px. Note which column counts (2, 3, 5) the
  page offered.
- In steps 12 (1024x768) and 13 (375x667), add the same centre-distance check for every figure.
- Add matching lines to `## Success Criteria`: bars in each chart have equal widths and equally
  spaced centres (within 1px) at 1920, 1024 and 375 wide, whatever the names under them.
- The journey is the right layer for this: the claim is about rendered geometry, and the profile
  has no component or DOM test layer and no Playwright code suite. It already exists, so this
  extends it rather than adding one.

### 4. Review-phase evidence

- The reviewer opens `/` at 1920x1080, 1024x768 and 375x667 and screenshots a day card whose "Cost
  by phase" has five columns: the gap before "Document" equals the others, "Document" is shown in
  full under its bar, and the three cards still share one row at 1024 and stack at 375 without
  horizontal overflow. Also look at a "Tokens by model" with two or three columns (compact centred
  group, bars no wider than before).

### 5. Run the validation commands

- Run every command in `Validation Commands` and fix anything that fails.

## Test Coverage

No unit test needed: the bug is pure CSS layout in a stateless component (`ColumnChart`), and the
profile's only automated layer is `src/**/*.test.ts` for pure helpers, with no component or DOM
test layer; no helper logic changes (`columnHeights` and `barValueInside` are untouched), so a unit
test could only assert a class string, which would not prove spacing. The regression check that
would fail on the unfixed code (the 1px centre-distance check of item 5 of the issue) goes into the
existing agent-driven journey `e2e/test_day_card_charts.md` (task 3), which the test phase runs.

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- Before the fix, reproduce with the console snippet in `Steps to Reproduce` on `/` (unequal
  centre distances in a five-column "Cost by phase"); after the fix, the same snippet gives equal
  distances within 1px at 1920, 1024 and 375 wide.
- `yarn lint`: ESLint, the commit hook's lint gate.
- `yarn typecheck`: `next typegen` and `tsc --noEmit` on the changed component.
- `yarn knip`: no dead code or exports left behind.
- `yarn format:check`: Prettier on the changed files (`yarn format` to fix).
- `yarn test`: every unit test, including `status-colors.test.ts` and `layers.test.ts`, which scan
  `src/` for inline status hues and z-indexes.
- `yarn build`: the production build, which prerenders `/`'s shell and proves the charts still
  render server-side.

## Notes

- No new dependency. `wrap-anywhere` is a Tailwind 4 utility (installed 4.3.3; the codebase already
  uses its sibling `wrap-break-word` in `RunRow` and `QueueRow`).
- `5rem` matches the removed `max-w-20`, and `max-w-14` is kept, so charts with few columns look as
  before; only the spacing changes. With five columns in a one-third card at 1024 the slots are
  about 54px, wide enough for "Document" at `text-xs`; `wrap-anywhere` is the guard for a longer
  model short name, not the normal path.
- Keep the name row's `mt-2` class: journey steps 12 and 13 select `li > span.mt-2`.
- No profile change: no script, port, env file or doc location moves.
