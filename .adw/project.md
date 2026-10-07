# ADW project profile

The ADW (AI Developer Workflow) profile of this repository. The toolkit's slash commands
(`.claude/commands/*.md`, a symlink into `adw-toolkit/commands/`) read it before anything else:
what this repository is, how it installs, builds and tests, which ports matter, what must never run
here. Committed so every worktree under `trees/<adw_id>/` carries it. The nine `##` headings and
their order are a contract with those commands (`adws/PROFILE.md` in the toolkit): add facts under
them, never rename or reorder them. `AGENTS.md` stays the rule book; this file restates the subset
the ADW commands need and must be kept in step with it and with `README.md`.

## Identity

- name: `adw-dashboard`
- kind: `single-app`. One Next.js 16 app (App Router, `cacheComponents`) at the repository root; no
  workspaces, no task runner, no `apps/*`, no `pyproject.toml`.
- default branch: `develop`. `master` is production.
- package manager: Yarn 4.18.1 (Berry, node-modules linker, pinned via `packageManager`, provided by
  corepack). Never `npm`, `npx`, `pnpm` or `bun`; `yarn dlx` only for an unavoidable one-off binary.
- Node: 24 (`.nvmrc`; `volta` pins 24.21.0).

## Workspaces

| name          | path | dev command | port variable | default port | health URL                                                      | ADW may start |
| ------------- | ---- | ----------- | ------------- | ------------ | --------------------------------------------------------------- | ------------- |
| adw-dashboard | `.`  | `yarn dev`  | `PORT`        | 3000         | `/`, `/projects`, then `/projects/SBub/issebya-homes-ai-system` | yes           |

- `yarn dev` is exactly `next dev`; it takes its port from `PORT`, so nothing passes `--port`.
- `/` (the summary) answering 200 proves the server is up and can reach Supabase (its report is
  read from the database at request time). `/projects` answering 200 proves the sidebar's prefetch
  path. A 500 means the data layer threw, almost always a missing `.env.local`.
- The project page is the second compile and the natural second check. A 404 there is not a server
  fault: that slug is not among the public projects the publishable key can see; use the first
  project the sidebar on `/projects` lists instead.
- `target_apps` from the engine is always empty for this repository; every command runs from the
  root, unfiltered. `/classify_app` answers `{"target_apps": []}` here.

## Install

From the worktree root, in order. The main checkout is two directories up from `trees/<adw_id>/`.

1. Copy from the main checkout, each only if it exists there: `.env.development` (read by
   `yarn dev` and by the ADW toolkit; carries both the app's and ADW's configuration) and
   `.env.local` (read in every mode: `yarn dev`, `yarn build`, `yarn start`). Both hold the same
   two public Supabase values, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   `.env.local` is the one the build reads: `next build` runs with `NODE_ENV=production` and never
   reads `.env.development`, and `getSupabase()` throws when either variable is missing. Never copy
   `.env.example`; never invent a value for a missing file, report it.
2. `yarn install --immutable` (`postinstall` runs `lefthook install`). An install that would change
   `yarn.lock` is a finding, not something to paper over with a mutable install.
3. Verify with `yarn build` (see Build). A build, not a typecheck: only a build loads `.env.local`
   and reads the database, so it is the one check that proves step 1 and the network path.

There is no database to start: the app reads the toolkit's hosted Supabase project with a public
key. Nothing here writes to it. Do not start the dev server during install.

## Build

- `yarn build` (`next build`, about a minute). It reads the database at build time
  (`generateStaticParams` and the layout prefetch call `getProjects()`), so it needs `.env.local`.

## Tests

In the order the test phase runs them, all from the root, unfiltered: lint `yarn lint` (autofix
`yarn lint:fix`); typecheck `yarn typecheck` (`next typegen` then `tsc --noEmit`; it rewrites the
gitignored `next-env.d.ts`, never stage it); dead code `yarn knip` (scans `src/**`, see `knip.json`);
format `yarn format:check` (write `yarn format`); unit `yarn test` (vitest, `src/**/*.test.ts`
only, see `vitest.config.ts`); build `yarn build`.

The one test layer is `src/**/*.test.ts`: pure reducers in `src/data/`, helpers in `src/lib/` and the
pinned hydration rule. There is no component test layer and no Playwright suite; a user-visible
change gets its browser evidence from the review phase's screenshots, not from a test.

E2E code suite: `none` (no `@playwright/test` specs). `e2e/*.md` holds agent-driven journeys
(currently `e2e/test_connection_indicator_scope.md`, `e2e/test_header_section_active.md`,
`e2e/test_landing_no_filters.md`, `e2e/test_landing_today_refresh.md`,
`e2e/test_queue_row_single_line.md`, `e2e/test_section_tooltip_layering.md` and
`e2e/test_day_card_charts.md`) that the test phase runs through the Playwright
MCP server.

lefthook runs prettier, `yarn lint`, `yarn typecheck` and `yarn knip` on every commit and
`yarn test` on every push. Never bypass it.

## Ports

- Nothing in this repository is pinned to a port and nothing external holds a URL against one.
  `next dev` honours `PORT` and defaults to 3000.
- This run's port is in `.ports.env` at the worktree root (`PORT`, `BACKEND_PORT`, `FRONTEND_PORT`),
  written by the engine. Source it; never write, edit or delete it; fall back to 3000 only when it
  is absent. A server on 3000 when `PORT` is not 3000 is the developer's or an older run's: never
  reuse, probe, `lsof` or kill it.

## Protected

- Never write to the hosted Supabase project, and never add the secret (service role) key to any
  file or any `NEXT_PUBLIC_` variable. `ADW_REVALIDATE_SECRET` is server-only and never printed.
- Never `npm`, `npx`, `pnpm` or `bun`. A new dependency is `yarn add <pkg>` or `yarn add -D <pkg>`.
- Never pass `--no-verify`; never weaken a rule, a type or a test to make a check pass.
- Never kill a process this run did not start; never change a port through `package.json`,
  `.ports.env` or any committed file.
- Never stage `next-env.d.ts`, `.ports.env`, `.env*` (except `.env.example`), `agents/` or `trees/`.
- No em-dashes in any file. Use commas, periods, colons or parentheses.
- Every "do not" in `AGENTS.md` is an invariant: no clock read outside the cached boundary, one data
  boundary under `src/data/`, query keys only from `src/data/query-keys.ts`, tag spellings only from
  `src/lib/history-tags.ts`, revalidate before refresh, two boundaries and never a bare `Suspense`.

## Documentation

- Plans: `specs/issue-<issue_number>-adw-<adw_id>-sdlc_planner-<slug>.md`; patch plans:
  `specs/patch/patch-adw-<adw_id>-<slug>.md`.
- Feature docs: none. Documentation is exactly two files, edited in place to describe the current
  code: `README.md` (what the app is and how it works) and `AGENTS.md` (behavioural rules; a new
  invariant goes there as a rule). No `docs/` hub, no `app_docs/`, no per-feature file, no dated
  changelog entries. A change to `specs/`, tests alone or a dependency bump needs no documentation.
- Index to update: none. `CLAUDE.md` is an include of `AGENTS.md`.
- Read before planning: `AGENTS.md` in full, the `README.md` sections for the area touched, and the
  installed Next docs under `node_modules/next/dist/docs/` for anything about caching or Realtime.
- Commits: Conventional Commits with a bare type and no scope (`feat: ...`, `fix: ...`,
  `chore: ...`). No trailers of any kind: no `Co-Authored-By`, no `Signed-off-by`, no "Generated
  with". The `adw: <agent> <id>` body line is a body line, not a trailer.
- Required trailer: none.

## Review

- Open at `http://localhost:$PORT`: `/` (the summary: heading, intro, note, the today card with a
  Refresh button above the past day cards with their runs-by-class and tokens-by-model charts, per-project tables; no sidebar, no pill), `/projects` (project sidebar plus the "Select a
  project" panel) and `/projects/SBub/issebya-homes-ai-system` (header, Active section, Queue
  section, History section), or the first project the sidebar lists if that slug is 404. Capture each at desktop 1920x1080 and mobile
  375x667, full page, into `agents/<adw_id>/<agent_name>/review_img/` in the worktree.
- The sidebar's connection indicator (dashboard routes only; `/` has none) moves from `connecting` to `live` once the Realtime channel
  joins; wait for `live` in a `browser_snapshot` before judging live data, and do not report
  `connecting` as a defect unless the spec is about the indicator.
- A route handler (`src/app/api/revalidate`), a server action, a reducer or a helper has no rendered
  surface: no visual review, evidence is the diff, the tests and the spec's commands.
- Browser automation is the Playwright MCP server in `.mcp.json`, configured by
  `playwright-mcp-config.json` (headless chromium, 1920x1080).
