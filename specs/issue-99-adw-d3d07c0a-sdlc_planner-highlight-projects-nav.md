# Feature: Header nav highlights "Projects" on /projects and project pages

## Metadata

issue_number: `99`
adw_id: `d3d07c0a`
issue_json: `{"number":99,"title":"Header nav: highlight \"Projects\" when on /projects or a project page"}`

## Feature Description

The root header has two links: the brand "ADW Dashboard" (to `/`, the summary) and "Projects" (to
`/projects`, rendered by `src/components/SectionNav.tsx`). Neither shows where the visitor is. This
feature marks the current section: "Projects" gets the brand's stronger text colour and
`aria-current="page"` on `/projects` and on every `/projects/<owner>/<repo>` page; the brand gets
`aria-current="page"` on `/` only, and keeps its normal brand styling either way. The path decision
is a pure, unit-tested helper in `src/lib/`; the `usePathname` read lives in one small client leaf
used for the two links only, so the header stays a server component and the static shell is
unchanged.

## User Story

As a person using the ADW dashboard
I want the header to show which section I am in
So that I can tell at a glance whether I am on the summary or in the projects area, and assistive
technology announces the current page link

## Problem Statement

`SectionNav` renders a single `Link` with fixed muted classes, no `aria-current` and no active
class; the brand link in `src/app/layout.tsx` has no active state either. The nav was kept static
on purpose: `usePathname` in a client component under the root layout suspends during prerender on
a route whose dynamic params are not covered by `generateStaticParams` (a project created after the
build), and under `cacheComponents` a suspension outside a `Suspense` boundary fails the build
(see `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`,
"Cache Components"). Any active state has to keep that shell intact.

## Solution Statement

1. Pure helper `headerSection(pathname)` in a new `src/lib/header-section.ts`, returning
   `"summary"` for exactly `/`, `"projects"` for `/projects` or anything starting with
   `/projects/`, and `null` otherwise (so `/projectsx`, `/summary`, `/about` match nothing). Tested
   in `src/lib/header-section.test.ts`.
2. New client leaf `src/components/HeaderLink.tsx` (`"use client"`): props `href`, `section`
   (`HeaderSection`, the non-null member it represents), `className`, `activeClassName` and
   `children`. It calls `usePathname()`, compares `headerSection(pathname) === section`, and
   renders a `next/link` `Link` with `aria-current={active ? "page" : undefined}` and
   `className` plus `activeClassName` when active. It computes nothing else.
3. `SectionNav` stays a server component with no state. It renders the "Projects" link as
   `<Suspense fallback={<Link ...inactive classes>Projects</Link>}><HeaderLink section="projects"
...>Projects</HeaderLink></Suspense>`. The fallback is the exact markup the nav has today, so
   on the one route shape where `usePathname` suspends (a fallback-param project page) the shell
   carries today's unhighlighted link and the active one streams in; on `/`, `/projects` and every
   pre-rendered project page the pathname resolves at build time and the active state is in the
   static HTML.
4. The brand link in `src/app/layout.tsx` is rendered the same way, through a second server
   wrapper exported from `SectionNav.tsx` (`BrandLink`), whose fallback is today's brand `Link`.
   The brand's classes (`font-semibold tracking-tight`) are identical active or not; only
   `aria-current` changes (`activeClassName` is empty).
5. Active "Projects" classes: the brand's colour, `text-neutral-900 dark:text-neutral-100`,
   replacing the muted `text-neutral-500 dark:text-neutral-400` (keep the hover classes). The
   class strings are full literals so Tailwind sees them; no status hue is involved, so
   `STATUS_COLORS` is not touched and `status-colors.test.ts` stays green.

Why a plain `Suspense` and not `QueryBoundary` / `SectionBoundary`: the "two boundaries, never a
bare Suspense" rule exists so a failed read is caught. `usePathname` reads no data, cannot throw,
and its suspension only means "pathname unknown until request time". `QueryBoundary` would bind a
query reset to something that is not a query and would need `Providers` (absent on `/`);
`SectionBoundary` would add a `router.refresh()` retry for a failure that cannot happen. The plan
therefore adds a narrow, written exception to the rule in `AGENTS.md` (see Step 5), and the
fallback must be the same link inactive, never a spinner or empty node.

## Relevant Files

Use these files to implement the feature:

- `src/components/SectionNav.tsx`: the header nav; gains the Suspense wrappers around the client
  leaf and a `BrandLink` export; its stale comment ("A server component with no active state...")
  is rewritten to describe the new shape.
- `src/app/layout.tsx`: root layout; replaces the inline brand `Link` with `BrandLink`. Stays a
  server component.
- `src/app/(dashboard)/layout.tsx`: reference only, the sidebar's `QueryBoundary` comment explains
  the same `usePathname` suspension for fallback-param slugs.
- `src/components/ProjectNav.tsx`: reference for the existing `usePathname` plus
  `aria-current={selected ? "page" : undefined}` idiom.
- `src/lib/project-route.ts` and `src/lib/project-route.test.ts`: reference for a pure pathname
  helper and its test style (do not change `isProjectPath`, it answers a different question).
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`: the
  `cacheComponents` behaviour of `usePathname` (read before implementing).
- `AGENTS.md`: client-component list, the "two boundaries" rule, the Summary section's
  `SectionNav` line; all need updating.
- `README.md`: the overview paragraph that describes the header's brand and "Projects" link.
- `e2e/test_connection_indicator_scope.md`: model for the new journey's format.
- `vitest.config.ts`, `knip.json`: the new test is picked up by `src/**/*.test.ts`; the new
  exports must all be used or knip fails.

### New Files

- `src/lib/header-section.ts`: `HeaderSection` type and `headerSection(pathname)`.
- `src/lib/header-section.test.ts`: unit tests for the matcher.
- `src/components/HeaderLink.tsx`: the client leaf that reads `usePathname`.
- `e2e/test_header_section_active.md`: agent-driven journey asserting `aria-current="page"` on the
  Projects link of a project page (requested by the issue; see Notes).

## Implementation Plan

### Phase 1: Foundation

Add the pure matcher and its test. It is the only logic in the feature and the part a regression
would break silently (for example a `startsWith("/projects")` that also matches `/projectsx`).

### Phase 2: Core Implementation

Add the `HeaderLink` client leaf and rework `SectionNav.tsx` into two server wrappers
(`SectionNav`, `BrandLink`), each a `Suspense` whose fallback is today's inactive markup around a
`HeaderLink`.

### Phase 3: Integration

Swap the brand `Link` in the root layout for `BrandLink`, update `AGENTS.md` and `README.md`, add
the journey, then build and check the served HTML of a pre-rendered project page carries
`aria-current="page"` on the Projects link inline (no client-only highlight).

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add the matcher

- Create `src/lib/header-section.ts` with a short header comment in the style of
  `project-route.ts` (pure, string in, value out, safe from anywhere).
- `export type HeaderSection = "summary" | "projects";`
- `export function headerSection(pathname: string): HeaderSection | null`:
  `pathname === "/"` gives `"summary"`; `pathname === "/projects" || pathname.startsWith("/projects/")`
  gives `"projects"`; anything else gives `null`. No decoding (the prefix is a literal ASCII
  segment, so an encoded spelling never changes the answer), no clock, no regex needed.

### 2. Test the matcher

- Create `src/lib/header-section.test.ts` (vitest, `describe("headerSection")`), cases:
  - `/projects` and `/projects/SBub/adw-dashboard` are `"projects"`; also `/projects/` and a deeper
    `/projects/SBub/adw-dashboard/extra` (the not-found page under the section is still the section).
  - `/` is `"summary"`.
  - `/projectsx`, `/projects-old`, `/summary`, `/about` and `""` are `null`.
  - `/` is not `"projects"` and `/projects` is not `"summary"` (the two never overlap).

### 3. Add the client leaf

- Create `src/components/HeaderLink.tsx` with `"use client"`, importing `Link` from `next/link`,
  `usePathname` from `next/navigation`, and `headerSection`, `HeaderSection` from
  `@/lib/header-section`.
- Props: `href: string`, `section: HeaderSection`, `className: string`,
  `activeClassName: string`, `children: ReactNode`.
- Body: `const active = headerSection(usePathname()) === section;` then
  `<Link href={href} aria-current={active ? "page" : undefined} className={active ? \`${className} ${activeClassName}\` : className}>`.
Pick whichever composition keeps Tailwind's conflicting colour classes apart: pass the muted
colour inside an `inactiveClassName`instead if`className`would otherwise carry both`text-neutral-500`and`text-neutral-900`(prefer a`base`/`active`/`inactive` triple of full
  literals so only one text colour is ever present).
- No clock read, no state, no effect.

### 4. Rework SectionNav and the brand link

- In `src/components/SectionNav.tsx` (no `"use client"`):
  - Define the class literals once at module scope: base (hover classes), inactive
    (`text-neutral-500 dark:text-neutral-400`), active (`text-neutral-900 dark:text-neutral-100`),
    and the brand's `font-semibold tracking-tight`.
  - `SectionNav`: the existing `<nav aria-label="Sections" ...>` holding
    `<Suspense fallback={<Link href="/projects" className={base + inactive}>Projects</Link>}>`
    around `<HeaderLink href="/projects" section="projects" ...>Projects</HeaderLink>`.
  - `export function BrandLink()`: `<Suspense fallback={<Link href="/" className={brand}>ADW Dashboard</Link>}>`
    around `<HeaderLink href="/" section="summary" className={brand} activeClassName="">ADW Dashboard</HeaderLink>`
    (or the triple with empty active and inactive parts).
  - Replace the file comment: the brand and the section link mark the current section through
    `HeaderLink`, the one `usePathname` reader in the header; each sits in a `Suspense` whose
    fallback is the same link inactive, because `usePathname` suspends during prerender on a
    project page outside `generateStaticParams`; everywhere else the active state is in the static
    HTML.
- In `src/app/layout.tsx`, import `BrandLink` alongside `SectionNav` and replace the inline brand
  `Link`; drop the now-unused `next/link` import. The layout stays a server component.

### 5. Update the docs

- `AGENTS.md`:
  - In the "Server components by default" bullet, add `HeaderLink` to the `"use client"` list
    ("which reads the pathname to mark the header's current section"). Keep `SectionNav` in the
    "server components with no state" list.
  - In the "Two boundaries, never a bare `Suspense`" bullet, add the one exception: `HeaderLink`'s
    `usePathname` read sits in a plain `Suspense` in `SectionNav.tsx`, because it reads no data and
    cannot fail; its fallback is the same link inactive, never a spinner or an empty node; no
    other `Suspense` may be bare.
  - Add a bullet (near the `ProjectNav` / layout rules): the header's current section comes only
    from `headerSection` in `src/lib/header-section.ts` (pure, tested in
    `src/lib/header-section.test.ts`, every change goes with a test case); "Projects" is active on
    `/projects` and below, the brand on `/` only and keeps its styling, `aria-current="page"` on
    the active link.
  - Summary section, the `SectionNav` sentence: keep it, add that the brand is rendered by
    `BrandLink` from the same file.
- `README.md`: in the overview paragraph ("The header's brand links to `/`, its "Projects" link
  to `/projects`."), add that the link of the current section carries `aria-current="page"` and
  "Projects" is emphasised on `/projects` and on project pages; mention that on a project page
  built after the deploy the highlight arrives with the streamed pathname.
- No em-dashes anywhere. `.adw/project.md` needs no change (no script, port, env or doc location
  moves).

### 6. Add the agent-driven journey

- Create `e2e/test_header_section_active.md` modelled on `e2e/test_connection_indicator_scope.md`,
  with `## User Story`, `## Test Steps`, `## Success Criteria`:
  1. Navigate to `Application URL` + `/`. **Verify** the `ADW Dashboard` link has
     `aria-current="page"` and the `Projects` link in the `Sections` navigation has none.
  2. Navigate to `/projects`. **Verify** the `Projects` link has `aria-current="page"` and the
     brand link has none.
  3. Click the first project in the sidebar's `Projects` navigation. **Verify** the URL is
     `/projects/<owner>/<repo>` and the header's `Projects` link has `aria-current="page"`.
  4. Navigate to `/projectsx`. **Verify** the not-found page renders and neither header link has
     `aria-current`.
  5. Screenshot the project page at 1920x1080 and at 375x667.
- Why a journey and not a code spec: the profile has no Playwright code suite and no component test
  layer, the issue asks for a browser assertion, and `aria-current` on the rendered link (client
  leaf plus Suspense fallback) cannot be observed from `src/**/*.test.ts`. The matcher, the only
  logic, is covered by the unit test.

### 7. Check the static shell

- After `yarn build`, start the app on this run's `PORT` (from `.ports.env`, fallback 3000) with
  `yarn start`, then `curl -s http://localhost:$PORT/projects/<first listed slug>` and confirm the
  HTML holds the Projects anchor with `aria-current="page"` inline, the run rows (an `adw_id` in a
  `<code>`) are still in the document, and `/` holds the brand anchor with `aria-current="page"`.
  Stop the server this run started; never touch one it did not start.

### 8. Run the validation commands

- Run every command in `Validation Commands`; all must pass.

## Testing Strategy

### Unit Tests

`src/lib/header-section.test.ts` covers `headerSection` with fixed pathnames: the two active
shapes of the projects section, the summary root, and the near misses that a naive prefix check
would get wrong.

### Test Coverage

- `src/lib/header-section.test.ts` (unit, vitest): catches a matcher that highlights "Projects" on
  `/projectsx` or `/`, or misses `/projects/SBub/adw-dashboard`; nothing tests the header today and
  the file does not exist, so it fails without this change.
- Browser evidence that the rendered link carries `aria-current="page"` comes from the journey
  in Step 6 and the review phase's screenshots; the profile has no code E2E layer to put it in.

### Edge Cases

- `/projectsx`, `/projects-old`: not the projects section (prefix must include the slash).
- `/projects/` and deeper paths under `/projects`: still the projects section.
- A project slug not in `generateStaticParams`: the shell shows the inactive fallback, the active
  link streams in; the build must not fail with "URL data in a Client Component outside of
  Suspense".
- `/` (summary, no `Providers`): `HeaderLink` needs no query client, so it works there.
- Dark mode: active colour is `dark:text-neutral-100`, matching the brand.
- Client navigation between `/` and `/projects`: `usePathname` updates and the highlight moves
  without a reload.

## Acceptance Criteria

- On `/projects` and `/projects/<owner>/<repo>` the header's "Projects" link has
  `aria-current="page"` and `text-neutral-900` (`dark:text-neutral-100`); elsewhere it has neither.
- On `/` the brand link has `aria-current="page"`; elsewhere it has none; its classes are the same
  on every route.
- `/projectsx` highlights nothing.
- `SectionNav` and the root layout have no `"use client"`; `HeaderLink` is the only new client
  component and the only `usePathname` reader in the header.
- The served HTML of `/`, `/projects` and a pre-rendered project page carries the active link
  inline; the project page still carries its run rows in the document.
- `yarn build` succeeds; the unit test file exists and passes; `AGENTS.md` and `README.md`
  describe the new behaviour; no em-dashes.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint` - ESLint over the new component, helper and test.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit`, proves the props and the `HeaderSection`
  type line up (do not stage `next-env.d.ts`).
- `yarn knip` - every new export (`headerSection`, `HeaderSection`, `HeaderLink`, `BrandLink`) is
  used and the removed `next/link` import in the layout leaves nothing dangling.
- `yarn format:check` - Prettier on the changed files.
- `yarn test` - vitest, including the new `src/lib/header-section.test.ts` and the existing
  `status-colors.test.ts` and `layers.test.ts` scans.
- `yarn build` - proves `usePathname` under the root layout does not fail the `cacheComponents`
  prerender (the fallback-param shell of the project route included).

## Notes

- No new dependency.
- The issue asks for "Playwright: on a project page the Projects link has `aria-current`". The
  profile has no `@playwright/test` suite (E2E code suite: `none`), so this lands as the
  agent-driven journey `e2e/test_header_section_active.md`, which the test phase runs through the
  Playwright MCP server. Adding a Playwright code suite would be a new test layer and is out of
  scope.
- The plain `Suspense` is a deliberate, documented exception to the "never a bare Suspense" rule,
  limited to the pathname read; flag it in the PR description so a reviewer can confirm the
  decision. If the reviewer prefers otherwise, the alternative is wrapping in `SectionBoundary`,
  which adds a pointless refresh-retry panel.
- `HeaderLink` is generic enough for a future third section: add a member to `HeaderSection`,
  a case to `headerSection` and a test, then a wrapper in `SectionNav.tsx`.
