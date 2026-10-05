# Chore: Remove the Skills section for now

## Metadata

issue_number: `63`
adw_id: `a6d2347d`
issue_json: `{"number":63,"title":"Remove the Skills section for now","body":"## Why\nThe Skills library (#32, PR #56) shipped as a rendered list with one skill, but it does not make sense yet: nothing consumes the skills (#53) and nothing measures their use (#54), so the section is a page with no purpose on a public dashboard. Remove it until the consumption mechanism exists; the content is kept in git history and can come back with that work.\n\n## What to build\n- Remove the Skills nav item, the `/skills`and`/skills/[name]`routes, the`skills/`content directory, the frontmatter parser and its test, the build-time validation, and the related README and AGENTS.md text.\n- Keep the git history intact (a normal removal commit, no history rewrite), and reference #32 and this issue in the commit message so the work can be restored.\n- knip must stay clean after the removal (no orphaned helpers); the nav keeps only Projects and, when #55 is promoted, Summary.\n\n## Acceptance\n- No Skills link in the header;`/skills`returns the not-found page.\n-`yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` pass.\n\n## Out of scope\nDeciding the consumption mechanism (#53)."}`

## Chore Description

The Skills library (#32, PR #56) is a read-only rendering of `skills/<name>/SKILL.md` files at `/skills` and `/skills/[name]`. Nothing consumes the skills yet (#53) and nothing measures their use (#54), so the section is removed until that exists. The removal is a plain deletion commit (no history rewrite) whose message references #32 and #63 so the work can be restored with `git revert` or by checking out the files from history.

Everything that exists only for the Skills section goes:

- the `Skills` link in `SectionNav` (the header keeps `Projects` and `Summary`, since #55 has already shipped `/summary` on this branch);
- the routes under `src/app/skills/` (`page.tsx`, `not-found.tsx`, `[name]/page.tsx`, `[name]/loading.tsx`);
- the content directory `skills/` (one file, `skills/server-prefetch-with-hydration/SKILL.md`);
- the reader and its build-time validation test, `src/skills/index.ts` and `src/skills/skills.test.ts`;
- the frontmatter parser and its test, `src/lib/skill-frontmatter.ts` and `src/lib/skill-frontmatter.test.ts`;
- the markdown renderer, which has no other consumer: `src/lib/markdown.ts`, `src/lib/markdown.test.ts` and `src/components/Markdown.tsx` are imported only by `src/app/skills/[name]/page.tsx`. Leaving them would make knip report them as unused files, which the issue forbids ("no orphaned helpers");
- `outputFileTracingIncludes` in `next.config.ts`, whose only entries are `/skills` and `/skills/[name]`;
- the Skills text in `README.md`, `AGENTS.md` and the ADW profile `.adw/project.md` (Tests and Review sections).

After the change `/skills` matches no route and falls through to the root `src/app/not-found.tsx` with a 404, which is the acceptance criterion; no new not-found file is needed.

## Relevant Files

Use these files to resolve the chore:

- `src/components/SectionNav.tsx` - the header's section links; holds the `Skills` `<Link href="/skills">` to delete. `Projects` and `Summary` stay.
- `src/app/skills/page.tsx` - the `/skills` list route; delete.
- `src/app/skills/not-found.tsx` - the skill-specific not-found page; delete (the root `src/app/not-found.tsx` takes over).
- `src/app/skills/[name]/page.tsx` - the `/skills/[name]` route with its `_none` `generateStaticParams` placeholder; delete. It is the only importer of `Markdown`, `parseMarkdown` and `@/skills`.
- `src/app/skills/[name]/loading.tsx` - the segment's Suspense fallback; delete.
- `skills/server-prefetch-with-hydration/SKILL.md` - the only skill content file; delete (the whole `skills/` directory goes).
- `src/skills/index.ts` - `getSkills` / `getSkill`, the one reader of `skills/`; delete.
- `src/skills/skills.test.ts` - the build-time validation of every real `SKILL.md`; delete.
- `src/lib/skill-frontmatter.ts` and `src/lib/skill-frontmatter.test.ts` - `parseSkillFile`, `isSkillName`, `Skill`; delete.
- `src/lib/markdown.ts`, `src/lib/markdown.test.ts`, `src/components/Markdown.tsx` - the hand-written markdown renderer used only by the skill page; delete so knip stays clean.
- `next.config.ts` - drop the `outputFileTracingIncludes` block and its comment (both keys are skills routes); keep everything else unchanged.
- `src/app/not-found.tsx` - read only: the root not-found page that `/skills` will render after the removal. No change.
- `README.md` - remove the Skills paragraph in the intro (lines ~26-31, rewrite so the header links read "Projects" and "Summary"), the `/skills` paragraph in the routes/not-found part (lines ~1107-1112, keep the `/summary` sentence and reword it so it no longer says "for the same reasons" against a removed subject), and the whole `## Skills` section with its `### Format`, `### Routes`, `### Validation` and `### Adding a skill` subsections (lines ~1172-1229).
- `AGENTS.md` - remove the "Skill content is not data..." sentence in the `src/data/` boundary bullet (lines ~66-68), `Markdown` from the list of stateless server components (line ~234), and the whole `## Skills` section (lines ~483-503).
- `.adw/project.md` - the ADW profile. Tests section (line ~69): drop "and the check of every `skills/*/SKILL.md` in `src/skills/`". Review section (lines ~122-123): drop the `/skills` and `/skills/server-prefetch-with-hydration` screenshot targets. Keep all nine `##` headings and their order untouched.
- `knip.json`, `vitest.config.ts`, `eslint.config.mjs`, `.prettierignore`, `tsconfig.json` - read only: confirmed to contain no skills-specific entry, so no change. `vitest.config.ts` picks up `src/**/*.test.ts`, so deleting the three test files simply removes them from the run.

### New Files

None.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Remove the header link

- In `src/components/SectionNav.tsx`, delete the `<Link href="/skills">Skills</Link>` element. Leave the `Projects` and `Summary` links and the component comment as they are.

### 2. Delete the routes, the content and the code that only they use

- `git rm -r src/app/skills skills src/skills`
- `git rm src/lib/skill-frontmatter.ts src/lib/skill-frontmatter.test.ts src/lib/markdown.ts src/lib/markdown.test.ts src/components/Markdown.tsx`
- Run `grep -rniE "skill|markdown|@/skills" src next.config.ts` and confirm the only hits left are the ones handled in step 3 (none should remain in `src/`).

### 3. Clean up `next.config.ts`

- Delete the `outputFileTracingIncludes` property and the three-line comment above it ("Ship skills/ with the server output..."). Nothing else in the config changes (`cacheComponents`, `turbopack.root`, `agentRules: false`, `experimental.staleTimes.dynamic: 300` all stay).

### 4. Update `README.md`

- Intro: delete the "Beside it, a read-only Skills section..." paragraph's Skills sentences and rewrite it so it introduces `/summary` as the second section and says the header's "Projects" and "Summary" links switch between them.
- Routes / not-found part: delete the `/skills` and `/skills/[name]` paragraph text and keep the `/summary` facts as a standalone statement (`/summary` (`src/app/summary/`) sits outside the `(dashboard)` group: no project sidebar, no project prefetch, no `Providers` and no Realtime channel, so the header's connection pill stays at `connecting` there).
- Delete the whole `## Skills` section through the end of `### Adding a skill` (up to, not including, `## Running it`).
- `grep -niE "skill|markdown" README.md` returns nothing afterwards. No em-dashes in any added text.

### 5. Update `AGENTS.md`

- In the "Wiring happens at one boundary, `src/data/`" bullet, delete the sentence "Skill content is not data: the skills pages import `getSkills` and `getSkill` from `@/skills` (see "Skills"), never from `@/data`." and keep the surrounding sentences flowing.
- In the "Server components by default" bullet, remove `Markdown` from the list `HistoryLinks`, `RunHistoryList`, `SectionNav`, `Markdown`, `SummaryFilters`, ...
- Delete the whole `## Skills` section (the five bullets), leaving `## Summary` followed directly by `## Realtime and Supabase`.
- `grep -niE "skill|markdown" AGENTS.md` returns nothing afterwards. `CLAUDE.md` is an include and needs no edit.

### 6. Update the ADW profile `.adw/project.md`

- Tests section: change "pure reducers in `src/data/`, helpers in `src/lib/`, the pinned hydration rule, and the check of every `skills/*/SKILL.md` in `src/skills/`." to "pure reducers in `src/data/`, helpers in `src/lib/` and the pinned hydration rule."
- Review section: remove "plus `/skills` (list of skills), `/skills/server-prefetch-with-hydration` (rendered skill)," so the list reads `/`, the project page, `/summary` and `/summary?project=...`. Re-wrap the paragraph; do not touch any `##` heading.

### 7. Format and verify there are no leftovers

- `yarn format` to re-wrap the edited markdown and TSX.
- `git grep -niE "skill|parseMarkdown|Markdown\b"` over tracked files outside `specs/` and `docs/agentic-kpis.md` returns nothing.
- `git status` shows only deletions and edits to `SectionNav.tsx`, `next.config.ts`, `README.md`, `AGENTS.md`, `.adw/project.md` (plus this spec). Never stage `next-env.d.ts`, `.ports.env`, `.env*`, `agents/` or `trees/`.

### 8. Commit message guidance

- A normal commit (no history rewrite, no `--no-verify`), Conventional Commits with a bare type, for example `chore: remove the skills section (#63)`, with a body line saying the Skills library from #32 (PR #56) is removed until the consumption mechanism (#53) exists and can be restored from this commit's parent. No trailers of any kind, per the profile's Documentation section.

### 9. Run the Validation Commands

- Run every command in `Validation Commands` below, in order, and fix anything that fails without weakening a rule, a type or a test.

## Test Coverage

No test needed: this change deletes a feature together with its own tests (`src/skills/skills.test.ts`, `src/lib/skill-frontmatter.test.ts`, `src/lib/markdown.test.ts`) and adds no behaviour. The only remaining unit-test layer (`src/**/*.test.ts`) has nothing to assert about a route that no longer exists, and the project has no component or E2E layer (profile: E2E `none`). The removal is proven by `yarn knip` (no orphaned helper), `yarn typecheck` and `yarn build` (no dangling import, the route table no longer contains `/skills`), and by the review phase's browser evidence below.

No E2E spec or `e2e/*.md` journey is added: the profile says E2E `none`. The review phase should screenshot, at desktop 1920x1080 and mobile 375x667, full page:

- `/` - the header shows only `Projects` and `Summary`, no `Skills` link;
- `/skills` - the root "Not found" page ("There is nothing at this address.");
- `/skills/server-prefetch-with-hydration` - the same root "Not found" page;
- `/summary` - still renders and its header has no `Skills` link.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint` - ESLint over the tree; catches a stale import or an unused disable comment left behind.
- `yarn typecheck` - `next typegen` regenerates route types without `/skills`, then `tsc --noEmit` catches any reference to the deleted modules.
- `yarn knip` - the issue's explicit requirement: no unused file, export or dependency left by the removal (in particular no orphaned markdown or frontmatter helper).
- `yarn format:check` - Prettier on the edited `README.md`, `AGENTS.md`, `.adw/project.md`, `next.config.ts` and `SectionNav.tsx`.
- `yarn test` - the remaining vitest suite still passes with the three skills-related test files gone.
- `yarn build` - the production build succeeds without the skills routes and `outputFileTracingIncludes`; its route list must not contain `/skills` or `/skills/[name]` (needs `.env.local`).

## Notes

- `/summary` (#55) is already merged on this branch (`a90828d`), so the nav keeps `Projects` and `Summary`; do not remove the Summary link.
- The markdown renderer is removed along with the skills because the skill page is its only consumer; knip would otherwise flag `src/lib/markdown.ts` and `src/components/Markdown.tsx`. It comes back with the skills when #53 lands, from the same commit.
- `docs/agentic-kpis.md` and existing `specs/` files mention skills historically; leave them unchanged (they are records, not documentation of the current code).
- No dependency changes: the renderer and parser were hand-written, so `package.json` and `yarn.lock` stay untouched.
- Do not start the dev server outside the review phase, and if it is started use the port from `.ports.env`.
