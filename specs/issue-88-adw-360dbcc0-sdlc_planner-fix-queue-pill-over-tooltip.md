# Bug: the queue rail "next" pill renders on top of the section tooltip

## Metadata

issue_number: `88`
adw_id: `360dbcc0`
issue_json: `{"number":88,"title":"bug: the queue rail \"next\" pill renders on top of the section tooltip","body":"On a project page, opening the Queue section's info tooltip shows the tooltip underneath the rail's \"next\" pill: the pill is painted over the tooltip text. ... Fix: 1. Give the tooltip popover a z-index above all page content (a shared token, e.g. z-50, used by every tooltip from SectionHeading) ... 2. Check the same for the other section tooltips (Active, History) ... 3. Playwright check: hover or focus the Queue info icon with at least one queued item and assert the tooltip's bounding box is not covered (elementFromPoint at the tooltip's centre is the tooltip or its text)."}`

## Bug Description

On a project page (`/projects/<owner>/<repo>`) with at least one queued item, hovering or focusing
the Queue section's info button opens the detail popover under the heading. The rail's `next` pill
(and the ordinal markers `2`, `3`, ...) of the queue rows below are painted over the popover, so the
pill sits on top of the tooltip text. Expected: the popover is the topmost layer of the page while it
is open; nothing in any section below a heading paints over it.

## Problem Statement

The section tooltip and the queue rail markers share one z-index (`z-10`) in the same stacking
context, so paint order falls back to DOM order, and the queue rows come after the heading.

## Solution Statement

Fix it once, in the tooltip: introduce one shared layer token for the section tooltip,
`TOOLTIP_LAYER = "z-50"` in a new `src/lib/layers.ts`, and use it on the popover wrapper in
`SectionHeading` instead of `z-10`. Every tooltip from `SectionHeading` (Queue, Active, History) gets
it, so it sits above every positioned element of the page. The markers keep `relative z-10` (they
need to paint over the rail line; 10 is below 50, so they no longer compete). A unit guard pins that
no other `z-<n>` class in `src/` reaches the tooltip's layer, so a future pill, badge or sticky
element cannot silently climb over it again.

## Steps to Reproduce

1. `yarn dev` (port from `.ports.env`), open `/projects`, wait for the indicator to read `live`.
2. Open a project whose Queue section has at least one item (e.g.
   `/projects/SBub/issebya-homes-ai-system`, or the first listed project with a queue).
3. Hover the `About Queue` info button next to the `Queue` heading.
4. Observe: the amber `next` pill of the first queue row is drawn over the popover's text. In
   devtools, `document.elementFromPoint` at the pill's position inside the popover's box returns the
   pill `span`, not the tooltip.

## Root Cause Analysis

- `SectionHeading` renders the popover wrapper as `absolute top-full left-0 z-10 pt-2` inside a
  `relative` div with no z-index, so the wrapper does not form a contained context with its own
  parent: it competes in the page's root stacking context at `z-10`.
- `QueueRow` renders both markers as `relative z-10 ...` inside `li.group.relative` (no z-index, so
  again no new stacking context). They compete in the same root context at `z-10`.
- Positioned elements with equal z-index paint in tree order. The Queue rows are after the Queue
  heading in the DOM (and Queue is after Active, so the Active tooltip can reach them too), so the
  markers paint last and cover the popover.
- Other positioned content below the headings was checked: `StatusBadge`'s pulse dot
  (`relative`/`absolute`, `z-auto`), the rail line (`absolute`, `z-auto`), `HistorySearch`
  (`relative`, `z-auto`) and `HistoryTransition`'s `opacity-50` (a `z-auto`/0-level context) all
  paint below any positive z-index, so the queue markers are the only offenders today; the guard
  below keeps it that way.

## Relevant Files

Use these files to fix the bug:

- `src/components/SectionHeading.tsx` - the popover wrapper with `z-10`; the one place to fix,
  shared by the Queue, Active and History headings.
- `src/components/QueueRow.tsx` - the `next` pill and ordinal markers with `relative z-10`; read to
  confirm they stay below the tooltip, not changed.
- `src/components/StatusBadge.tsx`, `src/components/HistorySearch.tsx`,
  `src/components/HistoryTransition.tsx` - other positioned content under the Active and History
  headings; checked, no change.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx` - builds the three headings and the
  section order (Active, then the Queue slot, then History); read only.
- `src/lib/status-colors.test.ts` - the existing source-scanning guard (`import.meta.glob` with
  `?raw`), the model for the new guard.
- `AGENTS.md` - the `SectionHeading` rule gets the layer invariant.
- `README.md` - the paragraph on `SectionHeading` (around "Each section's heading, one-line
  description and info-button detail") gets one sentence on the tooltip layer.
- `e2e/test_queue_row_single_line.md` - existing journey, the model for the new one.

### New Files

- `src/lib/layers.ts` - `TOOLTIP_LAYER`, the section tooltip's z-index class, defined nowhere else.
- `src/lib/layers.test.ts` - the regression guard.
- `e2e/test_section_tooltip_layering.md` - agent-driven journey for the issue's Playwright check.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add the shared tooltip layer

- Create `src/lib/layers.ts` exporting `export const TOOLTIP_LAYER = "z-50";`, with a short doc
  comment: the section tooltip is the topmost layer of the page; every other `z-<n>` in `src/` stays
  below it (pinned by `layers.test.ts`); the class is written out in full so Tailwind sees it.

### 2. Use it in SectionHeading

- In `src/components/SectionHeading.tsx`, import `TOOLTIP_LAYER` from `@/lib/layers` and replace the
  wrapper's `z-10` with it: ``className={`absolute top-full left-0 pt-2 ${TOOLTIP_LAYER}`}``.
- Add one sentence to the component's doc comment: the wrapper takes `TOOLTIP_LAYER`, above every
  positioned element below the heading (the queue rail markers are `z-10`), so it is never covered.
- Do not touch `QueueRow.tsx`: its `z-10` keeps the markers over the rail line and is now below the
  tooltip.

### 3. Add the regression guard

- Create `src/lib/layers.test.ts`, modelled on the "status hue guard" in
  `src/lib/status-colors.test.ts` (same `import.meta.glob("/src/**/*.{ts,tsx,css}", { query: "?raw",
import: "default", eager: true })` read and the same string guard):
  - `it("is a numeric z-index class")`: `TOOLTIP_LAYER` matches `/^z-\d+$/`.
  - `it("is the tooltip's layer in SectionHeading")`: the source of
    `/src/components/SectionHeading.tsx` contains `TOOLTIP_LAYER` and no literal `z-<n>` class.
  - `it("finds no z-index at or above the tooltip's layer")`: scan every source except
    `/src/lib/layers.ts` and `/src/lib/layers.test.ts` for `/(?<![\w-])-?z-(\d+)\b/g` (and
    `z-[<n>]` arbitrary values), collect every match whose number is `>=` the tooltip's number, and
    `expect(found).toEqual([])`. Also assert the scan includes `/src/components/QueueRow.tsx` and
    found its `z-10` (so the guard is proven to read the markers).
- Against the unfixed code the second case fails (`SectionHeading` carries a literal `z-10` and no
  token), and with the token at `z-10` the third fails on `QueueRow.tsx`'s two `z-10` markers.

### 4. Add the browser journey the issue asks for

- The profile has no Playwright code suite (E2E code suite `none`); stacking order is a rendered
  layout property no `src/**/*.test.ts` case can observe, and the issue explicitly asks for a
  Playwright `elementFromPoint` check, so this is the one case a journey is warranted.
- Create `e2e/test_section_tooltip_layering.md` modelled on `e2e/test_queue_row_single_line.md`
  (`## User Story`, numbered `## Test Steps` with `**Verify**` lines, `## Success Criteria`):
  1. Open `/projects`, wait for the `status` indicator to read `live`.
  2. Open the first sidebar project whose Queue section has at least one item (read-only, never add
     items); if none has, note that the queue check is not applicable and continue with Active.
  3. Hover `About Queue` (the button with that accessible name). **Verify** the element with id
     `section-queue-detail` is visible.
  4. With `browser_evaluate`, take the tooltip's inner surface's bounding box and, for its centre and
     for the point of the box nearest the `next` pill (if the pill's box intersects it, the
     intersection's centre), **verify** `document.elementFromPoint(x, y)` is the tooltip element or
     inside it (`tooltip.contains(el)`).
  5. Repeat steps 3 and 4 by focusing (Tab to) `About Queue`, and for `About Active`
     (`section-active-detail`) and `About History` (`section-history-detail`).
  6. Screenshot the open Queue tooltip at 1920x1080 and at 375x667.
- This is an acceptance journey, not the regression layer; it is listed here, not in Test Coverage.

### 5. Document the invariant

- `AGENTS.md`, in the "Section headings come from `SectionHeading`" bullet: add that the detail
  popover takes `TOOLTIP_LAYER` from `src/lib/layers.ts` (defined nowhere else), that no other
  element may take a z-index at or above it, and that `src/lib/layers.test.ts` scans `src/` and fails
  on one. No em-dashes.
- `README.md`, after "Each section's heading, one-line description and info-button detail are
  rendered by `SectionHeading`...": one sentence that the popover sits on `TOOLTIP_LAYER` (`z-50`),
  above the queue rail markers (`z-10`) and anything else positioned below a heading.
- `.adw/project.md` needs no change (no script, port, env file or doc location moves).

### 6. Run the validation commands

- Run every command in `Validation Commands` and fix anything that fails.

## Test Coverage

`src/lib/layers.test.ts` (unit layer, `src/**/*.test.ts`, vitest): a source guard that pins
`SectionHeading`'s popover to the shared `TOOLTIP_LAYER` and fails if any other `z-<n>` class in
`src/` is at or above it. It fails on the unfixed code (literal `z-10` in `SectionHeading`, equal to
`QueueRow`'s markers) and passes after the fix; it catches any future positioned element climbing
over the section tooltips. The rendered overlap itself is checked by the review phase and the
`e2e/test_section_tooltip_layering.md` journey.

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- `git stash push -u -m issue-88-guard-check -- src/components/SectionHeading.tsx && yarn test src/lib/layers.test.ts; git stash apply "$(git stash list --format='%H %gs' | grep issue-88-guard-check | cut -d' ' -f1)"` then drop that entry by its tag: reproduces the bug at the unit layer (the guard must fail with `SectionHeading` unfixed), then restores the fix. Alternatively, temporarily revert the one line by hand and run `yarn test src/lib/layers.test.ts`.
- `yarn lint` - lint passes on the new files.
- `yarn typecheck` - the new import and module type-check (never stage `next-env.d.ts`).
- `yarn knip` - `TOOLTIP_LAYER` is used, no dead export.
- `yarn format:check` - Prettier is clean on the new and edited files.
- `yarn test` - the new guard passes and `status-colors.test.ts` and every other test still pass.
- `yarn build` - the app still builds with `cacheComponents` (needs `.env.local`).

## Notes

- No new dependency.
- Review phase: open `/projects/SBub/issebya-homes-ai-system` (or the first listed project with a
  queued item), hover `About Queue` and `About Active`, and screenshot at 1920x1080 and 375x667: the
  popover's text must be fully readable with the `next` pill and ordinals underneath it. The mobile
  width matters most, since the 18rem popover reaches further down and across the queue rows there.
- `z-50` is chosen as the top of Tailwind's default scale, leaving room for anything else that must
  stay below a tooltip.
- If a future element genuinely needs to sit above the tooltips (a modal), raise `TOOLTIP_LAYER`'s
  neighbour deliberately in `src/lib/layers.ts` and adjust the guard, rather than adding an inline
  `z-` class.
