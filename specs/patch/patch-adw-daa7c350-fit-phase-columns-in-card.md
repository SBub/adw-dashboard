# Patch: Keep the five Cost by phase columns inside their chart card

## Metadata

adw_id: `daa7c350`
review_change_request: `Issue #1: The five 'Cost by phase' columns do not fit inside their chart card at the widths this change introduces. At 1024x768 the phase card is 311px wide (content box 693 to 978) but the columns and labels are drawn from 683 to 998; at 1920x1080 the 'Document' label extends into the card's right padding; at 375x667 the 'Review' and 'Document' labels overlap. Cause: ColumnChart's list is gap-2 sm:gap-4 and the nowrap 'Document' label with its dot is wider than a 48px column. Fix so all five phase columns and their labels stay inside the card's content box at 1024px and 375px, keep min-w-12, the phase names, the order and barValueInside unchanged, extend step 12/13 of e2e/test_day_card_charts.md, update AGENTS.md/README wording if the breakpoint changes. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-125-adw-daa7c350-sdlc_planner-cost-by-phase-chart.md`

**Issue:** In `src/components/ColumnChart.tsx` every column `li` is `flex-1 min-w-12`: `flex-1` sets
`flex-basis: 0%`, and the explicit `min-w-12` replaces the flex item's automatic minimum (its
min-content), so a column may shrink to 48px even when its name is wider; the nowrap name then
overflows the `li` on both sides. Measured at 375x667 (phase card 309px, content box 283px, gap 8px):
every `li` is 50px, while the labels (dot, 4px gap, name) are Plan 36, Build 40, Test 35, Review 52
and Document 70px, so Review and Document overflow and overlap. At `sm` and up the list's gap grows
to 16px (64px for four gaps), so at 1024px five 48px columns (240px) plus 64px need 304px in a 285px
content box and the row spills past both borders. With nowrap labels and the current gaps the row
needs 48+48+48+52+70 + 4 gaps = 298px at gap-2 and 330px at gap-4, more than either card holds.

**Solution:** Approach (a) plus (c) from the request, inside `ColumnChart` only, which stays stateless:

1. The list takes a tighter gap when it has five or more columns (`gap-1`, 4px); fewer columns keep
   `gap-2 sm:gap-4`. The class string is chosen from `columns.length`, a layout decision, not a
   business value.
2. Each column is sized from its content instead of from zero: `flex-1` becomes `grow` (basis
   `auto`), and the 48px floor (`min-w-12`, unchanged) moves from the `li` to the column's plot box,
   so the `li`'s automatic minimum is its min-content, never less than 48px and never less than
   its name.
3. The name row may wrap inside its column: `whitespace-nowrap` becomes `flex-wrap justify-center
text-center`, so when a column is narrower than dot plus name, the name drops under its dot
   (a single word is never broken and never truncated). Then the widest minimum is `Document`
   alone (about 58px), and five columns need 4 x 48 + 58 + 4 x 4 = 266px, inside the 283px (375px)
   and 285px (1024px) content boxes with room to spare; at 1920px and wherever there is room the
   row stays on one line, exactly as today.

The breakpoint (`lg:grid-cols-3` in `DayCharts`) does not change, so the README's "one row from
1024px" stays true. `min-w-12`, the phase names, the order and `barValueInside` are unchanged.

## Files to Modify

- `src/components/ColumnChart.tsx`: the list's gap class, the `li`'s flex sizing, the plot box's
  `min-w-12`, the name row's wrapping, and the doc comment.
- `e2e/test_day_card_charts.md`: steps 12 and 13 (and the Success Criteria) check that the phase
  figure's list, columns and labels stay inside the figure's content box and that no two labels
  overlap.
- `AGENTS.md`: the "A column is as wide as its name" sentence in the Summary section, so it matches
  the new sizing (floor on the plot box, name wraps under its dot when the column is narrower, five
  columns use `gap-1`).

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Fit the columns in `ColumnChart`

- Above the `return`, derive the gap from the column count, for example
  `const gap = columns.length >= 5 ? "gap-1" : "gap-2 sm:gap-4";` (full literal class strings, so
  Tailwind sees both), and use it in the list:
  ``className={`relative flex items-start justify-center ${gap}`}``.
- On the column `li`, replace `flex-1` with `grow` and remove `min-w-12`; keep `max-w-20` and every
  other class (`group relative flex ... flex-col items-center rounded-sm focus-visible:...`).
- On the plot box `span` (`flex h-45 w-full flex-col items-center justify-end`), add `min-w-12`, so
  48px stays the column floor and feeds the `li`'s min-content.
- On the name row `span` (`mt-2 flex items-center gap-1 whitespace-nowrap text-xs`), replace
  `whitespace-nowrap` with `flex-wrap justify-center text-center`; keep the dot (`size-2 shrink-0
rounded-full ...`) and `gap-1`. No `truncate`, `line-clamp`, `break-all` or `title`.
- Do not touch the bar, the value labels, `barValueInside`/`columnHeights`, the guide lines, the
  popover, the figure or the empty state. `PhaseColumnChart`, `ClassColumnChart`,
  `ModelColumnChart` and `DayCharts` are unchanged.
- Update the component's doc comment: columns grow from their content with a 48px floor on the plot,
  the name wraps under its dot only when the column is narrower than it, and five or more columns
  use a 4px gap so the row fits a one-third card at 1024px and a stacked card at 375px.

### Step 2: Measure in the browser

- Source `.ports.env` for `PORT` (fall back to 3000 only if it is absent). Reuse the server already
  answering on that port if it is this run's; otherwise start `yarn dev`. Open
  `http://localhost:$PORT/`.
- At 1920x1080, 1024x768 and 375x667, with `browser_evaluate` on every `Cost by phase` figure that
  has a `ul`: compute the content box (`figure.getBoundingClientRect()` inset by
  `borderLeftWidth + paddingLeft` and `borderRightWidth + paddingRight`) and confirm the `ul`, every
  `li` and every name row (`li > span.mt-2`) have `left >= contentLeft` and `right <= contentRight`
  (allow 0.5px for rounding), and that each name row's `right <= ` the next one's `left`. Confirm
  every name row still has `scrollWidth <= clientWidth`, the three cards still share one `top` at
  1920 and 1024, and `document.documentElement.scrollWidth <= window.innerWidth`. Run the same
  check on the `Work by class` and `Tokens by model` figures to confirm no regression.
- Save screenshots into `agents/daa7c350/patch_agent/review_img/`. Stop only a dev server this run
  started.

### Step 3: Extend the E2E journey

- In `e2e/test_day_card_charts.md`, step 12 (1024x768) and step 13 (375x667): add **Verify** with
  `browser_evaluate` that the `Cost by phase` figure's `ul` and every one of its `li`s and name rows
  lie inside the figure's content box (the figure's `getBoundingClientRect()` inset by its border
  and padding: each `left >=` the content left and each `right <=` the content right), and that no
  two name rows overlap (each one's `right <=` the next one's `left`).
- Add one bullet to Success Criteria: "The phase chart's five columns and their names stay inside
  their card's content box, without overlapping, at 1024px and at 375px."
- No em-dashes.

### Step 4: Update the AGENTS.md rule

- In the Summary section, replace "A column is as wide as its name (`min-w-12`, no fixed width, no
  `truncate`), so a name is never cut;" with: "A column grows from its content with a 48px floor
  (`min-w-12` on its plot box, no fixed width, no `truncate`), so a name is never cut: when the
  column is narrower than its dot and name, the name wraps under the dot, and a chart with five or
  more columns uses `gap-1` so the row fits a one-third card at `lg` and a stacked card at 375px;"
- The breakpoint is unchanged (`lg`), so README.md needs no edit. No em-dashes.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `yarn lint && yarn typecheck && yarn knip && yarn format:check`
- `yarn test` (includes the `status-colors` and `layers` scans over `src/`)
- `yarn build`
- Browser check from Step 2 at 1920x1080, 1024x768 and 375x667: the phase figure's `ul`, `li`s and
  name rows inside the figure's content box, no overlapping names, three cards in one row at 1920
  and 1024, no horizontal page overflow.
- Run `e2e/test_day_card_charts.md` steps 12 and 13 as extended.

## Patch Scope

**Lines of code to change:** about 8 in `ColumnChart.tsx`, about 8 in the E2E journey, about 5 in
`AGENTS.md`
**Risk level:** low
**Testing required:** the profile's lint, typecheck, knip, format, unit and build checks, plus the
`getBoundingClientRect` containment check of all three chart cards at desktop, 1024px and mobile.
