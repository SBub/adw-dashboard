# Patch: give the run row's issue title a real flex basis so it survives on mobile

## Metadata

adw_id: `3fc84733`
review_change_request: `Issue #1: On mobile (375x667), the issue title is squeezed to about one character. On /projects/SBub/adw-dashboard, the Active row #25 shows only "S…" (title span clientWidth 28px, scrollWidth 205px). The /feature badge and 3fc84733 stay on the first line and only Updated wraps. Cause: flex-1 basis-0 on the title span in src/components/RunRow.tsx. Resolution: change only the title span's classes so the title gets a real minimum width before the cluster wraps, keeping the desktop single-line layout (e.g. min-w-[10rem] flex-1 basis-0 truncate text-sm, or flex-1 basis-40 min-w-0 truncate text-sm). Recheck at 375x667 and 1920x1080. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-25-adw-3fc84733-sdlc_planner-show-issue-title-run-rows.md`
**Issue:** The title `<span>` in `RunRow`'s header cluster (`flex min-w-0 flex-1 flex-wrap ...`) has `basis-0`. In a wrapping flex container, line breaking uses each item's hypothetical main size, which for `basis-0` is 0. So the title never claims space when lines are formed: `#25`, the title, the `IssueClassBadge` and the `adw_id` are always packed onto the first line and the title only gets what is left after them (28px on a 375px phone, one character plus the ellipsis). On desktop there is room to spare, so the bug only shows on narrow screens.
**Solution:** Replace `basis-0` with `basis-40` (10rem, 160px) on the title span and keep `min-w-0 flex-1 truncate text-sm`. The 160px basis is what the line-breaking pass now sees, so on a phone the badge and `adw_id` no longer fit after `#25` + title and wrap to the next line; the title then grows (`flex-1`) to fill the first line and truncates with an ellipsis. On desktop everything still fits on one line and the title grows into the free space as before. `basis-40 min-w-0` is chosen over `min-w-[10rem] basis-0` because `min-w-0` still lets the title shrink below 160px on an extremely narrow line instead of overflowing the row, so the one-line ellipsis holds at any width.

## Files to Modify

Use these files to implement the patch:

- `src/components/RunRow.tsx` (the title span's `className` only)

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Change the title span's flex basis

- In `src/components/RunRow.tsx`, on the `<span ... title={run.issue_title}>` rendered when `run.issue_title !== null`, change `className="min-w-0 flex-1 basis-0 truncate text-sm"` to `className="min-w-0 flex-1 basis-40 truncate text-sm"`.
- Change nothing else: not the cluster container, not the `#` link, the badge, the `adw_id`, the `Updated` span, the status badge column, the `title` attribute or the doc comment. No README or AGENTS.md change (README only says "one line truncated with an ellipsis", which still holds).

### Step 2: Format and run the checks

- Run `yarn format` if `yarn format:check` reports the file, then the validation commands below.

### Step 3: Visual recheck in the browser

- Source `.ports.env` (PORT=9200) and use the running app on `http://localhost:$PORT` (start it with `yarn dev` only if this run has not already started one; never touch a server on another port).
- Open `/projects/SBub/adw-dashboard` (or the first project the sidebar lists, if that slug is 404). Wait for the connection indicator to read `live`.
- At 375x667: the Active row #25 shows `#25` followed by a readable part of the title (well over one character) on one line ending in an ellipsis; the `/feature` badge and `3fc84733` move to the next line; the status badge stays on the right. Confirm with `browser_evaluate` that the title span's `clientWidth` is clearly larger than the previous 28px and that its height is one line.
- At 1920x1080: `#`, title, badge, `adw_id` and `Updated ...` stay on one line, and the status badge is on the right edge. Check a History row too.
- Save screenshots for both viewports into `agents/3fc84733/patch_agent/review_img/`.

## Validation

Execute every command to validate the patch is complete with zero regressions.

1. `yarn lint`
2. `yarn typecheck`
3. `yarn knip`
4. `yarn format:check`
5. `yarn test`
6. `yarn build`

Then the browser recheck from Step 3 at 375x667 and 1920x1080.

## Patch Scope

**Lines of code to change:** 1
**Risk level:** low
**Testing required:** The full Tests and Build sequence from the profile (no component test layer exists), plus the Playwright visual recheck at 375x667 and 1920x1080 on the project page, Active and History rows.
