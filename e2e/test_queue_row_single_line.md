# E2E Test: Queue Row Single Line

Checks that each row of a project's Queue section is one row, the title may wrap (issue number, title, status pill), with no `label:` chip, no wait and no start hint, and that the rail markers (`next`,
then the ordinals) are intact. The hosted database is read only: the journey never adds items, it
looks for a project that already has queued items.

## User Story

As a person watching the ADW queue
I want each queued item in one compact row (the title may wrap)
So that the queue reads as a list of what runs next, without repeated labels and hints

## Test Steps

1. Navigate to the `Application URL` plus `/projects`.
2. **Verify** an element with role `status` is present and within 15 seconds its text is `live`
   (in development it may read `connecting` once before that; wait and re-snapshot).
3. Click the first project link in the sidebar's `Projects` navigation.
4. **Verify** the URL is `/projects/<owner>/<repo>` and the `Queue` heading is present.
5. If the Queue section shows `Nothing queued.`, go back to step 3 with the next project in the
   sidebar. Prefer a project with three or more queued items; stop at the first one that has any.
   If no listed project has a queued item, **verify** the dashed `Nothing queued.` panel, note in the
   result that the row checks were not applicable, skip to step 10 and pass.
6. **Verify** the Queue list's first item shows the `next` marker and, when present, the second and
   third items show `2` and `3`.
7. **Verify** every Queue list item contains `#<number>` and a `queued` status pill, and its title
   when it has one.
8. **Verify** no Queue list item contains the text `label:`, `waiting`, `starts `, `manual`,
   `Removing the label` or `Queued`. The lower-case `queued` pill is expected; match `Queued`
   case-sensitively.
9. With `browser_evaluate`, for the first Queue row, **verify** the pill's
   `getBoundingClientRect().top` is within 2px of the title span's `getBoundingClientRect().top`
   (or of the `#<number>` link's top when there is no title), and the pill's right edge is within
   2px of the card's content right edge (the card's right edge minus its border and padding).
10. Take a screenshot of the project page at 1920x1080.
11. Resize the browser to 375x667 and take a screenshot of the project page.

## Success Criteria

- Queue rows show the `next` marker on the head and ordinals on the others.
- Every Queue row holds `#<number>`, the title and the `queued` pill, the pill on the title's first
  line at desktop width (the title may wrap).
- No Queue row shows `label:`, `manual`, `Removing the label`, `Queued`, a wait (`waiting`) or a
  start hint (`starts `).
- 2 screenshots are taken.
