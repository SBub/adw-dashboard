# Patch: Keep History's Finished field whole on the lg grid

## Metadata

adw_id: `7a7f315b`
review_change_request: `Issue #2: At desktop width (1920x1080, and any width from lg up), the History grid change from sm:grid-cols-4 to sm:grid-cols-4 lg:grid-cols-5 in src/components/RunRow.tsx shrinks the Finished column. On all three cards the Finished dd now reads '08.10.2026 14:26...': scrollWidth 152 > clientWidth 134, with text-overflow ellipsis and white-space nowrap. The existing History journey e2e/test_history_card_fields.md (step 10, kept by this branch) requires checking that Finished is not ellipsized. Under the previous 4-column grid the column was wide enough. This is a visible regression in the very card this change edits. Resolution: In src/components/RunRow.tsx, change the History dl grid so Finished is never ellipsized while Branch, Finished, Duration and Cost still share one row from lg up. For example, use a template that gives Branch the flexible space and the other three their content width (such as lg:grid-cols-[minmax(0,2fr)_auto_auto_auto] with Branch no longer spanning two columns at lg). Alternatively, keep Finished's dd from truncating. Then re-measure at 1280x800 and 1920x1080 that dd.scrollWidth <= dd.clientWidth for Finished and that all four dd tops match. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-146-adw-7a7f315b-sdlc_planner-show-history-run-cost.md`
**Issue:** The History `dl` in `src/components/RunRow.tsx` went from `sm:grid-cols-4` to
`sm:grid-cols-4 lg:grid-cols-5` to fit Cost on one row. Five equal columns, with Branch spanning
two, leave the Finished column at 134px while its timestamp needs 152px, so its truncating `dd`
shows `08.10.2026 14:26...` at every width from `lg` up. Step 10 of
`e2e/test_history_card_fields.md` requires Finished not to be ellipsized.
**Solution:** From `lg`, replace the five equal columns with a template that gives Branch the
flexible space and Finished, Duration and Cost their content width:
`lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]`, and stop Branch spanning two columns at `lg`
(`lg:col-span-1`). The `auto` tracks are sized up to their max-content before the `1fr` track takes
what is left, so Finished always gets its full width, and Branch (`break-all`, `min-w-0`) wraps
inside the remaining space. The `sm` 4-column layout and the stacked mobile layout stay as they are.

## Files to Modify

Use these files to implement the patch:

- `src/components/RunRow.tsx`: the History variant's `dl` grid classes and the Branch `Field`'s
  span.
- `app_docs/project-page.md`: the History card sentence (around line 168) that still says Branch
  spans two columns and the `lg` layout is a 5-column grid (feature docs must match the layout).

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Change the History grid template from `lg`

- In `src/components/RunRow.tsx`, the History `dl` (currently
  `className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-4 lg:grid-cols-5"`) becomes
  `className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]"`.
- The Branch `Field` (`<Field label="Branch" wrap className="sm:col-span-2">`) becomes
  `className="sm:col-span-2 lg:col-span-1"`.
- Leave `Field`, the `truncate` on non-wrapping `dd`s, the Active variant's grid and every other
  line untouched. When Duration or Cost is absent the trailing `auto` track is empty and collapses
  to zero, so a card without Cost still sits on one row.

### Step 2: Update the History card sentence in the feature doc

- In `app_docs/project-page.md`, replace "Branch (in full, spanning two columns)" and "on one row
  from `lg` (a 5-column grid; at `sm` the 4-column grid puts Cost on a second row)" so it reads
  that Branch is shown in full, spanning two of the 4 `sm` columns, and that from `lg` the fields
  sit on one row in a grid where Branch takes the flexible width and Finished, Duration and Cost
  their content width (so Finished is never ellipsized); at `sm` the 4-column grid puts Cost on a
  second row. No em-dashes.

### Step 3: Re-measure in the browser

- Source `.ports.env` (`PORT`), start `yarn dev` only if no server this run started is already
  serving that port (never touch a server on 3000 unless `PORT` is 3000), and open
  `http://localhost:$PORT/projects/SBub/issebya-homes-ai-system` (or the first project the sidebar
  lists if that slug is 404), wait for the connection indicator to read `live`.
- At 1280x800 and again at 1920x1080, with `browser_evaluate` on every History `li`: for the `dd`
  after the `Finished` `dt`, `dd.scrollWidth <= dd.clientWidth` and its text does not end in `...`;
  the `getBoundingClientRect().top` of the present Branch, Finished, Duration and Cost `dd`s are
  within 2px of each other.
- At 1280x800, set the first card's branch `code` text to a 120-character branch (as in step 8 of
  `e2e/test_history_card_fields.md`, DOM only) and verify the `li` and the branch `dd` have no
  horizontal overflow and Finished is still not truncated.
- At 375x667, verify the `dd` tops strictly increase (still stacked).

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `yarn lint`
- `yarn typecheck`
- `yarn knip`
- `yarn format:check`
- `yarn test`
- `yarn build`
- Run the journey `e2e/test_history_card_fields.md` through the Playwright MCP server against
  `http://localhost:$PORT`, plus the 1920x1080 re-measure from Step 3; every step must pass,
  including step 6 (one row) and step 10 (Finished not ellipsized).

## Patch Scope

**Lines of code to change:** about 2 in `src/components/RunRow.tsx`, about 4 in
`app_docs/project-page.md`
**Risk level:** low
**Testing required:** the profile's lint, typecheck, knip, format, unit and build checks, and the
History card journey with the Finished overflow and one-row measurements at 1280x800 and
1920x1080, stacking at 375x667.
