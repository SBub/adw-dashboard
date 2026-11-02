# Patch: Write the release workflow docs (spec step 9)

## Metadata

adw_id: `35167e14`
review_change_request: `Issue #1: Spec step 9 (Docs) and the acceptance criterion 'Docs updated: app_docs/changelog.md, app_docs/analytics.md, app_docs/ci.md, docs/conditional-docs.md' were not done: none of these four files is in the diff (only .adw/project.md was updated). The docs still describe release-annotation.yml, the one-off backfill and "Until a release script exists"; the site-build Rule was not changed; there is no Release workflow section, no release Rules and no note on the "Allow GitHub Actions to create and approve pull requests" setting. Resolution: do spec step 9 as written in app_docs/changelog.md, app_docs/analytics.md, app_docs/ci.md and docs/conditional-docs.md. No em-dashes. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-248-adw-35167e14-sdlc_planner-release-automation.md`
**Issue:** The branch adds `.github/workflows/release.yml`, `scripts/release.ts`, `src/lib/release.ts`, makes `scripts/backfill-changelog.ts` incremental and deletes `.github/workflows/release-annotation.yml`, but the four feature docs and the index were not touched. `app_docs/analytics.md` "Release markers" and `docs/conditional-docs.md` still point at the deleted workflow; `app_docs/changelog.md` still describes a one-off script, "Adding an entry by hand" ("Until a release script exists") and the Rule "only the offline script does", which the release workflow now breaks (AGENTS.md: a change that breaks a Rules invariant changes it in the same commit). `release.yml`'s header comment already links to `app_docs/changelog.md` "Release workflow", which does not exist.
**Solution:** Docs only, no code. Do spec step 9 for the four files exactly as written, using the facts in `release.yml`, `scripts/release.ts`, `src/lib/release.ts` and `scripts/backfill-changelog.ts` as they are on this branch. `.adw/project.md` and the `registry.test.ts` comment are already done; do not touch them.

## Files to Modify

- `app_docs/changelog.md`
- `app_docs/analytics.md`
- `app_docs/ci.md`
- `docs/conditional-docs.md`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Confirm the facts before writing

- Read `.github/workflows/release.yml`, `scripts/release.ts` (header comment, `parseArgs`, the `already released` messages), `src/lib/release.ts` (`releaseTag`, `draftBranch`, the draft PR title and body, `annotationContent`) and the header comment of `scripts/backfill-changelog.ts`. Use their exact spellings in the docs: tag `release-<YYYY-MM-DD>-pr<N>`, branch `changelog/release-<id>`, PR title `chore: changelog draft for release-<id>`, step outputs `tag`, `tag_created`, `merged_at`, annotation text `adw-dashboard release-<YYYY-MM-DD>-pr<N>`.

### Step 2: `app_docs/changelog.md`

- Specifications: add `- specs/issue-248-adw-35167e14-sdlc_planner-release-automation.md` under the existing 173 line.
- Rename `### How it was generated` to `### How a draft is generated`. Keep the command block and the shipped-PR / `parsePrTitle` / `sectionForPrefix` paragraph. Rewrite the "stops when ... already exists" paragraph: the script is incremental; it drafts only production pull requests that have no `.mdx` yet (checks merge commits and calls `gh api` for stats only for those), never overwrites (each file is written with the `wx` flag), rewrites `src/content/changelog/index.ts` from the folder and `PRODUCTION_PRS` in `registry.test.ts` with every production pull request, prints `No production pull request without an entry; nothing to draft.` and exits 0 when nothing is missing, still stops on a missing merge commit or an em-dash, and is also run by `scripts/release.ts`.
- Replace `### Adding an entry by hand` with `### Release workflow` covering, in short paragraphs:
  - Trigger: `.github/workflows/release.yml` runs on `workflow_run` after a successful `ci` on a push to `master` (a pull request into `master` or a failed CI never releases), and on `workflow_dispatch`; one run at a time (`concurrency: release`). It runs `node scripts/release.ts` for the merge commit (`head_sha`, or the dispatch's `sha`, default `master`'s head).
  - Tag: the annotated tag `release-<entry id>` (`release-<YYYY-MM-DD>-pr<N>`) on the production pull request's merge commit; never moved or overwritten.
  - GitHub Release for that tag whose notes list the develop pull requests it shipped, grouped Features / Fixes / Chores by `groupPullRequests` and `sectionForPrefix`, the same code as the draft.
  - Draft PR: `chore: changelog draft for release-<id>` from branch `changelog/release-<id>` into `develop`, carrying what `scripts/backfill-changelog.ts` drafted, formatted, plus `index.ts` and `PRODUCTION_PRS`. The owner rewrites title, description and lines (What an entry says) before merging; `registry.test.ts` fails on the unedited draft; it is never merged automatically. CI does not run on it until the owner pushes, because PRs opened with `GITHUB_TOKEN` trigger no workflows.
  - PostHog annotation step: one sentence pointing at `app_docs/analytics.md`, Release markers.
  - Dry run: `workflow_dispatch` with `dry_run` (default true) and optional `sha` prints the tag, the notes and the draft diff and creates nothing; the local equivalent is `git fetch origin master develop --tags` then `node scripts/release.ts --sha <sha> --dry-run`.
  - Rerun: every step checks GitHub first and reports `already released` when its artefact exists, so a rerun is a no-op. After a failure, fix the cause and dispatch with the `sha`; never `gh run rerun`.
  - Repository setting (one time, owner): `GITHUB_TOKEN` can open the draft PR only with "Allow GitHub Actions to create and approve pull requests" on (Settings > Actions > General; `can_approve_pull_request_reviews` in `gh api repos/SBub/adw-dashboard/actions/permissions/workflow`, set with `gh api -X PUT repos/SBub/adw-dashboard/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true`). With it off the draft step fails. It is a setting, not a secret; the workflow never changes it.
  - Keep a short closing note: an entry can still be written by hand in the same shape (stats from `gh api repos/SBub/adw-dashboard/pulls/<N>`, one string-literal import in `CHANGELOG_ENTRIES`, the number in `PRODUCTION_PRS`, `counts` equal to the lines), and keep the existing sentence on what the registry test checks.
- Rules: change the first rule to `The site build never calls GitHub or git; only the offline scripts and the release workflow do.` and add four rules: release tags are never moved or overwritten; the changelog draft PR is never merged automatically; the release workflow runs only for a push to `master` (or a manual dispatch); never `gh run rerun` a failed release, fix the cause and dispatch with the `sha` instead.

### Step 3: `app_docs/analytics.md` "Release markers"

- Rewrite lines 108-119: the annotation is the `Create PostHog annotation` step of `.github/workflows/release.yml`, run only when that run created the release tag (`tag_created`), so once per release; text `adw-dashboard release-<YYYY-MM-DD>-pr<N>`, `date_marker` the production pull request's merge time (`merged_at`), project 302689, same `POST https://eu.posthog.com/api/projects/302689/annotations/`. Keep unchanged: the `POSTHOG_PERSONAL_API_KEY` secret (annotation write), notice and skip when unset, warning on a failed request, `continue-on-error` so a marker never fails the release, key sent only as a header and never printed, no third-party action. Add that it replaces the deleted `release-annotation.yml`, and see `app_docs/changelog.md`, Release workflow.
- `grep -n "release-annotation" app_docs/` afterwards; fix any other mention.

### Step 4: `app_docs/ci.md` and `docs/conditional-docs.md`

- `app_docs/ci.md` Overview: append one sentence after the first paragraph: `.github/workflows/release.yml` runs after a successful `check` on a push to `master` and is documented in `app_docs/changelog.md`, Release workflow.
- `docs/conditional-docs.md` changelog line: after `scripts/backfill-changelog.ts`, add `scripts/release.ts`, `src/lib/release.ts`, `.github/workflows/release.yml`, and append `; when touching release tags, GitHub Releases or the changelog draft pull request`. Analytics line: replace `` `.github/workflows/release-annotation.yml` `` with ``the PostHog annotation step of `.github/workflows/release.yml` ``.

### Step 5: Format and em-dash check

- `yarn format` then confirm only the four files changed (`git status`).
- `grep -rnP "\x{2014}" app_docs docs .github scripts src` must print nothing.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `grep -rn "release-annotation\|Until a release script\|How it was generated\|only the offline script does" app_docs docs` prints nothing.
- `grep -rnP "\x{2014}" .github app_docs docs scripts src` prints nothing.
- `yarn format:check`
- `yarn lint`
- `yarn typecheck`
- `yarn knip`
- `yarn test`

## Patch Scope

**Lines of code to change:** about 80 lines of Markdown across four docs, no code
**Risk level:** low
**Testing required:** format check and the commit-hook checks (lint, typecheck, knip) plus `yarn test`; greps proving no stale reference or em-dash remains. Build and E2E are unaffected by Markdown under `app_docs/` and `docs/`.
