# Patch: Give the inline reason flex-basis 0 from `sm` up so it never squeezes the title

## Metadata

adw_id: `c640ae9f`
review_change_request: `Issue #1: Desktop (1920x1080) on /projects/SBub/edit-issebya: every dependency-held row's title is squeezed to a sliver and wraps one character per line. Measured title widths are 9px (#34, #35, #38, #40) and 101 to 109px (#32, #33, #37, #39) out of a 714px card content width, while the reason span takes 482 to 582px. The #34 card is about 1850px tall. This breaks the spec's criterion that the row stays one line, with the title wrapping and taking the remaining width. Cause: in QueueRow.tsx the reason span's classes basis-full ... sm:basis-auto sm:flex-1 resolve to flex-basis auto from sm up (computed style: reason flexBasis auto, flexGrow 1; title flexBasis 0%). The reason's nowrap text width becomes its basis and it grabs the line before the title gets any space. The mobile patch introduced this; the original inline layout gave both spans basis 0. Resolution: In src/components/QueueRow.tsx, make the reason span's flex-basis 0 from sm up. Drop sm:basis-auto and use sm:basis-0 (or sm:flex-1 sm:basis-0, checking the generated CSS order), keeping basis-full order-last below sm. A cap on the reason such as sm:max-w-[50%] would also stop a long reason from beating the title. Then check at 1920x1080 that every waiting row's title gets at least as much width as the reason, and that the card height equals the title's wrapped height. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-255-adw-c640ae9f-sdlc_planner-queue-show-dependency-held-items.md`
**Issue:** From `sm` up the reason span in `src/components/QueueRow.tsx` (line 94) computes to `flex: 1 1 auto` because `sm:basis-auto` wins over the `0%` basis from `sm:flex-1` (Tailwind v4 emits the `flex` shorthand before `flex-basis`). Its `nowrap` (`truncate`) text width becomes its basis, so on real data it takes 482 to 582px of a 714px card and the title (basis 0) gets 9 to 109px, wrapping one character per line (the #34 card is about 1850px tall). The E2E at 1440 did not catch it: the synthetic reasons are short enough, and its only width check is `titleWidth >= 0.5 * cardContentWidth`, which cannot hold for a held row whose title and reason share the line.
**Solution:** Replace `sm:basis-auto sm:flex-1` with `sm:flex-1 sm:basis-0` on the reason span. Both utilities resolve to basis 0, so the result does not depend on CSS order, and from `sm` up the title and reason split the remaining width equally (the pre-mobile-patch inline layout), the reason truncating inside its half. Below `sm` nothing changes (`order-last basis-full`, the row wraps). Then make the 1440 E2E assert what the reviewer checks: a held row's title is at least as wide as its reason, using a reason long enough to have reproduced the bug, and the card is only as tall as the title's wrapped height.

## Files to Modify

Use these files to implement the patch:

- `src/components/QueueRow.tsx`
- `e2e/queue_dependency_held.spec.ts`
- `app_docs/project-page.md`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Fix the reason span's basis from `sm` up

- In `src/components/QueueRow.tsx`, the reason span's `className` becomes
  `order-last min-w-0 basis-full truncate text-sm leading-6 text-neutral-500 sm:order-none sm:flex-1 sm:basis-0 dark:text-neutral-400` (drop `sm:basis-auto`, add `sm:basis-0`). Keep `title={reason}` and everything else.
- Add to the JSDoc sentence about the inline reason: from `sm` up it shares the remaining width equally with the title (both flex basis 0) and truncates inside its share, so it never takes width from the title.
- No other element changes (the title span keeps `min-w-0 flex-1 wrap-break-word`, the card row keeps `flex flex-wrap ... sm:flex-nowrap`).

### Step 2: Make the E2E reproduce and guard the desktop squeeze

- In `e2e/queue_dependency_held.spec.ts`, lengthen `REASON_A` and `REASON_B` so their unwrapped text is wider than half of a 1440 card (for example append `; the runner picks it up after the dependency's pull request is merged into the default branch and its checks pass`), keeping each starting `blocked by #92550x` and referencing the other synthetic issue. The text and `title` assertions use the constants, so they follow.
- In the geometry `evaluate`, also return `titleHeight` (`rect(title).height`) and `cardContentHeight` (card height minus top and bottom borders and padding, computed like `cardContentWidth`).
- Replace the unconditional `expect(g.titleWidth).toBeGreaterThanOrEqual(0.5 * g.cardContentWidth)` with:
  - for the queued row (`i === 1`) at both widths, and for every row at 390: keep `titleWidth >= 0.5 * cardContentWidth`;
  - for held rows at 1440: `titleWidth >= (g.reasonWidth ?? 0) - 1` (the title gets at least as much width as the reason) and `Math.abs(g.cardContentHeight - Math.max(g.titleHeight, 24)) <= 2` (the card is as tall as the title's wrapped height, the inline reason adds none).
- Update the comment above the loop to say so. Keep every other assertion (reason one line at most 26px tall, full width under the first line at 390, on the link's line at 1440, pill top, counts, markers, `expectNoHorizontalOverflow`).
- Negative check (run once, do not commit): with `sm:basis-auto` restored the 1440 test must fail on the title-versus-reason width.

### Step 3: Record the invariant in `app_docs/project-page.md`

- In the Up next card description (around line 130): after "after the title from `sm` up", add that from `sm` up the title and reason split the remaining width equally (both flex basis 0) and the reason truncates inside its share.
- In the Rules (around line 289), after "Below `sm` the reason never shares the title's line and never takes width from the title.", add: "From `sm` up the reason never gets a content-sized flex basis (no `basis-auto`): its width is never more than the title's." No em-dashes.

## Validation

Execute every command to validate the patch is complete with zero regressions.

1. `yarn lint && yarn typecheck && yarn knip && yarn format:check`
2. `yarn test`
3. `yarn build && yarn check:og`
4. With this run's server up (source `.ports.env`, never 3000 unless `PORT` is 3000): `PORT=$PORT yarn test:e2e e2e/queue_dependency_held.spec.ts e2e/queue_row_single_line.spec.ts e2e/row_full_title_top_align.spec.ts`, then the full `PORT=$PORT yarn test:e2e`.
5. Browser check at 1920x1080 and 375x667 on `/projects/SBub/edit-issebya` (or the first project the sidebar lists): the reason span's computed `flex-basis` is `0px` at 1920 and every waiting row's title is at least as wide as its reason, each card's content height equals its title's wrapped height; at 375 the reason stays on its own full-width line under the title.

## Patch Scope

**Lines of code to change:** about 25 (1 class string and 2 JSDoc lines, about 15 E2E lines, 4 doc lines)
**Risk level:** low
**Testing required:** static checks, unit tests, build, the three queue-row E2E specs and the full E2E suite, plus a visual check at 1920x1080 and 375x667.
