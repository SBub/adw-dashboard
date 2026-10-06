# E2E Test: Section Tooltip Layering

Checks that a section heading's info tooltip (Queue, Active, History) is the topmost layer of the
project page while it is open: the Queue rail's `next` pill and ordinal markers never paint over
it. The hosted database is read only: the journey never adds items, it looks for a project that
already has queued items.

## User Story

As a person reading a section's explanation
I want the info tooltip to sit above everything below the heading
So that its text is readable and not covered by the queue's `next` pill

## Test Steps

1. Navigate to the `Application URL` plus `/projects`.
2. **Verify** an element with role `status` is present and within 15 seconds its text is `live`
   (in development it may read `connecting` once before that; wait and re-snapshot).
3. Click the first project link in the sidebar's `Projects` navigation. If its Queue section shows
   `Nothing queued.`, try the next project in the sidebar and stop at the first one with a queued
   item. If none has one, note in the result that the queue check is not applicable and continue
   with the Active and History tooltips only.
4. Hover the button with accessible name `About Queue`. **Verify** the element with id
   `section-queue-detail` is visible.
5. With `browser_evaluate`, take the bounding box of the tooltip's inner surface (the first child of
   `#section-queue-detail`). For its centre, and, if the box of the `next` pill intersects it, for
   the centre of that intersection, **verify** `document.elementFromPoint(x, y)` is the tooltip
   element or inside it (`tooltip.contains(el)`).
6. Move the pointer away, then focus `About Queue` with the keyboard (Tab). Repeat the checks of
   step 5.
7. Repeat steps 4 to 6 for `About Active` (`section-active-detail`) and `About History`
   (`section-history-detail`).
8. Hover `About Queue` again and take a screenshot of the project page at 1920x1080.
9. Resize the browser to 375x667, hover `About Queue` again and take a screenshot.

## Success Criteria

- Each section tooltip opens on hover and on keyboard focus.
- `elementFromPoint` at the tooltip's centre (and over the `next` pill, when they overlap) returns
  the tooltip or an element inside it, for Queue, Active and History.
- The tooltip text is fully readable in both screenshots, with the `next` pill underneath it.
- 2 screenshots are taken.
