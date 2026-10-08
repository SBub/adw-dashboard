# E2E Test: History Card Fields

Checks that a History run card shows only Branch, Finished and Duration (no `completed` status
pill, no `Final phase`, no `Started`), that the branch is shown in full and selected whole by one
click, with a GitHub tree link beside it, and that the three fields sit on one row at 1280px wide
and stack at 375px. The hosted database is read only: the journey never writes to it. To get a long
branch it sets the text of an existing row's branch `code` in the test browser through
`browser_evaluate` (a DOM-only change, nothing is sent anywhere).

## User Story

As a person checking a finished ADW run out locally
I want the History card to show the whole branch name, easy to select
So that I can copy it without opening GitHub or guessing the truncated part

## Test Steps

1. Navigate to the `Application URL` plus `/projects`.
2. **Verify** an element with role `status` is present and within 15 seconds its text is `live`
   (in development it may read `connecting` once before that; wait and re-snapshot).
3. Click the first project link in the sidebar's `Projects` navigation. **Verify** the URL is
   `/projects/<owner>/<repo>` and the `History` heading is present. If its History list has no run
   row, go back and try the next project in the sidebar. If no listed project has a History row,
   note in the result that the card checks were not applicable, take the two screenshots of steps
   10 and 12 and pass.
4. Resize the browser to 1280x800.
5. With `browser_evaluate`, for the first History `li` return: the texts of its `dt` elements in
   order; whether any element inside the `li` has the text `completed`; the `code` inside the `dd`
   that follows the `Branch` `dt`: its `textContent` and `getComputedStyle(code).userSelect`; for
   that `dd`: `getComputedStyle(dd).textOverflow`, `whiteSpace`, and whether
   `dd.scrollWidth <= dd.clientWidth`; the `href`, `target`, `rel` and `aria-label` of the `a` in
   that `dd`; and the `getBoundingClientRect().top` of the `dd`s under `Branch`, `Finished` and
   `Duration`.
6. **Verify**: the `dt` texts are exactly `Branch`, `Finished`, `Duration`; no element's text is
   `completed`; there is no `Final phase` and no `Started`; the branch text does not end in `...`;
   `textOverflow` is not `ellipsis`, `whiteSpace` is not `nowrap` and there is no overflow;
   `userSelect` is `all`; the link's `href` is
   `https://github.com/<owner>/<repo>/tree/<branch>` (the project's slug and the branch text),
   `target` is `_blank`, `rel` is `noreferrer` and the `aria-label` is
   `Open branch <branch> on GitHub`; the three tops are within 2px of each other (one row).
7. Click once on the branch `code` with `browser_click`. **Verify** with `browser_evaluate` that
   `window.getSelection().toString()` equals the branch name exactly. Clear the selection
   (`window.getSelection().removeAllRanges()`), then triple-click the same `code` with
   `browser_run_code_unsafe` (`locator.click({ clickCount: 3 })`) and **verify** the selection
   again equals the branch name exactly (no link glyph, no label text).
8. With `browser_evaluate`, build
   `const B = 'chore/issue-999-adw-deadbeef-'.padEnd(120, 'x');` and assert `B.length === 120`;
   set the branch `code`'s `textContent` to `B` (DOM only). **Verify** the `li` has no horizontal
   overflow (`li.scrollWidth <= li.clientWidth`) and the branch `dd` none either.
9. **Verify**, when the page's Active list has a row, that its first row still has `dt`s `Phase`,
   `Branch`, `Started` and a status pill (an element whose text is `running` or `failed`).
10. Take a screenshot of the project page at 1280x800, and check in it that Finished is not
    ellipsized.
11. Resize the browser to 375x667 and re-measure the first History `li` (the long branch is still
    set). **Verify** the tops of the `Branch`, `Finished` and `Duration` `dd`s strictly increase
    (stacked), the branch wraps (a `Range` over the `code`'s text node has client rects at more than
    one rounded `top`) and neither the `dd` nor the `li` overflows horizontally.
12. Take a screenshot of the project page at 375x667.

## Success Criteria

- A History card shows exactly Branch, Finished and Duration, with no `completed` pill, no
  `Final phase` and no `Started`.
- The branch is shown in full, never ellipsized, with `user-select: all`, and one click or a
  triple-click selects exactly the branch name.
- A link to `https://github.com/<owner>/<repo>/tree/<branch>` opens in a new tab beside the name,
  with an accessible label.
- At 1280x800 the three fields sit on one row; at 375x667 they stack and a long branch wraps with
  no horizontal overflow.
- The Active row still shows Phase, Branch, Started and its status pill.
- 2 screenshots are taken.
