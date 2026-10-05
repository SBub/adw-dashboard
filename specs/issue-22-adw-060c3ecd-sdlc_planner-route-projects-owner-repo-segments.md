# Chore: Route project pages as /projects/[owner]/[repo] instead of a catch-all slug

## Metadata

issue_number: `22`
adw_id: `060c3ecd`
issue_json: `{"number":22,"title":"Route project pages as /projects/[owner]/[repo] instead of a catch-all slug"}`

## Chore Description

Project pages live at `src/app/(dashboard)/projects/[...slug]/page.tsx`. The catch-all hides that
the path always has exactly two parts, `owner` and `repo`, and it lets `/projects/SBub` and
`/projects/SBub/adw-dashboard/extra` reach the page (they become a slug lookup that ends in
`notFound()`). The slug itself (`owner/repo`) is right and stays the key everywhere: it is what the
toolkit derives from the git remote, the tenant key in the database, the spelling of the cache tags
and query keys, and it mirrors the GitHub URL. The project id (a UUID) must not appear in URLs.

The chore moves the route to two named segments, `src/app/(dashboard)/projects/[owner]/[repo]/`,
and assembles the slug from them in exactly one place, the page:

- `const { owner, repo } = await params; const slug = \`${owner}/${repo}\`;`
- Everything below that line (the data boundary, `queryKeys.runs(slug)`, the `runs:<slug>` and
  `history:<slug>` tags, the bookmark scope, `revalidateHistory(slug)`) keeps taking the slug
  unchanged.
- `generateStaticParams` returns `{ owner, repo }` pairs split from `getProjects()` slugs, keeping
  the non-empty guard (placeholder pair `{ owner: "_", repo: "none" }`).
- `generateMetadata` and the page keep reading through the cached `getRunsState(slug)`.

URLs are byte-for-byte the same (`/projects/${slug}`), so `ProjectNav`, `historyHref` and
`isProjectPath` do not change. A one-segment or three-segment path no longer matches the project
route at all and is answered by the router with the not-found page.

Out of scope: the slug format, the database, the publisher, the project id, any component, the
data boundary, the query keys, the tags.

## Relevant Files

Use these files to resolve the chore:

- `src/app/(dashboard)/projects/[...slug]/page.tsx` - The page to move. Holds `ProjectPageProps`
  (`params: Promise<{ slug: string[] }>`), `generateStaticParams` (`slug.split("/")`, placeholder
  `{ slug: ["_", "none"] }`), `generateMetadata` (`slug.join("/")`), `getRunsState`, `getHistory`,
  the two History islands and the page body (`parts.join("/")`). Its comments describe the
  catch-all and must be rewritten for two named segments.
- `src/app/(dashboard)/projects/[...slug]/loading.tsx` - Segment Suspense fallback; moves verbatim
  (its comment says "for every slug", still true).
- `src/app/(dashboard)/projects/[...slug]/error.tsx` - Segment error boundary; moves verbatim.
- `src/app/(dashboard)/not-found.tsx` - Route-group not-found. It already sits at the group root,
  so it keeps rendering inside the two-pane shell for `notFound()` from the new page. Stays where
  it is; check that its comment is still accurate.
- `src/app/not-found.tsx` - Root not-found for URLs that match no route. Unchanged; relevant
  because `/projects/SBub` and `/projects/SBub/adw-dashboard/extra` now land on a not-found page
  from the router (see Notes on which one).
- `src/app/(dashboard)/layout.tsx` - Comment on line 41 names `"/projects/[...slug]"`; update to
  `"/projects/[owner]/[repo]"`.
- `src/data/query-keys.ts` - JSDoc of `runs` (line 18) says both sides join the slug
  `parts.join("/")`, as the page does. Rewrite to: the slug is assembled once, in the page, from
  `owner` and `repo`; every key takes it as is. No code change.
- `src/lib/project-route.ts` - Header comment names the route `/projects/[...slug]`; update the
  route name. The function body stays as it is (issue item 5). The JSDoc's example of a
  percent-encoded spelling (`/projects/owner%2Frepo`) is no longer a page: with two named segments
  `%2F` stays inside one segment, so that path has one segment after `projects` and 404s at the
  router. Re-word the example to a per-segment encoding (`/projects/owner/re%2Dpo`), which Next
  still decodes into the `repo` param. Keep the rest.
- `src/lib/project-route.test.ts` - Gets the new test case (see Test Coverage). The existing
  "percent-encoded spelling" case uses `%2F`; retarget its input to a per-segment encoding
  (`/projects/SBub/adw%2Dtoolkit`) so the test describes a URL that actually renders the page. The
  function's behaviour does not change, so both inputs pass; this is a description fix.
- `src/components/ProjectNav.tsx`, `src/lib/history-bookmark.ts` (`historyHref`) - Build
  `/projects/${slug}`; unchanged, listed so the implementer confirms nothing there splits or joins.
- `README.md` - Section "Routing" (line 873) describes the catch-all; rewrite. Line 235 names the
  page path `projects/[...slug]/page.tsx`; update. Lines 352-354 (decode rationale in "The move")
  stay true for per-segment encoding; adjust the wording only if it implies an encoded slash.
- `AGENTS.md` - Line 94 (`generateStaticParams` rule: path and placeholder `{ slug: ["_", "none"] }`)
  and lines 112-114 (`parts.join("/")`, as the page does) must change; add the new rule that the
  slug is assembled from `owner` and `repo` only in the page. Line 277 (isProjectPath decode
  rationale) stays true; leave it unless the wording implies an encoded slash.
- `.adw/project.md` - Health URL and review path are `/projects/SBub/issebya-homes-ai-system`,
  identical after the move; no change needed (no script, port, env file or docs location moves).
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-static-params.md` -
  Read before editing: the `/products/[category]/[product]` row confirms the return shape
  `{ category: string, product: string }[]`, and "Multiple Dynamic Segments" shows both params
  generated from the leaf page.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` and
  `not-found.md` - Read before editing, for params typing and which not-found renders for an
  unmatched URL.

### New Files

- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx` (moved from `[...slug]/page.tsx`)
- `src/app/(dashboard)/projects/[owner]/[repo]/loading.tsx` (moved)
- `src/app/(dashboard)/projects/[owner]/[repo]/error.tsx` (moved)

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Read the installed Next docs

- Read `generate-static-params.md` (Returns table, "Multiple Dynamic Segments"), `dynamic-routes.md`
  and `not-found.md` under `node_modules/next/dist/docs/01-app/03-api-reference/`.

### 2. Move the segment with git

- `git mv "src/app/(dashboard)/projects/[...slug]" "src/app/(dashboard)/projects/[owner]"` is not
  enough (one level); do it in two moves so history follows the files:
  - `mkdir -p "src/app/(dashboard)/projects/[owner]/[repo]"`
  - `git mv "src/app/(dashboard)/projects/[...slug]/page.tsx" "src/app/(dashboard)/projects/[owner]/[repo]/page.tsx"`
  - same for `loading.tsx` and `error.tsx`
  - remove the now-empty `[...slug]` directory and confirm it is gone.
- Do not move `src/app/(dashboard)/not-found.tsx`; it stays at the route-group root so `notFound()`
  from the page renders inside the two-pane shell.

### 3. Rewrite the page's params handling (`[owner]/[repo]/page.tsx`)

- `ProjectPageProps.params` becomes `Promise<{ owner: string; repo: string }>`. Replace the
  catch-all comment above it with: the route has two named segments because a slug is exactly
  `owner/repo`; the page assembles the slug once and everything below takes the slug.
- `generateStaticParams`:
  - Placeholder branch: `if (projects.length === 0) return [{ owner: "_", repo: "none" }];` and keep
    the comment explaining the cacheComponents guard (update `"_/none"` wording to the pair).
  - Map: split each `project.slug` at its one `/` into `{ owner, repo }`. `noUncheckedIndexedAccess`
    is on, so destructuring `split("/")` yields `string | undefined`; use
    `const i = project.slug.indexOf("/"); return { owner: project.slug.slice(0, i), repo: project.slug.slice(i + 1) };`
    (a slug from the database always has one slash: it is the toolkit's `owner/repo`). No cast, no
    non-null assertion.
  - Update the comment ("A catch-all segment takes an array per param...") to say each slug is
    split into its two named params.
- Add a small local helper in the page file only if it reads better, e.g.
  `function projectSlug({ owner, repo }: { owner: string; repo: string }) { return \`${owner}/${repo}\`; }`,
used by both `generateMetadata` and the page body, so the template literal exists exactly once.
  Otherwise build it inline in both and accept two identical lines; prefer the helper (the issue
  says "in exactly one place"). It is not exported (knip, and AGENTS: no other file joins the slug).
- `generateMetadata`: `const { data } = await getRunsState(projectSlug(await params));` keeping the
  existing comment about reading through the cached state function.
- Page body: `const slug = projectSlug(await params);` replacing `const { slug: parts } = await params; const slug = parts.join("/");`.
  Leave everything after it (getRunsState, notFound, HydrationBoundary, QueryBoundary,
  SectionBoundary, islands, searchParams passed unawaited) untouched.
- Update the comment above the page ("Awaiting params makes this page request-time for slugs outside
  generateStaticParams") only if it mentions the catch-all; it otherwise stays.
- Leave `loading.tsx` and `error.tsx` contents unchanged.

### 4. Update stale comments outside the page

- `src/app/(dashboard)/layout.tsx` line 41: `"/projects/[...slug]"` -> `"/projects/[owner]/[repo]"`.
- `src/data/query-keys.ts` `runs` JSDoc: replace the `parts.join("/")` sentence with "The slug is part
  of the hash; the page assembles it once from the `owner` and `repo` params and every caller passes
  it as is."
- `src/lib/project-route.ts`: route name in the header comment; the percent-encoding example in the
  JSDoc becomes a per-segment one (`/projects/owner/re%2Dpo` and `/projects/owner/re-po` both render
  the page for `owner/re-po`). Do not change the function body.

### 5. Tests in `src/lib/project-route.test.ts`

- Add the test from Test Coverage.
- Retarget the existing percent-encoded case's input from `/projects/SBub%2Fadw-toolkit` to
  `/projects/SBub/adw%2Dtoolkit` and keep its title ("matches the percent-encoded spelling Next
  decodes to the same slug"), since an encoded slash no longer reaches the page.

### 6. README.md

- Line 235: page path `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`.
- Rewrite "## Routing" to cover:
  - The detail page is `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: two named segments,
    because a slug is exactly `owner/repo`. `/projects/SBub/adw-dashboard` arrives as
    `{ owner: "SBub", repo: "adw-dashboard" }`; the page assembles the slug once and everything below
    it (data boundary, query key, cache tags, bookmark, revalidate action) takes the slug.
  - Why not the id: the project id is a UUID and an internal key; URLs never carry it.
  - Why the slug stays the key: it is what the toolkit derives from the git remote, the tenant key in
    the database, and it mirrors the GitHub URL.
  - `generateStaticParams` returns `{ owner, repo }` pairs split from `getProjects()` and a
    placeholder pair `_` / `none` when the list is empty.
  - A path with one or three segments under `/projects` matches no route and gets the not-found page
    from the router, not a slug lookup (state which not-found renders, as verified in task 8).
  - Keep the existing sentences about `loading.tsx`, `error.tsx`, the boundaries, `notFound()` and
    the two not-found files.
- Lines 352-354: keep; if the wording implies `%2F`, say "a percent-encoded character in a segment".
- No em-dashes.

### 7. AGENTS.md

- `generateStaticParams` rule (line 94): path `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`
  and placeholder `{ owner: "_", repo: "none" }`.
- Query-key rule (lines 112-114): replace "join it the same way on both sides (`parts.join("/")`, as
  the page does)" with "the slug is assembled once in the page; pass it as is".
- New rule in Architecture, next to the `generateStaticParams` rule: "The project route is
  `projects/[owner]/[repo]`. The slug is assembled from `owner` and `repo` only in the page
  (`\`${owner}/${repo}\``, once); no other file splits or joins it, and everything below the page
(data boundary, `queryKeys.runs(slug)`, `runsTag`/`historyTag`, the bookmark,
`revalidateHistory`) takes the slug as is. `generateStaticParams`in the same file is the one place
that splits a slug, into the two params. URLs never carry the project id. Do not reintroduce a
catch-all segment." (Note:`isProjectSlug`in`src/lib/slug.ts` only validates, it does not split.)
- Line 277 (isProjectPath decode): keep; adjust wording only if it implies an encoded slash.
- No em-dashes.

### 8. Validate, including the router 404s and the build route list

- Run every command in Validation Commands.
- In the `yarn build` output, confirm the route list shows `/projects/[owner]/[repo]` as partial
  prerender with both project pages (e.g. `/projects/SBub/adw-dashboard`,
  `/projects/SBub/issebya-homes-ai-system`) under it, and no `/projects/[...slug]`.
- Confirm `ls "src/app/(dashboard)/projects"` shows only `[owner]`, and
  `grep -rn '\.\.\.slug\|parts.join\|slug.join' src README.md AGENTS.md` returns nothing.

## Test Coverage

- Unit (`src/**/*.test.ts`, vitest), `src/lib/project-route.test.ts`: add
  `it("matches /projects/<owner>/<repo> and not a three-segment path", ...)` asserting
  `isProjectPath("/projects/SBub/adw-dashboard", "SBub/adw-dashboard")` is `true` and
  `isProjectPath("/projects/SBub/adw-dashboard/extra", "SBub/adw-dashboard")` is `false`. This is
  the issue's requested pin that the completion-refresh check keeps matching the URL shape the new
  route serves. Honest caveat: `isProjectPath` does not change, so this test passes with or without
  the move (the existing cases already cover the same shape); it guards against a future change to
  the helper drifting from the route, not against this chore.
- The route move itself (two named params, the slug assembly, `generateStaticParams` pairs, router
  404 for one or three segments) has no cheaper layer than the build: the profile has no component
  test layer and no E2E suite (E2E: `none`), and a page is not a pure helper. Its evidence is
  `yarn typecheck` (`next typegen` regenerates the route types, so a page still typed as
  `{ slug: string[] }` or a stale import fails), `yarn build` (route list and prerender of both
  projects, which fails if `generateStaticParams` returns the wrong shape) and the review phase.
- E2E: none. The profile's E2E is `none` and the user-visible output is unchanged. The review phase
  screenshots, at desktop 1920x1080 and mobile 375x667: `/`, `/projects/SBub/issebya-homes-ai-system`
  and `/projects/SBub/adw-dashboard` (sidebar highlight, Active, History), one `?after=` page of a
  project with more than one History page, and `/projects/SBub` and
  `/projects/SBub/adw-dashboard/extra` (not-found page).

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint` - ESLint over the moved page and edited comments/tests.
- `yarn typecheck` - `next typegen` regenerates route types for `[owner]/[repo]` and `tsc --noEmit`
  checks the new params shape and the `generateStaticParams` return type (never stage `next-env.d.ts`).
- `yarn knip` - No unused export left behind (the slug helper in the page must stay unexported).
- `yarn format:check` - Prettier over README.md, AGENTS.md, the page and the test.
- `yarn test` - Unit tests, including the new and retargeted `isProjectPath` cases.
- `yarn build` - Proves `generateStaticParams` returns valid `{ owner, repo }` pairs, both project
  pages prerender as partial prerenders under `/projects/[owner]/[repo]`, and the database read at
  build still works (needs `.env.local`).

## Notes

- Which not-found renders for `/projects/SBub` and `/projects/SBub/adw-dashboard/extra`: they match no
  route, so Next serves the root `src/app/not-found.tsx` (outside the shell), not the route-group one,
  with a real 404 status. The acceptance only asks for "404 at the router (not-found page), not a
  slug lookup", which this satisfies. Do not add a catch-all or a `[...rest]` route to put them in the
  shell; that would be a slug-shaped lookup again. If the review finds the root not-found
  unacceptable, raise it as a follow-up. State the actual behaviour in the README Routing section.
- An encoded slash (`/projects/SBub%2Fadw-dashboard`) used to render the page through the catch-all;
  now it is one segment and 404s at the router. The app never builds such a link (valid slugs need no
  encoding), so this is acceptable and is why the `%2F` examples in `project-route.ts` and its test
  are retargeted to a per-segment encoding. `isProjectPath` would still answer true for that path, but
  the only consequence is a refresh of a not-found page, which changes nothing.
- A `[repo]` value with an encoded slash (`/projects/SBub/a%2Fb`) is decoded by Next into `repo = "a/b"`
  and yields slug `SBub/a/b`, which `getActiveRuns` returns `null` for, so `notFound()` as before.
- Do not touch `getRunsState`, `getHistory`, the islands, `searchParams` handling, the tags, the query
  keys or `revalidateHistory`; the slug they receive is identical.
- `.adw/project.md` needs no change: the URLs it names are unchanged and no script, port, env file or
  docs location moves.
- Commit with a bare conventional type, e.g. `chore: route project pages as /projects/[owner]/[repo]`,
  no trailers.
