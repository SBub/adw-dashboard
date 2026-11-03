# Patch: Make the queue E2E's "title not squeezed" check hold for the correct layout at 390 and 1440

## Metadata

adw_id: `c640ae9f`
review_change_request: `Issue #2: The spec's validation command PORT=<run port> yarn test:e2e (run as PORT=9200 yarn test:e2e) exits 1: 157 passed, 1 skipped, 2 failed. Both tests in e2e/queue_dependency_held.spec.ts fail at line 173, expect(g.titleWidth).toBeGreaterThanOrEqual(0.5 * g.cardContentWidth). At 1440 the title measured 46px (needed 357), which is the real defect in issue 1. At 390 it measured 123.6px (needed 136): with the link and pill on the first line of a 272px card, no title can reach 50%, so that threshold fails even when the layout is correct. At 375 live, the waiting rows' titles are as wide as the queued row's title (about 145px of 257px). Resolution: After fixing issue 1, change the 'title not squeezed' assertion in e2e/queue_dependency_held.spec.ts to something the correct layout satisfies at both widths. At 390, require the title to fill the first line's remaining width (title right edge within a few px of the pill's left minus the gap). At 1440, require the title width to be at least the reason span's width, or at least a fixed floor such as 0.3 of the card content width. Keep the other assertions as they are. Re-run PORT=<run port> yarn test:e2e and confirm it exits 0. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-255-adw-c640ae9f-sdlc_planner-queue-show-dependency-held-items.md`
**Issue:** The geometry loop in `e2e/queue_dependency_held.spec.ts` asserted `titleWidth >= 0.5 * cardContentWidth` for every row at both widths. At 1440 that caught the real squeeze (issue 1, fixed by `patch-adw-c640ae9f-reason-basis-zero-from-sm.md`: the reason span is now `sm:flex-1 sm:basis-0`). At 390 it cannot hold for any layout: the link and the pill take more than half of a 272px card's first line, so the title tops out near 124px of 272px.
**Solution:** Split the check by width. At 390, every row's title must fill the first line's remaining width: `pillBoxLeft - titleRight <= 14` (the 12px `gap-x-3` plus 2px slack). At 1440, the queued row keeps `titleWidth >= 0.5 * cardContentWidth`; a held row's title must be at least as wide as its reason (`titleWidth >= reasonWidth - 1`) and at least `0.3 * cardContentWidth`, and the card is only as tall as the title's wrapped height. The working tree already carries the per-width split and the reason-width check (verified: `PORT=9200 yarn test:e2e e2e/queue_dependency_held.spec.ts` passes both tests); this patch adds the 0.3 floor, tidies the header comment and confirms the whole suite exits 0.

## Files to Modify

Use these files to implement the patch:

- `e2e/queue_dependency_held.spec.ts`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Confirm issue 1's fix is in place

- `src/components/QueueRow.tsx`: the reason span's `className` contains `sm:flex-1 sm:basis-0` and no `sm:basis-auto`. If `sm:basis-auto` is still there, apply `specs/patch/patch-adw-c640ae9f-reason-basis-zero-from-sm.md` Step 1 first. Make no other component change.

### Step 2: Keep the per-width "title not squeezed" assertion and add the desktop floor

- In the geometry loop of `e2e/queue_dependency_held.spec.ts` the branch must read:
  - `width === 390`: `expect(g.pillBoxLeft - g.titleRight).toBeLessThanOrEqual(14)` for every row (no 0.5 threshold at 390).
  - `width === 1440`, `i === 1` (queued row): `expect(g.titleWidth).toBeGreaterThanOrEqual(0.5 * g.cardContentWidth)`.
  - `width === 1440`, held rows: keep `expect(g.titleWidth).toBeGreaterThanOrEqual((g.reasonWidth ?? 0) - 1)` and the card height check, and add `expect(g.titleWidth).toBeGreaterThanOrEqual(0.3 * g.cardContentWidth)` right after the reason-width check.
- Ensure `titleRight` and `pillBoxLeft` (`rect(pill.closest("div") ?? pill).left`) are returned by the `evaluate`; drop `reasonScrollWidth` and `reasonClientWidth` from the returned object if no assertion reads them.
- Update the comment above the loop to mention the 0.3 floor for held rows from `sm` up.
- Keep every other assertion as it is (counts, order, markers, pills, reason text and `title`, pill top on the link's line, reason at most 26px tall, under the first line and at least 0.9 of the card at 390, on the link's line at 1440, `expectNoHorizontalOverflow`).

### Step 3: Tidy the header comment

- Re-wrap the header comment lines 11 to 15 (the one that runs past 100 columns after "on the title's line from `sm` up)") to the file's comment width. No em-dashes.

## Validation

Execute every command to validate the patch is complete with zero regressions. Source `.ports.env` for the run port (`PORT=9200`); the `/prepare_app` server must already be up on it. Never set `CI=1`.

1. `yarn lint`
2. `yarn typecheck`
3. `yarn knip`
4. `yarn format:check`
5. `PORT=9200 yarn test:e2e` (must exit 0; both `dependency-held items show as waiting rows` tests at 390 and 1440 pass, plus the rest of the suite)

## Patch Scope

**Lines of code to change:** about 5 (one assertion, one comment line, header re-wrap, two unused fields)
**Risk level:** low
**Testing required:** the full Playwright suite against the run's server on port 9200, exiting 0
