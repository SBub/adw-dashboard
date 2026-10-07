# Feature: Rows show the full issue title wrapped, and top-align everything in the row

## Metadata

issue_number: `109`
adw_id: `6da92859`
issue_json: `{"number":109,"title":"Rows: show the full issue title wrapped, and top-align everything in the row"}`

## Feature Description

Run rows (Active and History, both rendered by `RunRow`) and queue rows (`QueueRow`) cut the issue
title with an ellipsis, e.g. `#101 Landing page rendering: static shell, cach...`. To read what a
run or a queued item is about, the reader has to open GitHub or hover for the `title` tooltip,
which does not exist on touch screens.

This feature shows the full title and lets it wrap onto as many lines as it needs. Every other
element of the row (issue number, class chip, `adw_id`, `Updated`/`Queued` timestamp, status pill,
and in the queue the rail marker) stays on the title's first line, top-aligned, instead of being
centred vertically against a multi-line title. The detail grid under a run row (phase, branch,
started, finished, duration) is unchanged, including `Field`'s own `truncate`.

## User Story

As a person watching ADW runs and the queue
I want to read the whole issue title in each row
So that I know what each run or queued item is doing without opening GitHub

## Problem Statement

The title span in both rows is `min-w-0 flex-1 basis-40 truncate text-sm` (`RunRow.tsx:64`,
`QueueRow.tsx:69`). `truncate` forces one line with `text-overflow: ellipsis`, so any title longer
than the row's free width is cut. The containers use `items-center` (`RunRow.tsx:50`,
`QueueRow.tsx:59`), so simply removing `truncate` would centre the issue number, chips, timestamp
and pill against the middle of a two- or three-line title, which breaks the scan line down the list
and moves the queue's status pill away from the rail marker it lines up with.

## Solution Statement

A markup-only change in the two row components, no data, type or helper change:

1. Title span: drop `truncate` and the `title={...}` attribute; keep `min-w-0 flex-1 basis-40` (the
   10rem basis still makes chips wrap to the next line on a narrow screen instead of squeezing the
   title) and add `wrap-break-word` (Tailwind 4.3: `overflow-wrap: break-word`, so a long unbroken
   token such as a URL or path wraps instead of overflowing) and `leading-6`, so the title's line
   box is 24px, the same height as the issue link's (`font-medium`, base size, 24px line) and the
   existing `h-6` pill box. With equal first-line boxes, top alignment puts every element on the
   title's first line.
2. Containers: `items-center` becomes `items-start` on RunRow's inner group (line 50) and on
   QueueRow's content group (line 59).
3. Short items that are shorter than 24px (the class chip and the `manual` badge, both ~20px with
   `py-0.5`; the `adw_id` `<code>` and the timestamp spans, `text-xs` with a 16px line) get a 24px
   first-line box so their text sits centred on the title's first line rather than glued to its top
   edge: `leading-6` on the `text-xs` spans (`adw_id`, `Updated <time>`, `Queued <time>`, the manual
   hint), and an `h-6 items-center` wrapper (the same shape as the existing status pill wrapper) for
   the class chip in `RunRow` and the `manual` badge and the queue `StatusBadge` in `QueueRow`.
   `IssueClassBadge` and `StatusBadge` themselves are not changed (`IssueClassBadge` is also used
   for class hues elsewhere; the chip's own `inline-flex items-center` only centres its text inside
   the chip, which is correct and stays).
4. RunRow's status pill wrapper `flex h-6 shrink-0 items-center` (line 78) stays as it is: it is a
   24px first-line box, its own position is the top of the row (the outer row is already
   `items-start`), and its inner `items-center` centres the 20px pill on the first line. That gives
   pill top = first line top + 2px, which meets the issue's "within 2 px" check whether the title's
   first line is measured by the span's box or by the text's client rect (about 1.5px, the 17px
   glyph box centred in the 24px line). Switching that inner alignment to `items-start` would put
   the pill 0px from the line box but about 3.5px from the text, so it is deliberately kept.
5. Queue rail: unchanged. The gutter (`flex w-10 shrink-0 justify-center pt-4`) puts the marker at
   16px from the row top; the card's content starts at 17px (1px border plus `p-4`), so the 24px
   marker already sits on the title's 24px first line (1px off). The rail line is absolutely
   positioned from the marker centre (`top-7`) to the next marker centre (`-bottom-10`, the 12px row
   gap plus the next marker's 28px offset), relative to the `li`, so it stays continuous at any row
   height; a taller card only makes it longer.

Narrow screens keep today's behaviour: the title wraps within its `flex-1 basis-40` cell, the chips
and the right-hand meta (`ml-auto` timestamp, pill) drop below it when the row is too narrow, and
RunRow's status pill stays in its own right-hand column.

## Relevant Files

Use these files to implement the feature:

- `src/components/RunRow.tsx` - the run row for Active (`variant="active"`, rendered by
  `ActiveRunsView`) and History (`variant="history"`, rendered by `RunHistoryList`). The title span
  (line 64), the inner group (line 50), the chip, `adw_id` and `Updated` spans (lines 68 to 76) and
  the status pill wrapper (line 78) change. `Field` (line 22, `truncate`) and the `<dl>` grid do not.
  The doc comment above `RunRow` stays accurate (it says nothing about truncation).
- `src/components/QueueRow.tsx` - the queue row rendered by `QueueView`. The title span (line 69),
  the content group (line 59), the `manual` badge and hint, the `Queued` span and the `StatusBadge`
  change. The rail line and gutter (lines 38 to 57) do not. Its doc comment says "The card is one
  line"; reword it to say the elements form one row with the title wrapping in full and everything
  top-aligned on its first line.
- `src/components/IssueClassBadge.tsx` - read only: the chip is `inline-flex items-center ... py-0.5
text-xs` (about 20px tall); it is wrapped, not edited.
- `src/components/StatusBadge.tsx` - read only: the pill is about 20px tall; wrapped, not edited.
- `README.md` - lines 360 to 365 describe the run row title as "on one line truncated with an
  ellipsis ... the full text is in the span's `title` attribute"; lines 427 to 429 describe the queue
  card as "all on one line". Both must be rewritten to describe the current code (Documentation
  rule: README describes the code as it is).
- `AGENTS.md` - line 336, "A row is one line: issue link, title, the manual hint ...": reword to
  keep the invariant (no label chip, no wait, no start hint, same elements) while stating that the
  title is shown in full and wraps, and every element is top-aligned on the title's first line. Add
  the same rule for run rows next to the existing `RunRow` architecture bullet.
- `e2e/test_queue_row_single_line.md` - existing journey whose success criterion says each Queue row
  is "on one line"; reword it so it does not fail on a wrapped title (the checks it really makes,
  the markers, `#<number>`, `Queued`, the pill and the absence of `label:`/`waiting`/`starts `, stay).
- `.adw/project.md` - its Tests section lists the `e2e/*.md` journeys by name; add the new journey.
- `.claude/commands/test_e2e.md` - the contract for `e2e/*.md` journey files (format to follow).

### New Files

- `e2e/test_row_full_title_top_align.md` - agent-driven journey that proves the full title is shown
  (no ellipsis) for a 120-character title and that the status pill's top is within 2px of the
  title's first line top, in Active/History run rows and in queue rows, at desktop and mobile width.

## Implementation Plan

### Phase 1: Foundation

No shared code changes. Confirm the Tailwind utilities used exist in the installed version
(`tailwindcss` 4.3.3 ships `wrap-break-word`, `leading-6`, `items-start`, `h-6`). No new dependency.

### Phase 2: Core Implementation

Edit `RunRow.tsx` and `QueueRow.tsx` as in the Solution Statement: remove the truncation and the
tooltip, switch the row groups to `items-start`, give the title and the short items a 24px first-line
box.

### Phase 3: Integration

Both rows are leaf components with typed props; their callers (`ActiveRunsView`, `RunHistoryList`,
`QueueView`) pass the same props and need no change. Update README, AGENTS.md, the existing queue
journey and the profile's journey list, and add the new journey.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. RunRow: full title, top alignment

- Line 50: `flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2` becomes
  `flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-2`.
- Line 64: replace
  `<span className="min-w-0 flex-1 basis-40 truncate text-sm" title={run.issue_title}>` with
  `<span className="min-w-0 flex-1 basis-40 wrap-break-word text-sm leading-6">` (no `title`
  attribute).
- Wrap `<IssueClassBadge issueClass={run.issue_class} />` in a box that only renders when the run
  has a class, so a classless run gets no empty flex item (and no extra gap):
  `{run.issue_class !== null && (<span className="flex h-6 items-center"><IssueClassBadge issueClass={run.issue_class} /></span>)}`.
  Note `IssueClassBadge` also returns `null` for an empty string; use the same truthiness test it
  uses (`run.issue_class ? ... : null`) so the two agree.
- `adw_id` `<code>`: add `leading-6`.
- `Updated` span (active variant): add `leading-6`, keep `ml-auto`.
- Line 78: keep `flex h-6 shrink-0 items-center` exactly (see Solution Statement, point 4). The outer
  `flex items-start justify-between gap-3` (line 49) already top-aligns it.
- Leave `Field`, `Mono` and the `<dl>` grid untouched.

### 2. QueueRow: full title, top alignment

- Line 59: `flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2` becomes
  `flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2`.
- Line 69: replace
  `<span className="min-w-0 flex-1 basis-40 truncate text-sm" title={item.issue_title}>` with
  `<span className="min-w-0 flex-1 basis-40 wrap-break-word text-sm leading-6">`.
- Manual item: wrap the `manual` badge in `<span className="flex h-6 items-center">`; add
  `leading-6` to the hint span `Removing the label does not remove it.`. The badge keeps its own
  `title` attribute (that is the explanation tooltip, not a truncated-title tooltip; the hint
  already makes it visible on touch).
- `Queued` span: add `leading-6`, keep `ml-auto`.
- Wrap `<StatusBadge status="queued" />` in `<span className="flex h-6 shrink-0 items-center">`,
  the same box RunRow uses, so the pill's top is 2px below the first line box top in both rows.
- Do not touch the rail line span, the gutter, or the markers.
- Reword the doc comment's "The card is one line: ..." to "The card is one row: the issue link, the
  title (shown in full, wrapping), the hint for a manual item, `Queued <time>` and the status pill,
  all top-aligned on the title's first line."

### 3. Documentation

- `README.md` lines 360 to 365: rewrite to say each run row shows the issue title in full after the
  issue number, wrapping onto as many lines as it needs (long unbroken tokens break too), with every
  other element of the row top-aligned on the title's first line; runs without a title show the
  number alone; the 10rem flex basis still makes the class badge and `adw_id` wrap to the next line
  on a narrow screen. Drop the sentence about the `title` attribute.
- `README.md` around lines 427 to 429: replace "all on one line" with "in one row, the title shown in
  full and wrapping, every element top-aligned on its first line", and add that the rail line runs
  from marker centre to marker centre whatever the card's height.
- `AGENTS.md` line 336: change "A row is one line: issue link, title, ..." to "A row holds the issue
  link, the title, the manual hint for a manual item, `Queued <time>` and the status pill; the
  title is shown in full and wraps (never `truncate`, `line-clamp` or a `title` tooltip for it), and
  every element is top-aligned on the title's first line." Keep the rest of the bullet.
- `AGENTS.md`, the `Components take typed props only` bullet (or the `RunRow` mention in it): add
  one sentence: "Run and queue row titles are shown in full and wrap; the row is `items-start` and
  every element sits in a 24px first-line box (`leading-6` or an `h-6 items-center` wrapper), so the
  status pill is on the title's first line. The detail grid's `Field` keeps its `truncate`."
- No em-dashes in any edited line.

### 4. Existing journey

- `e2e/test_queue_row_single_line.md`: in the intro, step 7's surrounding text and the Success
  Criteria, replace "one line"/"on one line" with "one row (the title may wrap)". The checks
  themselves (markers, `#<number>`, `Queued`, `queued` pill, no `label:`/`waiting`/`starts `, the
  manual hint, two screenshots) stay unchanged. Keep the file name (renaming it would churn the
  profile and history for no gain).

### 5. New journey: `e2e/test_row_full_title_top_align.md`

Why a journey and not a code test: the profile's only test layer is `src/**/*.test.ts` (pure
helpers and reducers, node environment, no component or DOM layer) and the E2E code suite is `none`.
What changed is CSS layout (no ellipsis, pixel alignment of the pill to the first line), which only a
real browser can measure; no pure helper changed. Model it on `e2e/test_queue_row_single_line.md`
and follow `.claude/commands/test_e2e.md` (`## User Story`, numbered `## Test Steps` with
`**Verify** ...` lines, `## Success Criteria`). The hosted database is read only, so the journey
never writes to it: to get a 120-character title it sets the text of an existing row's title span in
the page through `browser_evaluate` (a DOM-only change in the test browser, nothing is sent
anywhere), which is enough because the layout depends on the markup and the text only.

Steps to write:

1. Navigate to `Application URL` + `/projects`; **verify** the `status` pill reads `live` within 15
   seconds (re-snapshot through `connecting`).
2. Click the first project in the sidebar; **verify** the URL is `/projects/<owner>/<repo>` and the
   `Active`, `Queue` and `History` headings are present. Prefer a project whose History list has at
   least one row (go to the next sidebar project otherwise); if none has any run row, note it and
   only do the queue checks; if none has queued items either, note that the row checks were not
   applicable, take the two screenshots and pass.
3. With `browser_evaluate`, for the first History row (and the first Active row when present, and
   the first Queue row when present): find the row's title span (the `<span>` that follows the
   `#<number>` link inside the row's first flex group), and set its `textContent` to a fixed
   120-character string, e.g. `'Landing page rendering: static shell, cached past days, request-time today card and a Refresh button on the summary'`
   padded or cut to exactly 120 characters (the evaluate script asserts `length === 120`).
4. In the same or a second evaluate, for each modified row return: the span's
   `getComputedStyle(span).textOverflow`, `whiteSpace`, `span.scrollWidth <= span.clientWidth`,
   `span.textContent.length`, the number of line boxes (`range.getClientRects()` count over the
   span's text node, deduplicated by `top`), the top of the first line
   (`range.getClientRects()[0].top`), the span's own `getBoundingClientRect().top`, and the status
   pill's `getBoundingClientRect().top` (the `StatusBadge` element, the span whose text is the
   status, `running`/`failed`/`completed`/`queued`, inside the same `li`).
5. **Verify** for every modified row: `textOverflow` is not `ellipsis`, `whiteSpace` is not `nowrap`,
   no horizontal overflow, the text length is 120, the visible text in a `browser_snapshot` is the
   whole 120-character string (no `...`), and the span has no `title` attribute.
6. **Verify** for every modified row that `Math.abs(pillTop - firstLineTop) <= 2` and
   `Math.abs(pillTop - spanTop) <= 2`.
7. **Verify** for a modified Queue row that the rail marker's (`next` or the ordinal)
   `getBoundingClientRect().top` is within 2px of the first line top as well, and when the Queue has
   two or more rows, that the rail line element (the `aria-hidden` span with the queued border class
   in the first `li`) has a bottom at or below the second row's marker centre (line unbroken).
8. **Verify** a run row's detail grid still truncates: a `dd` under `Branch` has computed
   `textOverflow` `ellipsis`.
9. Take a screenshot of the project page at 1920x1080.
10. Resize to 375x667, re-run the measurements of steps 4 to 6 (the text is still set) and **verify**
    the title still wraps (line count greater than at desktop or at least 3), still no ellipsis, and
    the pill still within 2px of the first line top for run rows (RunRow's pill keeps its right-hand
    column). For queue rows at this width, the `Queued` time and pill may drop below the title; only
    verify no ellipsis and the marker on the first line.
11. Take a screenshot of the project page at 375x667.

Success Criteria: the 120-character title is shown in full with no ellipsis and no overflow in every
row type that was present; the status pill (and the queue marker) top is within 2px of the title's
first line top at desktop; the title wraps at 375px; the run detail grid still truncates; 2
screenshots taken.

### 6. Profile

- `.adw/project.md`, Tests section: add `e2e/test_row_full_title_top_align.md` to the list of
  journeys. Do not rename or reorder any `##` heading.

### 7. Run the Validation Commands

Run every command in `Validation Commands` below and fix anything that fails (never by weakening a
rule or a test).

## Testing Strategy

### Unit Tests

None. The change is Tailwind classes and markup in two components; no pure helper, reducer, type,
query key or data function changes, and the unit layer (`src/**/*.test.ts`, node, no DOM) cannot
render a component or measure layout. `durationLabel`, `queuePositions` and `queueSource` are
untouched, so their tests stay as they are. The existing scan tests (`status-colors.test.ts`,
`layers.test.ts`) still run: the edit must add no status hue class and no z-index.

### Test Coverage

No unit test needed: the behaviour is CSS layout (no ellipsis, pixel alignment) in components, and
the profile's only code test layer is pure helpers under `src/**/*.test.ts`, with no component layer
and E2E code suite `none`; adding a DOM test environment for two class changes would invent a layer
the project does not have. The coverage that fails without this change is the agent-driven journey
`e2e/test_row_full_title_top_align.md` (Step 5), which the test phase runs: today it fails on
`textOverflow: ellipsis` and on a horizontally overflowing title span, and a fix that only removed
`truncate` while keeping `items-center` fails its 2px pill-to-first-line check.

### Edge Cases

- Title `null` (old runs, queue items without a title): no title span, row unchanged; the chips stay
  on one line next to the number.
- Run with `issue_class` `null` or empty: no chip wrapper is rendered (no empty flex item, no extra
  gap).
- Run with `issue_number` `null`: the `no issue` text (`text-sm`, 20px line) starts at the top like
  the rest; acceptable, it has no title next to it. Optionally give it `leading-6` for consistency.
- A long unbroken token in a title (URL, file path, `snake_case_identifier`): breaks via
  `wrap-break-word`, no horizontal scroll at 375px.
- A short title that fits on one line: the row looks as today (same 24px line height as the issue
  link, so no height jump).
- Very long title in a queue row: the rail line still connects the markers (it is positioned on the
  `li`), and the marker stays on the first line.
- The last queue row: still draws no rail line (`group-last:hidden` untouched).
- Narrow screen (375px): chips and the `ml-auto` meta drop below the title; RunRow's pill stays in
  its own column at the top right.
- Dark mode: no colour classes change.

## Acceptance Criteria

- `RunRow` and `QueueRow` title spans have no `truncate`, `line-clamp`, `text-ellipsis` or
  `whitespace-nowrap`, and no `title` attribute; they keep `min-w-0 flex-1 basis-40` and add
  `wrap-break-word` and `leading-6`.
- RunRow's inner group and QueueRow's content group use `items-start`; no `items-center` remains on a
  row group (it remains only inside the `h-6` first-line boxes and the chips themselves).
- A row with a 120-character title shows the whole title (no ellipsis) in Active, History and Queue,
  and the status pill's top is within 2px of the title's first line top (journey Step 5).
- The queue rail line is continuous between rows and the marker sits on the title's first line.
- The run detail grid is unchanged, `Field` still `truncate`s.
- README and AGENTS.md no longer describe the rows as one truncated line; the existing queue journey
  no longer requires a single line; the profile lists the new journey.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test` and `yarn build` pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint` - ESLint over the changed components.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`; the conditional chip wrapper must type-check
  (do not stage the rewritten `next-env.d.ts`).
- `yarn knip` - no unused export or file introduced.
- `yarn format:check` - Prettier on the components, docs and the new journey (`yarn format` to fix).
- `yarn test` - vitest; includes the `status-colors` and `layers` scans that read `src/` and fail on
  an inline status hue or a z-index at or above the tooltip layer.
- `yarn build` - the production build (needs `.env.local`); proves the prerendered shell still builds
  with the changed components.
- `grep -n "truncate\|title={" src/components/RunRow.tsx src/components/QueueRow.tsx` - the only
  remaining `truncate` is `Field`'s `dd` (RunRow) and the only `title=` is `Field`'s and the queue
  `manual` badge's explanation.

## Notes

- No new dependency. `wrap-break-word` is the Tailwind 4.3 name for `overflow-wrap: break-word`
  (`break-words` also exists in the installed version; prefer `wrap-break-word`, the current one).
- Why 24px first-line boxes instead of only `items-start`: with bare `items-start` every element
  starts at the row top but the elements have different heights (24px link, 20px title line and
  chips, 16px `text-xs` spans), so the small ones would sit visibly high against the title text. A
  shared 24px line box keeps them on the same visual line, and it matches the queue marker's `h-6`.
- No browser screenshots beyond the journey are needed from review for this to be judged, but the
  review phase's standard captures of `/projects/SBub/issebya-homes-ai-system` at 1920x1080 and
  375x667 should show History rows with long titles wrapped in full and pills on the first line.
- No clock read, data, cache, query key, realtime or boundary change; none of the AGENTS.md
  architecture invariants are touched beyond the row-layout wording.
