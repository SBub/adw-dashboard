# Feature: Show the issue title on run rows

## Metadata

issue_number: `25`
adw_id: `3fc84733`
issue_json: `{"number":25,"title":"Show the issue title on run rows","body":"Run rows show the issue number and the branch. The toolkit will publish issue_title on adw.runs ... (see GitHub issue #25)"}`

## Feature Description

Every run row (Active and History) currently identifies its issue only by number (`#25`, linked to GitHub) and by branch name. The ADW toolkit now publishes the issue title with each run in a new nullable column, `adw.runs.issue_title`. This feature reads that column at the data boundary and renders the title right after the issue number link in `RunRow`. It is plain text, on one line, and truncated with an ellipsis. Runs published before the toolkit change have `issue_title = null` and render exactly as today.

Precondition check (done during planning, read-only, with the publishable key): `GET /rest/v1/runs?select=adw_id,issue_number,issue_title` against the `adw` schema succeeds. The column exists, run `3fc84733` carries `"Show the issue title on run rows"`, and older runs (`3fc979d5`, `aff97d4f`) carry `null`. The migration is applied, so work can start.

## User Story

As a developer watching ADW runs on the dashboard
I want to see the issue title next to the issue number on each run
So that I know what a run is working on without opening GitHub or decoding the branch name

## Problem Statement

`#25` and a branch slug like `feat/issue-25-adw-3fc84733-show-issue-title-run-rows` do not say much about a run. To find out what it is doing, the reader has to follow the link to GitHub. The title is now stored with the run, but the dashboard does not select it, the `Run` type does not include it, and `RunRow` does not render it.

## Solution Statement

Add the column end to end, following the existing rules:

1. `src/types/adw.ts`: add `issue_title: string | null` to `Run`, directly after `issue_number`. Row types mirror the schema column for column.
2. `src/data/index.ts`: add `issue_title` to `RUN_COLUMNS`, directly after `issue_number`. The select must stay equal to the fields of `Run`. Both `getActiveRuns` and `getCompletedRuns` use that constant, so both halves return the column. The `as Run[]` cast at the boundary stays the one assertion.
3. `src/components/RunRow.tsx`: right after the issue number link (or the "no issue" span), render `run.issue_title` when it is non-null. Use a `<span>` with `min-w-0 truncate` (one line, ellipsis) and a `title` attribute carrying the full text, so the cut-off part can be read on hover. There is no branching on `variant`: the header block is shared, so Active and History both get it. The component only renders a field of the row, which the Architecture rules allow. There is no view model, no helper and no clock.
4. Realtime: no reducer change. `applyRunChange` stores `ev.new` as the whole row, so the title comes through. One test pins this.
5. README: one sentence in "Runs: active and history". Also update the column list in the SQL block of "Data: projects and runs from the database", which spells out the `RUN_COLUMNS` select and would otherwise be wrong.

Layout detail: the header's left cluster is `flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2`. A plain `truncate` child in a wrapping flex row can grow to its full text width and push everything after it onto the next line without ever truncating. To get a real one-line ellipsis, the title span needs `min-w-0` plus a basis that lets it shrink: `min-w-0 flex-1 basis-0` or `min-w-0 max-w-full truncate`. Pick the one that keeps the issue class badge, the `adw_id` and (in Active) the "Updated" timestamp on the same line at desktop width. Check this in review at 1920x1080 and 375x667. On mobile the cluster may wrap, but the title must still be a single line that ends in an ellipsis, never a multi-line block. Keep the status badge on the right edge, as moved by issue #26.

## Relevant Files

Use these files to implement the feature:

- `AGENTS.md`: rules this change must respect. `RUN_COLUMNS` must equal the `Run` fields. Casts happen only in `src/data/index.ts`. Components render rows as stored, with no view model. Reducers stay pure and every new case gets a test. No em-dashes.
- `.adw/project.md`: the profile. Tests are only `src/**/*.test.ts`, there is no E2E, and the review screenshots `/projects/SBub/issebya-homes-ai-system` at 1920x1080 and 375x667.
- `README.md`: the "Data: projects and runs from the database" SQL block (the column list) and the "Runs: active and history" section (the new sentence).
- `src/types/adw.ts`: the `Run` row type, which gains `issue_title: string | null`.
- `src/data/index.ts`: `RUN_COLUMNS`, the select shared by `getActiveRuns` and `getCompletedRuns`.
- `src/components/RunRow.tsx`: renders the title after the issue number link, in both variants.
- `src/data/apply-run-change.ts`: read only, to confirm that `applyRunChange` copies `ev.new` whole. No change.
- `src/data/apply-run-change.test.ts`: the `run()` fixture gains `issue_title: null` (the type requires it), plus a new UPDATE case.
- `src/lib/history-bookmark.test.ts`: its `Run` fixture gains `issue_title: null`, or `yarn typecheck` fails.

### New Files

None.

## Implementation Plan

### Phase 1: Foundation

Add the field to the type and the column to the select together, so the boundary cast stays honest. Then fix the two test fixtures that build full `Run` objects, so typecheck passes again.

### Phase 2: Core Implementation

Render the title in `RunRow` after the issue number, null-guarded, on one truncated line, with the full text in `title`.

### Phase 3: Integration

Pin the realtime pass-through with a reducer test. Update the README. Run the full validation suite, including `yarn build`, which reads the live `adw.runs` with the new column at build time. That build is the real proof that the select works against the migrated schema.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add `issue_title` to the `Run` type

- In `src/types/adw.ts`, add `issue_title: string | null;` directly after `issue_number: number | null;` in `interface Run`.

### 2. Add `issue_title` to `RUN_COLUMNS`

- In `src/data/index.ts`, change the constant to
  `"project_id, adw_id, issue_number, issue_title, issue_class, branch_name, phase, status, state, toolkit_version, started_at, updated_at, finished_at"`.
- Change nothing else in the file. The cast, the signatures and the queries stay as they are.

### 3. Fix the `Run` fixtures

- `src/data/apply-run-change.test.ts`: in `run()`, add `issue_title: null,` after `issue_number: 1,`. Keep the default `null` so the existing cases still describe pre-toolkit rows.
- `src/lib/history-bookmark.test.ts`: in its `Run` fixture, add `issue_title: null,` after `issue_number: 1,`.

### 4. Add the reducer test

- In `src/data/apply-run-change.test.ts`, inside `describe("applyRunChange") > describe("UPDATE")`, add:
  `it("keeps the issue title of an updated run", ...)`. Start from `active([run("aaaa", { issue_title: "Show the issue title on run rows" }), run("bbbb")])`. Apply `update(run("aaaa", { issue_title: "Show the issue title on run rows", phase: "adw_test_iso", updated_at: "2026-10-02T10:45:00Z" }))`. Assert `next.active[0]` matches `{ issue_title: "Show the issue title on run rows", phase: "adw_test_iso" }`, and that `next.active[1]?.issue_title` is `null`.
- Do not change `src/data/apply-run-change.ts`.

### 5. Render the title in `RunRow`

- In `src/components/RunRow.tsx`, directly after the issue number `<a>` / "no issue" ternary and before `<IssueClassBadge>`, add:
  `{run.issue_title !== null && (<span className="min-w-0 ... truncate text-sm" title={run.issue_title}>{run.issue_title}</span>)}`
  using the shrink classes from the Solution Statement. The text colour is the row's default foreground (it is content, not metadata). It is not a link.
- Add one line to the component's doc comment saying that the issue title is a column shown as stored and is absent for runs published before the toolkit started writing it.
- Do not touch `variant` handling, `Field`, `Mono` or the status badge position.

### 6. README

- "Data: projects and runs from the database": add `issue_title` after `issue_number` in the SQL `select` column list.
- "Runs: active and history": add one sentence, for example: "Each run row shows the issue title (`adw.runs.issue_title`, published by the toolkit) after the issue number, on one line truncated with an ellipsis; runs published before the toolkit wrote it have no title and show the number alone."
- No em-dashes.

### 7. Browser evidence for the review phase (no E2E suite; profile E2E is `none`)

- The reviewer opens `http://localhost:$PORT/projects/SBub/issebya-homes-ai-system` (or the first project the sidebar lists) and waits for the indicator to show `live`. The reviewer captures full-page screenshots at desktop 1920x1080 and mobile 375x667.
- What the finished feature shows: a run published after the toolkit change (for example `3fc84733`, if it is listed under that project) shows `#<n>` followed by its title on the same line. A long title ends in an ellipsis and does not wrap onto a second line. Older runs (title `null`) show `#<n>` with nothing after it, as before. This holds in both the Active section and the History section. The status badge stays on the right edge. At 375x667 the title is still one line with an ellipsis.

### 8. Run the validation commands

- Run every command in `Validation Commands` below. All must pass.

## Testing Strategy

### Unit Tests

- `src/data/apply-run-change.test.ts`: a new UPDATE case checks that a row's `issue_title` survives `applyRunChange` and that a null title stays null.
- The existing fixtures gain `issue_title: null`, so every current case keeps describing an untitled (pre-toolkit) row.

### Test Coverage

- `src/data/apply-run-change.test.ts` > `applyRunChange` > `UPDATE` > "keeps the issue title of an updated run" (unit layer, `src/**/*.test.ts`, the profile's only layer). It catches a reducer that rebuilds the row field by field, or merges onto the cached row in a way that drops or resets the title. Without the `issue_title` field on `Run` the case does not typecheck, so it fails without this change.
- The rendering in `RunRow` has no test layer: the profile has no component tests and no E2E. Its evidence is the review phase's screenshots (task 7). The select change is proven by `yarn build`, which reads `adw.runs` with the new column list and fails if the column were missing.

### Edge Cases

- `issue_title` is `null` (every run before the toolkit change): nothing is rendered, and the row looks exactly as today.
- `issue_number` is `null` but `issue_title` is set: the title follows the "no issue" span. This is unlikely, but the null guards are independent, so it renders without error.
- A very long title: one line, ellipsis, full text in the `title` attribute. The badge, the `adw_id` and the status badge stay visible.
- An empty-string title: `!== null` would render an empty span. That is harmless and does not need a special case. Do not coerce or trim in the component.
- A Realtime INSERT or UPDATE carrying a title: the title is stored with the row (pinned by the test). DELETE reads only `ev.old` primary keys and is unaffected.
- History is rendered on the server from `getCompletedRuns`. It picks up the column through the same `RUN_COLUMNS`, and the cached scope's next regeneration includes it.

## Acceptance Criteria

- `Run` has `issue_title: string | null`, and `RUN_COLUMNS` lists exactly the fields of `Run`, including `issue_title`.
- A run whose `issue_title` is set shows the title next to `#<number>` in both Active and History, as plain text on one line, with an ellipsis when it is too long.
- Runs with `issue_title = null` render as they did before this change.
- `applyRunChange` and the other reducers are unchanged, and the new test passes.
- The README has the sentence in "Runs: active and history" and the updated SQL column list.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test` and `yarn build` all pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint`: ESLint over the changed component and tests.
- `yarn typecheck`: proves that the new `Run` field is satisfied by every fixture and by the boundary cast (`next typegen` rewrites `next-env.d.ts`; never stage it).
- `yarn knip`: no dead exports or files introduced.
- `yarn format:check`: Prettier on the edited files, including README and the spec.
- `yarn test`: the vitest suite, including the new `apply-run-change` case and the unchanged hydration pin.
- `yarn build`: reads `adw.runs` at build time with the new `RUN_COLUMNS` (needs `.env.local`). It fails if the select names a column the schema does not have.

## Notes

- No new dependency.
- The toolkit migration is already live (verified read-only during planning, see Feature Description), so the issue's "do not start before" condition is met.
- Out of scope: fetching titles from GitHub and backfilling old rows. Null titles stay null.
- No `AGENTS.md` change is needed. The existing rule "keep the column list equal to the fields of `Run`" already covers the new column.
- Commit as `feat: show the issue title on run rows`, with no trailers (profile Documentation section).
