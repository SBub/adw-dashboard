# Routing and navigation

**Specifications:**

- specs/issue-127-adw-2ab91140-sdlc_planner-move-feature-docs.md
- specs/issue-164-adw-cf1087b2-sdlc_planner-hire-me-page-contact-form.md

## Overview

The route tree (`/`, `/projects`, `/projects/[owner]/[repo]`, `/hire`, the `/summary` redirect), the header's links and their current-section marking, and how a project page decides it is not found. Pages live under `src/app/`, the header helpers in `src/components/SectionNav.tsx` and `src/lib/header-section.ts`.

## How it works

The summary at `/` shows finished runs per UTC day across projects: issue
classes, total duration, tokens (fresh input, cache read, output) and cost (see
`app_docs/summary.md`). The header's brand links to `/`, its "Projects" link to
`/projects`. At the header's right, on every route, the Hire me button
(`HireLink`) is a solid fuchsia button linking to `/hire`; it carries
`aria-current="page"` only on `/hire`. The link of the current section carries `aria-current="page"`, and
"Projects" is emphasised on `/projects` and on every project page. On a project
page added after the deploy (not among the pre-rendered slugs) the shell carries
the unmarked link and the highlight arrives with the streamed pathname. The old address `/summary` is a permanent redirect to a bare `/`
(its query string is dropped).

### Routing

A project slug is exactly `owner/repo`, so the detail page has two named
segments, `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`.
`/projects/SBub/adw-dashboard` arrives as
`{ owner: "SBub", repo: "adw-dashboard" }`; the page assembles the slug once,
and everything below it (the data boundary, the query key, the cache tags, the
History bookmark, the `revalidateHistory` action) takes the slug as is.

URLs never carry the project id: it is a UUID and an internal key. The slug
stays the key because it is what the toolkit derives from the git remote, it is
the tenant key in the database, and it mirrors the GitHub URL.

Project pages are pre-rendered at build time from the project list
(`generateStaticParams` awaits `getProjects()`, so the database is read during
the build, and splits each slug into an `{ owner, repo }` pair; an empty list
yields the placeholder pair `_` / `none`, because an empty result fails the
build under `cacheComponents`); a slug that is not in that list still renders
on demand. The segment's `loading.tsx` is the Suspense boundary
that lets the shell prerender while the page streams in (its fallback is
`ProjectPageSkeleton`, a skeleton of the header, Active, Queue and History),
and its `error.tsx` is
the client error boundary (message, digest, Retry) for anything the page body
throws. A failure inside one of the pane's own boundaries (`QueryBoundary`
around Active, `SectionBoundary` around History) stays in that section and
never reaches it.
An unknown slug calls Next's `notFound()`, which renders
`src/app/(dashboard)/not-found.tsx` inside the two-pane shell; URLs that match
no route at all fall through to the root `src/app/not-found.tsx`, with a 404
status. That includes a path with one or three segments under `/projects`
(`/projects/SBub`, `/projects/SBub/adw-dashboard/extra`) and an encoded slash
(`/projects/SBub%2Fadw-dashboard`, one segment): the router answers them, no
slug lookup happens.

The summary is the root route `/` (`src/app/page.tsx`) and sits outside the
`(dashboard)` group: no project sidebar, no project prefetch, no `Providers`
and no Realtime channel, so `/` shows no connection pill: the pill is rendered
by the `(dashboard)` layout beside `Providers`, where the channel is. The
project overview (every active run of every project, grouped by project in
sidebar order, each group headed by a link to its project page, or "No runs in
progress.") is `src/app/(dashboard)/projects/page.tsx`
at `/projects`, beside the `projects/[owner]/[repo]` segment. `/summary`, the
summary's old address, is a permanent (308) redirect to `/` answered by the
route handler `src/app/summary/route.ts`. It is not a `next.config.ts`
redirect because Next always merges the request's query string into a config
redirect's destination; the handler answers a bare, relative `/` and reads
nothing from the request, so old filtered links land on the plain page.
`/hire` (`src/app/hire/page.tsx`) likewise sits outside `(dashboard)`, with
no `Providers`, no Realtime and no pill (see `app_docs/hire.md`).

## Rules

- The project route is `projects/[owner]/[repo]`. The slug is assembled from
  `owner` and `repo` only in the page (`${owner}/${repo}`, once); no other
  file splits or joins it, and everything below the page (data boundary,
  `queryKeys.queue(slug)`, `historyTag`, the bookmark,
  `revalidateHistory`) takes the slug as is. `generateStaticParams` in the
  same file is the one place that splits a slug, into the two params. URLs
  never carry the project id. Do not reintroduce a catch-all segment.
- `generateStaticParams` in `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`
  must never return an empty array. Under `cacheComponents` an empty result
  fails the build (nothing to prerender the segment with), so the empty-list
  branch returns the placeholder `{ owner: "_", repo: "none" }`, which the page
  turns into `notFound()` at request time. Keep that guard when touching the
  function.
- A project page's not-found decision is `getProject(slug) === null`:
  `getProject` is the page's `"use cache"` scope (tag `projects`, no clock
  read) that finds the slug in `getProjects()`, shared by the page body,
  the header and `generateMetadata`; never from the Active entry, never by
  searching a dehydrated state's queries by hash, and never from the queue (`getQueue` returns `[]` for an unknown
  slug); the History islands render only after that decision, so
  `getCompletedRuns` returning an empty page for an unknown slug is never shown.
- The header's current section comes only from `headerSection` in
  `src/lib/header-section.ts` (pure, tested in
  `src/lib/header-section.test.ts`; every change to it goes with a test
  case), read by `HeaderLink`. "Projects" is active on `/projects` and every
  path below `/projects/` (never `/projectsx`) and takes the brand's text
  colour; the brand is active on `/` only and keeps its styling; "Hire me" is
  active on exactly `/hire` (never `/hirex` or `/hire-me`) and keeps its
  accent. So `headerSection` answers `"summary"`, `"projects"`, `"hire"` or
  null. The active link carries `aria-current="page"`, the others none.
- `/summary` is a permanent (308) redirect to a bare `/`, answered by the
  route handler `src/app/summary/route.ts`, which reads nothing from the
  request, so the query string is dropped. It is the only file under
  `src/app/summary/`; do not add a page there, and do not add a
  `next.config.ts` redirect for it (Next merges the query string into a
  config redirect's destination, and config redirects run before the
  handler).
  The project overview (sidebar plus every active run, grouped by project) is
  `/projects`, `src/app/(dashboard)/projects/page.tsx`; its `Active`
  heading is static in the page, above the `SectionBoundary` of its island; the header's
  `SectionNav` links to `/projects` only and the brand, rendered by
  `BrandLink` from the same file, links to `/`.
