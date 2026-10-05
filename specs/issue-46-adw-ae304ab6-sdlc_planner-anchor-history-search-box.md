# Bug: History header search box drifts to the right when there is no pagination

## Metadata

issue_number: `46`
adw_id: `ae304ab6`
issue_json: `{"number":46,"title":"History header: keep the search box next to the title, pagination on the right, regardless of results"}`

## Bug Description

On a project page (`/projects/<owner>/<repo>`), the History heading row holds the `History` title (with its info button), the search box and the pagination (`HistoryLinks`: left arrow, "N of M", right arrow). The search box's position depends on the content below it:

- With several pages of results, the box sits roughly in the middle of the row, between the title and the pagination.
- With a single page, no results ("No completed runs match ..."), or an empty history, `HistoryLinks` renders `null`. The box then drifts to the far right edge of the row.
- While the pagination island streams in, its fallback is `null`, so the box first appears on the right and then jumps left when the pagination arrives.
- Below `sm`, the box is `w-full` and wraps under the title onto a line of its own.

Expected: the box always sits right after the title group (title plus info button). The pagination always sits at the right edge. Below `md`, the row breaks into two lines: title and search on the first line, pagination right-aligned on the second. There is no horizontal scroll at 360px.

## Problem Statement

The search box and the pagination are siblings of the title group in one `justify-between` flex row. Their position is therefore a function of how many children render, not of the layout. The header needs two stable groups: a left group of [title][info][search] and a right group of [pagination]. Neither group may depend on whether results exist.

## Solution Statement

Give the heading row of `SectionHeading` two slots instead of one:

- `controls`, a new optional slot. It renders inside the left group, right after the title and info button: `flex min-w-0 items-center gap-3`.
- `actions`, the existing slot. It renders in a right group: `ml-auto flex shrink-0 justify-end`. Below `md` this group takes `basis-full` so it drops to a second line and stays right-aligned. It gets `empty:hidden` so an absent pagination leaves no empty line.

The page passes the `HistorySearchBox` boundary as `controls` and the `HistoryPagination` boundary as `actions`.

The search box (both `HistorySearch` and `HistorySearchFallback`) gets a fixed width that can still shrink: `w-64 max-w-full min-w-0`, replacing `w-full sm:w-64`. Its size then no longer depends on the breakpoint, and it fits a 328px content column (360px minus the layout's `px-4`).

The title, info button and popover keep their own `relative` wrapper, so the popover's anchoring from #45 is unchanged. The description line stays under the row. Nothing about search or pagination behaviour changes.

## Steps to Reproduce

1. Read `.ports.env` for `PORT` and start `yarn dev`.
2. Open `http://localhost:$PORT/projects/SBub/issebya-homes-ai-system`, or the first project in the sidebar if that slug is 404, at 1920x1080.
3. With more than one page of history, note that the box sits mid-row, away from the title.
4. Type a query that matches nothing, e.g. `zzzzzz`. The list shows `No completed runs match "zzzzzz".`, the pagination disappears and the box jumps to the far right.
5. Open a project with an empty history, or with one page or less. The box is on the far right.
6. Resize to 360px wide. The box drops to its own full-width line.

## Root Cause Analysis

`SectionHeading` (`src/components/SectionHeading.tsx`) renders its row as:

```
<div class="flex flex-wrap items-center justify-between gap-4">
  <div class="relative flex items-center gap-2">title + info</div>
  {actions}
</div>
```

The page (`src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`) passes `actions` as a fragment of two `SectionBoundary` elements. Each one is a separate flex item of the row, so `justify-between` spreads the free space across three items: title, search, pagination.

`HistoryLinks` returns `null` when there is one page or none, and the pagination boundary's fallback is `null`. In both cases the row has only two items, and `justify-between` pushes the second one (the search box) to the right edge.

The box's `w-full sm:w-64` also makes it take a full line below `sm`. The position is decided by item count and breakpoint, not by a fixed left/right group structure.

## Relevant Files

Use these files to fix the bug:

- `src/components/SectionHeading.tsx`: owns the heading row layout. Add the `controls` slot and the left and right groups here.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: the History heading passes both boundaries in `actions`. Move the search boundary to `controls`, and update the comment that mentions "the search and pagination boundaries in its actions slot".
- `src/components/HistorySearch.tsx`: the `w-full sm:w-64` width on `HistorySearch` and `HistorySearchFallback`.
- `src/components/HistoryLinks.tsx`: renders `null` on a single page. Read it for context only; do not change it.
- `src/app/(dashboard)/layout.tsx`: the `px-4` content padding, used for the 360px width budget. Read only.
- `README.md`: section "What is prerendered and what is not", item 5, describes the `actions` slot holding both islands. Update it to describe `controls` and `actions`.
- `AGENTS.md`: the `SectionHeading` rule says "History's heading takes the search and pagination boundaries in its `actions` slot". Update it to name both slots and the layout invariant.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Split the heading row into a left and a right group in `SectionHeading`

- Add an optional prop `controls?: ReactNode`, with the doc comment "Rendered right after the title and info button, in the left group (History's search box)". Change the `actions` doc to "Rendered at the right edge of the row; below `md` on its own line, right-aligned (History's pagination)".
- Replace the row markup with:
  - Row: `flex flex-wrap items-center gap-x-4 gap-y-2` (drop `justify-between`).
  - Left group: `flex min-w-0 items-center gap-3`. It contains the existing `relative flex items-center gap-2` title and info wrapper, unchanged and still the popover's positioning context, followed by `{controls}`.
  - Right group, rendered only when `actions` is set: `ml-auto flex shrink-0 justify-end empty:hidden max-md:basis-full`, containing `{actions}`.
- Add a sentence to the component's doc comment: the row owns the layout, `controls` stays next to the title and `actions` stays at the right edge, whatever either renders.
- Leave the description `<p>`, the info button, the popover and its ids untouched.

### 2. Give the search box a fixed, shrinkable width

- In `src/components/HistorySearch.tsx`, change the wrapper class of both `HistorySearch` and `HistorySearchFallback` from `relative w-full sm:w-64` to `relative w-64 max-w-full min-w-0`. The fallback must match the live box, so the static shell reserves the same slot.

### 3. Wire the History heading in the page

- In `page.tsx`, pass `controls={<SectionBoundary fallback={<HistorySearchFallback />} detail="Search did not load."><HistorySearchBox ... /></SectionBoundary>}` and `actions={<SectionBoundary fallback={null} detail="Pagination did not load."><HistoryPagination ... /></SectionBoundary>}`. Drop the fragment.
- Leave everything else unchanged: boundaries, fallbacks, details, `HistoryTransition` and `HistoryResults` wrapping.
- Update the JSX comment above `<HistoryTransition>` so it says the search boundary sits in the heading's `controls` slot and the pagination boundary in its `actions` slot.

### 4. Update the docs in place

- `README.md`, item 5 of the History description: say the `controls` slot holds the `HistorySearchBox` island (next to the title), and the `actions` slot holds the `HistoryPagination` island (at the right edge, on a second right-aligned line below `md`).
- `AGENTS.md`, the `SectionHeading` bullet: replace "History's heading takes the search and pagination boundaries in its `actions` slot" with "History's heading takes the search boundary in its `controls` slot and the pagination boundary in its `actions` slot". Add: the heading row owns that layout (search next to the title, pagination at the right edge, independent of results), so do not put both in one slot or reintroduce `justify-between`. No em-dashes.

### 5. Browser evidence for the review phase (E2E is `none`)

- The reviewer opens `http://localhost:$PORT/projects/SBub/issebya-homes-ai-system`, or the first project in the sidebar, at 1920x1080 and at 375x667, as in the profile's Review section. They also check 360px wide, which is the issue's acceptance width. Capture:
  - **Results, several pages**: the box sits right after the title and info button; "N of M" and the arrows sit at the right edge.
  - **No results** (type `zzzzzz` and wait for `No completed runs match "zzzzzz".`): the box is in the same place as above, not on the right.
  - **Pending search** (screenshot immediately after typing, while the list is dimmed): the box has not moved.
  - **Empty history or one page**, if any project in the sidebar has one: the box is still next to the title.
  - **375px and 360px**: line one shows title, info and the box, with the box shrunk and no horizontal scroll. Line two shows the pagination, right-aligned. With no pagination, there is no blank second line.
- Also check that hovering or focusing the info button still opens the popover under the title.

### 6. Run the validation commands

- Run every command in `Validation Commands` below. All must pass.

## Test Coverage

No test needed: this is a pure CSS layout change in server and client components. The project's only test layer is `src/**/*.test.ts` for pure helpers and reducers. The profile has no component test layer and E2E is `none`, so nothing could assert flex placement without inventing a layer. The regression evidence is the review phase's screenshots in task 5: results, no results, pending search, empty history, and at 1920, 375 and 360px.

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- `yarn lint`: lint rules, including the Tailwind and React rules, on the changed components.
- `yarn typecheck`: the new `controls` prop and the page's use of it typecheck (`next typegen` then `tsc --noEmit`; do not stage `next-env.d.ts`).
- `yarn knip`: no dead export or unused prop left behind.
- `yarn format:check`: Prettier on the touched files.
- `yarn test`: the unit suite still passes. This includes `src/lib/status-colors.test.ts`, which scans `src/` for inline status hues; none are added.
- `yarn build`: the project page still prerenders with the History heading in the static shell (needs `.env.local`).

To reproduce before and after: run `yarn dev` (port from `.ports.env`) and follow `Steps to Reproduce`. Before the fix, the box sits on the right with no results. After the fix, it stays next to the title in every state.

## Notes

- No new dependency.
- Compatible with #45: the title, info button and popover keep their own `relative` wrapper inside the left group, so the popover still hangs from the title row. The description stays under the row.
- Compatible with #40: `HistoryLinks`, with its arrows and "N of M", is the child of the right group and unchanged. Its invisible arrow placeholders keep the indicator steady.
- `empty:hidden` on the right group relies on the pagination boundary leaving no element or text child when `HistoryLinks` returns `null` or the fallback is `null`. React's Suspense comment markers do not count for `:empty`. If the reviewer sees a blank second line on mobile while the island streams, that is the cause. It disappears once the island resolves.
- The search error panel (`ErrorPanel`, when the search island throws) would also render in the left group. That is acceptable and unchanged in behaviour.
- Width budget at 360px: 328px of content. The title group is about 100px, plus a 12px gap, leaving about 216px for the box. That is why the box needs `min-w-0 max-w-full` on top of `w-64`, with `min-w-0` on the left group.
