# ADW Dashboard

A public dashboard for runs of the AI Developer Workflow (ADW) toolkit across
projects. One two-pane screen:

- The left pane is a persistent sidebar listing every project with its
  running, completed and failed counts and the time its last run started. It
  lives in a shared layout (`src/app/(dashboard)/layout.tsx`), so it keeps its
  state and scroll position when the selection changes. Below the `md`
  breakpoint it becomes a horizontal strip above the detail.
- The right pane shows the selected project's runs: an Active section for
  runs in progress (phase, branch, last update, a stale marker) and a History
  section for finished runs (final phase, timings, duration) with an
  all/completed/failed toggle. `/` shows an empty "Select a project" panel;
  `/projects/<owner>/<repo>` selects a project and is the deep link.

## Status: unwired UI

This iteration is bare UI rendered from hand-written fixture data in
`src/data/fixtures.ts`. There is no database, no fetching, no environment
variables, no realtime and no computed values: wherever the real application
would compute something (counts, staleness, duration labels, "updated 2m ago"),
the fixture simply contains it. The fixture "now" is 2026-10-02T12:00:00Z.

`src/data/index.ts` is the single boundary the screens read through. It
exports two functions:

- `getProjects(): ProjectSummary[]`
- `getProjectRuns(slug): { project; active; history } | null`

Wiring a real data source means replacing that one file while keeping those
two signatures. Nothing under `src/app/` or `src/components/` imports from
anywhere else for data.

## Types

`src/types/adw.ts` has two sections. `Project` and `Run` mirror the database
tables column for column. `ProjectSummary` and `RunView` are view models the
screens need that the database does not store (counts, `is_stale`,
`duration_label`, `since_update_label`); the data layer is responsible for
producing them.

## Routing

Project slugs are `owner/repo`, so the detail page is a catch-all segment,
`src/app/(dashboard)/projects/[...slug]/page.tsx`. `/projects/SBub/adw-toolkit`
arrives as `["SBub", "adw-toolkit"]` and is joined back into the slug. An
unknown slug calls Next's `notFound()`, which renders
`src/app/(dashboard)/not-found.tsx` inside the two-pane shell; URLs that match
no route at all fall through to the root `src/app/not-found.tsx`.

## Running it

Requires Node 24 (see `.nvmrc`) and Yarn 4.6.0 via corepack. Yarn only, never
npm or npx.

```sh
yarn install   # also installs the git hooks (lefthook) through postinstall
yarn dev       # http://localhost:3000, or PORT=3101 yarn dev
```

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

## Git hooks

`lefthook.yml` runs format (staged files, re-staged), lint, typecheck and knip
in parallel on every commit. Hooks are installed by `yarn install`; there is no
manual step. There is no pre-push hook because this iteration has no test
script; add one together with the first tests.

## Stack

Next.js 16 (App Router), React 19, TypeScript 5.9 strict, Tailwind CSS v4 via
`@tailwindcss/postcss`. No component or icon library. Light and dark themes
follow the system preference through Tailwind's `dark:` variants.
