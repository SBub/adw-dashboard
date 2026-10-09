# Chore: History card: drop the redundant fields, show the full branch

## Metadata

issue_number: `145`
adw_id: `6726a682`
issue_json: `{"number":145,"title":"History card: drop the redundant fields, show the full branch","body":"(see Chore Description)"}`

## Chore Description

A History card (`RunRow`, variant `history`) repeats what the section already says and hides what is
useful. Every History run is completed, so the `completed` status pill says nothing; `Final phase` is
always the same value for a completed run; `Started` is derivable from Finished minus Duration.
Meanwhile the branch, the one field used to check a run out locally, is truncated
(`chore/issue-141-adw...`), and the four-column field grid pushes Duration onto a row of its own.

Change the `history` variant of `RunRow` only; the `active` variant (used by `ActiveRunsView` and
`ActiveRunsOverview`) is unchanged in markup and classes.

- Top row: issue link, title, class badge, `adw_id`, as today and as in Active, minus the
  `completed` `StatusBadge` (and minus its right-hand `h-6` wrapper, so the title takes the width).
- Fields: remove `Final phase` and `Started`. Keep `Branch`, `Finished`, `Duration`, in that order.
- Branch:
  - shown in full, never truncated: monospace, wraps with `break-all` instead of `truncate`, and no
    `title` tooltip (the full text is on screen);
  - `select-all` on the `code` element holding the name, so one click selects the whole name and
    nothing else (CSS only: no `"use client"`, no clipboard API, no state);
  - a small external link next to it, `https://github.com/<slug>/tree/<branch>`, `target="_blank"`,
    `rel="noreferrer"`, `aria-label="Open branch <branch> on GitHub"`, outside the `code` element so
    selecting the name never picks up the link glyph. The name itself stays plain text (a merged
    branch may be deleted and the link may 404; the text is the value);
  - a run with `branch_name === null` shows the muted `none` as today and no link.
- Grid: History's `dl` is `grid gap-x-6 gap-y-2 sm:grid-cols-4`; the Branch field spans two columns
  (`sm:col-span-2`), Finished and Duration one each, so all three sit on one row from `sm` (640px)
  up, including 1280px, and stack in one column at 375px. Two later fields (PR and Cost, filed
  separately) flow as two one-column cells onto the next row of the same 4-column grid with no
  layout change. Active's grid stays `sm:grid-cols-2 lg:grid-cols-4`.
- `Field` keeps `truncate` (and its string `title`) for every other field; the branch opts out
  explicitly through a new prop.
- The loading skeleton for history rows (`RunRowSkeleton` in `LoadingSkeletons.tsx`) mirrors the new
  card in the same commit (rule in `app_docs/error-and-loading-boundaries.md`): no pill, three
  fields, the first spanning two columns, same grid classes.

## Relevant Files

Use these files to resolve the chore:

- `src/components/RunRow.tsx`: the card. `Field` (with `truncate`), `Mono`, the top row with
  `StatusBadge`, and the field grid that the `history` variant changes. Its doc comment mentions the
  phase label and must stay true.
- `src/lib/run-view.ts`: pure per-run formatting helpers (`durationLabel`). The branch tree URL
  helper goes here so it is unit-testable and the component only calls a `src/lib/` helper on the
  row's own fields (rule in `app_docs/screens-and-components.md`).
- `src/lib/run-view.test.ts`: unit tests for `run-view.ts`; gets the helper's cases.
- `src/components/LoadingSkeletons.tsx`: `RunRowSkeleton` mirrors `RunRow` per variant (pill,
  field count, grid classes). Its comment ("three fields for an active run and five for a completed
  one") changes.
- `src/components/LoadingSkeletons.test.ts`: pins the field counts (`HISTORY_PAGE_SIZE * 5`,
  `2 * 3 + HISTORY_PAGE_SIZE * 5`); they become `* 3`.
- `src/components/RunHistoryList.tsx`: renders `RunRow` with `variant="history"`; read only, no
  change expected.
- `src/components/StatusBadge.tsx`, `src/components/Timestamp.tsx`: used by `RunRow`; read only.
  `Timestamp` is a plain server component, so `RunRow` renders under `renderToStaticMarkup` in a
  node vitest test (as `LoadingSkeletons.test.ts` already does).
- `src/types/adw.ts`: `Run.branch_name: string | null`; read only.
- `app_docs/screens-and-components.md`: describes History's fields ("final phase, timings,
  duration") and the rule "The detail grid's `Field` keeps its `truncate`"; both change.
- `app_docs/project-page.md`: describes the run row's top row ("and the status pill") and "`RunRow`
  in the `history` variant still shows Finished and Duration"; both change.
- `app_docs/error-and-loading-boundaries.md`: the rule that a skeleton changes in the same commit as
  its component; read, no text change expected.
- `e2e/test_row_full_title_top_align.md`: measures the History row's status pill and checks the
  Branch `dd` still ellipsizes; both stop being true for History.
- `e2e/test_run_row_phase_label.md`: step 6 checks History's `Final phase`; it goes away.
- `e2e/test_projects_skeleton_fallbacks.md`: read to confirm it does not count history pills or
  fields (it does not; no change expected).
- `.adw/project.md`: the Tests section lists every `e2e/*.md` journey; the new journey is added to
  that list (headings untouched).
- `docs/conditional-docs.md`: the index line for `app_docs/screens-and-components.md`; read, and
  extend only if a new situation needs naming (the History card's fields fall under "a row's
  layout"; no change expected).
- `AGENTS.md`, `README.md`: rules only; no change.

### New Files

- `src/components/RunRow.test.ts`: renders `RunRow` with `renderToStaticMarkup` (the pattern of
  `LoadingSkeletons.test.ts`) and pins the History card's fields and the unchanged Active card.
- `e2e/test_history_card_fields.md`: agent-driven acceptance journey for the History card at 1280
  and 375 (one row vs stacked, full branch, `select-all`, link, no pill / Final phase / Started).

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add the branch tree URL helper

- In `src/lib/run-view.ts` add and export
  `branchTreeHref(projectSlug: string, branch: string): string` returning
  `https://github.com/${projectSlug}/tree/${path}` where `path` is `branch.split("/")` with each
  segment passed through `encodeURIComponent`, joined with `/` (slashes stay path separators, so
  `chore/issue-141-adw-ab53aaef-x` gives `.../tree/chore/issue-141-adw-ab53aaef-x`; a `#` or `?` in
  a segment is escaped instead of cutting the URL). Pure, no clock, with a short doc comment in the
  file's style.
- In `src/lib/run-view.test.ts` add a `describe("branchTreeHref")` with: a plain branch, a branch
  with slashes (slashes kept), and a branch containing `#` (escaped as `%23`).

### 2. Change the History variant of `RunRow`

- `Field`: add optional `wrap?: boolean` and `className?: string`. The outer `div` gets
  `min-w-0` plus `className`. When `wrap` is true the `dd` is `mt-0.5 text-sm break-all` with no
  `title`; otherwise it stays exactly `mt-0.5 truncate text-sm` with today's string `title`. Active
  never passes either prop, so its markup is unchanged.
- Add a small `Branch` component (in the file) for the history variant: when `branch_name` is
  `null`, the muted `none` span as `Mono` renders it; otherwise
  `<code className="select-all font-mono text-sm">{branch}</code>` followed by an `<a>` with
  `href={branchTreeHref(projectSlug, branch)}`, `target="_blank"`, `rel="noreferrer"`,
  `aria-label={`Open branch ${branch} on GitHub`}`, a margin-left (`ml-1.5`), muted colours with a
  hover colour matching the issue link's style, holding a `↗` glyph wrapped in
  `<span aria-hidden="true">` (no icon library in this repo; no em-dash anywhere). The `select-all`
  sits on the `code` only, so a click or a triple-click selects exactly the branch name.
- Top row: render the right-hand `<div className="flex h-6 shrink-0 items-center"><StatusBadge .../></div>`
  only when `variant === "active"`.
- Field grid: branch the `dl` on the variant.
  - `active`: exactly today's `dl` (`mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4`) with
    `Phase`, `Branch` (`Mono`), `Started`.
  - `history`: `dl` with `mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-4`, then
    `<Field label="Branch" wrap className="sm:col-span-2"><Branch .../></Field>`, `Finished`
    (Timestamp or muted `none`, as today), `Duration` (rendered when `duration !== null`, as today).
  - Compute `phase` only where it is used (Active) or keep it; no `Final phase` label remains in the
    file.
- Update the `RunRow` doc comment: phaseLabel applies to the Active row's phase; the History card
  shows Branch in full with a tree link built by `branchTreeHref`, Finished and Duration; still no
  clock read.

### 3. Mirror the card in the loading skeleton

- In `src/components/LoadingSkeletons.tsx`, `RunRowSkeleton`:
  - render the pill column (`flex h-6 shrink-0 items-center` with the round `Skeleton`) only for
    `active`;
  - for `history`, the field grid is `mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-4` with three
    `FieldSkeleton`s, the first with `sm:col-span-2` (give `FieldSkeleton` an optional `className`
    and a wider bar for the branch, e.g. `w-56`, so the shape reads as the long field); `active`
    keeps today's grid and three fields.
  - Update the comment above `RunRowSkeleton`: three fields per row for both variants, the history
    row without the pill and with its branch spanning two columns.
- In `src/components/LoadingSkeletons.test.ts`: the history case expects
  `HISTORY_PAGE_SIZE * 3` fields (rename the test to "three fields each"), and `ProjectPageSkeleton`
  expects `2 * 3 + HISTORY_PAGE_SIZE * 3`. Add one assertion that a history `RunListSkeleton` has no
  round pill bar while an active one has one per row (check how `Skeleton`'s `round` prop renders,
  e.g. `rounded-full`, and count that class; the project nav and queue skeletons are not in these
  renders).

### 4. Add the `RunRow` unit test

- Create `src/components/RunRow.test.ts` (a `.ts` file, `createElement`, `renderToStaticMarkup`, as in
  `LoadingSkeletons.test.ts`). Build one `Run` fixture (fields per `src/types/adw.ts`, status
  `completed`, `branch_name: "chore/issue-141-adw-ab53aaef-sticky-header-scroll-content"`, both
  timestamps set) and wrap the row in nothing (it is an `li`; static markup does not need a `ul`).
- History cases:
  - the markup contains `Branch`, `Finished`, `Duration` `dt`s in that order (indexOf), and does not
    contain `Final phase`, `>Started<` or `>Phase<`;
  - it does not contain the `completed` badge text (`>completed<`);
  - the full branch name appears verbatim inside a `code` with `select-all`, and the branch's `dd`
    has `break-all` and no `truncate`;
  - an `<a` with `href="https://github.com/<slug>/tree/chore/issue-141-adw-ab53aaef-sticky-header-scroll-content"`,
    `target="_blank"`, `rel="noreferrer"` and an `aria-label` containing the branch;
  - the branch field's wrapper carries `sm:col-span-2` and the `dl` carries `sm:grid-cols-4`;
  - with `branch_name: null` it shows `none` and no `/tree/` link.
- Active case (unchanged): the same fixture with status `running` and `finished_at: null` renders
  `Phase`, `Branch`, `Started`, the `running` badge, a `truncate` branch `dd`, no `/tree/` link and
  the `sm:grid-cols-2 lg:grid-cols-4` grid.

### 5. Update the feature docs

- `app_docs/screens-and-components.md`:
  - the right pane paragraph: History is for `completed` runs, its card showing the branch in full
    (wrapping, one click selects it, with a small link to the branch on GitHub), Finished and
    Duration, with no status pill, no final phase and no start time; the phase label sentence then
    covers the Active row's phase only (drop "and History's final phase").
  - Rules: `RunRow` calls `durationLabel`, `phaseLabel` and `branchTreeHref` (all from
    `src/lib/run-view.ts` / `run-phase.ts`); replace "The detail grid's `Field` keeps its
    `truncate`" with: the detail grid's `Field` keeps its `truncate`, except History's Branch, which
    opts out (`wrap`): shown in full with `break-all`, `select-all` on the name only, and the GitHub
    tree link beside it, never on the name. History's card has no status pill; do not add one back.
- `app_docs/project-page.md`:
  - the run row paragraph (around "Each run row shows the issue title"): the status pill is on Active
    rows only; History rows end the top row with the `adw_id`.
  - replace "`RunRow` in the `history` variant still shows Finished and Duration" with the History
    card's fields: Branch (full, two columns), Finished, Duration on one row from `sm`, stacked at
    375px, in a 4-column grid that leaves room for two more one-column fields on the next row; no
    `completed` pill, no `Final phase`, no `Started`.
- No em-dashes in any text written.

### 6. Update the existing e2e journeys

- `e2e/test_row_full_title_top_align.md`:
  - intro and step 6/8: the pill measurements apply to Active and Queue rows; for the History row
    measure the `adw_id` `code`'s top instead and verify it is within 2px of the first line's top
    (when it is on the first line at 1920x1080), and verify the History `li` contains no element
    whose text is `completed`.
  - step 9: a `dd` under an Active row's `Branch` label (when an Active row is present) and a `dd`
    under a History row's `Finished` label still have computed `textOverflow` `ellipsis`; a `dd`
    under a History row's `Branch` label has `textOverflow` not `ellipsis` and `whiteSpace` not
    `nowrap`, and its `code` text does not end in `...`.
  - step 11 and Success Criteria: reword accordingly (the History row has no pill; the detail grid
    still truncates except History's branch).
- `e2e/test_run_row_phase_label.md`: step 6 becomes: for every History row verify there is no `dt`
  whose text is `Final phase` (or `Phase`); the label checks stay on Active rows (steps 3 and 7).
  Update intro and Success Criteria (History no longer shows a phase; "at least one History row
  shows a label" is removed).

### 7. Add the History card journey

- Create `e2e/test_history_card_fields.md`, modelled on `e2e/test_row_full_title_top_align.md`
  (same header, User Story, numbered steps with **Verify**, Success Criteria; read-only against the
  hosted database). Steps:
  1. open `/projects`, wait for the `status` element to read `live`, pick the first sidebar project
     whose History has at least one row (if none, note it, take the screenshots and pass);
  2. at 1280x800, for the first History `li` return with `browser_evaluate`: the `dt` texts in order,
     whether any element's text is `completed`, the Branch `dd`'s `code` text and its computed
     `userSelect` (expect `all`), `textOverflow`, `whiteSpace`, `scrollWidth <= clientWidth`, the
     `href`, `target`, `rel` and `aria-label` of the `a` in that `dd`, and the
     `getBoundingClientRect().top` of the Branch, Finished and Duration `dd`s;
  3. **Verify** the `dt`s are exactly `Branch`, `Finished`, `Duration`; no `completed` pill; no
     `Final phase` or `Started`; the branch text does not end in `...`, has no ellipsis and no
     overflow; `userSelect` is `all`; the link is `https://github.com/<owner>/<repo>/tree/<branch>`
     with `_blank`, `noreferrer` and an accessible label; the three tops are within 2px of each other
     (one row);
  4. click once on the branch `code` (`browser_click`) and **verify** with `browser_evaluate` that
     `window.getSelection().toString()` equals the branch name exactly; clear the selection, then
     triple-click the same `code` with `browser_run_code_unsafe` (`locator.click({ clickCount: 3 })`)
     and verify the selection again equals the branch name exactly (no link glyph, no label text);
  5. set a 120-character branch name on that `code` via `textContent` (DOM only) and verify no
     horizontal overflow of the `li`;
  6. **Verify** the first Active row, when present, still has `Phase`, `Branch`, `Started` and its
     status pill;
  7. screenshot at 1280x800; resize to 375x667, re-measure: the three `dd` tops strictly increase
     (stacked), the long branch wraps (more than one line box) with no overflow; screenshot.
- Add `e2e/test_history_card_fields.md` to the journey list in `.adw/project.md`'s Tests section
  (text only, keep the nine headings and their order).

### 8. Validate

- Run every command under `Validation Commands`, fix anything they report (never by weakening a
  rule, type or test), and confirm the served HTML of the project page still contains run rows
  (the build prerender/`yarn build` succeeding and the review phase's screenshots are the evidence;
  do not start a dev server outside the review phase's port rules).

## Test Coverage

- `src/components/RunRow.test.ts` (unit, vitest `src/**/*.test.ts`, server-rendered markup): pins
  that a History card has no `completed` pill, no `Final phase`, no `Started`, shows Branch,
  Finished, Duration in order, renders the full branch in a `select-all` `code` inside a
  non-truncating `break-all` `dd` with the GitHub tree link beside it and a two-column span, and that
  the Active card is unchanged. Nothing catches any of this today; every History assertion fails
  against the current `RunRow`.
- `src/lib/run-view.test.ts` (unit): `branchTreeHref` keeps slashes as path separators and escapes
  `#`; fails without the helper.
- `src/components/LoadingSkeletons.test.ts` (unit, existing, updated): the history skeleton has
  three fields and no pill, so the skeleton cannot drift from the card; fails against the current
  five-field skeleton.
- The 1280 one-row / 375 stacked layout and the click-to-select behaviour need a real browser; the
  project has no component or Playwright layer, so they are covered by the agent-driven journey
  `e2e/test_history_card_fields.md` (Task 7) and the review phase's screenshots, not by a test here.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint` - ESLint over the changed components, helper and tests.
- `yarn typecheck` - `next typegen` then `tsc --noEmit`: the new `Field` props, `Branch` and the
  helper type-check (do not stage the rewritten `next-env.d.ts`).
- `yarn knip` - `branchTreeHref` is exported and used; no unused exports or files left behind.
- `yarn format:check` - Prettier on every touched file, Markdown included.
- `yarn test` - the new `RunRow.test.ts`, the `branchTreeHref` cases and the updated skeleton counts.
- `yarn build` - the production build prerenders the project page (it reads `.env.local`), proving
  the served HTML still has run rows and no server/client boundary changed.

## Notes

- Active is unchanged: `ActiveRunsView` and `ActiveRunsOverview` pass `variant="active"`; their
  markup, grid and `Field` truncation must be byte-identical in effect. The `RunRow.test.ts` Active
  case guards this.
- Keep `RunRow` a server component: `select-all` is the Tailwind `user-select: all` utility; no
  `"use client"`, no clipboard API, no `onClick`.
- Why not put the link on the name: a merged branch is often deleted, so the tree URL may 404; the
  name is the value to copy, the link is a convenience.
- Why `sm:grid-cols-4` for History rather than `lg:grid-cols-6`: at 1280px with the sidebar the pane
  is narrow enough that a sixth of it would truncate `DD.MM.YYYY HH:MM UTC` in Finished. Four
  columns give Finished and Duration a quarter each; PR and Cost later add two one-column cells on
  the next row with no class change. The implementer should check in the review screenshots that
  Finished is not ellipsized at 1280px; if it is at `sm` (640 to 767px, no sidebar yet) that is
  acceptable, but not at 1280.
- `history-search.ts` still searches `branch_name`; nothing there changes.
- Commit with `chore: ...`, no trailers (profile Documentation section).
