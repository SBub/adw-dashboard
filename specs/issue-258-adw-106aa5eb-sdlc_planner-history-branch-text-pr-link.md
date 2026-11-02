# Bug: History links finished runs to deleted branches instead of their pull request

## Metadata

issue_number: `258`
adw_id: `106aa5eb`
issue_json: `{"number":258,"title":"fix: History links finished runs to their pull request, not to branches the toolkit has deleted"}`

## Bug Description

Every History card (the Shipped section of a project page, `RunRow` in the `history` variant) puts a small `↗` link beside the branch name that opens `https://github.com/<owner>/<repo>/tree/<branch>`. Since SBub/adw-toolkit#167 the toolkit's scheduled sweep deletes run branches, remote and local, once they are merged or superseded, and it has cleared the backlog. So for nearly every finished run that link opens GitHub's 404 page, in every project.

Expected: a finished run's card links only to what still exists, its pull request (the existing PR field, `#<n>` to `/pull/<n>`, built by `pullRequestHref`) when it has one, otherwise nothing. The branch name stays visible as plain monospace text, selectable in one click, never a link.

Actual: every History card with a `branch_name` carries an anchor to `/tree/<branch>`, which 404s.

## Problem Statement

`Branch` in `src/components/RunRow.tsx` (lines 54 to 74) always renders an anchor built by `branchTreeHref` (`src/lib/run-view.ts:71`) next to the branch name. History only ever lists completed runs (`app_docs/project-page.md`: "history is completed-only now"), and the branches of completed runs are deleted by the toolkit, so the link is dead by construction.

## Solution Statement

Remove the tree link from the History card's branch: `Branch` renders only the `select-all` monospace `<code>` (or `none` when there is no branch). The PR field already links to the pull request when `pr_number` is set and shows nothing when it is not, so requirement 1 is met by what is there. Delete `branchTreeHref` and its unit tests, since nothing else uses it (knip would otherwise flag the unused export). Update the unit test, the E2E spec and the two docs that describe the link.

The Active row (the only place a `running` run appears) already shows its branch as truncating plain text with no link, and its existing unit test asserts no `/tree/` there. Issue item 3 says a running run _may_ keep a branch link; it is permissive, and adding a new link to the Active row is out of scope for a bug fix and would keep `branchTreeHref` alive. So no branch link is rendered anywhere after this change.

## Steps to Reproduce

1. `source .ports.env` (fall back to `PORT=3000` only if the file is absent) and have the app running on `http://localhost:$PORT` (the `/prepare_app` server).
2. Open `/projects/SBub/issebya-homes-ai-system` (or the first project the sidebar on `/projects` lists).
3. In the Shipped section, find the `↗` beside a card's branch name (`aria-label="Open branch <branch> on GitHub"`); its href is `https://github.com/<slug>/tree/<branch>`.
4. Open it: GitHub answers 404 because the toolkit deleted the merged branch.
5. Equivalently, before the fix `yarn test` passes the assertion `links the branch's tree on GitHub beside the name` in `src/components/RunRow.test.ts`, and `e2e/history_card_fields.spec.ts` asserts the `/tree/` href exists.

## Root Cause Analysis

The History card was designed (spec issue-145, `app_docs/screens-and-components.md` Rules) when merged branches usually still existed on GitHub; the comment on `Branch` already admits "a merged branch is often deleted, so the tree may 404". Since adw-toolkit#167 that is no longer "often" but "always" for completed runs. The component has no notion of whether the branch exists (the UI database has no such column, and the issue forbids changing it), and History contains only finished runs, so the only correct rendering is no tree link at all. The pull request is the durable artifact and is already linked by the PR field.

## Relevant Files

Use these files to fix the bug:

- `src/components/RunRow.tsx` - `Branch` (lines 54 to 74) renders the dead `/tree/` anchor; the import on line 3 and the doc comment on `RunRow` (lines 76 to 90) mention `branchTreeHref`. The PR field (lines 166 to 177) already links to the pull request.
- `src/lib/run-view.ts` - `branchTreeHref` (lines 65 to 74), to be deleted; `pullRequestHref` stays.
- `src/lib/run-view.test.ts` - the `branchTreeHref` describe block (line 54 on) and its import (line 3), to be deleted.
- `src/components/RunRow.test.ts` - unit test (vitest, `src/**/*.test.ts`, server-rendered markup) asserting the tree link; to be rewritten to assert the fixed behaviour.
- `e2e/history_card_fields.spec.ts` - E2E spec on the History card; its first test asserts the `/tree/` link (lines 116 to 123) and its header comment describes it.
- `e2e/row_full_title_top_align.spec.ts` - reads History's Branch field style; check it does not depend on the anchor (it reads the `code`, so it should be unaffected).
- `app_docs/screens-and-components.md` - the doc that covers "the History card's fields, its branch link or its pull request link" per `docs/conditional-docs.md`; lines 54 to 60 (card description) and lines 76 to 94 (Rules: `branchTreeHref` call, "the GitHub tree link beside it, never on the name").
- `app_docs/project-page.md` - lines 170 to 185 describe the History card's fields; check its Branch wording.
- `docs/conditional-docs.md` - the index line for `app_docs/screens-and-components.md` mentions "its branch link"; adjust the wording.
- `knip.json` - dead-code config; `yarn knip` must stay green after `branchTreeHref` is removed.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Remove the tree link from the History card's branch

- In `src/components/RunRow.tsx`, change `Branch` to take only `branch: string | null` and render `<Mono value={null} />` when it is null, else `<code className="select-all font-mono text-sm">{branch}</code>` and nothing else (no anchor, no glyph).
- Replace its comment with: History's branch is the full name as plain text, selected whole by one click, never a link, because the toolkit deletes merged and superseded run branches (adw-toolkit#167); the card links to the pull request instead (the PR field).
- Update the call site to `<Branch branch={run.branch_name} />`.
- Drop `branchTreeHref` from the import on line 3.
- In the `RunRow` doc comment, remove "branchTreeHref for the History card's branch link," and state that the branch is shown as text and the PR field is the card's only GitHub link besides the issue.

### 2. Delete `branchTreeHref`

- Remove `branchTreeHref` and its JSDoc from `src/lib/run-view.ts`.
- Remove the `describe("branchTreeHref", ...)` block and the import from `src/lib/run-view.test.ts`.
- `grep -rn branchTreeHref src e2e app_docs docs` must return nothing (spec files under `specs/` may keep historical mentions).

### 3. Rewrite the RunRow unit test

- In `src/components/RunRow.test.ts`, replace `links the branch's tree on GitHub beside the name` with tests that fail on the unfixed code:
  - `a finished run with a PR links the pull request and shows the branch as text`: render `completed` (has `pr_number: 143`) in `history`; expect `href="https://github.com/${SLUG}/pull/143"`, the `select-all` `<code>` with `BRANCH`, and `not.toContain("/tree/")`; also assert the Branch `dd` contains no `<a` (slice from `ddAfter(html, "Branch")` to the next `</dd>`).
  - `a finished run without a PR shows the branch as text and no link`: render `{ ...completed, pr_number: null }` in `history`; expect the `<code>` with `BRANCH`, `not.toContain("/tree/")`, `not.toContain("/pull/")`, and the only `<a` in the markup is the issue link (`/issues/141`).
- Keep the existing `shows none and no link without a branch` and the Active describe block (`keeps the truncating branch ...` already asserts no `/tree/` for a running run).

### 4. Update the E2E spec

- In `e2e/history_card_fields.spec.ts`:
  - Rewrite the header comment: the branch is shown in full as plain text, selected whole by one click, never a link (the toolkit deletes merged branches); the PR field is the card's pull request link.
  - In `the first card shows exactly its fields`, replace the tree-link block (lines 116 to 123) with: `await expect(field(page, card, BRANCH_DT).locator("a")).toHaveCount(0);` and drop the now unused `slugOf(href)` usage only if `href` becomes unused there (keep `slugOf`, the PR test uses it).
  - Add a test `no History card links to a branch tree`: `requireProject(page, firstCardHasBranch, ...)`, then `await expect(section(page, "Shipped").locator('a[href*="/tree/"]')).toHaveCount(0);`. This fails before the fix (every card with a branch carries one) and passes after.
- Read `e2e/row_full_title_top_align.spec.ts` lines 150 to 190 and confirm nothing there reads the anchor; change nothing if so.

### 5. Update the docs

- `app_docs/screens-and-components.md`:
  - Card description (around line 57 to 58): replace "with a small link to the branch on GitHub" with: the branch as plain monospace text, never a link, because the toolkit deletes merged and superseded branches (adw-toolkit#167); the card's link goes to the pull request (the PR field) when the run has one, otherwise there is none.
  - Rules (lines 80 to 94): remove `branchTreeHref(projectSlug, run.branch_name)` from the list of helpers, and replace "and the GitHub tree link beside it, never on the name" with "and never a link: do not link a finished run's branch to GitHub (its branch is deleted once merged or superseded, adw-toolkit#167); the pull request link is the PR field".
- `app_docs/project-page.md` (lines 175 to 185): where it lists Branch, add that it is plain text with no link; PR stays the pull request link.
- `docs/conditional-docs.md`: in the `screens-and-components.md` line, change "its branch link or its pull request link" to "its branch text or its pull request link".
- No em-dashes anywhere.

### 6. Run the validation commands

- Run every command in `Validation Commands` below, in order, and fix anything that fails without weakening a rule, type or test.

## Test Coverage

- Unit (vitest, `src/components/RunRow.test.ts`): a finished run with a PR renders the `/pull/143` link and the branch as text with no anchor in the Branch field; a finished run without a PR renders the branch as text, no `/tree/` and no `/pull/` link; the existing Active test keeps asserting a running run shows no `/tree/` link. Both new history tests fail against the unfixed code because it emits `href=".../tree/<branch>"`.
- E2E (Playwright, `e2e/history_card_fields.spec.ts`): `no History card links to a branch tree` asserts zero `a[href*="/tree/"]` in the Shipped section, and the first-card test asserts no anchor in the Branch field. Both fail before the fix, against the live History view.
- Deleting `branchTreeHref` removes its unit tests with it; no replacement test is needed for a deleted helper.

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- `grep -rn "branchTreeHref\|/tree/" src app_docs docs` - before the fix lists the helper, the anchor and the docs; after it, returns nothing except possibly the `not.toContain("/tree/")` assertions in `src/components/RunRow.test.ts`.
- `yarn test` - before the fix the new RunRow history tests fail (the markup contains `/tree/`); after it, all unit tests pass.
- `yarn lint` - ESLint stays clean.
- `yarn typecheck` - the `Branch` signature change and the removed import compile (do not stage `next-env.d.ts`).
- `yarn knip` - no unused export left behind after deleting `branchTreeHref`.
- `yarn format:check` - Prettier clean on every changed file (`yarn format` to fix).
- `yarn build` - production build succeeds (needs `.env.local`).
- `yarn check:og` - post metadata check after the build, unaffected but part of the suite.
- E2E runs in the test phase as `PORT=<run port> yarn test:e2e` against the `/prepare_app` server; `e2e/history_card_fields.spec.ts` must pass. Never set `CI=1`.

## Notes

- No database or toolkit change, no new dependency.
- Issue item 3 ("a running run may keep the branch link") and verification line 1's "a running run renders the branch link" are not implemented: History never contains a running run (it is completed-only), and the Active row, the only place running runs appear, has never had a branch link (its unit test asserts no `/tree/`). Adding one would be new behaviour outside this bug and would keep `branchTreeHref` alive against item 4. The plan keeps the running run's branch as plain text and tests that.
- The `/projects` Building now list uses the same Active `RunRow` variant; unaffected.
- Commit as `fix: ...` with no trailers of any kind.
