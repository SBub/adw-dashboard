# Feature: History card links the run's pull request

## Metadata

issue_number: `147`
adw_id: `50c77227`
issue_json: `{"number":147,"title":"History card: link the run's pull request","body":"## Problem\n\nA completed run's change lives in a pull request, but History does not link to it.\n\nDepends on SBub/adw-toolkit#92 (adds `adw.runs.pr_number`and publishes it). Do not start before that is merged and its migration is applied.\n\n## Change\n\n-`src/types/adw.ts`: add `pr_number: number | null`to`Run`(mirrors the new column); add it to the`runs`select in`src/data/index.ts`so the column list stays equal to`Run`'s fields.\n- History card (`RunRow`, `history`variant): a`PR`field after Duration (and before Cost if that has landed), rendered`#143`linking to`https://github.com/<slug>/pull/<n>` (`target=\"_blank\"`, `rel=\"noreferrer\"`). No field when `pr_number`is null.\n- Realtime:`applyRunChange`reducers and fixtures pick up the new field (tests updated).\n\n## Docs and tests\n\n-`app_docs/types.md`, `app_docs/project-page.md`.\n- e2e: a History card for a run with a PR shows `PR #<n>`linking to the pull request.\n\n## Acceptance\n\n- Runs that have`pr_number`show a working PR link; older runs show no PR field.\n-`yarn lint`, `yarn typecheck`, `yarn knip`, `yarn test` pass.\n"}`

## Feature Description

Every completed ADW run ends in a pull request, and the toolkit now publishes its number on
`adw.runs.pr_number` (SBub/adw-toolkit#92, closed 2026-10-08). The dependency is satisfied: a
read-only query with the publishable key against the hosted project returns the column, populated
for recent runs (`a6b99270` has `pr_number: 157`, `7a7f315b` has `154`) and null for older ones.
The History card on `/projects/<owner>/<repo>` shows Branch, Finished, Duration and Cost but no way
to reach the run's pull request. This feature adds a `PR` field between Duration and Cost whose
value is `#<n>`, a link to `https://github.com/<owner>/<repo>/pull/<n>` opening in a new tab. A run
with no `pr_number` (published before the toolkit wrote it, or a run that opened none) shows no PR
field at all.

## User Story

As a person reviewing a project's finished ADW runs
I want each History card to link the pull request the run produced
So that I can open the actual change in one click instead of searching GitHub for the branch

## Problem Statement

The run's change lives in a pull request, but the dashboard only links the issue and the branch's
tree (and a merged branch is often deleted, so that tree link may 404). There is no direct path from
a History card to the reviewed, merged change.

## Solution Statement

- **Type and select.** `Run` gains `pr_number: number | null` (after `branch_name`, grouped with the
  other GitHub references), mirroring the new column. `RUN_COLUMNS` in `src/data/index.ts` gains
  `pr_number` in the same place, so the select stays exactly `Run`'s fields and the boundary casts
  stay sound. Both the Active read and History read use `RUN_COLUMNS`, so both pick it up; History's
  `getCompletedRuns` signature and its `"use cache"` scope are untouched.
- **Link helper.** A pure `pullRequestHref(projectSlug: string, prNumber: number): string` in
  `src/lib/run-view.ts` next to `branchTreeHref`, returning
  `https://github.com/<projectSlug>/pull/<n>`, unit-tested. A component calls a pure helper on the
  row's own fields, as the screens-and-components rules allow; no view model.
- **UI.** `RunRow`'s `history` variant renders, after Duration and before Cost,
  `{run.pr_number !== null && <Field label="PR"><a href={pullRequestHref(projectSlug, run.pr_number)} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-neutral-600 dark:hover:text-neutral-300">#{run.pr_number}</a></Field>}`
  (the same link styling as the issue number in the card's top line). The `lg` grid template gains
  one `auto` column (`lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]`) so Branch, Finished,
  Duration, PR and Cost sit on one row at desktop; at `sm` the 4-column grid keeps Branch over two
  columns with Finished and Duration, and wraps PR and Cost to a second row; at 375px every field
  stacks. The Active variant is unchanged (no PR field: an active run usually has no PR yet).
- **Realtime.** `applyRunChange` and `applyRunChangeToSummaries` carry the event's full row
  (`ev.new`), so a `pr_number` arriving on an UPDATE is kept with no reducer logic change. Every
  `Run` fixture gains `pr_number` (otherwise `yarn typecheck` fails), and one reducer test proves an
  UPDATE that sets `pr_number` on a live run replaces the cached row with the new value.
- History stays out of the query cache: no new query key, no new read, no new tag. A run that gets
  its `pr_number` in the same write that completes it is refreshed by the existing `history:<slug>`
  tag drop.

## Relevant Files

Use these files to implement the feature:

- `AGENTS.md` - repository rules (no em-dashes, Yarn only, one doc per feature, lefthook, Conventional Commits).
- `.adw/project.md` - ADW profile: commands, the one test layer (`src/**/*.test.ts`), E2E code suite `none`, `e2e/*.md` journeys, review paths. No profile change needed (no script, port, env file or doc location changes).
- `docs/conditional-docs.md` - index; lines for `types.md`, `data-boundary.md`, `screens-and-components.md`, `project-page.md` and `realtime.md` match this task. No new doc, so no new line.
- `app_docs/types.md` - rules for `src/types/adw.ts` (row types mirror the schema column for column); document `pr_number`.
- `app_docs/data-boundary.md` - the `RUN_COLUMNS` SQL listing (around line 80) must gain `pr_number`.
- `app_docs/project-page.md` - History section's card description (around lines 160-176) and the Overview sentence; add PR and the five-column `lg` grid; add this spec to its Specifications list.
- `app_docs/screens-and-components.md` - History card's fields (line ~40) and the pure helpers `RunRow` calls (lines ~55-67); add the PR field and `pullRequestHref`.
- `app_docs/realtime.md` - read to confirm the reducers carry whole rows; update only if it enumerates `Run` columns (it does not today).
- `src/types/adw.ts` - add `pr_number: number | null` to `Run`.
- `src/data/index.ts` - add `pr_number` to `RUN_COLUMNS`.
- `src/lib/run-view.ts` - add `pullRequestHref`.
- `src/lib/run-view.test.ts` - test `pullRequestHref`.
- `src/components/RunRow.tsx` - render the PR field in the history variant; widen the `lg` grid; update the doc comment.
- `src/components/RunRow.test.ts` - existing render tests (`renderToStaticMarkup`); add PR field tests and `pr_number` to the fixture.
- `src/data/apply-run-change.ts` - read only: reducers already pass `ev.new` whole.
- `src/data/apply-run-change.test.ts` - fixture gains `pr_number`; add the UPDATE-sets-PR test.
- `src/data/hydration.test.ts`, `src/lib/history-bookmark.test.ts`, `src/lib/active-runs.test.ts` - `Run` fixtures gain `pr_number` so typecheck passes.
- `e2e/test_history_card_fields.md` - existing journey asserting the History card's `dt`s are exactly Branch, Finished, Duration, optionally Cost; it would fail once PR appears and must be extended to check the PR link.

### New Files

None besides this plan.

## Implementation Plan

### Phase 1: Foundation

Add `pr_number` to `Run` and to `RUN_COLUMNS`, then add it to every `Run` fixture so the tree
typechecks. Add the pure `pullRequestHref` helper with tests.

### Phase 2: Core Implementation

Render the PR field in `RunRow`'s History variant, between Duration and Cost, and widen the `lg`
grid to five columns. Add render tests.

### Phase 3: Integration

Add the reducer test proving a live `pr_number` update lands in the Active cache, extend the History
journey, and update the feature docs.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add `pr_number` to `Run` and the runs select

- In `src/types/adw.ts`, in `Run`, add `pr_number: number | null;` directly after
  `branch_name: string | null;`.
- In `src/data/index.ts`, change `RUN_COLUMNS` to
  `"project_id, adw_id, issue_number, issue_title, issue_class, branch_name, pr_number, phase, status, state, toolkit_version, started_at, updated_at, finished_at"`.
- Add `pr_number` to every `Run` literal and fixture builder:
  `src/components/RunRow.test.ts` (`completed`: `pr_number: null` for now, step 3 sets it),
  `src/data/apply-run-change.test.ts` (`run()`: `pr_number: null`),
  `src/data/hydration.test.ts` (`started`: `pr_number: null`),
  `src/lib/history-bookmark.test.ts` (`run()`: `pr_number: null`),
  `src/lib/active-runs.test.ts` (its `Run` builder: `pr_number: null`). Run `yarn typecheck` and
  fix any other `Run` literal it reports.

### 2. Add `pullRequestHref`

- In `src/lib/run-view.ts`, after `branchTreeHref`, add:
  ```ts
  /** The GitHub URL of pull request `prNumber` in "owner/repo". */
  export function pullRequestHref(projectSlug: string, prNumber: number): string {
    return `https://github.com/${projectSlug}/pull/${prNumber}`;
  }
  ```
- In `src/lib/run-view.test.ts`, import it and add a `describe("pullRequestHref")` with
  `pullRequestHref("SBub/adw-dashboard", 143)` equal to
  `"https://github.com/SBub/adw-dashboard/pull/143"`.

### 3. Render the PR field on the History card

- In `src/components/RunRow.tsx`, import `pullRequestHref` from `@/lib/run-view`.
- In the `history` `dl`, between the Duration and Cost fields, add:
  ```tsx
  {
    run.pr_number !== null && (
      <Field label="PR">
        <a
          href={pullRequestHref(projectSlug, run.pr_number)}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          #{run.pr_number}
        </a>
      </Field>
    );
  }
  ```
- Change the history `dl`'s `lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]` to
  `lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]` (Branch flexible, then Finished, Duration, PR,
  Cost at content width). Keep `sm:grid-cols-4` and Branch's `sm:col-span-2 lg:col-span-1`.
- Update the component's doc comment: `pullRequestHref` for the PR link, and the History card shows
  Branch, Finished, Duration, PR (only with a `pr_number`) and Cost.
- In `src/components/RunRow.test.ts`, set `completed.pr_number` to `143` and add, under
  `describe("RunRow, history")`:
  - "links the pull request after Duration and before Cost": render with `cost: 4.29`; the
    `>PR</dt>` index is greater than `>Duration</dt>` and less than `>Cost</dt>`; the html contains
    `href="https://github.com/SBub/adw-dashboard/pull/143"`; the `<a` tag around `/pull/` contains
    `target="_blank"` and `rel="noreferrer"`; its text is `#143` (`>#143</a>` or `>#<!-- -->143</a>`
    depending on React's text splitting: assert with a regex `/>#(<!-- -->)?143<\/a>/`).
  - "shows no PR field without a pr_number": render `{ ...completed, pr_number: null }`; html has no
    `>PR</dt>` and no `/pull/`.
  - Adjust the render helper to accept an optional `cost` if it does not already.
- Under `describe("RunRow, active")`, assert the active row has no `>PR</dt>` (the fixture there has
  `pr_number: 143` inherited, proving the field is History only).

### 4. Prove a live `pr_number` update reaches the Active cache

- In `src/data/apply-run-change.test.ts`, under the UPDATE cases, add "keeps a pr_number set on a
  live run": current `active([run("aaaa")])`, apply `update(run("aaaa", { pr_number: 160 }))`, expect
  `next.active[0].pr_number` to be `160` and the list length unchanged. (The reducers need no code
  change: they store `ev.new` whole.)

### 5. Extend the History journey

- In `e2e/test_history_card_fields.md`:
  - The intro and Success Criteria: the History card shows Branch, Finished, Duration, then PR (when
    the run has a pull request) and Cost (when it published metrics).
  - Step 5: also return the `href`, `target`, `rel` and text of the `a` in the `dd` after a `PR`
    `dt`, or null when there is no `PR` `dt`; include the PR `dd`'s top in the measured tops.
  - Step 6: the `dt` texts are exactly `Branch`, `Finished`, `Duration`, optionally `PR`, optionally
    `Cost`, in that order. When `PR` is present, **verify** the link text matches `/^#\d+$/`, its
    `href` is `https://github.com/<owner>/<repo>/pull/<n>` with `<n>` the number in the text,
    `target` is `_blank` and `rel` is `noreferrer`. If the first card has no `PR`, page through
    History with the right arrow until one does and verify it, then return to the first page; or
    note in the result that no run in this project has a pull request. The one-row check at 1280px
    includes the PR `dd`; the stacking check at 375px includes it too.

### 6. Update the feature docs

- `app_docs/types.md`: in "How it works", say `Run` mirrors `adw.runs` including `pr_number`, the
  number of the pull request the run opened (published by the toolkit; null for runs published
  before it wrote the column and for runs that opened none). Rules unchanged.
- `app_docs/data-boundary.md`: add `pr_number` after `branch_name` in the SQL column listing.
- `app_docs/project-page.md`: add this spec to Specifications; in the History card description,
  fields become Branch, Finished, Duration, PR (only when the run has a `pr_number`: `#<n>` linking
  to `https://github.com/<slug>/pull/<n>` in a new tab) and Cost; the `lg` grid gives Branch the
  flexible width and the other four their content width; at `sm` PR and Cost wrap to a second row.
- `app_docs/screens-and-components.md`: add this spec to its Specifications list if it has one; the
  History card's field list (line ~40) gains PR; the helpers `RunRow` calls gain
  `pullRequestHref(projectSlug, run.pr_number)`.
- No em-dashes anywhere.

### 7. Run the validation commands

- Run every command in `Validation Commands` below and fix anything that fails, without weakening a
  rule, a type or a test.

## Testing Strategy

### Unit Tests

- `src/lib/run-view.test.ts`: `pullRequestHref` builds the `/pull/<n>` URL.
- `src/components/RunRow.test.ts`: the History card renders the PR field between Duration and Cost
  with the right `href`, `target`, `rel` and `#<n>` text; no PR field when `pr_number` is null; the
  Active row never shows it.
- `src/data/apply-run-change.test.ts`: an UPDATE carrying a new `pr_number` replaces the cached live
  row with it.

### Test Coverage

- `src/components/RunRow.test.ts` (vitest, `src/**/*.test.ts`): "links the pull request after
  Duration and before Cost" catches a missing, misplaced or wrongly linked PR field; fails today
  because no PR field exists.
- `src/components/RunRow.test.ts`: "shows no PR field without a pr_number" catches an older run
  rendering a `#null` link or an empty field.
- `src/lib/run-view.test.ts`: `pullRequestHref` catches a wrong URL shape (`/pulls/`, missing
  slug); fails today because the helper does not exist.
- `src/data/apply-run-change.test.ts`: "keeps a pr_number set on a live run" pins that the reducer
  keeps the new column from the event (would fail if a reducer ever rebuilt the row from a fixed
  field list).
- Browser coverage: the profile's E2E code suite is `none`; the extended `e2e/test_history_card_fields.md`
  journey (an opt-in acceptance gate, listed in step 5, not a regression layer) checks the live
  link on a real History card, and the review phase screenshots
  `/projects/SBub/issebya-homes-ai-system` (or the first project the sidebar lists) at 1920x1080 and
  375x667: the History cards with a pull request show `PR #<n>` between Duration and Cost on one row
  at desktop and stacked on mobile.

### Edge Cases

- `pr_number` null (older runs): no PR field, no `#null`, the remaining fields keep their layout.
- A run with a PR but no metrics: PR shown, no Cost; one-row layout at `lg` with an empty trailing
  grid track.
- A run with metrics but no PR: Cost directly after Duration, as today.
- Large PR numbers (`#12345`): the field is content-width at `lg`; still one row at 1280px.
- A live run that gets `pr_number` before completing: kept in the Active cache by the reducer, but
  not shown (Active has no PR field).
- Active row: never a PR field, even with a `pr_number`.

## Acceptance Criteria

- `Run` has `pr_number: number | null` and `RUN_COLUMNS` lists exactly `Run`'s fields.
- A History card for a run with `pr_number` shows a `PR` field after Duration and before Cost whose
  value is `#<n>` linking to `https://github.com/<owner>/<repo>/pull/<n>` with `target="_blank"` and
  `rel="noreferrer"`.
- A run without `pr_number` shows no PR field.
- At 1280px the History fields sit on one row; at 375px they stack with no horizontal overflow.
- The Active row is unchanged.
- `app_docs/types.md`, `app_docs/data-boundary.md`, `app_docs/project-page.md` and
  `app_docs/screens-and-components.md` describe the field; `e2e/test_history_card_fields.md` checks it.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test` and `yarn build` pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint` - ESLint over the changed component, helper and tests.
- `yarn typecheck` - proves every `Run` literal and the boundary cast include `pr_number`.
- `yarn knip` - `pullRequestHref` is used, nothing exported is left unused.
- `yarn format:check` - Prettier on the changed files, including the docs and the journey.
- `yarn test` - the new `pullRequestHref`, `RunRow` and reducer tests plus every existing suite.
- `yarn build` - the production build reads the database with the new `pr_number` select; a 400
  from PostgREST would surface here.

## Notes

- Dependency check done read-only during planning: `adw.runs.pr_number` exists in the hosted
  project and is populated for recent runs (for example `a6b99270` has `157`), so the issue's "do
  not start before" condition is met. Its position in the table is last; `Run` and `RUN_COLUMNS`
  place it after `branch_name` for readability, as `issue_title` already sits out of table order.
- No new dependency.
- No change to `.adw/project.md`: no script, port, env file or doc location changes.
- Commit messages follow the profile: Conventional Commits, no trailers.
- Not done here: a PR link on Active rows (a running run usually has no PR yet) and showing the PR's
  merge state (would need a GitHub read the app does not make).
