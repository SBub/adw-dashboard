# Chore: move feature descriptions out of README and AGENTS into feature docs plus the index

## Metadata

issue_number: `127`
adw_id: `2ab91140`
issue_json: `{"number":127,"title":"docs: move feature descriptions out of README and AGENTS into feature docs plus the index"}`

## Chore Description

Adopt the toolkit's "one doc per feature" rule (SBub/adw-toolkit#78, already in the symlinked
toolkit checkout: `adws/PROFILE.md`, section "One doc per feature", and the feature-doc mode of
`commands/document.md`) in this repository:

- Each feature gets exactly one doc under `app_docs/<feature-slug>.md`.
- `docs/conditional-docs.md` indexes them, one line per doc, saying when to read it.
- `AGENTS.md` holds behaviour rules only (today's "Tooling" section plus a short "Documentation"
  section) and points at the index once.
- `README.md` stays human-facing: a short intro with links into the docs, then "Running it",
  "ADW", "Scripts", "Git hooks", "Stack".
- `.adw/project.md`'s Documentation section names the folder, the index and the new read order.

Why: the toolkit's document phase uses its legacy in-place mode while the profile says
`Feature docs: none`, and four runs failed because the builder had already described the feature
in both `README.md` and `AGENTS.md`. With one doc per feature there is one path to name.

This is a pure move. No code behaviour changes, no content is dropped, every moved paragraph and
every moved rule is findable from the index. Rules move as the imperative sentences they already
are, verbatim. Where README prose and AGENTS rules describe the same feature they land in the
same doc (prose under "How it works", rules under "Rules"). The only rewritten sentences are
cross-references ("see README, X", "see 'Summary' below", "(below)"), which are repointed to the
new doc path. No em-dashes anywhere.

The source ranges below are line numbers of `README.md` and `AGENTS.md` on `origin/develop`
(`a2cb20b`); README is 1429 lines, AGENTS 767.

## Relevant Files

Use these files to resolve the chore:

- `README.md`: source of every feature section (lines 1 to 1352) and keeper of "Running it",
  "ADW", "Scripts", "Git hooks", "Stack" (lines 1353 to 1429). The "ADW" section's sentence about
  where documentation goes must be updated.
- `AGENTS.md`: source of "Architecture" (28 to 410), "Runs: active and history" (411 to 582),
  "Summary" (583 to 688), "Realtime and Supabase" (689 to 767). "Tooling" (6 to 27) stays. Line 4
  ("Reference material ... lives in `README.md`") changes.
- `CLAUDE.md`: `@AGENTS.md` include; unchanged, listed so nobody edits it.
- `.adw/project.md`: the profile. Documentation section (lines 108 to 122), the opening paragraph
  (lines 8 to 9, "`AGENTS.md` stays the rule book ... kept in step with it and with `README.md`")
  and the Protected bullet at line 104 ("Every 'do not' in `AGENTS.md` is an invariant") all name
  AGENTS as the only rule book and must name the feature docs too. Its nine `##` headings are not
  renamed or reordered.
- `/Users/sveta/Dev/adw-toolkit/adws/PROFILE.md` (the toolkit, via the `.claude/commands`
  symlink; read only): the rule being adopted and the example Documentation section shape.
- `/Users/sveta/Dev/adw-toolkit/commands/document.md` (read only): the feature-doc format and the
  index entry format (`- \`<path>\`: read when <situation>; when <situation>.`).
- `/Users/sveta/Dev/adw-toolkit/docs/conditional-docs.md` and `/Users/sveta/Dev/adw-toolkit/AGENTS.md`
  (read only): a repository that has already adopted the rule; model the index's purpose line and
  AGENTS's pointer on them.
- Comment-only pointers into README/AGENTS sections that move (no behaviour change, comment text
  only, so the pointers do not dangle):
  - `src/app/page.tsx:31` (`README, "What is prerendered and what is not"`) and
    `src/app/page.tsx:94` (`AGENTS.md, the clock rule`).
  - `src/app/api/revalidate/route.ts:13` (`See README, "Webhook revalidation".`).
  - `src/lib/history-tags.ts:38` (`see README, "The move" and "Webhook revalidation", and "Summary"`).
  - `next.config.ts:31` (`see AGENTS.md`, the `staleTimes` rule, which moves).
    `next.config.ts:15` (`see AGENTS.md`, the `agentRules` rule) stays: that rule is in "Tooling".
- `.prettierignore`, `package.json` (`format:check` is `prettier --check .`): Markdown is
  formatted by Prettier, so every new and edited `.md` must pass `yarn format:check`.

### New Files

- `docs/conditional-docs.md`: the index.
- `app_docs/screens-and-components.md`
- `app_docs/routing-and-navigation.md`
- `app_docs/types.md`
- `app_docs/data-boundary.md`
- `app_docs/clock-and-prerender.md`
- `app_docs/active-runs.md`
- `app_docs/project-page.md`
- `app_docs/history-revalidation.md`
- `app_docs/error-and-loading-boundaries.md`
- `app_docs/realtime.md`
- `app_docs/summary.md`

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Snapshot the sources

- Work from `origin/develop`'s `README.md` and `AGENTS.md` (identical to the branch's at start).
  Keep both open; every block below is copied, not retyped.
- Doc shape for every file in `app_docs/` (the toolkit's document format, trimmed for a move):
  ```md
  # <Feature title>

  **Specifications:**

  - specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md

  ## Overview

  <2 to 3 sentences: what the feature is, which routes and files>

  ## How it works

  <the moved README prose, its headings demoted so the doc has one `#`>

  ## Rules

  <the moved AGENTS bullets, verbatim, in their original order>
  ```
  A doc with no README prose omits "How it works"; a doc with no AGENTS bullet omits "Rules".
  Keep README's sub-sub-headings (`####`) as `###` under "How it works". Keep code blocks,
  tables and SQL verbatim.

### 2. Create the feature docs (one per feature, every source range assigned once)

- `app_docs/screens-and-components.md` ("Screens and components"):
  - How it works: README 3 to 27 (the opening description: the two-pane `/projects` screen,
    sidebar, right pane, status colour sentence). "Stack" (including its page-background
    sentences) stays in README and is not moved.
  - Rules: AGENTS 30 to 40 (typed props, row layout), 169 to 185 (`SectionHeading`), 316 to 355
    (server vs client components, `HistoryLinks`, `HistorySearch`, `QueueRow`), 371 to 380
    (`formatTimestamp`, `formatDay`), 381 to 389 (page background), 390 to 398 (`STATUS_COLORS`).
- `app_docs/routing-and-navigation.md` ("Routing and navigation"):
  - How it works: README 28 to 35 (header links, `aria-current`, `/summary` redirect) and README
    1170 to 1217 ("Routing").
  - Rules: AGENTS 186 to 192 (`projects/[owner]/[repo]`, slug assembled once), 193 to 198
    (`generateStaticParams` never empty), 230 to 236 (not-found decision), 301 to 307
    (`headerSection`), 610 to 621 (`/summary` 308 route handler).
- `app_docs/types.md` ("Types"): How it works: README 1159 to 1169. Rules: AGENTS 308 to 315.
- `app_docs/data-boundary.md` ("Data boundary and query layer"):
  - How it works: README 37 to 160 ("Data: projects and runs from the database" intro, including
    the SQL block), 161 to 216 ("The query layer"), 255 to 300 ("Prefetch and hydration of the
    sidebar"), 922 to 944 ("Environment", with its table) and 945 to 953 ("The client").
  - Rules: AGENTS 76 to 112 (wiring at `src/data/`), 113 to 124 (boundary casts, column lists),
    199 to 204 (build needs `.env.local`), 205 to 216 (query keys), 217 to 219
    (`makeQueryClient`), 220 to 229 (`prefetch`), 279 to 282 (`query()` not `prefetchQuery`),
    691 to 693 (`getSupabase()` only), 705 to 712 (public and server-only variables).
- `app_docs/clock-and-prerender.md` ("Clock reads and prerendering"):
  - How it works: README 217 to 254 ("Labels: no clock in render").
  - Rules: AGENTS 41 to 69 (exactly two clock reads), 70 to 75 (`durationLabel`), 283 to 300
    (`cacheComponents` and `Date.now()`; its "See README, 'Prefetch and hydration of the Active
    runs'" becomes a pointer to `app_docs/active-runs.md`).
- `app_docs/active-runs.md` ("Active runs"):
  - How it works: README 301 to 335 ("Prefetch and hydration of the Active runs").
  - Rules: AGENTS 125 to 149 (one Active entry, `getActiveRunsState`, `activeRunsQuery`), 150 to
    158 (`active-runs.ts` helpers), 413 to 415 (Active vs History statuses), 534 to 544 (no Active
    tag, tag spellings in `history-tags.ts`).
- `app_docs/project-page.md` ("Project page: Active, Queue and History sections"):
  - How it works: README 336 to 541 ("Runs: active and history" up to, not including, "The move":
    the page's steps 1 to 5, Queue, History paging and search).
  - Rules: AGENTS 159 to 168 (Queue slot), 356 to 370 (Queue rail), 416 to 424 (History never in
    the query cache), 425 to 426 (queue never touches History), 445 to 452 (keyset bookmark), 453
    to 460 (`?q` search), 461 to 463 (static `History` heading), 464 to 471 (`searchParams`
    readers), 472 to 475 (one `historyTag`), 476 to 482 (joined `getHistory` reads, `cacheLife`).
- `app_docs/history-revalidation.md` ("History revalidation and caching"):
  - How it works: README 542 to 592 ("The move"), 593 to 691 ("Webhook revalidation", SQL
    included), 692 to 711 ("Two caches, one source"), 712 to 843 ("What is prerendered and what
    is not"), 844 to 863 ("Client router cache").
  - Rules: AGENTS 427 to 444 (scope after a request-time read; its "see README, 'What is
    prerendered and what is not'" points at the section of this same doc), 483 to 492
    (`staleTimes.dynamic`), 493 to 499 (proof rule), 500 to 509 (revalidate THEN refresh), 510 to
    521 (conditional refresh), 522 to 533 (the public action), 545 to 550 (hydration test), 551 to
    553 (DELETE), 554 to 582 (webhook route handler rules), 694 to 704 (`no-store`; its "see
    README, 'Two caches, one source'" points at this doc's section).
- `app_docs/error-and-loading-boundaries.md` ("Error and loading boundaries"):
  - How it works: README 864 to 878 ("QueryBoundary"), 879 to 901 ("SectionBoundary").
  - Rules: AGENTS 237 to 259 (two boundaries, never a bare `Suspense`), 260 to 278 (skeletons).
- `app_docs/realtime.md` ("Realtime"):
  - How it works: README 902 to 919 ("Where live updates go"), 920 to 921 (the "Realtime"
    heading, demoted), 954 to 999 ("The channel"), 1000 to 1093 ("Event to cache"), 1094 to 1130
    ("Catch-up on SUBSCRIBED"), 1131 to 1158 ("The indicator").
  - Rules: AGENTS 399 to 403 (`setConnectionStatus`), 404 to 410 (`ConnectionIndicator` only in
    the dashboard layout), 713 to 734 (reducers), 735 to 739 (`current && reducer`), 740 to 742
    (slug from the cached project list), 743 to 753 (`ev.old`), 754 to 763 (catch-up), 764 to 767
    (one channel `adw`).
- `app_docs/summary.md` ("Summary page"):
  - How it works: README 1218 to 1352 ("Summary").
  - Rules: AGENTS 585 to 609 and 622 to 688 (every "Summary" bullet except 610 to 621, which went
    to routing).
- In every moved block, repoint cross-references: "see 'Summary' below" to
  `app_docs/summary.md`, "(below)" for Realtime to `app_docs/realtime.md`, "see 'Runs: active and
  history' below" to `app_docs/project-page.md`, "see README, ..." to the doc and section now
  holding it. Change nothing else in the sentence.

### 3. Create the index `docs/conditional-docs.md`

- Title `# Conditional docs`, then one purpose line modelled on the toolkit's: "One line per
  feature doc in `app_docs/`, saying when to read it; read the lines whose situation matches your
  task."
- One line per doc, in the order of step 2, shape `- \`app_docs/<slug>.md\`: read when <situation>;
  when <situation>.` Conditions are situations, not summaries, for example:
  - `app_docs/data-boundary.md`: read when changing `src/data/index.ts`, a query key, the query
    client or a server prefetch; when adding a database read or an environment variable.
  - `app_docs/clock-and-prerender.md`: read when adding a time-dependent label or any
    `Date.now()`/`new Date()`; when a component ships as its Suspense fallback in the served HTML.
  - `app_docs/history-revalidation.md`: read when changing the `revalidateHistory` action, the
    `/api/revalidate` handler, a cache tag, `cacheLife` or `staleTimes`; when a completed run does
    not appear in History.
  - Write the other eight the same way (screens and components: a component's props, layout,
    colours, timestamps, `"use client"`; routing: the route tree, the header, not-found,
    `generateStaticParams`; types: `src/types/adw.ts`; active runs: the Active entry or its
    islands and helpers; project page: the Active, Queue or History sections, paging, search;
    boundaries: `QueryBoundary`, `SectionBoundary`, a loading fallback; realtime: the channel, a
    reducer, catch-up, the connection pill; summary: `/`, its charts, its cache scopes).

### 4. Reduce `AGENTS.md` to behaviour rules

- Line 4: replace with "Rules for working in this repository. What each feature does is not
  described here: read `docs/conditional-docs.md` and the docs whose line matches your task."
  (this is the one pointer to the index).
- Keep "Tooling" (lines 6 to 27) verbatim.
- Delete "Architecture", "Runs: active and history", "Summary", "Realtime and Supabase" (lines 28
  to 767; every bullet now lives in an `app_docs/` doc, step 2).
- Add a short "## Documentation" section:
  - One doc per feature in `app_docs/`, one line per doc in `docs/conditional-docs.md`.
    `README.md` is human-facing (what the app is, how to run it, links into the docs); this file
    holds rules only. Never describe a feature here or in `README.md`.
  - Every "do not" and "never" in a feature doc's Rules section is an invariant, as binding as a
    rule in this file. A change that breaks one changes the rule in that doc in the same commit.

### 5. Make `README.md` human-facing

- Replace lines 1 to 1352 with: the `# ADW Dashboard` title, a short intro (two or three
  sentences: a public dashboard for ADW toolkit runs; `/` is the per-day summary, `/projects` the
  two-pane project screen with Active, Queue and History), and a "Documentation" paragraph
  linking `docs/conditional-docs.md` plus a bullet list linking each `app_docs/` doc by title.
- Keep "Running it", "ADW", "Scripts", "Git hooks", "Stack" verbatim, except the ADW bullet on
  `.adw/project.md`: "where plans (`specs/`) and documentation (this file and `AGENTS.md`) go"
  becomes "where plans (`specs/`), the feature docs (`app_docs/`) and their index
  (`docs/conditional-docs.md`) go".

### 6. Update `.adw/project.md` (headings untouched)

- Opening paragraph, lines 8 to 9: "`AGENTS.md` stays the rule book; ..." becomes "`AGENTS.md`
  holds the working rules and the feature docs under `app_docs/` hold each feature's rules; this
  file restates the subset the ADW commands need and must be kept in step with them and with
  `README.md`."
- Protected, line 104: "Every 'do not' in `AGENTS.md` is an invariant" becomes "Every 'do not' in
  `AGENTS.md` and in the Rules of the feature docs under `app_docs/` is an invariant", the list
  that follows unchanged.
- Documentation section, replace the "Feature docs", "Index to update" and "Read before planning"
  bullets (keep "Plans", "Commits", "Required trailer" verbatim):
  - Feature docs: `app_docs/<feature-slug>.md`, one file per feature, updated in place by later
    runs (never a second file for a feature the index lists). Assets: `app_docs/assets/`.
    `README.md` holds what the app is and how to run it, `AGENTS.md` holds rules; neither
    describes a feature. A change to `specs/`, tests alone or a dependency bump needs no
    documentation. `CLAUDE.md` is an include of `AGENTS.md`. No dated changelog entries.
  - Index to update: `docs/conditional-docs.md`, one line per doc in `app_docs/`, saying when to
    read it.
  - Read before planning: `AGENTS.md`, then `docs/conditional-docs.md` and the docs whose line
    matches; the installed Next docs under `node_modules/next/dist/docs/` for anything about
    caching or Realtime.
  - The `Feature docs: none` marker is gone, so the toolkit's document phase switches to
    feature-doc mode.

### 7. Repoint the comment-only pointers in code

- `src/app/page.tsx:31`: `(README, "What is prerendered and what is not")` to
  `(app_docs/history-revalidation.md, "What is prerendered and what is not")`.
- `src/app/page.tsx:94`: `AGENTS.md, the clock rule` to `app_docs/clock-and-prerender.md`.
- `src/app/api/revalidate/route.ts:13`: to `See app_docs/history-revalidation.md, "Webhook
revalidation".`
- `src/lib/history-tags.ts:38`: to `app_docs/history-revalidation.md` ("The move", "Webhook
  revalidation") and `app_docs/summary.md`.
- `next.config.ts:31`: `see AGENTS.md` to `see app_docs/history-revalidation.md`.
- Comment text only; no statement, import or value changes.

### 8. Format and audit

- `yarn format` so Prettier settles the new Markdown, then review the diff for anything it moved.
- Run the content audit and the em-dash check from Validation Commands; every `MISSING:` line
  must be a cross-reference deliberately rewritten in step 2 or one of the replaced lines of
  steps 4 to 6. Fix anything else by copying it into the right doc.

### 9. Run the Validation Commands

## Test Coverage

No test needed: this is a documentation move (plus five comment-only edits). The project's one
test layer is `src/**/*.test.ts` for pure code in `src/lib/` and `src/data/`, and no code
behaviour changes. Completeness of the move is checked by the content audit in Validation
Commands instead, and no `e2e/*.md` journey is added because nothing user-visible changes (no
review screenshots are needed either).

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `{ git show origin/develop:README.md | sed -n '1,1352p'; git show origin/develop:AGENTS.md | sed -n '28,767p'; } | sed 's/^[[:space:]]*//' | grep -v '^$' | grep -v '^#' | sort -u > /tmp/issue127-old.txt; cat app_docs/*.md docs/conditional-docs.md README.md AGENTS.md | sed 's/^[[:space:]]*//' > /tmp/issue127-new.txt; while IFS= read -r l; do grep -Fxq -- "$l" /tmp/issue127-new.txt || echo "MISSING: $l"; done < /tmp/issue127-old.txt`: proves no content was dropped; the only lines allowed to show are the deliberately rewritten cross-references and replaced intro/pointer lines.
- `grep -rn '—' README.md AGENTS.md .adw/project.md docs app_docs src/app/page.tsx src/app/api/revalidate/route.ts src/lib/history-tags.ts next.config.ts`: must print nothing (no em-dashes).
- `grep -c '^## ' .adw/project.md`: must print `9`, and `grep '^## ' .adw/project.md` must list Identity, Workspaces, Install, Build, Tests, Ports, Protected, Documentation, Review in that order.
- `ls app_docs/*.md | wc -l` and `grep -c '^- \`app_docs/' docs/conditional-docs.md`: both print `11` (one index line per doc).
- `yarn lint`: the comment edits leave ESLint clean.
- `yarn typecheck`: the comment edits leave types unchanged.
- `yarn knip`: no file or export added under `src/`.
- `yarn format:check`: Prettier accepts every new and edited Markdown file.
- `yarn test`: unit tests unchanged and green.
- `yarn build`: the comment edits do not break the build (needs `.env.local`, per the profile's Install section).

## Notes

- The dependency SBub/adw-toolkit#78 is in place: the symlinked toolkit's `adws/PROFILE.md`
  documents the "One doc per feature" rule and `commands/document.md` has its feature-doc mode.
  `PROFILE.md`'s "Three profiles exist today" still describes adw-dashboard as not adopted; that
  is the toolkit's text and is not edited from here.
- This chore is the one case where the plan, not the document phase, edits `README.md`,
  `AGENTS.md`, the feature docs and the index (the issue is about the documentation, as
  `commands/implement.md` allows). The document phase for this run should answer
  `no-documentation-needed`.
- README's "Running it" says Yarn 4.6.0 while the profile says 4.18.1; out of scope, left as is.
- Commit with a bare type and no trailers, for example `docs: move feature descriptions into
app_docs and add the conditional-docs index`.
- Never stage `next-env.d.ts` (rewritten by `yarn typecheck`).
