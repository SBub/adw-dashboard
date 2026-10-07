# Feature: Day card charts as two separate chart cards

## Metadata

issue_number: `116`
adw_id: `45cff3d3`
issue_json: `{"number":116,"title":"Day card charts: two separate chart cards in the style of Artificial Analysis"}`

## Feature Description

Every day card on the summary (`/`), the client-refreshed today card included, shows two small
column charts under its header (from #103): runs by class and tokens by model. Today they sit in
one flex-wrap row with a 48px plot box, the value above each column and the name below, and they
read as one cramped block where labels and counts are not clearly attached to their columns.

This feature redesigns them in the style of the Artificial Analysis comparison charts:

- Two separate chart cards, side by side from the `sm` breakpoint (640px) and stacked below it,
  each with a small coloured square, a title and a one-line muted subtitle: "Work by class" /
  "Runs finished that day" and "Tokens by model" / "All tokens, including cache reads".
- A fixed order every day: classes `feature`, `chore`, `bug`, `patch`, then `other`; models from
  least to most capable, `Haiku`, `Sonnet`, `Opus`, then any other model. Absent entries are
  omitted, the rest keep their relative order. Never sorted by value.
- A 180px plot area with a few faint dotted horizontal guide lines, rounded bar tops, bar width
  capped so two or three bars do not stretch across the card.
- The value (run count, or the k/M token label) inside the bar in white, vertically centred; when
  the bar is too short for it, just above the bar in the normal text colour.
- Under each bar, text only: the class name without its slash (`feature`) or the short model
  name (`Opus`), with a small colour dot matching the bar.
- Tooltips (hover and keyboard focus): token bars show input, cache read, cache write, output and
  the model's cost that day; class bars show the run count and the share of the day's runs.
- Every bar keeps an `aria-label` with its label and value; every chart keeps a text alternative
  listing its values.

## User Story

As a visitor reading the ADW public ledger on `/`
I want each day's class split and model split shown as two clearly separated, consistently
ordered charts with the numbers on the bars
So that I can read a day at a glance and compare days without hunting for which label belongs to
which column

## Problem Statement

The two charts share one row, one caption style and a 48px plot, with the value above and the
name below each thin column. Labels drift away from their columns, the class and model charts
blur into one block, and the order changes from day to day (classes in a different fixed order,
models largest total first), so two days cannot be compared by position. The model tooltip lacks
the cost already on the data, and class columns have no tooltip at all.

## Solution Statement

Keep the existing stateless component chain (`SummaryDayCard` -> `DayCharts` ->
`ClassColumnChart` / `ModelColumnChart` -> `ColumnChart`) and every rule around it (no
`"use client"`, no server-only imports, rendered by the client `TodaySummary` too, CSS columns, no
charting library, colours only from `src/lib/chart-colors.ts`). Change:

1. **Order in the data shape, not in the component.** `classCounts` in
   `src/lib/daily-summary.ts` changes its fixed order to `/feature`, `/chore`, `/bug`, `/patch`,
   `other` (the per-project table's `ClassDistributionBar` uses the same order through
   `classSegments`, so the class order is one order across the page). `sumModelUsage` in
   `src/lib/model-usage.ts` sorts by capability (`haiku`, `sonnet`, `opus`, `other`), then
   largest total first, then model id, so two versions of a family stay adjacent and
   deterministic. Components keep rendering the arrays as given.
2. **Pure geometry and label helpers**, all in `src/lib/daily-summary.ts` and unit-tested:
   - `CHART_PLOT_PX = 180` and `BAR_VALUE_MIN_PX = 20` (the height of one `text-xs` line plus
     padding), and `barValueInside(heightPercent: number): boolean`, true when
     `heightPercent / 100 * CHART_PLOT_PX >= BAR_VALUE_MIN_PX`.
   - `classLabel(key: ClassKey): string`, the key without its leading slash (`"/feature"` ->
     `"feature"`, `"other"` -> `"other"`).
   - `shareLabel(count: number, total: number): string`, a whole percent (`"43%"`, rounded half
     up), `"<1%"` for a non-zero share under 0.5%, `"0%"` when `total` is 0. No `Intl`.
3. **`ColumnChart` rebuilt as a chart card**: a `figure` with a border and padding, a
   `figcaption` holding the coloured square, the title and the muted subtitle, the `sr-only` text
   alternative, then a `relative` plot box `h-45` (180px in Tailwind 4) with four `aria-hidden`
   dotted guide lines (`border-t border-dotted` in neutral-200 / dark neutral-800 at 25, 50, 75
   and 100 percent) behind a `ul` of columns (`flex items-end justify-center gap-4`, each `li`
   `flex-1 max-w-20 min-w-12`, the bar `w-full max-w-14 rounded-t-md`). The value goes inside the
   bar (`flex items-center justify-center text-white text-xs font-semibold tabular-nums`) when
   `barValueInside(height)` holds, otherwise in a span just above the bar in the normal text
   colour; the value span carries `data-value-placement="inside" | "above"` so the e2e journey can
   check placement without measuring pixels. Under the plot, per column, a label row: a `size-2`
   rounded dot with the bar's colour class and the name, `whitespace-nowrap`, never truncated.
   The CSS-only tooltip (group hover and `focus-within`, `role="tooltip"`, `aria-describedby`)
   stays as is, now on every column that has `detail`, keeping its `z-10` (below
   `TOOLTIP_LAYER`). New props: `subtitle: string` and `swatchClass: string`.
4. **`ClassColumnChart`**: title "Work by class", subtitle "Runs finished that day", swatch
   `CLASS_BG["/feature"]`, name `classLabel(key)`, aria-label `feature: 3 runs`, summary
   `Work by class: 3 feature, 1 chore`, and a `detail` of `Runs` (the count) and `Share`
   (`shareLabel(count, total)` with `total` the sum of the present counts).
5. **`ModelColumnChart`**: title "Tokens by model", subtitle "All tokens, including cache reads",
   swatch `MODEL_BG.opus`, the same short names and token labels, and a `detail` of `Model` (full
   id), `Input`, `Cache read`, `Cache write` (from `cache_creation`), `Output` and `Cost`
   (`costLabel(m.cost_usd)`). The empty state ("No per-model usage published.") keeps the card
   and fills the 180px plot box.
6. **`DayCharts`**: `grid gap-3 sm:grid-cols-2` instead of the flex-wrap row.
7. Docs (`AGENTS.md`, `README.md`) and the e2e journey `e2e/test_day_card_charts.md` updated to
   the new design.

## Relevant Files

Use these files to implement the feature:

- `README.md`, section "Summary" (around lines 1208-1260): describes the two charts (one
  baseline, value above, class below, largest total first, hover split). Update to the card
  design, the fixed orders, value inside the bar and the tooltips with cost and share.
- `AGENTS.md`, section "Summary" (the "Charts are inline SVG or CSS columns" and "Each day card
  shows two column charts" bullets, around lines 608-620) and the stateless component list in
  "Architecture" (around lines 306-316): the rule "the plot box stays `h-12`" becomes 180px, the
  geometry list gains `barValueInside`, `classLabel`, `shareLabel`, and the fixed orders become
  rules. No new component, so the stateless list keeps its names.
- `.adw/project.md`: the Review section already mentions "runs-by-class and tokens-by-model
  charts"; update the wording to "work-by-class and tokens-by-model chart cards". The e2e file
  name stays `e2e/test_day_card_charts.md`, so the Tests list needs no change.
- `src/components/ColumnChart.tsx`: the shared column chart, rebuilt as the chart card.
- `src/components/ClassColumnChart.tsx`: class chart, new title, subtitle, labels, tooltip.
- `src/components/ModelColumnChart.tsx`: model chart, new subtitle, tooltip with cache write and
  cost.
- `src/components/DayCharts.tsx`: layout of the two cards.
- `src/components/SummaryDayCard.tsx`: renders `DayCharts`; check spacing only (`space-y-3`).
- `src/components/TodaySummary.tsx`: the client today card renders `SummaryDayCard`; nothing
  changes, but every component above must stay free of `"use client"` and server-only imports.
- `src/components/ClassDistributionBar.tsx`: uses `classSegments`, so it follows the new class
  order; no code change.
- `src/lib/daily-summary.ts` and `src/lib/daily-summary.test.ts`: `classCounts` order, new
  `CHART_PLOT_PX`, `BAR_VALUE_MIN_PX`, `barValueInside`, `classLabel`, `shareLabel`.
- `src/lib/model-usage.ts` and `src/lib/model-usage.test.ts`: `sumModelUsage` order.
- `src/lib/chart-colors.ts`: `CLASS_BG` and `MODEL_BG`, reused unchanged; update the comments
  naming their consumers only if they change.
- `src/lib/status-colors.test.ts` and `src/lib/layers.test.ts`: scan `src/` for forbidden hue
  classes and z-indexes; the new markup must use neither `emerald`, `amber`, `sky`, `rose`, `red`
  nor a z-index at or above `z-50`.
- `src/types/adw.ts`: `SummaryModel` (has `cost_usd`), `SummaryDay`; read only.
- `e2e/test_day_card_charts.md`: the existing journey for these charts, rewritten.
- `knip.json`: every new export must be used outside its file or it fails `yarn knip`
  (`CHART_PLOT_PX` and `BAR_VALUE_MIN_PX` only if a component imports them; otherwise keep them
  unexported).

### New Files

None. The journey file is rewritten in place.

## Implementation Plan

### Phase 1: Foundation

Pure helpers and orders, test first: change `classCounts`' order and `sumModelUsage`'s sort,
add `barValueInside`, `classLabel` and `shareLabel` with their constants, and update or add the
unit tests in `src/lib/daily-summary.test.ts` and `src/lib/model-usage.test.ts`.

### Phase 2: Core Implementation

Rebuild `ColumnChart` as a chart card (caption with swatch, title and subtitle, 180px plot with
dotted guides, capped bars, value inside or above, dot-and-name labels, tooltip unchanged in
mechanism), then adapt `ClassColumnChart` and `ModelColumnChart` to its new props and data.

### Phase 3: Integration

Switch `DayCharts` to a two-column grid from `sm`, rewrite the e2e journey, update `README.md`,
`AGENTS.md` and the profile's Review wording, and run every validation command.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Fixed class order

- In `src/lib/daily-summary.ts`, reorder `classCounts`' list to `/feature`, `/chore`, `/bug`,
  `/patch`, `other` and update its doc comment ("Shared by the class bar and the class column
  chart", same order in both).
- In `src/lib/daily-summary.test.ts`, update the `classCounts` expectations to the new order, and
  add a case where a class is missing (`features: 2, chores: 0, bugs: 1, patches: 0, runs: 4`
  gives `/feature`, `/bug`, `other`) proving the rest keep their relative order.
- Update the `classSegments` test that pins the segment order (`/feature`, `/chore`, `/patch`,
  `other` stays valid; add `/bug` to one case so chore-before-bug is pinned there too, and adjust
  the offsets it checks).

### 2. Fixed model order

- In `src/lib/model-usage.ts`, add a module-level rank `{ haiku: 0, sonnet: 1, opus: 2, other: 3 }`
  (typed `Record<ModelFamily, number>`) and sort `sumModelUsage`'s result by
  `rank[modelFamily(a.model)] - rank[modelFamily(b.model)]`, then `b.total - a.total`, then model
  id. Update its doc comment ("least to most capable family first, then largest total, then
  model id").
- In `src/lib/model-usage.test.ts`, update the existing ordering expectations and add: a day with
  opus, haiku and sonnet rows (opus largest) comes back `Haiku`, `Sonnet`, `Opus`; a day without
  sonnet comes back haiku then opus; an other-family id (`gpt-x`) sorts after opus even when it
  has the largest total; two opus versions stay adjacent, larger total first.

### 3. Value placement, class label and share helpers

- In `src/lib/daily-summary.ts`, after `columnHeights`, add `CHART_PLOT_PX = 180`,
  `BAR_VALUE_MIN_PX = 20` and `barValueInside(heightPercent)`; add `classLabel(key)` and
  `shareLabel(count, total)` (no `Intl`, no `toLocaleString`). Mention them in the file's header
  comment ("the column charts' class counts, heights and value placement").
- In `src/lib/daily-summary.test.ts`, add `describe` blocks:
  - `barValueInside`: 100 is inside; 0 is above; exactly the threshold
    (`BAR_VALUE_MIN_PX / CHART_PLOT_PX * 100`) is inside; just under it is above.
  - `classLabel`: each of the five keys.
  - `shareLabel`: `3/7` is `"43%"`, `1/2` is `"50%"`, `7/7` is `"100%"`, `1/1000` is `"<1%"`,
    `0/5` is `"0%"`, `0/0` is `"0%"`.

### 4. Rebuild `ColumnChart` as a chart card

- In `src/components/ColumnChart.tsx`, add props `subtitle: string` and `swatchClass: string`
  (a full literal class from `chart-colors.ts`); keep `title`, `idPrefix`, `columns`, `summary`,
  `empty`. Drop `valueLabel`'s "above the column" wording; the `ChartColumn` shape stays (`key`,
  `value`, `valueLabel`, `name`, `ariaLabel`, `colorClass`, `detail?`).
- Markup, all classes literal, no hue from the status palette:
  - `figure`: `min-w-0 rounded-md border border-neutral-200 p-3 dark:border-neutral-800`.
  - `figcaption`: `mb-3`; a row with `size-2.5 rounded-sm ${swatchClass}` (`aria-hidden`) and the
    title (`text-sm font-medium`), then the subtitle (`text-xs text-neutral-500
dark:text-neutral-400`).
  - `<p className="sr-only">{summary}</p>` as today.
  - Empty: a `flex h-45 items-center justify-center` box with `empty`.
  - Otherwise a `relative h-45` plot box: four `aria-hidden` guide lines
    (`absolute inset-x-0 border-t border-dotted border-neutral-200 dark:border-neutral-800`,
    `style={{ bottom: "25%" }}` etc., positions as inline style, not a computed class), then the
    `ul` (`relative flex h-full items-end justify-center gap-4`).
  - Each `li`: the existing `aria-label`, `aria-describedby`, `tabIndex` (0 only with `detail`),
    focus outline and `group relative`, plus `flex h-full min-w-12 max-w-20 flex-1 flex-col
items-center justify-end`.
  - Inside it: when `!barValueInside(height)`, a value span above the bar
    (`mb-1 text-xs tabular-nums`, `data-value-placement="above"`); then the bar
    (`flex w-full max-w-14 items-center justify-center rounded-t-md min-h-px ${colorClass}`,
    `style={{ height: `${height}%` }}`) which, when inside, holds the value span
    (`text-xs font-semibold tabular-nums text-white`, `data-value-placement="inside"`).
  - Labels sit under the plot box, outside the 180px, so the bars share one baseline: render the
    label row inside the `li` after a plot wrapper, or use a second `ul` aligned with the same
    `flex-1 max-w-20 min-w-12` widths. Prefer one `li` per column holding plot part (`h-45`,
    `justify-end`) and label part (`mt-2 flex items-center gap-1 whitespace-nowrap text-xs`, a
    `size-2 rounded-full ${colorClass}` dot `aria-hidden`, then `name`), with the guide lines
    positioned against the plot part's height (put the guide lines in an `absolute inset-x-0
top-0 h-45` layer of the figure body). No `truncate`.
  - Tooltip: unchanged mechanism and classes (`absolute bottom-full ... z-10 hidden
group-focus-within:block group-hover:block`, `role="tooltip"`, the `dl`).
- Update the component's doc comment (chart card, 180px plot, value inside or above via
  `barValueInside`, still stateless and without `"use client"`).

### 5. Class chart

- In `src/components/ClassColumnChart.tsx`: title `Work by class`, subtitle
  `Runs finished that day`, `swatchClass={CLASS_BG["/feature"]}`, `name={classLabel(key)}`
  (plain text, no `font-mono`), `ariaLabel` `` `${classLabel(key)}: ${count} ${count === 1 ? "run" : "runs"}` ``,
  summary `` `Work by class: ${...`${count} ${classLabel(key)}`}` ``, and
  `detail: [{ label: "Runs", value: String(count) }, { label: "Share", value: shareLabel(count, total) }]`
  where `total` is the sum of `present` counts. `idPrefix` stays `runs-by-class-${day}` (unique per
  card). Still `null` for no runs.

### 6. Model chart

- In `src/components/ModelColumnChart.tsx`: subtitle `All tokens, including cache reads`,
  `swatchClass={MODEL_BG.opus}`, `ariaLabel` `` `${modelShortName(m.model)} (${m.model}): ${tokensLabel(m.total)} tokens` ``,
  and `detail` rows `Model`, `Input`, `Cache read`, `Cache write` (`m.cache_creation`), `Output`,
  `Cost` (`costLabel(m.cost_usd)`). Summary unchanged in form. Doc comment: models arrive in
  capability order from `sumModelUsage`.

### 7. Two cards side by side

- In `src/components/DayCharts.tsx`, render `<div className="grid gap-3 sm:grid-cols-2">` and
  update the comment (two chart cards, side by side from 640px, stacked below). Keep it
  stateless.

### 8. Rewrite the e2e journey

- Rewrite `e2e/test_day_card_charts.md` (same file, the profile lists it), keeping the
  `## User Story`, `## Test Steps` and `## Success Criteria` format. Steps:
  1. Navigate to `/`. Take the first day card with runs.
  2. **Verify** under its header two `figure`s, captioned `Work by class` / `Runs finished that
day` and `Tokens by model` / `All tokens, including cache reads`, side by side at 1920x1080
     (same `top` from `getBoundingClientRect`).
  3. **Verify** the class labels (with `browser_evaluate`, the `aria-label`s of the class
     figure's `li`s) are a subsequence of `feature`, `chore`, `bug`, `patch`, `other` in that
     order, and the counts add up to the header's `N runs`.
  4. **Verify** the model labels are a subsequence of `Haiku`, `Sonnet`, `Opus`, then anything
     else, or the card says `No per-model usage published.`
  5. **Verify** the tallest bar of either chart has its value inside: a
     `[data-value-placement="inside"]` element inside the bar whose computed `color` is
     `rgb(255, 255, 255)`; any `[data-value-placement="above"]` sits outside its bar.
  6. Hover or focus a model column and **Verify** the tooltip shows `Input`, `Cache read`,
     `Cache write`, `Output` and `Cost` with a `$` value. Hover a class column and **Verify**
     `Runs` and `Share` with a `%` value.
  7. **Verify** each label under a bar is text with a colour dot, no `img` or `svg` in the label
     row, and its `scrollWidth <= clientWidth`.
  8. **Verify** the per-project table still has its compact class bars (`svg` with an
     `aria-label` starting `Issue classes:`).
  9. **Verify** the server HTML (`fetch("/").then((r) => r.text())`) contains `Work by class` and
     `Tokens by model`.
  10. Screenshot at 1920x1080. Resize to 375x667, **Verify** the two cards are stacked (the
      second's `top` is below the first's `bottom`) with no horizontal overflow
      (`document.documentElement.scrollWidth <= window.innerWidth`). Screenshot.
  11. With `browser_evaluate`, toggle dark mode is not needed (the scheme follows the OS); take
      the screenshots as they are and note the scheme.
- This journey is an acceptance gate run through the Playwright MCP server; the profile names no
  code E2E suite, and the visual layout (two cards, bars, placement, tooltips) cannot be checked
  by the `src/**/*.test.ts` layer, which has no component tests.

### 9. Documentation and profile

- `README.md` "Summary": replace the "two small column charts side by side on one baseline ..."
  sentence with the card design: "Work by class" and "Tokens by model" cards (side by side from
  640px), a fixed order (feature, chore, bug, patch, other; Haiku, Sonnet, Opus, other), values
  inside the bars (above a bar too short for them), labels with a colour dot under the bars,
  tooltips with the token split and cost per model and the count and share per class. Mention
  that the per-project table's class bar uses the same class order.
- `AGENTS.md`: in the charts bullets, list the geometry as `classCounts`, `columnHeights`,
  `barValueInside`, `classLabel`, `shareLabel`; add the rule that both orders are fixed and come
  from the data shape (`classCounts`, `sumModelUsage`), never a sort by value in a component;
  replace "the plot box stays `h-12`" with "the plot box is 180px (`h-45`) and the value
  placement comes only from `barValueInside`"; keep "a column is as wide as its name
  (`min-w-12`, no `truncate`)". No em-dashes.
- `.adw/project.md` Review: "runs-by-class and tokens-by-model charts" becomes "work-by-class and
  tokens-by-model chart cards". Do not touch its headings.

### 10. Run the validation commands

- Run every command in `Validation Commands` and fix anything that fails without weakening a
  rule, a type or a test.

## Testing Strategy

### Unit Tests

- `src/lib/daily-summary.test.ts`: `classCounts` new order and a day with a missing class;
  `classSegments` order including `/bug` after `/chore`; `barValueInside` at 100, 0, exactly the
  threshold and just under it; `classLabel` for all keys; `shareLabel` for rounding, `<1%`, zero
  count and zero total.
- `src/lib/model-usage.test.ts`: `sumModelUsage` capability order (haiku, sonnet, opus, other),
  a day with a missing family, an other-family model with the largest total still last, two
  versions of one family adjacent by total.

### Test Coverage

- `src/lib/model-usage.test.ts` (vitest unit, the profile's one test layer): the capability order
  of `sumModelUsage`; fails today because models are sorted largest total first.
- `src/lib/daily-summary.test.ts` (vitest unit): `classCounts` in `feature, chore, bug, patch,
other` order (fails today, bug precedes chore) and `barValueInside`, `classLabel`, `shareLabel`
  (fail today, they do not exist). Together they pin the fixed order with missing entries and the
  inside/above value placement rule, the two behaviours the issue asks to be unit-tested.
- The layout itself (cards, guides, white value in the bar, tooltip with cost) has no component
  test layer in this project; it is covered by the rewritten agent journey in task 8 and the
  review phase's screenshots.

### Edge Cases

- A day with only one class or one model: one bar at 100%, value inside, bar width capped at
  `max-w-14` so it does not fill the card.
- A day where one value dwarfs the rest (e.g. 40M opus, 50k haiku): the small bar is
  `min-h-px` with its value above it, never clipped or overlapping the guide line text.
- A day with no per-model rows: the model card keeps its title, subtitle and a 180px box saying
  `No per-model usage published.`
- An other-family model id (`gpt-x`, `claude-3-5-foo`): sorted last, named by `modelShortName`,
  `MODEL_BG.other` (neutral, dark variant present), name shown in full.
- Runs below the known class sum: `other` floored at 0 and omitted (unchanged).
- Share rounding: shares of one day may not add up to exactly 100%; acceptable for a tooltip.
- Long labels at 375px: two or three columns with `min-w-12` and `whitespace-nowrap` must fit a
  stacked card without page overflow; five class columns at `gap-4` must still fit
  (5 x 48px + 4 x 16px = 304px inside a ~311px card body at 375px). If it does not, reduce the
  gap to `gap-2` below `sm`.
- Today card refresh: the same components re-render client-side with new figures; ids derive
  from `day`, so no duplicate ids between the today card and a past card.
- Tooltip near the card's top edge: the popover opens above the column (`bottom-full`), over
  the caption; it must not be clipped (no `overflow-hidden` on the figure or the day card).

## Acceptance Criteria

- Every day card with runs shows two bordered chart cards under its header and above the
  per-project table, each with a coloured square, a title and a muted subtitle: "Work by class" /
  "Runs finished that day" and "Tokens by model" / "All tokens, including cache reads".
- The cards are side by side at 640px and wider, stacked below, with no horizontal overflow at
  375px.
- Class bars are always in the order feature, chore, bug, patch, other; model bars always Haiku,
  Sonnet, Opus, other; absent entries are omitted; nothing is sorted by value.
- The plot is 180px high with faint dotted guide lines; bars have rounded tops and a capped
  width.
- A tall bar shows its value in white centred inside it; a bar shorter than 20px shows its value
  just above it in the normal text colour (`barValueInside`).
- Under each bar: the class name without a slash or the short model name, with a matching colour
  dot; no icons.
- Hover or focus on a token bar shows Model, Input, Cache read, Cache write, Output and Cost
  (`$`); on a class bar, Runs and Share (`%`).
- Every bar has an `aria-label` with label and value; every chart has an `sr-only` text
  alternative listing its values.
- Colours come only from `CLASS_BG` and `MODEL_BG`; `status-colors.test.ts` and `layers.test.ts`
  pass; no new dependency.
- The today card renders the same cards, and none of the chart components gains `"use client"`.
- `README.md`, `AGENTS.md` and `.adw/project.md` describe the new design; the e2e journey
  `e2e/test_day_card_charts.md` checks it.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint`: ESLint over the changed components and helpers.
- `yarn typecheck`: `next typegen` then `tsc --noEmit`, catches the new `ColumnChart` props at
  every call site.
- `yarn knip`: no unused export (the new helpers and constants must each be used outside their
  file or not exported).
- `yarn format:check`: Prettier on every changed file (run `yarn format` first if it fails).
- `yarn test`: the vitest unit layer, including the new order, placement, label and share cases,
  and the colour and layer scans.
- `yarn build`: the production build under `cacheComponents`, proving the summary page and the
  client today card still prerender and build with the new markup.

## Notes

- No new dependency; Tailwind 4 already provides `h-45` (180px) and `size-*`.
- Changing `classCounts`' order also reorders the per-project table's stacked class bar
  (`classSegments`). That is intended: one class order across the page.
- Changing `sumModelUsage`'s order is a deliberate move of display order into the data shape, so
  components keep rendering arrays as given (AGENTS.md: components never compute or sort business
  values).
- White value text on the lighter bars (`bg-neutral-300` for other, `bg-lime-500`,
  `bg-orange-400`, `bg-neutral-400` for chore) has weaker contrast than on violet, fuchsia,
  indigo or teal. The issue asks for white; `font-semibold` helps, and the value is also in the
  `aria-label` and the text alternative. If the reviewer finds it unreadable, a follow-up could
  add a per-colour value text class to `chart-colors.ts` rather than a new hue.
- The swatch colours of the two cards (`CLASS_BG["/feature"]`, `MODEL_BG.opus`) are reused from
  the maps, not new hues.
- The issue's adw_id and issue number in the command arguments were swapped; this plan uses the
  issue JSON's `number` (116) and the 8-character adw_id `45cff3d3`.
