# Feature: Release automation: tag each production release, publish a GitHub Release and open the changelog entry draft

## Metadata

issue_number: `248`
adw_id: `35167e14`
issue_json: `{"number":248,"title":"Release automation: tag each production release, publish a GitHub Release and open the changelog entry draft"}`

## Feature Description

A production release is the merge of a `develop` -> `master` promotion pull request (for example #238). Today nothing marks it: there are no git tags, no GitHub Releases, the changelog has no entry for any release after #163, and the PostHog release annotation is named after a short sha and commit title.

This feature adds one GitHub Actions workflow, `.github/workflows/release.yml`, that runs after CI's `check` job passes on a push to `master`. For the production pull request whose merge commit was pushed it:

1. creates the annotated tag `release-<YYYY-MM-DD>-pr<N>` (the changelog entry id prefixed with `release-`) on the merge commit, never moved or overwritten;
2. publishes a GitHub Release for that tag whose notes list the develop pull requests the release carries, grouped Features / Fixes / Chores by the same `groupPullRequests` / `sectionForPrefix` code the changelog backfill uses;
3. opens a pull request into `develop`, `chore: changelog draft for release-<id>`, with the draft entry (or entries) written by `node scripts/backfill-changelog.ts`, formatted, with `PRODUCTION_PRS` in `src/content/changelog/registry.test.ts` updated; the owner rewrites the text before merging, the PR never auto-merges;
4. creates the PostHog annotation `adw-dashboard release-<id>` (folded into this workflow; `release-annotation.yml` is deleted).

A `workflow_dispatch` with a `dry_run` input (and an optional `sha`) prints the tag, the notes and the draft entry diff without creating anything. Every step checks first and reports `already released` when its artefact exists, so a rerun is a no-op.

## User Story

As the owner of the dashboard
I want every production release tagged, published as a GitHub Release and drafted as a changelog entry automatically
So that releases are marked in git, on GitHub and in PostHog, and the changelog never falls behind while I still write every entry's words myself

## Problem Statement

- `git tag` prints nothing and `gh release list` is empty.
- Production PRs #191, #194, #198, #202, #219, #222, #225, #227 and #238 have no changelog entry; `app_docs/changelog.md` says "Until a release script exists, write ... by hand".
- `scripts/backfill-changelog.ts` cannot be rerun at all today: its second loop fails when **any** production PR's `.mdx` already exists, so it is a one-off, not an incremental drafter. Nothing runs it.
- The develop-PR extraction (`git log --first-parent M^2 ^M^1` + the `Merge pull request #N` regex) lives inline in the script, so a release-notes step would need a second parser.
- `.github/workflows/release-annotation.yml` names the annotation `adw-dashboard release <short sha>: <commit title>`.

## Solution Statement

- Move every pure decision into `src/lib/` (unit-tested, no Node APIs, importable by Node's type stripping through a relative `.ts` path, the same pattern as `src/lib/changelog-backfill.ts`):
  - in `src/lib/changelog-backfill.ts`: `shippedPullNumbers(gitLog)` (the single `Merge pull request #N` parser, now shared) and `withProductionPrs(source, prs)` (rewrites the `PRODUCTION_PRS` literal in the registry test);
  - a new `src/lib/release.ts`: `releaseTag`, `releaseNotes`, `productionPrForCommit`, `draftBranch`, `draftPrTitle`, `annotationContent`, and `releaseSteps(state)` which turns the observed GitHub state into the per-step action (`create` or `already released`, or a hard stop when a tag points at another commit).
- Make `scripts/backfill-changelog.ts` incremental: skip a production PR whose entry exists (instead of failing), still never overwrite (`writeFileSync` with `flag: "wx"`), use `shippedPullNumbers`, and rewrite `PRODUCTION_PRS` along with `index.ts`.
- Add `scripts/release.ts`, an offline orchestrator over `gh` and `git` (same style as the backfill script). It resolves the production PR for a merge commit, reads the state, prints each step, and (unless `--dry-run`) acts: pushes the annotated tag, `gh release create --verify-tag`, builds the draft in a temporary `git worktree` off `origin/develop`, commits, pushes `changelog/release-<id>` and `gh pr create`. In dry-run it still builds the draft in the throwaway worktree and prints `git diff`, then removes the worktree, so the diff is real and nothing is created. It writes `tag`, `merged_at` and `tag_created` to `$GITHUB_OUTPUT` when set.
- Add `.github/workflows/release.yml` on `workflow_run` (`ci`, completed, branch `master`, conclusion success, event push) and `workflow_dispatch` (`dry_run` default true, optional `sha`). Least permissions: workflow `permissions: {}`, job `contents: write`, `pull-requests: write`. Only first-party actions already used in `ci.yml` (`actions/checkout@v4`, `actions/setup-node@v4`), the rest is `gh`, `git` and `node`. The PostHog annotation step moves here, runs only when `tag_created == 'true'` and keeps the existing secret, `continue-on-error` and curl shape.
- The site build is untouched: it never calls GitHub or git.

## Relevant Files

Use these files to implement the feature:

- `README.md` - Scripts table; add a line for `node scripts/release.ts` only if the table lists node scripts (it lists `yarn` scripts only, so leave it unless a `yarn` script is added; none is planned).
- `AGENTS.md` - Repository rules: Yarn only, no em-dashes, conventional commits without trailers, docs one per feature.
- `.adw/project.md` - Profile. Its Identity section describes how changelog entries are drafted; update that bullet to say the release workflow drafts them (no heading changes).
- `docs/conditional-docs.md` - Update the `app_docs/changelog.md` line (add `.github/workflows/release.yml`, `scripts/release.ts`, `src/lib/release.ts`, tags and GitHub Releases) and the `app_docs/analytics.md` line (`release-annotation.yml` becomes `release.yml`'s annotation step).
- `app_docs/changelog.md` - Feature doc for the changelog; replace "Adding an entry by hand" / "Until a release script exists" with a "Release workflow" section; the "How it was generated" section changes because the script is now incremental; Rules gain the release invariants.
- `app_docs/analytics.md` - "Release markers" section: new annotation text, new workflow file, runs after CI, only when the tag was created.
- `app_docs/ci.md` - Read to keep `ci.yml` unchanged; add one sentence that `release.yml` follows a successful `check` on `master`.
- `.github/workflows/ci.yml` - The `check` job the release waits for; the workflow `name: ci` is what `workflow_run.workflows` must match. Source of the setup steps (checkout, setup-node 24, corepack, `yarn install --immutable` with `LEFTHOOK: 0`) to copy.
- `.github/workflows/release-annotation.yml` - Folded into `release.yml` and deleted.
- `scripts/backfill-changelog.ts` - Made incremental, shares the parser, rewrites `PRODUCTION_PRS`.
- `src/lib/changelog-backfill.ts` - Gains `shippedPullNumbers` and `withProductionPrs`; already has `entryId`, `utcDate`, `parsePrTitle`, `groupPullRequests`, `sectionForPrefix`, `countsOf`, `SYNC_LINE`, `pullUrl`.
- `src/lib/changelog-backfill.test.ts` - Extend with tests for the two new helpers.
- `src/content/changelog/registry.test.ts` - `PRODUCTION_PRS` is rewritten by the script; its comment changes to say so. Its "reads as a product changelog" test fails on an unedited draft (empty description, lowercase PR-title text): that is the intended gate before merging the draft PR.
- `src/content/changelog/index.ts` - Rewritten by the script via `renderRegistry`.
- `knip.json` - Add `scripts/release.ts` to `entry`.
- `vitest.config.ts` - Confirms `src/**/*.test.ts` is the unit layer (the new test lives in `src/lib/`).
- `lefthook.yml` - Hooks the commit of this change must pass.

### New Files

- `src/lib/release.ts` - Pure release helpers (tag name, notes, PR lookup, step decisions, annotation text, draft branch and title).
- `src/lib/release.test.ts` - Unit tests for them.
- `scripts/release.ts` - The orchestrator the workflow runs (`node scripts/release.ts --sha <sha> [--dry-run]`).
- `.github/workflows/release.yml` - The release workflow.

## Implementation Plan

### Phase 1: Foundation

Pure helpers and their tests: `shippedPullNumbers` and `withProductionPrs` in `src/lib/changelog-backfill.ts`; `src/lib/release.ts` with `releaseTag`, `releaseNotes`, `productionPrForCommit`, `releaseSteps`, `draftBranch`, `draftPrTitle`, `annotationContent`. No Node APIs, no clock, relative `.ts` imports only.

### Phase 2: Core Implementation

Make `scripts/backfill-changelog.ts` incremental and have it rewrite `PRODUCTION_PRS`. Write `scripts/release.ts` (state read, dry-run printing, the four actions, `$GITHUB_OUTPUT`). Write `.github/workflows/release.yml` with the annotation step folded in; delete `release-annotation.yml`.

### Phase 3: Integration

Docs (`app_docs/changelog.md`, `app_docs/analytics.md`, `app_docs/ci.md`, `docs/conditional-docs.md`, `.adw/project.md` Identity bullet), `knip.json` entry, a local dry run against #238 whose output goes into the PR body, then the validation commands.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Share the shipped-PR parser and add the registry rewrite (`src/lib/changelog-backfill.ts`)

- Add `export function shippedPullNumbers(gitLog: string): number[]`: the input is the output of `git log --first-parent --format=%H%x09%s M^2 ^M^1`; split on `\n`, keep lines matching `/^[0-9a-f]+\tMerge pull request #(\d+) /`, return the numbers in log order. This is the exact regex now inline in `scripts/backfill-changelog.ts` (line 139); move it, do not copy it.
- Add `export function withProductionPrs(source: string, prs: number[]): string`: replaces the single line `const PRODUCTION_PRS = [ ... ];` in the registry test source with the sorted, de-duplicated numbers in the same one-line shape (`const PRODUCTION_PRS = [8, 16, ...];`). Throw `Error("registry.test.ts: PRODUCTION_PRS not found")` when the line is not there exactly once. Prettier may wrap a long array over several lines, so match `/const PRODUCTION_PRS = \[[^\]]*\];/` (spanning newlines) and always emit one line; `yarn format` re-wraps it.
- Keep the file free of imports and Node APIs (its header comment says so).

### 2. Unit tests for the two helpers (`src/lib/changelog-backfill.test.ts`)

- `shippedPullNumbers`: a log with two `Merge pull request #N from ...` lines and one plain commit returns both numbers in order; an empty string returns `[]`; a subject `Merge branch 'develop'` is ignored.
- `withProductionPrs`: rewrites `[8, 16]` to `[8, 16, 238]` given `[238, 16, 8]`; works on a multi-line (prettier-wrapped) array; de-duplicates; leaves the rest of the source byte-identical; throws when the line is missing.

### 3. Pure release helpers (`src/lib/release.ts`)

Header comment in the style of `changelog-backfill.ts`: pure derivation for `scripts/release.ts`, relative `.ts` import only, no Node APIs, no clock. Import from `"./changelog-backfill.ts"`.

- `export const TAG_PREFIX = "release-"` and `export function releaseTag(date: string, pr: number): string` returning `` `release-${entryId(date, pr)}` `` (e.g. `releaseTag("2026-10-27", 238)` is `release-2026-10-27-pr238`). Date is a `YYYY-MM-DD` from `utcDate(mergedAt)`.
- `export function releaseNotes(groups: ChangelogGroups): string`: Markdown for the GitHub Release body. For each non-empty section in `CHANGELOG_SECTIONS` order, a `## Features` / `## Fixes` / `## Chores` heading and one line per PR: `- <text> (#<issue>, #<pr>)` (GitHub autolinks `#N`; omit the issue when `null`). When all three are empty, `SYNC_LINE`. Built on `groupPullRequests` output, so grouping is `sectionForPrefix`; no second parser. Export `SECTION_HEADINGS` from `changelog-backfill.ts` (currently a private const) and reuse it rather than redefining the headings.
- `export interface ProductionPr { number: number; title: string; mergedAt: string; mergeCommit: { oid: string } | null }` (move this interface from the backfill script, which then imports it) and `export function productionPrForCommit(prs: ProductionPr[], sha: string): ProductionPr | null`: the PR whose `mergeCommit.oid` equals the full sha (accept a short sha prefix of at least 7 hex chars; more than one match throws).
- `export function draftBranch(tag: string): string` -> `` `changelog/${tag}` ``; `export function draftPrTitle(tag: string): string` -> `` `chore: changelog draft for ${tag}` ``; `export function annotationContent(tag: string): string` -> `` `adw-dashboard ${tag}` ``.
- `export function draftPrBody(ids: string[]): string`: a short body listing the drafted entry files and saying the owner rewrites the title, description and lines from the diff before merging (see `app_docs/changelog.md`, What an entry says) and that the registry test fails until then. No attribution line, no em-dash.
- `export interface ReleaseState { sha: string; tagSha: string | null; releaseExists: boolean; draftPr: number | null; draftChanged: boolean }` where `tagSha` is the commit the remote tag peels to (`null` when absent), `draftPr` is an open, closed or merged PR on `draftBranch(tag)` (any state), `draftChanged` is whether the backfill changed anything on top of `origin/develop`.
- `export type StepAction = "create" | "already released" | "nothing to draft"` and `export function releaseSteps(state: ReleaseState): { tag: StepAction; release: StepAction; draft: StepAction }`:
  - `tag`: `already released` when `tagSha === sha`; `create` when `null`; **throws** `Tag <tag> points at <tagSha>, not <sha>; a release tag is never moved` otherwise.
  - `release`: `already released` when `releaseExists`, else `create`.
  - `draft`: `already released` when `draftPr !== null`; `nothing to draft` when `!draftChanged` (every entry already exists on develop, e.g. the owner wrote it by hand); else `create`.

### 4. Unit tests (`src/lib/release.test.ts`)

- `releaseTag("2026-10-27", 238)` is `release-2026-10-27-pr238` and equals `"release-" + entryId(...)`; a single-digit PR (`2026-10-03`, 8) is `release-2026-10-03-pr8`.
- `releaseNotes`: a mix of `feat:`, `fix: #153 - ...`, `bug:`, `chore:`, `docs:` and an unprefixed title lands under Features / Fixes / Chores in that heading order, each list ordered by PR number, issue shown when present; an empty set renders `SYNC_LINE`; a section with no PRs has no heading.
- `productionPrForCommit`: full sha match, 7-char prefix match, no match returns `null`, `mergeCommit: null` is skipped.
- `releaseSteps`: fresh state is `create` x3; the state after a real run (tag at sha, release exists, draft PR exists) is `already released` x3 (this is the idempotency proof the issue asks for); tag on another sha throws; no changes and no PR is `nothing to draft`.
- `annotationContent("release-2026-10-27-pr238")` is `adw-dashboard release-2026-10-27-pr238`; `draftPrTitle` and `draftBranch` shapes; `draftPrBody` contains no `an em-dash (U+2014)`.

### 5. Make the backfill incremental (`scripts/backfill-changelog.ts`)

- Import `ProductionPr` from `../src/lib/release.ts` and `shippedPullNumbers`, `withProductionPrs` from `../src/lib/changelog-backfill.ts`.
- Compute `missing = production.filter(pr => !existsSync(<id>.mdx))`. Only check merge commits exist for `missing`; only call `gh api` for stats for `missing` (still before writing anything).
- Replace the "already exists; refusing to overwrite" failure loop with the skip. Keep "never overwrite": write each entry with `writeFileSync(path, text, { flag: "wx" })` so a race or a bug fails rather than overwrites.
- Replace the inline regex with `shippedPullNumbers(git([...]))`.
- After writing `index.ts`, rewrite `src/content/changelog/registry.test.ts` with `withProductionPrs(source, production.map(pr => pr.number))` (the full production list, so the test matches the folder).
- When `missing` is empty, print `No production pull request without an entry; nothing to draft.` and exit 0 without touching `index.ts` or the test.
- Update the header comment: incremental, drafts every production PR without an entry, run by `scripts/release.ts` too.
- Keep the existing `eslint-disable-next-line security/detect-non-literal-fs-filename` comments on each fs call with a non-literal path, adding them for new calls.

### 6. The orchestrator (`scripts/release.ts`)

Same style as the backfill script (`execFileSync` `gh`/`git` helpers, `fail()`), header comment with the usage:

```
git fetch origin master develop --tags
node scripts/release.ts --sha <merge commit> [--dry-run]
```

- Parse `--sha` (default: `git rev-parse origin/master`) and `--dry-run` from `process.argv` (no dependency).
- Check `git merge-base --is-ancestor <sha> origin/master`; otherwise fail `<sha> is not on master`.
- Resolve the production PR: `gh pr list --state merged --base master --limit 200 --json number,title,mergedAt,mergeCommit`, then `productionPrForCommit`. When `null`, print `<sha> is not the merge commit of a production pull request; nothing to release.` and exit 0 (a direct push to master is not a release).
- `tag = releaseTag(utcDate(pr.mergedAt), pr.number)`.
- Read the state:
  - `tagSha`: `git ls-remote --tags origin refs/tags/<tag>^{}` (the peeled commit of an annotated tag), `null` when empty.
  - `releaseExists`: `gh release view <tag> --json tagName` exit status (0 exists; non-zero with "release not found" means absent; any other error fails).
  - `draftPr`: `gh pr list --head <draftBranch(tag)> --state all --json number --limit 1`.
  - `draftChanged`: build the draft in a temporary worktree: `git worktree add --detach <tmp> origin/develop` (`<tmp>` under `RUNNER_TEMP` or `os.tmpdir()`, via `mkdtempSync`), then in `<tmp>`: `node scripts/backfill-changelog.ts`, then `yarn prettier --write src/content/changelog` run from the main checkout with the worktree path (the worktree has no `node_modules`; Prettier resolves the committed config next to each file), then `git -C <tmp> status --porcelain` non-empty. Skip the build when `draftPr !== null`.
- Compute `steps = releaseSteps(state)` and print one block per step, always (dry run and real):
  - `tag: <tag> on <sha>: create` / `tag: <tag>: already released`
  - `release: <tag>: create` followed by the notes, or `already released`
  - `draft: <draftPrTitle(tag)>: create` followed by `git -C <tmp> diff` (plus `git -C <tmp> status --porcelain` for new files, printing their content with `git -C <tmp> diff --no-index /dev/null <file>`), or `already released` / `nothing to draft`
  - `annotation: <annotationContent(tag)>: create` only when `steps.tag === "create"`, else `already released`.
- Release notes input: `groupPullRequests(shippedPullNumbers(git log --first-parent ... <sha>^2 ^<sha>^1).map(n => ({ number: n, title: <title from gh pr list --base develop or gh pr view> })))`; reuse the backfill's `titleOf` approach (one `gh pr list --base develop --limit 1000` call, `gh pr view` fallback). For a `revert:` production PR, notes are the `## Reverted` line from `parseRevert`.
- Unless `--dry-run`, act in order, each only when its step is `create`:
  1. Tag: `git -c user.name=github-actions[bot] -c user.email=41898699+github-actions[bot]@users.noreply.github.com tag -a <tag> -m "<tag>: <production PR title text>" <sha>` then `git push origin refs/tags/<tag>` (no `--force`, so an existing remote tag rejects the push).
  2. Release: write notes to a temp file, `gh release create <tag> --verify-tag --title <tag> --notes-file <file>`.
  3. Draft: in `<tmp>`, `git switch -c <draftBranch(tag)>`, `git add src/content/changelog`, commit with the same bot identity and the message `chore: changelog draft for <tag>` (no trailers, no body attribution), `git push origin HEAD:refs/heads/<branch>` (if the remote branch exists from an interrupted run, push with `--force-with-lease=<branch>:<its sha>` only when no PR exists on it; otherwise the step is already released), then `gh pr create --base develop --head <branch> --title <draftPrTitle(tag)> --body <draftPrBody(ids)>`. Never `gh pr merge`, never auto-merge.
- Always `git worktree remove --force <tmp>` in a `finally`.
- Write `tag=<tag>`, `merged_at=<pr.mergedAt>`, `tag_created=<true when the tag was pushed in this run>` to `$GITHUB_OUTPUT` when that variable is set (append with `appendFileSync`).
- In dry-run print a last line `Dry run: nothing was created.`.

### 7. The workflow (`.github/workflows/release.yml`)

- Header comment: what it does, that it follows CI on master, see `app_docs/changelog.md` "Release workflow" and `app_docs/analytics.md` "Release markers".
- Triggers:
  ```yaml
  on:
    workflow_run:
      workflows: [ci]
      types: [completed]
      branches: [master]
    workflow_dispatch:
      inputs:
        dry_run:
          {
            description: "Print what would be created, create nothing",
            type: boolean,
            default: true,
          }
        sha:
          {
            description: "Merge commit on master (default: master's head)",
            type: string,
            required: false,
          }
  permissions: {}
  concurrency:
    group: release
    cancel-in-progress: false
  ```
- One job `release`, `runs-on: ubuntu-latest`, `permissions: { contents: write, pull-requests: write }`, with
  `if: github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push' && github.event.workflow_run.head_branch == 'master')`. CI on a pull request into master and anything on `develop` never release.
- Steps: `actions/checkout@v4` with `fetch-depth: 0` (default ref: the default branch; the script works from `origin/master` and `origin/develop`), `git fetch origin master develop --tags`, `actions/setup-node@v4` with `node-version: 24`, `corepack enable`, `yarn install --immutable` with `LEFTHOOK: 0` (same as `ci.yml`; Prettier is needed for the draft), then:
  ```yaml
  - id: release
    env:
      GH_TOKEN: ${{ github.token }}
      SHA: ${{ github.event.workflow_run.head_sha || inputs.sha }}
      DRY_RUN: ${{ inputs.dry_run }}
    run: |
      args=()
      if [ -n "$SHA" ]; then args+=(--sha "$SHA"); fi
      if [ "$DRY_RUN" = "true" ]; then args+=(--dry-run); fi
      node scripts/release.ts "${args[@]}"
  ```
  Inputs go through `env`, never interpolated into `run`.
- The PostHog step, moved from `release-annotation.yml`: `if: steps.release.outputs.tag_created == 'true'`, `continue-on-error: true`, `POSTHOG_PERSONAL_API_KEY` secret (no new secret), content `adw-dashboard ${TAG}` from `steps.release.outputs.tag`, `date_marker` from `steps.release.outputs.merged_at` (the merge time, so the marker sits where the release went out, not where CI finished), the same skip notice when the secret is unset and the same 200/201 check. A dry run never reaches it (`tag_created` is never true), but print the text it would send in the script (step 6).
- Delete `.github/workflows/release-annotation.yml`.

### 8. Knip

- Add `"scripts/release.ts"` to `entry` in `knip.json`. Run `yarn knip` and fix any unused export (for example keep `ProductionPr` exported only if both scripts import it).

### 9. Docs

- `app_docs/changelog.md`: add `specs/issue-248-adw-35167e14-sdlc_planner-release-automation.md` under Specifications. Rename "How it was generated" to "How a draft is generated" and say the script is incremental (skips production PRs that have an entry, never overwrites, rewrites `index.ts` and `PRODUCTION_PRS`). Replace "Adding an entry by hand" (and its "Until a release script exists") with "Release workflow": trigger (`release.yml` after a successful `ci` on a push to `master`), the tag `release-<entry id>` on the merge commit (annotated, never moved), the GitHub Release and its grouped notes, the draft PR `chore: changelog draft for release-<id>` on `changelog/release-<id>` that the owner rewrites (What an entry says) before merging and whose registry test fails until then, the dry run (`workflow_dispatch`, `dry_run`, `sha`) and the local equivalent `node scripts/release.ts --sha <sha> --dry-run`, and that each step reports `already released` on a rerun. Keep a short note that an entry can still be written by hand in the same shape. Add Rules: release tags are never moved or overwritten; the draft PR is never merged automatically; the workflow runs only for a push to `master`; never `gh run rerun` past a failure (fix and dispatch instead). The existing rule "The site build never calls GitHub or git; only the offline script does" becomes "only the offline scripts and the release workflow do".
- `app_docs/analytics.md`: rewrite "Release markers": the annotation is a step of `.github/workflows/release.yml`, created once per release when the tag is created, text `adw-dashboard release-<YYYY-MM-DD>-pr<N>`, dated at the production PR's merge time; secret, skip, warning and `continue-on-error` unchanged.
- `app_docs/ci.md`: one sentence under Overview that `release.yml` runs after a successful `check` on a push to `master`, documented in `app_docs/changelog.md`.
- `docs/conditional-docs.md`: changelog line adds `scripts/release.ts`, `src/lib/release.ts`, `.github/workflows/release.yml`, release tags, GitHub Releases or the changelog draft PR; analytics line replaces `.github/workflows/release-annotation.yml` with "the PostHog annotation step of `.github/workflows/release.yml`".
- `.adw/project.md` Identity, "Changelog entries" bullet: drafted by the release workflow (`scripts/release.ts`, which runs `node scripts/backfill-changelog.ts`) as a PR into `develop`, then rewritten by hand. Do not touch headings.
- `src/content/changelog/registry.test.ts`: change the comment above `PRODUCTION_PRS` to say `scripts/backfill-changelog.ts` rewrites it with every production PR.

### 10. Local dry run for #238 (PR evidence)

- `git fetch origin master develop --tags`, then `node scripts/release.ts --sha 3af6ffeb585e4af8d8c5a4b8e0db21463b6a1216 --dry-run`. Expected: `tag: release-2026-10-27-pr238 ... create`, the grouped notes, the draft diff with the nine missing entries (#191, #194, #198, #202, #219, #222, #225, #227, #238), `index.ts` and `PRODUCTION_PRS`, the annotation text, `Dry run: nothing was created.`. Read-only (`gh` reads, a temporary worktree removed at the end).
- Confirm with `git worktree list` and `git status` that nothing is left behind, and that `git tag` and `gh release list` are still empty.
- Run it a second time and confirm identical output. Save both outputs to paste in the PR body (the `already released` path is proven by the `releaseSteps` unit test, and in production by dispatching a dry run after the first real release, see Notes).

### 11. Em-dash check and validation

- `grep -rnP "\x{2014}" .github app_docs scripts src` prints nothing.
- Run every command in Validation Commands.

No browser coverage: this change touches CI, scripts and pure helpers. The changelog pages do not change (the drafts land in a separate PR that the owner edits), so there is no E2E spec, no journey and no screenshot.

## Testing Strategy

### Unit Tests

- `src/lib/release.test.ts` (new): `releaseTag`, `releaseNotes`, `productionPrForCommit`, `releaseSteps`, `annotationContent`, `draftBranch`, `draftPrTitle`, `draftPrBody`.
- `src/lib/changelog-backfill.test.ts` (extended): `shippedPullNumbers`, `withProductionPrs`.
- The orchestration in `scripts/release.ts` and the workflow YAML are proven by the local dry run (task 10), not by a unit test: they are thin `gh`/`git` calls around the tested helpers.

### Test Coverage

- `releaseTag` (unit, `src/lib/release.test.ts`): catches a tag name that drifts from the changelog entry id (`release-<YYYY-MM-DD>-pr<N>`); fails without the feature (the function does not exist).
- `releaseNotes` (unit): catches release notes that group differently from the changelog (wrong section, order, missing issue link, missing sync line).
- `releaseSteps` (unit): catches a rerun that would duplicate a tag, Release or draft PR, and a tag that would be moved; the "after a real run every step is already released" case is the idempotency requirement.
- `productionPrForCommit` (unit): catches releasing a commit that is not a production PR's merge commit.
- `shippedPullNumbers` and `withProductionPrs` (unit, `src/lib/changelog-backfill.test.ts`): catch the shared parser losing PRs and the registry test's `PRODUCTION_PRS` not following the drafted entries.

### Edge Cases

- Rerun of the workflow for the same commit: every step `already released`, no annotation.
- Remote tag exists on a different commit: hard failure, tag never moved.
- Interrupted previous run: tag pushed but Release missing (Release is created), or branch pushed but no PR (PR is opened from it).
- The draft PR was merged or closed: `--state all` finds it, `already released`.
- The owner already wrote the entry by hand on `develop`: `nothing to draft`.
- A direct push to `master` that is not a production PR merge: nothing to release, exit 0.
- CI failed or ran for a pull request into `master`: the job's `if` skips it.
- A `revert:` production PR: tag and Release named the same way, notes are the `## Reverted` line, entry kind `revert`.
- A release with no develop PRs (branch sync): notes and entry are `SYNC_LINE`.
- A develop PR title with an em-dash: `renderEntryMdx` stops the draft step (documented rule); tag and Release were already done and stay; fix the title and dispatch.
- First run: drafts every missing entry since 2026-10-09 in one PR.
- `POSTHOG_PERSONAL_API_KEY` unset: notice and skip, the release does not fail.
- `workflow_dispatch` with a `sha` not on `master`: fails with `<sha> is not on master`.

## Acceptance Criteria

- A successful `ci` run for a push to `master` triggers `release.yml`; a PR run or a `develop` push does not.
- The merge commit gets the annotated tag `release-<YYYY-MM-DD>-pr<N>` (UTC merge date), never moved or overwritten.
- A GitHub Release exists for the tag with notes grouped Features / Fixes / Chores by `groupPullRequests`/`sectionForPrefix` (no second parser).
- A PR `chore: changelog draft for release-<id>` into `develop` holds the drafted entries, the rewritten `index.ts` and `PRODUCTION_PRS`, formatted; it is never auto-merged. The first run drafts every missing entry since 2026-10-09.
- The PostHog annotation reads `adw-dashboard release-<id>`; `release-annotation.yml` no longer exists.
- `workflow_dispatch` with `dry_run` prints tag, notes, draft diff and annotation text and creates nothing; a rerun after a real release reports `already released` for each step.
- Permissions are exactly `contents: write` and `pull-requests: write` on the job, `{}` at workflow level; no new secret; only `actions/checkout@v4` and `actions/setup-node@v4`.
- `scripts/backfill-changelog.ts` runs incrementally and never overwrites an entry.
- The site build calls neither GitHub nor git.
- Docs updated: `app_docs/changelog.md`, `app_docs/analytics.md`, `app_docs/ci.md`, `docs/conditional-docs.md`, `.adw/project.md` (Identity bullet only).
- The PR body contains the dry-run output for #238; no attribution line.
- `grep -rnP "\x{2014}" .github app_docs scripts src` prints nothing; all validation commands pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn format:check` - Prettier over the new script, helpers, workflow and docs.
- `yarn lint` - ESLint (including `security/*`) over `scripts/release.ts` and the helpers.
- `yarn typecheck` - `scripts/*.ts` and `src/lib/*.ts` type-check (relative `.ts` imports).
- `yarn knip` - `scripts/release.ts` is an entry and no new export is unused.
- `yarn test` - the new and extended unit tests, plus `registry.test.ts` unchanged and green on this branch.
- `yarn build` - the site still builds without GitHub or git.
- `yarn check:og` - post metadata check after the build, unchanged.
- `node scripts/release.ts --sha 3af6ffeb585e4af8d8c5a4b8e0db21463b6a1216 --dry-run` (after `git fetch origin master develop --tags`) - the end-to-end dry run for #238; run twice, outputs identical; afterwards `git worktree list`, `git status`, `git tag` and `gh release list` show nothing created.
- `grep -rnP "\x{2014}" .github app_docs scripts src` - prints nothing.

## Notes

- **One-time repository setting (owner):** `gh api repos/SBub/adw-dashboard/actions/permissions/workflow` reports `can_approve_pull_request_reviews: false`, which is the "Allow GitHub Actions to create and approve pull requests" setting. With it off, `GITHUB_TOKEN` cannot run `gh pr create` and the draft step fails. The owner turns it on in Settings > Actions > General (or `gh api -X PUT repos/SBub/adw-dashboard/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true`). This is a setting, not a secret; the implementation must not change it, only document it in `app_docs/changelog.md` and the PR body.
- `workflow_run` and `workflow_dispatch` only run from the workflow file on the default branch, which is `develop`. So the workflow is live after this PR merges into `develop`; the first real release is the next promotion to `master` (or a dispatch with `dry_run: false` and `sha` of #238's merge commit to release #238 retroactively). The in-PR evidence is therefore the local dry run (task 10); the on-GitHub dry-run and the second-run `already released` check happen after merge.
- PRs opened with `GITHUB_TOKEN` do not trigger other workflows, so CI does not run on the draft PR until the owner pushes the rewritten entry. Its `registry.test.ts` fails on an unedited draft (empty description, PR-title text), which is the intended gate.
- In the runner, `yarn install` uses `LEFTHOOK: 0` exactly as `ci.yml` does, so the bot commit runs no hooks; this is not `--no-verify`. The draft only touches MDX, `index.ts` and one array literal, all formatted by Prettier before the commit, and the owner's edit commit runs every hook locally.
- Release notes list develop PR titles on GitHub (as the issue asks); the changelog entry text on the site stays the owner's.
- No new dependency.
- Promotion PRs are merge commits; a squash-merged promotion has no `M^2` and the shipped-PR read fails, as it already does in the backfill script.
- Never `gh run rerun` past a failure: fix the cause, then dispatch with the `sha`.
