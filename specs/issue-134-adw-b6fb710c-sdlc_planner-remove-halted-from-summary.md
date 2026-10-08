# Chore: remove the halted count from the summary

## Metadata

issue_number: `134`
adw_id: `b6fb710c`
issue_json: `{"number":134,"title":"chore: remove the halted count from the summary","body":"## Problem\n\nThe toolkit is dropping the unused `halted`run status (SBub/adw-toolkit#86): nothing ever writes it, and its migration removes the`halted`column from`adw.daily_summary`. The dashboard still selects and renders that column, so once the migration lands the summary read fails (PostgREST rejects an unknown column in `select`).\n\n## Change\n\nRemove `halted`from the dashboard, merged before or together with the toolkit migration:\n\n-`src/data/index.ts`: drop `halted`from`DAILY_SUMMARY_COLUMNS`.\n- `src/types/adw.ts`: drop `halted`from`DailySummary`, and reword its doc comment (`runs - completed - failed`is any future status).\n-`src/lib/daily-summary.ts`: drop `halted`from`dayTotals`; update `src/lib/daily-summary.test.ts`(fixtures and the column list case).\n-`src/components/SummaryDayCard.tsx`: remove the `{totals.halted} halted`line.\n- Comments and docs:`src/app/page.tsx:48`and`app_docs/summary.md`(docs moved out of`README.md`; keep its Rules section in step).\n\n`RunStatus`already has no`halted`; leave it.\n\n## Acceptance\n\n- `grep -rn halted src app_docs README.md AGENTS.md`returns nothing.\n-`yarn typecheck`, `yarn test`pass;`/` renders day cards with completed and failed counts only.\n"}`

## Chore Description

The toolkit is removing the never-written `halted` run status (SBub/adw-toolkit#86), and its
migration drops the `halted` column from the `adw.daily_summary` view. The dashboard still names
`halted` in the PostgREST `select` for that view, so once the migration lands every summary read
(today and past days, server prefetch and browser Refresh) fails with an unknown-column error and
`/` renders its section error instead of the report.

Remove every trace of `halted` from the dashboard so it reads only columns that will survive the
migration. The change is safe to merge before the migration too: dropping a column from `select`
never fails against a view that still has it. `RunStatus` already has no `halted` member; leave it.

Current occurrences (`grep -rn halted src app_docs README.md AGENTS.md`):

- `src/data/index.ts:80` (`DAILY_SUMMARY_COLUMNS`)
- `src/types/adw.ts:89` (doc comment) and `:103` (`DailySummary.halted`)
- `src/lib/daily-summary.ts:76` (`dayTotals`)
- `src/lib/daily-summary.test.ts:29`, `:260`, `:282`, `:400`
- `src/components/SummaryDayCard.tsx:43-47`
- `src/app/page.tsx:48` (comment on `getTodayState`)
- `app_docs/summary.md:17` (How it works) and `:138` (Revalidation paragraph)

`README.md`, `AGENTS.md` and `e2e/*.md` have none. `SummaryDay["totals"]` is
`Omit<DailySummary, "project_id">` and `SummaryProjectDay extends DailySummary`, so removing the
field from `DailySummary` propagates to both types and makes `tsc` flag every leftover reader.

## Relevant Files

Use these files to resolve the chore:

- `AGENTS.md`: repository rules (no em-dashes, docs in `app_docs/`, feature-doc Rules are invariants).
- `docs/conditional-docs.md`: index; the lines for `summary.md`, `types.md` and `data-boundary.md` match this task.
- `app_docs/summary.md`: feature doc for `/`; mentions `halted` at line 17 (day card header copy) and line 138 (runs not covered by a tag drop). Update in place.
- `app_docs/types.md`: read because `src/types/adw.ts` changes and a database column is removed; it does not mention `halted`, so no edit expected (confirm).
- `app_docs/data-boundary.md`: read because `src/data/index.ts` changes; no `halted` mention, so no edit expected (confirm).
- `src/data/index.ts`: `DAILY_SUMMARY_COLUMNS` select list for `adw.daily_summary`; its doc comment says it is exactly the fields of `DailySummary`.
- `src/types/adw.ts`: `DailySummary` interface and its doc comment.
- `src/lib/daily-summary.ts`: `dayTotals` sums every `DailySummary` count.
- `src/lib/daily-summary.test.ts`: `row()` fixture default, the two-project totals case and the "carries only the day, counts and sums" key list.
- `src/components/SummaryDayCard.tsx`: renders the conditional `{totals.halted} halted` span.
- `src/app/page.tsx`: `getTodayState` doc comment mentions "failed or halted".
- `.adw/project.md`: profile; no `halted` mention and no script, port or doc location changes, so no edit.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Type: drop `halted` from `DailySummary`

- In `src/types/adw.ts`, delete the `halted: number;` line from `interface DailySummary`.
- Reword the doc comment: replace "`runs` counts every finished status, so `runs - completed - failed` is `halted` (and any future status), and ..." with wording such as "`runs` counts every finished status, so `runs - completed - failed` is any future status (0 today), and ...". Keep the rest of the comment unchanged; no em-dashes.

### 2. Data boundary: drop the column from the select

- In `src/data/index.ts`, change `DAILY_SUMMARY_COLUMNS` to
  `"project_id, day, runs, completed, failed, features, bugs, chores, patches, duration_sum_s, tokens_in_sum, tokens_cache_read_sum, tokens_out_sum, cost_usd_sum"`.

### 3. Helper: drop `halted` from `dayTotals`

- In `src/lib/daily-summary.ts`, delete `halted: sum(rows, (row) => row.halted),`.

### 4. Component: remove the halted line

- In `src/components/SummaryDayCard.tsx`, delete the whole `{totals.halted > 0 && ( <span ...>{totals.halted} halted</span> )}` block, leaving `{actions}` directly after the failed span.

### 5. Tests: update fixtures and the key list

- In `src/lib/daily-summary.test.ts`:
  - remove `halted: 0,` from the `row()` defaults;
  - in the two-project totals case, the `p2` row `runs: 2, completed: 1, halted: 1`: drop `halted: 1`. To keep `runs` consistent with `completed + failed`, change that row to `completed: 1, failed: 1` and update the expected totals to `failed: 2` (and remove `halted: 1` from the expected object). Alternatively keep `runs: 2, completed: 1` with no third status (the totals still add); prefer the `failed: 1` version so the fixture reflects real data;
  - remove `"halted",` from the key list in "carries only the day, counts and sums".
- Check no other case passes `halted` (the `const { project_id: _, ...expected } = only` case follows the fixture automatically).

### 6. Comment in the page

- In `src/app/page.tsx` (comment above `getTodayState`), change "a run that finishes failed or halted" to "a run that finishes failed".

### 7. Feature doc

- In `app_docs/summary.md`:
  - line 17: "runs completed and failed (halted when there are any), then three bordered chart cards" becomes "runs completed and failed, then three bordered chart cards";
  - line 138: "a run that finishes `failed` or `halted` (neither fires the action or the webhook)" becomes "a run that finishes `failed` (it fires neither the action nor the webhook)".
- Re-read the doc's Rules section and confirm no rule references `halted` or a status count that changes; no Rules edit is expected. Do not touch `docs/conditional-docs.md` (no doc added or renamed).

### 8. Confirm nothing is left

- `grep -rn halted src app_docs README.md AGENTS.md` must print nothing.

### 9. Run the Validation Commands

- Run every command below, in order, and fix any failure at its cause.

## Test Coverage

No new test needed: this removes a field rather than adding behaviour. The existing unit case
"carries only the day, counts and sums" in `src/lib/daily-summary.test.ts` (layer: `src/**/*.test.ts`,
vitest) pins the exact key set of a day's totals, so once its list drops `"halted"` it fails if
`dayTotals` ever re-adds the field; and `tsc` (via `yarn typecheck`) fails on any remaining reader of
`DailySummary.halted`. The select string itself has no test layer (no database in tests); the build,
which reads the hosted view, and the review screenshots cover it. The visible change (no "halted"
span on day cards) has no component test layer; per the profile, the review phase screenshots `/`
at 1920x1080 and 375x667 and should show each day card header with runs, completed and failed only.
No E2E suite exists and no `e2e/*.md` journey is warranted for a removed, rarely shown label.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `grep -rn halted src app_docs README.md AGENTS.md` (the acceptance check; must print nothing and exit 1)
- `yarn lint` (ESLint over the changed files)
- `yarn typecheck` (`next typegen` then `tsc --noEmit`; proves no reader of `DailySummary.halted` remains)
- `yarn knip` (dead-code check; nothing exported should become unused)
- `yarn format:check` (Prettier formatting of the edited files)
- `yarn test` (vitest; the updated `daily-summary.test.ts` cases pass)
- `yarn build` (`next build`; reads `adw.daily_summary` at build time with the new select list, proving the column list is valid against the hosted view)

## Notes

- Merge order: this can land before the toolkit migration (SBub/adw-toolkit#86); selecting fewer columns works against the current view.
- Do not stage `next-env.d.ts` (rewritten by `yarn typecheck`).
- Commit as `chore: remove the halted count from the summary`, no trailers.
- `RunStatus` has no `halted`; leave it as is.
