# ADW Dashboard

A public dashboard for runs of the AI Developer Workflow (ADW) toolkit across projects. `/` is the
summary of finished runs per UTC day across projects. `/projects` is a two-pane screen: a sidebar
of projects and, for the selected project, its Active runs, its Queue and its History.

## Documentation

How each feature works, and the rules it follows, is in one doc per feature under `app_docs/`.
[`docs/conditional-docs.md`](docs/conditional-docs.md) indexes them and says when to read each one.

- [Screens and components](app_docs/screens-and-components.md)
- [Routing and navigation](app_docs/routing-and-navigation.md)
- [Types](app_docs/types.md)
- [Data boundary and query layer](app_docs/data-boundary.md)
- [Clock reads and prerendering](app_docs/clock-and-prerender.md)
- [Active runs](app_docs/active-runs.md)
- [Project page: Active, Queue and History sections](app_docs/project-page.md)
- [History revalidation and caching](app_docs/history-revalidation.md)
- [Error and loading boundaries](app_docs/error-and-loading-boundaries.md)
- [Realtime](app_docs/realtime.md)
- [Summary page](app_docs/summary.md)

## Running it

Requires Node 24 (see `.nvmrc`) and Yarn 4.6.0 via corepack. Yarn only, never
npm or npx.

```sh
yarn install   # also installs the git hooks (lefthook) through postinstall
cp .env.example .env.development && cp .env.example .env.local   # then fill in the real values
yarn dev       # http://localhost:3000, or PORT=3101 yarn dev
```

## ADW

This repository can be worked by the [ADW toolkit](https://github.com/SBub/adw-toolkit): a
GitHub issue goes in, and a plan, an implementation, a test run, a review and a pull request
against `develop` come out, each run in its own git worktree under `trees/<adw_id>/` on its own
port. The toolkit is never committed here; it is symlinked in from its own checkout.

The one way onto the queue is the GitHub label `adw:queued` on an issue. The webhook trigger (or
the runner's offline sweep) puts the issue in the queue, and `uv run adws/adw_queue.py run --apply`
works it one issue at a time, merging each pull request before the next starts; see the
toolkit's `adws/QUEUE.md`. GitHub access is whatever `gh auth login` provides; no personal access
token is configured.

What the toolkit reads here:

- `.adw/project.md`, the committed ADW profile: how to install, build and test this app, which
  port it runs on, what is protected, and where plans (`specs/`), the feature docs (`app_docs/`) and their index
  (`docs/conditional-docs.md`) go. Its nine headings are a contract with the toolkit's slash commands.
- `.env.development`, which carries the toolkit's keys (`CLAUDE_CODE_PATH`, `ADW_PROJECT_ROOT`,
  `ADW_BASE_BRANCH`, `ADW_UI_DISPLAY_NAME`; see `.env.example`) next to the app's own.
- `.mcp.json` and `playwright-mcp-config.json`, the Playwright MCP server the review phase
  screenshots the app with. Every Claude invocation runs with `--strict-mcp-config`, so only servers
  declared there reach a run.

One-time setup in a checkout, after cloning the toolkit beside this repository:

```sh
ln -s /path/to/adw-toolkit/adws adws
mkdir -p .claude && ln -s /path/to/adw-toolkit/commands .claude/commands
```

`adws`, `.claude`, `agents/`, `trees/` and `.ports.env` are gitignored.

## Scripts

| Script              | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `yarn dev`          | Next dev server                                      |
| `yarn build`        | Production build                                     |
| `yarn start`        | Serve the production build                           |
| `yarn typecheck`    | `next typegen` then `tsc --noEmit`                   |
| `yarn lint`         | ESLint (Next, Prettier compat, security, no-secrets) |
| `yarn lint:fix`     | ESLint with autofix                                  |
| `yarn format`       | Prettier, write                                      |
| `yarn format:check` | Prettier, check only                                 |
| `yarn knip`         | Unused files, exports and dependencies               |
| `yarn test`         | Unit tests (vitest, `src/**/*.test.ts`)              |

## Git hooks

`lefthook.yml` runs format (staged files, re-staged), lint, typecheck and knip
in parallel on every commit, and `yarn test` on every push. Hooks are installed
by `yarn install`; there is no manual step.

## Stack

Next.js 16 (App Router), React 19, TypeScript 5.9 strict, Tailwind CSS v4 via
`@tailwindcss/postcss`, TanStack React Query 5 for the query cache (sidebar and
active runs; history is server-rendered),
`@supabase/supabase-js` for Realtime, vitest for unit tests. No component or
icon library. Light and dark themes follow the system
preference through Tailwind's `dark:` variants. The page colour is defined once,
as `--background` and `--foreground` in `src/app/globals.css`, painted on both
`html` and `body` with `color-scheme: light dark` (so the canvas, scrollbar
gutter and overscroll match the content), and exposed to Tailwind as
`bg-background` for an element that must match it.
