# Patch: Header fits the 375 px viewport with the Summary link

## Metadata

adw_id: `6b437178`
review_change_request: `Issue #1: mobile (375x667): adding the third Summary link to SectionNav makes the root layout header overflow the viewport. Measured on /summary: document.documentElement.scrollWidth is 409 with the link and exactly 375 with it hidden (link width 61px). The connecting pill runs past the right edge and the whole page scrolls sideways. The header comes from src/app/layout.tsx, so every route is affected (/, project pages, /skills, /summary). The spec's step 12 requires that at 375 px nothing overflows the page, and develop did not overflow. Resolution: make the header fit at 375px without removing the Summary link (flex-wrap on the header row and/or smaller gaps at small widths), then confirm at 375x667 that document.documentElement.scrollWidth === 375 on /, /skills and /summary. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-55-adw-6b437178-sdlc_planner-summary-page-daily-metrics.md`
**Issue:** The root layout header row (`src/app/layout.tsx`) is a non-wrapping flex row: brand, `gap-6`, `SectionNav` (three links, `gap-4`), then the connection pill. With the new `Summary` link its minimum width is 409 px, 34 px wider than a 375 px viewport, so the pill overflows and every route scrolls horizontally.
**Solution:** Let the header row wrap and tighten the gaps below `sm`. Reducing gaps alone saves only about 20 px (`gap-6` to `gap-3` is 12 px, nav `gap-4` to `gap-3` is 2 x 4 px), short of the 34 px needed, so wrapping is the guarantee and the smaller gaps keep the brand and nav on one line. The outer row gets `flex-wrap` with separate `gap-x`/`gap-y`, and the right-hand group gets `ml-auto` so a wrapped pill stays right-aligned. Desktop (`sm` and up) keeps today's spacing and single line. The Summary link stays.

## Files to Modify

Use these files to implement the patch:

- `src/app/layout.tsx`: header row classes (outer row, brand/nav group, right-hand group).
- `src/components/SectionNav.tsx`: the nav's gap at small widths.

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Let the header row wrap in `src/app/layout.tsx`

- Outer row: `mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3` becomes `mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3`.
- Brand/nav group: `flex items-center gap-6` becomes `flex items-center gap-3 sm:gap-6`.
- Right-hand group: `flex items-center gap-3` becomes `ml-auto flex items-center gap-3` (no effect on one line, where `justify-between` already pushes it right; keeps the pill at the right edge when it wraps).
- No other change to the layout: no new element, no `"use client"`, no hidden link.

### Step 2: Tighten the nav gap below `sm` in `src/components/SectionNav.tsx`

- `<nav aria-label="Sections" className="flex items-center gap-4 text-sm">` becomes `className="flex items-center gap-3 text-sm sm:gap-4"` (Prettier's Tailwind class order, if configured, decides the final order; run `yarn format`).
- Leave the three links, their hrefs and the comment untouched.

### Step 3: Confirm at 375x667 in the browser

- Start the app on this run's port (`set -a; . ./.ports.env; set +a; yarn dev`, or `yarn build` then `yarn start`), stopping only the server this run started.
- With the Playwright MCP server, `browser_resize` to 375x667 and, on `/`, `/skills`, `/summary` and the first project page the sidebar lists, `browser_evaluate` `() => document.documentElement.scrollWidth` and require exactly `375` on each.
- Resize to 1920x1080 and check the header is still one line with the same spacing as before (brand, nav, tagline, pill).
- Capture 375x667 screenshots of `/` and `/summary` into `agents/6b437178/patch_agent/review_img/` as evidence.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `yarn lint && yarn typecheck && yarn knip && yarn format:check && yarn test`
- `yarn build` (needs `.env.local`; `/summary` still `◐` in the route table)
- `grep -rn $'\xe2\x80\x94' src/app/layout.tsx src/components/SectionNav.tsx specs/patch/patch-adw-6b437178-header-fits-mobile.md`: no em-dashes.
- Browser check from Step 3: `document.documentElement.scrollWidth === 375` at 375x667 on `/`, `/skills`, `/summary` and a project page; desktop header unchanged at 1920x1080.

## Patch Scope

**Lines of code to change:** 4
**Risk level:** low
**Testing required:** Existing quality gates and build, plus a Playwright measurement of `scrollWidth` at 375x667 on every route sharing the root layout and a desktop visual check. No unit test (class-only change, no component test layer).
