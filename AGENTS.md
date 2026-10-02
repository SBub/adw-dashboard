# Agent instructions

Behavioural rules for working in this repository. Reference material (what the
app is, how to run it, scripts) lives in `README.md`, not here.

## Tooling

- Yarn only (4.6.0 Berry, pinned via `packageManager` and corepack). Never npm
  or npx; `yarn dlx` if a one-off binary is unavoidable.
- lefthook runs on every commit: Prettier on staged files (re-staged
  automatically), `yarn lint`, `yarn typecheck`, `yarn knip`. Hooks install
  through `postinstall` on `yarn install`. Do not bypass them.
- Conventional-commit messages (`feat:`, `fix:`, `chore:`, `docs:`). No
  trailers of any kind: no `Co-Authored-By`, no `Signed-off-by`.
- Default branch is `develop`.
- `next dev` in Next 16 wants to write its own `AGENTS.md` and `CLAUDE.md`.
  That is switched off in `next.config.ts` (`agentRules: false`); these two
  files are maintained by hand. Still read the relevant guide under
  `node_modules/next/dist/docs/` before Next.js work; the framework moves
  faster than training data.
- No em-dashes in any file. Use commas, periods, colons or parentheses.

## Architecture

- Components take typed props only. They never fetch, compute, count or
  format business values; they render what they are given.
- Fixtures satisfy the types. `src/data/fixtures.ts` is typed as
  `ProjectSummary[]` and `RunView[]`, so a fixture that drifts from the types
  fails `yarn typecheck`.
- Wiring happens at one boundary, `src/data/`. Pages import `getProjects` and
  `getProjectRuns` from `@/data` and nothing else for data. A real data source
  replaces `src/data/index.ts` while keeping those two signatures.
- `src/types/adw.ts` keeps database-row types (`Project`, `Run`) and view
  models (`ProjectSummary`, `RunView`) in clearly separated sections. Row
  types mirror the schema column for column; view models are produced by the
  data layer.
- Server components by default; `"use client"` only where the browser must
  hold state (currently the History filter in `RunHistory`).
- `Timestamp` renders ISO strings by substring on purpose so server and client
  markup agree. Do not introduce locale or timezone formatting in components.
