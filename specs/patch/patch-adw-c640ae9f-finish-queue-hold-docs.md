# Patch: finish the feature docs for dependency-held queue items

## Metadata

adw_id: `c640ae9f`
review_change_request: `Issue #1: Step 11 is incomplete, and a binding doc invariant is broken without its rule being rewritten. The branch changes only app_docs/project-page.md; app_docs/realtime.md (Rules bullet on applyQueueChange, line ~182 description, queuedIn), app_docs/data-boundary.md (getQueue reads state queued, lines ~40, ~194, ~367), app_docs/screens-and-components.md (no waiting indigo colour at ~48 and ~244) and docs/conditional-docs.md (project-page.md line) are untouched. In project-page.md the QueueView paragraph (~105-130) still says hollow neutral ordinals and "Every row ends with the amber queued StatusBadge", and the issue-255 spec is missing from its Specifications list. No em-dashes. Severity: blocker`

## Issue Summary

**Original Spec:** specs/issue-255-adw-c640ae9f-sdlc_planner-queue-show-dependency-held-items.md
**Issue:** The code now keeps dependency-held items (`state = held` with a reason starting `DEPENDENCY_HOLD_PREFIX`) in the Queue section, but four feature docs and the doc index still describe a queued-only queue. `app_docs/realtime.md` Rules still says "`applyQueueChange` holds state `queued` only ... do not make it keep started or stopped items", a binding invariant the code now contradicts. AGENTS.md requires that rule to be rewritten in the same change.
**Solution:** Docs-only edits that bring every listed passage in line with the shipped code (`src/lib/queue-hold.ts`, `src/data/apply-queue-change.ts`, `src/data/index.ts`, `src/lib/status-colors.ts`, `src/components/QueueRow.tsx`). No source, test or spec changes.

## Files to Modify

- `app_docs/realtime.md`
- `app_docs/data-boundary.md`
- `app_docs/screens-and-components.md`
- `docs/conditional-docs.md`
- `app_docs/project-page.md`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Rewrite the queue reducer text and its Rules bullet in `app_docs/realtime.md`

- Line ~182 (`applyQueueChange(current: QueueItem[], ev)` bullet): replace "holds the queued items only. INSERT or UPDATE with state `queued` adds or replaces ..." with: it holds the Queue section's items, the ones `inQueueSection` in `src/lib/queue-hold.ts` accepts (state `queued`, or state `held` whose `reason` starts with `DEPENDENCY_HOLD_PREFIX`). An INSERT or UPDATE whose new row is in the section adds or replaces the item by `issue_number` and re-sorts by `position, issue_number`; an UPDATE to anything else removes it (the item started, was stopped, or was held by the merge gate, a `held` with any other reason); DELETE removes the `issue_number` in `ev.old`. A duplicate INSERT or an INSERT outside the section is a no-op, input returned by identity when nothing changed.
- In the `applyQueueChangeToSummaries` bullet (~189-198): after the `queuedIn(current, issue_number)` mention, add that `queuedIn` reads only cached items in state `queued` (a cached dependency-held item counts as not queued), so the sidebar count stays the view's `queued` and a held to queued UPDATE moves it by +1, queued to dependency-held by -1.
- Rules bullet line ~360: replace "`applyQueueChange` holds state `queued` only and removes an item whose new state is anything else; do not make it keep started or stopped items (they are runs)." with "`applyQueueChange` holds the Queue section's items only (`inQueueSection`: state `queued`, or `held` with the `DEPENDENCY_HOLD_PREFIX` reason) and removes an item whose new row is anything else, a gate-held `held` included; do not make it keep started, stopped or gate-held items (they are runs), and do not test the hold anywhere but `src/lib/queue-hold.ts`."
- Leave the line ~382 `queuedIn` ordering rule as is (still true).

### Step 2: Update `getQueue` and the queue key in `app_docs/data-boundary.md`

- Line ~40: change "where `project_id` matches **and `state` is `queued`**" to "where `project_id` matches **and the row is in the Queue section**: `state` is `queued`, or `state` is `held` with a `reason` starting `DEPENDENCY_HOLD_PREFIX`, read through PostgREST `or` with `QUEUE_SECTION_FILTER` from `src/lib/queue-hold.ts`". In the following sentence, make "Every other state ... means the item has left the queue" read "Every other row (`running`, `merged`, `failed`, a `held` the merge gate set, `skipped` and the rest) means ...".
- Line ~194: "`queryKeys.queue(slug)` (`[\"queue\", slug]`) for a project's queued items" becomes "for the items a project's Queue section shows (queued and dependency-held)".
- Line ~367: "`queue_items` by `project_id` with `state = queued`" becomes "with `state = queued` or a dependency hold (`QUEUE_SECTION_FILTER`)".
- Line ~396-397: "`queryKeys.queue(slug)`, the queued items" becomes "the Queue section's items".

### Step 3: Add `waiting` to both colour lists in `app_docs/screens-and-components.md`, and extend the index line

- Line ~48-49: "(queued amber, running emerald ..." becomes "(queued amber, waiting indigo for a queue item held on a dependency, running emerald ...".
- Line ~244: "(queued amber, running emerald with the pulse dot, ..." becomes "(queued amber, waiting indigo, running emerald with the pulse dot, ...". If the inline-hue ban on line ~247 lists hues, add `indigo` to that list.
- `docs/conditional-docs.md` line 11: append "; or which queue items the Queue section shows (the dependency hold)" before the final period of the `project-page.md` line.

### Step 4: Update the QueueView paragraph and Specifications list in `app_docs/project-page.md`

- Specifications list (lines 5-11): append `- specs/issue-255-adw-c640ae9f-sdlc_planner-queue-show-dependency-held-items.md` (keep issue-number order).
- QueueView paragraph (~105-130): state the rail lists the Queue section's items (`queued`, plus `held` items whose reason starts `DEPENDENCY_HOLD_PREFIX`, decided by `inQueueSection`). Replace "the others are hollow (`STATUS_COLORS.neutral.border`) and carry their ordinal" with "the other queued rows are hollow (`STATUS_COLORS.neutral.border`) and carry their ordinal, and a dependency-held row has an empty hollow marker (`STATUS_COLORS.waiting.border`) with no ordinal". Make "Ordinals ... the rank among the queued items" say ranked over state `queued` items only, so a held item takes no number. In the card sentence add: a dependency-held row also shows its reason with the prefix stripped (`dependencyHoldReason`), on one line, `truncate` with the full text in `title`. Replace "Every row ends with the amber `queued` `StatusBadge`" with "Every row ends with a `StatusBadge`: amber `queued`, or indigo `waiting` for a dependency hold, the same component and colour map as a run row's status."
- Check the Rules (~259-283) already match; change nothing there unless it contradicts the code.

### Step 5: Check for em-dashes

- `grep -n "—" app_docs/realtime.md app_docs/data-boundary.md app_docs/screens-and-components.md app_docs/project-page.md docs/conditional-docs.md` returns nothing.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `grep -n "holds state \`queued\` only\|holds the queued\|state\` is \`queued\`\*\*\|Every row ends with the amber" app_docs/*.md`returns nothing, and`grep -n "waiting" app_docs/screens-and-components.md` shows both lists.
- `yarn lint`
- `yarn typecheck`
- `yarn knip`
- `yarn format:check` (run `yarn format` first if Prettier reflows the edited Markdown)
- `yarn test`

## Patch Scope

**Lines of code to change:** about 30 lines of Markdown across 5 files, no source.
**Risk level:** low
**Testing required:** docs only; the commit hook checks (lint, typecheck, knip, format) and `yarn test` must stay green. No build or E2E change.
