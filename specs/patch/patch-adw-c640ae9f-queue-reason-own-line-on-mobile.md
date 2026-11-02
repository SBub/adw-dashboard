# Patch: Put the dependency-hold reason on its own line below `sm`

## Metadata

adw_id: `c640ae9f`
review_change_request: `Issue #1: Mobile (375x667) on /projects/SBub/edit-issebya: in every dependency-held row, the title span and the new reason span both have flex-1 in the same non-wrapping row, so the title gets about 70px, wraps one word per line and breaks inside words, and the 67px reason shows only 'blocked ...'. Resolution: below sm, keep the link, the full-width wrapping title and the pill on the first line and put the reason on its own full-width line under the title (flex-wrap on the card row, reason order-last basis-full, still truncate with title); from sm up keep it inline. Update app_docs/project-page.md and e2e/queue_dependency_held.spec.ts (at 390 assert the title is not squeezed and the reason shows its text). Re-check at 375x667 and 1920x1080. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-255-adw-c640ae9f-sdlc_planner-queue-show-dependency-held-items.md`
**Issue:** In `src/components/QueueRow.tsx` the card row is `flex` with no wrap, and the title span and the reason span both carry `min-w-0 flex-1`. On a phone they split the space left by the link and the pill, so the title is about 70px wide (10 to 13 lines, words broken mid-word) and the truncated reason reads only `blocked ...`. The E2E only checks that the link, reason and pill tops agree, so it passes on a broken row.
**Solution:** Below `sm`, let the card row wrap and move the reason to a last, full-width line (`order-last basis-full`), so the first line holds only the link, the title (now taking all the remaining width) and the pill. From `sm` up, restore today's inline layout (`sm:flex-nowrap`, `sm:order-none sm:basis-auto sm:flex-1`). The DOM order and structure stay as they are (the title stays the link's next sibling, which `e2e/row_full_title_top_align.spec.ts` and `e2e/queue_row_single_line.spec.ts` rely on). Then correct the doc Rules and the E2E geometry.

## Files to Modify

Use these files to implement the patch:

- `src/components/QueueRow.tsx`
- `e2e/queue_dependency_held.spec.ts`
- `e2e/queue_row_single_line.spec.ts` (header comment only)
- `app_docs/project-page.md`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Wrap the reason onto its own line below `sm` in `QueueRow`

- Card row div: `flex items-start gap-x-3` becomes `flex flex-wrap items-start gap-x-3 gap-y-1 sm:flex-nowrap`. Replace the comment above it ("The row never wraps...") with: below `sm` the row wraps only to put a held row's reason on its own line under the title; the link, title and pill never wrap apart, so the pill stays on the title's first line.
- Title span: unchanged (`min-w-0 flex-1 wrap-break-word text-sm leading-6`). With `flex-1` (basis 0) it always fits on line one beside the link and pill and grows to fill it.
- Reason span: `min-w-0 flex-1 truncate ...` becomes `order-last min-w-0 basis-full truncate text-sm leading-6 text-neutral-500 sm:order-none sm:basis-auto sm:flex-1 dark:text-neutral-400`; keep `title={reason}`.
- Pill wrapper: unchanged (`ml-auto flex h-6 shrink-0 items-center`).
- Update the component's JSDoc: the reason is one truncated line (full text in `title`), on its own full-width line under the title below `sm` and inline after the title from `sm` up; the link, title and pill are top-aligned on the title's first line at every width.

### Step 2: Fix the geometry in `e2e/queue_dependency_held.spec.ts`

- Update the header comment: the reason sits after the prefix on its own line under the title on a phone, on the title's line from `sm` up.
- In the geometry `evaluate`, also return: `titleWidth` (the link's `nextElementSibling` span without a `title` attribute), `cardContentWidth` (card width minus borders and padding), `linkBottom`, `reasonWidth`, `reasonScrollWidth`, `reasonClientWidth`.
- For every row, at both widths: pill top within 2px of the link top (as now) and `titleWidth >= 0.5 * cardContentWidth` (the title is not squeezed).
- For the held rows (`i !== 1`), reason height still `<= 26` (one line), and:
  - at 390: `reasonTop >= linkBottom - 2` (its own line, under the first line) and `reasonWidth >= 0.9 * cardContentWidth` (full width, so its text is readable, not just `blocked ...`);
  - at 1440: `reasonTop` within 2px of `linkTop` (inline, as now).
- Keep the existing text, `title`, pill, marker, count and `expectNoHorizontalOverflow` assertions.

### Step 3: Align the live-data spec comment

- `e2e/queue_row_single_line.spec.ts` header: "adds only the toolkit's reason, on the same line" becomes "adds only the toolkit's reason, one line (under the title on a phone, beside it from `sm` up)". No assertion changes; its pill-on-title-line and right-edge checks still hold.

### Step 4: Update `app_docs/project-page.md`

- Around line 128 (the Up next card description): replace "in one row that does not wrap" and "(..., on one line, `truncate` with the full text in `title`)" with: the reason is one `truncate` line with the full text in `title`, on its own full-width line under the title below `sm` and after the title from `sm` up; the link, title and pill never wrap apart, the title takes the full remaining width of the first line, and every first-line element (the pill included) is top-aligned on the title's first line, the pill right-aligned at every width.
- Rules, around line 280: same correction ("one line" becomes "one `truncate` line with a `title`, on its own line under the title below `sm`, beside it from `sm` up"), and add the invariant: the reason never shares the title's line below `sm`, and never takes width from the title there.
- No em-dashes.

## Validation

Execute every command to validate the patch is complete with zero regressions.

1. `yarn lint && yarn typecheck && yarn knip && yarn format:check`
2. `yarn test`
3. `yarn build`
4. `PORT=<PORT from .ports.env> yarn test:e2e` (server from `/prepare_app` already up on that port; never `CI=1`), in particular `e2e/queue_dependency_held.spec.ts`, `e2e/queue_row_single_line.spec.ts`, `e2e/row_full_title_top_align.spec.ts`. Negative check: temporarily put `flex-1` back on the reason with no wrap; the 390 test must fail on the title width, then revert.
5. Visual re-check with the Playwright MCP on `/projects/SBub/edit-issebya` at 375x667 and 1920x1080: on mobile each waiting row shows the title wrapping normally on the first line with the pill, and the reason readable on its own line below; on desktop the reason stays inline after the title.

## Patch Scope

**Lines of code to change:** about 40 (6 in `QueueRow.tsx`, about 25 in the E2E spec, the rest docs and comments)
**Risk level:** low
**Testing required:** the E2E suite at 390 and 1440 (title width, reason line and width), the existing queue and full-title specs unchanged and passing, and a manual check at 375x667 and 1920x1080.
