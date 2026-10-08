# Chore: Queue row: drop the manual hint and the queued time; fix the squeezed title

## Metadata

issue_number: `137`
adw_id: `b37d7caa`
issue_json: `{"number":137,"title":"Queue row: drop the manual hint and the queued time; fix the squeezed title"}`

## Chore Description

A Queue row (`src/components/QueueRow.tsx`) currently renders the issue link, the title, a
`manual` badge plus the hint "Removing the label does not remove it." for items added with
`adw_queue.py add`, `Queued <time>` and the `queued` pill. All of them share one `flex-wrap` group
where the title has `basis-40`, so the title is squeezed into a narrow column (wrapping over three
lines) and, below `sm`, the pill drops onto its own line.

Neither extra element earns its place: the manual badge only appears for the CLI fallback (its
user already knows how the item got there; label items show no source since #86), and
`Queued <time>` does not order the queue (`queuePositions` ranks by `position`, never
`queued_at`).

After this chore a Queue row is: the `#<number>` link, the title (full, wrapping, taking the
remaining width) and the `queued` pill, all top-aligned on the title's first line, the pill
right-aligned on that first line at every width (1280px and 375px included). The rail, the gutter
marker (`next` / ordinal) and the card are unchanged.

- `queueSource` and `src/lib/queue-source.ts` (plus its test) lose their only reader and are
  deleted (`yarn knip` would flag them otherwise).
- `queued_at` and `source` stay in `QueueItem` and `QUEUE_COLUMNS` (the boundary rule keeps the
  column list equal to the row type); they are simply not rendered.
- The Queue section description ("removing the label withdraws it") stays. The section's
  `detail` tooltip currently says "Items added by hand show a manual marker"; that becomes false
  and must be reworded in the same change (see Step 3).

## Relevant Files

Use these files to resolve the chore:

- `src/components/QueueRow.tsx`: the row being simplified (remove badge, hint, `Queued` time,
  `BADGE`, the `Timestamp` and `queueSource` imports; rework the flex layout; rewrite the doc
  comment).
- `src/lib/queue-source.ts`: the `queueSource` parser, whose only reader is `QueueRow`. Delete.
- `src/lib/queue-source.test.ts`: its unit test. Delete with it.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx` (around line 305-320): the Queue
  `SectionHeading`; its `detail` mentions the manual marker that no longer exists. The
  `description` is kept.
- `src/types/adw.ts`, `src/data/index.ts`: `QueueItem` and `QUEUE_COLUMNS`. Read only to confirm
  nothing changes there; `source` and `queued_at` stay.
- `src/components/Timestamp.tsx`: still used by `RunRow` and `ProjectNav`, so it stays (knip will
  not flag it).
- `app_docs/project-page.md`: step 4 of the page walk-through (lines ~113-128: the row contents,
  the source hint, `Queued <time>`, `none` when null, the `queueSource` paragraph) and the Rules
  bullet "The Queue is a rail" (lines ~240-242: "the manual hint for a manual item, `Queued
<time>`"). Matches `docs/conditional-docs.md` ("changing the project page's ... Queue ...
  sections").
- `app_docs/screens-and-components.md`: Rules bullet at lines ~104-107 names `queueSource`,
  `src/lib/queue-source.ts` and its test. Matches the index line ("changing ... a row's layout").
- `docs/conditional-docs.md`: index; checked, contains no `queueSource` mention, no change needed
  unless one appears.
- `AGENTS.md`: checked, contains no `queueSource` mention; no change.
- `e2e/test_queue_row_single_line.md`: agent-driven journey asserting `Queued` and the manual
  badge/hint; must be updated.
- `e2e/test_row_full_title_top_align.md`: step 11 says the `Queued` time and the pill may drop
  below the title at 375px; must now assert the pill stays on the first line.
- `.adw/project.md`: lists the e2e journeys; no rename or new file here, so no change.
- `src/components/RunRow.tsx`: reference for how a run row keeps its pill in a right-hand column.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Simplify `src/components/QueueRow.tsx`

- Remove the imports `queueSource` (from `@/lib/queue-source`) and `Timestamp` (from
  `./Timestamp`).
- Remove the `BADGE` constant and the `const source = queueSource(item.source);` line.
- Remove the whole `source?.kind === "manual"` fragment (badge and hint) and the `Queued` span
  (with its `Timestamp` / `none` branches).
- Replace the two nested wrappers (the `flex flex-wrap ... sm:flex-nowrap sm:justify-between`
  outer div and the `contents sm:flex ...` inner div) with a single non-wrapping row, so the pill
  stays on the title's first line at every width:
  ```tsx
  <div className="flex items-start gap-x-3">
    <a ... className="shrink-0 font-medium underline underline-offset-4 ...">#{item.issue_number}</a>
    {item.issue_title !== null && (
      <span className="min-w-0 flex-1 wrap-break-word text-sm leading-6">{item.issue_title}</span>
    )}
    <div className="ml-auto flex h-6 shrink-0 items-center">
      <StatusBadge status="queued" />
    </div>
  </div>
  ```
  - The title keeps `min-w-0 flex-1 wrap-break-word text-sm leading-6` and loses `basis-40`.
  - The link gets `shrink-0` so `#<number>` never wraps; its existing classes otherwise stay.
  - The pill wrapper keeps `flex h-6 shrink-0 items-center` (the 24px box level with the title's
    first line box, matching the gutter marker) and gains `ml-auto` so it stays right-aligned
    when the title is `null`.
  - Keep the title as a direct `<span>` sibling right after the `#<number>` link (the
    `test_row_full_title_top_align` journey locates it that way). Never add `truncate`,
    `line-clamp` or a `title` attribute to it.
- Leave the `<li>`, the rail span, the gutter/marker block and the card `div` untouched.
- Rewrite the doc comment to describe the new row: the gutter marker (`next` / ordinal from the
  `position` prop, reserved for a future drag handle); the card is one row: the issue link, the
  title (in full, wrapping, taking the remaining width) and the `queued` status pill, top-aligned
  on the title's first line, the pill right-aligned on that line at every width; `source` and
  `queued_at` are not rendered (the queue is ordered by `position`); nothing reads the clock; the
  pill uses the same colour map as run rows. Remove the sentences about `queueSource`, the manual
  hint and `Queued <time>`. Also remove the inline comment above the old wrapper about the `sm`
  column and `contents` (replace with a one-line comment only if useful, e.g. that the row does
  not wrap so the pill stays on the title's first line). No em-dashes.

### 2. Delete the orphaned helper

- Delete `src/lib/queue-source.ts` and `src/lib/queue-source.test.ts` (`git rm`).
- Run `grep -rn "queueSource\|queue-source" src` and confirm it returns nothing.

### 3. Reword the Queue section `detail` in the project page

- In `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`, keep the `description` exactly as is.
- Change the `detail` from
  "Items added by hand show a manual marker; those stay until removed by hand. The numbers follow
  the queue ledger's order, so moving an item changes them."
  to
  "Items added by hand stay until removed by hand. The numbers follow the queue ledger's order, so
  moving an item changes them."
  (drops the no-longer-true claim about a marker, keeps the still-true fact.)

### 4. Update `app_docs/project-page.md`

- In step 4 of the walk-through: replace "the title (omitted when `null`), the source hint and
  `Queued <time>` (`none` when `queued_at` is `null`), then the status pill (in its own right-hand
  column from `sm` up, as on run rows, so it stays on the title's first line; below `sm` it may
  wrap with `Queued <time>`): the title shown in full and wrapping, every element top-aligned on
  its first line." with wording such as: "the title (omitted when `null`) and the status pill, in
  one row that does not wrap: the title is shown in full, wrapping and taking the remaining width,
  and every element, the pill included, is top-aligned on its first line, the pill right-aligned
  at every width. `source` and `queued_at` are read but not rendered."
- Delete the paragraph starting "The source is parsed from the stored `source` column by
  `queueSource` ..." through "... the section description already explains the label." Keep the
  following "Every row ends with the amber `queued` `StatusBadge` ..." sentence.
- In the Rules bullet "The Queue is a rail": replace "A row holds the issue link, the title, the
  manual hint for a manual item, `Queued <time>` and the status pill;" with "A row holds the issue
  link, the title and the status pill, and nothing else (no source badge, no queued time);" and
  keep the rest (full wrapping title, top-aligned, no label chip, wait or start hint). Add that the
  pill stays on the title's first line at every width. The `queueSource` rule lives in
  `screens-and-components.md` (Step 5); confirm no other `queueSource` mention remains here.

### 5. Update `app_docs/screens-and-components.md`

- In the Rules bullet at lines ~104-107, keep "`QueueRow` has no `"use client"` (it is rendered by
  `QueueView`, like `RunRow`)" and drop the clause "; the one parse of `queue_items.source` is
  `queueSource` in `src/lib/queue-source.ts`, pure and tested in `src/lib/queue-source.test.ts`",
  ending the sentence after the parenthesis with a period.
- If this doc describes the queue row's contents elsewhere (search for `Queued`, `manual`, `source
hint`), align it with Step 4.

### 6. Check `AGENTS.md` and `docs/conditional-docs.md`

- `grep -n "queueSource\|queue-source" AGENTS.md docs/conditional-docs.md`; expected to return
  nothing already. Remove any hit.

### 7. Update `e2e/test_queue_row_single_line.md`

- Intro: describe the row as issue number, title (may wrap) and status pill; drop `Queued <time>`.
- Step 7: "**Verify** every Queue list item contains `#<number>` and a `queued` status pill, and
  its title when it has one."
- Step 8: also verify no Queue list item contains `manual`, `Removing the label` or `Queued`
  (alongside `label:`, `waiting`, `starts `). Note that `queued` (the pill, lower case) is
  expected; match `Queued` case-sensitively.
- Replace step 9 (the manual-item check) with a desktop layout check: with `browser_evaluate`, for
  the first Queue row, verify the pill's `getBoundingClientRect().top` is within 2px of the title
  span's `getBoundingClientRect().top` (or of the `#<number>` link's top when there is no title)
  and the pill's right edge is within 2px of the card's content right edge.
- Success Criteria: "Every Queue row holds `#<number>`, the title and the `queued` pill, the pill on
  the title's first line at desktop width"; "No Queue row shows `label:`, `manual`, `Removing the
label`, `Queued`, a wait or a start hint"; remove "A manual item keeps its `manual` badge and
  visible hint."

### 8. Update `e2e/test_row_full_title_top_align.md`

- Step 11: replace "for the Queue row that the marker is still on the first line (the `Queued` time
  and the pill may drop below the title at this width)" with "for the Queue row that the marker and
  the pill are both still within 2px of the first line's top (the row does not wrap at this width)".
- Success Criteria: add "At 375x667 the queue row's pill stays on the title's first line."

### 9. Run the validation commands

- Run every command in `Validation Commands` below, in order, and fix anything that fails without
  weakening a rule, type or test.

## Test Coverage

No test needed: this chore removes rendered elements and changes Tailwind classes in a component,
and deletes a helper together with its own unit test. The profile's only automated layer is
`src/**/*.test.ts` (pure reducers and helpers, no component test layer, no Playwright suite), so
there is no layer that could assert the row's markup or layout; no pure logic is added or changed.
The removal of `queueSource` is proven by `yarn knip` and `yarn typecheck` (a stale import fails
both). The visible layout is covered by the updated agent-driven journeys
`e2e/test_queue_row_single_line.md` and `e2e/test_row_full_title_top_align.md` (Steps 7 and 8, an
acceptance gate) and the review phase's screenshots of `/projects/<owner>/<repo>` at 1920x1080 and
375x667.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `grep -rn "queueSource\|queue-source" src app_docs AGENTS.md docs` : must print nothing
  (acceptance criterion; exits 1 on no match, which is the expected result).
- `grep -rn "Removing the label\|Queued{\|BADGE" src/components/QueueRow.tsx` : must print nothing.
- `yarn lint` : ESLint passes on the edited component and page.
- `yarn typecheck` : `next typegen` plus `tsc --noEmit`; proves no stale import of the deleted
  module or `Timestamp` remains. Do not stage the rewritten `next-env.d.ts`.
- `yarn knip` : no unused file or export left behind (the deleted helper, `Timestamp` still used).
- `yarn format:check` : Prettier formatting of the edited `.tsx` and `.md` files.
- `yarn test` : the vitest suite still passes with `queue-source.test.ts` removed.
- `yarn build` : the app still builds and prerenders (needs `.env.local`).

## Notes

- No em-dashes in any edited file (component comment, docs, journeys).
- Do not touch `QueueItem`, `QUEUE_COLUMNS` or `src/data/apply-queue-change*.ts`; their `source`
  and `queued_at` stay because the boundary rule keeps the column list equal to the row type.
- `Timestamp` stays: `RunRow` and `ProjectNav` still use it.
- Width check at 375px: gutter 40px + 12px gap + card border and padding 34px leaves roughly 250px
  of row content; `#<number>`, the ~60px pill and two 12px gaps leave the title well over 100px, so
  it wraps beside the number with the pill on the first line, as the issue's acceptance requires.
- `.adw/project.md` needs no update: no script, port, env file, doc location or journey name
  changes.
- Commit with a bare conventional type, e.g. `chore: simplify queue row to link, title and pill`,
  no trailers.
