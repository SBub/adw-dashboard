# E2E Test: Queue Row Single Line

Checks that each row of a project's Queue section is one row, the title may wrap (issue number, title, `Queued <time>`,
status pill), with no `label:` chip, no wait and no start hint, and that the rail markers (`next`,
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
7. **Verify** every Queue list item contains `#<number>`, `Queued` and a `queued` status pill.
8. **Verify** no Queue list item contains the text `label:`, `waiting` or `starts `.
9. **Verify** a `manual` item (if any) still shows `manual` and
   `Removing the label does not remove it.`.
10. Take a screenshot of the project page at 1920x1080.
11. Resize the browser to 375x667 and take a screenshot of the project page.

## Success Criteria

- Queue rows show the `next` marker on the head and ordinals on the others.
- Every Queue row holds `#<number>`, `Queued` and the `queued` pill, in one row (the title may wrap).
- No Queue row shows `label:`, a wait (`waiting`) or a start hint (`starts `).
- A manual item keeps its `manual` badge and visible hint.
- 2 screenshots are taken.
