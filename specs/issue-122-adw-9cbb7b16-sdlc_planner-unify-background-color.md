# Bug: One background colour for the whole app

## Metadata

issue_number: `122`
adw_id: `9cbb7b16`
issue_json: `{"number":122,"title":"One background colour for the whole app","body":"On /projects the page shows two background colours: the content area is one shade and everything below it, down to the bottom of the window, is a darker shade. The app should use a single background colour everywhere. (full body in the GitHub issue)"}`

## Bug Description

On `/projects` the page can show two background shades: the content area is one shade, and the area below it (down to the bottom of the window) plus the strip at the right edge is a different, darker shade. The app should paint one page background everywhere, in light and in dark mode, on `/`, `/projects` and a project page, including when the content is shorter than the window.

Expected: one page colour from the top of the window to the bottom and edge to edge, in both colour schemes.
Actual: the page colour comes from `<body>` only. Everything the browser paints outside the body box (the canvas, the `scrollbar-gutter: stable` strip, the scrollbar track and the overscroll area) gets its colour from `<html>`, which has no colour and no `color-scheme`. Depending on the browser, that area shows another shade.

## Problem Statement

The page background is set in the wrong place and only half-declared:

- `src/app/layout.tsx` puts `min-h-screen bg-white ... dark:bg-neutral-950` on `<body>`. `<html>` has no background and no `color-scheme`.
- `src/app/globals.css` holds only `@import "tailwindcss"` and `html { scrollbar-gutter: stable; }`: there is no background token and no `html`/`body` colour rule.
- Nothing tells the browser the page is dark in dark mode, so it keeps light UA canvas, scrollbar and form colours while the body paints `neutral-950`.
- `QueueRow`'s hollow position marker paints `bg-white dark:bg-neutral-950` to mask the rail line. That is a second, hand-copied spelling of the page colour, so it drifts if the page colour changes.

## Solution Statement

Define the page background (and foreground) once, as CSS custom properties in `src/app/globals.css`, and paint it on `html` and `body` only:

- `:root { --background: #fff; --foreground: <neutral-900>; color-scheme: light dark; }`, with a `@media (prefers-color-scheme: dark)` block that sets `--background` and `--foreground` to Tailwind's `neutral-950` and `neutral-100` (use `var(--color-neutral-950)` / `var(--color-neutral-100)` / `var(--color-neutral-900)` so the values stay identical to the current classes).
- `html, body { background-color: var(--background); color: var(--foreground); }`. The canvas, gutter and overscroll now take the colour from `html` directly instead of relying on body-to-canvas propagation, and `color-scheme: light dark` makes the UA scrollbar and canvas follow the same scheme as the `dark:` variants (both follow `prefers-color-scheme`).
- Expose it to Tailwind with `@theme inline { --color-background: var(--background); --color-foreground: var(--foreground); }` so the one other element that must match the page colour, `QueueRow`'s marker, can use `bg-background` instead of a copy.
- Remove `bg-white`, `dark:bg-neutral-950`, `text-neutral-900` and `dark:text-neutral-100` from `<body>` in `src/app/layout.tsx` (keep `min-h-screen antialiased`). `main`, the dashboard shell `div`, `<section>` and `src/app/page.tsx` already paint nothing; leave them so. Cards, panels, pills and popovers keep their own surfaces.

## Steps to Reproduce

1. Source `.ports.env` and run `yarn dev` (port from `PORT`).
2. Open `http://localhost:$PORT/projects` at a tall window (1920x2000) so the content is shorter than the viewport, with the OS (or emulated) colour scheme set to dark.
3. In the console: `getComputedStyle(document.documentElement).backgroundColor` returns `rgba(0, 0, 0, 0)` and `getComputedStyle(document.documentElement).colorScheme` returns `normal`, while `getComputedStyle(document.body).backgroundColor` is the `neutral-950` value. The wrapper `main > div` and `main section` are `rgba(0, 0, 0, 0)`.
4. In a browser that paints the gutter, scrollbar track or overscroll from the root (Safari, macOS Chrome with a visible scrollbar), the area outside the body box shows a different shade than the content.

Measured during planning (headless Chromium, 1920x2000, `/projects`): light `html` `rgba(0, 0, 0, 0)`, `body` `rgb(255, 255, 255)`; dark `html` `rgba(0, 0, 0, 0)`, `body` `lab(2.75381 0 0)`; `colorScheme` `normal` in both; `main`, the shell wrapper and `section` transparent; the element at the bottom of the window is `body`. Headless Chromium propagates the body colour to the canvas, so the screenshot there looks uniform; the second shade appears where the browser paints outside the body box on its own (gutter, scrollbar track, overscroll), which is exactly what an `html` colour plus `color-scheme` fixes. No wrapper paints a second colour.

## Root Cause Analysis

The page colour lives only on `<body>`. CSS paints the canvas (everything outside the body box) from the root element; when `html` has no background, browsers propagate the body's background to the canvas, but that propagation does not cover every surface: the reserved `scrollbar-gutter: stable` strip and the scrollbar track are painted with UA colours chosen by `color-scheme`, which is `normal` (light) here, and overscroll/rubber-band areas are painted per browser. In dark mode the `dark:` variants follow `prefers-color-scheme`, but nothing tells the browser the page is dark, so the browser-painted areas keep their own shade. The fix is to give `html` the page colour itself and declare `color-scheme`, with the colour defined once.

## Relevant Files

Use these files to fix the bug:

- `src/app/globals.css` - Gets the `--background`/`--foreground` tokens, `color-scheme`, the `html, body` colour rule and the `@theme inline` mapping. Keeps `scrollbar-gutter: stable`.
- `src/app/layout.tsx` - `<body>` loses its `bg-*`/`text-*` colour classes; `main` stays unpainted.
- `src/app/(dashboard)/layout.tsx` - Shell wrapper and `<section>`; verify they stay without a `bg-` class (no change expected).
- `src/app/page.tsx` - Summary page; verify no page-level `bg-` class (no change expected).
- `src/components/QueueRow.tsx` - Hollow marker `bg-white dark:bg-neutral-950` (a copy of the page colour masking the rail) becomes `bg-background`.
- `README.md` - "Stack" says themes follow the system preference through `dark:` variants; add that the page colour is one token in `globals.css` on `html`/`body` with `color-scheme`.
- `AGENTS.md` - Add the invariant (page background defined once in `globals.css`, painted on `html`/`body` only, no wrapper paints it).
- `.adw/project.md` - Tests section lists the `e2e/*.md` journeys; add the new one.
- `e2e/test_header_section_active.md` - Model for the journey format.
- `.claude/commands/test_e2e.md` - The journey contract.

### New Files

- `e2e/test_single_background_color.md` - Agent-driven journey asserting one background colour on `/projects` at a tall viewport, in light and dark.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Define the page colour once in `src/app/globals.css`

- After `@import "tailwindcss";` add:
  - `:root { --background: var(--color-white); --foreground: var(--color-neutral-900); color-scheme: light dark; }`
  - `@media (prefers-color-scheme: dark) { :root { --background: var(--color-neutral-950); --foreground: var(--color-neutral-100); } }`
  - `@theme inline { --color-background: var(--background); --color-foreground: var(--foreground); }`
  - `html, body { background-color: var(--background); color: var(--foreground); }`
- Keep `html { scrollbar-gutter: stable; }` (it may be merged into the `html` rule).
- One short comment saying why `html` carries the colour (the canvas, gutter and overscroll are painted from the root) and why `color-scheme` is set. No em-dashes.

### 2. Strip the colour from `<body>` in `src/app/layout.tsx`

- `className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100"` becomes `className="min-h-screen antialiased"`.
- Leave `<header>` (border only) and `<main>` (no class) as they are.

### 3. Confirm no page-level wrapper paints a background

- `grep -n "bg-" src/app/layout.tsx "src/app/(dashboard)/layout.tsx" src/app/page.tsx "src/app/(dashboard)/projects/page.tsx"` must show no `bg-` on `main`, the shell `div`, `<section>`, `<aside>` or a page root. Do not touch cards, panels, pills, popovers or buttons.

### 4. Use the token for the queue marker in `src/components/QueueRow.tsx`

- Replace `bg-white` and `dark:bg-neutral-950` on the hollow position marker with `bg-background`, so the mask over the rail line is the page colour by definition.

### 5. Add the E2E journey `e2e/test_single_background_color.md`

- The profile's E2E code suite is `none`, so the issue's requested spec under `e2e/` is an agent-driven journey (the only browser layer this project has; the property is a computed style in a real browser, which `src/**/*.test.ts` cannot see).
- Model it on `e2e/test_header_section_active.md`: `## User Story`, `## Test Steps` (numbered, `**Verify**` lines), `## Success Criteria`.
- Steps:
  1. Resize to 1920x2000 (content shorter than the viewport) and emulate the light colour scheme (`page.emulateMedia({ colorScheme: 'light' })` through the Playwright MCP code runner).
  2. Navigate to `/projects` and wait for the sidebar's connection pill to read `live`.
  3. Evaluate `getComputedStyle` `backgroundColor` of `html`, `body`, `main > div` (the shell wrapper) and `document.elementFromPoint(960, innerHeight - 5)` walked up to the first non-transparent ancestor (the bottom area).
  4. **Verify** `html` is not `rgba(0, 0, 0, 0)`, and `html`, `body` and the bottom area's painted colour are equal; **Verify** the shell wrapper and `main` are transparent or equal to `body` (so the effective colour behind the content equals `body`).
  5. **Verify** `getComputedStyle(document.documentElement).colorScheme` contains `dark` and `light`.
  6. Emulate the dark colour scheme, reload, repeat steps 3 to 5, and **Verify** the dark colour differs from the light one.
  7. Take a screenshot at 1920x2000 in dark mode.
  8. Repeat the colour check on `/` and on the first project in the sidebar (light and dark) and **Verify** `html` equals `body` there too.
- Success criteria: `html` and `body` paint the same non-transparent colour in both schemes on all three routes, no page-level wrapper paints a different one, one screenshot is taken.
- It fails on the unfixed code (`html` is `rgba(0, 0, 0, 0)` and `colorScheme` is `normal`) and passes after it.

### 6. Update the docs and the profile

- `README.md`, "Stack": the page colour is defined once as `--background`/`--foreground` in `src/app/globals.css`, painted on `html` and `body` with `color-scheme: light dark`, and exposed as `bg-background`.
- `AGENTS.md`, Architecture: add a rule: the page background is defined only in `src/app/globals.css` and painted only on `html` and `body`; no page-level wrapper (`main`, layout shells, page roots) takes a `bg-` class, and an element that must match the page colour uses `bg-background`, never a copied `bg-white dark:bg-neutral-950`. No em-dashes.
- `.adw/project.md`, Tests: add `e2e/test_single_background_color.md` to the listed journeys. Do not rename or reorder its `##` headings.

### 7. Review the result in the browser

- Source `.ports.env`, `yarn dev`, open `/`, `/projects` and `/projects/SBub/issebya-homes-ai-system` at 1920x2000 in light and dark: one colour from the header to the bottom of the window and into the right-hand gutter; the queue rail's hollow markers still mask the line. Stop the server afterwards.

### 8. Run the Validation Commands

## Test Coverage

No unit test: the change is CSS (a token, a rule on `html`/`body`, removed classes) and the project's only code test layer, `src/**/*.test.ts` under vitest in Node, cannot compute styles. The regression check is the agent-driven journey `e2e/test_single_background_color.md` (task 5), which fails on the unfixed code (`html` transparent, `color-scheme: normal`) and passes after the fix; it is listed as a task because the issue explicitly asks for a spec under `e2e/` and the profile has no code E2E suite.

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- `grep -n "background\|color-scheme" src/app/globals.css` - Before the fix: no match (reproduces the missing root colour). After: the tokens, `color-scheme` and the `html, body` rule.
- `grep -n "bg-" src/app/layout.tsx` - After the fix: no match (body and main paint nothing themselves).
- `yarn lint` - ESLint stays clean.
- `yarn typecheck` - `next typegen` plus `tsc --noEmit` stay clean (do not stage `next-env.d.ts`).
- `yarn knip` - No dead code introduced.
- `yarn format:check` - Prettier formatting of the touched CSS, TSX and Markdown.
- `yarn test` - Unit suite unchanged and green, including `src/lib/status-colors.test.ts` and `src/lib/layers.test.ts` scans.
- `yarn build` - Tailwind compiles `@theme inline` and `bg-background`; the app builds against `.env.local`.

## Notes

- Do not use `dark:` on `html` for the token: Tailwind v4's default `dark` variant is `prefers-color-scheme`, so the `@media (prefers-color-scheme: dark)` block in `globals.css` keeps the token and every `dark:` class on the same switch.
- `color-scheme: light dark` also makes UA form controls follow the scheme; the History search input is `bg-transparent`, so it is unaffected.
- No new dependency.
- During planning the dev server was started on this run's `PORT` (9203) for the computed-style measurement and stopped afterwards.
