# ADW project profile

The ADW (AI Developer Workflow) profile of this repository. The toolkit's slash commands
(`.claude/commands/*.md`, a symlink into `adw-toolkit/commands/`) read it before anything else:
what this repository is, how it installs, builds and tests, which ports matter, what must never run
here. Committed so every worktree under `trees/<adw_id>/` carries it. The nine `##` headings and
their order are a contract with those commands (`adws/PROFILE.md` in the toolkit): add facts under
them, never rename or reorder them. `AGENTS.md` holds the working rules and the feature docs under
`app_docs/` hold each feature's rules; this file restates the subset the ADW commands need and must
be kept in step with them and with `README.md`.

## Identity

- name: `adw-dashboard`
- kind: `single-app`. One Next.js 16 app (App Router, `cacheComponents`) at the repository root; no
  workspaces, no task runner, no `apps/*`, no `pyproject.toml`.
- default branch: `develop`. `master` is production.
- package manager: Yarn 4.18.1 (Berry, node-modules linker, pinned via `packageManager`, provided by
  corepack). Never `npm`, `npx`, `pnpm` or `bun`; `yarn dlx` only for an unavoidable one-off binary.
- Node: 24 (`.nvmrc`; `volta` pins 24.21.0).
- Blog posts: `src/content/posts/<slug>.mdx`, registered in `src/content/posts/index.ts`.
- Changelog entries: `src/content/changelog/<YYYY-MM-DD>-pr<N>.mdx`, registered in
  `src/content/changelog/index.ts`; drafted by the release workflow (`.github/workflows/release.yml`
  runs `scripts/release.ts`, which runs `node scripts/backfill-changelog.ts` with the production pull
  request's stats) as a pull request into `develop`, then title, description and lines rewritten by
  hand from the diff before it merges.

## Workspaces

| name          | path | dev command | port variable | default port | health URL                                                                       | ADW may start |
| ------------- | ---- | ----------- | ------------- | ------------ | -------------------------------------------------------------------------------- | ------------- |
| adw-dashboard | `.`  | `yarn dev`  | `PORT`        | 3000         | `/`, `/projects/log`, `/projects`, then `/projects/SBub/issebya-homes-ai-system` | yes           |

- `yarn dev` is exactly `next dev`; it takes its port from `PORT`, so nothing passes `--port`.
- `/` (the static intro page) answering 200 proves the server is up. `/projects/log` (the summary)
  answering 200 proves it can reach Supabase (its report is read from the database at request
  time). `/projects` answering 200 proves the sidebar's prefetch
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
   `.env.example`; never invent a value for a missing file, report it. Either file may also carry
   the four `/hire` form variables (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`,
   `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, see `.env.example`). They are optional for `yarn build`:
   the page builds with an empty site key and the action answers `?error=send` when unconfigured.
   `SITE_URL` (the public address for Open Graph and canonical URLs, see `.env.example`) is
   optional too: unset, metadata URLs fall back to the Vercel production domain or
   `http://localhost:3000`.
2. `yarn install --immutable` (`postinstall` runs `lefthook install`). An install that would change
   `yarn.lock` is a finding, not something to paper over with a mutable install.
3. `yarn playwright install chromium`, the browser `@playwright/test` needs. Browsers live in the
   user cache, so this is a no-op once present and never a reason to change `yarn.lock`.
4. Verify with `yarn build` (see Build). A build, not a typecheck: only a build loads `.env.local`
   and reads the database, so it is the one check that proves step 1 and the network path.

There is no database to start: the app reads the toolkit's hosted Supabase project with a public
key. Nothing here writes to it. Do not start the dev server during install.

## Build

- `yarn build` (`next build`, about a minute). It reads the database at build time
  (`generateStaticParams` and the layout prefetch call `getProjects()`), so it needs `.env.local`.

## Tests

In the order the test phase runs them, all from the root, unfiltered: lint `yarn lint` (autofix
`yarn lint:fix`; `eslint.config.mjs` ignores `trees/**` and `agents/**`); typecheck
`yarn typecheck` (`next typegen` then `tsc --noEmit`; `tsconfig.json` excludes `trees` and
`agents`; it rewrites the gitignored `next-env.d.ts`, never stage it); dead code `yarn knip` (scans `src/**`, `scripts/**` and `e2e/**`, see `knip.json`);
format `yarn format:check` (write `yarn format`); unit `yarn test` (vitest, `src/**/*.test.ts`
only, see `vitest.config.ts`); build `yarn build`; then the post metadata check `yarn check:og`
(vitest under `vitest.og.config.ts`, reads the built `.next/server/app/writing/<slug>.html`, so it
runs only after a build); and last the E2E suite `yarn test:e2e`.

The unit layer is `src/**/*.test.ts`: pure reducers in `src/data/`, helpers in `src/lib/` and the
pinned hydration rule. The one exception is `scripts/check-post-metadata.test.ts`, run by
`yarn check:og` after the build, never by `yarn test`. There is no component test layer; the browser
layer is the Playwright suite below.

E2E code suite: `e2e/*.spec.ts` (`@playwright/test`, chromium, `playwright.config.ts`), run last by
the test phase as `PORT=<run port> yarn test:e2e`. The `/prepare_app` server must already be up on
this run's port, which `reuseExistingServer` adopts; never set `CI=1` in a run (it disables reuse
and switches the server to `yarn start`). Specs import `test` and `expect` from `e2e/fixtures.ts`
(the `/hire` POST guard, `waitForLive`, `openFirstProject`), read the hosted database through the
app and never write. A user-visible change adds or extends a spec there. Agent-driven `e2e/*.md`
journeys are opt-in and normally absent; the remaining ones are being converted to specs.

lefthook runs prettier, `yarn lint`, `yarn typecheck` and `yarn knip` on every commit and
`yarn test` on every push. `yarn test:e2e` is in neither hook: it needs a server and the network.
Never bypass it.

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
- Never submit the `/hire` form with valid input against a server running with real Resend and
  Turnstile keys: it emails `hire@issebya.com`. Never commit the real values of those keys.
- No em-dashes in any file. Use commas, periods, colons or parentheses.
- Every "do not" in `AGENTS.md` and in the Rules of the feature docs under `app_docs/` is an
  invariant: no clock read outside the cached boundary, one data
  boundary under `src/data/`, query keys only from `src/data/query-keys.ts`, tag spellings only from
  `src/lib/history-tags.ts`, revalidate before refresh, two boundaries and never a bare `Suspense`.

## Documentation

- Plans: `specs/issue-<issue_number>-adw-<adw_id>-sdlc_planner-<slug>.md`; patch plans:
  `specs/patch/patch-adw-<adw_id>-<slug>.md`.
- Feature docs: `app_docs/<feature-slug>.md`, one file per feature, updated in place by later runs
  (never a second file for a feature the index lists). Assets: `app_docs/assets/`. `README.md`
  holds what the app is and how to run it, `AGENTS.md` holds rules; neither describes a feature. A
  change to `specs/`, tests alone or a dependency bump needs no documentation. `CLAUDE.md` is an
  include of `AGENTS.md`. No dated changelog entries.
- Index to update: `docs/conditional-docs.md`, one line per doc in `app_docs/`, saying when to read
  it.
- Read before planning: `AGENTS.md`, then `docs/conditional-docs.md` and the docs whose line
  matches; the installed Next docs under `node_modules/next/dist/docs/` for anything about caching
  or Realtime.
- Commits: Conventional Commits with a bare type and no scope (`feat: ...`, `fix: ...`,
  `chore: ...`). No trailers of any kind: no `Co-Authored-By`, no `Signed-off-by`, no "Generated
  with". The `adw: <agent> <id>` body line is a body line, not a trailer.
- Required trailer: none.

## Review

- Open at `http://localhost:$PORT`: `/` (the intro page: heading, the Remote, Lisbon line, intro with its issebya.com link,
  two door cards into `/hire?offer=...`; no sidebar, no pill),
  `/projects/log` (the summary: the sidebar with Daily log current, the pill and the worker widget, then heading, intro, note, the today card with a
  Refresh button above the past day cards with their What I worked on, Tokens by model and What each step cost chart cards, per-project tables), `/projects` (project sidebar, with the Daily log entry and the worker status widget at its bottom, plus every active run
  grouped by project under a `Building now` heading, or "No runs in progress." when none) and `/projects/SBub/issebya-homes-ai-system` (header, Building now, Up next and
  Shipped sections), or the first project the sidebar lists if that slug is 404, and
  `/hire` (heading, the Remote, Lisbon line, LinkedIn link, the form with the offer select, the Turnstile widget, the
  fuchsia Send button; no sidebar, no pill), `/writing` (heading, intro, the first post with its
  audience tag; no sidebar, no pill) and `/writing/my-moat` (title, date, tag, body ending with
  its Watch me build live link to `/projects`; at 1920x1080 the minimap in the right gutter, none at
  375x667), `/projects/changelog` (the sidebar with Changelog current below Daily log, heading,
  intro, entries newest first with date, title, stats strip and counts) and one entry such as
  `/projects/changelog/2026-10-09-pr163` (date, title, the stats strip with the PR link, diff,
  commits, files and comments, the description, the Features, Fixes and Chores lists). The fuchsia Work with me button is in the header from 640px up
  and floats bottom-right below it (hidden on `/hire` there). The radio footer (a rounded box with `∞`, the play button and `NTS · SLOW FOCUS`) is fixed to the bottom of the viewport on
  every route, below the floating Work with me button on phones, and is idle on load; do not press play during review unless the spec is about the bar. Capture each at desktop 1920x1080 and mobile
  375x667, full page, into `agents/<adw_id>/<agent_name>/review_img/` in the worktree.
- The sidebar's connection indicator (dashboard routes only; `/`, `/writing` and `/hire` have none) moves from `connecting` to `live` once the Realtime channel
  joins; wait for `live` in a `browser_snapshot` before judging live data, and do not report
  `connecting` as a defect unless the spec is about the indicator.
- The sidebar's worker widget reads "Checking status..." until its first read and "Offline"
  whenever the queue worker is not running on the operator's machine. Neither is a defect unless
  the spec is about the widget.
- The `sendHireRequest` action has no rendered surface beyond the `/hire?sent=1` and
  `/hire?error=<code>` states, which open directly by URL; never submit a valid form to reach them.
- A route handler (`src/app/api/revalidate`), a server action, a reducer or a helper has no rendered
  surface: no visual review, evidence is the diff, the tests and the spec's commands.
- Browser automation is the Playwright MCP server in `.mcp.json`: the devDependency
  `@playwright/mcp`, pinned to exactly `0.0.81`, run from `node_modules` through
  `yarn playwright-mcp` (no `yarn dlx`), configured by `playwright-mcp-config.json` (headless
  chromium, 1920x1080). An upgrade is a change to that pin in `package.json`.
