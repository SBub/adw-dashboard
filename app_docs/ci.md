# CI

**Specifications:**

- specs/issue-246-adw-a5a97b81-sdlc_planner-cache-playwright-ci-deps.md

## Overview

`.github/workflows/ci.yml` has one job, `check`, on pull requests and pushes to `develop` and
`master`. It runs the same checks as the ADW test phase in the same order: `yarn format:check`,
`yarn lint`, `yarn typecheck`, `yarn knip`, `yarn test`, `yarn build`, `yarn check:og`, then the
Playwright suite `yarn test:e2e` with `CI` set (so the web server is `yarn start`, see
`playwright.config.ts`). Yarn's package cache is restored by `actions/cache@v4`, keyed on
`yarn.lock`. `.github/workflows/release.yml` runs after a successful `check` on a push to
`master` and is documented in `app_docs/changelog.md`, Release workflow.

## How it works

### Playwright caches

Before `yarn test:e2e` the job restores two caches, each with `actions/cache/restore@v4` and, on a
miss, saves it right away with `actions/cache/save@v4`, so a later failing step does not lose it.

| cache          | key                                                               | path                      |
| -------------- | ----------------------------------------------------------------- | ------------------------- |
| system library | `playwright-apt-v2-<ImageOS>-<ImageVersion>-<playwright version>` | `~/.cache/playwright-apt` |
| browsers       | `playwright-browsers-v2-<arch>-<ImageOS>-<playwright version>`    | `~/.cache/ms-playwright`  |

The apt cache holds the `.deb` files of Chromium's and WebKit's system libraries. The browser cache
holds both browser builds.

Where each segment comes from:

- `<playwright version>`: `yarn playwright --version` (prints `Version 1.64.0`). It is the same
  binary that runs `install-deps` and `install`, so the key always names the Playwright that filled
  the cache. `yarn.lock` is not grepped: it holds two Playwright versions (the pinned one and the
  alpha `@playwright/mcp` pulls in).
- `<ImageOS>` and `<ImageVersion>`: the runner's environment variables. They are not in the `env`
  context (`${{ env.ImageOS }}` is empty), so the `Playwright cache keys` step reads them in a
  shell and passes them on as step outputs. It fails the job if any segment is empty.
- `<arch>`: `runner.arch`.
- `v2`: the manual bust.

On a miss, `Download Playwright system packages` empties `/var/cache/apt/archives`, tells apt to
keep downloaded packages, runs `yarn playwright install-deps chromium webkit` and copies the
downloaded `.deb` files into the cache path. If nothing was downloaded the `cp` glob fails, so an
empty cache is never saved. On a hit, `Install Playwright system packages from cache` runs
`sudo dpkg -i` on the cached files in one call. dpkg reads only those files and orders them itself:
no `apt-get update`, no mirror, no package lists, and a missing dependency is a loud failure instead
of a quiet fallback to the network. It is not `apt-get install --no-download`: apt resolves against
the fresh runner's own package lists, which differ from the lists the miss run fetched, and asked
for archives that were not in the cache.

`yarn playwright install chromium webkit` (without `--with-deps`) then runs in both cases; on a
browser cache hit it finds both browsers already present and downloads nothing.

### When they miss

- A Playwright upgrade (`@playwright/test` in `package.json` and `yarn.lock`): both miss.
- A new runner image (GitHub refreshes `ubuntu-latest` roughly weekly): only the apt cache misses,
  since only it depends on `ImageVersion`. A new Ubuntu release changes `ImageOS` and misses both.
- A bumped `v2`.

A miss downloads once and saves right away.

### Cache scope

Caches saved on a pull request's ref are visible only to that pull request; caches saved on
`develop` or `master` are visible to every pull request against them. The first run of a new pull
request hits whatever `develop` saved; the first run after an upgrade misses. GitHub evicts caches
unused for 7 days and caps a repository at 10 GB; the two Playwright caches are roughly 120 MB
(debs) and 400 MB (browsers) per key.

### How to bust

Bump `v2` to `v3` in both keys in `ci.yml`, or delete the entries with `gh cache list` and
`gh cache delete <key>`. If a runner image ever refuses the cached `.deb` files (for example a held
package), the hit step's `dpkg -i` fails; the fix is the same bump, which refills from the mirror
once.

### What a hit looks like

The log of `Install Playwright system packages from cache` and of the browser install has no
`Fetched ... MB` line from the Ubuntu mirrors, and no `Downloading Chrome` or `Downloading WebKit`.

## Rules

- Never add `restore-keys` to either Playwright cache: only an exact key may restore browsers or
  packages.
- Every Playwright cache key contains the Playwright version from `yarn playwright --version`; the
  apt key also contains `ImageOS` and `ImageVersion`. Never hardcode the version in a key.
- Do not add `--with-deps` back to `yarn playwright install`; system packages come only from the
  apt cache steps.
- Do not add a silent mirror fallback to the cache hit step.
- The suite in CI runs the same projects as `playwright.config.ts` declares (Chromium, plus WebKit
  for the minimap spec); do not narrow the browsers in CI to speed it up.
- Pin every action to a released tag verified with `gh api repos/<owner>/<repo>/releases`; do not
  use `gh run rerun` to get past a slow or failing step.
