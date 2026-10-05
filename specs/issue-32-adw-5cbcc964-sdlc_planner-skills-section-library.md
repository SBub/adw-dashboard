# Feature: Skills section, a rendered library of Claude Code skills

## Metadata

issue_number: `32`
adw_id: `5cbcc964`
issue_json: `{"number":32,"title":"Skills section: a rendered library of Claude skills, starting with Server prefetch with hydration","body":"A Skills section in the dashboard: a library of the owner's Claude Code skills, rendered for reading. Content in skills/<name>/SKILL.md (official format: name, description, optional when_to_use, markdown body). First skill: server-prefetch-with-hydration, converted from apps/patterns/content/server-prefetch-hydration.mdx of SBub/issebya-homes-ai-system, under 200 lines. Routes: nav item Skills next to Projects; /skills lists name, description, when-to-use; /skills/[name] renders the body with a small server-side markdown renderer. Both static (generateStaticParams over the directories with the non-empty guard). Build-time check of every SKILL.md (valid frontmatter, name equals directory); unit test for the frontmatter parser. README Skills section; AGENTS.md rule that skills follow the official format only. Out of scope: installing skills, serving them to ADW runs, measuring their use, migrating the other patterns."}`

## Feature Description

A read-only Skills section for the dashboard. The repository gains a top-level
`skills/` directory holding the owner's Claude Code skills, one directory per
skill, each with a `SKILL.md` in the official Claude Code skill format
(https://code.claude.com/docs/en/skills): YAML frontmatter with `name` (equal to
the directory name), `description` and an optional `when_to_use`, followed by a
markdown body. Nothing else in the frontmatter, and no links to other
repositories at pinned commits.

The app renders that directory as two static routes:

- `/skills`: every skill with its name, description and when-to-use, each
  linking to its page.
- `/skills/[name]`: one skill, its frontmatter fields as a header and its body
  rendered as markdown by a small server-side renderer written for this repo
  (no client markdown library, no new dependency).

The root header gets a small section nav, "Projects" (`/`) and "Skills"
(`/skills`). The first skill is `server-prefetch-with-hydration`, rewritten from
the "Server prefetch with hydration" pattern as instructions an agent follows
while coding.

Every `SKILL.md` is validated when the app builds: the skills reader throws on a
missing file, malformed frontmatter, an unknown or duplicate key, a missing
`name`/`description`, an invalid name, or a `name` that differs from its
directory, and the build calls the reader (`/skills` and
`generateStaticParams`), so a bad skill fails `yarn build`. The same validation
also runs over the real files in the unit test suite.

## User Story

As the owner of the ADW toolkit and its dashboard
I want to read my Claude Code skills, rendered, in the same dashboard that shows my runs
So that the skills that steer agent coding have one canonical, reviewable home in the official format, ready for ADW to consume later

## Problem Statement

The coding patterns that agents should follow live as MDX documentation pages
in another repository (`apps/patterns` of SBub/issebya-homes-ai-system). They
are written for human readers (problem, mechanism, links to pinned commits), not
as Claude Code skills, and there is no place where skills in the official format
are kept, validated and readable. Later work (serving skills to ADW runs,
measuring their use) needs that place first.

## Solution Statement

- Content as files: `skills/<name>/SKILL.md` at the repository root, outside
  `src/`, so a skill is a plain file an agent can be pointed at and that a
  future ADW step can copy into `.claude/skills/` unchanged.
- Two pure, unit-tested helpers in `src/lib/`:
  - `skill-frontmatter.ts`: `parseSkillFile(source, directory)` splits the
    frontmatter from the body, parses a strict YAML subset (one
    `key: value` per line, plain, single-quoted or double-quoted scalars),
    and validates the fields; it throws an `Error` naming the problem.
  - `markdown.ts`: `parseMarkdown(source)` turns the body into a small typed
    block tree (headings, paragraphs, fenced code, flat lists, blockquotes,
    thematic breaks) with typed inline nodes (text, code span, strong,
    emphasis, link). No HTML string is ever produced.
- One server-only reader, `src/skills/index.ts`: `getSkills()` lists the
  directories under `skills/`, parses and validates each `SKILL.md`, and returns
  them sorted by name; `getSkill(name)` looks the name up in that list (it never
  builds a path from its argument) and returns `null` for an unknown name. It
  reads synchronously with `node:fs`, reads no clock and touches no database,
  so both routes prerender into the static shell with no cache scope needed.
- One server component, `src/components/Markdown.tsx`, maps the block tree to
  React elements (React escapes all text; links are only `http(s)`, root
  relative or `#` hrefs, anything else renders as plain text).
- Routes under `src/app/skills/` (outside the `(dashboard)` group, so no project
  sidebar, no project prefetch and no React Query provider):
  `page.tsx` (the list), `[name]/page.tsx` (one skill, with
  `generateStaticParams` and the non-empty guard), `[name]/loading.tsx` (the
  Suspense boundary for an unknown name at request time, as on the project
  route) and `not-found.tsx`.
- The header nav lives in the root layout as two plain `next/link`s, a server
  component, no `usePathname` (the root shell stays free of client hooks).

## Relevant Files

Use these files to implement the feature:

- `README.md`: gets a `## Skills` section (format, routes, validation, how to
  add one), a line in the intro list, and the two routes in `## Routing`.
- `AGENTS.md`: gets a `## Skills` rule section (official format only, the
  reader is the one place that reads `skills/`, the renderer is server-side and
  hand-written), and the `## Architecture` data rule is clarified so `@/skills`
  is the one source for skill content, beside `@/data` for the database.
- `.adw/project.md`: the Review section gains `/skills` and
  `/skills/server-prefetch-with-hydration` as paths to capture; the Tests
  section's description of the one test layer mentions the skills content test.
  Headings untouched.
- `src/app/layout.tsx`: root header, where the "Projects" / "Skills" nav goes.
- `src/app/(dashboard)/layout.tsx`: the two-pane shell the skills routes must
  NOT live under (it prefetches projects and opens Realtime); read for styling
  conventions only, not changed.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: the model for
  `generateStaticParams` with the non-empty placeholder guard and for
  `generateMetadata`.
- `src/app/(dashboard)/projects/[owner]/[repo]/loading.tsx`: the model for the
  `[name]/loading.tsx` Suspense fallback.
- `src/app/not-found.tsx`, `src/app/(dashboard)/not-found.tsx`: the model for
  `src/app/skills/not-found.tsx`.
- `src/components/PageHeader.tsx`, `src/components/SectionHeading.tsx`: styling
  conventions (neutral palette, `text-2xl font-semibold tracking-tight`, muted
  descriptions).
- `src/lib/status-colors.test.ts`: scans every file under `src/` for status
  hues; the new components and helpers must not use `emerald`, `amber`, `sky`,
  `rose` or `red` classes.
- `src/lib/project-route.ts` and its test: the model for a pure helper with a
  doc comment and a colocated test.
- `eslint.config.mjs`: `security/detect-unsafe-regex` (no nested quantifiers,
  so no `(?:-[a-z0-9]+)*` style patterns) and
  `security/detect-non-literal-fs-filename` (see Notes).
- `next.config.ts`: gets `outputFileTracingIncludes` for the `skills/` files.
- `knip.json`, `vitest.config.ts`, `lefthook.yml`, `package.json`: the gates;
  `vitest` includes `src/**/*.test.ts` only, so every new test lives under
  `src/`.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-static-params.md`:
  read before writing `generateStaticParams` under `cacheComponents`.
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`:
  `outputFileTracingIncludes`.
- Source of the first skill (read from GitHub, not copied verbatim):
  `gh api repos/SBub/issebya-homes-ai-system/contents/apps/patterns/content/server-prefetch-hydration.mdx -H "Accept: application/vnd.github.raw"`.

### New Files

- `skills/server-prefetch-with-hydration/SKILL.md`: the first skill.
- `src/lib/skill-frontmatter.ts`: pure frontmatter parser and validator, and
  the `Skill` type.
- `src/lib/skill-frontmatter.test.ts`: unit tests for the parser.
- `src/lib/markdown.ts`: pure markdown-to-block-tree parser and its types.
- `src/lib/markdown.test.ts`: unit tests for the markdown parser.
- `src/skills/index.ts`: the server-only reader (`getSkills`, `getSkill`).
- `src/skills/skills.test.ts`: validates every real `skills/*/SKILL.md` through
  `parseSkillFile` (the same check the build runs, on `yarn test`).
- `src/components/Markdown.tsx`: server component rendering the block tree.
- `src/components/SectionNav.tsx`: the header's "Projects" / "Skills" links
  (server component).
- `src/app/skills/page.tsx`: `/skills`, the list.
- `src/app/skills/[name]/page.tsx`: `/skills/[name]`, one skill.
- `src/app/skills/[name]/loading.tsx`: Suspense fallback for request-time names.
- `src/app/skills/not-found.tsx`: "No skill at this address" with a link back
  to `/skills`.

## Implementation Plan

### Phase 1: Foundation

Write the two pure helpers with their tests first (`skill-frontmatter.ts`,
`markdown.ts`), then the first skill's `SKILL.md`, then the reader that ties
files to the parser. At the end of this phase `yarn test` proves the parser,
the renderer's tree and the real skill file.

### Phase 2: Core Implementation

The `Markdown` server component, the two routes (`/skills`,
`/skills/[name]` with `generateStaticParams`, the placeholder guard,
`generateMetadata`, `loading.tsx`) and the skills `not-found.tsx`.

### Phase 3: Integration

The header nav in the root layout, `outputFileTracingIncludes` in
`next.config.ts`, and the documentation (README, AGENTS.md, `.adw/project.md`).
Then the full gate run and a build that proves both routes are static and the
HTML holds the skill.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the installed Next docs

- Read `generate-static-params.md` and the `outputFileTracingIncludes` part of
  `output.md` under `node_modules/next/dist/docs/01-app/03-api-reference/`.
  Confirm: under `cacheComponents` an empty `generateStaticParams` result fails
  the build, and a param outside the list is resolved at request time behind
  the segment's Suspense boundary (`loading.tsx`).

### 2. Frontmatter parser: `src/lib/skill-frontmatter.ts`

- Header comment in the style of `src/lib/project-route.ts`: pure, string in,
  value out, no `node:fs`.
- Export `interface Skill { name: string; description: string; whenToUse: string | null; body: string }`.
- Export `parseSkillFile(source: string, directory: string): Skill`. Rules,
  each a thrown `Error` whose message starts with `${directory}/SKILL.md: `:
  - Normalise `\r\n` to `\n`. The first line must be exactly `---`; the
    frontmatter ends at the next line that is exactly `---`. Missing opening or
    closing delimiter is an error.
  - Each non-empty frontmatter line is `key: value` (key `[a-z_]+`, split at
    the first `: `). A line that is not, an indented line (block scalars,
    nested maps and lists are outside the supported subset), a duplicate key,
    or a key other than `name`, `description`, `when_to_use` is an error.
  - A value wrapped in double quotes is unquoted with `\"` and `\\` unescaped; a
    value wrapped in single quotes is unquoted with `''` as one quote; anything
    else is the trimmed plain value. An empty value is an error.
  - `name` is required, at most 64 characters, lowercase letters, digits and
    hyphens only, with no leading, trailing or doubled hyphen. Check this with
    `/^[a-z0-9-]+$/` plus explicit `startsWith("-")`, `endsWith("-")` and
    `includes("--")` (no nested-quantifier regex: `security/detect-unsafe-regex`).
  - `name` must equal `directory`.
  - `description` is required. `when_to_use` is optional (`whenToUse: null`).
  - The body is everything after the closing delimiter, trimmed; an empty body
    is an error.
- Export `isSkillName(value: string): boolean` (the name rule above), used by
  the parser and by the reader.

### 3. Tests: `src/lib/skill-frontmatter.test.ts`

- A valid file parses to the expected `Skill` (plain, single-quoted and
  double-quoted values, with and without `when_to_use`, `\r\n` line endings).
- Each error rule above has a case: no opening `---`, no closing `---`, a
  non-`key: value` line, an indented continuation line, a duplicate key, an
  unknown key (`allowed-tools`, `title`), missing `name`, missing
  `description`, empty value, invalid names (`Server-Prefetch`, `-a`, `a-`,
  `a--b`, `a_b`, 65 characters), `name` different from the directory, empty
  body. Assert the message names the file.
- `isSkillName` truth table.

### 4. Markdown parser: `src/lib/markdown.ts`

- Pure. Export the types and `parseMarkdown(source: string): MdBlock[]`:
  - `MdInline = { type: "text"; value } | { type: "code"; value } | { type: "strong"; children: MdInline[] } | { type: "emphasis"; children: MdInline[] } | { type: "link"; href: string | null; children: MdInline[] }`.
  - `MdBlock = { type: "heading"; level: 1..4; children } | { type: "paragraph"; children } | { type: "code"; lang: string | null; title: string | null; value } | { type: "list"; ordered: boolean; items: MdInline[][] } | { type: "blockquote"; children: MdInline[] } | { type: "rule" }`.
- Block rules (line scanner, no regex with nested quantifiers):
  - A fence opens on a line starting with three backticks; the info string's
    first word is `lang`, a `title="..."` attribute is `title`; everything up
    to the next line that is exactly three backticks is `value` verbatim (no
    inline parsing). An unclosed fence runs to the end of the input.
  - `#` to `####` followed by a space is a heading.
  - Lines starting `- ` or `* ` form an unordered list, lines starting with
    digits then `. ` an ordered one; an indented continuation line joins the
    previous item; a blank line or another block ends the list.
  - `> ` lines form a blockquote; `---` alone is a rule; consecutive other
    lines form one paragraph (joined with a space); blank lines separate.
- Inline rules (a hand-written scanner): backtick code spans (content
  verbatim, no nesting), `**strong**`, `*emphasis*` and `_emphasis_` at word
  boundaries, `[text](href)`. An unmatched marker is literal text. `href` is
  kept only when it starts with `https://`, `http://`, `/` or `#`; otherwise
  `null` (rendered as plain text, so `javascript:` never becomes a link).

### 5. Tests: `src/lib/markdown.test.ts`

- One case per block type, including a fence with `lang` and `title`, a fence
  whose content holds `#`, `-` and `**` (stays verbatim), an unclosed fence,
  ordered and unordered lists with a continuation line, a paragraph spanning
  lines.
- Inline: code span containing `*`, strong and emphasis, nested emphasis in
  strong, a link, a `javascript:` link (`href: null`), unmatched `*` and
  backtick (literal text), `snake_case_word` (not emphasis).

### 6. The first skill: `skills/server-prefetch-with-hydration/SKILL.md`

- Read the source MDX from GitHub (command in Relevant Files). Rewrite it; do
  not copy its MDX frontmatter (`title`, `kind`, `tags`, `code`, `verifiedIn`,
  `updated`), its "In this repo" section, its `<CodeLinks />` or any link to a
  pinned commit. No emojis, no em-dashes.
- Frontmatter, exactly these three keys, one line each:
  - `name: server-prefetch-with-hydration`
  - `description:` one sentence, what the skill does: render a React Query
    client component with its data in the server HTML by prefetching on the
    server, dehydrating, and hydrating under the same key, so there is no
    loading state and no duplicate browser fetch.
  - `when_to_use:` when a Next.js App Router page (Server Components) shows
    data through a React Query client component that must be on screen at
    first paint (or the page shows a spinner then data, or the browser
    refetches what the server already rendered). Not for data the client never
    refetches, pages or mutates (render it in a Server Component), nor for
    per-user data inside a shared cache scope.
- Body, written as imperative instructions to an agent, in this order:
  1. `# Server prefetch with hydration` and one short paragraph of intent.
  2. `## Steps`, numbered: (1) create one shared module exporting the query
     key, the fetcher and the `QueryClient` factory (with the dehydrate rule
     that also hands over pending queries); (2) on the server, build a client
     from the factory, prefetch with `await queryClient.query({ queryKey, queryFn })`
     (`prefetchQuery` is deprecated in current React Query v5), and
     `dehydrate` it; under Cache Components, do this inside a `"use cache"`
     function because `dehydrate` reads `Date.now()`; (3) render
     `HydrationBoundary state={...}` below the client `QueryClientProvider`
     (the provider builds its one client from the same factory with a lazy
     `useState` initialiser); (4) in the client component call
     `useSuspenseQuery` with the same imported key and fetcher and
     `refetchOnMount: false`; (5) verify by viewing the page source: the data
     is in the HTML and the network tab shows no fetch on load.
  3. `## Files`: the four pasteable files as fenced code with `title`
     attributes (`app/items/query.ts`, `app/items/page.tsx`,
     `app/providers.tsx`, `app/items/ItemList.tsx`), adapted from the source:
     `query()` instead of `prefetchQuery`, and the page's prefetch moved into a
     `"use cache"` helper so it builds under Cache Components. A Suspense
     boundary around the list stays (it is the generic Next app, not this
     repo).
  4. `## Mistakes`, a short bullet list, each with the symptom and the fix:
     inline or hand-built key (cache miss, browser fetch on mount; import the
     one key); mount refetch left on (hydrated data refetched right after
     hydration; `refetchOnMount: false`); prefetch outside a cache scope under
     Cache Components (`next-prerender-current-time`); plain `useQuery` instead
     of the suspense variant (renders empty on a pending handover); a second
     hand-built `QueryClient` (dehydrate rules drift; one factory).
- The whole file stays under 200 lines (`wc -l`).

### 7. The reader: `src/skills/index.ts`

- Header comment: the one place that reads `skills/`; synchronous `node:fs`
  reads at build time, no clock, no database; why sync (the routes stay in the
  static shell with no cache scope); a bad file throws and fails the build on
  purpose (no fallback that skips it).
- `const SKILLS_DIR = path.join(process.cwd(), "skills")` (a static
  expression for `security/detect-non-literal-fs-filename`).
- `export function getSkills(): Skill[]`: `readdirSync(SKILLS_DIR, { withFileTypes: true })`,
  directories only, each read as `readFileSync(path.join(SKILLS_DIR, entry.name, "SKILL.md"), "utf8")`
  and passed to `parseSkillFile(source, entry.name)`; a directory without
  `SKILL.md` throws (`ENOENT` rethrown with the directory named); sorted by
  `name`. The `readFileSync` line carries the one
  `// eslint-disable-next-line security/detect-non-literal-fs-filename` with a
  reason comment (the path is built only from the fixed root and names
  returned by `readdirSync` of it, never from a request). See Notes.
- `export function getSkill(name: string): Skill | null`: `isSkillName(name)`
  first (else `null`), then `getSkills().find(...) ?? null`. It never builds a
  path from `name`.
- Keep the functions synchronous (`async` would add nothing and an awaited
  `fs/promises` read in a page body is request-time IO under
  `cacheComponents`).

### 8. Content test: `src/skills/skills.test.ts`

- Read every real file as text with Vite's
  `import.meta.glob("/skills/*/SKILL.md", { query: "?raw", import: "default", eager: true })`
  (same guard as `status-colors.test.ts` for the `unknown` typing), derive the
  directory from the path, and assert `parseSkillFile` does not throw for each.
- Assert the glob found `server-prefetch-with-hydration`, and that its file is
  under 200 lines.
- This duplicates the build's check on `yarn test` so a bad skill is caught on
  push, before a build.

### 9. `src/components/Markdown.tsx`

- Server component (no `"use client"`), `{ blocks: MdBlock[] }` props only; it
  parses nothing itself (the page calls `parseMarkdown`, keeping the component
  a renderer of what it is given, per AGENTS.md).
- Map blocks: headings to `h2`..`h4` (a body `#` renders as `h2`, the page owns
  the `h1`; level shifted by one, capped at `h4`), paragraphs to `p`, lists to
  `ul`/`ol` with `list-disc`/`list-decimal` and padding, blockquote with a
  neutral left border, rule to `hr`, code to `figure` with an optional
  `figcaption` (the title, mono, muted) above a `pre` with `overflow-x-auto`
  and a `code` carrying `data-lang`. Inline: `code` spans with a neutral
  background, `strong`, `em`, `a` (underline; external `http(s)` links get
  `rel="noopener noreferrer"` and `target="_blank"`; `href: null` renders the
  children as text).
- Neutral Tailwind classes only (no status hues; the status-colour guard scans
  this file). Keys from array indices are fine (static content).

### 10. `/skills`: `src/app/skills/page.tsx`

- `export const metadata = { title: "Skills | ADW Dashboard" }`.
- Calls `getSkills()`. Renders a container
  (`mx-auto max-w-3xl px-4 py-6`), an `h1` "Skills", one muted line ("Claude
  Code skills in the official format, rendered for reading."), then a list of
  cards, each a `next/link` to `/skills/${skill.name}` showing the name (mono,
  semibold), the description, and, when present, the when-to-use text under a
  small muted "When to use" label. Empty list: the dashed "No skills yet."
  panel in the style of `ProjectNav`'s.

### 11. `/skills/[name]`: `src/app/skills/[name]/page.tsx`, `loading.tsx`, `../not-found.tsx`

- `generateStaticParams()`: `getSkills().map(({ name }) => ({ name }))`; when
  the list is empty, return the placeholder `[{ name: "_none" }]` with the same
  comment as the project route (an empty result fails the build under
  `cacheComponents`; `_none` is not a valid skill name, so `getSkill` returns
  `null` and the page calls `notFound()`).
- `generateMetadata({ params })`: `getSkill(name)`, title
  `${name} | Skills | ADW Dashboard` or `"Not found"`.
- Page: `const { name } = await params`; `getSkill(name)` or `notFound()`.
  Renders a back link (`&larr; Skills` to `/skills`), the `h1` (skill name,
  mono), the description, the "When to use" block when present, a divider, and
  `<Markdown blocks={parseMarkdown(skill.body)} />`.
- `loading.tsx`: `<p className="...">Loading skill...</p>` with a comment like
  the project route's (the Suspense boundary for a name outside
  `generateStaticParams`, resolved at request time).
- `src/app/skills/not-found.tsx`: "No skill at this address." and a link to
  `/skills`, in the root `not-found.tsx` style.

### 12. Header nav: `src/components/SectionNav.tsx` and `src/app/layout.tsx`

- `SectionNav` is a server component: `<nav aria-label="Sections">` with two
  `next/link`s, "Projects" to `/` and "Skills" to `/skills`, small muted text
  with hover state. No `usePathname` and no active highlight (that would make
  the root header a client component that suspends on dynamic routes; see
  Notes).
- In `src/app/layout.tsx` render it right of the "ADW Dashboard" link (wrap the
  title and nav in a `flex items-center gap-6` group). Check the 375 px width:
  the right side ("AI Developer Workflow runs" and the pill) must not wrap
  badly; hide the descriptive span below `sm` (`hidden sm:inline`) if needed.

### 13. `next.config.ts`

- Add `outputFileTracingIncludes: { "/skills/[name]": ["./skills/**/*"], "/skills": ["./skills/**/*"] }`
  with a comment: the reader uses `process.cwd()`, which file tracing cannot
  follow, and a name outside `generateStaticParams` is read at request time,
  so the files must ship with the server output.

### 14. Documentation

- `README.md`:
  - Intro list: one bullet for the Skills section (`/skills`, `/skills/<name>`,
    header nav).
  - New `## Skills` section (after `## Routing`): the format (directory per
    skill, `SKILL.md`, the three allowed frontmatter keys and the supported
    YAML subset, `name` rules and equality with the directory, markdown body,
    no pinned-commit links), how the routes are built (sync reader in
    `src/skills/index.ts`, static, `generateStaticParams` with the `_none`
    guard, the hand-written renderer and what it supports), validation (build
    fails on a bad file; `src/skills/skills.test.ts` runs the same check), and
    "Adding a skill" in three steps (create `skills/<name>/SKILL.md`, run
    `yarn test`, run `yarn build`).
  - `## Routing`: mention `/skills` and `/skills/[name]` are outside the
    `(dashboard)` group (no sidebar, no Realtime), so the header's connection
    pill stays at `connecting` there.
- `AGENTS.md`:
  - New `## Skills` section: skills follow the official Claude Code skill
    format only (frontmatter `name`, `description`, optional `when_to_use`,
    nothing else; `name` equals the directory; markdown body; no links to
    other repositories at pinned commits; under 200 lines); `src/skills/index.ts`
    is the one reader of `skills/`, synchronous, and a bad file fails the build
    (no skip, no fallback); `getSkill` never builds a path from its argument;
    the renderer is `src/lib/markdown.ts` plus `src/components/Markdown.tsx`,
    server-side, no client markdown library and no `dangerouslySetInnerHTML`;
    every change to the parser or the renderer's grammar goes with a test case;
    the skills routes stay outside `(dashboard)` and static, and
    `generateStaticParams` keeps the `_none` guard.
  - `## Architecture`: the data rule names `@/skills` as the source for skill
    content (pages import `getSkills`/`getSkill` from there, not from
    `@/data`), and the server-component list notes `SectionNav` and `Markdown`
    have no `"use client"`.
- `.adw/project.md`: Review section adds `/skills` (list of skills) and
  `/skills/server-prefetch-with-hydration` (rendered skill) at both viewports;
  Tests section's description of the test layer adds the skill-file check in
  `src/skills/`. Do not rename or reorder its `##` headings.
- Grep every changed file for em-dashes (`grep -rn $'\u2014'`) and fix any.

### 15. Browser evidence for the review phase (E2E is `none`)

- No spec to add: the profile's E2E is `none` and there is no component test
  layer. The review phase captures, at desktop 1920x1080 and mobile 375x667,
  full page:
  - `/skills`: the header shows "Projects" and "Skills"; one card,
    `server-prefetch-with-hydration`, with its description and when-to-use.
  - `/skills/server-prefetch-with-hydration`: back link, name heading,
    description, when-to-use, then the rendered body: headings, a numbered
    step list, four code blocks with their file titles as captions,
    horizontally scrollable on mobile (no page-wide horizontal overflow), and
    the Mistakes list.
  - `/`: the header nav is present and the project sidebar is unchanged.
  - `/skills/does-not-exist`: the skills not-found panel.

### 16. Run the Validation Commands

- Run every command in `Validation Commands` below, in order, and fix anything
  that fails without weakening a rule, a type or a test.

## Testing Strategy

### Unit Tests

- `src/lib/skill-frontmatter.test.ts`: the parser's accepted subset, every
  validation error, `isSkillName`.
- `src/lib/markdown.test.ts`: every block and inline construct the renderer
  supports, verbatim fences, unsafe link hrefs dropped, unmatched markers kept
  as text.
- `src/skills/skills.test.ts`: every real `skills/*/SKILL.md` validates, the
  first skill exists and is under 200 lines.

### Test Coverage

- `src/lib/skill-frontmatter.test.ts` (vitest, `src/**/*.test.ts`): catches a
  parser that accepts an unknown key, a name that differs from its directory,
  or malformed frontmatter; fails without this feature (the module does not
  exist).
- `src/lib/markdown.test.ts` (vitest): catches a renderer regression such as
  inline-parsing inside a code fence or turning a `javascript:` href into a
  link; fails without this feature.
- `src/skills/skills.test.ts` (vitest): catches an invalid or missing skill
  file on `yarn test`, before a build; fails without this feature (no
  `skills/` directory, no parser).
- The routes, the nav and the `Markdown` component have no test layer here (no
  component tests, E2E `none`); their evidence is the build's static route
  table, the grep of the prerendered HTML in Validation Commands, and the
  review screenshots in task 15.

### Edge Cases

- Empty `skills/` directory: `/skills` shows "No skills yet.", and
  `generateStaticParams` returns the `_none` placeholder so the build passes.
- A `skills/<dir>` without `SKILL.md`, or with frontmatter whose `name`
  differs from `<dir>`: the build fails with a message naming the file.
- A name outside the static list (`/skills/does-not-exist`), an invalid name
  (`/skills/..%2F..`, `/skills/Foo`): `getSkill` returns `null` without
  touching the filesystem by that name, `notFound()` renders the skills
  not-found panel.
- Windows line endings in `SKILL.md`.
- Quoted frontmatter values containing `: ` or `#`.
- Code fences whose content contains markdown syntax, and long code lines on a
  375 px viewport (scroll inside the `pre`, not the page).
- Markdown links with `javascript:` or `data:` hrefs: rendered as text.

## Acceptance Criteria

- The header on every page shows "Projects" (to `/`) and "Skills" (to
  `/skills`).
- `/skills` lists `server-prefetch-with-hydration` with its name, description
  and when-to-use, linking to its page.
- `/skills/server-prefetch-with-hydration` renders the skill body as HTML
  (headings, lists, code blocks), produced on the server, with no client
  markdown library and no new dependency in `package.json`.
- `skills/server-prefetch-with-hydration/SKILL.md` has exactly the keys `name`,
  `description`, `when_to_use`; `name` equals the directory; the body reads as
  imperative steps with the four pasteable files and a short mistakes list; no
  pinned-commit links; under 200 lines; no em-dashes.
- A `SKILL.md` with invalid frontmatter or a mismatched name fails `yarn build`
  and `yarn test`.
- `yarn build` lists `/skills` as static and `/skills/[name]` as prerendered
  (SSG) with `/skills/server-prefetch-with-hydration` among its paths, and the
  prerendered HTML holds the skill's content.
- README has a Skills section; AGENTS.md has the skills format rule;
  `.adw/project.md` names the new review paths with its nine headings intact.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`
  and `yarn build` pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint`: ESLint, including the security rules the reader and the parsers
  must satisfy.
- `yarn typecheck`: `next typegen` then `tsc --noEmit`, covers the new routes'
  typed `params`.
- `yarn knip`: no unused files or exports among the new modules.
- `yarn format:check`: Prettier over the new TS, TSX and `SKILL.md`.
- `yarn test`: the three new test files and every existing one.
- `yarn build 2>&1 | tee /tmp/adw-5cbcc964-build.log`: the production build,
  which validates every `SKILL.md` and prerenders both routes.
- `grep -E "/skills" /tmp/adw-5cbcc964-build.log`: the route table shows
  `/skills` and `/skills/[name]` (with `/skills/server-prefetch-with-hydration`)
  as static or SSG, not dynamic.
- `grep -c "server-prefetch-with-hydration" .next/server/app/skills.html`: the
  list is in the prerendered HTML (non-zero).
- `grep -c "HydrationBoundary" .next/server/app/skills/server-prefetch-with-hydration.html`:
  the rendered body is in the prerendered HTML (non-zero).
- `test $(wc -l < skills/server-prefetch-with-hydration/SKILL.md) -lt 200`: the
  skill's length limit.
- `! grep -rn $'\u2014' skills src README.md AGENTS.md .adw/project.md next.config.ts`:
  no em-dashes in any touched file.

## Notes

- No new dependency. The markdown renderer and the frontmatter parser are
  hand-written on purpose (the issue asks for no client markdown library, and a
  strict YAML subset is easier to validate than a general YAML parser).
- One lint exception, flagged for the reviewer: `readFileSync` in
  `src/skills/index.ts` takes a path built from directory names, which
  `security/detect-non-literal-fs-filename` cannot prove static. The plan uses a
  single `eslint-disable-next-line` on that one call with a reason comment,
  not a config change. The path is never built from request input: `getSkill`
  validates the name and looks it up in the listing. If the reviewer rejects
  the inline disable, the alternative is a generated static index of imports,
  which loses "built from the directories".
- Synchronous reads are deliberate: under `cacheComponents` an awaited
  `fs/promises` read in a page body counts as request-time IO and would push
  the routes out of the static shell or require a `"use cache"` scope with a
  lifetime the content does not need (it only changes with a deploy).
- The header nav has no active state: highlighting needs `usePathname` in a
  client component in the root layout, which suspends on routes with
  request-time params and would make the header stream. Revisit if wanted.
- The skills routes sit outside `(dashboard)`, so `Providers` and the Realtime
  channel are not mounted there and the connection pill stays `connecting`;
  expected, documented in README, not a defect.
- The first skill adapts the source to current APIs (`queryClient.query()`
  rather than the deprecated `prefetchQuery`, the prefetch inside
  `"use cache"`), matching what this repository's AGENTS.md already requires.
- Out of scope, per the issue: installing skills, serving them to ADW runs,
  measuring their use, migrating the other patterns.
