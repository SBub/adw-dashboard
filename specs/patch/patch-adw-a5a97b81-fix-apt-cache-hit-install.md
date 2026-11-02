# Patch: Make the restored apt cache install offline with dpkg

## Metadata

adw_id: `a5a97b81`
review_change_request: `Issue #1: The cache-hit path, which is the whole point of the chore, fails. On run 40580977947 (HEAD 52f5bb0), Restore Playwright system packages logged Cache restored from key: playwright-apt-v1-ubuntu24-20261026.354.1-1.64.0. Then Install Playwright system packages from cache (sudo apt-get install -y --no-install-recommends --no-download "$HOME"/.cache/playwright-apt/*.deb) printed E: Unable to fetch some archives, maybe run apt-get update or try with --fix-missing? and exited 100. Every later step was skipped. Resolution: fix the hit step in .github/workflows/ci.yml so a restored apt cache installs offline; first find out which archive apt wants; options: dpkg -i the whole set, a local file: apt repository, or capture every package apt touched on the miss path. Keep the no-silent-fallback rule, bump v1 to v2 in both keys, get one green miss and one green hit with no Fetched ... MB, both steps under 60 s and 160 passed; update app_docs/ci.md if the mechanism changes. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-246-adw-a5a97b81-sdlc_planner-cache-playwright-ci-deps.md`
**Issue:** On a cache hit, `apt-get install --no-download <cached .debs>` resolves against the fresh runner's own (older) package lists, not the lists the miss run fetched with `apt-get update`, and decides it needs at least one archive that is not in the cache, so it exits 100 and the rest of the job is skipped. The miss run (`40577610700`) installed `0 upgraded, 181 newly installed`, so the cache should hold the full set; the gap is in apt's resolution on the hit, not in what was saved.
**Solution:** Install the cached set with `sudo dpkg -i "$HOME"/.cache/playwright-apt/*.deb`. dpkg reads only the files given, orders unpack and configure inside one call, never touches the network and fails loudly if a dependency is missing, which keeps the no-silent-fallback rule. Confirm it once against the existing `v1` entry (with apt's wanted URIs printed for the record), then bump both keys to `v2` and verify one miss and one hit.

## Files to Modify

Use these files to implement the patch:

- `.github/workflows/ci.yml`: the `run:` of `Install Playwright system packages from cache` (line 58), the bust comment (line 49) and `v1` to `v2` in the two restore `key:` lines (lines 55 and 80).
- `app_docs/ci.md`: the key table (`v1` to `v2`), the `v1` segment bullet, the hit paragraph (dpkg instead of `apt-get install --no-download`), the `### When they miss` bullet and `### How to bust` (`v2` to `v3`).
- Not committed: `agents/a5a97b81/ci_verification/run-<id>.log` evidence files.

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

Shared helpers (`B=chore/issue-246-adw-a5a97b81-ci-cache-playwright-system-deps`, PR #251):

- Run of a pushed commit: `gh run list --branch $B --commit $(git rev-parse HEAD) --json databaseId --jq '.[0].databaseId'` (retry until it appears); wait with `gh run watch <id> --exit-status`; a failure is read with `gh run view <id> --log-failed`. Never `gh run rerun`.
- Durations: `gh run view <id> --json jobs --jq '.jobs[] | select(.name=="check") | .steps[] | "\(.name)\t\(.conclusion)\t\(.startedAt)\t\(.completedAt)"'`.
- Evidence: `mkdir -p agents/a5a97b81/ci_verification && gh run view <id> --log | grep -E "Cache restored|Cache not found|Cache saved|Fetched .* MB|Downloading (Chrome|Chromium|WebKit)|dpkg: (error|dependency)|^'http|[0-9]+ passed" > agents/a5a97b81/ci_verification/run-<id>.log`.
- Commits: `fix:` or `docs:`, body line `adw: patch_agent a5a97b81`, no trailers, hooks never bypassed.

### Step 1: Switch the hit step to dpkg and check it against the v1 entry

- In `.github/workflows/ci.yml` replace the `run:` of `Install Playwright system packages from cache` with a block:
  ```yaml
  run: |
    sudo apt-get install --print-uris -y --no-install-recommends "$HOME"/.cache/playwright-apt/*.deb | grep "^'" || true
    sudo dpkg -i "$HOME"/.cache/playwright-apt/*.deb
  ```
  The first line is diagnostic only for this run: `--print-uris` downloads nothing and lists the archives apt wanted but could not find. Keep the keys at `v1` so the run restores the entry that failed.
- `yarn format:check`, commit `fix: install cached Playwright system packages with dpkg`, `git push`, wait for the run.
- Record the printed URIs (the archive apt wanted) in the evidence file. Expected: the `v1` restore hits, `dpkg -i` exits 0, the browser restore hits, `yarn test:e2e` reports `160 passed`.
- If `dpkg -i` instead reports `dependency problems` for a package not in the cache, the saved set is incomplete: do not continue to Step 2 as written. Change the miss path to save every package from `yarn playwright install-deps --dry-run chromium webkit` plus their resolved dependencies (`apt-get install --download-only --reinstall` into the cache dir right after install-deps) and keep `dpkg -i` on the hit; then go on with Step 2.

### Step 2: Drop the diagnostic, bump the keys to v2

- In `ci.yml` remove the `--print-uris` line, so the hit step is the single line `run: sudo dpkg -i "$HOME"/.cache/playwright-apt/*.deb`.
- Change `playwright-apt-v1-` to `playwright-apt-v2-` (line 55) and `playwright-browsers-v1-` to `playwright-browsers-v2-` (line 80); change the comment on line 49 to `# No restore-keys: only an exact key hit is a hit. Bump v2 to bust.`

### Step 3: Update app_docs/ci.md

- Key table: `playwright-apt-v2-...` and `playwright-browsers-v2-...`; bullet `- \`v1\`: the manual bust.`becomes`v2`; `### When they miss`bullet`A bumped \`v1\`.`becomes`v2`.
- Replace the hit sentence (lines 46 to 48) with: on a hit, `Install Playwright system packages from cache` runs `sudo dpkg -i` on the cached files in one call. dpkg reads only those files and orders them itself: no `apt-get update`, no mirror, no package lists, and a missing dependency is a loud failure instead of a quiet fallback to the network. Add one sentence on why not `apt-get install --no-download`: it resolves against the fresh runner's own package lists, which differ from the lists the miss run fetched, and asked for an archive that was not in the cache.
- `### How to bust`: `Bump \`v2\` to \`v3\` in both keys`; the held-package sentence now says the hit step's `dpkg -i` fails and the fix is the same bump. Leave the Rules section as it is (the no-silent-fallback rule still holds). No em-dashes.
- `yarn format:check`, commit `fix: bump the Playwright cache keys to v2 and document the dpkg install` (the commit hooks run lint, typecheck, knip), `git push`. This run is the v2 miss.
- Confirm on the miss run: both restores log `Cache not found`, `Download Playwright system packages` ran, both save steps ran and logged `Cache saved`, `160 passed`.

### Step 4: Get the v2 hit

- One trivial wording change in `app_docs/ci.md` (for example `### What a hit looks like`: `The log of ... shows no` to `The log of ... has no`), commit `docs: reword the cache hit check in the CI doc`, `git push`.
- Confirm on this run: both restores log `Cache restored from key:` with the `v2` keys, both saves skipped, `Download Playwright system packages` skipped, `Install Playwright system packages from cache` green, no `Fetched ... MB` and no `Downloading Chrome`, `Downloading Chromium` or `Downloading WebKit` anywhere in the log, the hit step plus `yarn playwright install chromium webkit` under 60 s together, `160 passed`.
- If only the apt restore misses because `ImageVersion` changed, that is expected (see `app_docs/ci.md`): note it and push one more trivial wording change for a clean hit.
- Delete the stale entries: `gh cache list --key playwright-apt-v1 --limit 20` and `gh cache list --key playwright-browsers-v1 --limit 20`, then `gh cache delete <key>` for each `v1` entry on this PR's ref.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- The spec's structural check: `node -e "const y=require('yaml');const f=require('fs').readFileSync('.github/workflows/ci.yml','utf8');const s=y.parse(f).jobs.check.steps;const t=JSON.stringify(s);if(t.includes('--with-deps'))throw 'with-deps still present';const c=s.filter(x=>/^actions\/cache\/(restore|save)@v4$/.test(x.uses||''));if(c.length!==4)throw 'expected 4 cache restore/save steps';if(c.some(x=>x.with&&x.with['restore-keys']))throw 'restore-keys on a Playwright cache';for(const id of ['playwright-apt','playwright-browsers']){const k=s.find(x=>x.id===id).with.key;if(!k.includes('steps.playwright.outputs.version'))throw id+' key lacks version'}if(!s.find(x=>x.id==='playwright-apt').with.key.includes('outputs.image'))throw 'apt key lacks image';console.log('ci.yml ok')"`, plus `grep -c 'v2-' .github/workflows/ci.yml` is 2, `grep -n 'print-uris\|--no-download' .github/workflows/ci.yml` is empty and `grep -n 'dpkg -i' .github/workflows/ci.yml` has one line.
- `grep -n $'\xe2\x80\x94' .github/workflows/ci.yml app_docs/ci.md specs/patch/patch-adw-a5a97b81-fix-apt-cache-hit-install.md && exit 1 || true`
- `yarn format:check && yarn lint && yarn typecheck && yarn knip && yarn test`
- `yarn build && yarn check:og`, then `PORT=<PORT from .ports.env> yarn test:e2e` (never `CI=1`); no app code changed, so this must stay green as before.
- `gh run list --branch chore/issue-246-adw-a5a97b81-ci-cache-playwright-system-deps --limit 3`: the Step 1, v2 miss and v2 hit runs are green with the evidence above in `agents/a5a97b81/ci_verification/`.

## Patch Scope

**Lines of code to change:** about 4 lines in `ci.yml`, about 8 lines in `app_docs/ci.md`.
**Risk level:** medium (the fix is proven only by CI runs on a GitHub runner, not locally)
**Testing required:** three CI runs on PR #251 (dpkg against the v1 entry, v2 miss, v2 hit) with log and duration evidence; local hooks on each commit.
