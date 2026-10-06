# Chore: Landing page: replace the "Summary" title with an intro that explains what this is

## Metadata

issue_number: `89`
adw_id: `c15431cc`
issue_json: `{"number":89,"title":"Landing page: replace the \"Summary\" title with an intro that explains what this is","body":"The root page is the first thing a visitor sees. Today it opens with the word \"Summary\" and a terse one-liner. Replace both with copy that explains what they are looking at. (heading, intro paragraph, technical note below the filters, document title; copy final as written)"}`

## Chore Description

The root route `/` (`src/app/page.tsx`) opens with an `<h1>Summary</h1>` and a small muted one-liner
("Finished runs per UTC day: what kind of work, how long, and what it cost. Totals per day; tokens and
cost count runs that published metrics."). Replace both with copy that tells a first-time visitor what
they are looking at, move the technical note under the filters, and change the document title. The
copy is final and must be used verbatim (no rephrasing, no em-dashes introduced):

1. `<h1>`: `What an AI developer workflow gets done`
2. Intro paragraph directly under the `<h1>`, normal body size (`text-base`, not the current `text-sm`),
   at most about 70 characters per line (`max-w-[70ch]`):
   `ADW is an autonomous pipeline that takes a GitHub issue and plans, builds, tests, reviews and documents the change, then opens a pull request and merges it once checks are green. This page is its public ledger: every finished run per day across the connected repositories, what kind of work it was, how long it took, how many tokens it used and what it cost. Pick a project in the header to watch runs live.`
3. The old technical note becomes one small muted line below the filters (between `SummaryFilters`
   and `DailySummaryList`):
   `Times are UTC. Tokens and cost count runs that published metrics.`
4. The root page's `<title>`: `ADW Dashboard: what an AI developer workflow gets done` (the root
   layout's `metadata.title` is a plain string, no template, so the page's `metadata.title` is the
   literal document title).
5. No other layout change: the filters and day cards stay where they are. Update every check that
   asserts the old heading text.

Architecture constraints that stay intact: the page body stays non-async and never awaits
`searchParams`; the `<h1>` and the intro stay in the static shell (outside the `SectionBoundary`);
`getSummary` stays called only from `SummaryContent`. The technical note lives inside
`SummaryContent` because it must sit under the filters, which are inside the hole; it is static text
and adds no read. In the "No public project" branch there are no filters, so no note is shown there,
which matches "below the filters".

## Relevant Files

Use these files to resolve the chore:

- `src/app/page.tsx`: the root page. Holds `metadata.title` (`"Summary | ADW Dashboard"`), the
  `<h1>Summary</h1>`, the muted one-liner in `SummaryPage`, and `SummaryContent`, which renders
  `SummaryFilters` then `DailySummaryList` inside `<div className="mt-6 space-y-6">`. All four copy
  changes land here.
- `src/app/layout.tsx`: root layout; `metadata.title` is the plain string `"ADW Dashboard"` (no
  `template`), confirming the page's title is used verbatim. Read only, not changed.
- `src/components/SummaryFilters.tsx`, `src/components/DailySummaryList.tsx`: the filters and day
  cards the note sits between. Read only, not changed (components render what they are given; the
  copy stays in the page).
- `e2e/test_connection_indicator_scope.md`: agent-driven journey that asserts the `Summary` heading
  (level 1) on `/` in steps 2, 11 and 18. Must assert the new heading instead. Step 16 (no `Summary`
  link in the `Sections` nav) is about the nav, not the heading, and stays.
- `README.md`: "What is prerendered and what is not" says the summary's "heading and description are
  the static shell"; the "Summary" section and the intro describe `/`. Check wording still matches
  (heading plus intro in the shell, note under the filters); adjust in place only if a sentence
  becomes wrong.
- `AGENTS.md`: read in full for the rules (no clock read, static shell, no em-dashes, server
  components only). No rule changes, so not edited.
- `.adw/project.md`: Review section describes `/` as "the summary: heading, filters, day cards"; still
  accurate, not edited.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Change the document title

- In `src/app/page.tsx`, set `metadata.title` to `"ADW Dashboard: what an AI developer workflow gets done"`.

### 2. Replace the heading and the one-liner in the static shell

- In `SummaryPage` in `src/app/page.tsx`, change the `<h1>` text from `Summary` to
  `What an AI developer workflow gets done` (keep `text-2xl font-semibold tracking-tight`).
- Replace the muted `<p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">` with the
  intro paragraph at normal body size and a 70ch measure, e.g.
  `<p className="mt-2 max-w-[70ch] text-base text-neutral-700 dark:text-neutral-300">`, containing the
  intro copy verbatim (let Prettier wrap the JSX text; do not alter words or punctuation).
- Keep the `SectionBoundary`, its fallback and `SummaryContent` exactly as they are. Update the
  comment above `SummaryPage` if it mentions "the description" so it reads "the heading and the
  intro are the static shell".

### 3. Move the technical note below the filters

- In `SummaryContent`, in the success branch, insert directly after
  `<SummaryFilters ... />` and before `<DailySummaryList ... />`:
  `<p className="text-xs text-neutral-500 dark:text-neutral-400">Times are UTC. Tokens and cost count runs that published metrics.</p>`
- Keep the wrapping `<div className="mt-6 space-y-6">`. If the `space-y-6` gap between the filters
  and the note looks too loose, it may be tightened only for the note (e.g. wrap filters and note in
  a `<div className="space-y-2">`); the filters and day cards must not move otherwise.
- Do not add the note to the "No public project" branch.

### 4. Update the agent-driven journey

- In `e2e/test_connection_indicator_scope.md`, steps 2, 11 and 18: replace "the `Summary` heading"
  with "the `What an AI developer workflow gets done` heading". Leave step 16 unchanged.

### 5. Check the README wording

- In `README.md`, "What is prerendered and what is not": change "its heading and description are the
  static shell" to "its heading and intro are the static shell". Scan the intro and "Summary" sections
  for any mention of the old heading or one-liner and keep them accurate (no em-dashes).

### 6. Verify no stale references

- `grep -rn "Summary | ADW\|Finished runs per UTC" src e2e README.md` returns nothing.
- `grep -rn "—" src/app/page.tsx e2e/test_connection_indicator_scope.md README.md` returns nothing.

### 7. Run the validation commands

- Run every command in `Validation Commands` below; all must pass.

## Test Coverage

No test needed: the change is static copy and one class change in a server component page. The only
test layer is `src/**/*.test.ts` (pure helpers and reducers); there is no component test layer and no
Playwright code suite, and no helper in `src/lib/` changes. The visible result is covered by the
existing agent-driven journey `e2e/test_connection_indicator_scope.md`, updated in task 4 to assert
the new `<h1>`, and by the review phase's screenshots of `/` and `/?project=SBub/issebya-homes-ai-system`
at 1920x1080 and 375x667 (heading, intro wrapping at about 70ch, note under the filters, day cards in
place, browser tab title `ADW Dashboard: what an AI developer workflow gets done`).

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint` - ESLint over the changed page.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`; the page still type-checks (do not stage `next-env.d.ts`).
- `yarn knip` - no dead exports or files introduced.
- `yarn format:check` - Prettier formatting of `src/app/page.tsx`, the e2e journey, README and this spec.
- `yarn test` - the vitest unit suite stays green.
- `yarn build` - the root route still builds as a partial prerender with the heading and intro in the static shell.

## Notes

- Copy is final: paste it exactly, including "reviews and documents", "ledger:" and the final
  sentence. No em-dashes anywhere.
- Do not move the copy into a component or create a new one; the page owns the section copy.
- Do not await `searchParams` in `SummaryPage` or call `getSummary` from the page body or metadata;
  the note is static text inside the existing island and needs no data.
- Commit as `chore: ...` with no trailers.
