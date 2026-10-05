# Patch: Make the info popover's hover area continuous from the button to the bridge

## Metadata

adw_id: `aaa3cb4e`
review_change_request: `Issue #1: The popover does not stay open when the pointer moves onto it. The bridge wrapper (absolute top-full left-0 z-10 pt-2) is positioned against the title div.relative (28px tall, the h2 line height), while the group span is only as tall as the 20px button, centred in that row, leaving a 4px strip (button bottom y=361, bridge top y=365) that belongs to neither. .group:hover turns false at the button's bottom edge and the detail falls back to sr-only. Resolution: patch src/components/SectionHeading.tsx so the hover area is continuous from the button to the bridge (simplest: give the group span self-stretch items-center), verify in the browser that moving the pointer straight down onto the popover keeps it open, and keep the doc comment accurate. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-45-adw-aaa3cb4e-sdlc_planner-section-heading-explanations.md`
**Issue:** In `src/components/SectionHeading.tsx` the hover `group` (`<span className="group inline-flex">`) is only as tall as the 20px button, vertically centred by the title `div.relative flex items-center` (28px, the `h2` line height). The bridge wrapper (`absolute top-full left-0 z-10 pt-2`) is anchored to `div.relative`, so its top is at the row's bottom edge, 4px below the button. Crossing that 4px strip drops `.group:hover`, the detail returns to `sr-only` (1x1) and the bridge collapses, so the popover can never be reached by pointer. This breaks the spec's Solution Statement ("moving the pointer onto it keeps it open") and the Edge Case "Pointer: moving from the button onto the popover keeps it open".
**Solution:** Stretch the `group` span to the full height of the title row with `self-stretch items-center`. Its bottom edge then coincides with `div.relative`'s bottom, which is exactly the wrapper's `top-full`, so the hover area runs without a gap from the button, through the group's own padding-free stretched box, into the `pt-2` bridge and the popover (all descendants of the group). The button stays visually centred via `items-center`. Because the group stretches to whatever height `div.relative` has, this also holds if the row height ever changes. No positioning change, so the popover keeps `left-0` against the title and `max-w-[calc(100vw-2rem)]` at 375px. Update the doc comment so it describes why the bridge is continuous.

## Files to Modify

Use these files to implement the patch:

- `src/components/SectionHeading.tsx`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Stretch the hover group to the title row

- In `src/components/SectionHeading.tsx` line 36, change `<span className="group inline-flex">` to `<span className="group inline-flex items-center self-stretch">`.
- Change nothing else in the markup: keep `div.relative flex items-center gap-2` as the positioning parent, the wrapper `absolute top-full left-0 z-10 pt-2`, the `sr-only group-focus-within:not-sr-only group-hover:not-sr-only` toggle and the inner `w-72 max-w-[calc(100vw-2rem)]` surface.

### Step 2: Keep the doc comment accurate

- In the component's doc comment (lines 23 to 25), state the mechanism precisely, for example: "`not-sr-only` resets position, width and padding, so the element it toggles carries none of them: the positioned wrapper sits around it and the surface inside it. The wrapper hangs from the bottom of the title row (`top-full`), and the group stretches to that row's full height (`self-stretch`), so the hover area runs without a gap from the button through the wrapper's `pt-2` bridge onto the popover." No em-dashes.

### Step 3: Verify pointer persistence in the browser

- Source `.ports.env` (`PORT=9214`) and start `yarn dev` (the profile allows ADW to start it; never touch a server on another port). Open `http://localhost:$PORT/projects/SBub/issebya-homes-ai-system`, or the first project the sidebar on `/` lists if that is 404.
- With Playwright (`browser_evaluate` / `browser_run_code_unsafe` driving `page.mouse.move`), for each of the three info buttons (About Queue, About Active, About History): read the button's and the wrapper's bounding boxes and assert the group's bottom edge equals the wrapper's top (no gap). Hover the button centre, then move the pointer straight down 1px at a time from the button centre to the middle of the popover surface, asserting at every step that `document.querySelector('#section-<title>-detail').matches('.group:hover *')` style check holds (or the detail's bounding box is wider than 1px). Repeat on a diagonal path towards the popover's middle.
- Confirm keyboard focus still opens it (Tab to the button), and that at 375x667 the popover still fits the viewport. Take a desktop and a mobile screenshot of the open popover into `agents/aaa3cb4e/patch_agent/review_img/`. Stop the dev server this run started.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `yarn lint`
- `yarn typecheck`
- `yarn knip`
- `yarn format:check`
- `yarn test`
- `yarn build`
- Browser check from Step 3: pointer moved straight down and diagonally from each info button onto its popover keeps the popover open at every step; keyboard focus still opens it.

## Patch Scope

**Lines of code to change:** about 4 (one className, three comment lines)
**Risk level:** low
**Testing required:** Existing lint, typecheck, knip, format, unit and build checks; manual Playwright pointer-path check of hover persistence on all three section headings at desktop and 375px.
