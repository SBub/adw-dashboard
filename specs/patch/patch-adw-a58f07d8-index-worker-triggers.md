# Patch: Add the worker status triggers to the docs index

## Metadata

adw_id: `a58f07d8`
review_change_request: `Issue #2: Spec step 7 says to extend three lines in docs/conditional-docs.md: the screens line ("...; when changing the worker status widget or the sidebar's column layout"), the data-boundary line ("...; when touching getWorkers") and the clock line ("...; when changing the worker store's poll"). docs/conditional-docs.md is not in the diff at all, and its lines 5, 8 and 9 are unchanged. The acceptance criterion "The docs, the index, the profile and the sticky-header journey are updated" therefore fails for the index. Resolution: Edit docs/conditional-docs.md on this branch and append the three triggers from spec step 7 to the app_docs/screens-and-components.md, app_docs/data-boundary.md and app_docs/clock-and-prerender.md lines. Use no em-dashes, then run yarn format:check. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-158-adw-a58f07d8-sdlc_planner-worker-status-widget.md`
**Issue:** Spec step 7 (lines 318-320) requires three new triggers in `docs/conditional-docs.md`, but the branch's commit `947b6d2` never touched the index: lines 5, 8 and 9 still end where they did before the feature, so a later agent changing the widget, `getWorkers` or the poll's clock read is never pointed at the docs that hold those rules.
**Solution:** Append one clause to each of the three lines, after the last existing clause and before the final period, joined with `; ` as the existing lines join their clauses. Nothing else in the file changes.

## Files to Modify

Use these files to implement the patch:

- `docs/conditional-docs.md` (lines 5, 8 and 9 only)

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Extend the screens line (line 5)

- Replace the ending `; when adding or removing `"use client"`.` with
  `; when adding or removing `"use client"`; when changing the worker status widget or the sidebar's column layout.`
- Keep every existing clause on the line exactly as it is (including "its branch link or its pull request link").

### Step 2: Extend the data-boundary line (line 8)

- Replace the ending `; when adding a database read or an environment variable.` with
  `; when adding a database read or an environment variable; when touching `getWorkers`.`

### Step 3: Extend the clock line (line 9)

- Replace the ending `; when a component ships as its Suspense fallback in the served HTML.` with
  `; when a component ships as its Suspense fallback in the served HTML; when changing the worker store's poll.`

### Step 4: Check the edit

- Each line stays a single line (the file does not wrap), uses straight apostrophes and contains no em-dash.
- `git diff -- docs/conditional-docs.md` shows exactly three changed lines (5, 8, 9).

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `yarn format:check`: Prettier accepts the edited index.
- `grep -n "worker status widget or the sidebar's column layout\|when touching \`getWorkers\`\|when changing the worker store's poll" docs/conditional-docs.md`: expect three hits, on lines 5, 8 and 9.
- `grep -n $'\xe2\x80\x94' docs/conditional-docs.md`: expect no output.
- `yarn lint && yarn typecheck && yarn knip && yarn test`: the commit and push hooks stay green (no code changed; do not stage the rewritten `next-env.d.ts`).

## Patch Scope

**Lines of code to change:** 3 (one clause appended to each of three lines)
**Risk level:** low
**Testing required:** Formatting check and the grep checks above; no code, test or build impact.
