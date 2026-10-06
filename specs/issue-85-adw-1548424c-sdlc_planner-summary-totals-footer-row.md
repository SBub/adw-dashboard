# Chore: Summary: replace the totals strip with a Total row at the bottom of the per-project table

## Metadata

issue_number: `85`
adw_id: `1548424c`
issue_json: `{"number":85,"title":"Summary: replace the totals strip with a Total row at the bottom of the per-project table"}`

## Chore Description

On the summary page (`/`), each day card shows a totals strip above the per-project table. The strip is a `<dl>` of five `Metric` items: Total duration, Tokens in, Cache read, Tokens out and Cost. Its numbers do not line up with the table columns they summarise.

Change, per day card:

1. Remove the strip (the `<dl>` and the `Metric` helper, which nothing else uses).
2. Add a final "Total" row to `ProjectBreakdownTable` as a `<tfoot>` row, set apart by a top border and slightly stronger text. It shows:
   - "Total" in the Project column.
   - The sums of Runs, Completed and Failed.
   - One `ClassDistributionBar compact` fed with the day's summed class counts.
   - The sums of Total duration, Tokens in, Cache read, Tokens out and Cost, formatted exactly like the body rows: `secondsLabel`, `tokensLabel` and `costLabel`, in the same `NUM` cell class.
3. Leave the day header as it is (date, runs, completed, failed, halted when non-zero, and `ClassDistributionBar counts={totals}` with its legend).
4. Take the sums from the per-project rows the table renders, with no new read. They already exist: `toSummaryReport` builds `day.totals` with `dayTotals(day, list)` over the same `list` it stores as `day.projects`. So the component computes nothing:
   - `DailySummaryList` passes `day.totals` into the table as a new `totals` prop.
   - The `<tfoot>` renders it.

   This follows AGENTS.md: components never compute business values, and a day's totals come only from `dayTotals`. `dayTotals` stays private, because exporting it would add a second call site for one value.

Single-project filter (`?project=owner/repo`): today the table renders only when `allProjects` is true, so removing the strip would hide that day's duration, tokens and cost. The issue's default applies: always show the table when the day has projects. With a project filtered, it shows one row plus Total. The `allProjects` constant then has no use and goes away.

The issue asks for a Playwright snapshot. The profile's Tests section says this repository has no Playwright suite ("E2E code suite: `none`"; "a user-visible change gets its browser evidence from the review phase's screenshots, not from a test"). So the visual evidence comes from review screenshots of `/` (a day with three projects where the data has one) and of `/?project=...`. This plan adds no spec.

## Relevant Files

Use these files to resolve the chore:

- `README.md`: in "Summary", the intro paragraph lists "five totals", and the "**Totals.**" paragraph describes "A day's strip". Both must describe the Total row and the table that now also shows when a project is filtered.
- `AGENTS.md`, "Summary" and "Architecture": components render what they are given; `DailySummaryList` and `ProjectBreakdownTable` are stateless server components (no `"use client"`); a day's totals are `dayTotals`; status colours come only from `STATUS_COLORS` (no inline `emerald`/`sky`/`rose`); no em-dashes. Add a rule that the Total row is fed `day.totals` and the table adds nothing itself.
- `.adw/project.md`: the Review section says `/?project=...` shows "one row per day, no table". Update that phrase in place: the filtered view now shows a one-row table plus Total. Do not touch any `##` heading.
- `src/components/DailySummaryList.tsx`:
  - Remove the `<dl>` strip, the `Metric` helper and the `allProjects` constant.
  - Remove the imports that then go unused: `costLabel`, `tokensLabel` and `secondsLabel`. Keep `formatDay` and `STATUS_COLORS`.
  - Render the table whenever `day.projects.length > 0`, passing `totals={totals}`.
- `src/components/ProjectBreakdownTable.tsx`: add the `totals: SummaryDay["totals"]` prop and the `<tfoot>` row. Reuse `NUM`, `countClass`, `ClassDistributionBar compact` and the three label helpers.
- `src/lib/daily-summary.ts`: `dayTotals` and `toSummaryReport` are the source of the Total row's values. No code change is expected; read it to confirm `totals` is computed over exactly `day.projects`.
- `src/lib/daily-summary.test.ts`: gets a three-project test case for `toSummaryReport` that pins "the Total row equals the column sums".
- `src/types/adw.ts`: `SummaryDay["totals"]` (`Omit<DailySummary, "project_id">`) is the prop type. It already satisfies `ClassDistributionBar`'s `counts` pick. No change.
- `src/components/ClassDistributionBar.tsx`: reused unchanged with `compact`.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Pin the Total row's contract in the unit test

- In `src/lib/daily-summary.test.ts`, inside `describe("toSummaryReport")`, add a case: "the Total row equals the column sums of a day with three projects".
- Build three `row(...)` fixtures for the same day, using `PROJECTS` plus a third visible project. Extend the local `PROJECTS` fixture only if it has fewer than three entries, and keep the existing cases' expectations intact.
- Give the fixtures distinct, non-zero values in every column the table shows: `runs`, `completed`, `failed`, `features`, `bugs`, `chores`, `patches`, `duration_sum_s`, `tokens_in_sum`, `tokens_cache_read_sum`, `tokens_out_sum` and `cost_usd_sum`. Use costs like `0.1 + 0.2 + 0.35` that exercise the 4-decimal rounding.
- Assert:
  - `day.projects` has three rows.
  - For every numeric field of `totals` except `day` and `cost_usd_sum`, the value equals `projects.reduce(...)` over that field.
  - `cost_usd_sum` equals the rounded sum (`toBeCloseTo(sum, 4)` or an explicit literal).
  - The formatted Total cells equal the formatted sums: `secondsLabel(totals.duration_sum_s)`, `tokensLabel(...)` for the three token columns and `costLabel(totals.cost_usd_sum)`, against literal expected strings, so that a label-format drift fails here.
- Import `secondsLabel` from `@/lib/run-view` only if the test file does not already import it.

### 2. Add the `<tfoot>` Total row to `ProjectBreakdownTable`

- Import `SummaryDay` beside `SummaryProjectDay` from `@/types/adw`.
- Add `totals: SummaryDay["totals"]` to `ProjectBreakdownTableProps`, with a doc comment: "The day's sums over `rows` (`day.totals` from the report); rendered as the Total row, never recomputed here."
- After `</tbody>`, add the footer:
  - A `<tfoot>` with one `<tr className="border-t border-neutral-300 font-medium dark:border-neutral-700">`. The top border must be stronger than the body's `border-neutral-100` separators.
  - A `<th scope="row" className="px-2 py-1.5 text-left">Total</th>`.
  - `<td className={NUM}>{totals.runs}</td>`.
  - `<td className={`${NUM} ${countClass(totals.completed, "completed")}`}>` and the same pattern for `failed`.
  - `<td className="px-2 py-1.5"><ClassDistributionBar counts={totals} compact /></td>`.
  - Five `NUM` cells: `secondsLabel(totals.duration_sum_s)`, `tokensLabel(totals.tokens_in_sum)`, `tokensLabel(totals.tokens_cache_read_sum)`, `tokensLabel(totals.tokens_out_sum)` and `costLabel(totals.cost_usd_sum)`.
- Keep `last:border-0` on the body rows. The footer's own `border-t` provides the separation.
- Update the component's doc comment to say the last row is the day's Total.
- No `"use client"` and no colour literal outside `STATUS_COLORS`.

### 3. Remove the strip from `DailySummaryList`

- Delete the `Metric` function and the `<dl className="grid ...">...</dl>` block.
- Delete `const allProjects = report.project === null;` and change the table condition to `day.projects.length > 0 && (<ProjectBreakdownTable rows={day.projects} totals={totals} days={report.days} label={label} />)`.
- Remove the now-unused imports (`costLabel`, `tokensLabel` and `secondsLabel`), so lint and knip stay clean.
- Leave the header, `ClassDistributionBar counts={totals}` and the "N days to ..." line unchanged.

### 4. Update the documentation in place

- In `README.md`, "Summary" intro, replace "and five totals: total duration, tokens in, cache read, tokens out and cost" with wording that says:
  - The per-project table under each day (with the same columns as before) ends in a Total row with the column sums.
  - With a project selected, the table has that project's single row plus Total.
- In `README.md`, "**Totals.**", replace "A day's strip is the sum of its project rows in the table below (...); with a project selected it is that project's row." with this: the day header's counts and the table's Total row are `day.totals`, the sum of the table's own rows (`dayTotals` in `src/lib/daily-summary.ts`), passed to `ProjectBreakdownTable` as a prop.
- In `AGENTS.md`, "Summary", next to "A day's totals are the sum of its project rows", add this rule:
  - The table's `<tfoot>` Total row renders `day.totals`, passed in as the `totals` prop.
  - `ProjectBreakdownTable` adds nothing itself.
  - The table shows for every day with projects, filtered or not.
  - Do not reintroduce a separate totals strip.
- In `.adw/project.md`, Review section, change "one row per day, no table" to "each day's table holds one project row plus Total". Keep the headings untouched.
- No em-dashes anywhere.

### 5. Run the validation commands

- Run every command in `Validation Commands`, in order, from the worktree root. Fix any failure at its cause, never by weakening a rule or test.

## Test Coverage

Unit layer (`src/**/*.test.ts`, vitest, the profile's only test layer): the new `toSummaryReport` case in `src/lib/daily-summary.test.ts`, "the Total row equals the column sums of a day with three projects". It pins, for three projects (one more than any existing case), two things the new `<tfoot>` now depends on:

- `day.totals` equals the column sums of `day.projects`.
- The formatted Total cells (`secondsLabel`, `tokensLabel` and `costLabel`) equal the formatted sums.

Honest note: the summing logic already exists, so this case passes before the component change too. What it adds is a guard: if `totals` ever stops being derived from the same rows (a filter, a re-read, a different order of rounding), the Total row would silently disagree with its columns, and this case would fail.

The visual change itself has no test layer here: the profile names no component tests and no Playwright suite (E2E code suite: `none`). So the issue's requested Playwright snapshot becomes review evidence instead. Screenshot these routes at 1920x1080 and 375x667, full page:

- `/`: a day card with three projects, where the hosted data has one, shows the Total row under the body rows and no strip.
- `/?project=<first listed slug>`: each day shows a one-row table plus Total.

No `e2e/*.md` journey is added: a static server-rendered table row is fully covered by the review screenshots.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint`: catches the unused imports (`Metric`, `allProjects`, the three label helpers) and any inline status hue.
- `yarn typecheck`: proves the new required `totals` prop is passed at the one call site and that `SummaryDay["totals"]` fits `ClassDistributionBar`'s `counts`.
- `yarn knip`: proves nothing exported or imported became dead (in particular, `dayTotals` stays unexported and unused exports did not appear).
- `yarn format:check`: Prettier on the touched TSX, test and Markdown files.
- `yarn test`: runs the new three-project case, the existing `daily-summary` cases, and `status-colors.test.ts`, which scans `src/` for inline status hues.
- `yarn build`: proves `/` still prerenders its shell and the summary island compiles under `cacheComponents` (needs `.env.local`).

## Notes

- Do not move the summing into the component or call `dayTotals` from it. The table receives `totals` exactly like it receives `rows`, which keeps "components render what they are given" intact.
- The footer omits `halted`, matching the table, which has no Halted column. The header still shows halted when it is non-zero.
- `ClassDistributionBar` returns `null` when there are no class segments. A Total row with zero runs cannot occur, because a day exists only when it has rows. If it ever happens, the empty Classes cell is the same behaviour as a body row.
- Use `<th scope="row">` for "Total" so screen readers announce it as the row header. Body rows keep their `<td>` link cell. The footer's Project cell is plain text, not a link.
- Commit with a bare conventional type, e.g. `chore: replace the summary totals strip with a Total table row`, with no trailers (profile, Documentation).
