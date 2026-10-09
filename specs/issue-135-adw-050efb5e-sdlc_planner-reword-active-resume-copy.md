# Chore: Active headings: stop mentioning resume until the UI ships it

## Metadata

issue_number: `135`
adw_id: `050efb5e`
issue_json: `{"number":135,"title":"Active headings: stop mentioning resume until the UI ships it"}`

## Chore Description

Both Active section headings (on `/projects` and on a project page) tell the reader that a failed
run "can be resumed", but the dashboard has no resume control anywhere; resume exists only as the
toolkit CLI (`adws/adw_resume.py`). The reader looks for a button that is not there.

Reword the user-facing copy of the two `SectionHeading` instances so neither the `description` nor
the `detail` mentions resuming. Failed runs still belong in Active; behaviour is unchanged, only the
explanation changes. Also reword the matching phrase in the agent-driven journey
`e2e/test_active_runs_shared_entry.md` (line 3).

Target copy (from the issue's suggested direction):

- `/projects` description: `Runs in progress, and runs that failed and are not resolved yet, across every project. Each row updates live as phases complete.`
- Project page description: `Runs in progress, and runs that failed and are not resolved yet. Each run plans, builds, tests, reviews and documents a change, then opens a pull request. The row updates live as phases complete.`
- Both details: `A failed run keeps its branch and stays here, not in history, until it is run again.`
- Journey line 3: `(running, and failed that are not resolved yet)` in place of `(running, and failed that can be resumed)`.

Out of scope (per the issue): `applyRunChange`, the "Active means running or failed" rule, code
comments and `app_docs/` text that explain why failed runs are live (the toolkit can resume them
from the CLI; they describe the system, not the UI), and the Next.js "Resume Data Cache" / "resumed
render" comments.

## Relevant Files

Use these files to resolve the chore:

- `src/app/(dashboard)/projects/page.tsx` - lines 36 and 37 hold the `/projects` Active heading's
  `description` and `detail` strings to reword.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx` - lines 324 and 325 hold the project page
  Active heading's `description` and `detail` strings to reword. Line 174 has a Next.js "resumed
  render" comment that stays untouched (it is not user-visible).
- `e2e/test_active_runs_shared_entry.md` - line 3 says "failed that can be resumed"; reword to match.
- `app_docs/screens-and-components.md` - read because the change touches a section heading (its
  conditional-docs line). Its "a failed run can be resumed, so it is still live" explains the
  system, not UI copy, and does not quote the heading strings: no edit.
- `app_docs/active-runs.md` and `app_docs/project-page.md` - read because the change touches the
  Active section's heading. Their resume mentions describe the toolkit's CLI behaviour and stay, per
  the issue's Out of scope. Neither quotes the heading copy: no edit.
- `.adw/project.md` - profile; no script, port, env file or doc location changes, so no edit.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Reword the `/projects` Active heading

- In `src/app/(dashboard)/projects/page.tsx`, set the `SectionHeading` `description` to
  `Runs in progress, and runs that failed and are not resolved yet, across every project. Each row updates live as phases complete.`
- Set its `detail` to
  `A failed run keeps its branch and stays here, not in history, until it is run again.`

### 2. Reword the project page Active heading

- In `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`, inside `activeHeading`, set
  `description` to
  `Runs in progress, and runs that failed and are not resolved yet. Each run plans, builds, tests, reviews and documents a change, then opens a pull request. The row updates live as phases complete.`
- Set `detail` to
  `A failed run keeps its branch and stays here, not in history, until it is run again.`
- Leave the comment at line 174 ("a resumed render ...") as is.

### 3. Reword the journey

- In `e2e/test_active_runs_shared_entry.md` line 3, replace `failed that can be resumed` with
  `failed that are not resolved yet`, keeping the line wrap Prettier accepts (run `yarn format` if
  the reflow changes).

### 4. Confirm no user-visible resume string remains

- Run `grep -rn "resum" "src/app/(dashboard)"`: the only hit must be the comment at
  `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx:174` (Next.js resumed render), no string
  literal or JSX text.
- Run `grep -n "resum" e2e/test_active_runs_shared_entry.md`: no hit.
- Check the new copy contains no em-dash.

### 5. Run the Validation Commands

## Test Coverage

No test needed: the change is static copy in two server-component JSX props and one journey
markdown line. The project's only test layer is `src/**/*.test.ts` (pure reducers and helpers);
there is no component test layer and no Playwright suite, so no test could render these strings
without inventing a layer. Evidence is the diff, the grep in step 4 and the review phase's
screenshots of `/projects` and `/projects/SBub/issebya-homes-ai-system` (desktop 1920x1080 and
mobile 375x667), where the Active heading's description and its detail should show the new text.
The existing journey `e2e/test_active_runs_shared_entry.md` does not assert heading copy, so it
needs no new step beyond the line 3 rewording.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `grep -rn "resum" "src/app/(dashboard)"` - only the Next.js resumed-render comment on the project page remains.
- `yarn lint` - lint passes on the edited TSX files.
- `yarn typecheck` - types still hold (do not stage the rewritten `next-env.d.ts`).
- `yarn knip` - no dead code introduced.
- `yarn format:check` - the edited TSX and markdown are Prettier-clean.
- `yarn test` - unit suite unchanged and green.
- `yarn build` - both pages still prerender and build.

## Notes

- No documentation update: `app_docs/` does not quote the heading strings, and its resume
  mentions describe the toolkit, which the issue keeps out of scope. No `docs/conditional-docs.md`
  change.
- Commit as `chore: ...` with no trailers (profile Documentation section).
- Do not start the dev server outside the review phase; obey `.ports.env` for the port.
