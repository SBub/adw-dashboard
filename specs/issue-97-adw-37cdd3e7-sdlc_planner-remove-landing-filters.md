# Chore: Landing page: remove the Project and Window filters for now

## Metadata

issue_number: `97`
adw_id: `37cdd3e7`
issue_json: `{"number":97,"title":"Landing page: remove the Project and Window filters for now","body":"(see issue #97: remove SummaryFilters, the Apply button and the ?days/?project handling from /; always show all projects for SUMMARY_DEFAULT_DAYS through the same getSummary scope, tag and cacheLife; /summary redirects to / without its query string; move the UTC/metrics note into the static shell under the intro; delete the dead component, helpers and tests; update README/AGENTS/profile; e2e: / has intro, note, day cards, no select, no Apply; /summary?days=7 ends at /)"}`

## Chore Description

The landing page `/` (`src/app/page.tsx`) renders a GET form (`SummaryFilters`: Project select, Window
select, Apply) and reads `?days` and `?project`. Remove all of that. The page always shows every
public project over `SUMMARY_DEFAULT_DAYS` (30) days ending on the newest day in
`adw.daily_summary`, newest day first, through the same `"use cache"` scope `getSummary` (tag
`summaryTag()`, `cacheLife({ stale: 300, revalidate: 900, expire: 86400 })`), now with no arguments.

Decisions made while researching (so the implementer does not re-derive them):

1. **The report must stay a request-time hole.** Today `SummaryContent` awaits `searchParams`
   first, which stops the prerender at its `SectionBoundary`. Without that read the scope would be
   prerendered into the shell's Resume Data Cache and no `updateTag` / `revalidateTag` would reach
   it. Replace the read with `await connection()` (`import { connection } from "next/server"`,
   see `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`) as the
   first statement of `SummaryContent`, before `getSummary()`. This flips the current "no
   `connection()` call, as in History" rule for the summary only; History keeps its rule
   (it still reads `searchParams`).
2. **A config redirect cannot drop the query string.** In the installed Next,
   `resolve-routes.js` (redirect branch) calls `prepareDestination`, which always does
   `parsedDestination.query = { ...args.query, ...parsedDestination.query }`
   (`node_modules/next/dist/shared/lib/router/utils/prepare-destination.js`, "Query merge
   order"), so `/summary?days=7` would always land on `/?days=7` whatever the destination says.
   Therefore: remove the `redirects()` entry from `next.config.ts` and add a route handler
   `src/app/summary/route.ts` that answers every `GET` with
   `new Response(null, { status: 308, headers: { Location: "/" } })`. It reads nothing from the
   request (no `request.url`, no host, no query), so the `Location` is the bare relative `/`
   (valid per RFC 9110) and the query is dropped by construction. It is a route handler, not a
   page; AGENTS.md's "do not add a page under `src/app/summary/`" rule is rewritten to name this
   file as the one thing allowed there. HEAD is answered by Next from `GET`. Do not use
   `proxy.ts`/middleware (a request hook for one legacy URL is more machinery than a two-line
   handler). knip's Next plugin treats `app/**/route.ts` as an entry, so it stays green.
3. **The UTC note moves to the shell.** The `<p className="text-xs text-neutral-500
dark:text-neutral-400">Times are UTC. Tokens and cost count runs that published metrics.</p>`
   goes into `SummaryPage`, directly after the intro `<p>` (give it `mt-2`), outside the
   `SectionBoundary`.
4. **Dead code goes, nothing else.** With the project filter gone, `getDailySummary` loses its
   `project` parameter and its `null` result; `SummaryReport` loses `project` (always null now) and
   `projects` (only the filter form read it); `toSummaryReport` loses the `project` option and the
   `projects` output (it still takes the projects list, to name rows and drop hidden ones).
   `ProjectBreakdownTable` renders the project name as plain text and loses the `days` prop.
   `DailySummaryList` always says ", all projects". `readSummaryDays`, `readSummaryProject`,
   `SUMMARY_MAX_DAYS`, `SUMMARY_DAY_OPTIONS`, `summaryHref`, the `DAYS` regexp, the
   `isProjectSlug` import in `daily-summary.ts`, `SummaryFilters.tsx`, `form-controls.ts` and
   `form-controls.test.ts` are deleted (a grep at research time found no other consumer of any of
   them). `SUMMARY_DEFAULT_DAYS`, `summaryWindowStart`, `classSegments`, `tokensLabel`,
   `costLabel` stay.

Acceptance (from the issue): `/` shows the h1, the intro, the note directly under the intro, then
the day cards for all projects, with no `<select>`, no Apply button, no form;
`/?days=7&project=x` renders the same as `/`; `/summary?days=7` ends at `/`; a `summary` tag drop
still refreshes the page on the next request; lint, typecheck, unit tests and knip are green.

## Relevant Files

Use these files to resolve the chore:

- `src/app/page.tsx` - the landing page: drop `searchParams`, the `SearchParams` type and props,
  `SummaryFilters`, `readSummaryDays`/`readSummaryProject`, the "No public project named" panel
  and the `Link` import; `getSummary()` takes no arguments; `SummaryContent` awaits
  `connection()`; the note moves into `SummaryPage`; rewrite both comments.
- `next.config.ts` - delete the `redirects()` entry and its comment (the redirect moves to the
  route handler). Keep every other setting.
- `src/components/SummaryFilters.tsx` - delete.
- `src/lib/form-controls.ts`, `src/lib/form-controls.test.ts` - delete (only consumer was
  `SummaryFilters`).
- `src/components/ProjectBreakdownTable.tsx` - project name as plain text, drop `Link`,
  `summaryHref` and the `days` prop.
- `src/components/DailySummaryList.tsx` - stop passing `days` to the table; the window line ends
  with ", all projects" unconditionally.
- `src/lib/daily-summary.ts` - delete the parameter readers, `SUMMARY_MAX_DAYS`,
  `SUMMARY_DAY_OPTIONS`, `DAYS`, `summaryHref`, the `isProjectSlug` import; narrow
  `toSummaryReport`'s options to `{ days, from, to }` and its result to
  `{ from, to, days, rows }`; update the header comment ("the two search parameters" goes) and
  `SUMMARY_DEFAULT_DAYS`'s doc comment (it is now the fixed window, not a default for `?days`).
- `src/lib/daily-summary.test.ts` - delete `describe("readSummaryDays")`,
  `describe("readSummaryProject")`, `describe("summaryHref")` and their imports; adapt every
  `toSummaryReport` call and its option fixtures (`ALL`, `ALPHA` usage) to the narrowed options;
  rewrite "passes the window through and lists the projects without ids" as "passes the window
  through" expecting exactly `{ from: null, to: null, days: 7, rows: [] }`.
- `src/data/index.ts` - `getDailySummary(days)`: no `project` parameter, return type
  `Promise<SummaryReport>`, no `selected`/`filter`, no `.eq("project_id", ...)` on either query;
  update its doc comment (no filter, no null, `days` is the page's `SUMMARY_DEFAULT_DAYS`).
- `src/types/adw.ts` - `SummaryReport` loses `project` and `projects`; update its doc comment.
  `SummaryProject` stays only if still referenced (it is used by `toSummaryReport`'s `projects`
  parameter type); otherwise remove it.
- `e2e/test_connection_indicator_scope.md` - steps 17 and 18, the intro sentence and the success
  criterion about `/summary?days=7`.
- `README.md` - line ~35 (redirect "keeps its query string"), "What is prerendered and what is
  not" summary paragraph (~line 666: the island awaits `connection()`, not `searchParams`),
  ~lines 1138 to 1142 (redirect), the "Summary" section (intro paragraph's "By default" and "With a
  project selected", "Page copy" note location, "Data" `getDailySummary(days, project)` and "the
  parameters", "The window" "for the selection", the "Filters" paragraph, the "Cache" paragraph).
- `AGENTS.md` - the server-component list (~line 251, `SummaryFilters`), and the "Summary"
  section (~lines 488 to 540): `getSummary` after `await connection()` with `connection()` now
  required; the note in the shell; redirect handled by `src/app/summary/route.ts`, query dropped;
  delete the `?days`/`?project` rule, the `form-controls` rule, `SUMMARY_MAX_DAYS` and
  `SUMMARY_DAY_OPTIONS` from the constants list; "filtered or not" and "for the selection" go.
  Also `getDailySummary(days, project)` in the Architecture boundary paragraph (~line 115) becomes
  `getDailySummary(days)`.
- `.adw/project.md` - Review section line 121 to 123: `/` is "heading, intro, note, day cards
  with class bars, per-project tables"; drop the `/?project=...` screenshot target. Do not touch
  any `##` heading.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md` and
  `.../05-config/01-next-config-js/redirects.md` - read before editing (installed Next is newer
  than training data).

### New Files

- `src/app/summary/route.ts` - the `/summary` permanent redirect to bare `/`.
- `e2e/test_landing_no_filters.md` - agent-driven journey for the landing page without filters,
  in the format of `e2e/test_connection_indicator_scope.md`.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the installed Next docs

- Read `connection.md` and `redirects.md` (paths above) and the redirect branch of
  `node_modules/next/dist/server/lib/router-utils/resolve-routes.js` to confirm the query merge
  that rules out a config redirect.

### 2. Narrow the pure report model

- `src/types/adw.ts`: remove `project` and `projects` from `SummaryReport`; rewrite its comment
  (`from`/`to` bound the window, null when the view has no row; `rows` newest day first).
- `src/lib/daily-summary.ts`: delete `SUMMARY_MAX_DAYS`, `SUMMARY_DAY_OPTIONS`, `DAYS`,
  `readSummaryDays`, `readSummaryProject`, `summaryHref`, the `isProjectSlug` import; change
  `toSummaryReport(rows, projects, options: { days; from; to })` to return
  `{ from, to, days, rows }`; drop `SummaryProject` from imports if unused; update comments.
- `src/lib/daily-summary.test.ts`: remove the three `describe` blocks and their imports, update
  the option fixtures and the "passes the window through" case as described above.

### 3. Narrow the data boundary

- `src/data/index.ts`: `getDailySummary(days: number): Promise<SummaryReport>` with the project
  lookup kept only to name rows (`projects` read unchanged), anchor and rows queries without the
  project filter; call `toSummaryReport(..., { days, from, to })`. Keep `DAILY_SUMMARY_COLUMNS`
  and the cast comments.

### 4. Components

- Delete `src/components/SummaryFilters.tsx`, `src/lib/form-controls.ts`,
  `src/lib/form-controls.test.ts`.
- `ProjectBreakdownTable.tsx`: `<td className="px-2 py-1.5">{row.display_name}</td>`; remove
  `Link`, `summaryHref`, the `days` prop from the interface and the destructuring.
- `DailySummaryList.tsx`: drop `days={report.days}`; replace the `report.project` ternary with
  the literal `, all projects`.

### 5. The page

- `src/app/page.tsx`: no `SearchParams`/`SummaryPageProps`; `getSummary()` (no args) calls
  `getDailySummary(SUMMARY_DEFAULT_DAYS)`, same `cacheTag(summaryTag())` and same `cacheLife`;
  `async function SummaryContent()` does `await connection();` then
  `const report = await getSummary();` and returns
  `<div className="mt-6"><DailySummaryList report={report} /></div>`;
  `export default function SummaryPage()` (no props) renders h1, intro `<p>`, then the note
  `<p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">Times are UTC. Tokens and
cost count runs that published metrics.</p>`, then the unchanged `SectionBoundary`.
- Rewrite the `getSummary` comment: one report, one entry under the `summary` tag; called only
  from `SummaryContent` after `connection()`, so it is a hole resolved from the live cache handler
  and tag drops reach it (keep the lifetime rationale). Rewrite the `SummaryContent` comment: with
  no `searchParams` read, `connection()` is the request-time marker and is required here (the
  reason it was absent is gone). Rewrite the `SummaryPage` comment: not async; h1, intro and note
  are the static shell, the report is the hole.

### 6. The redirect

- `next.config.ts`: delete `redirects()` and its comment block.
- Create `src/app/summary/route.ts`:
  ```ts
  // The summary's old address (issue #83). A config redirect in next.config.ts
  // always carries the request's query string to the destination, and the
  // `?days` and `?project` filters no longer exist (issue #97), so this
  // handler answers a bare, relative `/` and reads nothing from the request.
  // It is the only file under src/app/summary/; there is no page here.
  export function GET() {
    return new Response(null, { status: 308, headers: { Location: "/" } });
  }
  ```
- If `yarn build` prerenders it as static, check after `yarn start` that it still answers 308 with
  `Location: /` (step 10).

### 7. E2E journeys

- `e2e/test_connection_indicator_scope.md`: intro sentence ends "...redirects to `/` without its
  query string"; step 18 becomes "**Verify** the final URL is `/` with no query string, the `What
an AI developer workflow gets done` heading is present, the page contains no `<select>` (no
  `combobox` in the snapshot), and the accessibility snapshot contains no element with role
  `status`."; success criterion "`/summary?days=7` lands on `/` with no query string."
- Create `e2e/test_landing_no_filters.md` (Title, User Story, Test Steps, Success Criteria, as in
  the existing file): navigate to `/`; verify the h1, the intro paragraph (starts "ADW is an
  autonomous pipeline"), and that the text "Times are UTC. Tokens and cost count runs that
  published metrics." follows the intro and precedes the first day card; verify at least one day
  card (`article` with a level-2 date heading) and a per-project table whose Project cells are
  plain text (no links in the Project column), and the window line ends with "all projects";
  verify no `combobox`, no `button` named `Apply`, no form; screenshot. Navigate to
  `/?days=7&project=x`; verify the same content (window line says "30 days", no error panel);
  screenshot. Navigate to `/summary?days=7`; verify the final URL is exactly `/` (no `?`);
  screenshot. 3 screenshots.

### 8. Docs

- `README.md`, `AGENTS.md`, `.adw/project.md`: apply every edit listed under Relevant Files. Grep
  afterwards: `grep -rn -E "SummaryFilters|form-controls|readSummary|summaryHref|SUMMARY_MAX_DAYS|SUMMARY_DAY_OPTIONS|\?days|\?project|query string passed|keeps its query" README.md AGENTS.md .adw next.config.ts src e2e`
  must return nothing except the new route handler's comment and the e2e steps that navigate to
  `/summary?days=7` and `/?days=7&project=x`. No em-dashes in any edited line.

### 9. Static checks

- Run `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`.

### 10. Build and runtime check

- `yarn build`; the route table must show `/` as Partial Prerender (the hole) and list
  `/summary`. Then, on this run's `PORT` from `.ports.env` (never a server this run did not
  start), `yarn start` and run both e2e journeys via the test phase; confirm `/summary?days=7`
  ends at `/` and that the served HTML of `/` contains the note inside the shell and no
  `<select`. Revalidation proof (AGENTS proof rule) is unchanged in mechanism; with
  `NEXT_PRIVATE_DEBUG_CACHE=1`, a plain GET of `/` must not log a `generated entry` for the
  `getSummary` scope on a warm cache. Stop the server afterwards.

## Test Coverage

- Unit (`src/**/*.test.ts`, vitest): the rewritten `toSummaryReport` case "passes the window
  through" in `src/lib/daily-summary.test.ts` asserts the report is exactly
  `{ from, to, days, rows }`; it fails if `project` or `projects` are still assembled. The other
  `toSummaryReport` cases keep pinning grouping, ordering and totals under the narrowed options.
- No other automated test: the deleted helpers go with their tests, and the page, the redirect
  route handler and the components have no unit-testable logic (the profile has no component layer
  and no Playwright code suite). Their user-visible behaviour (no filters, note position, redirect
  dropping the query) is covered by the agent-driven journeys in step 7, an acceptance gate rather
  than a regression layer.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint` - ESLint over the changed files, including the new route handler.
- `yarn typecheck` - the narrowed `SummaryReport`, `getDailySummary` and component props compile
  everywhere.
- `yarn knip` - no dead export or file left (form-controls, readers, `summaryHref`,
  `SUMMARY_MAX_DAYS`, `SUMMARY_DAY_OPTIONS`, possibly `SummaryProject`).
- `yarn format:check` - Prettier on every edited file, markdown included.
- `yarn test` - unit tests, including the updated `daily-summary.test.ts`.
- `yarn build` - the page still builds under `cacheComponents` with `connection()` and `/` is a
  partial prerender; `/summary` builds as a route handler.

## Notes

- Do not keep a config redirect "for safety" alongside the route handler: config redirects run
  before the filesystem routes and would win, re-adding the query string.
- `connection()` replaces `searchParams` as the hole marker; do not also add a short `cacheLife`
  and do not move `getSummary` into the page body or `metadata`.
- Commit messages: `chore: ...`, no trailers (profile Documentation section).
- Never stage `next-env.d.ts`, `.ports.env`, `.env*`, `agents/` or `trees/`.
