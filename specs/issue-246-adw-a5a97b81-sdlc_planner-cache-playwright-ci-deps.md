# Chore: CI: stop downloading Playwright's system libraries on every run (cache apt packages and browsers on the pinned version)

## Metadata

issue_number: `246`
adw_id: `a5a97b81`
issue_json: `{"number":246,"title":"CI: stop downloading Playwright's system libraries on every run (cache apt packages and browsers on the pinned version)"}`

## Chore Description

The `check` job in `.github/workflows/ci.yml` ends with
`yarn playwright install --with-deps chromium webkit` and no cache. In PR #242's run that step
took 44 min 7 s of a 46 min job: `--with-deps` runs `apt-get update` and `apt-get install` for
Playwright's system libraries (119 MB from `azure.archive.ubuntu.com` at 45 kB/s), while the two
browsers themselves downloaded in 7 s.

Playwright is pinned (`"@playwright/test": "1.64.0"`), so the browser builds and the list of
system packages only change when Playwright is upgraded or the runner image changes. The chore:

1. Cache the downloaded `.deb` files of Playwright's system dependencies, keyed on the Playwright
   version plus the runner image (`ImageOS`, `ImageVersion`). On a hit they are installed from local
   files with no network access to the Ubuntu mirrors and no `apt-get update`.
2. Cache `~/.cache/ms-playwright` on the Playwright version (plus `ImageOS`, since Playwright picks
   its browser build per Ubuntu release). On a hit, `yarn playwright install chromium webkit`
   (without `--with-deps`) finds both browsers present and downloads nothing.
3. Keep both browsers exactly as today: Chromium for every spec, WebKit for
   `post_minimap.spec.ts` only (`playwright.config.ts`, the `projects` array). `playwright.config.ts`
   is not touched.
4. Document the cache keys and how to bust them. `docs/conditional-docs.md` has no CI or testing
   doc today, so a new feature doc `app_docs/ci.md` is created and indexed.

No new third-party action: the caches use `actions/cache/restore@v4` and `actions/cache/save@v4`,
sub-actions of `actions/cache`, the same action and the same `v4` tag the workflow already uses
for the Yarn cache. The `v4` tag was verified to exist (`gh api repos/actions/cache/git/ref/tags/v4`
returns `refs/tags/v4`; latest v4 release `v4.3.0` in `gh api repos/actions/cache/releases`).

## Relevant Files

Use these files to resolve the chore:

- `.github/workflows/ci.yml`: the `check` job. Its `yarn playwright install --with-deps chromium webkit`
  step is the one replaced; the Yarn cache steps above it show the existing `actions/cache@v4` idiom.
- `playwright.config.ts`: read only. Confirms the two projects (chromium for all specs, webkit for
  `post_minimap\.spec\.ts`) and that `CI` switches the web server to `yarn start`. Must not change.
- `package.json`: `"@playwright/test": "1.64.0"` (the pin) and `"test:e2e": "playwright test"`.
- `yarn.lock`: resolves `playwright@npm:1.64.0` and, through `@playwright/mcp`, a second
  `playwright@npm:1.64.0-alpha-2026-09-14`. Because there are two, the key does not grep the lockfile;
  it reads the version from the binary that installs the browsers (see Notes).
- `docs/conditional-docs.md`: the doc index; gets one line for the new `app_docs/ci.md`.
- `README.md`: its Documentation list links every `app_docs/` doc; gets one link for the new doc.
  Its Running it section already says `yarn playwright install chromium webkit` locally; unchanged.
- `.adw/project.md`: read only. Nothing here renames a script, moves a port, adds an env file or
  moves docs, so the profile does not change.
- `AGENTS.md`: rules (no em-dashes, conventional commits, no trailers, hooks not bypassed).

### New Files

- `app_docs/ci.md`: the CI feature doc (the `check` job's steps, the two Playwright caches, their
  keys, when they miss, how to bust them, the rules).

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Replace the Playwright install step in `.github/workflows/ci.yml`

- Remove the single line `- run: yarn playwright install --with-deps chromium webkit`.
- In its place (after `- run: yarn check:og`, before `- run: yarn test:e2e`) add the steps below,
  in this order. Keep the existing two-space style; give each new step a `name` so the log is
  readable.

```yaml
- id: playwright
  name: Playwright cache keys
  run: |
    version="$(yarn playwright --version | awk '{print $2}')"
    test -n "$version" && test -n "$ImageOS" && test -n "$ImageVersion"
    echo "version=$version" >> "$GITHUB_OUTPUT"
    echo "os=$ImageOS" >> "$GITHUB_OUTPUT"
    echo "image=$ImageOS-$ImageVersion" >> "$GITHUB_OUTPUT"
- id: playwright-apt
  name: Restore Playwright system packages
  uses: actions/cache/restore@v4
  with:
    path: ~/.cache/playwright-apt
    key: playwright-apt-v1-${{ steps.playwright.outputs.image }}-${{ steps.playwright.outputs.version }}
- name: Install Playwright system packages from cache
  if: steps.playwright-apt.outputs.cache-hit == 'true'
  run: sudo apt-get install -y --no-install-recommends --no-download "$HOME"/.cache/playwright-apt/*.deb
- name: Download Playwright system packages
  if: steps.playwright-apt.outputs.cache-hit != 'true'
  run: |
    echo 'APT::Keep-Downloaded-Packages "true";' | sudo tee /etc/apt/apt.conf.d/99-keep-debs
    sudo apt-get clean
    yarn playwright install-deps chromium webkit
    mkdir -p ~/.cache/playwright-apt
    cp /var/cache/apt/archives/*.deb ~/.cache/playwright-apt/
- name: Save Playwright system packages
  if: steps.playwright-apt.outputs.cache-hit != 'true'
  uses: actions/cache/save@v4
  with:
    path: ~/.cache/playwright-apt
    key: ${{ steps.playwright-apt.outputs.cache-primary-key }}
- id: playwright-browsers
  name: Restore Playwright browsers
  uses: actions/cache/restore@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-browsers-v1-${{ runner.arch }}-${{ steps.playwright.outputs.os }}-${{ steps.playwright.outputs.version }}
- run: yarn playwright install chromium webkit
- name: Save Playwright browsers
  if: steps.playwright-browsers.outputs.cache-hit != 'true'
  uses: actions/cache/save@v4
  with:
    path: ~/.cache/ms-playwright
    key: ${{ steps.playwright-browsers.outputs.cache-primary-key }}
```

- Why each choice (keep these as short YAML comments where they help a reader, matching the
  sparse comment density of the file):
  - `ImageOS` and `ImageVersion` are runner environment variables, not workflow `env`, so
    `${{ env.ImageOS }}` is empty in an expression. They must be read in a `run` step and passed on
    as step outputs, as above. The `test -n` line fails the job rather than writing a key with an
    empty segment.
  - `yarn playwright --version` prints `Version 1.64.0`; it is the same binary that runs
    `install-deps` and `install`, so the key always names the Playwright that fills the cache.
  - No `restore-keys` on either cache: a prefix fallback could restore packages or browsers of an
    older Playwright or image. Only an exact key hit is a hit.
  - Separate `restore` and `save` (instead of `actions/cache@v4`'s post-job save) so a miss stores
    the cache immediately, even if a later step such as `yarn test:e2e` fails.
  - `apt-get clean` before `install-deps` empties `/var/cache/apt/archives`, so the copied `.deb`
    set is exactly what Playwright's dependencies pulled in. `Keep-Downloaded-Packages` guarantees
    apt does not delete them after installing. If no `.deb` was downloaded, the unmatched glob makes
    `cp` fail: an empty cache is never saved.
  - On a hit, `apt-get install` with local file paths and `--no-download` installs the cached set
    in dependency order and fails loudly instead of quietly falling back to the mirror. There is no
    `apt-get update` on the hit path.
  - `v1` in both keys is the manual bust: bump it to `v2` to force both caches to refill.
- Do not change any other step (Yarn cache, `yarn install`, lint, build, `yarn check:og`,
  `yarn test:e2e`), the job's `env`, or the triggers.

### 2. Create `app_docs/ci.md`

- Model the shape on an existing doc such as `app_docs/radio.md`: a `**Specifications:**` list with
  `specs/issue-246-adw-a5a97b81-sdlc_planner-cache-playwright-ci-deps.md`, then `## Overview`,
  `## How it works`, `## Rules`.
- Overview: `.github/workflows/ci.yml` has one job, `check`, on pull requests and pushes to
  `develop` and `master`; it runs the same checks as the ADW test phase in the same order (format,
  lint, typecheck, knip, unit, build, `check:og`, then the Playwright suite with `CI` set, so the
  web server is `yarn start`).
- How it works, Playwright caches:
  - The two cache keys verbatim:
    `playwright-apt-v1-<ImageOS>-<ImageVersion>-<playwright version>` (path `~/.cache/playwright-apt`,
    the `.deb` files for Chromium's and WebKit's system libraries) and
    `playwright-browsers-v1-<arch>-<ImageOS>-<playwright version>` (path `~/.cache/ms-playwright`).
  - Where each segment comes from (`yarn playwright --version`; the runner's `ImageOS` and
    `ImageVersion` environment variables, read in a shell step because they are not in the `env`
    context).
  - When they miss: a Playwright upgrade (`@playwright/test` in `package.json` and `yarn.lock`), a
    new runner image (GitHub updates `ubuntu-latest` roughly weekly; only the apt cache depends on
    `ImageVersion`), or a bumped `v1`. A miss downloads once and saves immediately.
  - Cache scope: GitHub caches saved on a pull request's ref are visible only to that pull request;
    caches saved on `develop` or `master` are visible to every pull request against them. The first
    run of a new pull request hits whatever `develop` saved; the first run after an upgrade misses.
  - How to bust: bump `v1` to `v2` in both keys in `ci.yml`, or delete the entries with
    `gh cache list` and `gh cache delete <key>`.
  - What a hit looks like in the log: no `Fetched ... MB` line from the Ubuntu mirrors and no
    `Downloading Chrome` or `Downloading WebKit`.
- Rules (each an invariant, written as "never"/"do not"):
  - Never add `restore-keys` to either Playwright cache: only an exact key may restore browsers or
    packages.
  - Every Playwright cache key contains the Playwright version from `yarn playwright --version`;
    the apt key also contains `ImageOS` and `ImageVersion`. Never hardcode the version in a key.
  - Do not add `--with-deps` back to `yarn playwright install`; system packages come only from the
    apt cache steps.
  - The suite in CI runs the same projects as `playwright.config.ts` declares (Chromium, plus WebKit
    for the minimap spec); do not narrow the browsers in CI to speed it up.
  - Pin every action to a released tag verified with `gh api repos/<owner>/<repo>/releases`; do not
    use `gh run rerun` to get past a slow or failing step.
- No em-dashes anywhere in the file.

### 3. Index the new doc

- `docs/conditional-docs.md`: append one line in the existing style, for example
  ``- `app_docs/ci.md`: read when changing `.github/workflows/ci.yml`, a CI step or its order, the Yarn or Playwright caches, their keys or how to bust them; when upgrading `@playwright/test`; when a CI run is slow or downloads browsers or system packages it should have cached.``
- `README.md`: add `- [CI](app_docs/ci.md)` at the end of the Documentation list.

### 4. Check the workflow locally

- Parse the workflow and assert the new shape (command in Validation Commands): YAML parses, the
  old `--with-deps` line is gone, both keys contain `steps.playwright.outputs.version`, neither
  Playwright cache step has `restore-keys`.
- `yarn format` if `yarn format:check` flags the YAML or the Markdown, then re-check.

### 5. Commit and push (build phase)

- One conventional commit, for example `chore: cache Playwright system packages and browsers in CI`,
  no trailers, hooks not bypassed.

### 6. CI verification on the pull request (after the PR exists)

- Run 1 (cache miss): in the `check` job, note the durations of `Download Playwright system
packages` and `yarn playwright install chromium webkit`, and that both save steps ran. Paste them
  in the PR.
- Run 2 (cache hit): push a trivial commit (for example a whitespace-free wording fix in
  `app_docs/ci.md`). The log of `Install Playwright system packages from cache` and the browser
  install shows no `Fetched ... MB` and no `Downloading Chrome`; the two steps together take under
  1 minute. Paste their durations.
- `yarn test:e2e` passes in both runs with the same test count as the last green run on `develop`
  (compare the `N passed` line).
- Negative check: a probe commit appends `-probe` to the version segment of both keys (for
  example `...-${{ steps.playwright.outputs.version }}-probe`); its run shows both restores missing
  and the downloads happening again. Then `git revert` the probe commit so it is not in the final
  diff, and delete the probe's cache entries with `gh cache delete`.
- Never `gh run rerun`. A slow or failed run is investigated, not retried.

### 7. Run the Validation Commands

- Run every command below from the worktree root; all must pass.

## Test Coverage

No test needed: this is a CI configuration change. No layer the profile lists (vitest unit,
`check:og`, the Playwright suite) can execute a GitHub Actions workflow; the behaviour is proven by
the CI runs in task 6 (miss fills both caches, hit downloads nothing, probe key misses) and by the
structural check of `ci.yml` in Validation Commands. The app, its specs and `playwright.config.ts`
are unchanged, and the full suite still runs as the last validation command. No `e2e/*.md` journey
and no review screenshots: nothing rendered changes.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `node -e "const y=require('yaml');const f=require('fs').readFileSync('.github/workflows/ci.yml','utf8');const s=y.parse(f).jobs.check.steps;const t=JSON.stringify(s);if(t.includes('--with-deps'))throw 'with-deps still present';const c=s.filter(x=>/^actions\/cache\/(restore|save)@v4$/.test(x.uses||''));if(c.length!==4)throw 'expected 4 cache restore/save steps';if(c.some(x=>x.with&&x.with['restore-keys']))throw 'restore-keys on a Playwright cache';for(const id of ['playwright-apt','playwright-browsers']){const k=s.find(x=>x.id===id).with.key;if(!k.includes('steps.playwright.outputs.version'))throw id+' key lacks version'}if(!s.find(x=>x.id==='playwright-apt').with.key.includes('outputs.image'))throw 'apt key lacks image';console.log('ci.yml ok')"` : the workflow parses and has the intended shape (no `--with-deps`, four restore/save steps, version and image in the keys, no `restore-keys`).
- `grep -n $'\xe2\x80\x94' .github/workflows/ci.yml app_docs/ci.md docs/conditional-docs.md README.md && exit 1 || true` : no em-dashes in touched files.
- `yarn format:check` : Prettier covers the YAML and Markdown touched here.
- `yarn lint` : unchanged code, required by the profile's test order and the commit hook.
- `yarn typecheck` : required by the commit hook; no TypeScript changes.
- `yarn knip` : required by the commit hook; no new files under its scan paths.
- `yarn test` : unit layer, run on push; must stay green.
- `yarn build` : the profile's build check; confirms nothing else moved.
- `yarn check:og` : runs after the build per the profile's order.
- `PORT=<run port> yarn test:e2e` (port from `.ports.env`, never `CI=1`) : the suite runs exactly as before, same browsers and same specs.

## Notes

- Why not grep `yarn.lock` for the version: the lockfile holds two Playwright versions (`1.64.0`
  and `1.64.0-alpha-2026-09-14` from `@playwright/mcp`). `yarn playwright --version` reports the one
  `yarn playwright install` uses, resolved from `yarn.lock` by `yarn install --immutable`, so it is
  the Playwright version from the lockfile without parsing ambiguity.
- If GitHub's runner ever ships an image where `apt-get install` of local files refuses (for
  example a held package), the hit step fails loudly; the fix is a `v1` to `v2` bump, which refills
  from the mirror once. Do not add a silent mirror fallback.
- The browser cache does not include `ImageVersion` on purpose: the browser builds depend only on
  the Playwright version, the Ubuntu release (`ImageOS`) and the architecture; the weekly image
  refresh then misses only the apt cache.
- GitHub evicts caches unused for 7 days and caps a repository at 10 GB; the two Playwright caches
  are roughly 120 MB (debs) and 400 MB (browsers) per key.
- Out of scope, do not touch: local Supabase for e2e, dropping or moving WebKit, splitting the job
  or sharding specs.
- `.adw/project.md` needs no update: no script renamed, no port, no env file, no docs location
  change.
