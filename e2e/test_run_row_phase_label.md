# E2E Test: Run Row Phase Label

Checks that Active run rows show the phase as a user-facing label (Planning, Building, ...,
Complete) in plain text instead of the raw `adw_` step key in monospace, that the raw key stays
available as the hover title, and that History rows show no phase at all. The hosted database is read only: the journey never
writes to it.

## User Story

As a person watching ADW runs
I want the phase in plain words
So that a run row reads like a status, not a log line

## Test Steps

1. Navigate to the `Application URL` plus `/projects`.
2. **Verify** an element with role `status` is present and within 15 seconds its text is `live`
   (in development it may read `connecting` once before that; wait and re-snapshot).
3. With `browser_evaluate`, for every `dd` that follows a `dt` whose text is `Phase` in the Active
   list (if any), return its `textContent` and whether it contains a `code` element. **Verify**
   none starts with `adw_` and none contains a `code` element.
4. Click the first project link in the sidebar's `Projects` navigation.
5. **Verify** the URL is `/projects/<owner>/<repo>` and the `Active`, `Queue` and `History`
   headings are present. Prefer a project whose History list has at least one run row; if it has
   none, go back to step 4 with the next project in the sidebar. If no listed project has a run
   row, note in the result that the row checks were not applicable, skip to step 8, take the two
   screenshots and pass.
6. With `browser_evaluate`, for every History row return the texts of its `dt` elements.
   **Verify** for every row there is no `dt` whose text is `Final phase` or `Phase`.
7. Repeat the check of step 3 on the project page's Active list (if any rows), also verifying each
   inner `span`'s `title` is a non-empty raw step key.
8. Take a screenshot of the project page at 1920x1080.
9. Resize the browser to 375x667 and take a screenshot of the project page.

## Success Criteria

- No Active `Phase` value of a known step starts with `adw_` or renders in a `code` element.
- The raw step key is the hover title of the phase value.
- No History row shows a `Final phase` or `Phase` field.
- 2 screenshots are taken.
