# Chore: Summary becomes the landing page at /; the project sidebar moves to /projects

## Metadata

issue_number: `83`
adw_id: `158d44af`
issue_json: `{"number":83,"title":"Summary becomes the landing page at /; the project sidebar moves to /projects","body":"Today `/`renders the project sidebar with a \"Select a project\" pane inside the dashboard layout, and the summary lives at`/summary`outside that layout (no sidebar, no realtime, no indicator since #70).\n\nTarget: a visitor landing on https://adw-dashboard.vercel.app/ sees the summary, full width, exactly as`/summary`renders today. Projects are reached through the header's \"Projects\" link.\n\nChange:\n1. Move the summary page to`/` (root route outside the dashboard group): heading, description, Project and Window filters (`?days`, `?project`), per-day tables, same cached read, tags and revalidation. No sidebar, no realtime subscription, no connection indicator there (as #70 decided).\n2. Move today's root content (project sidebar plus the \"Select a project\" pane, inside the `(dashboard)`layout with Providers, realtime and the indicator) to`/projects`. Project pages stay at `/projects/[owner]/[repo]`, unchanged.\n3. Header nav: the brand/title links to `/`; the \"Projects\" link goes to `/projects`; the \"Summary\" link is removed.\n4. `/summary`redirects permanently to`/`, keeping the query string.\n5. Update every place that names the old routes: SummaryFilters action and summaryHref plus its test, AGENTS.md, README.md, .adw/project.md, e2e/test_connection_indicator_scope.md, the code comments in (dashboard)/layout.tsx, actions/revalidate-history.ts, api/revalidate/route.ts, data/index.ts. `generateStaticParams`and the`isProjectPath`helper keep matching`/projects/...`only.\n6. Playwright:`/`shows the summary heading and no sidebar and no indicator;`/projects`shows the sidebar and the indicator;`/summary?days=7`redirects to`/?days=7`.\n\nRelated: #82 (filter alignment on the same component), independent.\n"}`

## Chore Description

Swap the two entry points of the app:

1. **`/` becomes the summary.** The page that lives today at `src/app/summary/page.tsx` moves, unchanged in behaviour, to `src/app/page.tsx`: root route, outside the `(dashboard)` route group, so it gets the root layout only (header plus full-width `<main>`), no sidebar, no `Providers`, no Realtime channel, no `ConnectionIndicator`. Heading, description, `SummaryFilters` (`?days`, `?project`), `DailySummaryList`, the `getSummary` `"use cache"` scope (tag `summaryTag()`, `cacheLife({ stale: 300, revalidate: 900, expire: 86400 })`), the `SummaryContent` island that awaits `searchParams` first under a `SectionBoundary`: all identical. Only the paths it links to change.
2. **`/projects` becomes the overview.** `src/app/(dashboard)/page.tsx` (the "Select a project" panel) moves to `src/app/(dashboard)/projects/page.tsx`, beside the existing `projects/[owner]/[repo]/` segment. It keeps the `(dashboard)` layout (sidebar, Providers, Realtime, indicator). Project pages stay at `/projects/[owner]/[repo]`; `generateStaticParams` and `isProjectPath` are untouched.
3. **Header.** The brand link "ADW Dashboard" keeps `href="/"` (now the summary). `SectionNav`'s "Projects" link goes to `/projects`; its "Summary" link is removed.
4. **`/summary` redirects** permanently to `/` with the query string intact (`/summary?days=7` to `/?days=7`). Done with `redirects()` in `next.config.ts` (`permanent: true`, a 308): per `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md`, "any query values provided in the request will be passed through to the redirect destination". No page file remains under `src/app/summary/`.
5. **Every mention of the old routes** in code, comments and docs is updated (list in Relevant Files).
6. **Browser check.** The profile says the E2E code suite is `none` (no `@playwright/test` specs, and adding one would invent a layer), so the issue's "Playwright" item is delivered by updating the agent-driven journey `e2e/test_connection_indicator_scope.md`, which the test phase runs through the Playwright MCP server.

Important ordering constraint: `src/app/(dashboard)/page.tsx` and `src/app/page.tsx` both resolve to `/`; Next fails the build on two pages for one path. The dashboard page must be moved before (or in the same step as) the summary page is created.

## Relevant Files

Use these files to resolve the chore:

- `README.md`: intro (lines 1 to 30: "`/` shows an empty Select a project panel", "`/summary`", "Projects and Summary links"), "Prefetch and hydration of the sidebar" (lines ~248 and ~278 name the prerender of `/`), "The move" (~502, "`/summary` page's scope"), "What is prerendered and what is not" (~677), the caveats (~754), "The indicator" (~1086, "leaving the group (to `/summary`)"), "Routing" (~1146 paragraph on `src/app/summary/`), "Summary" (~1153, ~1199 `src/app/summary/page.tsx`, ~1210 "outside `(dashboard)`").
- `AGENTS.md`: the `ConnectionIndicator` placement rule (~line 298 to 302, `src/app/summary/`, `/summary`), the action rule (~422, "next `/summary` render"), the "Summary" section (~480, "`/summary` lives in `src/app/summary/`"). A new invariant (the redirect) goes here as a rule.
- `.adw/project.md`: Workspaces health URL table and the bullets below it (`/` "proves ... Supabase (the sidebar is prefetched)", "the sidebar on `/`"), Review section (`/` "project sidebar plus the Select a project panel", `/summary`, `/summary?project=...`, "`/summary` has none"). Headings must not be renamed or reordered.
- `e2e/test_connection_indicator_scope.md`: the journey that asserts the indicator scope through `/` and `/summary`; rewritten for the new routes and the redirect.
- `next.config.ts`: gains the `redirects()` entry for `/summary`.
- `src/app/summary/page.tsx`: the summary page; moved to `src/app/page.tsx` (then the `summary/` directory is gone). Its "Show all projects" link (`href="/summary"`) changes.
- `src/app/(dashboard)/page.tsx`: the "Select a project" panel; moved to `src/app/(dashboard)/projects/page.tsx`.
- `src/app/(dashboard)/layout.tsx`: comments at lines 21 ("prerender of \"/\"") and 42 ("shared by \"/\" and ..."), 59 ("/summary has no channel and no pill").
- `src/app/layout.tsx`: brand link to `/` (stays; verify only).
- `src/app/not-found.tsx`: "All projects" link to `/`; must point to `/projects`.
- `src/components/SectionNav.tsx`: header nav; Projects to `/projects`, Summary link removed, comment adjusted.
- `src/components/SummaryFilters.tsx`: `<form action="/summary">` becomes `action="/"`.
- `src/lib/daily-summary.ts`: `summaryHref` (returns `/summary...`) and the file header comment ("shapes the /summary page").
- `src/lib/daily-summary.test.ts`: `summaryHref` cases (lines 353 to 369) expect `/summary`.
- `src/components/ProjectBreakdownTable.tsx`: consumer of `summaryHref`; no edit, picks up the new path.
- `src/app/actions/revalidate-history.ts`: comments at ~24 and ~44 ("/summary page").
- `src/app/api/revalidate/route.ts`: comments at ~11 and ~16 ("/summary").
- `src/data/index.ts`: comments at ~19 and ~320 ("The /summary page").
- `src/lib/history-tags.ts`: comments at ~2 and ~19 ("the /summary page"), not named in the issue but names the old route.
- `src/app/providers.tsx` (~51) and `src/lib/project-route.test.ts` (~22): say "the overview"; still true (the overview is now `/projects`). `project-route.test.ts` gains one assertion (see Test Coverage).
- `src/lib/project-route.ts`, `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: read only; `isProjectPath` and `generateStaticParams` keep matching `/projects/<owner>/<repo>` only and are not changed.
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md`: read before writing the redirect (query passthrough, `permanent` gives 308).

### New Files

- `src/app/page.tsx`: the summary page (moved from `src/app/summary/page.tsx`, `git mv`).
- `src/app/(dashboard)/projects/page.tsx`: the "Select a project" overview (moved from `src/app/(dashboard)/page.tsx`, `git mv`).

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Move the overview to /projects

- `git mv "src/app/(dashboard)/page.tsx" "src/app/(dashboard)/projects/page.tsx"`. Content unchanged (component may stay `HomePage`; renaming it to `ProjectsPage` is fine and clearer).
- Do this first: it frees `/` for the summary page and avoids two pages resolving to `/`.

### 2. Move the summary to /

- `git mv src/app/summary/page.tsx src/app/page.tsx`; confirm `src/app/summary/` no longer exists.
- In the moved file, change the "Show all projects" link from `href="/summary"` to `href="/"`.
- Leave everything else as is: `metadata` (`title: "Summary | ADW Dashboard"`), `getSummary` with its `cacheTag(summaryTag())` and explicit `cacheLife`, `SummaryContent` awaiting `searchParams` first, the `SectionBoundary`, no `connection()`. Update the `getSummary` doc comment only if it names `/summary` (it does not today).
- Do not import `Providers`, `ConnectionIndicator` or `ProjectNav` here; the root layout carries none of them.

### 3. Redirect /summary permanently

- In `next.config.ts` add:
  ```ts
  async redirects() {
    return [{ source: "/summary", destination: "/", permanent: true }];
  },
  ```
  with a short comment: the summary moved to `/` (issue #83), old links and bookmarks keep working, the query string (`?days`, `?project`) is passed through by Next, `permanent` is a 308.
- No `src/app/summary/page.tsx` with `permanentRedirect()`: that would need a `searchParams` read to keep the query and adds a route for nothing.

### 4. Point the summary's own URLs at /

- `src/lib/daily-summary.ts`: `summaryHref` returns `query ? \`/?${query}\` : "/"`; update its doc comment ("The summary URL (`/`) for ...") and the file header comment ("shapes the summary page (`/`)").
- `src/lib/daily-summary.test.ts`: update the three `summaryHref` cases to `"/"`, `"/?days=7"`, `` `/?project=${encoded}` `` and `` `/?days=90&project=${encoded}` ``.
- `src/components/SummaryFilters.tsx`: `action="/"`.

### 5. Header nav and the root not-found

- `src/components/SectionNav.tsx`: the "Projects" link `href="/projects"`; delete the "Summary" link (the brand link is the way to the summary). Keep it a server component with no active state; keep the `nav aria-label="Sections"`. Adjust the comment if it implies two links.
- `src/app/layout.tsx`: brand `Link href="/"` stays; no change.
- `src/app/not-found.tsx`: the "All projects" link becomes `href="/projects"`.

### 6. Code comments that name the old routes

- `src/app/(dashboard)/layout.tsx`: line 21 "fails the prerender of \"/\"" becomes "\"/projects\""; line 42 "shared by \"/\" and \"/projects/[owner]/[repo]\"" becomes "shared by \"/projects\" and ..."; line 59 "/summary has no channel and no pill" becomes "The summary at / has no channel and no pill".
- `src/app/actions/revalidate-history.ts`: "the /summary page" and "of /summary" become "the summary page (`/`)" / "of the summary page (`/`)".
- `src/app/api/revalidate/route.ts`: the two "/summary" mentions likewise.
- `src/data/index.ts`: lines ~19 and ~320, "The /summary page" becomes "The summary page (`/`)".
- `src/lib/history-tags.ts`: lines ~2 and ~19 likewise.
- Grep afterwards: `grep -rn "/summary" src` must only hit the deliberate places (none expected in `src`; the redirect lives in `next.config.ts`).

### 7. Pin isProjectPath against the new overview route

- `src/lib/project-route.test.ts`, in the "is false for the overview and for a route outside /projects" case: add `expect(isProjectPath("/projects", "SBub/adw-toolkit")).toBe(false);` (the overview is now `/projects`). `src/lib/project-route.ts` is not changed.

### 8. AGENTS.md

- `ConnectionIndicator` rule (~298 to 302): "never in the root layout or under `src/app/summary/`" becomes "never in the root layout or in the summary page `src/app/page.tsx`"; "Do not mount `Providers` or start Realtime on `/summary`" becomes "on `/` (the summary)".
- Action rule (~422): "the next `/summary` render" becomes "the next render of the summary (`/`)".
- "Summary" section (~480): "`/summary` lives in `src/app/summary/`, outside `(dashboard)`" becomes "The summary is the root route `/`, `src/app/page.tsx`, outside `(dashboard)`". Add a rule bullet: "`/summary` is a permanent redirect to `/` in `next.config.ts` `redirects()`, query string passed through; do not add a page under `src/app/summary/`. The project overview (sidebar plus the Select a project panel) is `/projects`, `src/app/(dashboard)/projects/page.tsx`; the header's `SectionNav` links to `/projects` only and the brand links to `/`."
- No em-dashes.

### 9. README.md

- Intro: the app is two sections; `/` is the summary (full width), `/projects` is the two-pane screen with "Select a project" and `/projects/<owner>/<repo>` the deep link. Replace "The header's \"Projects\" and \"Summary\" links switch between them" with: the brand links to `/`, the header's "Projects" link to `/projects`; `/summary` redirects to `/` with its query string.
- "Prefetch and hydration of the sidebar" (~248, ~278): `/` becomes `/projects`.
- "The move" (~502), "What is prerendered" (~677), caveats (~754), "The indicator" (~1086): replace `/summary` with "the summary (`/`)".
- "Routing" (~1146): the summary page is `src/app/page.tsx`, the root route, outside the `(dashboard)` group; the overview is `src/app/(dashboard)/projects/page.tsx`; mention the `/summary` redirect.
- "Summary" (~1153, ~1199, ~1210): `/summary` becomes `/`, `src/app/summary/page.tsx` becomes `src/app/page.tsx`.
- `grep -n "/summary" README.md` afterwards must only hit the redirect sentence(s).

### 10. .adw/project.md (keep the nine `##` headings and their order)

- Workspaces table health URL: `/`, then `/projects`, then `/projects/SBub/issebya-homes-ai-system` (or as the cell allows: `` `/`, `/projects`, then `/projects/SBub/issebya-homes-ai-system` ``; reformat the table with Prettier).
- Bullets: `/` answering 200 proves the server is up (the summary's report reads Supabase at request time); `/projects` answering 200 proves the build-time/sidebar prefetch path; "the first project the sidebar on `/projects` lists".
- Review: `/` (summary heading, filters, day cards with class bars, per-project tables; no sidebar, no pill), `/?project=SBub/issebya-homes-ai-system` (one row per day, no table), `/projects` (sidebar plus the Select a project panel), the project page. Indicator bullet: "dashboard routes only; `/` has none".

### 11. e2e/test_connection_indicator_scope.md

Rewrite the journey for the new routes, keeping its structure (User Story, Test Steps, Success Criteria):

1. Navigate to the `Application URL` (`/`). Verify the `Summary` heading (level 1) is present, there is no `navigation` named `Projects` (the sidebar) and no element with role `status`. Screenshot.
2. Click `Projects` in the header's `Sections` navigation. Verify the URL is `/projects`, the `Projects` navigation (sidebar) and the `Select a project` heading are present, a `status` element is present and within 15 seconds reads `live`. Screenshot.
3. Click the first project link in the sidebar, note its `href`, verify the URL is `/projects/<owner>/<repo>` and the `status` reads `live`.
4. Click `ADW Dashboard` (the header brand). Verify the URL is `/`, the `Summary` heading is present, and no `status` element and no `connecting`/`live`/`reconnecting` text outside the summary content.
5. Click `Projects`, then the same project link; verify the `status` reads `live` again. Screenshot.
6. Verify the header's `Sections` navigation has no `Summary` link.
7. Navigate directly (full page load) to `/summary?days=7`. Verify the final URL is `/?days=7`, the `Summary` heading is present, the Window select shows `Last 7 days`, and no `status` element.

- Success criteria: pill absent on `/` (client navigation and full load), present and `live` on `/projects` and on a project page, `/summary?days=7` lands on `/?days=7`, 3 screenshots.

### 12. Validate

- Run every command in `Validation Commands`. Fix anything that fails without weakening a rule, type or test.
- Before the build: `grep -rn "summary/" src` returns nothing, `ls src/app/summary` fails, `ls "src/app/(dashboard)/page.tsx"` fails.
- After `yarn build`, check the route table lists `/` (partial prerender, like `/summary` before) and `/projects` (static), and no `/summary` route.

## Test Coverage

- Unit (`src/lib/daily-summary.test.ts`, vitest): the updated `summaryHref` cases assert `/`, `/?days=7`, `/?project=...`, `/?days=90&project=...`; they fail against the old helper (which returns `/summary...`), so they catch the project-table links in `ProjectBreakdownTable` still pointing at the redirecting path.
- Unit (`src/lib/project-route.test.ts`, vitest): `isProjectPath("/projects", slug)` is `false`; pins that the new overview route never triggers the post-completion `router.refresh()` (it passes today, it is a guard for the moved route, not a fail-without-change test).
- No unit test for the route moves, the `SectionNav` links, the `SummaryFilters` form action or the `next.config.ts` redirect: the profile's only test layer is `src/**/*.test.ts` (pure helpers and reducers), there is no component test layer and no Playwright code suite, and adding one would invent a layer. Their browser evidence is the updated agent-driven journey `e2e/test_connection_indicator_scope.md` (task 11, an acceptance gate run by the test phase through the Playwright MCP server) and the review phase's screenshots of `/`, `/?project=...`, `/projects` and the project page.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint`: ESLint over the moved and edited files (the profile's first test step).
- `yarn typecheck`: `next typegen` regenerates the route types for the moved pages, then `tsc --noEmit` (never stage the rewritten `next-env.d.ts`).
- `yarn knip`: no dead export or file left behind by the move (`SectionNav`, `summaryHref`, the moved pages).
- `yarn format:check`: Prettier over the TSX, the Markdown docs, the spec and `.adw/project.md` (run `yarn format` first if the table needs realigning).
- `yarn test`: vitest, including the updated `summaryHref` and `isProjectPath` cases.
- `yarn build`: proves the two pages no longer collide on `/`, `/` is a partial prerender with the summary hole, `/projects` and the project pages still prerender, `generateStaticParams` is intact, and the redirect config is valid (needs `.env.local`).

## Notes

- Conventional commit, bare type, no trailers: `chore: make the summary the landing page and move the project overview to /projects`.
- Do not start a dev server outside the run's `PORT` from `.ports.env`; do not touch Supabase.
- No new cache tag, no new `"use cache"` scope, no `cacheLife` change: the summary's scope moves with its file, and `summaryTag()` / `historyTags(slug)` are spelled in `src/lib/history-tags.ts` as before, so the action and the webhook still drop it.
- `staleTimes.dynamic` is unaffected. The summary at `/` is still a request-time hole, so a client navigation back to `/` within five minutes is served from the router cache as `/summary` was.
- Moving between `/` and `/projects` now unmounts and remounts `Providers` (and the Realtime channel) exactly as `/summary` and `/` did before; the indicator journey covers the remount.
- The brand link and the "Projects" link are the only header navigation; `SectionNav` keeps a single link. If knip or lint complains about a one-item nav, keep the `nav` (it is the `Sections` landmark the journey relies on).
- `ProjectNav`'s selected-state check (`pathname === \`/projects/${slug}\``) is unaffected by `/projects`; nothing is highlighted on the overview, as on `/` before.
