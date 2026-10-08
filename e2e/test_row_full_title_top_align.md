# E2E Test: Row Full Title, Top Aligned

Checks that run rows (Active and History) and queue rows show the issue title in full, wrapping
onto as many lines as it needs with no ellipsis, and that every other element of the row (the
status pill of Active and Queue rows, the `adw_id` of History rows, which have no pill, and in the
queue the rail marker) sits on the title's first line. The hosted database
is read only: the journey never writes to it. To get a long title it sets the text of an existing
row's title span in the test browser through `browser_evaluate` (a DOM-only change, nothing is sent
anywhere), which is enough because the layout depends only on the markup and the text.

## User Story

As a person watching ADW runs and the queue
I want to read the whole issue title in each row
So that I know what each run or queued item is doing without opening GitHub

## Test Steps

1. Navigate to the `Application URL` plus `/projects`.
2. **Verify** an element with role `status` is present and within 15 seconds its text is `live`
   (in development it may read `connecting` once before that; wait and re-snapshot).
3. Click the first project link in the sidebar's `Projects` navigation.
4. **Verify** the URL is `/projects/<owner>/<repo>` and the `Active`, `Queue` and `History`
   headings are present. Prefer a project whose History list has at least one run row; if it has
   none, go back to step 3 with the next project in the sidebar. If no listed project has a run
   row, note it and do only the queue checks; if no project has a queued item either, note in the
   result that the row checks were not applicable, skip to step 9, take the two screenshots and
   pass.
5. With `browser_evaluate`, build the title
   `const T = 'Landing page rendering: static shell, cached past days, request-time today card and a Refresh button on the summary page'.padEnd(120, '.').slice(0, 120);`
   and assert `T.length === 120`. For the first History row, the first Active row when present and
   the first Queue row when present (each an `li`): find the row's title span (the `<span>` that
   directly follows the `#<number>` link inside the row's first flex group) and set its
   `textContent` to `T`. If a chosen row has no title span (a run without a title), take the next
   row of the same list that has one.
6. In the same or a second `browser_evaluate`, for each modified row return: the span's
   `getComputedStyle(span).textOverflow` and `whiteSpace`, whether
   `span.scrollWidth <= span.clientWidth`, `span.textContent.length`, whether the span has a
   `title` attribute, the number of line boxes (create a `Range` over the span's text node, take
   `range.getClientRects()`, deduplicate by rounded `top`), the first line's top
   (`range.getClientRects()[0].top`), the span's own `getBoundingClientRect().top`, and, for an
   Active or Queue row, the status pill's `getBoundingClientRect().top` (the element inside the
   same `li` whose text is the status: `running`, `failed` or `queued`). For the History row return
   instead the `adw_id` `code`'s `getBoundingClientRect().top` (the `code` in the row's first flex
   group) and whether any element inside the `li` has the text `completed`. For a Queue row also return the rail marker's
   (`next` or the ordinal) `getBoundingClientRect().top`, and, when the Queue has two or more rows,
   the bottom of the rail line in the first `li` (the `aria-hidden` absolutely positioned span) and
   the vertical centre of the second row's marker.
7. **Verify** for every modified row: `textOverflow` is not `ellipsis`, `whiteSpace` is not
   `nowrap`, no horizontal overflow, the text length is 120, the span has no `title` attribute, and
   a `browser_snapshot` shows the whole 120-character string (no `...` cut).
8. **Verify** for every modified Active and Queue row that
   `Math.abs(pillTop - firstLineTop) <= 2` and `Math.abs(pillTop - spanTop) <= 2`; for the modified
   History row that no element's text is `completed` (no pill) and, when the `adw_id` is on the
   first line at 1920x1080, that `Math.abs(adwIdTop - firstLineTop) <= 2`; for the modified Queue row that the marker's top is within
   2px of the first line's top, and, with two or more queued rows, that the rail line's bottom is at
   or below the second row's marker centre (the line is unbroken).
9. **Verify**, when an Active row is present, that a `dd` under its `Branch` label still has
   computed `textOverflow` `ellipsis`, and that a `dd` under a History row's `Finished` label has
   computed `textOverflow` `ellipsis` (the detail grid keeps its truncation). **Verify** that a `dd`
   under a History row's `Branch` label has `textOverflow` not `ellipsis` and `whiteSpace` not
   `nowrap`, and that its `code` text does not end in `...` (History's branch is shown in full).
10. Take a screenshot of the project page at 1920x1080.
11. Resize the browser to 375x667 and re-run the measurements of step 6 (the text is still set).
    **Verify** for every modified row that the title wraps (more line boxes than at 1920x1080, or
    at least 3), still has no ellipsis and no horizontal overflow; for Active rows that the pill's
    top is still within 2px of the first line's top (the pill keeps its own right-hand column); for
    the History row that it still has no `completed` pill; for the
    Queue row that the marker and the pill are both still within 2px of the first line's top (the
    row does not wrap at this width).
12. Take a screenshot of the project page at 375x667.

## Success Criteria

- The 120-character title is shown in full, with no ellipsis and no horizontal overflow, in every
  row type that was present (Active, History, Queue).
- At 1920x1080 the status pill's top (and the queue marker's top) is within 2px of the title's
  first line top on Active and Queue rows; the History row has no status pill.
- The queue rail line stays continuous between rows.
- The title wraps at 375px wide, still in full.
- At 375x667 the queue row's pill stays on the title's first line.
- The run detail grid still truncates, except History's branch, which is shown in full.
- 2 screenshots are taken.
