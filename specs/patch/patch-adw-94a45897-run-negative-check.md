# Patch: Run the step 9 negative check and save its evidence

## Metadata

adw_id: `94a45897`
review_change_request: `Issue #2: I found no evidence that step 9, the negative check, was performed. That step runs the budget spec against the old app code (git checkout 9c6455b -- src/app/providers.tsx src/data/realtime.ts src/data/supabase.ts src/components/WorkerStatus.tsx) and shows that scenarios 2, 3 and 4 fail with about 15 sockets, about 30 workers reads and 20 sockets. The spec's Test Coverage depends on that check, and the commit history and branch hold no saved output. Without it, the e2e ceilings are only shown to pass. In particular, scenario 3's ceiling was loosened to 5 and scenario 1's to 4, and nothing shows they still fail on the old code. Resolution: run step 9 as the spec describes, with a temporary WIP commit (never a bare git stash), confirm scenarios 2, 3 and 4 fail, restore with git checkout HEAD -- src and git reset --soft HEAD~1, save both outputs under agents/94a45897/. If scenario 3 does not fail at the ceiling of 5, tighten it. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-240-adw-94a45897-sdlc_planner-cut-realtime-request-bursts.md`
**Issue:** Step 9 of the spec (run `e2e/realtime_request_budget.spec.ts` with the fix, then against the four old app files from `9c6455b`) left no trace. The Test Coverage claim "Scenarios 2, 3 and 4 fail against the current code" is unproven, and two ceilings moved after the plan (scenario 3 `workers` to 5, scenario 1 `workers` to 4 in `1cd32b1`).
**Solution:** Run step 9 exactly as written, save both raw outputs under `agents/94a45897/negative_check/` (gitignored, never staged), and record the measured numbers in a short "Negative check results" section of the spec so the pull request, which links the spec, carries them. Tighten the scenario 3 ceiling only if the old code passes it. No app code change.

## Files to Modify

Use these files to implement the patch:

- `specs/issue-240-adw-94a45897-sdlc_planner-cut-realtime-request-bursts.md` (append the results section)
- `e2e/realtime_request_budget.spec.ts` (only if Step 3 finds scenario 3 passing on the old code)
- New, not committed: `agents/94a45897/negative_check/with-fix.txt`, `agents/94a45897/negative_check/without-fix.txt`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

Source the port first in every shell: `set -a; . ./.ports.env; set +a` (`PORT=9201` in this worktree; fall back to 3000 only if the file is absent). The `/prepare_app` server on `$PORT` is reused through `reuseExistingServer`; never set `CI=1`, never touch a server on another port.

### Step 1: Run the budget spec with the fix and save it

- `mkdir -p agents/94a45897/negative_check`
- `PORT=$PORT yarn test:e2e e2e/realtime_request_budget.spec.ts --reporter=list 2>&1 | tee agents/94a45897/negative_check/with-fix.txt`
- All five tests must pass. If one fails, stop and fix that first; the negative check is meaningless against a red baseline.

### Step 2: Put the fix aside and restore the old app code

- The tree holds uncommitted doc edits from the previous patch and the untracked patch plans; the WIP commit carries them. `git add -A && git commit -m "wip: issue 240"` (hooks run, never `--no-verify`; `agents/`, `.ports.env`, `next-env.d.ts` stay out because they are gitignored). Never a bare `git stash`.
- `git checkout 9c6455b -- src/app/providers.tsx src/data/realtime.ts src/data/supabase.ts src/components/WorkerStatus.tsx` (the new `src/lib/request-pacing*.ts` and the e2e spec stay).
- Wait for `next dev` to recompile: `curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/projects` answers 200.

### Step 3: Run the budget spec against the old code and save it

- `PORT=$PORT yarn test:e2e e2e/realtime_request_budget.spec.ts --reporter=list 2>&1 | tee agents/94a45897/negative_check/without-fix.txt` (expect a non-zero exit; that is the point).
- Confirm from the `Received:` lines: scenario 2 ("a socket that drops every 3 s backs off") fails with sockets near 15 (or `project_summaries` near 15), scenario 3 ("visibility flips ...") fails with `workers` near 30 or more, scenario 4 ("twenty one-second visits ...") fails with sockets near 20. Note scenario 1's and 5's outcome as well (informational; the spec does not require them to fail).
- If scenario 3 passes (old `workers` count of 5 or fewer), note the measured count; it is tightened in Step 5.

### Step 4: Restore the fix and drop the WIP commit

- `git checkout HEAD -- src`, then `git status` must be clean.
- `git reset --soft HEAD~1`. `git log -1 --oneline` shows `1cd32b1` again; the doc edits and patch plans are back (staged, which is fine).
- `curl` `/projects` on `$PORT` answers 200 again after the recompile.

### Step 5: Record the results (and tighten scenario 3 only if needed)

- Append to the spec, after `## Notes`, a `## Negative check results` section: the date, the command, a small table per scenario (with fix: pass and the ceiling; without fix: pass or fail and the received count), and the paths of the two raw outputs under `agents/94a45897/negative_check/`. Plain text, no em-dashes.
- Only if Step 3 showed scenario 3 passing on the old code: lower its `toBeLessThanOrEqual(5)` to the smallest ceiling that the fixed code passes and the old code fails, update its comment, then repeat Steps 1 to 4 and refresh both outputs and the table.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `test -s agents/94a45897/negative_check/with-fix.txt && test -s agents/94a45897/negative_check/without-fix.txt`, and `grep -c "✘" agents/94a45897/negative_check/without-fix.txt` reports at least 3 (scenarios 2, 3, 4 failed).
- `git log -1 --oneline` is `1cd32b1` (no WIP commit left) and `git diff HEAD --stat -- src` prints nothing.
- `yarn lint && yarn typecheck && yarn knip && yarn format:check && yarn test`
- `PORT=$PORT yarn test:e2e e2e/realtime_request_budget.spec.ts`: all pass with the fix (again, if the spec changed in Step 5).
- `grep -rnP "\x{2014}" e2e specs/issue-240-adw-94a45897-sdlc_planner-cut-realtime-request-bursts.md specs/patch`: prints nothing.

## Patch Scope

**Lines of code to change:** about 20 lines of spec text; 0 to 3 lines in the e2e spec only if scenario 3 must be tightened
**Risk level:** low
**Testing required:** the budget spec twice (with and without the fix), then the commit hooks' checks; the WIP commit must be fully undone before anything is committed
