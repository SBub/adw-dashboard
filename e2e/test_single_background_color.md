# E2E Test: Single Background Colour

Checks that the app paints one page background from the top of the window to the bottom and edge
to edge, in light and in dark mode: `html` and `body` carry the same colour, `color-scheme` is
declared, and no page-level element paints a second shade; the sticky header paints the same colour
as `body`, including when the content is shorter than the window.

## User Story

As a person using the ADW dashboard
I want the whole window to show one background colour
So that the page does not look split into a content area and a darker strip below or beside it

## Test Steps

1. Resize the browser to 1920x2000 (the content is shorter than the viewport) and emulate the
   light colour scheme (`await page.emulateMedia({ colorScheme: 'light' })` through the Playwright
   MCP code runner).
2. Navigate to `/projects` and wait until the sidebar's connection pill reads `live`.
3. Evaluate in the page: `getComputedStyle(...).backgroundColor` of `document.documentElement`,
   `document.body`, `document.querySelector('main')` and `document.querySelector('main > div')`
   (the shell wrapper) and `document.querySelector('body > header')` (the sticky header), and the
   painted colour of the bottom area: start at
   `document.elementFromPoint(960, innerHeight - 5)` and walk up to the first ancestor whose
   background is not `rgba(0, 0, 0, 0)`.
4. **Verify** the `html` colour is not `rgba(0, 0, 0, 0)`, and the `html`, `body` and bottom area
   colours are equal. **Verify** `main` and the shell wrapper are each `rgba(0, 0, 0, 0)` or equal
   to the `body` colour. **Verify** the header colour equals the `body` colour (opaque, not
   `rgba(0, 0, 0, 0)` and not a second shade).
5. **Verify** `getComputedStyle(document.documentElement).colorScheme` contains both `light` and
   `dark`.
6. Emulate the dark colour scheme, reload `/projects`, repeat steps 3 to 5, and **Verify** the dark
   `html` colour differs from the light one.
7. Take a full-page screenshot of `/projects` at 1920x2000 in dark mode.
8. Navigate to `/` and to the first project link in the sidebar of `/projects`; on each, in the
   light and in the dark colour scheme, repeat step 3 and **Verify** the `html` colour is not
   `rgba(0, 0, 0, 0)` and equals the `body` colour.

## Success Criteria

- `html` and `body` paint the same non-transparent colour in both colour schemes on `/`,
  `/projects` and a project page.
- `color-scheme` on `html` names both `light` and `dark`.
- No page-level element paints a second shade; the sticky header paints the same colour as `body`.
- 1 screenshot is taken.
