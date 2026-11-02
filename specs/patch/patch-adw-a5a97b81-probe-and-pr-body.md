# Patch: Run the cache key probe, commit the patch plans and rewrite the PR body

## Metadata

adw_id: `a5a97b81`
review_change_request: `Issue #2: Spec step 6 and the patch plan (specs/patch/patch-adw-a5a97b81-finish-ci-cache-verification.md) are still unfinished apart from the hit failure. (a) The negative check never happened: the branch has no probe commit and no revert, and gh run list shows only 4 runs (6976698, 7c7c472, 1884524, 52f5bb0). (b) PR #251's body still says 'This PR currently contains the implementation plan only', still says the version comes 'from yarn.lock', has 8 unticked checklist items and no step durations. Step 6 asks for durations to be pasted in the PR. (c) The patch plan file is untracked. It changes two wording lines in app_docs/ci.md (1884524, 52f5bb0) instead of one, which is harmless. The probe criterion is unverified. Resolution: After issue 1 is fixed and a clean hit run is green: push the probe commit (append -probe after ${{ steps.playwright.outputs.version }} in both restore key: lines). Confirm both restores log Cache not found, the downloads run and the job is green. git revert it, then gh cache delete the two -probe entries and the broken v1 apt entry if keys were bumped. Rewrite PR #251's body with each run's ID, step durations, cache logs and test counts (runs so far: 40577610700 miss 30 s apt and 13 s browsers, 160 passed; 40579945705 apt miss on image 20261023.334.3 and browser hit, 160 passed; 40580977947 apt hit failed). Fix the 'from yarn.lock' wording and tick the checklist. Never use gh run rerun. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-246-adw-a5a97b81-sdlc_planner-cache-playwright-ci-deps.md`
**Issue:** The negative check (probe commit, miss, revert) was never run, the two patch plans in `specs/patch/` are untracked, and PR #251's body still describes a plan-only branch with the wrong version source, no durations and an unticked checklist.
**Solution:** Issue 1 is already fixed and its precondition holds: run `40586070936` on `dcf2ffb` is a clean `v2` hit (both restores `Cache restored from key:`, hit step 12 s plus browser install 1 s, no `Fetched ... MB`, no `Downloading Chrome`/`WebKit`, `160 passed`). No `v1` entry is left (`gh cache list --key playwright` shows only three `v2` entries). So: commit the patch plans, push the probe, revert it, delete the two `-probe` entries, rewrite the PR body from the measured runs. No workflow or app change survives in the final diff.

## Files to Modify

Use these files to implement the patch:

- `specs/patch/patch-adw-a5a97b81-finish-ci-cache-verification.md`, `specs/patch/patch-adw-a5a97b81-fix-apt-cache-hit-install.md` and this plan: committed as they are.
- `.github/workflows/ci.yml`: lines 55 and 80 (the two restore `key:` lines) get `-probe`, reverted in the next commit, so the final diff is unchanged.
- PR #251 body, through `gh pr edit` (not a repository file).
- Not committed: `agents/a5a97b81/ci_verification/run-<id>.log` and `pr-body.md`.

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

Shared helpers (`B=chore/issue-246-adw-a5a97b81-ci-cache-playwright-system-deps`):

- Run of a pushed commit: `gh run list --branch $B --commit $(git rev-parse HEAD) --json databaseId --jq '.[0].databaseId'` (retry until it appears); wait with `gh run watch <id> --exit-status`; a failure is read with `gh run view <id> --log-failed`. Never `gh run rerun`.
- Durations: `gh run view <id> --json jobs --jq '.jobs[] | select(.name=="check") | .steps[] | "\(.name)\t\(.conclusion)\t\(.startedAt)\t\(.completedAt)"'`.
- Evidence: `mkdir -p agents/a5a97b81/ci_verification && gh run view <id> --log | grep -E "Cache restored from key|Cache not found|Cache saved with key|Fetched .* MB|Downloading (Chrome|Chromium|WebKit)|[0-9]+ passed \(" > agents/a5a97b81/ci_verification/run-<id>.log`.
- Commits: `chore:`, body line `adw: patch_agent a5a97b81`, no trailers, hooks never bypassed.

### Step 1: Commit the patch plans

- `git add specs/patch/patch-adw-a5a97b81-finish-ci-cache-verification.md specs/patch/patch-adw-a5a97b81-fix-apt-cache-hit-install.md specs/patch/patch-adw-a5a97b81-probe-and-pr-body.md`, commit `chore: add the patch plans for the CI cache verification`, `git push`.
- Wait for the run; it must be another `v2` hit (both `Cache restored from key:`, `160 passed`). Save its evidence and durations. If only the apt restore misses on a new `ImageVersion`, note it (expected) and continue; anything else is a defect: stop.

### Step 2: Push the probe and confirm the miss

- In `.github/workflows/ci.yml` change only the two restore `key:` lines so each ends `${{ steps.playwright.outputs.version }}-probe` (line 55 `playwright-apt-v2-...`, line 80 `playwright-browsers-v2-...`). The save steps use `cache-primary-key` and follow.
- Commit `chore: probe the Playwright cache keys`, `git push`, wait.
- Confirm from evidence and durations: both restores log `Cache not found for input keys: ...-1.64.0-probe`, `Download Playwright system packages` ran and logged `Fetched ... MB`, the browser install logged `Downloading Chrome` and `Downloading WebKit`, both save steps logged `Cache saved with key: ...-probe`, the job is green with `160 passed`. Note the two install step durations.

### Step 3: Revert the probe and delete its cache entries

- `git revert --no-edit HEAD`, then amend the message to `chore: revert the Playwright cache key probe` with the body line (`git commit --amend -m ... -m "adw: patch_agent a5a97b81"`, hooks run), `git push`. `git diff dcf2ffb -- .github/workflows/ci.yml` must be empty.
- `gh cache list --key playwright --limit 20`, then `gh cache delete <key>` for exactly the two entries ending `-1.64.0-probe`; re-list to confirm none remain. No `v1` entry exists to delete; confirm with `gh cache list --key playwright-apt-v1` and `gh cache list --key playwright-browsers-v1` (both empty) and delete any that appear.
- Wait for the revert run: both restores hit the `v2` keys again, `160 passed`. Save evidence.

### Step 4: Rewrite the PR #251 body

- Write `agents/a5a97b81/ci_verification/pr-body.md`, apply with `gh pr edit 251 --body-file agents/a5a97b81/ci_verification/pr-body.md`. No em-dashes, no "Generated with" line.
- Keep `## Summary`, changing "(from `yarn.lock`)" to "(read with `yarn playwright --version`)". Keep `## Out of scope`, `Closes #246`, `ADW tracking ID: a5a97b81`.
- Replace `## Current state of this branch` with `## What changed`: two `actions/cache/restore@v4` and `actions/cache/save@v4` pairs; keys `playwright-apt-v2-<ImageOS>-<ImageVersion>-<version>` and `playwright-browsers-v2-<arch>-<ImageOS>-<version>`, no `restore-keys`; a miss runs `yarn playwright install-deps chromium webkit` and copies the downloaded `.deb` files; a hit runs `sudo dpkg -i` on them offline (`apt-get install --no-download` failed in `40580977947`); `--with-deps` removed; `app_docs/ci.md` documents keys and busting.
- Add `## CI verification`, one table row per run with run ID, commit, apt result and step duration, browser result and step duration, e2e count:
  - `40577610700` `7c7c472`: v1 miss, Download 30 s, browsers miss 13 s, both saved, 160 passed.
  - `40579945705` `1884524`: apt miss on image `20261023.334.3` (image change), browsers hit, 160 passed.
  - `40580977947` `52f5bb0`: apt hit, `apt-get install --no-download` exited 100 (`Unable to fetch some archives`), job failed.
  - `40582831646` `f4e5d99`: v1 apt hit, dpkg 12 s, browsers hit 1 s, 160 passed.
  - `40583963286` `7d81ab0`: v2 miss on `20261026.354.1`, Download 39 s (`Fetched 114 MB`), browsers miss 13 s, both saved, 160 passed.
  - `40585078524` `40fc6f6`: apt miss on `20261023.334.3` (image change), Download 36 s, browsers hit 0 s, 160 passed.
  - `40586070936` `dcf2ffb`: clean v2 hit, dpkg 12 s plus browsers 1 s (13 s), no `Fetched`, no `Downloading`, 160 passed.
  - The Step 1, probe and revert runs with their measured values; then "`-probe` cache entries deleted".
- Tick all nine checklist items.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `git diff dcf2ffb --stat` lists only the three `specs/patch/` files; `git status --short` is clean apart from gitignored files.
- The spec's structural check: `node -e "const y=require('yaml');const f=require('fs').readFileSync('.github/workflows/ci.yml','utf8');const s=y.parse(f).jobs.check.steps;const t=JSON.stringify(s);if(t.includes('--with-deps'))throw 'with-deps still present';const c=s.filter(x=>/^actions\/cache\/(restore|save)@v4$/.test(x.uses||''));if(c.length!==4)throw 'expected 4 cache restore/save steps';if(c.some(x=>x.with&&x.with['restore-keys']))throw 'restore-keys on a Playwright cache';for(const id of ['playwright-apt','playwright-browsers']){const k=s.find(x=>x.id===id).with.key;if(!k.includes('steps.playwright.outputs.version'))throw id+' key lacks version'}if(!s.find(x=>x.id==='playwright-apt').with.key.includes('outputs.image'))throw 'apt key lacks image';console.log('ci.yml ok')"`, `grep -c probe .github/workflows/ci.yml` is 0, and `grep -n $'\xe2\x80\x94' specs/patch/patch-adw-a5a97b81-*.md agents/a5a97b81/ci_verification/pr-body.md && exit 1 || true`.
- `yarn format:check && yarn lint && yarn typecheck && yarn knip && yarn test` (also run by the commit and push hooks).
- `gh cache list --key playwright --limit 20` has no `-probe` and no `v1` key.
- `gh pr view 251 --json body --jq .body | grep -cE 'implementation plan only|yarn\.lock|- \[ \]'` is 0, and the body lists every run above plus the probe and revert runs; `gh run list --branch chore/issue-246-adw-a5a97b81-ci-cache-playwright-system-deps --limit 3` shows the three new runs green. `yarn build`, `yarn check:og` and `yarn test:e2e` are covered by those CI runs (no app code changed).

## Patch Scope

**Lines of code to change:** 2 lines in `ci.yml` added then reverted (net 0); three plan files committed; PR body rewritten.
**Risk level:** low
**Testing required:** three CI runs on PR #251 (hit after plan commit, probe miss, hit after revert) with log and duration evidence; local hooks on each commit.
