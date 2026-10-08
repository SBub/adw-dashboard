# Chore: Sticky header: keep the header in view, scroll only the content below it

## Metadata

issue_number: `141`
adw_id: `ab53aaef`
issue_json: `{"number":141,"title":"Sticky header: keep the header in view, scroll only the content below it"}`

## Chore Description

The root header in `src/app/layout.tsx` (brand `ADW Dashboard`, the `Sections` nav with
`Projects`, the "AI Developer Workflow runs" caption) scrolls away with the content on every route.
On a long summary (`/`) or a project page with a long History, getting back to the nav means
scrolling to the top.

After this chore the header is pinned to the top of the viewport on every route (`/`, `/projects`,
project pages, the not-found page), at desktop and mobile widths, and everything below it scrolls
under it. The document keeps scrolling as a whole (window scroll): `main` and the dashboard shell
must **not** become `overflow` scroll containers, so browser scroll restoration on back/forward,
pull-to-refresh, mobile address-bar collapse and Next's scroll-to-top on navigation keep working
unchanged. The mechanism is `position: sticky` on the `<header>` itself, a direct child of `body`
(whose scroll container is the viewport).

Concretely:

- `<header>` gains `sticky top-0`, a z-index layer and `bg-background` (opaque, so content does not
  show through while scrolling under it), and keeps `border-b border-neutral-200
dark:border-neutral-800`. Nothing else about it changes: same padding, same wrapping to two rows at
  narrow widths, no shrink or restyle.
- z-index: a new named constant `HEADER_LAYER = "z-40"` next to `TOOLTIP_LAYER` in
  `src/lib/layers.ts`. It sits below the tooltip (`z-50`), so a section tooltip opened near the top
  of the page still draws over the header, and above every other `z-<n>` in `src/` (today the queue
  rail markers in `QueueRow.tsx`, `relative z-10`, and the chart value tooltip in
  `ColumnChart.tsx`, `z-10`), so those slide under the header instead of painting over it.
  `src/lib/layers.test.ts` must keep passing (nothing at or above `z-50` besides the tooltip) and is
  extended to pin the new layer.
- One source for the header height: a CSS custom property `--header-height` on `:root` in
  `src/app/globals.css`. The header's natural single-row height is `py-3` (2 x 0.75rem) plus the
  brand's line box (`text-base`, 1.5rem line height) plus the 1px bottom border, i.e.
  `3.0625rem` (49px). The implementer must confirm this by measuring
  `document.querySelector('body > header').getBoundingClientRect().height` at 1280px (and at 768px,
  the `md` breakpoint where the sidebar becomes sticky) and use the measured value if it differs.
  The header is single-row at `md` and wider, which is the only range where the sidebar reads the
  variable.
- Sidebar (`src/app/(dashboard)/layout.tsx`): currently `md:sticky md:top-6
md:max-h-[calc(100vh-5.5rem)]`. Both are offset by `--header-height` so the sidebar sticks 1.5rem
  below the header and its bottom (with the same 1.5rem gap) is not cut off:
  `md:top-[calc(var(--header-height)+1.5rem)]` and
  `md:max-h-[calc(100vh-var(--header-height)-3rem)]`. `md:overflow-y-auto` stays (the sidebar's own
  scroll is its existing behaviour, not a new page scroll container).
- In-page jumps: the codebase has none (no `#anchor` hrefs, no `scrollIntoView`, no `id`-targeted
  links; checked with `grep -rnE "scrollIntoView|href=\"#" src`). So no `scroll-padding-top` is
  added; see Notes.
- Rule change: `app_docs/screens-and-components.md`'s page background rule says no page-level
  wrapper takes a `bg-` class. It is amended in the same change: the sticky header is the one
  page-level element that takes `bg-background` (it must be opaque), never a copied
  `bg-white dark:bg-neutral-950`; `html` keeps painting the canvas.
  `e2e/test_single_background_color.md` does not assert the header has no background (it checks
  `html`, `body`, `main`, `main > div` and the bottom area), but its wording "no page-level wrapper
  paints a second shade" is extended to state the header paints the same colour as `body`.
- New agent-driven journey `e2e/test_sticky_header.md` covering 1280px and 375px on `/` and a
  project page.

The served HTML must still contain the run rows: this change is classes and CSS only and introduces
no client clock read, no `"use client"` and no new Suspense.

## Relevant Files

Use these files to resolve the chore:

- `src/app/layout.tsx`: the root layout whose `<header>` becomes sticky, opaque and layered; imports
  `HEADER_LAYER`.
- `src/app/(dashboard)/layout.tsx`: the `<aside>` sidebar whose `md:top-6` and
  `md:max-h-[calc(100vh-5.5rem)]` are offset by `--header-height`.
- `src/app/globals.css`: home of the page tokens on `:root`; gains `--header-height` with a comment.
- `src/lib/layers.ts`: holds `TOOLTIP_LAYER`; gains `HEADER_LAYER` with a doc comment.
- `src/lib/layers.test.ts`: the z-index guard; must keep passing and gains cases pinning the header
  layer (see Test Coverage).
- `src/components/SectionHeading.tsx`: the section tooltip (`absolute ... ${TOOLTIP_LAYER}`) that
  must still draw over the header; read only, to confirm no ancestor creates a lower stacking
  context.
- `src/components/QueueRow.tsx`, `src/components/ColumnChart.tsx`: the existing `z-10` elements
  that must scroll under the header; read only.
- `src/components/SectionNav.tsx`: the header's links; read only, to derive the header height.
- `app_docs/screens-and-components.md`: the page background rule to amend; describe the sticky
  header and the sidebar offset (matches the conditional-docs line "the page background", "a row's
  layout").
- `app_docs/routing-and-navigation.md`: describes the header's links; read to keep wording
  consistent, add one sentence pointing to the sticky behaviour in `screens-and-components.md` only
  if it describes the header's layout (it currently does not; leave it unchanged otherwise).
- `docs/conditional-docs.md`: the `screens-and-components.md` line gains "the sticky header, its
  layer or the sidebar's sticky offset" so later runs find the doc.
- `e2e/test_single_background_color.md`: extend its wording and checks so the header is expected to
  equal the `body` colour (not transparent).
- `e2e/test_header_section_active.md`, `e2e/test_section_tooltip_layering.md`: existing journeys
  used as the model for the new one.
- `.adw/project.md`: its Tests section lists every `e2e/*.md` journey; add the new one there (no
  heading renamed or reordered).
- `AGENTS.md`, `README.md`: rules (no em-dashes, conventional commits, no trailers); no change.

### New Files

- `e2e/test_sticky_header.md`: agent-driven journey verifying the pinned header, opacity, tooltip
  layering and sidebar offset at 1280px and 375px.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Add the header layer constant

- In `src/lib/layers.ts`, add below `TOOLTIP_LAYER`:
  - A doc comment: the sticky root header's z-index class, one step below `TOOLTIP_LAYER` so a
    section tooltip opened near the top of the page draws over the header, and above every other
    `z-<n>` in `src/` so content (the queue rail markers, the chart value tooltip) scrolls under it.
    Pinned by `layers.test.ts`; written out in full so Tailwind sees it.
  - `export const HEADER_LAYER = "z-40";`
- Update `TOOLTIP_LAYER`'s comment only if it now reads wrong ("Every other `z-<n>` in `src/` stays
  below it" stays true).

### 2. Extend the z-index guard test

- In `src/lib/layers.test.ts`:
  - Import `HEADER_LAYER` alongside `TOOLTIP_LAYER`.
  - Add a `describe("HEADER_LAYER", ...)` with:
    - "is a numeric z-index class below the tooltip's layer": matches `/^z-\d+$/` and its value is
      `< tooltipValue`.
    - "is the root header's layer": the source of `/src/app/layout.tsx` contains `HEADER_LAYER` and
      `zIndexes(source)` is `[]` (no hard-coded z class in the layout).
    - "is above every other z-index in src": for every non-exempt source, every found z value is
      `< headerValue` (collect offenders as `path: cls`, expect `[]`), mirroring the existing
      "finds no z-index at or above the tooltip's layer" case.
  - Keep `EXEMPT` as is (both constants live in `layers.ts`). The existing tests must pass
    unchanged.

### 3. Add the header height custom property

- In `src/app/globals.css`, add `--header-height: 3.0625rem;` inside the existing `:root` block
  (not inside the dark media query), with a short comment: the sticky root header's single-row
  height (`py-3`, the brand's 1.5rem line box and the 1px bottom border), the one source the
  sidebar's sticky offset reads; the header wraps to two rows only below `md`, where the sidebar is
  not sticky. Use the measured value from Step 6 if it differs.
- Do not add `scroll-padding-top` (no in-page jumps exist; see Notes). Do not touch the `html,
body` background rule or `scrollbar-gutter`.

### 4. Make the header sticky

- In `src/app/layout.tsx`, import `HEADER_LAYER` from `@/lib/layers` and change the header's class
  to a template literal:
  ``className={`sticky top-0 ${HEADER_LAYER} border-b border-neutral-200 bg-background dark:border-neutral-800`}``
- Leave the inner `div`, `BrandLink`, `SectionNav`, the caption, `<body className="min-h-screen
antialiased">` and `<main>` exactly as they are. `main` and `body` get no `overflow`, `h-screen`
  or `bg-` class.
- Add a one-line comment above the header only if it matches the file's style (the file has none
  today; prefer documenting in `app_docs/` instead).

### 5. Offset the sidebar by the header height

- In `src/app/(dashboard)/layout.tsx`, on the `<aside>` replace `md:top-6` with
  `md:top-[calc(var(--header-height)+1.5rem)]` and `md:max-h-[calc(100vh-5.5rem)]` with
  `md:max-h-[calc(100vh-var(--header-height)-3rem)]`. Keep `shrink-0 md:sticky md:w-72
md:overflow-y-auto`. Run `yarn format` so Prettier's Tailwind class sorting (if configured) is
  applied.
- Do not change the shell `div` (`mx-auto flex max-w-6xl ...`) or the `<section>`; neither becomes a
  scroll container.

### 6. Verify the header height and behaviour in the browser

- Start the app per the profile (`source .ports.env` if present, then `yarn dev`, which honours
  `PORT`; never another port, never kill a process this run did not start).
- At 1280x800 and 768x800 evaluate
  `document.querySelector('body > header').getBoundingClientRect().height` on `/` and
  `/projects`. If it is not 49px, set `--header-height` in `globals.css` to the measured value in
  rem and note it.
- On a project page at 1280x800, scroll to the bottom and confirm: the header's `top` is `0`, the
  sidebar's `top` equals header height + 24px, the sidebar's bottom is at or above
  `innerHeight - 24`, and its last project link can be scrolled into view inside the sidebar.
- Confirm `document.scrollingElement.scrollTop > 0` after scrolling (window scroll, not an inner
  container) and that back/forward between `/` (scrolled) and a project page restores the position.

### 7. Amend the docs

- `app_docs/screens-and-components.md`:
  - Amend the page background rule (the bullet starting "The page background is defined only in
    `src/app/globals.css`"): no page-level wrapper (`body` classes, `main`, a layout shell, a page
    root) takes a `bg-` class, with one exception: the sticky root header takes `bg-background` so
    content does not show through while scrolling under it, never a copied
    `bg-white dark:bg-neutral-950`; `html` keeps painting the canvas.
  - Add a rule bullet describing the sticky header: the root header in `src/app/layout.tsx` is
    `sticky top-0` with `HEADER_LAYER` (`src/lib/layers.ts`, below `TOOLTIP_LAYER`, above every
    other z-index, pinned by `src/lib/layers.test.ts`), on every route and width; the document keeps
    scrolling as a whole: never make `main`, `body` or a layout shell an `overflow` scroll
    container (scroll restoration, scroll-to-top on navigation, pull-to-refresh and the mobile
    address bar depend on window scroll). Its height has one source, `--header-height` in
    `src/app/globals.css`; a change to the header's padding or line height updates it.
  - In the sidebar description (the "left pane is a persistent sidebar" bullet or the intro
    paragraph), say that from `md` up the sidebar sticks `--header-height` + 1.5rem from the top
    and its max height subtracts the header height and both 1.5rem gaps, so it sits below the
    header with its last item reachable.
  - No em-dashes.
- `docs/conditional-docs.md`: extend the `screens-and-components.md` line with "the sticky header,
  its z-index layer or the sidebar's sticky offset".

### 8. Update the background-colour journey

- In `e2e/test_single_background_color.md` step 3, also read
  `getComputedStyle(document.querySelector('body > header')).backgroundColor`; in step 4 add:
  **Verify** the header colour equals the `body` colour (opaque, not `rgba(0, 0, 0, 0)` and not a
  second shade). Update the intro sentence and the Success Criteria so "no page-level wrapper paints
  a second shade" reads "no page-level element paints a second shade; the sticky header paints the
  same colour as `body`". Screenshot count unchanged.

### 9. Add the sticky header journey

- Create `e2e/test_sticky_header.md`, modelled on `e2e/test_header_section_active.md` and
  `e2e/test_section_tooltip_layering.md` (same headings: title, intro, User Story, Test Steps,
  Success Criteria). Steps:
  1. Resize to 1280x800, navigate to `/`.
  2. Scroll to the bottom (`window.scrollTo(0, document.documentElement.scrollHeight)`); **Verify**
     `window.scrollY > 0` and `document.querySelector('body > header').getBoundingClientRect().top`
     is `0`, and the `ADW Dashboard` link and the `Projects` link in the `Sections` nav are visible
     (`elementFromPoint` at each link's centre is that link or inside it).
  3. **Verify** the header's computed `backgroundColor` equals the `body` colour and is not
     `rgba(0, 0, 0, 0)`; take `elementFromPoint` at a point inside the header that has no text
     (e.g. 8px from its right edge, its vertical centre) and **Verify** it is the header or inside
     it (content does not show through). Take a screenshot.
  4. Navigate to `/projects`, wait for the connection pill to read `live` (up to 15 seconds), click
     the first project link in the sidebar and note its `href`.
  5. Scroll to the top; hover `About Active` (or the first `About <section>` button present);
     **Verify** `#section-active-detail` is visible, scroll the window so the button sits just
     below the header (e.g. `scrollBy` until the button's top is within 8px of the header's
     bottom), and if the tooltip box intersects the header's box, **Verify** `elementFromPoint` at
     the centre of the intersection is inside the tooltip; otherwise **Verify** at the tooltip's
     centre. Re-hover after scrolling if the tooltip closed.
  6. Scroll to the bottom; **Verify** the header's `top` is `0` with brand and nav visible, the
     sidebar `aside` has `getBoundingClientRect().top` equal to the header's height plus 24px
     (within 1px) and its bottom at or above `innerHeight` (fully in the viewport);
     scroll the sidebar to its own bottom and **Verify** its last project link's box is inside the
     sidebar's box and the viewport. Take a screenshot.
  7. Press back to `/`, **Verify** the scroll position is restored to the bottom (or near it) as
     before this change; then forward.
  8. Resize to 375x667 and repeat steps 2 and 3 on `/` and step 6's header checks (header `top` is
     `0`, brand and nav visible, opaque) on the project page; the sidebar checks do not apply below
     `md`. Take a screenshot of each.
  - Success Criteria: header pinned at `top: 0` after scrolling on `/` and a project page at both
    widths; header opaque and equal to `body`; section tooltip over the header; desktop sidebar
    below the header with its last item reachable; back restores the scroll position; 4 screenshots
    are taken.
  - No em-dashes; the hosted database is read only, the journey never writes.

### 10. Register the journey in the profile

- In `.adw/project.md`, Tests section, add `e2e/test_sticky_header.md` to the parenthesised list of
  journeys. Do not rename or reorder any `##` heading.

### 11. Run the validation commands

- Run every command under `Validation Commands` and fix anything they report (never by weakening a
  rule, a type or a test).
- Confirm the served HTML of a project page still contains the run rows (this change adds no clock
  read; `yarn build` proves the prerender still passes).

## Test Coverage

- `src/lib/layers.test.ts` (vitest, `src/**/*.test.ts`, the profile's one test layer), new
  `HEADER_LAYER` cases:
  - "is the root header's layer": fails today (`src/app/layout.tsx` has no `HEADER_LAYER`) and
    catches a later edit that drops the header's z-index, which would let the queue rail markers
    (`relative z-10`) paint over the pinned header.
  - "is above every other z-index in src": catches a new `z-40`+ element that would cover the
    sticky header, which nothing checks today (the existing guard only stops at the tooltip's
    `z-50`).
  - "below the tooltip's layer": catches raising the header to or above `TOOLTIP_LAYER`, which would
    hide a section tooltip opened near the top of the page.
- The sticky positioning, opacity, sidebar offset and scroll restoration are visual browser
  behaviour with no component test layer and no Playwright suite in this repository; they are
  covered by the new agent-driven journey (Step 9, a task, not a regression layer) and the review
  phase's screenshots.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint`: ESLint over the changed TSX and test (same as the commit hook).
- `yarn typecheck`: `next typegen` then `tsc --noEmit`; proves the new import and constant type
  check (never stage the rewritten `next-env.d.ts`).
- `yarn knip`: proves `HEADER_LAYER` has a consumer and nothing became dead.
- `yarn format:check`: Prettier over the changed TSX, CSS and markdown.
- `yarn test`: vitest, including the extended `src/lib/layers.test.ts`.
- `yarn build`: full prerender with `.env.local`; proves no clock read or prerender error was
  introduced and the run rows still render in the served HTML.
- `grep -rn $'\u2014' src app_docs docs e2e specs/issue-141-adw-ab53aaef-sdlc_planner-sticky-header.md .adw/project.md`:
  must print nothing (no em-dashes).

## Notes

- Why not an inner scroll container: an `overflow-y-auto` on `main` or the shell would break
  browser scroll restoration, Next's scroll-to-top on navigation, pull-to-refresh and mobile
  address-bar collapse, and the issue forbids it. `position: sticky` on a direct child of `body`
  keeps window scroll.
- `scroll-padding-top` is deliberately not added: there are no in-page jumps today. If one is added
  later, put `scroll-padding-top: var(--header-height)` on `html` (and account for the two-row
  mobile header, where the variable underestimates the height).
- The header wraps to two rows only at narrow widths; `--header-height` describes the single-row
  height, which is the only one the sidebar (sticky from `md`) needs. Do not force a fixed header
  height or restyle it for mobile in this issue.
- `ColumnChart`'s value tooltip (`z-10`) now slides under the header when a bar near the top is
  hovered while scrolled; that is intended (only section tooltips sit above the header).
- If the section tooltip does not draw over the header in Step 6 or the journey, look for an
  ancestor of `SectionHeading` that creates a stacking context (a `transform`, `opacity < 1`,
  `filter`, or a positioned element with a z-index) and remove that cause rather than raising the
  tooltip.
- Commit with a bare conventional type and no trailers (profile Documentation section), e.g.
  `chore: keep the header sticky and offset the sidebar below it`.
