# Patch: Remove stray Playwright snapshots committed in 7414d2b

## Metadata

adw_id: `7a7f315b`
review_change_request: `Issue #3: Commit 7414d2b adds s9.yml (226 lines), s12.yml (697 lines) and s13.yml (152 lines) at the repository root. These are Playwright accessibility snapshots of the dashboard and are not mentioned anywhere in the spec. This is scope creep with no purpose in the repository: they are leftover artifacts of a browser session. The commit's message, 'No commit was created: the working tree has no tracked changes...', is not a Conventional Commit, which breaks the AGENTS.md and profile commit rule. The message body even says these files were deliberately not staged, but they were committed. Merging would ship 1075 lines of junk and a malformed commit to develop. Resolution: On this branch, delete s9.yml, s12.yml and s13.yml (git rm) and commit the removal with a Conventional Commit message such as 'chore: remove stray playwright snapshots'. Alternatively, rewrite the branch so commit 7414d2b disappears. Make sure nothing else in the diff depends on these files. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-146-adw-7a7f315b-sdlc_planner-show-history-run-cost.md`
**Issue:** Commit `7414d2b` (the branch tip) adds only three files, `s9.yml`, `s12.yml` and `s13.yml` (1075 lines of Playwright MCP accessibility snapshots), at the repository root, under a non-Conventional-Commit subject. No file in the repository references them (checked with `grep -rn "s9.yml\|s12.yml\|s13.yml"` outside `node_modules` and `.git`: no hits), and the spec never mentions them.
**Solution:** Remove the three files with `git rm` and commit the removal as `chore: remove stray playwright snapshots`. This is the forward-only option: no history rewrite, no force push, and it leaves the uncommitted doc and `RunRow.tsx` work in the tree untouched. The squash merge of the PR drops the net-zero files from `develop` anyway.

## Files to Modify

Use these files to implement the patch:

- `s9.yml` (delete)
- `s12.yml` (delete)
- `s13.yml` (delete)

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Confirm nothing depends on the snapshots

- Run `git grep -n -e 's9.yml' -e 's12.yml' -e 's13.yml'` and expect no output (the files' own contents do not name themselves).
- Confirm `git show --stat 7414d2b` lists only `s9.yml`, `s12.yml` and `s13.yml`, so removing them fully reverts that commit's content.

### Step 2: Remove the files from the index and the working tree

- Run `git rm s9.yml s12.yml s13.yml`.
- Do not touch the other working-tree changes (`app_docs/*.md`, `src/components/RunRow.tsx`, the untracked `specs/patch/*.md`); they belong to other patches. Stage nothing else: no `git add -A`, and never `next-env.d.ts`, `.ports.env`, `.env*`, `agents/` or `trees/`.

### Step 3: Commit the removal with a Conventional Commit

- `git commit -m "chore: remove stray playwright snapshots" -m "adw: patch_agent 7a7f315b"`.
- No trailers of any kind (no `Co-Authored-By`, no `Signed-off-by`, no "Generated with"), and never `--no-verify`; let lefthook run prettier, `yarn lint`, `yarn typecheck` and `yarn knip`.
- If the hook fails because of the unstaged working-tree changes, fix the cause under the other patch rather than bypassing the hook.

## Validation

Execute every command to validate the patch is complete with zero regressions.

1. `git ls-files s9.yml s12.yml s13.yml` prints nothing, `ls s9.yml s12.yml s13.yml` reports all three missing, and `git log -1 --format=%B` shows exactly `chore: remove stray playwright snapshots` plus the `adw:` body line, with no trailers.
2. `git diff --stat 661dd53^ HEAD -- s9.yml s12.yml s13.yml` prints nothing (the branch's net diff no longer carries the snapshots).
3. `yarn lint && yarn typecheck && yarn knip && yarn format:check`
4. `yarn test`
5. `yarn build`

## Patch Scope

**Lines of code to change:** 1075 lines deleted across 3 non-code files; 0 source lines.
**Risk level:** low
**Testing required:** Confirm the files are gone and the commit message is conventional; run the profile's lint, typecheck, knip, format, unit and build checks to show no regression.
