# Patch: Finish step 6, the cache-hit run, the probe check and the PR body

## Metadata

adw_id: `a5a97b81`
review_change_request: `Issue #1: Spec step 6 and the issue's Verification section are only partly done. Run 1 (cache miss, run 40577610700 on 7c7c472) passed and saved both caches. But Run 2 (cache hit) has not happened: gh run list shows no run after 7c7c472. So these criteria are unverified: no Fetched ... MB, no Downloading Chrome, both steps under 1 minute, and e2e count on a hit. The negative check (a probe commit adding -probe to the version segment of both keys, showing both restores miss, then a git revert) was also not done. PR #251's body still says 'This PR currently contains the implementation plan only' and has no step durations, which step 6 asks to paste. Resolution: No code change is needed on this branch. The work is to finish step 6. (1) Push a trivial wording fix to app_docs/ci.md and confirm both restores hit, no Fetched ... MB and no Downloading Chrome/WebKit, the two steps under 1 minute together, yarn test:e2e reports 160 passed. (2) Push a probe commit that appends -probe after ${{ steps.playwright.outputs.version }} in both keys, confirm both restores log Cache not found and the downloads run again, then git revert it and gh cache delete the two ...-1.64.0-probe keys. (3) Update the PR #251 body with run 1's durations (Download Playwright system packages 30 s, browser install 13 s, both saves ran, 160 passed), run 2's durations and the probe result; tick the checklist and record that actions/cache/restore@v4 and actions/cache/save@v4 use the already-verified v4 tag (latest v4.3.0). Never use gh run rerun. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-246-adw-a5a97b81-sdlc_planner-cache-playwright-ci-deps.md`
**Issue:** Step 6 stopped after run 1 (miss, run `40577610700` on `7c7c472`). There is no cache-hit run, no probe run, and PR #251's body still describes a plan-only branch with an unticked checklist and no durations.
**Solution:** No workflow or app change. Push one wording fix to `app_docs/ci.md` (run 2, must hit), push a probe commit on both keys (run 3, must miss), revert it (run 4, must hit again), delete the probe cache entries, then rewrite the PR body with the measured evidence. Existing cache entries on the PR ref: `playwright-apt-v1-ubuntu24-20261026.354.1-1.64.0` and `playwright-browsers-v1-X64-ubuntu24-1.64.0`.

## Files to Modify

Use these files to implement the patch:

- `app_docs/ci.md`: one wording change (run 2 trigger), kept in the final diff.
- `.github/workflows/ci.yml`: probe edit to the two `key:` lines, reverted in the next commit, so the final diff is unchanged.
- PR #251 body (through `gh pr edit`, not a file in the repository).
- Not committed: `agents/a5a97b81/ci_verification/run-<id>.log` for each run's grepped log lines.

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

Shared helpers for every run below (`B=chore/issue-246-adw-a5a97b81-ci-cache-playwright-system-deps`):

- Find the run of a pushed commit: `gh run list --branch $B --commit $(git rev-parse HEAD) --json databaseId,status --jq '.[0].databaseId'` (retry for a few seconds until it appears).
- Wait for it: `gh run watch <id> --exit-status`. A failure is investigated with `gh run view <id> --log-failed`, never `gh run rerun`.
- Step durations: `gh run view <id> --json jobs --jq '.jobs[] | select(.name=="check") | .steps[] | "\(.name)\t\(.conclusion)\t\(.startedAt)\t\(.completedAt)"'`.
- Evidence: `mkdir -p agents/a5a97b81/ci_verification` and `gh run view <id> --log | grep -E "Cache restored|Cache not found|Cache saved|Fetched .* MB|Downloading (Chrome|Chromium|WebKit)|[0-9]+ passed" > agents/a5a97b81/ci_verification/run-<id>.log`.
- Commits are conventional, `chore:` or `docs:`, body line `adw: patch_agent a5a97b81`, no trailers, hooks never bypassed.

### Step 1: Run 2, the cache hit

- In `app_docs/ci.md`, under `### When they miss`, change `A miss downloads once and saves immediately.` to `A miss downloads once and saves right away.` (no em-dash, nothing else). `yarn format:check`.
- `git commit -am "docs: reword the cache miss line in the CI doc"` with the body line, then `git push`.
- When the run is green, confirm from the evidence file and durations:
  - `Restore Playwright system packages` and `Restore Playwright browsers` log `Cache restored from key:` with the two keys above, and both save steps are `skipped`.
  - `Install Playwright system packages from cache` ran (`Download Playwright system packages` skipped); no `Fetched ... MB` and no `Downloading Chrome`, `Downloading Chromium` or `Downloading WebKit` anywhere in the log.
  - `Install Playwright system packages from cache` plus `yarn playwright install chromium webkit` take under 60 s together.
  - `yarn test:e2e` reports `160 passed`, same as run 1.
- If only the apt restore misses and the new key's `ImageVersion` differs from `20261026.354.1`, the runner image changed (expected behaviour, see `app_docs/ci.md`): note it, let that run save, and push one more trivial wording fix to get a clean hit. Any other miss is a defect: stop and investigate.

### Step 2: Run 3, the probe miss

- In `.github/workflows/ci.yml` change the two `key:` lines to end in `${{ steps.playwright.outputs.version }}-probe` (the `playwright-apt` and `playwright-browsers` restore steps only; the save steps use `cache-primary-key` and follow).
- `git commit -am "chore: probe the Playwright cache keys"` with the body line, `git push`.
- When green, confirm: both restores log `Cache not found for input keys: ...-1.64.0-probe`, `Download Playwright system packages` ran and the log has `Fetched ... MB`, the browser install logs `Downloading Chrom...` and `Downloading WebKit`, both save steps ran, `160 passed`. Note the two step durations.

### Step 3: Revert the probe and clean its caches

- `git revert --no-commit HEAD && git commit -m "chore: revert the Playwright cache key probe"` with the body line, `git push`. `git diff 7c7c472 -- .github/workflows/ci.yml` must be empty.
- `gh cache list --key playwright --limit 20`, then `gh cache delete <key>` for exactly the two entries ending `-1.64.0-probe`; re-list to confirm only the non-probe entries remain.
- Wait for run 4 (on the revert) and confirm both restores hit the original keys again and `160 passed`.

### Step 4: Rewrite the PR #251 body

- Write the body to `agents/a5a97b81/ci_verification/pr-body.md` and apply it with `gh pr edit 251 --body-file agents/a5a97b81/ci_verification/pr-body.md`. Keep Summary (correct "from `yarn.lock`" to "from `yarn playwright --version`"), Out of scope, `Closes #246` and `ADW tracking ID: a5a97b81`; no "Generated with" line, no em-dashes.
- Replace "Current state of this branch" with `## What changed` (two restore/save cache pairs, keys, `--with-deps` removed, `app_docs/ci.md`) and `## CI verification`, a table per run: run 1 `40577610700` on `7c7c472` (miss: Download Playwright system packages 30 s, browser install 13 s, both saves ran, 160 passed); run 2 (hit: the two durations, total under 1 minute, no `Fetched` / `Downloading`, 160 passed); run 3 probe (both `Cache not found`, durations, downloads ran); run 4 after revert (hit again); probe caches deleted.
- Add: `actions/cache/restore@v4` and `actions/cache/save@v4` use the `v4` tag, already verified with `gh api repos/actions/cache/releases` (latest v4.3.0).
- Tick every checklist item.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `git diff 7c7c472 --stat`: only `app_docs/ci.md` (one line) and this patch plan; `.github/workflows/ci.yml` unchanged.
- The spec's structural check: `node -e "const y=require('yaml');const f=require('fs').readFileSync('.github/workflows/ci.yml','utf8');const s=y.parse(f).jobs.check.steps;const t=JSON.stringify(s);if(t.includes('--with-deps'))throw 'with-deps still present';const c=s.filter(x=>/^actions\/cache\/(restore|save)@v4$/.test(x.uses||''));if(c.length!==4)throw 'expected 4 cache restore/save steps';if(c.some(x=>x.with&&x.with['restore-keys']))throw 'restore-keys on a Playwright cache';for(const id of ['playwright-apt','playwright-browsers']){const k=s.find(x=>x.id===id).with.key;if(!k.includes('steps.playwright.outputs.version'))throw id+' key lacks version'}if(!s.find(x=>x.id==='playwright-apt').with.key.includes('outputs.image'))throw 'apt key lacks image';console.log('ci.yml ok')"` and `grep -n $'\xe2\x80\x94' app_docs/ci.md specs/patch/patch-adw-a5a97b81-finish-ci-cache-verification.md && exit 1 || true`.
- `yarn format:check && yarn lint && yarn typecheck && yarn knip && yarn test` (the commit and push hooks run these too).
- `gh cache list --key playwright` shows no `-probe` key; `gh pr view 251 --json body --jq .body` has no "implementation plan only", has the four runs and a fully ticked checklist.
- `gh run list --branch chore/issue-246-adw-a5a97b81-ci-cache-playwright-system-deps --limit 4` shows runs 2 to 4 green; `yarn build`, `yarn check:og` and `PORT=9202 yarn test:e2e` are covered by those CI runs (no app code changed).

## Patch Scope

**Lines of code to change:** 1 line in `app_docs/ci.md` kept; 2 lines in `ci.yml` added then reverted; PR body rewritten.
**Risk level:** low
**Testing required:** three CI runs on PR #251 (hit, probe miss, hit after revert) with log and duration evidence; local hooks on each commit.
