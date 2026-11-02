# Changelog

**Specifications:**

- specs/issue-173-adw-3fe1f775-sdlc_planner-production-changelog-backfill.md
- specs/issue-248-adw-35167e14-sdlc_planner-release-automation.md

## Overview

`/projects/changelog` (`src/app/(dashboard)/projects/changelog/page.tsx`) lists every production
push newest first, each with its date, its title linking to the entry, its stats strip and its
counts label. `/projects/changelog/[id]` (`src/app/(dashboard)/projects/changelog/[id]/page.tsx`)
renders one entry: date, title, the stats strip, the description and the Features, Fixes and Chores
lists (or Reverted). Both sit inside `(dashboard)`, so they have the sidebar, the
pill and the worker widget; both are static, prerendered from the registry. Entries are MDX modules
under `src/content/changelog/`, read through `src/lib/changelog.ts`.

## How it works

### What an entry is

One entry per merged pull request into `master`. Its file name and id are `<YYYY-MM-DD>-pr<N>`,
with the UTC merge date (`utcDate` and `entryId` in `src/lib/changelog-backfill.ts`). An entry
exports `meta = { date, pr, title, kind, counts, stats }`, with `kind` `"release"` or `"revert"`,
`counts` `{ features, fixes, chores }` and `stats` `{ additions, deletions, commits, files,
comments }`. `parseChangelogMeta` (`src/lib/changelog.ts`) checks each field (every count and stat a
non-negative integer) and that the id equals `entryId(date, pr)`, and throws an error naming the
entry and the field, so a bad entry fails `yarn build`.

### What an entry says

The title is a short sentence-case name for what the release is about for someone using the site
(no date, no "promote"). The description under the meta is one to three short sentences on what
changed for a visitor. Each line under Features, Fixes and Chores is one sentence-case sentence on
what that pull request changed, followed by its issue and pull request links. The owner writes the
title, the description and the lines from the diff of the release and of each pull request (`gh pr
diff <N>`), never from a pull request body or title, and edits them by hand. They never carry
internal notes: incidents, environment or secrets, migration internals. A revert says what was taken
back and why. A date written in text is DD.MM.YYYY; a rendered date goes through `formatDay`.

`stats` is the production pull request's size as GitHub reported it when the entry was written:
`additions`, `deletions`, `commits` and `changed_files` from `gh api
repos/SBub/adw-dashboard/pulls/<N>`, and `comments` as its `comments` plus `review_comments`
(`pullStats` in `src/lib/changelog-backfill.ts`). It is committed with the entry; the site never
calls GitHub.

### The stats strip

`ChangelogStats` (`src/components/ChangelogStats.tsx`, server only) renders under the title on the
entry page and on each index card, in two wrapping rows with small inline SVG icons: the pull
request as `#N` linking to it (accessible name "Production pull request #N"), the diff as `+N` in
green and `−N` (a real minus sign) in red, labelled "N lines added, N removed"; then "N commits",
"N files" and "N comments". The green and red are `STATUS_COLORS.running.text` and
`STATUS_COLORS.failed.text`, so the status hue guard needs no exemption. It fits 375px.

`sortChangelogNewestFirst` orders by date descending, then by pull request descending. The index's
label comes from `changelogCountsLabel`: "N features, N fixes, N chores", "Branch sync" when all
three are 0, "Revert" for a revert. `getChangelogEntry` rejects an id that fails `isChangelogId` or
is not in the registry before importing any module.

### How a draft is generated

```sh
git fetch origin master develop
node scripts/backfill-changelog.ts
yarn format
```

The script lists the merged pull requests into `master` with `gh`. For each merge commit `M` it
reads `git log --first-parent M^2 ^M^1` and keeps the `Merge pull request #N` subjects: the develop
pull requests that first reached `master` with that push. `parsePrTitle` splits each develop title:
the conventional prefix (optional scope and `!`), then a leading `#N - `, which is stripped and
becomes the issue link; the rest is kept verbatim. `sectionForPrefix` maps `feat` to Features, `fix`
and `bug` to Fixes and anything else (including no prefix) to Chores. Each list is ordered by pull
request number, and each line links its issue and its pull request.

For each new entry it reads the production pull request's stats with `gh api` (`pullStats`). What it
writes is a draft: the title and the lines are the pull request titles and there is no description.
The owner rewrites the title and the lines and writes the description from the diff before
committing (see What an entry says). A production pull request titled `revert:` becomes a `revert` entry with a `## Reverted`
line naming the reverted issue and pull request (`parseRevert`). A release with no develop pull
requests gets the line "No new pull requests; branch sync." and zero counts.

The script is incremental: it drafts only the production pull requests that have no `.mdx` yet,
and checks merge commits and calls `gh api` for stats only for those. It never overwrites: each
file is written with the `wx` flag. It rewrites `src/content/changelog/index.ts` from the folder and
`PRODUCTION_PRS` in `src/content/changelog/registry.test.ts` with every production pull request.
When nothing is missing it prints `No production pull request without an entry; nothing to draft.`
and exits 0. It still stops on a missing merge commit and on an em-dash in an entry.
`scripts/release.ts` runs it for the release workflow.

### Release workflow

`.github/workflows/release.yml` runs on `workflow_run` after a successful `ci` on a push to
`master` (a pull request into `master`, or a failed CI, never releases), and on
`workflow_dispatch`. One run at a time (`concurrency: release`). It runs `node scripts/release.ts`
for the merge commit: the CI run's `head_sha`, or the dispatch's `sha` (default `master`'s head).

The tag is the annotated tag `release-<entry id>` (`release-<YYYY-MM-DD>-pr<N>`, `releaseTag` in
`src/lib/release.ts`) on the production pull request's merge commit. It is never moved or
overwritten: a tag on another commit stops the run.

The GitHub Release for that tag has notes listing the develop pull requests it shipped, grouped
Features, Fixes and Chores by `groupPullRequests` and `sectionForPrefix`, the same code as the
draft.

The draft pull request, `chore: changelog draft for release-<id>`, goes from the branch
`changelog/release-<id>` into `develop`. It carries what `scripts/backfill-changelog.ts` drafted,
formatted, plus `index.ts` and `PRODUCTION_PRS`. The owner rewrites the title, description and
lines (see What an entry says) before merging; `registry.test.ts` fails on the unedited draft. It
is never merged automatically. CI does not run on it until the owner pushes to it, because pull
requests opened with `GITHUB_TOKEN` trigger no workflows.

The last step creates the PostHog release annotation; see `app_docs/analytics.md`, Release
markers.

Dry run: `workflow_dispatch` with `dry_run` (default true) and an optional `sha` prints the tag,
the notes and the draft diff and creates nothing. The local equivalent:

```sh
git fetch origin master develop --tags
node scripts/release.ts --sha <sha> --dry-run
```

Rerun: every step checks GitHub first and reports `already released` when its artefact exists, so
a rerun is a no-op. After a failure, fix the cause and dispatch with the `sha`; never
`gh run rerun`.

Repository setting (one time, by the owner): `GITHUB_TOKEN` can open the draft pull request only
with "Allow GitHub Actions to create and approve pull requests" on (Settings > Actions > General;
`can_approve_pull_request_reviews` in `gh api repos/SBub/adw-dashboard/actions/permissions/workflow`,
set with `gh api -X PUT repos/SBub/adw-dashboard/actions/permissions/workflow -f
default_workflow_permissions=read -F can_approve_pull_request_reviews=true`). With it off the draft
step fails. It is a setting, not a secret; the workflow never changes it.

An entry can still be written by hand in the same shape: stats from `gh api
repos/SBub/adw-dashboard/pulls/<N>`, one line with a string-literal import in `CHANGELOG_ENTRIES`,
the pull request number in `PRODUCTION_PRS`, and `counts` equal to the number of lines under each
heading. The registry test checks the files against the registry, that every production pull
request has exactly one entry, the counts against the lines, that every entry has `stats`, and that
no title or description reads like a promotion pull request ("promote", "develop to master", an ISO
date, "Production is currently broken").

### Pages and sidebar

The `changelog` static segment outranks `[owner]`. Its own `not-found.tsx` ("There is no changelog
entry at this address." with a link back to the index) renders for an unknown id.
`generateStaticParams` returns the placeholder `{ id: "_" }` when the registry is empty, which fails
`isChangelogId` and 404s. The sidebar's Changelog entry is a `SidebarEntryLink` with `nested`,
between Daily log and the worker widget, current on `/projects/changelog` and every entry
(`isSidebarEntryCurrent` in `src/lib/nav-entry.ts`). In the header, Watch me build is current
there.

## Rules

- The site build never calls GitHub or git; only the offline scripts and the release workflow do.
- No `fs` at runtime; only `registry.test.ts` and the script read the folder.
- No clock reads in `src/lib/changelog.ts` or the pages: a date is a string from `meta`, never
  compared with the clock.
- Every merged pull request into `master` has exactly one entry; every line keeps its issue and pull
  request links and stays in the section its prefix put it in.
- Titles, descriptions and lines are written from the diff, never copied from a pull request body;
  no internal incident notes, environment details or migration internals in an entry.
- `stats` come from GitHub once, when the entry is written, and are committed; never fetched at
  build or request time.
- Entries are read only through `getChangelog` and `getChangelogEntry`.
- Registry imports are string literals, never templates.
- `generateStaticParams` in `src/app/(dashboard)/projects/changelog/[id]/page.tsx` never returns an
  empty array (keep the `_` placeholder).
- No em-dashes in entries: the script stops on one rather than rewriting text.
- `changelog` stays a static segment, and no project page gets a one-segment URL.
- Release tags are never moved or overwritten.
- The changelog draft pull request is never merged automatically.
- The release workflow runs only for a push to `master` (or a manual dispatch).
- Never `gh run rerun` a failed release; fix the cause and dispatch with the `sha` instead.
