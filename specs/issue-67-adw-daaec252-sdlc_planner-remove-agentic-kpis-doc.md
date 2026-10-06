# Chore: remove docs/agentic-kpis.md and its references

## Metadata

issue_number: `67`
adw_id: `daaec252`
issue_json: `{"number":67,"title":"chore: remove docs/agentic-kpis.md and its references","body":"The ADW toolkit stops writing the per-repo KPI markdown (SBub/adw-toolkit#34): `adw.run_metrics`is the single definition of run metrics and the dashboard renders it. Delete`docs/agentic-kpis.md`and every reference to it (README, AGENTS.md,`.adw/project.md`, any docs index or conditional-docs entry). No code change expected. Run after toolkit #34 has merged, otherwise the next run recreates the file.\n"}`

## Chore Description

The ADW toolkit used to write a per-repository KPI table, `docs/agentic-kpis.md`, from its document
phase (`/track_agentic_kpis`) and commit it as "chore: update agentic kpis". Toolkit issue
SBub/adw-toolkit#34 retired that step: `adw.run_metrics` in the database is now the single definition
of run metrics, and this dashboard renders it on `/summary` (through `adw.daily_summary`).

The precondition in the issue is met: the toolkit's history has
`919e07a Merge pull request #39 from SBub/chore/issue-34-adw-6da01e4a-remove-agentic-kpis-use-run-metrics`,
and the toolkit's profile contract (`adws/PROFILE.md`, section 8 `## Documentation`) no longer lists
a KPI table field. So nothing will recreate the file after it is deleted.

This chore deletes the file and every live reference to it. A full search of the tracked tree
(`git grep -niE "agentic-kpis|kpi"` outside `specs/` and `docs/`) finds exactly two references, both
in `.adw/project.md`:

- line 107 (Documentation section): "A change to `specs/`, `docs/agentic-kpis.md`, tests alone or a
  dependency bump needs no documentation."
- line 116 (Documentation section): "- KPI table: `docs/agentic-kpis.md`."

`README.md` and `AGENTS.md` do not mention the file (their `docs/` hits are all
`node_modules/next/dist/docs/...` paths to the installed Next guides, which stay). There is no docs
index and no conditional-docs file in this repository (the profile's Documentation section says
"Index to update: none"). `docs/agentic-kpis.md` is the only file under `docs/`, so the directory
disappears with it. No source, config or test changes.

## Relevant Files

Use these files to resolve the chore:

- `docs/agentic-kpis.md` - The file to delete; the only file under `docs/`.
- `.adw/project.md` - The ADW profile. Its `## Documentation` section names the file twice (the
  "needs no documentation" sentence and the `KPI table:` line). Both go; the nine `##` headings and
  their order must stay untouched (AGENTS.md, Tooling).
- `README.md` - Checked: no reference to the file or to KPIs. Its `/summary` section already
  describes `adw.run_metrics` as the metrics source, so no edit is needed.
- `AGENTS.md` - Checked: no reference to the file. Its `docs/` mentions are paths into
  `node_modules/next/dist/docs/` and stay.
- `.prettierignore`, `knip.json`, `lefthook.yml` - Checked: none mentions `docs/`, so deleting the
  directory changes no tool configuration. Prettier formats `.adw/project.md`, so the rewrapped
  paragraph must pass `yarn format:check`.
- `specs/*.md` - Historical plans (for example
  `specs/issue-63-adw-a6d2347d-sdlc_planner-remove-skills-section.md`) mention
  `docs/agentic-kpis.md`. They are records of past runs, not documentation of the current code; leave
  them unchanged.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Delete the KPI file

- `git rm docs/agentic-kpis.md`. This removes the `docs/` directory too (it holds nothing else);
  do not recreate it or add a placeholder.

### 2. Remove the references from `.adw/project.md`

- In `## Documentation`, the "Feature docs" bullet: change the sentence
  "A change to `specs/`, `docs/agentic-kpis.md`, tests alone or a dependency bump needs no
  documentation." to "A change to `specs/`, tests alone or a dependency bump needs no
  documentation." Rewrap the bullet to the file's existing width (about 100 columns, two-space
  continuation indent) so it reads like the surrounding lines.
- Delete the last bullet of the section, "- KPI table: `docs/agentic-kpis.md`.", entirely. Do not
  replace it with `none`: the toolkit's `adws/PROFILE.md` no longer defines that field.
- Leave every `##` heading, its text and its order exactly as is. Use no em-dashes.

### 3. Confirm nothing else references the file

- `git grep -niE "agentic-kpis|agentic kpi|kpi table" -- . ':!specs'` returns nothing.
- `README.md` and `AGENTS.md` stay unchanged (no hit in either).

### 4. Run the validation commands

- Run every command in `Validation Commands` below, in order, from the worktree root. All must pass.

## Test Coverage

No test needed: the change deletes a generated markdown file and edits two lines of the ADW profile.
No source, behaviour or rendered surface changes, and the profile's only test layer
(`src/**/*.test.ts`, vitest) covers code, not documentation. The `git grep` in task 3 is the check
that no reference is left. No E2E spec or review screenshots either: the profile's E2E is `none` and
no user-visible flow changes.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `test ! -e docs/agentic-kpis.md` - the file is gone.
- `! git grep -niE "agentic-kpis|agentic kpi|kpi table" -- . ':!specs'` - no reference remains outside historical plans.
- `grep -c '^## ' .adw/project.md` - prints `9`; the profile keeps its nine headings.
- `yarn lint` - lint stays clean (run on every commit by lefthook).
- `yarn typecheck` - types unaffected (run on every commit by lefthook).
- `yarn knip` - no dead-code finding from the deleted directory (run on every commit by lefthook).
- `yarn format:check` - the rewrapped profile paragraph passes Prettier.
- `yarn test` - unit suite still green (run on every push by lefthook).
- `yarn build` - the app still builds; needs `.env.local` copied by the install step.

## Notes

- Precondition verified at planning time: SBub/adw-toolkit#34 merged (toolkit commit `919e07a`, PR
  #39), and `adws/PROFILE.md` no longer mentions a KPI table. If a later run ever recreates
  `docs/agentic-kpis.md`, the toolkit checkout used for that run is older than that merge.
- Commit message: `chore: remove docs/agentic-kpis.md and its references` (bare type, no scope, no
  trailers, per the profile's Documentation section).
- Never stage `next-env.d.ts` (rewritten by `yarn typecheck`), `.ports.env`, `.env*`, `agents/` or
  `trees/`.
