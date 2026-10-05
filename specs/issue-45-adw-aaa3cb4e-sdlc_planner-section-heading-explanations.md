# Feature: Explain Queue, Active and History under each heading, with an accessible detail affordance

## Metadata

issue_number: `45`
adw_id: `aaa3cb4e`
issue_json: `{"number":45,"title":"Explain Queue, Active and History under each heading, with an accessible detail affordance"}`

## Feature Description

The project page (`/projects/[owner]/[repo]`) shows three sections, Queue, Active and History, each
with a bare `<h2>`. A visitor to this public, open-source dashboard cannot tell what puts an item in
each section. This feature adds a `SectionHeading` server component that renders the title, a short
always-visible muted description under it, and an optional longer detail exposed through a small
info button next to the title. The detail shows on hover and on keyboard focus of the button and is
always available to screen readers through `aria-describedby`. All three sections use it, with the
copy given verbatim in the issue, and the copy lives in the page file next to the sections.

## User Story

As a visitor who lands on a project page of the public dashboard
I want to read, under each section heading, what puts an item in that section
So that I understand the Queue, Active and History lists without knowing the ADW toolkit

## Problem Statement

The headings Queue, Active and History carry no explanation. A tooltip alone would not fix it: it is
invisible until hovered and absent on touch devices, and screen readers often miss it.

## Solution Statement

- A new presentational server component `src/components/SectionHeading.tsx` (no `"use client"`, no
  state, no library, Tailwind only) with props `title: string`, `description: ReactNode` (always
  visible, muted, under the heading row; a `ReactNode` so the Queue copy can carry a `<code>`),
  optional `detail?: string` and optional `actions?: ReactNode` (rendered on the right of the title
  row; this is what keeps the History row "title left, pagination right" unchanged).
- The detail affordance is CSS-only so the component stays a server component: a
  `<button type="button">` with `aria-label={`About ${title}`}` and `aria-describedby={detailId}`,
  holding an inline SVG "i" in a circle (`aria-hidden`), wrapped in a `relative inline-flex group`
  span. The detail is a `<span id={detailId} role="tooltip">` always in the DOM, `sr-only` by default
  (so it is in the accessibility tree and the description is announced on focus), and switched to a
  visible absolutely-positioned popover with `group-hover:not-sr-only` and
  `group-focus-within:not-sr-only` plus the popover classes under the same variants. Because the
  popover is inside the hover group, moving the pointer onto it keeps it open (hoverable). The id is
  derived from the title (`section-${title.toLowerCase()}-detail`), deterministic, so server and
  client markup agree and no `useId` (a hook) is needed; the three titles are unique on the page.
- The Queue and Active headings currently live inside the client components `QueueView` and
  `ActiveRunsView`. The page builds each `SectionHeading` and passes it in as a `heading: ReactNode`
  slot prop (the same slot pattern as `ActiveRunsView`'s existing `queue` prop), so the heading stays
  server-rendered, the copy stays in the page, and the client components do not import it.
  `ActiveRunsView` keeps rendering nothing of it in its not-found branch.
- History: the page replaces its `<h2>` row with `<SectionHeading title="History" ... actions={...}>`
  where `actions` holds the two existing `SectionBoundary` islands (search box and pagination), so
  the title row keeps `flex flex-wrap items-center justify-between gap-4` and the description sits
  below the whole row. The `<h2>` stays in the page shell, outside every `SectionBoundary`.
- Copy, verbatim from the issue, as three plain JSX heading elements built in the page file next to
  the sections.
- README: one sentence noting the copy lives in the page next to the sections. AGENTS.md: a rule
  for `SectionHeading` (server component, CSS-only detail, copy in the page, headings passed as
  slots into the client views).

## Relevant Files

Use these files to implement the feature:

- `README.md`: section "Runs: active and history" gets the one sentence about where the section copy
  lives (the issue asks for it).
- `AGENTS.md`: the rule book; the server-component list and the Queue slot rule must mention the new
  `heading` slots and `SectionHeading`. Also the em-dash ban and the status-colour ban (no `rose`,
  `red`, `amber`, `emerald`, `sky` classes inline; use neutral hues for the info button).
- `.adw/project.md`: the profile (Tests: no component test layer, E2E `none`; Review: paths and
  viewports). No change needed: no script, port, env file or docs location changes.
- `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`: builds the three headings with the copy,
  passes Queue's into `QueueView`, Active's into `ActiveRunsView`, and renders History's in place of
  the current `<h2>` row with the search and pagination boundaries as `actions`.
- `src/components/ActiveRunsView.tsx`: replace the inline `<h2>Active</h2>` with a `heading` slot
  prop.
- `src/components/QueueView.tsx`: replace the inline `<h2>Queue</h2>` with a `heading` slot prop.
- `src/components/PageHeader.tsx`: reference for the inline-SVG icon style (`ExternalLinkIcon`) and
  muted text classes (`text-neutral-500 dark:text-neutral-400`).
- `src/components/HistoryLinks.tsx`: reference for neutral hover/dark classes; unchanged.
- `src/lib/status-colors.test.ts`: scans `src/` for status hues; the new component must not trip it.
- `knip.json`: `SectionHeading` must be imported (by the page) so knip passes.
- `vitest.config.ts`: confirms the one test layer is `src/**/*.test.ts` (no component tests).

### New Files

- `src/components/SectionHeading.tsx`: the heading component with the info button and detail.

## Implementation Plan

### Phase 1: Foundation

Create `SectionHeading` as a pure presentational server component with the CSS-only, accessible
detail affordance and the optional `actions` slot.

### Phase 2: Core Implementation

Turn the `<h2>` in `QueueView` and `ActiveRunsView` into a `heading` slot prop, and wire the three
headings with the verbatim copy in the page.

### Phase 3: Integration

Keep the History row layout identical (title left, search and pagination right) by routing the two
boundaries through `actions`; update README and AGENTS.md; run every check and hand the reviewer
the paths and viewports to screenshot.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Create `src/components/SectionHeading.tsx`

- No `"use client"`. Props interface:
  ```ts
  interface SectionHeadingProps {
    title: string;
    /** One short line, always visible, muted, under the heading row. */
    description: ReactNode;
    /** A longer sentence behind the info button: hover, keyboard focus, screen readers. */
    detail?: string;
    /** Rendered on the right of the title row (History's search box and pagination). */
    actions?: ReactNode;
  }
  ```
- Markup (class names indicative, neutral palette only):
  - Outer `<div className="mb-3">`.
  - Title row `<div className="flex flex-wrap items-center justify-between gap-4">` containing a
    left `<div className="flex items-center gap-2">` with `<h2 className="text-lg font-semibold">`
    and, when `detail` is set, the info affordance; then `{actions}`. When `actions` is absent the
    row still renders as is (one child, justify-between has no visible effect).
  - Info affordance: `<span className="group relative inline-flex">` with a
    `<button type="button" aria-label={`About ${title}`} aria-describedby={id}
className="inline-flex size-5 items-center justify-center rounded-full text-neutral-500
hover:text-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2
focus-visible:outline-neutral-500 dark:text-neutral-400 dark:hover:text-neutral-100">`
    holding an inline SVG (`aria-hidden="true"`, 16x16 viewBox, `stroke="currentColor"`, a circle
    plus an "i": a dot and a short vertical line), styled like `ExternalLinkIcon` in `PageHeader`.
    Then `<span id={id} role="tooltip" className="sr-only group-hover:not-sr-only
group-focus-within:not-sr-only group-hover:absolute group-focus-within:absolute
... left-0 top-full z-10 mt-2 w-72 rounded-md border border-neutral-200 bg-white p-3 text-sm
font-normal text-neutral-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-900
dark:text-neutral-200">{detail}</span>` (apply the positioning and surface classes under both
    `group-hover:` and `group-focus-within:` so the hidden state stays a pure `sr-only`; check in the
    browser that `not-sr-only` does not reset the `absolute` positioning, and order the variants so
    `absolute` wins, or add a `pt-2` hover bridge so the pointer can travel onto the popover).
  - `id`: `section-${title.toLowerCase()}-detail`, computed in the component; no `useId`.
  - Description `<p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>`.
- A short doc comment in the style of the neighbouring components: server component, no state; the
  detail is CSS-only so it needs no client JS; always in the DOM and referenced by
  `aria-describedby`, so screen readers announce it on focus; the description is always visible for
  touch devices.
- No em-dashes, no status hues.

### 2. Add a `heading` slot to `QueueView`

- Signature `QueueView({ slug, heading }: { slug: string; heading: ReactNode })`; replace
  `<h2 className="mb-3 text-lg font-semibold">Queue</h2>` with `{heading}`. Import `ReactNode` as a
  type. Extend the doc comment: the heading and its copy come from the page as a slot, so the copy
  sits next to the sections and the heading stays a server component.

### 3. Add a `heading` slot to `ActiveRunsView`

- Signature `ActiveRunsView({ slug, queue, heading }: { slug: string; queue: ReactNode; heading:
ReactNode })`; replace the Active `<h2>` with `{heading}` inside the existing `<section>`. The
  not-found branch renders neither slot. Extend the doc comment the same way as `queue`'s.

### 4. Wire the three headings in the page

- In `src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`, import `SectionHeading` and, inside
  `ProjectPage` (after the `notFound()` decision, next to `queueSection`), build:
  - Queue: `title="Queue"`, description
    `<>Issues waiting for their turn. An issue joins when its repository labels it <code>adw:queued</code>; removing the label withdraws it. Runs start one at a time per project, in this order.</>`,
    detail `"Items added by hand show a manual marker; those stay until removed by hand."`.
    Give the `<code>` the muted mono style used elsewhere (`font-mono text-xs` plus a light neutral
    background in both modes) so it stays legible in light and dark.
  - Active: `title="Active"`, description `"Runs in progress, and runs that failed and can be
resumed. Each run plans, builds, tests, reviews and documents a change, then opens a pull
request. The row updates live as phases complete."`, detail `"A failed run keeps its branch and
can be resumed from the phase that failed, which is why it stays here rather than in history."`.
  - History: `title="History"`, description `"Completed runs, newest first. A run completes when its
pull request was merged by the merge gate: tests green, review without blockers, CI green."`,
    detail `"Completed runs never change, so this list is cached and only refreshed when a new run
completes."`.
  - Copy must be byte-for-byte the issue's text (the issue uses commas and colons, no em-dashes).
- Pass `heading={queueHeading}` to `QueueView` inside `queueSection`, and `heading={activeHeading}`
  to `ActiveRunsView`.
- Replace the History row
  `<div className="mb-3 flex flex-wrap items-center justify-between gap-4"><h2>History</h2>...</div>`
  with `<SectionHeading title="History" description=... detail=... actions={<>search boundary,
pagination boundary</>} />`. The two `SectionBoundary` elements are unchanged and stay siblings in
  the same order, so the row is still title left, search and pagination right.
- Update the comment above the History section: the heading (now `SectionHeading`) is still static
  and in the shell, outside every boundary. Add one comment line where the copy is defined saying
  this is where the section copy lives.

### 5. Documentation

- `README.md`, "Runs: active and history": one sentence, e.g. "Each section's heading,
  one-line description and info-button detail are rendered by `SectionHeading`, and the copy lives
  in the project page (`src/app/(dashboard)/projects/[owner]/[repo]/page.tsx`) next to the
  sections."
- `AGENTS.md`, Architecture: add a rule: `SectionHeading` is a server component with no state; its
  detail is CSS-only (hover and `focus-within`) and always in the DOM behind `aria-describedby`; the
  section copy lives in the page, which passes the Queue and Active headings into `QueueView` and
  `ActiveRunsView` as `heading` slots (do not import `SectionHeading` into a client component or
  move the copy into one); the History heading's `actions` slot holds the search and pagination
  boundaries so the `<h2>` stays outside every `SectionBoundary`. Update the Queue-slot paragraph to
  mention the `heading` slot. No em-dashes.

### 6. Browser evidence for the review phase (E2E is `none` in the profile)

- No spec is added: the profile has no E2E or component test layer, and an `e2e/*.md` journey is not
  warranted for static copy and a CSS hover state that screenshots prove.
- The reviewer opens `http://localhost:$PORT/projects/SBub/issebya-homes-ai-system` (or the first
  project the sidebar on `/` lists if that slug is 404), at desktop 1920x1080 and mobile 375x667,
  full page, and must see:
  - Under each of Queue, Active and History, the one-line muted description, with `adw:queued`
    rendered as a `<code>` in the Queue description.
  - An info button next to each title; hovering it (desktop) and tabbing to it (keyboard focus)
    shows the detail popover; capture one screenshot of the History detail open via focus.
  - `browser_snapshot` shows each button named "About Queue" / "About Active" / "About History"
    with its description being the detail text (proves `aria-describedby`).
  - The History row: title left, search box and "N of M" pagination right on desktop, unchanged
    from before; on mobile it wraps as before.
  - Both light and dark colour scheme legible (emulate `prefers-color-scheme: dark`).

### 7. Run the validation commands

- Run every command in `Validation Commands` and fix anything that fails without weakening a rule.

## Testing Strategy

### Unit Tests

None added. The project's one test layer is `src/**/*.test.ts` for pure helpers and reducers; this
feature adds no logic, only markup and copy. `src/lib/status-colors.test.ts` already scans the new
component for forbidden status hues and must still pass.

### Test Coverage

No test needed: the change is a presentational server component and static copy with no branching
logic, and the profile has no component or E2E test layer (vitest includes `src/**/*.test.ts` only,
E2E is `none`). Extracting the copy into `src/lib/` just to unit-test strings would contradict the
issue (copy lives in the page) and prove nothing. Evidence comes from the review phase's screenshots
and accessibility snapshot (task 6) and from `yarn build` proving the headings prerender.

### Edge Cases

- Section with no `detail`: no button, no tooltip span, no dangling `aria-describedby`.
- Section with no `actions` (Queue, Active): title row renders without an empty right element.
- History with a single page and no search text: `HistoryLinks` renders nothing; the row still
  shows title left and search right as before.
- Long detail on mobile 375px: popover width (`w-72`, 18rem) fits within the viewport when
  anchored at the left of the button; it must not cause horizontal scroll.
- Keyboard: Tab reaches each info button in document order; focus ring visible in both modes;
  moving focus away hides the popover.
- Pointer: moving from the button onto the popover keeps it open.
- Screen reader: detail is announced via `aria-describedby` even while visually hidden.
- Not-found project: `ActiveRunsView`'s not-found branch renders no heading slot.
- Hydration: the heading ids are deterministic strings, so server and client markup match.

## Acceptance Criteria

- Queue, Active and History each show their one-line description, verbatim from the issue, muted,
  under the heading; `adw:queued` is a `<code>` element.
- Each heading has an info button whose detail shows on hover and on keyboard focus and is exposed
  to assistive technology via `aria-describedby` to an element in the DOM.
- `SectionHeading` is a server component (no `"use client"`), uses no library, Tailwind only, inline
  SVG glyph.
- The copy lives in the project page file; `QueueView` and `ActiveRunsView` receive the headings as
  slot props and do not import `SectionHeading`.
- The History header layout (title left, search and pagination right) is unchanged; the History
  `<h2>` stays outside every `SectionBoundary`.
- Light and dark mode legible.
- README carries the sentence about where the copy lives; AGENTS.md carries the new rule.
- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` pass.

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `yarn lint`: ESLint over the new component and the changed views and page.
- `yarn typecheck`: the new `heading` slot props are passed everywhere `QueueView` and
  `ActiveRunsView` are rendered.
- `yarn knip`: `SectionHeading` is used and no export is left dead.
- `yarn format:check`: Prettier formatting of every touched file.
- `yarn test`: the existing suite, including the status-colour scan over the new component.
- `yarn build`: the project pages still prerender with the headings in the static shell (needs
  `.env.local`).
- `grep -rn $'\xe2\x80\x94' src README.md AGENTS.md specs/issue-45-adw-aaa3cb4e-sdlc_planner-section-heading-explanations.md`:
  must print nothing (no em-dashes).

## Notes

- No new dependency.
- Known limitation, accepted to keep the component a server component without client JS: the
  popover cannot be dismissed with Escape while the pointer or focus stays on it (WCAG 1.4.13
  "dismissible"). The detail is supplementary (the description is always visible), so this is
  acceptable; a small client island could add it later if wanted.
- On touch devices the popover may not open on tap in every browser (Safari does not focus a button
  on tap); the always-visible description is the touch path, and the detail remains available to
  screen readers. This is why the issue asks for the visible description in the first place.
- Out of scope: any change to how items move between sections.
