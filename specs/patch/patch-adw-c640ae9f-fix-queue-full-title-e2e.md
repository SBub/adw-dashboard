# Patch: Queue full-title E2E test measures a queued row, not a waiting one

## Metadata

adw_id: `c640ae9f`
review_change_request: `Issue #2: The spec's validation command PORT=<run port> yarn test:e2e does not pass. e2e/row_full_title_top_align.spec.ts:199 ('Queue rows show a 120-character title in full, pill and marker on its first line') fails every time with 'the queue row has no pill or marker'. measureRow finds the pill with /^(running|failed|queued)$/; live data now puts waiting rows first in Up next and setLongTitle picks the first row with a title span, a waiting row, so the pill is missed. Update the Queue test so it handles dependency-held rows (add waiting to the pill regex and match the empty marker, or pick the first queued row). Do not weaken the first-line assertions. Re-run PORT=<run port> yarn test:e2e and confirm it passes. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-255-adw-c640ae9f-sdlc_planner-queue-show-dependency-held-items.md`
**Issue:** The Queue test in `e2e/row_full_title_top_align.spec.ts` calls `setLongTitle(rows)` on every Up next row and takes the first one with a title span. Since issue #255 the live queue can open with a dependency-held row whose pill reads `waiting`. `measureRow` only recognises `running|failed|queued` as a pill, so `pillTop` is null and `expectFirstLine` throws `the queue row has no pill or marker`. (The marker itself is fine: `QueueRow.tsx` renders the hollow waiting marker as `div > span.flex.h-6 > span`, which `:scope > div:first-of-type > span > span` already matches.) A second hazard on the same path: a waiting row with a null `issue_title` has the reason span (which carries a `title` attribute) right after the link, so `setLongTitle` would overwrite the reason and `hasTitle` would fail.
**Solution:** Make the Queue test pick the first `queued` row for the long-title check, by filtering the Up next rows to those holding an exact `queued` pill before calling `setLongTitle`. This keeps `measureRow`, its pill regex, the `hasTitle` probe (shared with History and Active) and every first-line assertion untouched. The rail check keeps reading `rows.nth(0)` and `rows.nth(1)` of the whole list, since the rail and the marker selector hold for queued and waiting rows alike.

## Files to Modify

Use these files to implement the patch:

- `e2e/row_full_title_top_align.spec.ts` (the Queue test only, lines 199 to 244)

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Measure the first queued row in the Queue test

- In `test("Queue rows show a 120-character title in full, pill and marker on its first line", ...)`, after `const rows = sectionRows(page, "Up next");`, add:
  `const queued = rows.filter({ has: page.getByText("queued", { exact: true }) });`
  with a one-line comment: a row held on a dependency (`waiting` pill, reason span) is covered by `queue_dependency_held.spec.ts`; this test measures a queued row.
- Change `const row = await setLongTitle(rows);` to `const row = await setLongTitle(queued);`.
- Keep `test.skip(row === null, "no queued item has a title");` as is (the message already says queued).
- Leave `expectFirstLine`, `expectFullTitle`, the wide and narrow measurements and their tolerances exactly as they are.

### Step 2: Keep the rail check on the whole list

- Leave the rail block (`if ((await rows.count()) >= 2) { ... }`) reading `rows`, not `queued`: the first two rows of Up next are adjacent on the rail whatever their state, and both the `span[aria-hidden]` rail and the `div:first-of-type > span > span` marker exist on queued and waiting rows.
- Leave `measureRow`, `setLongTitle`, the pill regex and the History and Active tests unchanged.

### Step 3: Format and lint the spec

- Run `yarn format` so the edit matches Prettier, then `yarn lint`.

## Validation

Execute every command to validate the patch is complete with zero regressions. Source `.ports.env` for the run port (9200 in this worktree); never set `CI=1`.

- `yarn lint`
- `yarn typecheck`
- `yarn knip`
- `yarn format:check`
- `PORT=9200 yarn playwright test e2e/row_full_title_top_align.spec.ts` (the Queue test passes, or skips only when no project has a queued item with a title; History and Active unchanged)
- `PORT=9200 yarn test:e2e` (the full suite passes; re-run any single failing spec alone to tell a load flake from a regression, and report both runs)

## Patch Scope

**Lines of code to change:** about 4
**Risk level:** low
**Testing required:** the full-title spec alone, then the full Playwright suite against the run's server on port 9200, plus lint, typecheck, knip and format.
