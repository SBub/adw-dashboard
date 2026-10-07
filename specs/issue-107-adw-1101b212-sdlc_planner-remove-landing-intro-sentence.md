# Chore: Landing intro: remove "Pick a project in the header to watch runs live."

## Metadata

issue_number: `107`
adw_id: `1101b212`
issue_json: `{"number":107,"title":"Landing intro: remove \"Pick a project in the header to watch runs live.\"","body":"The last sentence of the landing intro no longer fits the page: the header has a Projects link, not a project picker.\n\nRemove \"Pick a project in the header to watch runs live.\" from `src/app/page.tsx`; the rest of the intro stays word for word. Update any unit test or `e2e/`spec that asserts the full intro text. Leave historical plans under`specs/` untouched. No other change."}`

## Chore Description

The intro paragraph of the summary page (`/`, `src/app/page.tsx`, `SummaryPage`) ends with
"Pick a project in the header to watch runs live." That sentence is out of date: the header now
carries a `Projects` link (`SectionNav`), not a project picker. Remove the sentence and keep the
rest of the intro word for word, so the paragraph ends with "...how many tokens it used and what
it cost."

Research findings:

- The sentence occurs exactly once outside `specs/`: `src/app/page.tsx:146`, in the intro `<p>`
  of `SummaryPage` (static shell copy, outside the `SectionBoundary`).
- No unit test (`src/**/*.test.ts`) references the intro text.
- `e2e/test_landing_no_filters.md` asserts only that the intro paragraph _starts_ with
  `ADW is an autonomous pipeline` (step 2) and that the reading note follows it (step 3). Neither
  depends on the removed sentence, so no `e2e/` journey needs an edit. No other journey
  (`test_landing_today_refresh.md`, `test_connection_indicator_scope.md`, ...) quotes the intro.
- `README.md` ("Page copy", around line 1219) describes the intro as "saying what ADW is and that
  the page is the public ledger of finished runs"; it never mentions the removed sentence, so it
  stays accurate. `AGENTS.md` and `.adw/project.md` only refer to "the intro" generically.
- `specs/issue-89-adw-c15431cc-sdlc_planner-replace-landing-intro.md` quotes the sentence; it is a
  historical plan and must stay untouched (per the issue).

## Relevant Files

Use these files to resolve the chore:

- `src/app/page.tsx` - `SummaryPage`'s intro `<p>` holds the sentence to remove (line ~146). The
  only code change.
- `e2e/test_landing_no_filters.md` - The one journey that asserts the intro; checked, needs no
  change (asserts only the opening words and the reading note's position).
- `README.md` - "Page copy" paragraph describes the intro; checked, stays accurate, no change.
- `AGENTS.md` - Rules for `/`: the `h1` and intro are static copy in the page body (shell). The
  change keeps that; no rule changes.
- `.adw/project.md` - Profile; Review section lists `/` (heading, intro, note). No change.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Remove the sentence from the intro

- In `src/app/page.tsx`, in `SummaryPage`'s first `<p>` (the `max-w-[70ch]` intro), delete
  ` Pick a project in the header to watch runs live.` (including its leading space), so the text
  ends with `what it cost.`
- Keep every other word, the `<p>` element, its classes, the `h1`, the reading note `<p>` and the
  `SectionBoundary` exactly as they are.
- Run `yarn format` so Prettier reflows the JSX text (the last line becomes `it cost.`); do not
  hand-wrap differently from what Prettier produces.

### 2. Confirm nothing else asserts or documents the sentence

- Run `grep -rn "Pick a project" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=specs .`
  and confirm it returns nothing.
- Do not edit anything under `specs/` (the issue-89 plan quotes the sentence historically), nor
  `e2e/test_landing_no_filters.md`, `README.md`, `AGENTS.md` or `.adw/project.md`: none asserts
  or describes the removed sentence.

### 3. Run the validation commands

- Run every command in `Validation Commands` below; all must pass.

## Test Coverage

No test needed: this is a static copy deletion in a server component's JSX. The repository's only
test layer is `src/**/*.test.ts` (pure helpers and reducers), with no component test layer and no
Playwright code suite, so no automated layer can assert page copy; a unit test would have nothing
pure to exercise. The existing journey `e2e/test_landing_no_filters.md` keeps passing (it checks
only the intro's opening words and that the reading note follows it), and the review phase's
screenshots of `/` at 1920x1080 and 375x667 show the shortened intro.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `grep -rn "Pick a project" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=specs .` - must print nothing (exit 1): the sentence is gone everywhere outside historical plans.
- `yarn lint` - ESLint over the changed page.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`; the page still type-checks (do not stage the rewritten `next-env.d.ts`).
- `yarn knip` - no dead code or unused exports introduced.
- `yarn format:check` - Prettier formatting of the reflowed JSX text.
- `yarn test` - the vitest unit suite stays green.
- `yarn build` - the summary page still prerenders its static shell (needs `.env.local`).

## Notes

- No em-dashes in the edited file (none are introduced by a deletion).
- Commit as a Conventional Commit with a bare type, e.g. `chore: remove outdated sentence from landing intro`, with no trailers.
- The issue explicitly scopes the change to this one sentence: no rewording of the rest of the
  intro, the heading, the metadata title or the reading note.
