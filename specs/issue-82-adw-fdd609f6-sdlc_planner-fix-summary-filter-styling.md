# Bug: Summary filters render as native pill selects in Safari and misalign with Apply

## Metadata

issue_number: `82`
adw_id: `fdd609f6`
issue_json: `{"number":82,"title":"bug: Summary filters render as native pill selects in Safari and misalign with Apply","body":"On /summary, the Project and Window selects and the Apply button differ per browser. Chrome: custom-styled boxes, same height as Apply, one line. Safari: native macOS pill selects with up/down arrows, shorter than the button and sitting lower. Fix: appearance reset on both selects, same height, border, radius, padding and font as Apply, our own chevron with right padding, native <select> kept with labels; one flex row, equal heights, labels above; light and dark covered; check that heights and vertical centres are equal and computed appearance is none. No behaviour change to the filters or the cached summary read."}`

## Bug Description

On `/summary`, the filter row (`src/components/SummaryFilters.tsx`) holds two `<select>`s (Project, Window) and an Apply `<button>`.

- Chrome (expected look): both selects draw as bordered boxes with a chevron, the same height as Apply, on one line.
- Safari (actual): both selects draw as the native macOS pill control with up/down arrows. That control ignores most of our box styling, is shorter than the button, and because the row aligns items to the bottom edge (`items-end`) the shorter selects sit visibly lower relative to the button's centre line. The row looks misaligned.

Expected in every browser: two flat, bordered selects with our own chevron, the exact height, border, radius, padding scale and font of the Apply button, labels above each select, and all three controls sharing one vertical centre.

## Problem Statement

The selects rely on the browser's native rendering (no `appearance` reset) and none of the three controls has an explicit height, so their heights come from each engine's intrinsic control metrics. Chrome happens to honour `py-1` on a select; Safari's native pill does not. The filter row therefore has no browser-independent height or look.

## Solution Statement

Make the controls deterministic, in the component and nowhere else:

1. Reset the native appearance on both selects (`appearance-none` plus `[-webkit-appearance:none]`, so older WebKit drops the pill too) and give selects and button one explicit shared height (`h-8`) and the same border, radius, horizontal padding and `text-sm` font.
2. Draw the chevron ourselves: an inline `aria-hidden` SVG, absolutely positioned at the right inside a `relative` wrapper around each select, `pointer-events-none` so clicks reach the select, with `pr-8` on the select so the text never runs under it. The `<select>` elements and their wrapping `<label>`s stay native, so accessibility and the plain GET form are unchanged.
3. Keep the row `flex flex-wrap items-end gap-3` with labels above the selects. Bottom alignment with equal control heights is exactly "same vertical centre" for the three controls (the label text sits above the select, so centring the whole label column against the button would put the button off the select's centre line).
4. Colours stay on the existing neutral tokens (`border-neutral-300`/`dark:border-neutral-700`, `bg-white`/`dark:bg-neutral-900`, chevron `text-neutral-500`/`dark:text-neutral-400`).

To give the fix a regression test in the project's only test layer (pure `src/lib/*.test.ts`), the class strings move into a small pure module, `src/lib/form-controls.ts`, following the `STATUS_COLORS` precedent (class strings written in full in `src/lib/`, pinned by a test). `SummaryFilters` imports them; no other component changes.

## Steps to Reproduce

1. Source `.ports.env`, `yarn dev`, open `http://localhost:$PORT/summary` in Safari (macOS) at desktop width.
2. Observe: Project and Window render as native pill selects with up/down arrows; they are shorter than Apply and sit lower than its centre.
3. Open the same URL in Chrome: the selects are boxes, roughly the button's height. The difference is the bug.
4. In either browser devtools, `getComputedStyle(document.querySelector('select[name=days]')).appearance` returns `auto` (should be `none`), and `getBoundingClientRect().height` of the selects and the button differ in Safari.

## Root Cause Analysis

`SELECT` in `src/components/SummaryFilters.tsx` is `rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm ...`: no `appearance` reset and no height. With `appearance: auto`, WebKit on macOS renders a `<select>` as the native `menulist` pill, sized by the platform control metrics and ignoring padding and most border styling; Blink renders a styled menulist that does honour padding, so the bug only shows in Safari. The button has no explicit height either (`py-1` plus line height), so even the Chrome match is accidental. With `items-end` on the form, controls of unequal height share a bottom edge and so have different centres, which is the visible misalignment. Fixing it requires both the appearance reset (look) and one explicit shared height (alignment); either alone leaves part of the bug.

## Relevant Files

Use these files to fix the bug:

- `src/components/SummaryFilters.tsx` - the filter form; holds the `SELECT` constant, the two selects, the button and the row layout. The only rendered surface that changes.
- `src/app/summary/page.tsx` - renders `SummaryFilters` inside the `SummaryContent` island; read only to confirm nothing there changes (no change to `getSummary`, the islands or the boundaries).
- `src/components/SectionHeading.tsx` - `InfoIcon` is the house idiom for an inline `aria-hidden` SVG icon (`viewBox`, `stroke="currentColor"`, round caps); the chevron follows it.
- `src/components/HistorySearch.tsx` - the other form control in the app (`INPUT` constant, the only existing appearance reset); reference for class style, not changed.
- `src/lib/status-colors.ts` and `src/lib/status-colors.test.ts` - precedent for class-string constants living in `src/lib/`, written out in full for Tailwind's scanner and pinned by a unit test.
- `vitest.config.ts` - the test layer is `src/**/*.test.ts` only, node environment; there is no component or Playwright layer.
- `knip.json` - every new export must be used (`SummaryFilters` imports all of them, the test imports them too).
- `README.md` - "Summary", **Filters.** paragraph: gets one sentence on the control styling. `AGENTS.md` - gets one rule so the reset is not dropped later.
- `.adw/project.md` - Tests (no E2E suite) and Review (paths, viewports) sections.

### New Files

- `src/lib/form-controls.ts` - the shared class strings for the summary's filter controls (`FORM_SELECT`, `FORM_BUTTON`, and the chevron's `FORM_SELECT_CHEVRON`).
- `src/lib/form-controls.test.ts` - the regression test.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add the shared control classes in `src/lib/form-controls.ts`

- Doc comment in the style of `status-colors.ts`: the one place the summary's filter controls get their box; selects reset the native appearance (WebKit otherwise draws the macOS pill and ignores height and padding); selects and the button share one explicit height so a bottom-aligned row has one centre line; classes written in full for Tailwind's scanner.
- A private base string shared by both, e.g. `const CONTROL = "h-8 rounded-md border border-neutral-300 text-sm leading-none dark:border-neutral-700";`.
- `export const FORM_SELECT = \`${CONTROL} appearance-none [-webkit-appearance:none] bg-white pl-2 pr-8 dark:bg-neutral-900\`;`
  Template interpolation of whole class strings is fine (Tailwind sees each literal); never interpolate part of a class name.
- `export const FORM_BUTTON = \`${CONTROL} px-3 hover:border-neutral-500 dark:hover:border-neutral-500\`;`
- `export const FORM_SELECT_CHEVRON = "pointer-events-none absolute inset-y-0 right-2 my-auto text-neutral-500 dark:text-neutral-400";`
- No status hue anywhere (the status hue guard scans `src/`).

### 2. Write the regression test `src/lib/form-controls.test.ts`

- `FORM_SELECT` contains `appearance-none` and `[-webkit-appearance:none]` (fails today: no reset exists anywhere for a select).
- `FORM_SELECT` and `FORM_BUTTON` contain the same height class (`h-8`), the same border, radius and `text-sm` tokens (split on spaces and assert every token of the shared base is in both). This is the node-layer proxy for "equal bounding-box heights".
- Neither contains a vertical padding class (`/^py-/`), which would fight the explicit height.
- `FORM_SELECT` has right padding (`pr-8`) and `FORM_SELECT_CHEVRON` is `pointer-events-none` and `absolute`, so the text clears the chevron and clicks reach the select.
- Both carry light and dark border tokens (`border-neutral-300`, `dark:border-neutral-700`).

### 3. Restyle `src/components/SummaryFilters.tsx`

- Delete the local `SELECT` constant; import `FORM_BUTTON`, `FORM_SELECT`, `FORM_SELECT_CHEVRON` from `@/lib/form-controls`.
- Add a local `ChevronIcon` (not exported, same file, after the component, in the `InfoIcon` idiom): `<svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={FORM_SELECT_CHEVRON}><path d="M4 6l4 4 4-4" /></svg>`.
- In each `<label>`, wrap the `<select>` in `<span className="relative">` with `<ChevronIcon />` after the select; the select gets `className={FORM_SELECT}`. Keep `name`, `defaultValue`, the options and the label text exactly as they are.
- The button gets `className={FORM_BUTTON}`; keep `type="submit"` and the text.
- Keep the form `method="get" action="/summary"` and its `flex flex-wrap items-end gap-3`, and the labels' `flex flex-col gap-1 ...`. No `"use client"`, no state, no new prop. The component stays a stateless server component (AGENTS.md).

### 4. Update the docs in place

- `README.md`, "Summary", **Filters.** paragraph: one sentence that the selects reset the native appearance and draw their own chevron, and share one height with Apply through `src/lib/form-controls.ts`, so the row looks the same in Safari and Chrome.
- `AGENTS.md`, "Summary" section: one bullet: the filter controls take their classes only from `src/lib/form-controls.ts` (selects `appearance-none`, one shared height with the button, chevron drawn by us, native `<select>` kept); every change to it goes with a test case in `src/lib/form-controls.test.ts`. No em-dashes.

### 5. Browser evidence for the review phase (no E2E suite in this project)

The profile's Tests section says E2E is `none`, so no spec is added and no `e2e/*.md` journey either (a journey is not warranted for a styling fix; the review phase already captures `/summary`). The reviewer:

- Opens `http://localhost:$PORT/summary` and `/summary?project=SBub/issebya-homes-ai-system` (or the first listed project) at desktop 1920x1080 and mobile 375x667, full page, light scheme (and dark if the browser config allows `prefers-color-scheme`).
- Fixed state: two bordered selects with a single down chevron at the right (no up/down arrows), the same height as Apply, all three on one line at desktop, labels above the selects; at 375 the row may wrap but each control keeps its height.
- Runs in the page (`browser_evaluate`): for both `select`s and the `button[type=submit]` of the form, `getBoundingClientRect()` heights are equal and `top + height / 2` are equal (to within 0.5px), and `getComputedStyle(select).appearance === "none"` for both. The MCP browser is Chromium; the computed `appearance: none` there is the cross-engine guarantee, because with the reset WebKit no longer chooses the native pill.

### 6. Run the validation commands

Run every command in `Validation Commands` below; all must pass.

## Test Coverage

Unit test `src/lib/form-controls.test.ts` (vitest, the project's one layer, `src/**/*.test.ts`): asserts the select classes carry `appearance-none` and the `-webkit-` reset and that selects and button share the same explicit height, border, radius and font tokens with no vertical padding. It fails against the unfixed code (the module does not exist and no select has an appearance reset) and catches a later edit that drops the reset or lets the select and button heights drift apart. The rendered check (equal bounding boxes and centres, computed `appearance: none`) is the review phase's `browser_evaluate` in task 5, since the project has no component or Playwright layer.

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- `grep -rn "appearance" src/components/SummaryFilters.tsx src/lib/form-controls.ts` - before the fix prints nothing (reproduces the missing reset); after the fix it shows the reset in `src/lib/form-controls.ts`.
- `grep -n "FORM_SELECT\|FORM_BUTTON" src/components/SummaryFilters.tsx` - after the fix, both selects and the button use the shared classes.
- `yarn lint` - ESLint on the changed component and new module.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`; the new imports and the SVG props type-check (do not stage `next-env.d.ts`).
- `yarn knip` - the three new exports are all used; nothing left over from the deleted `SELECT`.
- `yarn format:check` - Prettier on the new and changed files (`yarn format` to fix).
- `yarn test` - the new `form-controls.test.ts` passes, and the status hue guard still passes over the new files.
- `yarn build` - the `/summary` route still builds with its static shell and request-time hole; needs `.env.local`.

## Notes

- No new dependency. No behaviour change: same GET form, same `name`s and values, same `readSummaryDays`/`readSummaryProject`, same `getSummary` scope and tag.
- `appearance-none` in Tailwind v4 emits the unprefixed property, which Safari supports from 15.4; the arbitrary `[-webkit-appearance:none]` covers older WebKit and matches the issue's explicit request for both.
- `leading-none` with `h-8` keeps the select text vertically centred in WebKit, which centres select text by line box rather than padding once the appearance is reset.
- Do not switch the row to `items-center`: with the label text above each select, centring would align the button with the middle of label plus select, not with the select. Equal heights plus `items-end` is the centre-line alignment.
- Workspace: the single app at the repository root (`adw-dashboard`), which ADW may start; this is a browser-surface change, so review screenshots apply.
- Commit as `fix: reset native select appearance on summary filters` (Conventional Commits, no trailers).
