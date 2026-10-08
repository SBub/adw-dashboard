# Chore: exclude trees/ and agents/ from TypeScript and ESLint

## Metadata

issue_number: `151`
adw_id: `ed6b1e75`
issue_json: `{"number":151,"title":"chore: exclude trees/ and agents/ from TypeScript and ESLint","body":"ADW runs create git worktrees under trees/<adw_id>/ (and logs under agents/<adw_id>/) inside this checkout. Both are gitignored, but TypeScript and ESLint still scan them, so the main checkout's checks depend on whatever code the in-flight runs have. Change: tsconfig.json exclude node_modules, trees, agents; eslint.config.mjs add trees/** and agents/** to the global ignores; update .adw/project.md if it lists check commands or ignored paths. Acceptance: with a worktree under trees/, tsc --listFilesOnly lists nothing under trees/ or agents/, eslint reports no file there; build, lint, typecheck, knip, test pass."}`

## Chore Description

ADW runs create git worktrees under `trees/<adw_id>/` and write logs under `agents/<adw_id>/`
inside the main checkout. Both directories are gitignored, but:

- `tsconfig.json` has `"include": ["**/*.ts", "**/*.tsx", ...]` and `"exclude": ["node_modules"]`,
  so `tsc --noEmit` (`yarn typecheck`) and the type-check step of `next build` (`yarn build`) pick up
  every `.ts`/`.tsx` file of every in-flight worktree (250 files on 2026-10-08). A worktree on newer
  code fails the main checkout's build: `trees/0093e1de/src/components/RunRow.tsx(2,28): error
TS2307: Cannot find module '@/lib/run-phase'` (its `@/*` alias resolves to the main checkout's
  `src/`, not the worktree's).
- `eslint.config.mjs` ignores only `.next/**` and `next-env.d.ts`; flat config does not read
  `.gitignore`, so `eslint .` (`yarn lint`) lints 515 extra files under `trees/` and `agents/`.
- lefthook's pre-commit `yarn lint` and `yarn typecheck` in the main checkout therefore lint and
  typecheck every worktree.

Prettier (reads `.gitignore`), Vitest (`include: ["src/**/*.test.ts"]`) and Knip (`project` is
`src/**`) are already unaffected and are not touched.

The fix is two config lines. Inside a run's own worktree there is no nested `trees/` (an
`agents/<adw_id>/` there holds only review screenshots, never source), so a run's own checks keep
scanning exactly its own `src/` and root config files.

## Relevant Files

Use these files to resolve the chore:

- `tsconfig.json` - its `exclude` array is the TypeScript change: add `"trees"` and `"agents"`.
  Used by both `yarn typecheck` (`tsc --noEmit`) and `next build`'s type check.
- `eslint.config.mjs` - the final config object holds the global `ignores`
  (`[".next/**", "next-env.d.ts"]`); add `"trees/**"` and `"agents/**"` there. An object whose only
  key is `ignores` is a global ignore in flat config, so the new entries apply to every config.
- `.adw/project.md` - the ADW profile. Its Tests section already says which paths knip and vitest
  scan; add the matching fact that lint and typecheck skip `trees/` and `agents/`, so a later run
  does not re-add or remove the exclusion blindly. Keep the nine `##` headings untouched.
- `.gitignore` - read only: confirms `agents/` and `trees/` are ignored and explains why (no change).
- `package.json` - read only: `lint` is `eslint .`, `typecheck` is `next typegen && tsc --noEmit`,
  `build` is `next build` (no change).
- `lefthook.yml` - read only: pre-commit runs `yarn lint` and `yarn typecheck`, which is where the
  slowdown shows up (no change).
- `knip.json`, `vitest.config.ts` - read only: confirm Knip and Vitest are already scoped to `src/`
  (no change).
- `AGENTS.md` - rules: Yarn only, no em-dashes, update `.adw/project.md` in the same change, never
  rename or reorder its nine `##` headings.
- `docs/conditional-docs.md` - checked: no feature doc covers tooling config, so no `app_docs/`
  file applies and none is added (a config change needs no feature doc).

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Exclude trees/ and agents/ from TypeScript

- In `tsconfig.json`, change `"exclude": ["node_modules"]` to
  `"exclude": ["node_modules", "trees", "agents"]`.
- Do not touch `include` or any compiler option. `exclude` paths are relative to `tsconfig.json`,
  so these only match the root-level `trees/` and `agents/` directories.

### 2. Exclude trees/ and agents/ from ESLint

- In `eslint.config.mjs`, change the global ignores object to
  `ignores: [".next/**", "next-env.d.ts", "trees/**", "agents/**"]`.
- Keep it as an object with only `ignores` (adding any other key would turn it into a
  per-config ignore and the worktrees would be linted again).

### 3. Record the fact in the ADW profile

- In `.adw/project.md`, Tests section, in the first paragraph, extend the lint and typecheck
  entries so they say both skip `trees/` and `agents/` (for example: lint `yarn lint` (autofix
  `yarn lint:fix`; `eslint.config.mjs` ignores `trees/**` and `agents/**`); typecheck
  `yarn typecheck` (... `tsconfig.json` excludes `trees` and `agents`)).
- Do not add, rename or reorder any `##` heading. No em-dashes.

### 4. Prove the exclusion with a temporary probe (then remove it)

The worktree has no `trees/` or `agents/` of its own, so create a throwaway one that would fail
both checks if it were scanned, run the acceptance commands, then delete it. Never touch the main
checkout two directories up.

- `mkdir -p trees/probe0000/src agents/probe0000`
- Write `trees/probe0000/src/broken.ts` containing a type error and a lint error, for example:
  `import { nothing } from "@/lib/does-not-exist"; const x: number = "a"; eval(String(x)); export { nothing };`
  and copy the same file to `agents/probe0000/broken.ts`.
- Run `yarn tsc --noEmit --listFilesOnly | grep -c "/trees/\|/agents/"`: must print `0` (grep exits 1
  on a zero count; the printed `0` is the pass).
- Run `yarn eslint . -f json | grep -c '"filePath":"[^"]*/\(trees\|agents\)/'`: must print `0`.
- Run `yarn typecheck` and `yarn lint`: both must pass with the probe present.
- Optionally, to confirm the probe is a real negative, revert step 1 locally, see `yarn typecheck`
  fail on `trees/probe0000/src/broken.ts`, and restore step 1.
- `rm -rf trees agents` (only the probe directories this step created; check with `ls trees agents`
  first that nothing else is in them). Both are gitignored, but they must not be left behind.

### 5. Run the validation commands

- Run every command in `Validation Commands` below, in order, and confirm each passes.
- `yarn typecheck` rewrites the gitignored `next-env.d.ts`; never stage it.

## Test Coverage

No test needed: this is a pure tooling-config change (`tsconfig.json` exclude, ESLint global
ignores, one profile sentence) with no runtime code path. The project's only test layer is Vitest
over `src/**/*.test.ts`, which cannot observe which files `tsc` or `eslint` scan. The behaviour is
proven instead by step 4's temporary probe under `trees/` and `agents/`, which fails `yarn typecheck`
and `yarn lint` without this change and passes with it. No E2E spec or `e2e/*.md` journey either:
nothing user-visible changes and the profile's E2E code suite is `none`.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint` - ESLint over the repository with the new global ignores; must pass.
- `yarn typecheck` - `next typegen` then `tsc --noEmit` with the new `exclude`; must pass.
- `yarn knip` - dead-code check, confirms nothing in the config change affects it.
- `yarn format:check` - Prettier over the edited `tsconfig.json`, `eslint.config.mjs`,
  `.adw/project.md` and the plan.
- `yarn test` - Vitest unit suite, zero regressions.
- `yarn build` - `next build`, whose type-check step reads the same `tsconfig.json`; must pass
  (needs `.env.local`, copied at install).

## Notes

- The acceptance criterion "pass in the main checkout while a worktree on different code exists"
  is reproduced in step 4 by the probe instead of running checks in the main checkout, which this
  run must not touch.
- Why `@/*` in a worktree file broke the main build: `paths` resolves `@/*` against the main
  checkout's `tsconfig.json` directory, so a worktree file importing a module only its own branch
  has fails to resolve. Excluding `trees` removes those files from the program entirely.
- `.next/types/**/*.ts` stays in `include`; it is under `.next/`, not affected by the new excludes.
- Prettier needs no change: it already honours `.gitignore`.
- Commit as `chore: ...`, no trailers.
