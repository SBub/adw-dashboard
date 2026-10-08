# E2E Test: History Page Turn

Checks that turning a History page with the `Older runs` and `Newer runs` arrows keeps the window's
scroll position, dims the History list (`aria-busy="true"`) while the navigation is pending, and
lands on the arrow's URL with new rows and a new `N of M`. The hosted database is read only: the
journey never writes to it. To make the pending state observable it delays the browser's RSC
requests in the test browser with a Playwright route (nothing is sent anywhere else).

## User Story

As a person paging through a project's finished runs
I want a page turn to keep my place on the page and show that it is loading
So that I do not lose the History section or think my click was ignored

## Test Steps

1. Navigate to the `Application URL` plus `/projects`.
2. **Verify** an element with role `status` is present and within 15 seconds its text is `live`
   (in development it may read `connecting` once before that; wait and re-snapshot).
3. Open a project whose History indicator reads `1 of N` with N > 1: start with
   `SBub/adw-dashboard` if the sidebar's `Projects` navigation lists it, then try the sidebar's
   projects in order. If no listed project has more than one History page, note in the result that
   the page-turn checks were not applicable, take the screenshot of step 13 and pass.
4. Resize the browser to 1280x720.
5. With `browser_evaluate`, scroll the History `h2` to the top of the viewport
   (`scrollIntoView({ block: "start" })`), then return `window.scrollY`, the text of the first
   History row (`li`) and the `href` of the link labelled `Older runs`. **Verify** `scrollY` is
   greater than 0.
6. With `browser_run_code_unsafe`, install a `page.route('**/*', ...)` handler that, for requests
   carrying an `rsc` header or an `_rsc` query parameter, waits 1500 ms before `route.continue()`,
   and continues every other request at once.
7. Click `Older runs`. Within the delay, with `browser_evaluate`, read the `aria-busy` of the History
   list wrapper (the closest `[aria-busy]` ancestor of the History rows). **Verify** it is `"true"`.
8. Wait until the History indicator reads `2 of N`. **Verify**: the URL contains `?after=` and equals
   the `href` recorded in step 5 (resolved against the origin); the first row's text differs from
   the one recorded in step 5; `window.scrollY` equals the recorded value (within 1px); the
   wrapper's `aria-busy` is `"false"`.
9. Record the `href` of the link labelled `Newer runs` and click it (still delayed). **Verify**
   within the delay the wrapper's `aria-busy` is `"true"`.
10. Wait until the indicator reads `1 of N`. **Verify**: the URL equals the `Newer runs` `href`
    (resolved against the origin) and has no `?after=` and no `?before=`; the first row's text
    equals the one recorded in step 5; `window.scrollY` equals the recorded value (within 1px).
11. **Verify** each present arrow is an `a` element with an `href` (so middle-click and open in a
    new tab use it) and keeps its `aria-label` (`Newer runs`, `Older runs`).
12. With `browser_run_code_unsafe`, remove the route (`page.unrouteAll()`).
13. Take a screenshot of the project page at 1280x720.

## Success Criteria

- Both arrows keep `window.scrollY` unchanged (within 1px) across the page turn.
- The History list wrapper reads `aria-busy="true"` while each page turn is pending and `"false"`
  after the new rows arrive.
- The URL, the `N of M` indicator and the rows change to the target page, and the URL is the
  arrow's `href`.
- The arrows are real links with an `href` and their `aria-label`.
- 1 screenshot is taken.
