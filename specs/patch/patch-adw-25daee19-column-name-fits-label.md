# Patch: Show the full class name under each chart column

## Metadata

adw_id: `25daee19`
review_change_request: `Issue #1: Under each class column the class name is shown cut off: /feature reads /feat… on every day card (today card and past cards, at desktop 1920x1080 and at mobile 375x667). The cause is in ColumnChart: every column li is fixed at w-12 (48px) and the name span is truncate, while /feature in font-mono text-xs is about 58px wide. Resolution: size the column to fit its label instead of fixing it at 48px (min-w-12, drop truncate), keep the plot box at h-12 and the bar at w-6, then check at 1920x1080 and 375x667 that /feature is shown in full and the page does not scroll horizontally. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-103-adw-25daee19-sdlc_planner-day-card-column-charts.md`
**Issue:** In `src/components/ColumnChart.tsx` every column `li` is fixed at `w-12` (48px) and the name
span under the bar is `w-full truncate`. `/feature` in `font-mono text-xs` is about 58px wide, so it
renders as `/feat…` on every day card (today and past, desktop and mobile). The full name survives
only in the `aria-label`, so the Acceptance Criterion "class name below each column" is not met for
the most common class.
**Solution:** Let each column grow to fit its label: the `li` takes `min-w-12` instead of `w-12`
(48px stays the floor, `items-center` keeps the bar and labels centred), and the name span drops
`w-full truncate` for `whitespace-nowrap`, so the name is shown in full on one line. The plot box
(`h-12`) and the bar (`w-6`) are untouched, so the shared baseline of the two charts is unchanged.
Add the "name shown in full" check to the existing E2E journey so the regression is caught.

## Files to Modify

Use these files to implement the patch:

- `src/components/ColumnChart.tsx`: the column `li` width and the name span classes.
- `e2e/test_day_card_charts.md`: one added verification that the class name is not truncated.

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Size the column to its label in `ColumnChart`

- On the column `li`, replace `w-12` with `min-w-12` in
  `group relative flex w-12 flex-col items-center rounded-sm ...`; keep every other class
  (`items-center`, the focus outline) as is.
- On the name span, replace `w-full truncate text-center text-xs` with
  `whitespace-nowrap text-center text-xs`, so `/feature` (and any model short name) renders in full
  on one line and widens its own column only.
- Do not touch the plot box `span` (`flex h-12 items-end`), the bar (`w-6`), the value label, the
  popover or the `ul` (`flex items-end gap-2`). No other file in `src/` changes; `ClassColumnChart`
  and `ModelColumnChart` keep passing their names as they do.

### Step 2: Pin the fix in the E2E journey

- In `e2e/test_day_card_charts.md`, step 3, add: **Verify** each class name below a column is shown
  in full (the visible text of the `/feature` column's name is `/feature`, not `/feat…`; with
  `browser_evaluate`, the name span's `scrollWidth <= clientWidth`).
- In Success Criteria, extend the class-columns bullet with "with the class name shown in full
  below each column". Keep step 9's horizontal-overflow check unchanged (it already covers 375x667).
- No em-dashes.

### Step 3: Visual check at both viewports

- Source `.ports.env` for `PORT` (fall back to 3000 only if it is absent), start `yarn dev`, open
  `http://localhost:$PORT/`.
- At 1920x1080 and at 375x667: confirm the `/feature` column on the today card and on a past card
  reads `/feature` in full, the two charts still share one baseline, and
  `document.documentElement.scrollWidth <= window.innerWidth`. Save the screenshots into
  `agents/25daee19/patch_agent/review_img/`. Stop only the dev server this run started.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `yarn lint && yarn typecheck && yarn knip && yarn format:check`
- `yarn test` (includes the `status-colors` and `layers` scans over `src/`)
- `yarn build`
- Browser check from Step 3 at 1920x1080 and 375x667: `/feature` shown in full, no horizontal page
  overflow.

## Patch Scope

**Lines of code to change:** about 2 in `ColumnChart.tsx`, about 3 in the E2E journey
**Risk level:** low
**Testing required:** the profile's lint, typecheck, knip, format, unit and build checks, plus the
visual check of the day card charts at desktop and mobile with no horizontal overflow.
