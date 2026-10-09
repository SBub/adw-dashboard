# E2E Test: Sticky Header

Checks that the root header stays pinned to the top of the viewport while the document scrolls
under it, on `/` and on a project page, at desktop and mobile widths: the brand and the `Sections`
navigation stay visible, the header is opaque, a section tooltip still draws over it, the desktop
sidebar sticks below it with its last item reachable, and back/forward keeps restoring the window
scroll position. The hosted database is read only; this journey never writes.

## User Story

As a person using the ADW dashboard
I want the header to stay in view while I scroll a long page
So that I can reach the navigation without scrolling back to the top

## Test Steps

1. Resize the browser to 1280x800 and navigate to `/`.
2. Scroll to the bottom (`window.scrollTo(0, document.documentElement.scrollHeight)`).
   **Verify** `window.scrollY > 0`,
   `document.querySelector('body > header').getBoundingClientRect().top` is `0`, and the
   `ADW Dashboard` link and the `Projects` link in the `Sections` navigation are visible
   (`document.elementFromPoint` at each link's centre is that link or inside it).
3. **Verify** the header's computed `backgroundColor` equals the `body` colour and is not
   `rgba(0, 0, 0, 0)`. Take `elementFromPoint` 8px from the header's right edge at its vertical
   centre and **Verify** it is the header or inside it (content does not show through). Take a
   screenshot.
4. Navigate to `/projects`, wait up to 15 seconds for the sidebar's connection pill to read `live`,
   click the first project link in the sidebar and note its `href`.
5. Scroll to the top and hover `About Active` (or the first `About <section>` button present).
   **Verify** `#section-active-detail` (or the hovered section's detail) is visible. Scroll the
   window with `scrollBy` until the button's top is within 8px of the header's bottom, re-hovering
   if the tooltip closed. If the tooltip's box intersects the header's box, **Verify**
   `elementFromPoint` at the centre of the intersection is inside the tooltip; otherwise **Verify**
   it at the tooltip's centre.
6. Scroll to the bottom. **Verify** the header's `top` is `0` with the brand and the navigation
   visible, the sidebar `aside` has `getBoundingClientRect().top` equal to the header's height plus
   24px (within 1px) and its `bottom` is at most `innerHeight` (fully inside the viewport). Scroll the project list's scroll container inside the sidebar to its own bottom and
   **Verify** its last project link's box is inside the sidebar's box and the viewport.
   **Verify** the "Worker" status widget is inside the aside's box and the viewport without
   scrolling. Take a screenshot.
7. Go back to `/`. **Verify** the scroll position is restored to the bottom (or near it), as before
   this change. Then go forward.
8. Resize to 375x667 and repeat steps 2 and 3 on `/`, then the header checks of step 6 (header
   `top` is `0`, brand and navigation visible, opaque) on the project page; the sidebar checks do
   not apply below `md`. Take a screenshot of each page.

## Success Criteria

- The header is pinned at `top: 0` after scrolling on `/` and on a project page, at 1280px and at
  375px.
- The header is opaque and paints the same colour as `body`.
- A section tooltip draws over the header.
- On desktop the sidebar sticks below the header, its last item is reachable and the worker
  widget stays in view.
- Back restores the window scroll position.
- 4 screenshots are taken.
